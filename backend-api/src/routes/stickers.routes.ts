import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { stickerService } from '../services/sticker.service';
import { VOID_REASON_CATEGORIES } from '../services/cashbackLifecycle.service';
import {
  ACTIVE_SCAN_STATUSES,
  SUSPICIOUS_EXACT_CODES,
  SUSPICIOUS_PREFIX_CODES,
} from '../services/adminAlerts.service';
import { authenticate, authorize, requirePermission, AuthRequest, requireActiveSubscription, requireActiveAdmin } from '../middleware/auth.middleware';
import { uploadSingle, validateMagicBytes } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';
import { LocationType, ScanStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { validateAmount, validateGPSCoordinates, ValidationError } from '../utils/validation';
import { checkLivePhoto } from '../utils/exifLivePhoto';
import { parsePagination } from '../utils/pagination';
import { isCurrencyTransitionWindowOpen, toDualCurrency } from '../utils/currencyDisplay';

/**
 * DEFENSE-IN-DEPTH ACCOUNT STATUS GATING (BC-ADMIN-SPEC-REAUDIT-SCANGATE-INACTIVE-1)
 *
 * Spec §2 and §8.1 rule 1: All USER-facing write/operational endpoints
 * (POST /api/stickers/session, POST /api/stickers/scan, POST .../receipt)
 * are guarded by requireActiveSubscription middleware, which checks account
 * status (INACTIVE/ARCHIVED/DELETED/PENDING_*, etc.) BEFORE the service layer's
 * subscription check. This defense-in-depth ordering ensures that inactive
 * accounts cannot perform scanning operations regardless of subscription status.
 */

// Spec §5.4 — QR/location management is admin-only. For GET endpoints that
// remain accessible to partners (venue stickers, scans, analytics, config),
// this helper enforces ownership so a partner cannot read another partner's data.
async function assertPartnerOwnsVenue(req: AuthRequest, venueId: string, res: Response): Promise<boolean> {
  if (req.user!.role !== 'PARTNER') return true;
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { partner: { select: { userId: true } } },
  });
  if (!venue || venue.partner?.userId !== req.user!.id) {
    res.status(403).json({ success: false, error: 'You do not have access to this venue' });
    return false;
  }
  return true;
}

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
 *
 * Defense-in-depth account status check: requireActiveSubscription middleware
 * (Spec §2, §8.1 rule 1) checks account status BEFORE subscription status to
 * ensure INACTIVE/ARCHIVED/DELETED users cannot perform scanning operations
 * regardless of subscription state.
 */
