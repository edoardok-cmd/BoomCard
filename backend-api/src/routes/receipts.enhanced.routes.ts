import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { receiptService } from '../services/receipt.service';
import { fraudDetectionService } from '../services/fraudDetection.service';
import { receiptAnalyticsService } from '../services/receiptAnalytics.service';
import { imageUploadService } from '../services/imageUpload.service';
import { receiptTemplateService } from '../services/receiptTemplate.service';
import { emailService } from '../services/email.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { requireActivePartnerForWrites } from '../middleware/partnerStatus.middleware';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/error.middleware';
import { uploadSingle, validateMagicBytes } from '../middleware/upload.middleware';

const analyticsUpdateSchema = z.object({
  receiptId: z.string().min(1),
  status: z.enum(['PENDING', 'PROCESSING', 'VALIDATING', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW']),
  cashbackAmount: z.number().finite().nonnegative().optional(),
  totalAmount: z.number().finite().nonnegative().optional(),
});

const router = Router();

// Cap bulk review endpoints so a rogue/buggy client can't blow up the DB in
// one request. 500 is generous for a human-driven review workflow.
const BULK_RECEIPT_LIMIT = 500;

// ============================================
// PUBLIC/UTILITY ROUTES
// ============================================

/**
 * GET /api/receipts/check-duplicate
 * Check if image hash already exists
 */
router.get(
  '/check-duplicate',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { imageHash } = req.query;

    if (!imageHash) {
      return res.status(400).json({
        success: false,
        message: 'Image hash is required',
      });
    }

    const exists = await receiptService.checkDuplicateImage(imageHash as string);

    res.json({ exists });
  })
);

/**
 * GET /api/receipts/merchant-check
 * Check merchant whitelist/blacklist status
 */
router.get(
  '/merchant-check',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { merchantName } = req.query;

    if (!merchantName) {
      return res.status(400).json({
        success: false,
        message: 'Merchant name is required',
      });
    }

    const result = await fraudDetectionService.checkMerchant(merchantName as string);

    res.json(result);
  })
);

// ============================================
// RECEIPT SUBMISSION & PROCESSING
// ============================================

/**
 * POST /api/receipts/upload — RETIRED
 * Direct receipt upload has been removed. All receipts must be submitted
 * through the sticker scan flow (POST /api/stickers/scan/:id/receipt).
 */
router.post('/upload', authenticate, (req: AuthRequest, res: Response) => {
  // Spec §5.3: receipt upload is mobile-app only for MVP
  const clientType = (req as AuthRequest).user?.ct;
  if (clientType === 'web') {
    return res.status(403).json({
      success: false,
      message: 'Receipt upload is only available via the BoomCard mobile app.',
      code: 'WEB_UPLOAD_DISABLED',
    });
  }
  res.status(410).json({
    success: false,
    message: 'Direct receipt upload has been retired. Please scan a venue QR sticker first, then upload your receipt through the sticker scan flow. Update your app for the latest experience.',
    code: 'ENDPOINT_RETIRED',
  });
});

/**
 * POST /api/receipts/submit — RETIRED
 * Direct receipt submission has been removed. All receipts must be submitted
 * through the sticker scan flow (POST /api/stickers/scan/:id/receipt).
 */
router.post('/submit', authenticate, (req: AuthRequest, res: Response) => {
  // Spec §5.3: receipt upload is mobile-app only for MVP
  const clientType = (req as AuthRequest).user?.ct;
  if (clientType === 'web') {
    return res.status(403).json({
      success: false,
      message: 'Receipt upload is only available via the BoomCard mobile app.',
      code: 'WEB_UPLOAD_DISABLED',
    });
  }
  res.status(410).json({
    success: false,
    message: 'Direct receipt submission has been retired. Please scan a venue QR sticker first, then upload your receipt through the sticker scan flow. Update your app for the latest experience.',
    code: 'ENDPOINT_RETIRED',
  });
});

/**
 * GET /api/receipts
 * Get user's receipts with filters
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Named period presets — period takes precedence over startDate/endDate when provided
    const period = req.query.period as string | undefined;
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    if (period === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'all') {
      // no date filter
    } else {
      startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    }

    const filters = {
      userId: req.user!.id,
      status: req.query.status as any,
      venueId: req.query.venueId as string,
      merchantName: req.query.merchantName as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      minFraudScore: req.query.minFraudScore ? parseFloat(req.query.minFraudScore as string) : undefined,
      maxFraudScore: req.query.maxFraudScore ? parseFloat(req.query.maxFraudScore as string) : undefined,
      startDate,
      endDate,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sortBy: (req.query.sortBy as any) || 'createdAt',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const result = await receiptService.getReceipts(filters);

    res.json(result);
  })
);

/**
 * GET /api/receipts/stats/user
 * Get user's receipt submission statistics (for rate limiting)
 */
