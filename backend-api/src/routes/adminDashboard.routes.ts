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

    // Абонати — use "latest subscription per user" logic so tile counts match what
    // clicking the StatCard tile shows (resolveLatestSubUserIds in adminSubscribers
    // also resolves by the most-recent subscription, not any historical one).
    // Two raw queries:
    //   1. Grouped count of all users by their current (latest) subscription status.
    //   2. Active subscribers with the additional account-status guard (spec §4.1 "Активни
    //      абонати" = account ACTIVE + latest sub ACTIVE + not soft-deleted).
    // Both use DISTINCT ON ("userId") ORDER BY "userId", "createdAt" DESC which is
    // Postgres-native and efficient with the existing (userId, createdAt) index.
    type RawStatusCount = { status: string; cnt: bigint };
    type RawCount      = { cnt: bigint };
    const [
      latestSubCountsRaw,
      activeSubscribersRaw,
      // New registrations: count ALL accounts (including soft-deleted) so the tile
      // matches the filter result — the filter has no deletedAt guard on dateFrom.
      newSubscribers,

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
      // Latest-sub grouped count: one row per subscription status, cnt = number of users
      // whose most-recent subscription has that status.
      // Role guard keeps PARTNER/ADMIN accounts (which share the User table) from
      // inflating expired/paused/failed tiles — mirrors the role:'USER' guard on
      // the subscribers list endpoint and on newSubscribers below.
      prisma.$queryRaw<RawStatusCount[]>`
        SELECT status, COUNT(*) AS cnt
        FROM (
          SELECT DISTINCT ON (s."userId") s."userId", s.status
          FROM subscriptions s
          JOIN "User" u ON u.id = s."userId"
          WHERE u.role = 'USER'
            AND u."deletedAt" IS NULL
          ORDER BY s."userId", s."createdAt" DESC
        ) latest
        GROUP BY status
      `,
      // Active subscribers: latest sub ACTIVE + account ACTIVE + not soft-deleted.
      // Matches the StatCard click filter: status=ACTIVE + accountStatus=ACTIVE.
      prisma.$queryRaw<RawCount[]>`
        SELECT COUNT(*) AS cnt
        FROM (
          SELECT DISTINCT ON (s."userId") s."userId", s.status
          FROM subscriptions s
          ORDER BY s."userId", s."createdAt" DESC
        ) latest
        JOIN "User" u ON u.id = latest."userId"
        WHERE latest.status = 'ACTIVE'
          AND u.status = 'ACTIVE'
          AND u.role = 'USER'
          AND u."deletedAt" IS NULL
      `,
      prisma.user.count({
        where: { createdAt: { gte: thirtyDaysAgo }, role: 'USER' },
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

    // Derive per-status counts from the grouped raw result.
    const countByStatuses = (statuses: string[]) =>
      latestSubCountsRaw
        .filter((r) => statuses.includes(r.status))
        .reduce((sum, r) => sum + Number(r.cnt), 0);

    const activeSubscribers      = Number(activeSubscribersRaw[0]?.cnt ?? 0n);
    const expiredSubscribers     = countByStatuses(['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED']);
    const pausedSubscribers      = countByStatuses(['PAUSED']);
    // Spec §4.2 v1.1 — FAILED_PAYMENT is the canonical no-grace failed state
    // written by the Paysera renewal cron. PAST_DUE / UNPAID are the legacy
    // Stripe-lifecycle states still present in older rows.
    const failedPaymentSubscribers = countByStatuses(['PAST_DUE', 'UNPAID', 'FAILED_PAYMENT']);

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
