import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus, TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';
import { planDisplayName } from '../utils/planDisplayName';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'SUPER_ADMIN'));
router.use(auditMiddleware);

// Email patterns that mark seed/test accounts. Kept here (not config) because
// the admin list explicitly filters them out by default per ops feedback.
// Prisma's `contains` is substring-based and cannot anchor matches the way the
// regex patterns can (see isTestEmail), so the filter side uses substring
// fragments that are guaranteed unique to test accounts. Both representations
// MUST stay in sync — divergence causes the "test" tag and the excludeTest
// toggle to disagree (admins see disappearing rows with no indicator).
const TEST_EMAIL_PATTERNS = [
  /@boomcard-test\.dev$/i,
  /^e2e-/i,
  /@test\.boomcard\.bg$/i,
  /^(premiumuser|lightuser|basicuser)@/i,
  /@test\.com$/i,
];
const isTestEmail = (email: string) => TEST_EMAIL_PATTERNS.some((p) => p.test(email));

// SQL fragments mirroring the regex above. Prisma cannot do anchored matches
// in JSON filters, so we use raw `email ~* '<pattern>'` clauses (POSIX regex,
// case-insensitive). The same patterns gate both directions:
//   - inclusion (`isTest` tag)        → isTestEmail()
//   - exclusion (`excludeTest=true`)  → testEmailWhereExclusion()
const TEST_EMAIL_REGEX_PG = '(@boomcard-test\\.dev$)|(^e2e-)|(@test\\.boomcard\\.bg$)|(^(premiumuser|lightuser|basicuser)@)|(@test\\.com$)';
const userIdsByTestEmailRegex = async (negate: boolean): Promise<string[]> => {
  // Returns user IDs whose email matches (negate=false) or does not match
  // (negate=true) the test patterns. Used to seed the where clause without
  // forcing every list query through a raw SQL execution path.
  const op = negate ? '!~*' : '~*';
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "User" WHERE email ${op} $1`,
    TEST_EMAIL_REGEX_PG,
  );
  return rows.map((r) => r.id);
};

// Derive billing cycle from period length. Stripe price metadata is the source
// of truth, but we don't fetch it for every list row — period delta is reliable.
type BillingCycle = 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'OTHER';
const billingCycleFromPeriod = (start: Date, end: Date): BillingCycle => {
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days >= 6 && days <= 8) return 'WEEKLY';
  if (days >= 28 && days <= 32) return 'MONTHLY';
  if (days >= 360 && days <= 370) return 'YEARLY';
  return 'OTHER';
};

const BILLING_CYCLE_DAY_RANGES: Record<Exclude<BillingCycle, 'OTHER'>, [number, number]> = {
  WEEKLY: [6, 8],
  MONTHLY: [28, 32],
  YEARLY: [360, 370],
};

interface ListFilters {
  search?: string;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  billingCycle?: BillingCycle;
  cancelScheduled?: boolean;
  excludeTest?: boolean;
}

async function buildSubscriptionWhere(
  filters: ListFilters,
): Promise<Prisma.SubscriptionWhereInput> {
  const where: Prisma.SubscriptionWhereInput = {};

  if (filters.plan) where.plan = filters.plan;
  if (filters.status) where.status = filters.status;
  if (typeof filters.cancelScheduled === 'boolean') {
    where.cancelAtPeriodEnd = filters.cancelScheduled;
  }

  const userFilter: Prisma.UserWhereInput = {};
  if (filters.search) {
    userFilter.OR = [
      { email: { contains: filters.search, mode: 'insensitive' } },
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.excludeTest) {
    // Translate the regex-based isTestEmail() into a Prisma filter via raw SQL,
    // so the table-list filter and the per-row tag use the same semantics.
    const testIds = await userIdsByTestEmailRegex(false);
    if (testIds.length > 0) {
      userFilter.id = { notIn: testIds };
    }
  }

  if (Object.keys(userFilter).length > 0) {
    where.user = userFilter;
  }

  // Billing cycle is derived (period end - period start), not stored, so
  // translate to a date-delta condition. PostgreSQL evaluates this on each
  // row — fine for the ~thousands of rows we expect at MVP scale.
  if (filters.billingCycle && filters.billingCycle !== 'OTHER') {
    const [minDays, maxDays] = BILLING_CYCLE_DAY_RANGES[filters.billingCycle];
    // Period delta filtering requires raw SQL; run a pre-query to gather IDs.
    const cycleRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM subscriptions
       WHERE EXTRACT(EPOCH FROM ("currentPeriodEnd" - "currentPeriodStart")) / 86400
         BETWEEN $1 AND $2`,
      minDays,
      maxDays,
    );
    where.id = { in: cycleRows.map((r) => r.id) };
  }

  return where;
}

