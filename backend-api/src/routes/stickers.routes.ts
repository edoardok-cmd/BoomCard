import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { stickerService } from '../services/sticker.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { uploadSingle, validateMagicBytes } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';
import { LocationType } from '@prisma/client';
import prisma from '../lib/prisma';
import { validateAmount, validateGPSCoordinates, ValidationError } from '../utils/validation';
import { checkLivePhoto } from '../utils/exifLivePhoto';

const router = Router();

// ============================================
// PUBLIC ENDPOINTS (User-facing)
// ============================================

/**
 * POST /api/stickers/session
 * Register a BOOM session the moment the user scans the QR sticker.
 * Per spec §6 Step 3: records time, venue, device, and GPS at scan time.
 * Returns a sessionId that must be passed to POST /api/stickers/scan when
 * the receipt is submitted.
 * Requires authentication.
 */
router.post('/session', authenticate, async (req: Request, res: Response) => {
  try {
    const { stickerId, cardId, latitude, longitude, payloadVenueId, payloadVersion } = req.body;
    const userId = (req as any).user.id;

    if (!stickerId) {
      return res.status(400).json({ success: false, error: 'Missing required field: stickerId' });
    }

    const session = await stickerService.createSession({
      userId,
      stickerId,
      cardId,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      payloadVenueId,
      payloadVersion,
    });

    res.json({
      success: true,
      data: { sessionId: session.id, venueId: session.venueId },
      message: 'Session created. Please upload your receipt to earn cashback.',
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to create session' });
  }
});

/**
 * POST /api/stickers/scan
 * Complete a scan by submitting the bill amount.
 * If sessionId is provided: completes an existing SESSION_ACTIVE session.
 * If not: legacy flow — creates session + scan in one call (backward compat).
 * Requires authentication.
 */
router.post('/scan', authenticate, async (req: Request, res: Response) => {
  try {
    const { stickerId, cardId, billAmount, latitude, longitude, sessionId, payloadVenueId, payloadVersion } = req.body;
    const userId = (req as any).user.id;

    // When using the two-step flow, sessionId + billAmount is sufficient.
    // Legacy one-step flow still requires stickerId + billAmount.
    if (!billAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: billAmount',
      });
    }
    if (!sessionId && !stickerId) {
      return res.status(400).json({
        success: false,
        error: 'Provide either sessionId (two-step flow) or stickerId (legacy)',
      });
    }

    // Validate bill amount (S-INJECT security tests)
    let validatedBillAmount: number;
    try {
      validatedBillAmount = validateAmount(billAmount, 'billAmount');
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      throw error;
    }

    // Validate GPS coordinates if provided (S-INJECT security tests)
    let validatedLat: number | undefined = latitude;
    let validatedLon: number | undefined = longitude;
    if (latitude !== undefined || longitude !== undefined) {
      try {
        const coords = validateGPSCoordinates(latitude, longitude);
        validatedLat = coords.latitude;
        validatedLon = coords.longitude;
      } catch (error) {
        if (error instanceof ValidationError) {
          return res.status(400).json({
            success: false,
            error: error.message,
          });
        }
        throw error;
      }
    }

    const scan = await stickerService.scanSticker({
      userId,
      stickerId,
      cardId,
      billAmount: validatedBillAmount,
      latitude: validatedLat,
      longitude: validatedLon,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      sessionId,
      payloadVenueId,
      payloadVersion,
    });

    res.json({
      success: true,
      data: scan,
      message: scan.fraudScore < 10
        ? 'Scan initiated successfully. Please upload your receipt.'
        : 'Scan requires manual review. Please upload your receipt.',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to scan sticker',
    });
  }
});

/**
 * POST /api/stickers/scan/:scanId/receipt
 * Upload receipt image and OCR data for a scan
 * Requires authentication
 */