router.post('/session', authenticate, requireActiveSubscription, async (req: Request, res: Response) => {
  try {
    const { stickerId, cardId, latitude, longitude, payloadVenueId, payloadVersion, deviceFingerprint: rawDeviceFp } = req.body;
    const userId = (req as any).user.id;

    if (!stickerId) {
      return res.status(400).json({ success: false, error: 'Missing required field: stickerId' });
    }

    // Compute device fingerprint hash server-side
    let deviceFingerprintHash: string | undefined;
    let deviceFingerprintRaw: string | undefined;
    if (rawDeviceFp && typeof rawDeviceFp === 'object') {
      const canonical = JSON.stringify({
        installationId: rawDeviceFp.installationId || '',
        platform: rawDeviceFp.platform || '',
        osVersion: rawDeviceFp.osVersion || '',
        appVersion: rawDeviceFp.appVersion || '',
      });
      deviceFingerprintHash = crypto.createHash('sha256').update(canonical).digest('hex');
      deviceFingerprintRaw = canonical;
    }

    const session = await stickerService.createSession({
      userId,
      stickerId,
      cardId,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      deviceFingerprint: deviceFingerprintHash,
      deviceFingerprintRaw,
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
 *
 * Defense-in-depth account status check: requireActiveSubscription middleware
 * (Spec §2, §8.1 rule 1) checks account status BEFORE subscription status to
 * ensure INACTIVE/ARCHIVED/DELETED users cannot perform scanning operations
 * regardless of subscription state.
 */
router.post('/scan', authenticate, requireActiveSubscription, async (req: Request, res: Response) => {
  try {
    const { stickerId, cardId, billAmount, latitude, longitude, sessionId, payloadVenueId, payloadVersion, deviceFingerprint: rawDeviceFpScan } = req.body;
    const userId = (req as any).user.id;

    // When using the two-step flow, sessionId + billAmount is sufficient.
    // Legacy one-step flow still requires stickerId + billAmount.
    if (billAmount === undefined || billAmount === null || billAmount === '') {
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

    // Compute device fingerprint hash server-side
    let scanDeviceFpHash: string | undefined;
    let scanDeviceFpRaw: string | undefined;
    if (rawDeviceFpScan && typeof rawDeviceFpScan === 'object') {
      const canonical = JSON.stringify({
        installationId: rawDeviceFpScan.installationId || '',
        platform: rawDeviceFpScan.platform || '',
        osVersion: rawDeviceFpScan.osVersion || '',
        appVersion: rawDeviceFpScan.appVersion || '',
      });
      scanDeviceFpHash = crypto.createHash('sha256').update(canonical).digest('hex');
      scanDeviceFpRaw = canonical;
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
      deviceFingerprint: scanDeviceFpHash,
      deviceFingerprintRaw: scanDeviceFpRaw,
      sessionId,
      payloadVenueId,
      payloadVersion,
    });

    // cashbackPercent omitted — internal Business Formula component (spec §11.3, Clash 10.6)
    const { fraudScore: _fs, fraudReasons: _fr, specRiskLevel: _srl, ipAddress: _ip, userAgent: _ua, deviceFingerprint: _df, deviceFingerprintRaw: _dfr, ocrData: _od, receiptImageHash: _rih, cashbackPercent: _cp, ...safeScan } = scan as any;
    res.status(200).json({
      success: true,
      data: safeScan,
      message: 'Scan initiated successfully. Please upload your receipt.',
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
 *
 * Defense-in-depth account status check: requireActiveSubscription middleware
 * (Spec §2, §8.1 rule 1) checks account status BEFORE subscription status to
 * ensure INACTIVE/ARCHIVED/DELETED users cannot perform scanning operations
 * regardless of subscription state.
 */
router.post('/scan/:scanId/receipt', authenticate, requireActiveSubscription, uploadSingle, validateMagicBytes, async (req: AuthRequest, res: Response) => {
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
      if (!scanForGate) {
        return res.status(400).json({ success: false, error: 'Scan not found' });
      }
      const sessionStart = scanForGate.sessionStartedAt ?? scanForGate.createdAt ?? null;
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
      //
      // We use raw SQL instead of updateMany so we can array_append to preserve any
      // existing fraudReasons from the scan phase (GPS, OCR, etc.) rather than
      // overwriting them. The WHERE clause mirrors the IDOR + status guard above.
      await prisma.$executeRaw`
        UPDATE "StickerScan"
        SET status = 'REJECTED'::"ScanStatus",
            "rejectionReason" = 'Duplicate receipt image (SHA-256 match)',
            "fraudReasons" = array_append("fraudReasons", 'DUPLICATE_IMAGE_HASH'),
            "updatedAt" = NOW()
        WHERE id = ${scanId}
          AND "userId" = ${userId}
          AND status IN ('PENDING'::"ScanStatus", 'VALIDATING'::"ScanStatus")
      `;
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

    // Parse OCR data if provided. Strip confidence — it feeds Signal 2 of the fraud risk
    // score, so it must not be client-controlled. Server-side OCR is the authoritative
    // source; for now we default to 0 (conservative) until async OCR is synchronised.
    const ocrData = req.body.ocrData ? (() => {
      const { confidence: _dropped, ...rest } = JSON.parse(req.body.ocrData);
      return rest;
    })() : undefined;

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

    const { fraudScore: _rfs, fraudReasons: _rfr, specRiskLevel: _rsrl, ipAddress: _rip, userAgent: _rua, deviceFingerprint: _rdf, deviceFingerprintRaw: _rdfr, ocrData: _rod, receiptImageHash: _rrih, cashbackPercent: _rcp, ...safeReceiptScan } = scan as any;
    res.json({
      success: true,
      data: safeReceiptScan,
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
    // Clamp untrusted limit before it reaches the service → Prisma. Default 50, cap 100.
    // Limit-only pagination by design (spec INV-RDM-029) — no offset or cursor.
    const { limit } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

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
 * Spec §5.4 — admin-only management; partners have read-only visibility.
 */
router.post('/locations', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: Request, res: Response) => {
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
 * Spec §5.4 — admin-only management; partners have read-only visibility.
 */
router.post('/locations/bulk', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: Request, res: Response) => {
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
 * POST /api/stickers/generate/bulk
 * Generate multiple stickers at once
 * Spec §5.4 — admin-only management; partners have read-only visibility.
 * NOTE: must be registered BEFORE /generate/:locationId so Express does not
 * greedily match the literal "bulk" as a locationId parameter value.
 */
router.post('/generate/bulk', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: Request, res: Response) => {
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
 * POST /api/stickers/generate/:locationId
 * Generate a sticker with QR code for a location
 * Spec §5.4 — admin-only management; partners have read-only visibility.
 */
router.post('/generate/:locationId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: Request, res: Response) => {
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
 * POST /api/stickers/activate/:stickerId
 * Mark sticker as printed and active
 * Spec §5.4 — admin-only management; partners have read-only visibility.
 */
router.post('/activate/:stickerId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: Request, res: Response) => {
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
 * POST /api/stickers/:stickerId/reactivate
 * H2 (Spec §1.4 / §3.6 / Clash 2.4) — explicit per-QR reactivation of a sticker
 * left INACTIVE after the owning partner was reactivated from Archived. No
 * auto-reactivation: this acts on a single sticker per explicit admin action, and
 * only succeeds once the partner is operationally Active again. Admin-only.
 */
router.post('/:stickerId/reactivate', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: AuthRequest, res: Response) => {
  try {
    const { stickerId } = req.params;
    const actorUserId = req.user?.id ?? null;

    const sticker = await stickerService.reactivateInactiveSticker(stickerId, actorUserId);

    res.json({
      success: true,
      data: sticker,
      message: 'Sticker reactivated successfully',
    });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to reactivate sticker',
    });
  }
});

/**
 * PATCH /api/stickers/:stickerId/processing
 * Advance a PENDING sticker to PROCESSING (label printed, awaiting deployment).
 * Spec §5.4 — admin-only management.
 */
router.patch('/:stickerId/processing', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: AuthRequest, res: Response) => {
  try {
    const { stickerId } = req.params;
    const actorUserId = req.user?.id ?? null;

    const sticker = await stickerService.markStickerProcessing(stickerId, actorUserId);

    res.json({
      success: true,
      data: sticker,
      message: 'Sticker marked as processing',
    });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to mark sticker as processing',
    });
  }
});

/**
 * PATCH /api/stickers/:stickerId/replace
 * Atomically replace a damaged/lost sticker with a new PENDING one on the same location.
 * The old sticker is marked REPLACED; the new sticker must be advanced to ACTIVE via
 * PATCH /processing then POST /activate.
 * Spec §5.4 — admin-only management.
 */
router.patch('/:stickerId/replace', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: AuthRequest, res: Response) => {
  try {
    const { stickerId } = req.params;
    const actorUserId = req.user?.id ?? null;

    const result = await stickerService.replaceSticker(stickerId, actorUserId);

    res.json({
      success: true,
      data: result,
      message: 'Sticker replaced successfully',
    });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to replace sticker',
    });
  }
});

/**
 * GET /api/stickers/venue/:venueId
 * Get all stickers for a venue — read-only; partners limited to own venues.
 */
router.get('/venue/:venueId', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    if (!await assertPartnerOwnsVenue(req, venueId, res)) return;

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
 * Get all scans for a venue — read-only; partners limited to own venues.
 */
router.get('/venue/:venueId/scans', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    if (!await assertPartnerOwnsVenue(req, venueId, res)) return;
    // Clamp untrusted limit before it reaches the service → Prisma. Default 100, cap 100.
    const { limit } = parsePagination(req.query, { defaultLimit: 100, maxLimit: 100 });

    const scans = await stickerService.getScansByVenue(venueId, limit);

    const windowOpen = await isCurrencyTransitionWindowOpen();
    const safeScans = scans.map((s: any) => {
      // cashbackAmount/cashbackPercent are @internal business-formula components (spec §11.3, Clash 10.6)
      // billAmount/verifiedAmount are BGN money fields gated by currency transition window (M7/§8.1 rule 4)
      const { fraudScore: _fs, fraudReasons: _fr, specRiskLevel: _srl, ipAddress: _ip, userAgent: _ua, deviceFingerprint: _df, deviceFingerprintRaw: _dfr, ocrData: _od, receiptImageHash: _rih, cashbackAmount: _ca, cashbackPercent: _cp, billAmount, verifiedAmount, ...rest } = s;
      // Strip windowOpen from display shape — partner contract is { bgn, eur } only (spec §7.3)
      const { windowOpen: _w1, ...billAmountDisplay } = toDualCurrency(billAmount ?? 0, windowOpen);
      const { windowOpen: _w2, ...verifiedAmountDisplay } = toDualCurrency(verifiedAmount ?? 0, windowOpen);
      return {
        ...rest,
        ...(windowOpen && { billAmount, verifiedAmount }),
        display: {
          billAmount: billAmountDisplay,
          verifiedAmount: verifiedAmountDisplay,
        },
      };
    });

    res.json({
      success: true,
      data: safeScans,
      count: safeScans.length,
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
 * Get analytics for venue sticker scans — read-only; partners limited to own venues.
 */
router.get('/venue/:venueId/analytics', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    if (!await assertPartnerOwnsVenue(req, venueId, res)) return;
    // Clamp to [1, 365]: missing/NaN → 30 default; negative → 1; over-limit → 365.
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);

    const analytics = await stickerService.getVenueAnalytics(venueId, days);

    // M7/§8.1 rule 4: revenue.total/average and cashback.total/average are BGN money fields
    const windowOpen = await isCurrencyTransitionWindowOpen();
    const { revenue, cashback, ...restAnalytics } = analytics;
    const { windowOpen: _w1, ...revTotalDisplay } = toDualCurrency(revenue.total, windowOpen);
    const { windowOpen: _w2, ...revAvgDisplay } = toDualCurrency(revenue.average, windowOpen);
    const { windowOpen: _w3, ...cashTotalDisplay } = toDualCurrency(cashback.total, windowOpen);
    const { windowOpen: _w4, ...cashAvgDisplay } = toDualCurrency(cashback.average, windowOpen);

    res.json({
      success: true,
      data: {
        ...restAnalytics,
        revenue: {
          ...(windowOpen && { total: revenue.total, average: revenue.average }),
          display: { total: revTotalDisplay, average: revAvgDisplay },
        },
        cashback: {
          ...(windowOpen && { total: cashback.total, average: cashback.average }),
          display: { total: cashTotalDisplay, average: cashAvgDisplay },
        },
      },
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
 * Get venue sticker configuration — read-only; partners limited to own venues.
 */
router.get('/venue/:venueId/config', authenticate, authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    if (!await assertPartnerOwnsVenue(req, venueId, res)) return;

    const rawConfig = await stickerService.getOrCreateVenueConfig(venueId);
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';

    // Spec §11.3, Clash 10.6: cashback formula components are internal-only
    // M7/§8.1 rule 4: minBillAmount is a BGN money field — gate it by the currency transition window (partner only)
    const data = isAdmin ? rawConfig : await (async () => {
      const windowOpen = await isCurrencyTransitionWindowOpen();
      const { cashbackPercent: _c, premiumBonus: _p, platinumBonus: _pl,
              maxCashbackPerScan: _m, autoApproveThreshold: _a,
              gpsVerificationEnabled: _g,
              gpsRadiusMeters: _gr, ocrVerificationEnabled: _o, minBillAmount, ...rest } = rawConfig as any;
      // Strip windowOpen from display shape — partner contract is { bgn, eur } only (spec §7.3)
      const { windowOpen: _w, ...minBillAmountDisplay } = toDualCurrency(minBillAmount ?? 0, windowOpen);
      return {
        ...rest,
        ...(windowOpen && { minBillAmount }),
        display: {
          minBillAmount: minBillAmountDisplay,
        },
      };
    })();

    res.json({
      success: true,
      data,
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
 * Spec §5.4 — admin-only management; partners have read-only visibility.
 */
router.put('/venue/:venueId/config', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('stickers.write'), async (req: AuthRequest, res: Response) => {
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
router.get('/admin/pending-review', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const status = req.query.status as string;
    const riskLevel = req.query.riskLevel as string;
    const bucket = req.query.bucket as string; // spec §7.1 categorical buckets
    const suspicious = req.query.suspicious === 'true';
    const reasonsParam = req.query.reasons as string | undefined;

    // dateFromHours: time-window filter forwarded by alert deep-links so the
    // page count matches the alert badge. Capped at 30 days (720h) so a
    // hand-crafted URL can't turn this into an unbounded scan, and rejected
    // for non-positive values.
    //
    // 30-day cap is a defensive policy (spec §3.2 doesn't address it) — long
    // windows turn into table scans on a hot table; alerts only ever pass 24h
    // today. The applied (post-clamp) value is echoed in meta.appliedDateFromHours
    // so the frontend chip can display the value the server actually used; the
    // frontend deliberately does NOT clamp, to avoid drift if this constant
    // moves and the chip starts lying about what it asked for.
    //
    // Number() (not parseInt): rejects '24abc' → NaN while still accepting
    // '24.7' → 24.7 → floor to 24. Empty string Number('') === 0 falls
    // through the > 0 guard.
    const MAX_WINDOW_HOURS = 720;
    let dateFromHours: number | undefined;
    if (req.query.dateFromHours !== undefined) {
      const parsed = Number(req.query.dateFromHours);
      if (Number.isFinite(parsed) && parsed > 0) {
        dateFromHours = Math.min(Math.floor(parsed), MAX_WINDOW_HOURS);
      }
    }
    const dateFrom = dateFromHours
      ? new Date(Date.now() - dateFromHours * 60 * 60 * 1000)
      : undefined;

    const where: any = {};

    // Status handling — five recognised forms:
    //   status=all       → no filter
    //   status=active    → IN (PENDING, VALIDATING, MANUAL_REVIEW); shared alias
    //                      with adminAlerts.service so risk-tier alert counts and
    //                      page contents stay in lock-step.
    //   status=<enum>    → filter to that exact ScanStatus
    //   (omitted)+bucket → no filter (alert deep-links pass bucket; expect every
    //                      status to be visible)
    //   (omitted)        → default to MANUAL_REVIEW (legacy behaviour)
    if (status === 'all') {
      // explicitly no status filter
    } else if (status === 'active') {
      where.status = { in: ACTIVE_SCAN_STATUSES };
    } else if (status) {
      where.status = status as ScanStatus;
    } else if (!req.query.bucket) {
      where.status = ScanStatus.MANUAL_REVIEW;
    }

    if (dateFrom) {
      where.createdAt = { gte: dateFrom };
    }

    if (riskLevel && riskLevel !== 'all') {
      where.riskLevel = riskLevel;
    }

    // Spec §7.1 categorical buckets pushed down to DB
    if (bucket === 'AUTO_0_30') where.fraudScore = { lt: 31 };
    else if (bucket === 'REVIEW_31_60') where.fraudScore = { gte: 31, lt: 61 };
    else if (bucket === 'HIGH_61_PLUS') where.fraudScore = { gte: 61 };

    // Reason filter — exact-match codes via Prisma's hasSome on TEXT[].
    // Used by the fraud_check_errors alert (?reasons=FRAUD_CHECK_ERROR).
    if (reasonsParam) {
      const codes = reasonsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (codes.length > 0) {
        where.fraudReasons = { hasSome: codes };
      }
    }

    // Suspicious filter — uses the same SUSPICIOUS_EXACT_CODES + SUSPICIOUS_PREFIX_CODES
    // set the alert counts. The alert restricts to a time window (default 24h via
    // dateFromHours) so this subquery does the same; without that, this returns
    // the lifetime suspicious-scan ID set and the IN-list to findMany blows up
    // for any non-trivial volume.
    //
    // Safety LIMIT clamps the worst case even when no window is supplied — if a
    // legitimate query needs more rows, the page is already filtering further by
    // status / bucket so the user can narrow the search.
    //
    // Probe SELECTs LIMIT+1 rows so we can distinguish "exactly LIMIT matches"
    // (no truncation) from ">LIMIT matches" (truncation). With a flat LIMIT,
    // a row count of exactly LIMIT is ambiguous and the UI banner would lie at
    // the boundary.
    const SUSPICIOUS_ID_LIMIT = 5000;
    const SUSPICIOUS_PROBE_LIMIT = SUSPICIOUS_ID_LIMIT + 1;
    let suspiciousTruncated = false;
    if (suspicious) {
      const exactCodes: readonly string[] = SUSPICIOUS_EXACT_CODES;
      const prefixPatterns = SUSPICIOUS_PREFIX_CODES.map((p) => `${p}:%`);
      // Build the WHERE so the time bound is pushed into Postgres rather than
      // applied in JS. dateFrom is undefined → no createdAt clause.
      const probeRows = dateFrom
        ? await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT s.id
            FROM "StickerScan" s
            WHERE s."createdAt" >= ${dateFrom}
              AND EXISTS (
                SELECT 1 FROM unnest(s."fraudReasons") AS r
                WHERE r = ANY(${exactCodes}::text[])
                   OR r LIKE ANY(${prefixPatterns}::text[])
              )
            LIMIT ${SUSPICIOUS_PROBE_LIMIT}
          `
        : await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT s.id
            FROM "StickerScan" s
            WHERE EXISTS (
              SELECT 1 FROM unnest(s."fraudReasons") AS r
              WHERE r = ANY(${exactCodes}::text[])
                 OR r LIKE ANY(${prefixPatterns}::text[])
            )
            LIMIT ${SUSPICIOUS_PROBE_LIMIT}
          `;
      // truncated=true means the visible set is a strict subset of the real
      // suspicious population. We probed for LIMIT+1 rows, so >LIMIT rows means
      // truncation; ≤LIMIT means we got the full set.
      suspiciousTruncated = probeRows.length > SUSPICIOUS_ID_LIMIT;
      const idRows = suspiciousTruncated
        ? probeRows.slice(0, SUSPICIOUS_ID_LIMIT)
        : probeRows;
      // Empty ids list correctly produces zero rows (Prisma's `in: []` matches nothing).
      where.id = { in: idRows.map((r) => r.id) };
    }

    const [scans, total] = await Promise.all([
      prisma.stickerScan.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          sticker: {
            include: {
              venue: { select: { id: true, name: true, nameBg: true } },
              location: { select: { name: true, nameBg: true, locationType: true } },
            },
          },
          card: { select: { id: true, type: true, cardNumber: true } },
        },
        orderBy: [{ fraudScore: 'desc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.stickerScan.count({ where }),
    ]);

    res.json({
      success: true,
      data: scans,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        // truncated: only meaningful when suspicious=true; signals the raw-id
        // subquery hit SUSPICIOUS_ID_LIMIT and the visible set is a subset.
        truncated: suspiciousTruncated,
        // appliedDateFromHours: the value the server actually used after parsing
        // and clamping. The frontend chip reads this on each fetch response so a
        // hand-crafted ?dateFromHours=99999 displays as 720 once the post-clamp
        // value lands. Between fetches (mount, filter changes) the chip falls
        // back to the raw URL value briefly — see the chip's fallback comment.
        appliedDateFromHours: dateFromHours,
      },
    });
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
 * Approve a scan and credit cashback.
 * Body (optional): { verifiedAmount?: number } — admin-corrected bill amount.
 * When provided, cashbackPercent/Amount are recomputed from this value before
 * crediting. Without it, the pre-computed scan values are used as-is.
 * Requires authentication (Admin role)
 */
router.post('/admin/approve/:scanId', authenticate, requireActiveAdmin, authorize('ADMIN', 'SUPER_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { scanId } = req.params;
    const { verifiedAmount } = req.body ?? {};
    const adminUserId = (req as any).user?.id ?? null;

    let opts: { verifiedAmount?: number; adminUserId?: string | null } = { adminUserId };
    if (verifiedAmount !== undefined && verifiedAmount !== null && verifiedAmount !== '') {
      const parsed = typeof verifiedAmount === 'number' ? verifiedAmount : Number(verifiedAmount);
      if (!isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ success: false, error: 'verifiedAmount must be a positive number' });
      }
      opts = { ...opts, verifiedAmount: parsed };
    }

    const scan = await stickerService.approveScan(scanId, opts);

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
 * Body: { notes?: string, category?: string } - Optional admin note + optional
 *   controlled void-reason category (one of VOID_REASON_CATEGORIES per §2.2).
 *   When omitted, sticker.service defaults the category to FRAUD.
 * Requires authentication (Admin role)
 */
router.post('/admin/reject/:scanId', authenticate, requireActiveAdmin, authorize('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { scanId } = req.params;
    const { notes, category } = req.body ?? {};

    // Spec §2.2 (Risk Review — "Record marked Voided with reason category and
    // optional internal note") + §8.1 rule 6: the void reason must carry a
    // controlled category. The admin may supply one explicitly; otherwise
    // sticker.service normalizes to the FRAUD default (a rejected flagged scan
    // is treated as fraudulent/invalid). Validate an explicitly-supplied
    // category against the canonical vocabulary and 400 on an invalid value so
    // the bad reason never reaches — and gets silently dropped by —
    // cashbackLifecycle.markVoided.
    let category_norm: string | undefined;
    if (category !== undefined && category !== null && category !== '') {
      if (typeof category !== 'string') {
        return res.status(400).json({ success: false, error: 'category must be a string' });
      }
      category_norm = category.trim().toUpperCase();
      if (!(VOID_REASON_CATEGORIES as readonly string[]).includes(category_norm)) {
        return res.status(400).json({
          success: false,
          error: `Invalid category. Must be one of: ${VOID_REASON_CATEGORIES.join(', ')}`,
        });
      }
    }

    const note = (typeof notes === 'string' && notes.trim().length > 0) ? notes.trim() : 'Rejected by admin';
    // When a category is supplied, compose "CATEGORY: note"; otherwise pass the
    // bare note and let sticker.service apply the FRAUD default.
    const reason = category_norm ? `${category_norm}: ${note}` : note;

    const scan = await stickerService.rejectScan(scanId, reason, req.user?.id ?? null);

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

// Cap admin bulk actions so a buggy/rogue client can't tear through the DB
// in one request. 500 is generous for a human review workflow.
const BULK_SCAN_LIMIT = 500;

/**
 * POST /api/stickers/admin/bulk-approve
 * Body: { scanIds: string[] }
 * Replaces N parallel single-approve calls from the admin UI.
 */
router.post('/admin/bulk-approve', authenticate, requireActiveAdmin, authorize('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { scanIds } = req.body as { scanIds?: unknown };
    if (!Array.isArray(scanIds) || scanIds.length === 0 || !scanIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ success: false, error: 'scanIds must be a non-empty array of strings' });
    }
    if (scanIds.length > BULK_SCAN_LIMIT) {
      return res.status(400).json({ success: false, error: `Cannot process more than ${BULK_SCAN_LIMIT} scans per request` });
    }
    // Thread actorUserId so each per-scan audit log records the approving admin (r2e S3).
    const result = await stickerService.bulkApprove(scanIds as string[], req.user?.id ?? null);
    res.json({ success: true, ...result, message: `${result.successCount} scans approved, ${result.errorCount} errors` });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to bulk approve scans' });
  }
});

/**
 * POST /api/stickers/admin/bulk-reject
 * Body: { scanIds: string[], reason: string }
 */
router.post('/admin/bulk-reject', authenticate, requireActiveAdmin, authorize('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { scanIds, reason } = req.body as { scanIds?: unknown; reason?: unknown };
    if (!Array.isArray(scanIds) || scanIds.length === 0 || !scanIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ success: false, error: 'scanIds must be a non-empty array of strings' });
    }
    if (scanIds.length > BULK_SCAN_LIMIT) {
      return res.status(400).json({ success: false, error: `Cannot process more than ${BULK_SCAN_LIMIT} scans per request` });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }
    const result = await stickerService.bulkReject(scanIds as string[], reason.trim(), req.user?.id ?? null);
    res.json({ success: true, ...result, message: `${result.successCount} scans rejected, ${result.errorCount} errors` });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to bulk reject scans' });
  }
});

export default router;