router.get(
  '/stats/user',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.getUserSubmissionStats(req.user!.id);

    res.json(result);
  })
);

/**
 * GET /api/receipts/analytics
 * Get receipt analytics (user-specific or global if admin)
 * IMPORTANT: Must be defined before GET /:id to avoid route shadowing.
 */
router.get(
  '/analytics',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.query.userId as string;

    // Only admins can view other users' analytics
    if (userId && userId !== req.user!.id) {
      if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view other user analytics',
        });
      }
    }

    const targetUserId = userId || req.user!.id;

    const result = await receiptAnalyticsService.getAnalytics(targetUserId);

    res.json(result);
  })
);

/**
 * GET /api/receipts/:id
 * Get single receipt by ID
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.getReceiptById(req.params.id, req.user!.id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found',
      });
    }

    res.json(result);
  })
);

// ============================================
// ADMIN REVIEW ENDPOINTS
// ============================================

/**
 * GET /api/receipts/admin/pending-review
 * Get receipts pending manual review
 */
router.get(
  '/admin/pending-review',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const result = await receiptService.getPendingReviews(limit);

    res.json(result);
  })
);

/**
 * GET /api/receipts/admin/all
 * Get all receipts with advanced filters (admin only)
 */
router.get(
  '/admin/all',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = {
      status: req.query.status as any,
      userId: req.query.userId as string,
      venueId: req.query.venueId as string,
      merchantName: req.query.merchantName as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      minFraudScore: req.query.minFraudScore ? parseFloat(req.query.minFraudScore as string) : undefined,
      maxFraudScore: req.query.maxFraudScore ? parseFloat(req.query.maxFraudScore as string) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sortBy: (req.query.sortBy as any) || 'fraudScore',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      includeInternal: true,
    };

    const result = await receiptService.getReceipts(filters);

    res.json(result);
  })
);

/**
 * POST /api/receipts/:id/review
 * Review a receipt (approve or reject) - admin only
 */
router.post(
  '/:id/review',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { action, verifiedAmount, notes, rejectionReason } = req.body;

    if (!action || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be APPROVE or REJECT',
      });
    }

    const result = await receiptService.reviewReceipt({
      receiptId: req.params.id,
      action,
      reviewedBy: req.user!.id,
      verifiedAmount,
      notes,
      rejectionReason,
    });

    res.json(result);
  })
);

/**
 * POST /api/receipts/bulk-approve
 * Bulk approve receipts - admin only
 */
router.post(
  '/bulk-approve',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiptIds } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Receipt IDs array is required',
      });
    }

    if (receiptIds.length > BULK_RECEIPT_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `Cannot process more than ${BULK_RECEIPT_LIMIT} receipts per request`,
      });
    }

    const result = await receiptService.bulkApprove(receiptIds, req.user!.id);

    res.json(result);
  })
);

/**
 * POST /api/receipts/bulk-reject
 * Bulk reject receipts - admin only
 */
router.post(
  '/bulk-reject',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiptIds, reason } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Receipt IDs array is required',
      });
    }

    if (receiptIds.length > BULK_RECEIPT_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `Cannot process more than ${BULK_RECEIPT_LIMIT} receipts per request`,
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const result = await receiptService.bulkReject(receiptIds, reason, req.user!.id);

    res.json(result);
  })
);

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

/**
 * POST /api/receipts/analytics/update
 * Update receipt analytics (internal use, called after receipt status changes)
 */
router.post(
  '/analytics/update',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = analyticsUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { receiptId, status, cashbackAmount, totalAmount } = parsed.data;

    // Look up the receipt owner — this is an admin endpoint; use the receipt's userId,
    // not the admin's own ID.
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { userId: true },
    });
    if (!receipt) {
      return res.status(404).json({ success: false, message: 'Receipt not found' });
    }

    await receiptAnalyticsService.updateAnalytics({
      userId: receipt.userId,
      receiptId,
      status,
      cashbackAmount: cashbackAmount ?? 0,
      totalAmount: totalAmount ?? 0,
    });

    res.json({ success: true });
  })
);

