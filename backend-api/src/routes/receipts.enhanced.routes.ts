import { Router, Request, Response } from 'express';
import multer from 'multer';
import { receiptService } from '../services/receipt.service';
import { fraudDetectionService } from '../services/fraudDetection.service';
import { receiptAnalyticsService } from '../services/receiptAnalytics.service';
import { imageUploadService } from '../services/imageUpload.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

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
 * POST /api/receipts/upload
 * Upload receipt image to storage
 */
router.post(
  '/upload',
  authenticate,
  upload.single('receipt'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const result = await imageUploadService.uploadReceipt(
      req.file,
      req.user!.id
    );

    res.json(result);
  })
);

/**
 * POST /api/receipts/submit
 * Complete receipt submission with fraud detection & cashback calculation
 */
router.post(
  '/submit',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      imageUrl,
      imageHash,
      ocrData,
      userAmount,
      venueId,
      offerId,
      latitude,
      longitude,
      metadata,
    } = req.body;

    // Validate required fields
    if (!imageUrl || !imageHash) {
      return res.status(400).json({
        success: false,
        message: 'Image URL and hash are required',
      });
    }

    // Process receipt with fraud detection and cashback calculation
    const result = await receiptService.submitReceipt({
      userId: req.user!.id,
      imageUrl,
      imageHash,
      ocrData,
      userAmount,
      venueId,
      offerId,
      latitude,
      longitude,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata,
    });

    res.status(201).json(result);
  })
);

/**
 * GET /api/receipts
 * Get user's receipts with filters
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const filters = {
      userId: req.user!.id,
      status: req.query.status as any,
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
 * GET /api/receipts/analytics
 * Get receipt analytics (user-specific or global if admin)
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
 * POST /api/receipts/analytics/update
 * Update receipt analytics (internal use, called after receipt status changes)
 */
router.post(
  '/analytics/update',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiptId, status, cashbackAmount, totalAmount } = req.body;

    if (!receiptId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Receipt ID and status are required',
      });
    }

    await receiptAnalyticsService.updateAnalytics({
      userId: req.user!.id,
      receiptId,
      status,
      cashbackAmount: cashbackAmount || 0,
      totalAmount: totalAmount || 0,
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

    // TODO: Implement email service integration
    // For now, return success
    res.json({
      success: true,
      message: `Receipts will be sent to ${email}`,
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
 * Get venue fraud detection and cashback configuration
 */
router.get(
  '/venues/:venueId/config',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await fraudDetectionService.getVenueConfig(req.params.venueId);

    res.json(result);
  })
);

/**
 * PUT /api/receipts/venues/:venueId/config
 * Update venue fraud detection configuration (partner/admin only)
 */
router.put(
  '/venues/:venueId/config',
  authenticate,
  authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const config = req.body;

    // TODO: Check if user is partner of this venue

    const result = await fraudDetectionService.updateVenueConfig(
      req.params.venueId,
      config
    );

    res.json(result);
  })
);

export default router;
