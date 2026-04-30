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
      // Абонати — counted by USER profile per spec §4.1, bucketed by spec §4.2
      activeSubscribers,
      newSubscribers,
      expiredSubscribers,
      pausedSubscribers,
      failedPaymentSubscribers,

      // Транзакции
      todayTxCount,
      todayTxVolume,
      totalTxVolume,

      // Кешбек
      accruedCashback,
      approvedCashback,
      pendingCashback,
      expiringCashback,

      // Партньори
      activePartners,
      partnerRequests,
      activeLocations,

      // Финанси — subscriber payouts (§6.1) + partner receivables (§6.2) come from
      // DIFFERENT tables; previous implementation pulled both from PartnerCashbackPayment
      // and double-counted PENDING.
      payoutsDueAgg,
      payoutsDueCount,
      partnerReceivables,
      totalMargin,
    ] = await Promise.all([
      // Active = profile has any ACTIVE subscription
      prisma.user.count({
        where: { subscriptions: { some: { status: 'ACTIVE' } } },
      }),
      // New = profile created in last 30 days
      prisma.user.count({
        where: { createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
      }),
      // Expired (изтекъл per spec §4.2) = no ACTIVE subscription, but has a
      // CANCELLED / EXPIRED / INCOMPLETE_EXPIRED one. EXPIRED is the natural
      // billing-period lapse path (Paysera renewal cron); CANCELLED is the
      // user-initiated path. Both count toward "expired subscribers" on the
      // dashboard since the user has no live access.
      prisma.user.count({
        where: {
          subscriptions: {
            some: { status: { in: ['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED'] } },
            none: { status: 'ACTIVE' },
          },
        },
      }),
      // Paused (спрян) = no ACTIVE, has PAUSED — distinct from failed-payment per spec §4.2
      prisma.user.count({
        where: {
          subscriptions: {
            some: { status: 'PAUSED' },
            none: { status: 'ACTIVE' },
          },
        },
      }),
      // Failed payment (неуспешно плащане) = no ACTIVE, has PAST_DUE or UNPAID
      prisma.user.count({
        where: {
          subscriptions: {
            some: { status: { in: ['PAST_DUE', 'UNPAID'] } },
            none: { status: 'ACTIVE' },
          },
        },
      }),

      // Транзакции — днес (count + volume) + общ оборот (cumulative volume per spec §3.1)
      prisma.transaction.count({ where: { createdAt: { gte: todayStart }, status: 'COMPLETED' } }),
      prisma.transaction.aggregate({
        where: { createdAt: { gte: todayStart }, status: 'COMPLETED' },
        _sum: { finalAmount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { finalAmount: true },
      }),

      // Кешбек — 4 metrics per spec §3.1: начислен, одобрен, изчакващ, изтичащ
      prisma.walletTransaction.aggregate({
        where: { type: 'CASHBACK_CREDIT' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: 'CASHBACK_CREDIT', status: 'COMPLETED' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: 'CASHBACK_CREDIT', status: { in: ['TRIAL_PENDING', 'PENDING', 'PROCESSING'] } },
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
      prisma.venue.count({ where: { partner: { status: 'ACTIVE' } } }),

      // Финанси §6.1 — subscriber payout queue.
      // WITHDRAWAL amounts are stored negative (wallet.service.ts:436), so we negate
      // the sum to surface a positive BGN figure for the dashboard.
      prisma.walletTransaction.aggregate({
        where: { type: 'WITHDRAWAL', status: { in: ['PENDING', 'PROCESSING'] } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.count({
        where: { type: 'WITHDRAWAL', status: { in: ['PENDING', 'PROCESSING'] } },
      }),

      // Финанси §6.2 — partner receivables (unique scope: PENDING + OVERDUE)
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
    const payoutsDue = Math.abs(payoutsDueAgg._sum.amount ?? 0);

    res.json({
      success: true,
      data: {
        subscribers: {
          active: activeSubscribers,
          newLast30Days: newSubscribers,
          expired: expiredSubscribers,
          paused: pausedSubscribers,
          failedPayment: failedPaymentSubscribers,
        },
        transactions: {
          todayCount: todayTxCount,
          todayVolume,
          todayAvg,
          totalVolume: totalTxVolume._sum.finalAmount ?? 0,
        },
        cashback: {
          accrued: accruedCashback._sum.amount ?? 0,
          approved: approvedCashback._sum.amount ?? 0,
          pending: pendingCashback._sum.amount ?? 0,
          expiringSoon: expiringCashback._sum.amount ?? 0,
        },
        partners: {
          active: activePartners,
          requests: partnerRequests,
          locations: activeLocations,
        },
        finance: {
          payoutsDue,
          payoutsDueCount,
          partnerReceivables: partnerReceivables._sum.totalCashbackOwed ?? 0,
          margin: totalMargin._sum.marginAmount ?? 0,
        },
      },
      generatedAt: now.toISOString(),
    });
  })
);

export default router;