/**
 * GET /api/receipts/analytics/global
 * Get global receipt analytics (admin only)
 */
router.get(
  '/analytics/global',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await receiptAnalyticsService.getGlobalAnalytics();

    res.json(result);
  })
);

// ============================================
// EXPORT ENDPOINTS
// ============================================

/**
 * POST /api/receipts/email
 * Email receipts to user (requires backend email integration)
 */
router.post(
  '/email',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receipts, email } = req.body;

    if (!Array.isArray(receipts) || receipts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Receipts array is required',
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
      });
    }

    const customerName = email.split('@')[0];

    const totalCashback = receipts.reduce(
      (sum: number, r: any) => sum + (Number(r.cashbackAmount) || 0),
      0
    );

    await emailService.sendReceiptExportEmail(email, {
      customerName,
      receipts: receipts.map((r: any) => ({
        merchantName: r.merchantName || 'Unknown',
        amount: Number(r.totalAmount) || 0,
        cashbackAmount: Number(r.cashbackAmount) || 0,
        date: r.receiptDate
          ? new Date(r.receiptDate).toLocaleDateString('en-GB')
          : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '—'),
        status: r.status || 'UNKNOWN',
      })),
      totalCashback,
      exportDate: new Date(),
    });

    res.json({
      success: true,
      message: `Receipts sent to ${email}`,
    });
  })
);

// ============================================
// FRAUD DETECTION & MERCHANT MANAGEMENT
// ============================================

/**
 * GET /api/receipts/merchants/whitelist
 * Get merchant whitelist
 */
router.get(
  '/merchants/whitelist',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await fraudDetectionService.getMerchantWhitelist();

    res.json(result);
  })
);

/**
 * POST /api/receipts/merchants/whitelist
 * Add merchant to whitelist
 */
router.post(
  '/merchants/whitelist',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { merchantName, status, reason } = req.body;

    if (!merchantName) {
      return res.status(400).json({
        success: false,
        message: 'Merchant name is required',
      });
    }

    const result = await fraudDetectionService.addMerchantToWhitelist({
      merchantName,
      status: status || 'APPROVED',
      reason,
    });

    res.status(201).json(result);
  })
);

/**
 * PATCH /api/receipts/merchants/whitelist/:id
 * Update merchant whitelist status
 */
router.patch(
  '/merchants/whitelist/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, reason } = req.body;

    const result = await fraudDetectionService.updateMerchantStatus(
      req.params.id,
      status,
      reason
    );

    res.json(result);
  })
);

/**
 * GET /api/receipts/venues/:venueId/config
 * Get venue fraud detection configuration. Returns the global fallback row
 * (venueId: null) or null if no config has been set — callers should hydrate
 * from their client-side defaults in that case.
 *
 * NOTE: venueId here refers to Partner.id (matches VenueFraudConfig schema
 * convention — see VenueReceiptTemplate comment in prisma/schema.prisma).
 */
router.get(
  '/venues/:venueId/config',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.venueId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    const config = await fraudDetectionService.getVenueConfig(req.params.venueId);
    res.json({ success: true, data: config });
  })
);

/**
 * PUT /api/receipts/venues/:venueId/config
 * Update venue fraud detection configuration (partner/admin only).
 * venueId here is Partner.id — see schema comment in VenueReceiptTemplate.
 */
router.put(
  '/venues/:venueId/config',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  requireActivePartnerForWrites,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const config = req.body;

    const partner = await prisma.partner.findUnique({
      where: { id: req.params.venueId },
      select: { id: true, userId: true },
    });
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }

    // PARTNER role: verify they own this specific venue
    if (req.user!.role === 'PARTNER' && partner.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this venue configuration',
      });
    }

    const result = await fraudDetectionService.updateVenueConfig(
      req.params.venueId,
      config
    );

    res.json({ success: true, data: result });
  })
);

// ============================================
// VENUE RECEIPT TEMPLATES (Admin only)
// ============================================

/**
 * POST /api/receipts/venues/:venueId/templates
 * Upload an example receipt image as a template for fraud comparison.
 * Requires: multipart/form-data with field "image" + body fields:
 *   merchantName (string, required)
 *   description  (string, optional)
 *   expectedKeywords (JSON array string, optional) e.g. '["MENU","VAT"]'
 */
