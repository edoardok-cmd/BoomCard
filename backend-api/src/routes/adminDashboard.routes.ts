/**
 * Admin Dashboard Overview — Spec §3.1
 *
 * GET /api/admin/dashboard
 * Returns 5 metric blocks: Абонати, Транзакции, Кешбек, Партньори, Финанси
 */

import { Router, Response } from 'express';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));

router.get(
  '/',
  requirePermission('dashboard.read'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      activeSubscriptions,
      newSubscriptions,
      expiredSubscriptions,
      todayTxCount,
      todayTxVolume,
      totalCashbackCredited,
      pendingCashback,
      expiringCashback,
      activePartners,
      partnerRequests,
      activeLocations,
      payoutsDue,
      partnerReceivables,
      totalMargin,
    ] = await Promise.all([
      // Абонати
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.subscription.count({ where: { status: { in: ['CANCELLED', 'INCOMPLETE_EXPIRED'] } } }),

      // Транзакции (днес — само COMPLETED)
      prisma.transaction.count({ where: { createdAt: { gte: todayStart }, status: 'COMPLETED' } }),
      prisma.transaction.aggregate({
        where: { createdAt: { gte: todayStart }, status: 'COMPLETED' },
        _sum: { finalAmount: true },
      }),

      // Кешбек
      prisma.walletTransaction.aggregate({
        where: { type: 'CASHBACK_CREDIT', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: 'CASHBACK_CREDIT', status: 'TRIAL_PENDING' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
          cashbackExpiresAt: { gte: now, lte: sevenDaysLater },
        },
        _sum: { amount: true },
      }),

      // Партньори
      prisma.partner.count({ where: { status: 'ACTIVE' } }),
      prisma.partner.count({ where: { status: 'PENDING' } }),
      // Count venues belonging to active partners as proxy for active locations
      prisma.venue.count({ where: { partner: { status: 'ACTIVE' } } }),

      // Финанси — PENDING only (due for immediate payout)
      prisma.partnerCashbackPayment.aggregate({
        where: { status: 'PENDING' },
        _sum: { totalCashbackOwed: true },
      }),
      // PENDING + OVERDUE — total owed to partners
      prisma.partnerCashbackPayment.aggregate({
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { totalCashbackOwed: true },
      }),
      prisma.partnerCashbackPayment.aggregate({
        where: { status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { marginAmount: true },
      }),
    ]);

    const todayVolume = todayTxVolume._sum.finalAmount ?? 0;
    const todayAvg = todayTxCount > 0
      ? parseFloat((todayVolume / todayTxCount).toFixed(2))
      : 0;

    res.json({
      success: true,
      data: {
        subscribers: {
          active: activeSubscriptions,
          newLast30Days: newSubscriptions,
          expired: expiredSubscriptions,
        },
        transactions: {
          todayCount: todayTxCount,
          todayVolume,
          todayAvg,
        },
        cashback: {
          totalCredited: totalCashbackCredited._sum.amount ?? 0,
          pending: pendingCashback._sum.amount ?? 0,
          expiringSoon: expiringCashback._sum.amount ?? 0,
        },
        partners: {
          active: activePartners,
          requests: partnerRequests,
          locations: activeLocations,
        },
        finance: {
          payoutsDue: payoutsDue._sum.totalCashbackOwed ?? 0,
          partnerReceivables: partnerReceivables._sum.totalCashbackOwed ?? 0,
          margin: totalMargin._sum.marginAmount ?? 0,
        },
      },
      generatedAt: now.toISOString(),
    });
  })
);

export default router;