// Augment a raw subscription row with derived list fields (display name,
// billing cycle, user history count, payment aggregates).
async function enrichSubscriptions(
  rows: Array<{
    id: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    cancelAt: Date | null;
    canceledAt: Date | null;
    autoRenewal: boolean;
    stripeSubscriptionId: string | null;
    payseraOrderId: string | null;
    createdAt: Date;
    user: { id: string; firstName: string | null; lastName: string | null; email: string; phone: string | null };
  }>,
) {
  const userIds = Array.from(new Set(rows.map((s) => s.user.id)));
  if (userIds.length === 0) return [];

  const [subscriptionCounts, paymentAggregates] = await Promise.all([
    prisma.subscription.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        type: TransactionType.SUBSCRIPTION,
        status: TransactionStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
  ]);

  const countByUser = new Map(subscriptionCounts.map((c) => [c.userId, c._count._all]));
  const paymentsByUser = new Map(
    paymentAggregates.map((p) => [
      p.userId,
      { count: p._count._all, totalAmount: p._sum.amount ?? 0, lastPaymentAt: p._max.createdAt },
    ]),
  );

  return rows.map((s) => {
    const payments = paymentsByUser.get(s.user.id);
    return {
      id: s.id,
      plan: s.plan,
      status: s.status,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      cancelAt: s.cancelAt,
      canceledAt: s.canceledAt,
      autoRenewal: s.autoRenewal,
      stripeSubscriptionId: s.stripeSubscriptionId,
      payseraOrderId: s.payseraOrderId,
      createdAt: s.createdAt,
      user: { ...s.user, isTest: isTestEmail(s.user.email) },
      planDisplayName: planDisplayName(s.plan),
      userSubscriptionCount: countByUser.get(s.user.id) ?? 1,
      billingCycle: billingCycleFromPeriod(s.currentPeriodStart, s.currentPeriodEnd),
      paymentCount: payments?.count ?? 0,
      paymentTotalAmount: payments?.totalAmount ?? 0,
      lastPaymentAt: payments?.lastPaymentAt ?? null,
    };
  });
}

const SUBSCRIPTION_LIST_SELECT = {
  id: true,
  plan: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  cancelAt: true,
  canceledAt: true,
  autoRenewal: true,
  stripeSubscriptionId: true,
  payseraOrderId: true,
  createdAt: true,
  user: {
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  },
} as const;

function parseFilters(query: Record<string, string | undefined>): ListFilters {
  const filters: ListFilters = {};
  if (query.search) filters.search = query.search;
  if (query.plan && Object.values(SubscriptionPlan).includes(query.plan as SubscriptionPlan)) {
    filters.plan = query.plan as SubscriptionPlan;
  }
  if (query.status && Object.values(SubscriptionStatus).includes(query.status as SubscriptionStatus)) {
    filters.status = query.status as SubscriptionStatus;
  }
  if (query.billingCycle && ['WEEKLY', 'MONTHLY', 'YEARLY', 'OTHER'].includes(query.billingCycle)) {
    filters.billingCycle = query.billingCycle as BillingCycle;
  }
  if (query.cancelScheduled === 'true') filters.cancelScheduled = true;
  if (query.cancelScheduled === 'false') filters.cancelScheduled = false;
  if (query.excludeTest === 'true') filters.excludeTest = true;
  return filters;
}

