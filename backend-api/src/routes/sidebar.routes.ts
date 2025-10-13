import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * GET /api/sidebar/stats
 * Get sidebar statistics for the partner dashboard
 * Returns mock data for development
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  // Mock sidebar statistics
  const stats = {
    revenue: {
      today: 1245.50,
      week: 8734.20,
      month: 34567.80,
      trend: '+12.5%',
    },
    bookings: {
      today: 23,
      week: 145,
      month: 567,
      pending: 12,
      confirmed: 134,
      completed: 421,
    },
    loyalty: {
      activeMembers: 3456,
      newThisWeek: 234,
      pointsAwarded: 45678,
      rewardsRedeemed: 234,
    },
    notifications: {
      unread: 5,
      total: 47,
      urgent: 2,
    },
    quickActions: {
      pendingApprovals: 8,
      lowStockItems: 3,
      overduePayments: 2,
    },
  };

  res.json(stats);
}));

export default router;
