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
import { bgnToEur, sumMixedCurrencyToEur } from '../utils/currency';

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
      // Кешбек §3.1 — per-status breakdown across all 7 CashbackEntryStatus values
      // (PENDING, TRIAL_PENDING, CLEARED, LOCKED, PAID, EXPIRED, VOIDED). Single
      // groupBy over cashbackStatus; the value tiles above stay as-is for back-compat.
      cashbackStatusGroups,

      // Партньори
      activePartners,
      partnerRequests,
      activeLocations,

      // L9 — active user accounts (distinct from active subscribers).
      activeUserAccounts,

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
      // groupBy(['currency']) rather than a flat aggregate: Transaction.currency
      // is genuinely mixed (schema default BGN; POST /api/payments/create stores
      // a caller-supplied currency defaulting to EUR; Stripe writes EUR rows), so
      // a single `_sum.finalAmount` would add BGN and EUR magnitudes together
      // before any conversion could run. sumMixedCurrencyToEur() converts each
      // per-currency subtotal, then folds (BC-QA-031 — EUR-only responses).
      prisma.transaction.groupBy({
        by: ['currency'],
        where: { createdAt: { gte: todayStart }, status: 'COMPLETED' },
        _sum: { finalAmount: true },
      }),
      prisma.transaction.groupBy({
        by: ['currency'],
        where: { status: 'COMPLETED' },
        _sum: { finalAmount: true },
      }),

      // Кешбек — 4 metrics per spec §3.1: начислен, одобрен, изчакващ, изтичащ
      // "Начислен" = outstanding committed cashback (spec §3.1: "бъдещи задължения").
      // • Excludes FAILED/ANNULLED (terminal failure — never an obligation).
      // • Excludes cashbackStatus=PAID: payout completed; markPaid() does not clear
      //   cashbackExpiresAt, so PAID rows with status=COMPLETED would otherwise inflate
      //   the figure indefinitely. PAID is a past obligation, not a future one.
      // • LOCKED entries (in-flight payout) are included — still an outstanding obligation.
      // The identity `accrued = approved + pending` is preserved: TRIAL_PENDING/PENDING/
      // PROCESSING rows cannot reach cashbackStatus=PAID by lifecycle invariants (PAID
      // requires CLEARED→LOCKED→PAID, all via status=COMPLETED), so the pending sub-query
      // need not repeat the cashbackStatus filter.
      prisma.walletTransaction.aggregate({
        where: {
          type: 'CASHBACK_CREDIT',
          status: { in: ['COMPLETED', 'TRIAL_PENDING', 'PENDING', 'PROCESSING'] },
          cashbackStatus: { not: 'PAID' },
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
          cashbackStatus: { not: 'PAID' },
        },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { type: 'CASHBACK_CREDIT', status: { in: ['TRIAL_PENDING', 'PENDING', 'PROCESSING'] } },
        _sum: { amount: true },
      }),
      // "Изтичащ" = CLEARED entries expiring within 7 days that are still actionable.
      // Excludes LOCKED (in-flight payout — being processed, not at expiry risk) and
      // PAID (already settled — markPaid() leaves cashbackExpiresAt intact, so without
      // this guard paid entries with a future expiry date would inflate the figure).
      prisma.walletTransaction.aggregate({
        where: {
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
          cashbackStatus: { notIn: ['PAID', 'LOCKED'] },
          cashbackExpiresAt: { gte: now, lte: sevenDaysLater },
        },
        _sum: { amount: true },
      }),

      // Кешбек §3.1 — count + amount per cashbackStatus. Scoped to CASHBACK_CREDIT
      // (the cashback-bearing wallet rows that carry a cashbackStatus). One query.
      prisma.walletTransaction.groupBy({
        by: ['cashbackStatus'],
        where: { type: 'CASHBACK_CREDIT', cashbackStatus: { not: null } },
        _count: { _all: true },
        _sum: { amount: true },
      }),

      // Партньори
      prisma.partner.count({ where: { status: 'ACTIVE' } }),
      prisma.partner.count({ where: { status: 'PENDING' } }),
      // spec §3.1 "активни локации" — only venues with venueStatus=ACTIVE qualify;
      // SUSPENDED/REPLACED venues under an active partner are not operationally active.
      prisma.venue.count({ where: { partner: { status: 'ACTIVE' }, venueStatus: 'ACTIVE' } }),

      // L9 / Spec §3.1 — "active user ACCOUNTS" is a distinct metric from the
      // subscription-status breakdown. The `subscribers.active` tile counts users
      // whose LATEST SUBSCRIPTION is ACTIVE; this counts active USER ACCOUNTS
      // (user_account_status = ACTIVE) regardless of subscription state. A user can
      // have an active account with an expired/cancelled subscription, so the two
      // numbers are legitimately different and §3.1 lists them separately.
      prisma.user.count({ where: { status: 'ACTIVE', role: 'USER', deletedAt: null } }),

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
    // Spec §1.2/§7.1 treat Cancelled and Expired as distinct subscription_status
    // values with different scanning/payout gates, so surface them separately.
    // `expired` keeps EXPIRED + INCOMPLETE_EXPIRED; CANCELLED moves to its own tile.
    const expiredSubscribers     = countByStatuses(['EXPIRED', 'INCOMPLETE_EXPIRED']);
    const cancelledSubscribers   = countByStatuses(['CANCELLED']);
    const pausedSubscribers      = countByStatuses(['PAUSED']);
    // Spec §4.2 v1.1 — FAILED_PAYMENT is the canonical no-grace failed state
    // written by the Paysera renewal cron. PAST_DUE / UNPAID are the legacy
    // Stripe-lifecycle states still present in older rows.
    const failedPaymentSubscribers = countByStatuses(['PAST_DUE', 'UNPAID', 'FAILED_PAYMENT']);

    // Per-currency subtotals converted then folded — see the groupBy above.
    // These are already EUR, so the response emits them directly rather than
    // running bgnToEur() over them a second time.
    const todayVolumeEur = sumMixedCurrencyToEur(
      todayTxVolume.map((g) => ({ currency: g.currency, amount: g._sum.finalAmount })),
    );
    const totalVolumeEur = sumMixedCurrencyToEur(
      totalTxVolume.map((g) => ({ currency: g.currency, amount: g._sum.finalAmount })),
    );
    const todayAvgEur = todayTxCount > 0
      ? parseFloat((todayVolumeEur / todayTxCount).toFixed(2))
      : 0;
    const payoutsDue = Math.abs(payoutsDueAgg._sum.amount ?? 0);

    // §3.1 cashback status breakdown — zero-fill all 7 canonical statuses so the
    // tile always renders every state even when no rows exist for it.
    const CASHBACK_STATUSES = [
      'PENDING',
      'TRIAL_PENDING',
      'CLEARED',
      'LOCKED',
      'PAID',
      'EXPIRED',
      'VOIDED',
    ] as const;
    const cashbackStatusBreakdown = CASHBACK_STATUSES.map((status) => {
      const row = cashbackStatusGroups.find((g) => g.cashbackStatus === status);
      const amount = row?._sum?.amount ?? 0;
      return {
        status,
        count: row?._count?._all ?? 0,
        amount: bgnToEur(amount),
      };
    });

    const partnerReceivablesAmt = partnerReceivables._sum.totalCashbackOwed ?? 0;
    const marginAmt = totalMargin._sum.marginAmount ?? 0;

    // All figures below are stored BGN-denominated aggregates — convert to EUR
    // before returning (BC-QA-031 — EUR-only responses).
    res.json({
      success: true,
      data: {
        subscribers: {
          active: activeSubscribers,
          newLast30Days: newSubscribers,
          expired: expiredSubscribers,
          cancelled: cancelledSubscribers,
          paused: pausedSubscribers,
          failedPayment: failedPaymentSubscribers,
        },
        // L9 — active user ACCOUNTS metric, distinct from active subscribers above.
        users: {
          activeAccounts: activeUserAccounts,
        },
        transactions: {
          todayCount: todayTxCount,
          todayVolume: todayVolumeEur,
          todayAvg: todayAvgEur,
          totalVolume: totalVolumeEur,
        },
        cashback: {
          accrued: bgnToEur(accruedCashback._sum.amount ?? 0),
          approved: bgnToEur(approvedCashback._sum.amount ?? 0),
          pending: bgnToEur(pendingCashback._sum.amount ?? 0),
          expiringSoon: bgnToEur(expiringCashback._sum.amount ?? 0),
          statusBreakdown: cashbackStatusBreakdown,
        },
        partners: {
          active: activePartners,
          requests: partnerRequests,
          locations: activeLocations,
        },
        finance: {
          payoutsDue: bgnToEur(payoutsDue),
          payoutsDueCount,
          partnerReceivables: bgnToEur(partnerReceivablesAmt),
          margin: bgnToEur(marginAmt),
        },
      },
      generatedAt: now.toISOString(),
    });
  })
);

export default router;