// GET /api/admin/subscriptions
router.get('/', requirePermission('subscriptions.read'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20', ...rest } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const filters = parseFilters(rest);
    const where = await buildSubscriptionWhere(filters);

    const [rows, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: SUBSCRIPTION_LIST_SELECT,
      }),
      prisma.subscription.count({ where }),
    ]);

    const result = await enrichSubscriptions(rows);
    res.json({ subscriptions: result, total, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/subscriptions/export — same filters, no pagination, no payment
// aggregation per row to keep the query light. Used by the CSV button so the
// admin gets the full filtered set rather than just the visible page.
router.get('/export', requirePermission('subscriptions.read'), async (req, res, next) => {
  try {
    const filters = parseFilters(req.query as Record<string, string>);
    const where = await buildSubscriptionWhere(filters);

    // Cap export size — admins should refine filters before exporting larger
    // sets. 5000 covers 99% of practical exports without risking a slow query.
    // Fetch one extra row so we can disambiguate "exactly at limit" (no
    // truncation) from "more rows exist past the limit" (truncated).
    const EXPORT_HARD_LIMIT = 5000;
    const rows = await prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_HARD_LIMIT + 1,
      select: SUBSCRIPTION_LIST_SELECT,
    });

    const truncated = rows.length > EXPORT_HARD_LIMIT;
    const cappedRows = truncated ? rows.slice(0, EXPORT_HARD_LIMIT) : rows;
    const result = await enrichSubscriptions(cappedRows);
    res.json({
      subscriptions: result,
      total: result.length,
      truncated,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/subscriptions/user/:userId/history — full list of every
// subscription ever held by one user, oldest first. Powers the "history"
// drawer per spec §4.2 ("Един потребител може да има история от различни
// абонаменти във времето").
router.get('/user/:userId/history', requirePermission('subscriptions.read'), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: SUBSCRIPTION_LIST_SELECT,
    });

    // Transaction rows of type SUBSCRIPTION don't carry a foreign key to the
    // Subscription row (each Subscription is the rolling current-period state,
    // not a per-charge ledger), so we aggregate at user level rather than
    // per-row. The drawer surfaces this as a header summary instead of a
    // misleading per-row count derived from a fuzzy createdAt window.
    const userPaymentAgg = await prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: TransactionType.SUBSCRIPTION,
        status: TransactionStatus.COMPLETED,
      },
      _count: { _all: true },
      _sum: { amount: true },
      _max: { createdAt: true },
    });

    const result = subscriptions.map((s) => ({
      id: s.id,
      plan: s.plan,
      status: s.status,
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      cancelAt: s.cancelAt,
      canceledAt: s.canceledAt,
      autoRenewal: s.autoRenewal,
      stripeSubscriptionId: s.stripeSubscriptionId,
      payseraOrderId: s.payseraOrderId,
      createdAt: s.createdAt,
      billingCycle: billingCycleFromPeriod(s.currentPeriodStart, s.currentPeriodEnd),
      planDisplayName: planDisplayName(s.plan),
    }));

    res.json({
      user: { ...user, isTest: isTestEmail(user.email) },
      subscriptions: result,
      paymentSummary: {
        count: userPaymentAgg._count._all,
        totalAmount: userPaymentAgg._sum.amount ?? 0,
        lastPaymentAt: userPaymentAgg._max.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscriptions/:id/cancel — cancel at period end
router.post('/:id/cancel', requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (subscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Subscription is already scheduled for cancellation' });
    }
    if (
      subscription.status === 'CANCELLED' ||
      subscription.status === 'EXPIRED' ||
      subscription.status === 'INCOMPLETE_EXPIRED'
    ) {
      return res.status(400).json({ error: 'Cannot cancel a terminated subscription' });
    }
    // Preserve any pre-existing canceledAt — re-cancelling a row that was
    // already PAUSED with canceledAt set must NOT bump the timestamp, since
    // the Paysera grace-period job uses canceledAt as the EXPIRED-vs-CANCELLED
    // discriminator and we want the original cancellation moment to win.
    const canceledAt = subscription.canceledAt ?? new Date();

    // DB-first: commit the TOCTOU guard before touching any external system.
    // For Stripe rows, currentPeriodEnd is used as the initial cancelAt estimate
    // (Stripe agrees in the vast majority of cases); we patch below only if Stripe
    // returns a materially different date (e.g. custom billing anchor).
    const result = await prisma.subscription.updateMany({
      where: {
        id: req.params.id,
        cancelAtPeriodEnd: false,
        status: { notIn: ['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED'] },
      },
      data: {
        cancelAtPeriodEnd: true,
        cancelAt: subscription.currentPeriodEnd,
        canceledAt,
      },
    });
    if (result.count === 0) {
      return res.status(409).json({ error: 'Subscription state changed concurrently — please refresh' });
    }

    if (subscription.stripeSubscriptionId) {
      try {
        const stripeSub = await stripeService.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: true },
        );
        // Patch cancelAt only when Stripe returns a meaningfully different date.
        const stripeDate = stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null;
        if (stripeDate && Math.abs(stripeDate.getTime() - subscription.currentPeriodEnd.getTime()) > 60_000) {
          await prisma.subscription.update({
            where: { id: req.params.id },
            data: { cancelAt: stripeDate },
          });
        }
      } catch (stripeErr) {
        // Stripe was not touched before this block — roll back DB to keep both in sync.
        await prisma.subscription.updateMany({
          where: { id: req.params.id, cancelAtPeriodEnd: true },
          data: { cancelAtPeriodEnd: false, cancelAt: null, canceledAt: subscription.canceledAt },
        });
        throw stripeErr;
      }
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscriptions/:id/reactivate — remove scheduled cancellation.
// Reactivate is the inverse of /cancel: it un-schedules the period-end cancel.
// It does NOT unpause a PAUSED row (which means "the period already lapsed");
// admins who want to bring a PAUSED row back to ACTIVE must use /resume, which
// also rolls the billing period forward.
router.post('/:id/reactivate', requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (
      !subscription.cancelAtPeriodEnd ||
      subscription.status === 'CANCELLED' ||
      subscription.status === 'EXPIRED' ||
      subscription.status === 'INCOMPLETE_EXPIRED' ||
      subscription.status === 'PAUSED'
    ) {
      return res.status(400).json({
        error: subscription.status === 'PAUSED'
          ? 'Subscription is paused — use /resume instead of /reactivate'
          : 'Subscription is not scheduled for cancellation',
      });
    }

    // DB-first: commit the TOCTOU guard before calling Stripe so a concurrent-
    // conflict miss returns 409 without touching any external system.
    // Reactivate clears the cancellation but preserves the user's stored
    // autoRenewal preference. Forcing autoRenewal=true here was a regression:
    // a user who turned auto-off and was then cancelled would be re-enrolled
    // by a reactivation, contradicting their original intent.
    const result = await prisma.subscription.updateMany({
      where: {
        id: req.params.id,
        cancelAtPeriodEnd: true,
        status: { notIn: ['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED', 'PAUSED'] },
      },
      data: {
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
      },
    });
    if (result.count === 0) {
      return res.status(409).json({ error: 'Subscription state changed concurrently — please refresh' });
    }

    if (subscription.stripeSubscriptionId) {
      try {
        await stripeService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
      } catch (stripeErr) {
        // Stripe was not reached before this block — roll back DB to keep both in sync.
        await prisma.subscription.updateMany({
          where: { id: req.params.id, cancelAtPeriodEnd: false },
          data: {
            cancelAtPeriodEnd: true,
            cancelAt: subscription.cancelAt,
            canceledAt: subscription.canceledAt,
          },
        });
        throw stripeErr;
      }
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscriptions/:id/resume — resume a PAUSED subscription.
//
// For Stripe rows we trust Stripe's resumed-status response. For Paysera rows
// we must additionally:
//   (a) advance currentPeriodEnd by one billing period — otherwise the next
//       paysera-renewal cron pass immediately re-PAUSES the row (it matches
//       on currentPeriodEnd <= now).
//   (b) clear gracePeriodEndsAt and any stale canceledAt so the
//       canceledAt-as-EXPIRED-vs-CANCELLED discriminator stays correct on
//       the next natural lapse.
router.post('/:id/resume', requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (subscription.status !== 'PAUSED') {
      return res.status(400).json({ error: 'Subscription is not paused' });
    }

    if (subscription.stripeSubscriptionId) {
      // DB-first: write optimistic ACTIVE before calling Stripe. Stripe's resume is
      // NOT idempotent — a second call on an already-active sub throws — so the TOCTOU
      // guard must prevent the concurrent caller from reaching the Stripe API at all.
      const result = await prisma.subscription.updateMany({
        where: { id: req.params.id, status: 'PAUSED' },
        data: {
          status: SubscriptionStatus.ACTIVE,
          gracePeriodEndsAt: null,
          canceledAt: null,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          retryAttempt: 0,
        },
      });
      if (result.count === 0) {
        return res.status(409).json({ error: 'Subscription state changed concurrently — please refresh' });
      }

      let nextStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE;
      let patchPeriodStart: Date | undefined;
      let patchPeriodEnd: Date | undefined;

      try {
        const resumed = await stripeService.stripe.subscriptions.resume(subscription.stripeSubscriptionId);
        // Map Stripe's returned status — resume can land on past_due/unpaid if a
        // delinquent invoice surfaces, in which case our DB row should reflect
        // that, not optimistically claim ACTIVE.
        const map: Record<string, SubscriptionStatus | undefined> = {
          active: SubscriptionStatus.ACTIVE,
          trialing: SubscriptionStatus.TRIALING,
          past_due: SubscriptionStatus.PAST_DUE,
          unpaid: SubscriptionStatus.UNPAID,
          canceled: SubscriptionStatus.CANCELLED,
        };
        nextStatus = map[resumed.status] ?? SubscriptionStatus.ACTIVE;
        if (resumed.current_period_start) patchPeriodStart = new Date(resumed.current_period_start * 1000);
        if (resumed.current_period_end) patchPeriodEnd = new Date(resumed.current_period_end * 1000);
      } catch (stripeErr) {
        // Stripe call failed — the sub is still paused in Stripe. Roll back DB.
        await prisma.subscription.updateMany({
          where: { id: req.params.id, status: SubscriptionStatus.ACTIVE },
          data: {
            status: 'PAUSED',
            gracePeriodEndsAt: subscription.gracePeriodEndsAt,
            canceledAt: subscription.canceledAt,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            cancelAt: subscription.cancelAt,
            retryAttempt: subscription.retryAttempt,
          },
        });
        throw stripeErr;
      }

      // Mirror Stripe's authoritative period + status back. Also corrects status when
      // Stripe lands on past_due/unpaid rather than the optimistic ACTIVE we wrote above.
      await prisma.subscription.update({
        where: { id: req.params.id },
        data: {
          status: nextStatus,
          ...(patchPeriodStart && { currentPeriodStart: patchPeriodStart }),
          ...(patchPeriodEnd && { currentPeriodEnd: patchPeriodEnd }),
        },
      });

      return res.json({ ok: true, status: nextStatus });
    } else {
      // Paysera resume — manual roll forward. We don't have a payment event to
      // anchor on, so use now() as the new period start and add one billing
      // period derived from metadata.billingPeriod (mirrors the same lookup in
      // paysera-renewal.ts).
      const start = new Date();
      let weeks = 4; // monthly default
      try {
        const meta = subscription.metadata ? JSON.parse(subscription.metadata) : {};
        const billingPeriod = String(meta.billingPeriod ?? '').toLowerCase();
        if (billingPeriod.includes('week')) weeks = 1;
        else if (billingPeriod.includes('year')) weeks = 52;
      } catch {
        // ignore, keep monthly default
      }
      const nextPeriodStart = start;
      const nextPeriodEnd = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

      const result = await prisma.subscription.updateMany({
        where: { id: req.params.id, status: 'PAUSED' },
        data: {
          status: SubscriptionStatus.ACTIVE,
          gracePeriodEndsAt: null,
          canceledAt: null,
          cancelAtPeriodEnd: false,
          cancelAt: null,
          retryAttempt: 0,
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
        },
      });
      if (result.count === 0) {
        return res.status(409).json({ error: 'Subscription state changed concurrently — please refresh' });
      }

      return res.json({ ok: true, status: SubscriptionStatus.ACTIVE });
    }
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscriptions/:id/auto-renewal — toggle auto-renewal as a
// pure preference flag. Does NOT schedule cancellation; admins who want that
// must use the Cancel action explicitly. The previous behaviour (set
// cancelAtPeriodEnd=true on disable) collapsed two distinct actions into one
// and made the row's auto-renewal pill effectively read-only after the first
// disable, since "Reactivate" was the only way back.
router.patch('/:id/auto-renewal', requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { autoRenewal } = req.body;
    if (typeof autoRenewal !== 'boolean') {
      return res.status(400).json({ error: 'autoRenewal must be a boolean' });
    }
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (
      subscription.status === 'CANCELLED' ||
      subscription.status === 'EXPIRED' ||
      subscription.status === 'INCOMPLETE_EXPIRED'
    ) {
      return res.status(400).json({ error: 'Cannot modify auto-renewal for a terminated subscription' });
    }

    // For Stripe subs the toggle still corresponds to cancel_at_period_end —
    // that's how Stripe models "do not renew." But our DB row distinguishes
    // the cases: cancelAtPeriodEnd is set ONLY when the user explicitly
    // cancels via /cancel. Toggling auto-renewal off here just records the
    // preference; the ensuing period-end behaviour is handled by the renewal
    // cron (Paysera) or by Stripe itself once the user runs out of funds.
    if (subscription.stripeSubscriptionId) {
      await stripeService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: !autoRenewal,
      });
    }

    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { autoRenewal },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
