import { Router, Request, Response } from 'express';
import { receiptService } from '../services/receipt.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// ============================================
// PROTECTED ROUTES (Authentication Required)
// ============================================

/**
 * POST /api/receipts
 * Create a new receipt from OCR results
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await receiptService.createReceipt(req.user!.id, req.body);
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
    const result = await receiptService.getReceipts({
      userId: req.user!.id,
      status: req.query.status as any,
      merchantName: req.query.merchantName as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any
    });

    res.json(result);
  })
);

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
      sortOrder: req.query.sortOrder as any
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
 * POST /api/receipts/:id/cashback
 * Apply cashback for a validated receipt - admin only
 */
router.post(
  '/:id/cashback',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { cashbackAmount } = req.body;

    if (!cashbackAmount || cashbackAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cashback amount'
      });
    }

    const result = await receiptService.applyCashback(req.params.id, cashbackAmount);
    res.json(result);
  })
);

export default router;
