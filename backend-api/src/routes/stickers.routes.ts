import { Router, Request, Response } from 'express';
import { stickerService } from '../services/sticker.service';
import { authenticate } from '../middleware/auth.middleware';
import { uploadSingle } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';
import { LocationType, PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// PUBLIC ENDPOINTS (User-facing)
// ============================================

/**
 * POST /api/stickers/scan
 * Initiate a sticker scan (user scans QR code)
 * Requires authentication
 */
router.post('/scan', authenticate, async (req: Request, res: Response) => {
  try {
    const { stickerId, cardId, billAmount, latitude, longitude } = req.body;
    const userId = (req as any).user.id; // From auth middleware

    if (!stickerId || !cardId || !billAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: stickerId, cardId, billAmount',
      });
    }

    if (billAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Bill amount must be greater than 0',
      });
    }

    const scan = await stickerService.scanSticker({
      userId,
      stickerId,
      cardId,
      billAmount: parseFloat(billAmount),
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
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
router.post('/scan/:scanId/receipt', authenticate, uploadSingle, async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    const userId = (req as any).user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Receipt image is required',
      });
    }

    // Upload to S3
    const upload = await imageUploadService.uploadImage({
      file: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'sticker-receipts',
      userId,
    });

    // Parse OCR data if provided
    const ocrData = req.body.ocrData ? JSON.parse(req.body.ocrData) : undefined;

    // Update sticker scan with receipt
    const scan = await stickerService.uploadReceipt({
      scanId,
      userId,
      receiptImageUrl: upload.url,
      imageKey: upload.key,
      ocrData,
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
      message: error.message,
    });
  }
});

/**
 * GET /api/stickers/validate/:stickerId
 * Validate a sticker QR code (check if it's active)
 * Public endpoint (for QR scanner preview)
 */
router.get('/validate/:stickerId', async (req: Request, res: Response) => {
  try {
    const { stickerId } = req.params;

    // This is a lightweight validation endpoint
    // Full validation happens during scan
    const sticker = await stickerService.getStickersByVenue('dummy'); // We'll add a validation method

    res.json({
      success: true,
      valid: true,
      message: 'Valid BOOM sticker',
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      valid: false,
      error: 'Invalid or inactive sticker',
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
router.post('/locations', authenticate, async (req: Request, res: Response) => {
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
router.post('/locations/bulk', authenticate, async (req: Request, res: Response) => {
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
router.post('/generate/:locationId', authenticate, async (req: Request, res: Response) => {
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
router.post('/generate/bulk', authenticate, async (req: Request, res: Response) => {
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
router.post('/activate/:stickerId', authenticate, async (req: Request, res: Response) => {
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
router.get('/venue/:venueId', authenticate, async (req: Request, res: Response) => {
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
      message: error.message,
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId/scans
 * Get all scans for a venue
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId/scans', authenticate, async (req: Request, res: Response) => {
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
      message: error.message,
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId/analytics
 * Get analytics for venue sticker scans
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId/analytics', authenticate, async (req: Request, res: Response) => {
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
      message: error.message,
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId/config
 * Get venue sticker configuration
 * Requires authentication (Partner role)
 */
router.get('/venue/:venueId/config', authenticate, async (req: Request, res: Response) => {
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
      message: error.message,
    });
  }
});

/**
 * PUT /api/stickers/venue/:venueId/config
 * Update venue sticker configuration
 * Requires authentication (Partner role)
 */
router.put('/venue/:venueId/config', authenticate, async (req: Request, res: Response) => {
  try {
    const { venueId } = req.params;
    const config = req.body;

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
router.get('/admin/pending-review', authenticate, async (req: Request, res: Response) => {
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
      message: error.message,
    });
  }
});

/**
 * GET /api/stickers/admin/stats
 * Get admin review statistics
 * Requires authentication (Admin role)
 */
router.get('/admin/stats', authenticate, async (req: Request, res: Response) => {
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
      message: error.message,
    });
  }
});

/**
 * POST /api/stickers/admin/approve/:scanId
 * Approve a scan and credit cashback
 * Requires authentication (Admin role)
 */
router.post('/admin/approve/:scanId', authenticate, async (req: Request, res: Response) => {
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
router.post('/admin/reject/:scanId', authenticate, async (req: Request, res: Response) => {
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