router.post('/scan/:scanId/receipt', authenticate, uploadSingle, validateMagicBytes, async (req: AuthRequest, res: Response) => {
  try {
    const { scanId } = req.params;
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Receipt image is required',
      });
    }

    // Live-photo enforcement: parse EXIF and reject stale or pre-scan images. Paired
    // with the mobile UI's gallery-pick removal — two barriers: UX and server.
    {
      const scanForGate = await prisma.stickerScan.findFirst({
        where: { id: scanId, userId },
        select: { sessionStartedAt: true, createdAt: true },
      });
      const sessionStart = scanForGate?.sessionStartedAt ?? scanForGate?.createdAt ?? null;
      const gate = await checkLivePhoto(req.file.buffer, sessionStart);
      if (gate.ok === false) {
        return res.status(400).json({ success: false, error: gate.message });
      }
    }

    // Finding #6: hash BEFORE S3 upload and probe for existing duplicates first. This
    // avoids paying for storage on rejected requests and gives the user a fast failure.
    const receiptImageHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    const duplicate = await stickerService.findDuplicateReceipt(receiptImageHash, scanId);
    if (duplicate) {
      // IDOR + status guard: only flip status on scans that belong to the requester AND
      // are still in an uploadable state. Without the status filter a duplicate upload
      // could downgrade an already-APPROVED scan to REJECTED while its cashback stayed
      // paid. The userId filter closes the IDOR hole separately.
      await prisma.stickerScan.updateMany({
        where: {
          id: scanId,
          userId,
          status: { in: ['PENDING', 'VALIDATING'] as any },
        },
        data: {
          status: 'REJECTED' as any,
          rejectionReason: 'Duplicate receipt image (SHA-256 match)',
          fraudReasons: ['DUPLICATE_IMAGE_HASH'],
        },
      });
      return res.status(400).json({
        success: false,
        error: 'This receipt has already been submitted. Duplicate receipts are not accepted.',
      });
    }

    // Upload to S3 only after dedupe passes.
    const upload = await imageUploadService.uploadImage({
      file: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'sticker-receipts',
      userId,
    });

    // Parse OCR data if provided
    const ocrData = req.body.ocrData ? JSON.parse(req.body.ocrData) : undefined;

    // Update sticker scan with receipt.
    // Pass the raw buffer so server-side OCR can fuzzy-verify the merchant name
    // against the venue/partner independently of any client-supplied ocrData.
    const scan = await stickerService.uploadReceipt({
      scanId,
      userId,
      receiptImageUrl: upload.url,
      receiptImageHash,
      imageKey: upload.key,
      ocrData,
      imageBuffer: req.file.buffer,
    });

    res.json({
      success: true,
      data: scan,
      message: scan.status === 'APPROVED'
        ? `Cashback approved! You earned ${scan.cashbackAmount} BGN`
        : scan.status === 'MANUAL_REVIEW'
        ? 'Receipt uploaded. Under review.'
        : 'Receipt uploaded successfully.',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to upload receipt',
    });
  }
});

/**
 * GET /api/stickers/my-scans
 * Get current user's scan history
 * Requires authentication
 */
router.get('/my-scans', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const scans = await stickerService.getScansByUser(userId, limit);

    res.json({
      success: true,
      data: scans,
      count: scans.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch scans',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/stickers/validate/:stickerId
 * Lightweight validation of a sticker QR code — checks existence and active status.
 * Full fraud / subscription / GPS checks happen during the actual scan.
 * Public endpoint (no auth required for scanner preview).
 */
router.get('/validate/:stickerId', async (req: Request, res: Response) => {
  try {
    const { stickerId } = req.params;

    const result = await stickerService.validateStickerById(stickerId);

    if (!result.valid) {
      return res.status(404).json({
        success: false,
        ...result,
      });
    }

    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      valid: false,
      error: 'Failed to validate sticker',
      message: 'An unexpected error occurred',
    });
  }
});

// ============================================
// PARTNER ENDPOINTS (Venue/Partner Dashboard)
// ============================================

/**
 * POST /api/stickers/locations
 * Create a new sticker location for a venue
 * Requires authentication (Partner role)
 */
router.post('/locations', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { venueId, name, nameBg, locationType, locationNumber, capacity, floor, section } = req.body;

    if (!venueId || !name || !locationType || !locationNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: venueId, name, locationType, locationNumber',
      });
    }

    const location = await stickerService.createStickerLocation({
      venueId,
      name,
      nameBg,
      locationType: locationType as LocationType,
      locationNumber,
      capacity: capacity ? parseInt(capacity) : undefined,
      floor,
      section,
    });

    res.status(201).json({
      success: true,
      data: location,
      message: 'Location created successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create location',
    });
  }
});

/**
 * POST /api/stickers/locations/bulk
 * Create multiple sticker locations at once
 * Requires authentication (Partner role)
 */
router.post('/locations/bulk', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { locations } = req.body;

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'locations array is required',
      });
    }

    const created = await stickerService.createStickerLocationsBulk(locations);

    res.status(201).json({
      success: true,
      data: created,
      count: created.length,
      message: `${created.length} locations created successfully`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create locations',
    });
  }
});

/**
 * POST /api/stickers/generate/:locationId
 * Generate a sticker with QR code for a location
 * Requires authentication (Partner role)
 */
router.post('/generate/:locationId', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { locationId } = req.params;

    const sticker = await stickerService.generateSticker(locationId);

    res.status(201).json({
      success: true,
      data: sticker,
      message: 'Sticker generated successfully. Ready to print.',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate sticker',
    });
  }
});

