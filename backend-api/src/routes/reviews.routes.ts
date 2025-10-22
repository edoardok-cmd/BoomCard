import { Router, Request, Response, NextFunction } from 'express';
import { reviewsService } from '../services/reviews.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  createReviewValidation,
  updateReviewValidation,
  getReviewByIdValidation,
  getPartnerReviewsValidation,
  getReviewsValidation,
  markHelpfulValidation,
  flagReviewValidation,
  adminResponseValidation
} from '../validators/review.validator';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * GET /api/reviews
 * Get all reviews with filters
 */
router.get(
  '/',
  validate(getReviewsValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.getReviews({
      partnerId: req.query.partnerId as string,
      userId: req.query.userId as string,
      status: req.query.status as any,
      rating: req.query.rating ? parseInt(req.query.rating as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 10,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any
    });

    res.json(result);
  })
);

/**
 * GET /api/reviews/:id
 * Get single review by ID
 */
router.get(
  '/:id',
  validate(getReviewByIdValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.getReviewById(req.params.id);
    res.json(result);
  })
);

/**
 * GET /api/reviews/partner/:partnerId
 * Get reviews for a specific partner
 */
router.get(
  '/partner/:partnerId',
  validate(getPartnerReviewsValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const result = await reviewsService.getPartnerReviews(req.params.partnerId, page, limit);
    res.json(result);
  })
);

/**
 * GET /api/reviews/partner/:partnerId/stats
 * Get review statistics for a partner
 */
router.get(
  '/partner/:partnerId/stats',
  validate(getPartnerReviewsValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await reviewsService.getReviewStats(req.params.partnerId);
    res.json({ success: true, data: stats });
  })
);

// ============================================
// PROTECTED ROUTES (Authentication Required)
// ============================================

/**
 * POST /api/reviews
 * Create a new review
 */
router.post(
  '/',
  authenticate,
  validate(createReviewValidation),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await reviewsService.createReview(req.user!.id, req.body);
    res.status(201).json(result);
  })
);

/**
 * PUT /api/reviews/:id
 * Update a review (only owner, only if PENDING)
 */
router.put(
  '/:id',
  authenticate,
  validate(updateReviewValidation),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await reviewsService.updateReview(req.user!.id, req.params.id, req.body);
    res.json(result);
  })
);

/**
 * DELETE /api/reviews/:id
 * Delete a review (only owner)
 */
router.delete(
  '/:id',
  authenticate,
  validate(getReviewByIdValidation),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await reviewsService.deleteReview(req.user!.id, req.params.id);
    res.json(result);
  })
);

/**
 * PATCH /api/reviews/:id/helpful
 * Mark review as helpful or not helpful
 */
router.patch(
  '/:id/helpful',
  authenticate,
  validate(markHelpfulValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.markHelpful(req.params.id, req.body.helpful);
    res.json(result);
  })
);

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * PATCH /api/reviews/:id/approve
 * Approve a review (admin only)
 */
router.patch(
  '/:id/approve',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(getReviewByIdValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.approveReview(req.params.id);
    res.json(result);
  })
);

/**
 * PATCH /api/reviews/:id/reject
 * Reject a review (admin only)
 */
router.patch(
  '/:id/reject',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(flagReviewValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.rejectReview(req.params.id, req.body.reason);
    res.json(result);
  })
);

/**
 * PATCH /api/reviews/:id/flag
 * Flag a review as inappropriate
 */
router.patch(
  '/:id/flag',
  authenticate,
  validate(flagReviewValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.flagReview(req.params.id, req.body.reason);
    res.json(result);
  })
);

/**
 * POST /api/reviews/:id/admin-response
 * Add admin response to a review (admin only)
 */
router.post(
  '/:id/admin-response',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  validate(adminResponseValidation),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewsService.addAdminResponse(req.params.id, req.body.response);
    res.json(result);
  })
);

export default router;
