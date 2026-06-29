import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/sidebar/stats
 * Sidebar statistics for the authenticated partner/admin dashboard.
 * Requires a valid session token — this endpoint must NOT be public.
 */
router.get('/stats', authenticate, asyncHandler(async (req: Request, res: Response) => {
  // Placeholder: real implementation will query per-partner metrics.
  // Returning empty stats until a proper data model is wired.
  res.json({
    success: true,
    data: {},
  });
}));

export default router;