router.post(
  '/venues/:venueId/templates',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  uploadSingle,
  validateMagicBytes,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { venueId } = req.params;
    const { merchantName, merchantNameVariations, description, expectedKeywords } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Template image is required' });
    }
    if (!merchantName) {
      return res.status(400).json({ success: false, message: 'merchantName is required' });
    }

    // Parse merchantNameVariations — sent as a JSON string in multipart form data
    let variations: string[] = [];
    if (merchantNameVariations) {
      try {
        const parsed = typeof merchantNameVariations === 'string'
          ? JSON.parse(merchantNameVariations)
          : merchantNameVariations;
        if (!Array.isArray(parsed)) throw new Error('not an array');
        variations = parsed.map(String);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'merchantNameVariations must be a JSON array of strings',
        });
      }
    }

    // Parse expectedKeywords — sent as a JSON string in multipart form data
    let keywords: string[] = [];
    if (expectedKeywords) {
      try {
        const parsed = typeof expectedKeywords === 'string'
          ? JSON.parse(expectedKeywords)
          : expectedKeywords;
        if (!Array.isArray(parsed)) throw new Error('not an array');
        keywords = parsed.map(String);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'expectedKeywords must be a JSON array of strings, e.g. ["MENU","VAT"]',
        });
      }
    }

    // Compute dHash before upload — throws on corrupt image (returns 422)
    const perceptualHash = await imageUploadService.computePerceptualHash(req.file.buffer);
    if (!perceptualHash) {
      return res.status(422).json({
        success: false,
        message: 'Could not compute perceptual hash from the provided image',
      });
    }

    // Upload template image to dedicated S3 folder
    const upload = await imageUploadService.uploadImage({
      file:     req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder:   'receipt-templates',
      userId:   req.user!.id,
    });

    const template = await receiptTemplateService.createTemplate({
      venueId,
      merchantName,
      merchantNameVariations: variations,
      description,
      expectedKeywords:       keywords,
      imageUrl:               upload.url,
      imageKey:               upload.key,
      perceptualHash,
      uploadedBy:             req.user!.id,
    });

    res.status(201).json({ success: true, data: template });
  })
);

/**
 * GET /api/receipts/venues/:venueId/templates
 * List all templates for a venue (active and inactive), newest first.
 */
router.get(
  '/venues/:venueId/templates',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { venueId } = req.params;
    const templates = await receiptTemplateService.listTemplates(venueId);
    res.json({ success: true, data: templates });
  })
);

/**
 * PATCH /api/receipts/venues/:venueId/templates/:id
 * Update a template's metadata or active status.
 * Body fields (all optional):
 *   merchantName, description, expectedKeywords (JSON array string), isActive (boolean)
 */
router.patch(
  '/venues/:venueId/templates/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { merchantName, merchantNameVariations, description, expectedKeywords, isActive } = req.body;

    let variations: string[] | undefined;
    if (merchantNameVariations !== undefined) {
      try {
        const parsed = typeof merchantNameVariations === 'string'
          ? JSON.parse(merchantNameVariations)
          : merchantNameVariations;
        if (!Array.isArray(parsed)) throw new Error('not an array');
        variations = parsed.map(String);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'merchantNameVariations must be a JSON array of strings',
        });
      }
    }

    let keywords: string[] | undefined;
    if (expectedKeywords !== undefined) {
      try {
        const parsed = typeof expectedKeywords === 'string'
          ? JSON.parse(expectedKeywords)
          : expectedKeywords;
        if (!Array.isArray(parsed)) throw new Error('not an array');
        keywords = parsed.map(String);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'expectedKeywords must be a JSON array of strings',
        });
      }
    }

    const template = await receiptTemplateService.updateTemplate(id, {
      merchantName,
      merchantNameVariations: variations,
      description,
      expectedKeywords: keywords,
      isActive:         typeof isActive === 'boolean' ? isActive : undefined,
    });

    res.json({ success: true, data: template });
  })
);

/**
 * DELETE /api/receipts/venues/:venueId/templates/:id
 * Deactivate (soft delete) or permanently delete a template.
 * Query param: ?hard=true for permanent deletion (removes S3 object + DB row).
 * Default: soft deactivation (isActive = false).
 */
router.delete(
  '/venues/:venueId/templates/:id',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const hardDelete = req.query.hard === 'true';

    await receiptTemplateService.deleteTemplate(id, hardDelete);

    res.json({
      success: true,
      message: hardDelete
        ? 'Template permanently deleted'
        : 'Template deactivated',
    });
  })
);

export default router;
