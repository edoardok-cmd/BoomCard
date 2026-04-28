import { Router, Request, Response } from 'express';
import { receiptService } from '../services/receipt.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// ============================================
// PROTECTED ROUTES (Authentication Required)
// ============================================

/**
 * POST /api/receipts — RETIRED
 * Direct receipt creation has been removed. All receipts must be submitted
 * through the sticker scan flow (POST /api/stickers/scan/:id/receipt).
 */
router.post('/', authenticate, (_req: AuthRequest, res: Response) => {
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

    const result = await receiptService.getReceipts({
      userId: req.user!.id,
      status: req.query.status as any,
      merchantName: req.query.merchantName as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      startDate,
      endDate,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any
    });

    res.json(result);
  })
);

/**
 * POST /api/receipts/ocr — RETIRED
 * Direct receipt OCR has been removed. OCR processing now happens within
 * the sticker scan flow.
 */
router.post('/ocr', authenticate, (_req: AuthRequest, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'Direct receipt OCR has been retired. Please scan a venue QR sticker first, then upload your receipt through the sticker scan flow. Update your app for the latest experience.',
    code: 'ENDPOINT_RETIRED',
  });
});

/**
 * GET /api/receipts/stats
 * Get user's receipt statistics
 */
router.get(
  '/stats',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.getUserReceiptStats(req.user!.id);
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
    res.json(result);
  })
);

/**
 * PUT /api/receipts/:id
 * Update receipt data (manual corrections)
 */
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.updateReceipt(req.user!.id, req.params.id, req.body);
    res.json(result);
  })
);

/**
 * DELETE /api/receipts/:id
 * Delete a receipt
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.deleteReceipt(req.user!.id, req.params.id);
    res.json(result);
  })
);

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /api/receipts/admin/all
 * Get all receipts (admin only)
 */
router.get(
  '/admin/all',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await receiptService.getReceipts({
      status: req.query.status as any,
      merchantName: req.query.merchantName as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
      includeInternal: true,
    });

    res.json(result);
  })
);

/**
 * PATCH /api/receipts/:id/validate
 * Validate a receipt (approve or reject) - admin only
 */
router.patch(
  '/:id/validate',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.validateReceipt(
      req.params.id,
      req.user!.id,
      req.body
    );
    res.json(result);
  })
);

/**
 * POST /api/receipts/:id/cashback — RETIRED
 * Freeform cashback crediting bypassed tier gating, daily/monthly caps, and the
 * fraud-score-driven cashback recalculation that reviewReceipt performs.
 * Admins must use PATCH /:id/validate (or the StickerScan approval flow) instead.
 */
router.post(
  '/:id/cashback',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      message: 'Direct cashback crediting has been retired. Approve the receipt via PATCH /api/receipts/:id/validate — cashback is calculated and credited as part of the approval flow.',
      code: 'ENDPOINT_RETIRED',
    });
  }
);

export default router;