/**
 * POST /api/stickers/generate/bulk
 * Generate multiple stickers at once
 * Requires authentication (Partner role)
 */
router.post('/generate/bulk', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { locationIds } = req.body;

    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'locationIds array is required',
      });
    }

    const stickers = await stickerService.generateStickersBulk(locationIds);

    res.status(201).json({
      success: true,
      data: stickers,
      count: stickers.length,
      message: `${stickers.length} stickers generated successfully`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to generate stickers',
    });
  }
});

/**
 * POST /api/stickers/activate/:stickerId
 * Mark sticker as printed and active
 * Requires authentication (Partner role)
 */
router.post('/activate/:stickerId', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { stickerId } = req.params;

    const sticker = await stickerService.activateSticker(stickerId);

    res.json({
      success: true,
      data: sticker,
      message: 'Sticker activated successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to activate sticker',
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId
 * Get all stickers for a venue
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;

    const stickers = await stickerService.getStickersByVenue(venueId);

    res.json({
      success: true,
      data: stickers,
      count: stickers.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stickers',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId/scans
 * Get all scans for a venue
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId/scans', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const scans = await stickerService.getScansByVenue(venueId, limit);

    res.json({
      success: true,
      data: scans,
      count: scans.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch venue scans',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId/analytics
 * Get analytics for venue sticker scans
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId/analytics', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    const analytics = await stickerService.getVenueAnalytics(venueId, days);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId/config
 * Get venue sticker configuration
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId/config', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;

    const config = await stickerService.getOrCreateVenueConfig(venueId);

    res.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch config',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * PUT /api/stickers/venue/:venueId/config
 * Update venue sticker configuration
 * Requires authentication (Partner role)
 */
router.put('/venue/:venueId/config', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    const config = req.body;

    // PARTNER role: verify they own this venue
    if (req.user!.role === 'PARTNER') {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        include: { partner: { select: { userId: true } } },
      });
      if (!venue || venue.partner?.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to update this venue configuration',
        });
      }
    }

    const updated = await stickerService.updateVenueConfig(venueId, config);

    res.json({
      success: true,
      data: updated,
      message: 'Configuration updated successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update config',
    });
  }
});

// ============================================
// ADMIN ENDPOINTS (Manual Review & Management)
// ============================================

/**
 * GET /api/stickers/admin/pending-review
 * Get scans pending manual review
 * Query params: status, riskLevel, limit
 * Requires authentication (Admin role)
 */
router.get('/admin/pending-review', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const status = req.query.status as string;
    const riskLevel = req.query.riskLevel as string;

    // Build filter
    const where: any = {};

    if (status && status !== 'all') {
      where.status = status;
    } else {
      // Default to manual review if no status specified
      where.status = 'MANUAL_REVIEW';
    }

    if (riskLevel && riskLevel !== 'all') {
      where.riskLevel = riskLevel;
    }

    const scans = await prisma.stickerScan.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        sticker: {
          include: {
            venue: {
              select: {
                id: true,
                name: true,
                nameBg: true,
              },
            },
            location: {
              select: {
                name: true,
                nameBg: true,
                locationType: true,
              },
            },
          },
        },
        card: {
          select: {
            id: true,
            type: true,
            cardNumber: true,
          },
        },
      },
      orderBy: [
        { fraudScore: 'desc' },
        { createdAt: 'asc' },
      ],
      take: limit,
    });

    res.json(scans);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending scans',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/stickers/admin/stats
 * Get admin review statistics
 * Requires authentication (Admin role)
 */
router.get('/admin/stats', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const stats = await stickerService.getAdminStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch admin stats',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/stickers/admin/approve/:scanId
 * Approve a scan and credit cashback
 * Requires authentication (Admin role)
 */
router.post('/admin/approve/:scanId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;

    const scan = await stickerService.approveScan(scanId);

    res.json({
      success: true,
      data: scan,
      message: `Scan approved. ${scan.cashbackAmount} BGN credited to user.`,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to approve scan',
    });
  }
});

/**
 * POST /api/stickers/admin/reject/:scanId
 * Reject a scan
 * Body: { notes?: string } - Optional admin notes
 * Requires authentication (Admin role)
 */
router.post('/admin/reject/:scanId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    const { notes } = req.body;

    const reason = notes || 'Rejected by admin';

    const scan = await stickerService.rejectScan(scanId, reason);

    res.json({
      success: true,
      data: scan,
      message: 'Scan rejected successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to reject scan',
    });
  }
});

export default router;
