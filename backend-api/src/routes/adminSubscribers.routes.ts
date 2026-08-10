import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware, writeAudit } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';
import { notificationService } from '../services/notification.service';
import { getSubscriberCashbackEntries } from '../services/adminCashback.service';
import { computeRiskForUsers, persistRiskAssessments } from '../services/userRisk.service';
import { planDisplayName } from '../utils/planDisplayName';
import { logger } from '../utils/logger';
import { getClientIp } from '../utils/requestIp';
import { parsePagination } from '../utils/pagination';
import { detach } from '../utils/detach';

const router = Router();
router.use(auditMiddleware);

type SubWhere = Parameters<typeof prisma.subscription.findMany>[0]['where'];
type UserWhere = Parameters<typeof prisma.user.findMany>[0]['where'];

const SUBSCRIBER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  status: true,
  deletedAt: true,
  riskScore: true,
  riskBucket: true,
  // §4.1 / M1 — when an admin manually edits a subscriber's risk profile we stamp
  // riskOverriddenAt so the periodic behaviour recompute does NOT clobber it. The
  // list GET must read this flag to decide whether to display the stored override
  // value or the freshly computed one.
  riskOverriddenAt: true,
  lastLoginAt: true,
  lastActivityAt: true,
  ibanLastChangedAt: true,
  createdAt: true,
  wallet: {
    select: { availableBalance: true, balance: true, pendingBalance: true },
  },
} as const;

function buildSubscriberQuery(q: Record<string, string | undefined>) {
  const { search, plan, status, accountStatus, riskLevel, dateFrom, dateTo, ibanChangedAfter } = q;
  const where: UserWhere = { role: 'USER' };

  const subFilter: Record<string, unknown> = {};
  if (plan && Object.values(SubscriptionPlan).includes(plan as SubscriptionPlan)) {
    subFilter.plan = plan as SubscriptionPlan;
  }
  // Accept either a single status (legacy) or a comma-separated list to support
  // dashboard StatCard presets that union multiple statuses (e.g. "Изтекли+спрени"
  // = CANCELLED+EXPIRED+INCOMPLETE_EXPIRED). Reject unknown values silently —
  // narrows the filter rather than producing a Prisma type error.
  if (status) {
    const statuses = status
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is SubscriptionStatus =>
        Object.values(SubscriptionStatus).includes(s as SubscriptionStatus),
      );
    if (statuses.length === 1) {
      subFilter.status = statuses[0];
    } else if (statuses.length > 1) {
      subFilter.status = { in: statuses };
    }
  }
  const hasSubFilter = Object.keys(subFilter).length > 0;
  // NOTE: subscription filtering is intentionally NOT applied to `where` here.
  // The route handlers call resolveLatestSubUserIds() instead, which restricts
  // results to users whose *current* (most recent) subscription matches — not
  // any historical subscription. This prevents e.g. a user who once had BASIC
  // and now has PREMIUM from appearing in the BASIC plan filter.

  // Date range applies to user.createdAt (account registration) so that
  // never-subscribed users are not silently dropped from the result.
  // DEFECT A fix: validate dates to return 400 on invalid input (not 500).
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (isNaN(from.getTime())) {
        throw { status: 400, msg: 'dateFrom must be a valid date' };
      }
      createdAt.gte = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (isNaN(to.getTime())) {
        throw { status: 400, msg: 'dateTo must be a valid date' };
      }
      to.setUTCHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  // Spec §1.1 — valid user_account_status values: Active, Inactive, Archived.
  // ARCHIVED is included so admins can filter/view Archived users. Also accept
  // SUSPENDED and PENDING_* as implementation extensions (see spec note).
  if (accountStatus === 'ACTIVE' || accountStatus === 'SUSPENDED' || accountStatus === 'PENDING_VERIFICATION' || accountStatus === 'PENDING_PAYMENT' || accountStatus === 'INACTIVE' || accountStatus === 'ARCHIVED') {
    where.status = accountStatus as any;
    where.deletedAt = null;
  } else if (accountStatus === 'DELETED') {
    where.deletedAt = { not: null };
  }

  // Spec §2.1 Clash 5.1 — additive risk thresholds: 0–20 Low, 21–50 Medium, 51+ High.
  //
  // L3 — EVENTUAL-CONSISTENCY NOTE: this filter runs in Postgres against the
  // *stored* User.riskScore, but the GET handler recomputes a fresh behaviour-
  // based score for each visible row (non-overridden rows only) and may show a
  // value that differs from the stored one. The recompute is page-scoped and
  // post-query by design (cheap: one groupBy per rule over ≤ limit users), so we
  // cannot filter on it at the DB level without recomputing the entire universe
  // before pagination — which would defeat that design and the count/total math.
  // Instead the handler persists the recomputed scores asynchronously
  // (persistRiskAssessments) and the daily sweep (jobs/user-risk-sweep.ts) writes
  // any rows missed, so the stored value the filter reads converges to the shown
  // value. Until convergence a row can transiently appear in / drop out of a
  // riskLevel filter relative to its displayed score. Overridden rows are exempt
  // (their stored value is authoritative and is what is shown), so for them the
  // filter and the display always agree.
  if (riskLevel === 'low') where.riskScore = { lte: 20 };
  else if (riskLevel === 'medium') where.riskScore = { gt: 20, lte: 50 };
  else if (riskLevel === 'high') where.riskScore = { gt: 50 };

  // ibanChangedAfter: used by the suspicious_iban_changes alert deep-link to
  // filter the subscriber list to users who changed IBAN within the alert window.
  // The alert counts only users with wallet.balance > 0 (operationally interesting);
  // we mirror that guard here so page row count matches the alert badge.
  if (ibanChangedAfter) {
    const from = new Date(ibanChangedAfter);
    if (!isNaN(from.getTime())) {
      where.ibanLastChangedAt = { gte: from };
      where.wallet = { balance: { gt: 0 } };
    }
  }

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { iban: { contains: search, mode: 'insensitive' } },
    ];
  }

  return { where, subFilter, hasSubFilter };
}

// Returns user IDs whose LATEST (most recent) subscription matches subFilter.
// Two-query strategy:
//   1. Cheap indexed scan to find candidates with any matching subscription.
//   2. Fetch the absolute latest subscription per candidate and JS-filter so
//      only users whose *current* plan/status matches are included.
// This is correct for plan-change scenarios: a user who had BASIC then upgraded
// to PREMIUM should not appear in the BASIC plan filter.
//
// Cap at MAX_CANDIDATES so a high-cardinality status preset (e.g. EXPIRED across
// all historical subscribers) doesn't push tens of thousands of UUIDs through
// the IN-clause and degrade Postgres query planning. Since results are sorted
// by user.createdAt and paginated client-side, an exhaustive scan is unnecessary;
// we surface a truncation header so callers know the universe was capped.
const MAX_CANDIDATES = 10_000;
async function resolveLatestSubUserIds(
  subFilter: Record<string, unknown>,
): Promise<{ userIds: string[]; truncated: boolean }> {
  // orderBy is REQUIRED for the truncated slice to be reproducible across
  // requests. Without it Postgres returns rows in planner-arbitrary order, so
  // page-1 and page-2 of the same /subscribers query could resolve to different
  // candidate sets when total > MAX_CANDIDATES — users would visibly disappear /
  // re-appear across pages. Sorting by userId (the distinct column, also the
  // PK) is cheap and stable. Postgres requires distinct + orderBy to share the
  // leading column, which is satisfied here.
  const candidates = await prisma.subscription.findMany({
    where: subFilter as SubWhere,
    select: { userId: true },
    distinct: ['userId'],
    orderBy: { userId: 'asc' },
    take: MAX_CANDIDATES + 1, // fetch one extra to detect truncation
  });
  if (candidates.length === 0) return { userIds: [], truncated: false };
  const truncated = candidates.length > MAX_CANDIDATES;
  const candidateIds = (truncated ? candidates.slice(0, MAX_CANDIDATES) : candidates).map((s) => s.userId);

  const latestSubs = await prisma.subscription.findMany({
    where: { userId: { in: candidateIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['userId'],
    select: { userId: true, plan: true, status: true },
  });

  // subFilter.status may be a single value OR a Prisma `{ in: [...] }` clause
  // when the route accepts a multi-status preset (dashboard StatCards).
  const statusMatches = (s: SubscriptionStatus): boolean => {
    if (!subFilter.status) return true;
    if (typeof subFilter.status === 'string') return s === subFilter.status;
    const inClause = subFilter.status as { in?: SubscriptionStatus[] };
    return Array.isArray(inClause.in) ? inClause.in.includes(s) : true;
  };
  const userIds = latestSubs
    .filter((s) => {
      if (subFilter.plan && s.plan !== subFilter.plan) return false;
      if (!statusMatches(s.status as SubscriptionStatus)) return false;
      return true;
    })
    .map((s) => s.userId);
  return { userIds, truncated };
}

// Return the latest subscription with no filter — the outer query has already
// constrained the user set via resolveLatestSubUserIds, so we surface the actual
// latest subscription for each result row (not a filtered view).
function subscriptionInclude() {
  return {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      plan: true,
      status: true,
      currentPeriodEnd: true,
      autoRenewal: true,
      canceledAt: true,
      createdAt: true,
      failedPaymentAt: true,
      failedPaymentClearedAt: true,
    },
  };
}

function flattenSubscriber<T extends { subscriptions: Array<{ plan: SubscriptionPlan } & Record<string, unknown>> }>(u: T) {
  const { subscriptions, ...rest } = u;
  const sub = subscriptions[0] ?? null;
  return {
    ...rest,
    subscription: sub ? { ...sub, planDisplayName: planDisplayName(sub.plan) } : null,
  };
}

// GET /api/admin/subscribers?page=1&limit=20&search=...&plan=BASIC&status=ACTIVE&accountStatus=ACTIVE&riskLevel=high&dateFrom=...&dateTo=...&sortBy=lastActivityAt&sortOrder=desc
// "Абонати" = user profile management: user-centric view with subscription summary
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    const { sortBy, sortOrder, ...filters } = req.query as Record<string, string>;
    const { skip, page: pageNum, limit: limitNum } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    let queryResult: ReturnType<typeof buildSubscriberQuery>;
    try {
      queryResult = buildSubscriberQuery(filters);
    } catch (e: any) {
      return res.status(e.status ?? 400).json({ error: e.msg ?? 'Invalid query parameters' });
    }
    const { where, subFilter, hasSubFilter } = queryResult;

    // Subscription plan/status filter: restrict to users whose LATEST subscription
    // matches — not any historical one. resolveLatestSubUserIds() handles this via
    // a two-query strategy; we then fold the result into where.id.
    let truncatedCandidates = false;
    if (hasSubFilter) {
      const resolved = await resolveLatestSubUserIds(subFilter);
      where.id = { in: resolved.userIds };
      truncatedCandidates = resolved.truncated;
    }

    // Null-last ordering for lastActivityAt: rows where the field is NULL sink to
    // the bottom regardless of sort direction, so "most recently active" always
    // surfaces real activity at the top and unverified/never-active accounts at
    // the bottom.
    const dir = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Parameters<typeof prisma.user.findMany>[0]['orderBy'] =
      sortBy === 'lastActivityAt'
        ? [{ lastActivityAt: { sort: dir, nulls: 'last' } }, { createdAt: 'desc' }]
        : { createdAt: dir };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        select: {
          ...SUBSCRIBER_SELECT,
          subscriptions: subscriptionInclude(),
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Spec §4.1 — Risk column must reflect a behaviour-based score, not the
    // never-updated DB default. Recompute for the visible page only (cheap; one
    // groupBy per rule across ≤ limit users) and persist so filters converge.
    const flat = users.map(flattenSubscriber);
    // M1 — surface the override as a boolean and drop the raw internal timestamp
    // from the response shape (rows don't otherwise expose internal timestamps).
    // For overridden rows we keep the stored DB risk values; non-overridden rows
    // get the fresh behaviour-based score below.
    let subscribers = flat.map((s) => {
      const { riskOverriddenAt, wallet, ...rest } = s;
      const { availableBalance = 0, balance = 0, pendingBalance = 0 } = wallet ?? {};
      return {
        ...rest,
        riskOverridden: !!riskOverriddenAt,
        wallet: {
          availableBalance,
          balance,
          pendingBalance,
        },
      };
    });
    try {
      const assessments = await computeRiskForUsers(
        users.map((u) => ({ id: u.id, createdAt: u.createdAt, ibanLastChangedAt: u.ibanLastChangedAt })),
      );
      subscribers = subscribers.map((s) => {
        // Admin manual risk edits are durable: for overridden rows KEEP the stored
        // DB risk values (already carried through flattenSubscriber) and ignore the
        // recomputed assessment. Only non-overridden rows get the fresh score.
        if (s.riskOverridden) return s;
        const a = assessments.get(s.id);
        return a ? { ...s, riskScore: a.score, riskBucket: a.bucket } : s;
      });
      // Persist asynchronously so the response isn't blocked on writes.
      // Fire-and-forget is acceptable here: persistence runs sequentially
      // across PERSIST_CONCURRENCY chunks and may be cut short by a worker
      // restart between chunks. The next admin GET (or the daily sweep in
      // jobs/user-risk-sweep.ts) recomputes the same assessments and writes
      // any users that were missed, so the failure mode self-heals.
      detach(persistRiskAssessments(Array.from(assessments.values())), () => {});
    } catch {
      // Computation failure must not break the list — fall back to stored values.
    }

    if (truncatedCandidates) {
      res.setHeader('X-Truncated-Result', `candidates capped at ${MAX_CANDIDATES}`);
    }
    res.json({ subscribers, total, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/subscribers/export — full result set for CSV export, capped at EXPORT_MAX
const EXPORT_MAX = 10000;
router.get('/export', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    let queryResult: ReturnType<typeof buildSubscriberQuery>;
    try {
      queryResult = buildSubscriberQuery(req.query as Record<string, string>);
    } catch (e: any) {
      return res.status(e.status ?? 400).json({ error: e.msg ?? 'Invalid query parameters' });
    }
    const { where, subFilter, hasSubFilter } = queryResult;
    let truncatedCandidates = false;
    if (hasSubFilter) {
      const resolved = await resolveLatestSubUserIds(subFilter);
      where.id = { in: resolved.userIds };
      truncatedCandidates = resolved.truncated;
    }

    const users = await prisma.user.findMany({
      where,
      take: EXPORT_MAX,
      orderBy: { createdAt: 'desc' },
      select: {
        ...SUBSCRIBER_SELECT,
        subscriptions: subscriptionInclude(),
      },
    });
    if (truncatedCandidates) {
      res.setHeader('X-Truncated-Result', `candidates capped at ${MAX_CANDIDATES}`);
    }
    // Mirror the list GET convention: expose the override as a boolean and drop the
    // raw internal riskOverriddenAt timestamp from the response shape.
    const subscribers = users.map(flattenSubscriber).map((s) => {
      const { riskOverriddenAt, wallet, ...rest } = s as typeof s & { riskOverriddenAt?: Date | null };
      const { availableBalance = 0, balance = 0, pendingBalance = 0 } = wallet ?? {};
      return {
        ...rest,
        riskOverridden: !!riskOverriddenAt,
        wallet: {
          availableBalance,
          balance,
          pendingBalance,
        },
      };
    });
    res.json({ subscribers, limit: EXPORT_MAX });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/subscribers/:userId/cashback — entry-based cashback for a subscriber (spec §4.4)
// Mirror of GET /api/admin/cashback/subscriber/:userId, placed here so the Абонати
// section navigation can reach cashback entries without leaving the subscriber domain.
router.get('/:userId/cashback', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

    const result = await getSubscriberCashbackEntries(userId, page, limit);

    detach(writeAudit({
      actorUserId: (req as AuthRequest).user?.id ?? null,
      action: 'subscriber.cashback.view',
      objectType: 'cashback',
      objectId: userId,
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }), () => {});

    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error?.statusCode === 404) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

// GET /api/admin/subscribers/:userId — individual subscriber detail (#8)
router.get('/:userId', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        // §3.2 — address is an admin-editable field and the profile PATCH writes
        // it, so the detail GET must return it for the UI to prefill before edit.
        address: true,
        iban: true,
        role: true,
        status: true,
        deletedAt: true,
        riskScore: true,
        riskBucket: true,
        createdAt: true,
        lastLoginAt: true,
        lastActivityAt: true,
        marketingConsent: true,
        preferredLanguage: true,
        wallet: {
          select: {
            availableBalance: true,
            balance: true,
            pendingBalance: true,
          },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            plan: true,
            status: true,
            currentPeriodEnd: true,
            autoRenewal: true,
            cancelAtPeriodEnd: true,
            cancelAt: true,
            canceledAt: true,
            createdAt: true,
            metadata: true,
            failedPaymentAt: true,
            failedPaymentClearedAt: true,
          },
        },
      },
    });

    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const { wallet, ...restUser } = user;
    const { availableBalance = 0, balance = 0, pendingBalance = 0 } = wallet ?? {};

    // Enrich each subscription with a human-readable plan name (PREMIUM_WEEKLY → "Premium Weekly")
    const enriched = {
      ...restUser,
      wallet: {
        availableBalance,
        balance,
        pendingBalance,
      },
      subscriptions: user.subscriptions.map((s) => ({
        ...s,
        planDisplayName: planDisplayName(s.plan),
      })),
    };

    const actorReq = req as AuthRequest;
    detach(writeAudit({
      actorUserId: actorReq.user?.id ?? null,
      action: 'subscriber.view',
      objectType: 'subscriber',
      objectId: userId,
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }), () => {});

    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscribers/:userId/status — change a subscriber's account status.
// Spec §1.1 — valid user_account_status values: Active, Inactive, Archived.
//   ACTIVE   → Normal operation; scanning allowed.
//   INACTIVE → Temporary pause; login allowed, scanning blocked.
//   ARCHIVED → Terminal for operational purposes; no login, no scanning.
// Spec §6.6 Clash 6.6 — users are NOT notified of account status changes (intentional).
// DEFECT B fix: ARCHIVED is terminal — cannot flip back to ACTIVE/INACTIVE.
// Spec §11.4 / Clash 11.4 — SUSPENDED is an intermediate state triggered by 5+ password
// resets in 24h; it represents "account suspension PENDING SUPER ADMIN REVIEW". Only
// SUPER_ADMIN can lift this state (change from SUSPENDED to ACTIVE). A non-SA admin
// attempting to lift SUSPENDED receives 403. On valid lift, an audit record is written.
router.patch('/:userId/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.write'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body as { status?: string };
    const actorRole = req.user?.role;
    const actorId = req.user?.id;

    // Spec §1.1 — only the three canonical statuses are allowed for new updates.
    if (status !== 'ACTIVE' && status !== 'INACTIVE' && status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'status must be ACTIVE, INACTIVE, or ARCHIVED' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    if (user.deletedAt) {
      return res.status(400).json({ error: 'Cannot change status of a deleted account' });
    }
    // DELETED status can only be revived via the /restore endpoint (requires subscribers.delete permission).
    // This guard prevents lower-tier admins (subscribers.write) from reviving DELETED accounts.
    if (user.status === 'DELETED') {
      return res.status(400).json({ error: 'Use the restore endpoint to revive a deleted account' });
    }
    // ARCHIVED is terminal: once a user enters ARCHIVED state, they cannot be reverted to ACTIVE or INACTIVE.
    if (user.status === 'ARCHIVED' && status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'Cannot revert an archived account to ACTIVE or INACTIVE. Archived accounts are terminal.' });
    }
    // Spec §11.4 / Clash 11.4 — SUSPENDED state (password reset abuse lockout) is a
    // "pending Super Admin review" state. Only SUPER_ADMIN can lift it. Standard admins
    // with subscribers.write cannot clear SUSPENDED accounts.
    if ((user.status as string) === 'SUSPENDED' && actorRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Super Admin can change a suspended account. This state requires Super Admin review.' });
    }

    const previousStatus = user.status;
    const [updated] = await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { status: status as any },
        select: { id: true, status: true },
      }),
      // Spec §1.1: INACTIVE users can log in — do NOT revoke their sessions.
      // ARCHIVED and SUSPENDED->ACTIVE transitions are terminal no-login states that
      // require immediate session revocation to enforce the lockout.
      (status === 'ARCHIVED' || (previousStatus === 'SUSPENDED' && status === 'ACTIVE'))
        ? prisma.refreshToken.deleteMany({ where: { userId } })
        : Promise.resolve(),
      // Write audit record when SUPER_ADMIN lifts SUSPENDED state.
      previousStatus === 'SUSPENDED' && status === 'ACTIVE' && actorId
        ? writeAudit({
            actorUserId: actorId,
            action: 'subscriber.status.lift-suspension',
            objectType: 'subscriber',
            objectId: userId,
            before: { status: previousStatus },
            after: { status },
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'] as string | undefined ?? null,
          })
        : Promise.resolve(),
    ]);

    res.json({ ok: true, ...updated });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscribers/:userId/profile — edit a subscriber's profile.
// Spec §1.1 / §3.2 "Editable Fields": admin may edit profile (name, email, phone,
// address, IBAN) and the risk profile (risk bucket/score). Account status has its
// own endpoint (PATCH /status); subscription/cashback history is view-only here.
//
// Fields are all OPTIONAL — only the keys present in the body are updated (PATCH
// semantics). Risk bucket and score are kept in sync: setting one without the
// other re-derives the missing value from the spec §2.1 thresholds so the stored
// riskScore/riskBucket pair never drifts.
//
// IBAN authority (schema note): Wallet.payoutIban is the authoritative payout IBAN;
// User.iban is a legacy mirror. We write BOTH for consistency and stamp
// User.ibanLastChangedAt (a §2.1 risk signal) when the IBAN value actually changes.
const IBAN_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const RISK_BUCKETS = ['LOW_0_20', 'MEDIUM_21_50', 'HIGH_51_PLUS'] as const;
type RiskBucketValue = (typeof RISK_BUCKETS)[number];

function bucketForScore(score: number): RiskBucketValue {
  if (score <= 20) return 'LOW_0_20';
  if (score <= 50) return 'MEDIUM_21_50';
  return 'HIGH_51_PLUS';
}

router.patch('/:userId/profile', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const body = (req.body ?? {}) as {
      firstName?: unknown;
      lastName?: unknown;
      email?: unknown;
      phone?: unknown;
      address?: unknown;
      iban?: unknown;
      riskBucket?: unknown;
      riskScore?: unknown;
      // M1 clear-override contract: `riskOverride: false` reverts the subscriber to
      // automatic behaviour-based recompute (clears riskOverriddenAt/By) WITHOUT
      // requiring a score/bucket. It must be a strict boolean; only `false` clears,
      // `true` is a no-op (the override is set implicitly when a risk value is
      // edited, not via this flag). Any non-boolean is rejected.
      riskOverride?: unknown;
    };

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { wallet: { select: { id: true } } } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    if (user.deletedAt) {
      return res.status(400).json({ error: 'Cannot edit a deleted account' });
    }
    // DEFECT D fix: ARCHIVED accounts are terminal — no profile/IBAN edits allowed
    // (except risk profile, which is allowed per spec §3.2 to enable compliance workflows).
    // Check if ANY profile field (not risk-only) is being edited.
    const hasProfileEdit = body.firstName !== undefined || body.lastName !== undefined ||
      body.email !== undefined || body.phone !== undefined || body.address !== undefined ||
      body.iban !== undefined;
    if (user.status === 'ARCHIVED' && hasProfileEdit) {
      return res.status(400).json({ error: 'Cannot edit profile fields on an archived account. Archived accounts are terminal.' });
    }

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};

    // --- Name ---
    const validateOptionalString = (v: unknown, field: string, max: number): string | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      if (typeof v !== 'string') throw { status: 400, msg: `${field} must be a string` };
      const trimmed = v.trim();
      if (trimmed.length > max) throw { status: 400, msg: `${field} is too long (max ${max})` };
      return trimmed;
    };

    try {
      const firstName = validateOptionalString(body.firstName, 'firstName', 100);
      if (firstName !== undefined) { data.firstName = firstName; before.firstName = user.firstName; }
      const lastName = validateOptionalString(body.lastName, 'lastName', 100);
      if (lastName !== undefined) { data.lastName = lastName; before.lastName = user.lastName; }
      const phone = validateOptionalString(body.phone, 'phone', 32);
      if (phone !== undefined) { data.phone = phone; before.phone = user.phone; }
      const address = validateOptionalString(body.address, 'address', 500);
      if (address !== undefined) { data.address = address; before.address = user.address; }
    } catch (e: any) {
      return res.status(e.status ?? 400).json({ error: e.msg ?? 'Invalid field' });
    }

    // --- Email (unique on [email, role]) ---
    if (body.email !== undefined) {
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        return res.status(400).json({ error: 'email must be a valid email address' });
      }
      const normalizedEmail = body.email.trim().toLowerCase();
      if (normalizedEmail !== (user.email ?? '').toLowerCase()) {
        // Composite unique key is [email, role] — a USER email collides only with
        // another USER row. Block to avoid a P2002 surfacing as a 500.
        const collision = await prisma.user.findFirst({
          where: { email: normalizedEmail, role: 'USER', id: { not: userId } },
          select: { id: true },
        });
        if (collision) {
          return res.status(409).json({ error: 'Another subscriber already uses this email' });
        }
        data.email = normalizedEmail;
        before.email = user.email;
        // Changing email invalidates prior verification state — the new address is
        // unverified until re-confirmed. Mirrors the self-service email-change flow.
        data.emailVerified = false;
        data.emailVerifiedAt = null;
      }
    }

    // --- IBAN (authoritative on Wallet.payoutIban; legacy mirror on User.iban) ---
    let newIban: string | null | undefined;
    if (body.iban !== undefined) {
      if (body.iban === null || body.iban === '') {
        newIban = null;
      } else {
        if (typeof body.iban !== 'string') {
          return res.status(400).json({ error: 'iban must be a string' });
        }
        const normalized = body.iban.replace(/\s+/g, '').toUpperCase();
        if (!IBAN_RE.test(normalized)) {
          return res.status(400).json({ error: 'Invalid IBAN format' });
        }
        newIban = normalized;
      }
    }

    // --- Risk profile ---
    // M1 — track whether this request actually writes a risk value. If it does, we
    // stamp riskOverriddenAt/By below so the periodic behaviour recompute
    // (persistRiskAssessments) skips this user and the manual edit is durable.
    let riskValueChanged = false;
    if (body.riskScore !== undefined) {
      const score = Number(body.riskScore);
      // DEFECT C fix: cap at 120 (additive max of five signals; see spec §2.1: IBAN +40, receipt rate +30, location +20, void +20, fraud +10 = 120)
      if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 120) {
        return res.status(400).json({ error: 'riskScore must be an integer between 0 and 120' });
      }
      data.riskScore = score;
      before.riskScore = user.riskScore;
      // Always derive the bucket from the score to ensure the score/bucket pair
      // remains consistent with spec §2.1 (0–20 Low, 21–50 Medium, 51+ High).
      // Any explicit riskBucket in the request body is ignored.
      data.riskBucket = bucketForScore(score);
      before.riskBucket = user.riskBucket;
      riskValueChanged = true;
    }

    // M1 clear-override path: `riskOverride: false` reverts to auto-recompute by
    // clearing the override stamp, independent of any score/bucket edit. Validate
    // strictly (only a boolean is accepted) and record it in the audit before/after.
    let clearRiskOverride = false;
    if (body.riskOverride !== undefined) {
      if (typeof body.riskOverride !== 'boolean') {
        return res.status(400).json({ error: 'riskOverride must be a boolean' });
      }
      if (body.riskOverride === false) {
        clearRiskOverride = true;
      }
    }

    if (riskValueChanged) {
      // An admin manually edited the risk profile — make it durable. The behaviour
      // recompute in persistRiskAssessments skips users whose riskOverriddenAt is
      // set, so the manual value survives the next list GET / daily sweep.
      data.riskOverriddenAt = new Date();
      data.riskOverriddenBy = (req as AuthRequest).user?.id ?? null;
      before.riskOverriddenAt = user.riskOverriddenAt;
      before.riskOverriddenBy = user.riskOverriddenBy;
    } else if (clearRiskOverride) {
      // Revert to automatic recompute. Don't also set it via riskValueChanged — the
      // two paths are mutually exclusive (a value edit re-establishes the override).
      data.riskOverriddenAt = null;
      data.riskOverriddenBy = null;
      before.riskOverriddenAt = user.riskOverriddenAt;
      before.riskOverriddenBy = user.riskOverriddenBy;
    }

    const ibanChanged = newIban !== undefined && newIban !== (user.iban ?? null);
    if (ibanChanged) {
      data.iban = newIban;
      // F1 — NEVER write the raw IBAN (old or new) to the audit log. `writeAudit`
      // persists `before`/`after` verbatim with no redaction (redactSensitive runs
      // only on the auto-middleware path, and `iban` is not a SENSITIVE_KEY). We
      // therefore record only that the IBAN changed — mirroring the scrubbed
      // `after` block — never the cleartext value.
      before.ibanChanged = true;
      data.ibanLastChangedAt = new Date();
    }

    if (Object.keys(data).length === 0 && newIban === undefined) {
      return res.status(400).json({ error: 'No editable fields supplied' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = Object.keys(data).length
        ? await tx.user.update({
            where: { id: userId },
            data: data as any,
            select: {
              id: true, firstName: true, lastName: true, email: true, phone: true,
              address: true, iban: true, riskScore: true, riskBucket: true,
              emailVerified: true,
            },
          })
        : await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
              id: true, firstName: true, lastName: true, email: true, phone: true,
              address: true, iban: true, riskScore: true, riskBucket: true,
              emailVerified: true,
            },
          });
      // Mirror the IBAN to the authoritative Wallet.payoutIban. Upsert so a
      // subscriber without a wallet row still gets the IBAN saved.
      if (ibanChanged) {
        await tx.wallet.upsert({
          where: { userId },
          update: { payoutIban: newIban ?? null },
          create: { userId, balance: 0, availableBalance: 0, pendingBalance: 0, payoutIban: newIban ?? null },
        });
      }
      return u;
    });

    // Spec §10.4 — audit every admin profile mutation with before/after context.
    // IBAN is recorded as changed/unchanged only — never log the raw IBAN value.
    detach(writeAudit({
      actorUserId: (req as AuthRequest).user?.id ?? null,
      action: 'subscriber.profile.update',
      objectType: 'subscriber',
      objectId: userId,
      before,
      after: {
        fields: Object.keys(data).filter((k) => k !== 'emailVerified' && k !== 'emailVerifiedAt' && k !== 'ibanLastChangedAt'),
        ibanChanged,
        emailReverified: data.emailVerified === false ? false : undefined,
      },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }), () => {});

    res.json({ ok: true, subscriber: updated });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscribers/:userId/cancel
// #13 fix: :userId is the subscriber (User) ID — find their active subscription
router.patch('/:userId/cancel', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    // Pick the latest non-terminal subscription. EXPIRED and INCOMPLETE_EXPIRED
    // are also terminal states (spec §4.2 distinguishes natural lapse from
    // user-initiated cancel) so we exclude them too — otherwise we'd stamp
    // canceledAt onto a row whose lapse was natural and silently flip its
    // recorded reason from "Изтекъл" to "Спрян/Отказан".
    //
    // FAILED_PAYMENT is intentionally included: an admin may need to cancel a
    // subscription stuck in failed-payment. It is handled separately below —
    // we set status = CANCELLED immediately rather than using the deferred
    // cancelAtPeriodEnd path (which would leave an abnormal FAILED_PAYMENT row
    // with cancelAt set to a past date until the renewal job next runs).
    // L6 / spec-literal — disambiguate when a subscriber has MORE THAN ONE
    // non-terminal subscription. Picking the latest by createdAt silently guesses
    // which concurrent sub to cancel; that can cancel the wrong one. Return 409 with
    // the candidate IDs so the caller re-issues with an explicit subscriptionId.
    const TERMINAL_SUB_STATUSES = ['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED'] as const;
    const explicitSubId = typeof (req.body as { subscriptionId?: unknown })?.subscriptionId === 'string'
      ? (req.body as { subscriptionId: string }).subscriptionId
      : undefined;
    const candidateSubs = await prisma.subscription.findMany({
      where: { userId, status: { notIn: [...TERMINAL_SUB_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, plan: true, status: true, createdAt: true, currentPeriodEnd: true },
    });
    if (candidateSubs.length === 0) {
      res.status(404).json({ error: 'No active subscription found for this subscriber' });
      return;
    }
    if (candidateSubs.length > 1 && !explicitSubId) {
      res.status(409).json({
        error: 'Subscriber has multiple non-terminal subscriptions. Provide an explicit subscriptionId to disambiguate.',
        candidates: candidateSubs.map((s) => ({
          id: s.id, plan: s.plan, status: s.status,
          createdAt: s.createdAt, currentPeriodEnd: s.currentPeriodEnd,
        })),
      });
      return;
    }
    const chosen = explicitSubId
      ? candidateSubs.find((s) => s.id === explicitSubId)
      : candidateSubs[0];
    if (!chosen) {
      res.status(404).json({ error: 'Specified subscriptionId not found among this subscriber\'s active subscriptions' });
      return;
    }
    const subscription = await prisma.subscription.findUnique({ where: { id: chosen.id } });
    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found for this subscriber' });
      return;
    }

    const now = new Date();

    if (subscription.status === 'FAILED_PAYMENT') {
      // Immediately cancel a failed-payment subscription — there is no active
      // billing period to honour, so the deferred cancelAtPeriodEnd path is
      // inappropriate. For Stripe-backed subs we still inform Stripe so their
      // webhook state stays consistent, but we don't wait for the cancel_at.
      if (subscription.stripeSubscriptionId) {
        await stripeService.stripe.subscriptions.cancel(subscription.stripeSubscriptionId).catch(() => {
          // Best-effort: the Stripe sub may already be cancelled on their side.
        });
      }
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLED',
          canceledAt: now,
          cancelAt: now,
          // BC-ADMIN-SPEC-REAUDIT3-FAILEDPAY-CANCEL-SCANGATE-1: Stamp currentPeriodEnd
          // to now so the resulting CANCELLED row is immediately post-period. This
          // ensures findEligibleSubscription (subscriptionGate.ts ~148-158) does NOT
          // match { status: 'CANCELLED', currentPeriodEnd: { gt: now } } and re-opens
          // the scanning gate. A failed renewal with currentPeriodEnd in the future
          // should not allow scanning just because an admin cancelled the subscription.
          currentPeriodEnd: now,
          autoRenewal: false,
          // Reset retryAttempt so the resulting customer.subscription.deleted
          // webhook does NOT classify this as wasPaymentFailure
          // (stripe.service: retryAttempt > 0 → EXPIRED + PAYMENT_FAILED
          // access-ended notification). Without this the user would receive
          // both "cancellation confirmed" (this handler) and the contradictory
          // "subscription ended — payment not received". This is an explicit
          // admin cancel, not the renewal/invoice-failure flow the M3
          // single-attempt guard governs, so resetting here is safe.
          retryAttempt: 0,
          // Mark the payment failure as resolved-by-cancellation so that
          // list-view projections (which surface failedPaymentAt /
          // failedPaymentClearedAt) don't show an open failure on a subscription
          // that has already been administratively terminated.
          failedPaymentClearedAt: now,
        },
      });
    } else if (!subscription.stripeSubscriptionId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelAt: subscription.currentPeriodEnd,
          canceledAt: now,
          autoRenewal: false,
        },
      });
    } else {
      const stripeSub = await stripeService.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: true },
      );
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelAt: stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null,
          canceledAt: now,
          autoRenewal: false,
        },
      });
    }

    // Spec §10.4 — audit every admin subscription mutation.
    detach(writeAudit({
      actorUserId: (req as AuthRequest).user?.id ?? null,
      action: 'subscription.cancel',
      objectType: 'subscription',
      objectId: subscription.id,
      before: { status: subscription.status, userId, failedPaymentAt: subscription.failedPaymentAt ?? null },
      after: {
        cancelType: subscription.status === 'FAILED_PAYMENT' ? 'immediate' : 'at_period_end',
        initiatedBy: 'admin',
      },
      ip: getClientIp(req) ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }), () => {});

    // BC-USER-SPEC-FIX-002 (F-018): "Subscription cancellation confirmed" is a
    // mandatory Payment notification (spec §11.1/§11.2) and is NOT exempted by the
    // §11.3 intentional-asymmetry list. The admin-cancel handler stamps canceledAt,
    // which makes every downstream path (Stripe webhook M2 branch, Paysera job,
    // scheduler.expireCancelledSubscriptions) suppress on the already-cancelled
    // guard — so the user is otherwise never notified. Fire the same in-app
    // notification the user-initiated cancelSubscription path uses. The cancel
    // succeeded (all three branches above committed without throwing) by the time
    // we reach here, so this fires once, only on a genuine CANCELLED transition.
    detach(notificationService
      .notifySubscriptionCancelledInApp(userId), (err) => logger.error(`[admin cancelSubscription] notifySubscriptionCancelledInApp failed for sub ${subscription.id}:`, err));

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscribers/:userId/plan
// #13 companion: /:userId is also the subscriber ID here
// #4 fix: reject CANCELLED subscriptions
router.patch('/:userId/plan', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body as { plan: SubscriptionPlan };

    if (!plan || !Object.values(SubscriptionPlan).includes(plan)) {
      res.status(400).json({ error: 'Invalid plan' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    // L6 / spec-literal — disambiguate when the subscriber has MORE THAN ONE
    // non-terminal subscription. Silently picking the latest by createdAt can change
    // the plan on the wrong concurrent sub. Return 409 with candidate IDs unless the
    // caller pins an explicit subscriptionId. (Terminal CANCELLED/EXPIRED/
    // INCOMPLETE_EXPIRED are excluded from the candidate set; FAILED_PAYMENT is
    // included here and rejected by the state guard below, matching prior behavior.)
    const planExplicitSubId = typeof (req.body as { subscriptionId?: unknown })?.subscriptionId === 'string'
      ? (req.body as { subscriptionId: string }).subscriptionId
      : undefined;
    const planCandidates = await prisma.subscription.findMany({
      where: { userId, status: { notIn: ['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, plan: true, status: true, createdAt: true, currentPeriodEnd: true },
    });
    if (planCandidates.length === 0) {
      res.status(404).json({ error: 'No active subscription found for this subscriber' });
      return;
    }
    if (planCandidates.length > 1 && !planExplicitSubId) {
      res.status(409).json({
        error: 'Subscriber has multiple non-terminal subscriptions. Provide an explicit subscriptionId to disambiguate.',
        candidates: planCandidates.map((s) => ({
          id: s.id, plan: s.plan, status: s.status,
          createdAt: s.createdAt, currentPeriodEnd: s.currentPeriodEnd,
        })),
      });
      return;
    }
    const planChosen = planExplicitSubId
      ? planCandidates.find((s) => s.id === planExplicitSubId)
      : planCandidates[0];
    if (!planChosen) {
      res.status(404).json({ error: 'Specified subscriptionId not found among this subscriber\'s active subscriptions' });
      return;
    }
    const subscription = await prisma.subscription.findUnique({ where: { id: planChosen.id } });
    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found for this subscriber' });
      return;
    }

    // Guard against non-modifiable states. Note: findFirst above only excludes
    // CANCELLED; EXPIRED, INCOMPLETE_EXPIRED, and FAILED_PAYMENT are caught here.
    // FAILED_PAYMENT is not terminal (dunning may recover it) but plan changes
    // on a Stripe subscription in dunning create confusing invoice sequences —
    // admin should cancel then re-subscribe, or wait for recovery.
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED' || subscription.status === 'INCOMPLETE_EXPIRED') {
      res.status(400).json({ error: 'Cannot change plan on a terminated subscription' });
      return;
    }
    if (subscription.status === 'FAILED_PAYMENT') {
      res.status(400).json({ error: 'Cannot change plan on a subscription with a failed payment. Cancel the subscription and create a new one, or wait for the payment to be recovered.' });
      return;
    }

    if (subscription.stripeSubscriptionId) {
      if (plan === 'PREMIUM_WEEKLY') {
        // Downgrading to PREMIUM_WEEKLY exits Stripe billing — cancel at period end to avoid mid-period refund
        const stripeSub = await stripeService.stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: true },
        );
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            plan,
            cancelAtPeriodEnd: true,
            cancelAt: stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : subscription.currentPeriodEnd,
            canceledAt: new Date(),
            autoRenewal: false,
          },
        });
        res.json({ id: subscription.id, plan, status: subscription.status });
        return;
      }

      const priceIdMap: Partial<Record<SubscriptionPlan | string, string | undefined>> = {
        BASIC: process.env.STRIPE_BASIC_PRICE_ID,
        PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID,
        PREMIUM_MONTHLY: process.env.STRIPE_PREMIUM_PRICE_ID,
      };
      const newPriceId = priceIdMap[plan];
      if (!newPriceId) {
        res.status(400).json({ error: `No Stripe price configured for plan ${plan}` });
        return;
      }
      const stripeSub = await stripeService.stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const itemId = stripeSub.items.data[0]?.id;
      if (!itemId) {
        res.status(500).json({ error: 'Could not find Stripe subscription item' });
        return;
      }
      await stripeService.stripe.subscriptionItems.update(itemId, { price: newPriceId });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { plan },
      select: { id: true, plan: true, status: true },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const VALID_REFUND_REASONS = ['duplicate', 'fraudulent', 'requested_by_customer'] as const;
type RefundReason = (typeof VALID_REFUND_REASONS)[number];

// Defensive String() for catch-block values that may not be Errors. A Proxy
// or class with a throwing toString() would crash inside the logger call and
// surface a TypeError instead of the original failure.
function safeStringify(v: unknown): string {
  try {
    return String(v);
  } catch {
    return '<unprintable error value>';
  }
}

// Sum of refunds already issued against a PI, in minor units. Paginates via
// has_more so a charge with >100 refunds isn't silently truncated (Stripe's
// page size cap is 100). Returns null on lookup failure so the caller can
// decide between failing closed (refuse refund) or open (let Stripe enforce).
async function sumRefundedMinor(paymentIntentId: string): Promise<number | null> {
  let total = 0;
  let startingAfter: string | undefined;
  try {
    // Bounded loop: 50 pages × 100 refunds = 5000 max. Stripe's API contract
    // bounds refunds by captured amount, so a PI with thousands of refunds
    // would already be a Stripe contract violation — this is purely defensive
    // (catches an unexpected has_more=true loop). On loop exhaustion we return
    // the partial `total` accumulated so far, which is necessarily an
    // *undercount* of true refunds; the caller's max-refundable computation
    // would then over-quote refundable amount, and the eventual create call
    // gets gated by Stripe's own captured-amount cap. The catch arm below is
    // the strictly more permissive failure mode: it returns null and the
    // caller treats null as 0 already-refunded, over-quoting by the *full*
    // refunded amount rather than just the unaccounted pages 51+. Both fail
    // open and both lean on Stripe's create-call cap as the final guard.
    for (let i = 0; i < 50; i++) {
      const page = await stripeService.stripe.refunds.list({
        payment_intent: paymentIntentId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      // Stripe.Refund.amount is typed `number` (non-nullable) in SDK v14.25 —
      // no need to nullish-coalesce.
      for (const r of page.data) total += r.amount;
      if (!page.has_more || page.data.length === 0) return total;
      startingAfter = page.data[page.data.length - 1].id;
    }
    return total;
  } catch (err) {
    // Surface the swallowed Stripe error so observability shows it. Callers
    // treat null as "fail-open" — Stripe still enforces over-refund on create.
    // Manual Error → POJO: winston's format.errors() only walks the top-level
    // info object for Error instances, not nested metadata fields, so passing
    // a bare `err` would JSON-serialize to `{}` (Error props are non-enumerable)
    // and lose both message and stack.
    logger.warn(`[admin-refund] sumRefundedMinor lookup failed for PI ${paymentIntentId}`, {
      paymentIntentId,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : safeStringify(err),
    });
    return null;
  }
}

// GET /api/admin/subscribers/:userId/refund-preview — return the currency and
// max refundable amount of the latest Stripe charge so the admin UI can stamp
// the input with the right currency *before* the refund is issued.
router.get('/:userId/refund-preview', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'USER') {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, stripeSubscriptionId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      res.json({ refundable: false, reason: 'no_stripe_subscription' });
      return;
    }

    const stripeSub = await stripeService.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId!,
      { expand: ['latest_invoice.payment_intent'] },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = stripeSub.latest_invoice as any;
    let paymentIntent: { id?: string; amount?: number; currency?: string; amount_received?: number } | undefined =
      typeof invoice?.payment_intent === 'object' && invoice?.payment_intent !== null
        ? invoice.payment_intent
        : undefined;
    // Bare-string fallback — mirrors the POST /refund cap so preview and POST
    // agree on what's refundable when expand silently returned just an ID.
    // Without this, the admin sees "no_payment" while POST /refund would
    // actually accept the refund.
    const piId: string | undefined =
      typeof invoice?.payment_intent === 'string'
        ? invoice.payment_intent
        : paymentIntent?.id;
    if (!paymentIntent && piId) {
      try {
        paymentIntent = await stripeService.stripe.paymentIntents.retrieve(piId);
      } catch (err) {
        // See sumRefundedMinor catch for why err is serialized into a POJO.
        logger.warn(`[admin-refund-preview] PI retrieve fallback failed for ${piId}`, {
          piId,
          err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : safeStringify(err),
        });
      }
    }

    // Distinct reason for the no-PI case (trialing sub or zero-amount invoice
    // — Stripe doesn't create a PaymentIntent for either) so logs / clients
    // can tell "we never got an id" apart from "we got an id but the PI had
    // no captured amount".
    if (!piId) {
      res.json({ refundable: false, reason: 'no_payment_intent_id' });
      return;
    }
    // Refundable is bounded by what was actually captured (amount_received),
    // not by the original authorization (amount). For partial captures the
    // two diverge and a refund > amount_received is rejected by Stripe.
    // (piId is narrowed to string by the early-return above; this guard
    // covers the missing-PI / not-yet-captured cases.)
    if (!paymentIntent || !paymentIntent.currency || !paymentIntent.amount_received) {
      res.json({ refundable: false, reason: 'no_payment' });
      return;
    }

    // Subtract any refunds already issued so the form's max reflects what's
    // actually still refundable. Without this, a previously partially-refunded
    // charge would mislead the admin and the resulting refund call would 400
    // (caught by the POST cap). Lookup failure → null → fail-open 0 (admin
    // form shows the full PI; POST cap also fails open; Stripe ultimately
    // gates the create call).
    const refundedMinor = await sumRefundedMinor(piId);
    const alreadyRefundedMinor = refundedMinor ?? 0;

    // Stripe amount is in the smallest currency unit (e.g. cents/stotinki) —
    // convert to major units for the admin form.
    const grossMinor = paymentIntent.amount_received;
    const remainingMinor = Math.max(0, grossMinor - alreadyRefundedMinor);
    if (remainingMinor === 0) {
      res.json({ refundable: false, reason: 'already_refunded' });
      return;
    }
    res.json({
      refundable: true,
      currency: paymentIntent.currency.toUpperCase(),
      amount: remainingMinor / 100,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscribers/:userId/refund
// #13 companion: /:userId is the subscriber ID — find latest Stripe subscription
router.post('/:userId/refund', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body as { amount?: unknown; reason?: unknown };

    if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    if (reason !== undefined && !VALID_REFUND_REASONS.includes(reason as RefundReason)) {
      res.status(400).json({ error: `reason must be one of: ${VALID_REFUND_REASONS.join(', ')}` });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, stripeSubscriptionId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      res.status(422).json({ error: 'No Stripe subscription found for this subscriber' });
      return;
    }

    // Retrieve the Stripe subscription with the latest invoice expanded so we
    // can obtain the payment_intent without an extra API round-trip.
    const stripeSub = await stripeService.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
      { expand: ['latest_invoice.payment_intent'] },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = stripeSub.latest_invoice as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentIntentObj: any =
      typeof invoice?.payment_intent === 'object' && invoice?.payment_intent !== null
        ? invoice.payment_intent
        : null;
    const paymentIntentId: string | undefined =
      typeof invoice?.payment_intent === 'string'
        ? invoice.payment_intent
        : paymentIntentObj?.id;

    if (!paymentIntentId) {
      res.status(422).json({ error: 'No payment found for this subscription. Nothing to refund.' });
      return;
    }

    // Server-side amount cap. The frontend already disables the submit button
    // when amount > preview.amount, but a stale modal cache or a JS-disabled
    // browser can still send an oversized amount. Stripe rejects with a generic
    // "amount too large" error; a clear 400 here is friendlier and avoids
    // burning a Stripe round-trip. We compute the live refundable max from the
    // PI amount minus refunds that have already been issued — so partial-refund
    // races between preview and submit are caught too.
    if (amount !== undefined) {
      // Defensive: when Stripe returned the PI as a bare id string instead of
      // expanding it (rare — expand directive failed silently), fetch the PI
      // explicitly so the cap path doesn't no-op and let Stripe handle it.
      let piForCap: { amount_received?: number; currency?: string } | null = paymentIntentObj;
      if (!piForCap) {
        try {
          piForCap = await stripeService.stripe.paymentIntents.retrieve(paymentIntentId);
        } catch (err) {
          // Swallow + log: cap silently no-ops and Stripe still rejects an
          // over-refund on create. We log so observability can distinguish a
          // transient Stripe outage from "valid amount, refund accepted".
          // See sumRefundedMinor catch for why err is serialized into a POJO.
          logger.warn(`[admin-refund] PI retrieve for cap failed for ${paymentIntentId}; falling through to Stripe enforcement`, {
            paymentIntentId,
            err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : safeStringify(err),
          });
          piForCap = null;
        }
      }
      if (piForCap && typeof piForCap.amount_received === 'number') {
        // Refundable is bounded by what was captured (amount_received), not
        // by the original authorization (amount). For partial captures the two
        // diverge and a refund > amount_received would be rejected by Stripe.
        const piAmountMajor = piForCap.amount_received / 100;
        const refundedMinor = await sumRefundedMinor(paymentIntentId);
        const alreadyRefundedMajor = (refundedMinor ?? 0) / 100;
        const refundableMajor = Math.max(0, piAmountMajor - alreadyRefundedMajor);
        // Tolerate one minor-unit (1 stotinka in BGN, 1 cent in EUR/USD) of
        // float drift from .toFixed(2) round-trips. Assumes a 2-decimal
        // currency — BoomCard charges in BGN/EUR; zero-decimal currencies
        // (JPY, KRW) would need a currency-aware tolerance and a different
        // /100 conversion. Re-evaluate this if the platform expands.
        if ((amount as number) - refundableMajor > 0.01) {
          res.status(400).json({
            error: `Amount exceeds the refundable charge (max ${refundableMajor.toFixed(2)} ${(piForCap.currency ?? '').toString().toUpperCase()})`,
          });
          return;
        }
      }
    }

    const refund = await stripeService.createRefund({
      paymentIntentId,
      amount: amount as number | undefined,
      reason: reason as RefundReason | undefined,
    });

    res.json({ ok: true, refundId: refund.id, amount: refund.amount / 100, currency: refund.currency });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/subscribers/:userId/login-history — paginated login history (#10)
router.get('/:userId/login-history', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { skip, page, limit } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const [history, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          ip: true,
          userAgent: true,
          success: true,
          failReason: true,
          createdAt: true,
        },
      }),
      prisma.loginHistory.count({ where: { userId } }),
    ]);

    res.json({ history, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/subscribers/:userId/sessions — force-logout all sessions (#10)
router.delete('/:userId/sessions', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    const { count } = await prisma.refreshToken.deleteMany({ where: { userId } });
    res.json({ ok: true, revokedCount: count });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/subscribers/:userId/account
// Soft-deletes the user and sets status to DELETED
router.delete('/:userId/account', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.delete'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body as { reason?: string };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'USER') {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }
    if (user.deletedAt) {
      res.status(400).json({ error: 'User is already deleted' });
      return;
    }

    await Promise.all([
      prisma.user.update({
        where: { id: userId },
        // Persist the pre-delete status so /restore can revive the user to their
        // EXACT prior state (BC-ADMIN-SPEC-REAUDIT2-ARCHIVE-RESTORE-BYPASS-1).
        // Without this, an ARCHIVED user soft-deleted here would be silently
        // resurrected as ACTIVE on restore, escaping the spec §1.1/§2.4 ARCHIVED
        // terminality that PATCH /status enforces. `user.status` was already
        // fetched above; capture it before it is overwritten with DELETED.
        data: { deletedAt: new Date(), status: 'DELETED', statusBeforeDelete: user.status },
      }),
      // Revoke all active sessions immediately so a deleted user cannot
      // continue making API requests with their existing refresh tokens.
      prisma.refreshToken.deleteMany({ where: { userId } }),
      // Cancel any non-terminal subscription so a deleted account stops
      // auto-renewing/billing and is no longer counted as an active subscriber.
      // Mirrors AuthService.deleteAccount().
      prisma.subscription.updateMany({
        where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
        data: { status: 'CANCELLED', canceledAt: new Date(), cancelAtPeriodEnd: true },
      }),
      // User row is soft-deleted, so the PushToken onDelete cascade won't fire.
      prisma.pushToken.updateMany({ where: { userId }, data: { isActive: false } }),
    ]);

    res.json({ ok: true, userId, reason: reason ?? null });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscribers/:userId/restore — undo soft delete (account becomes ACTIVE)
router.post('/:userId/restore', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.delete'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'USER') {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }
    if (!user.deletedAt) {
      res.status(400).json({ error: 'User is not deleted' });
      return;
    }

    // Revive to the EXACT status the user held before deletion, not a blanket ACTIVE
    // (BC-ADMIN-SPEC-REAUDIT2-ARCHIVE-RESTORE-BYPASS-1). A user who was ARCHIVED before
    // being soft-deleted MUST come back ARCHIVED — restoring them as ACTIVE would bypass
    // the spec §1.1/§2.4 terminality that PATCH /status enforces (an Archived account
    // reactivates only via password-reset + new subscription, never an admin flip).
    // Legacy rows soft-deleted before statusBeforeDelete existed have NULL here; default
    // those to ACTIVE to preserve the pre-fix behaviour. statusBeforeDelete is cleared
    // back to NULL on restore so a later DELETE captures a fresh value.
    const revivedStatus = user.statusBeforeDelete ?? 'ACTIVE';

    const [updated] = await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { deletedAt: null, status: revivedStatus, statusBeforeDelete: null },
        select: { id: true, status: true },
      }),
      // Mirror PATCH /status: ARCHIVED is a terminal no-login state, so a user revived
      // into ARCHIVED must not regain sessions. (DELETE already revoked all tokens; this
      // is a belt-and-braces guard so no stray session survives the revive.)
      revivedStatus === 'ARCHIVED'
        ? prisma.refreshToken.deleteMany({ where: { userId } })
        : Promise.resolve(),
    ]);

    res.json({ ok: true, ...updated });
  } catch (error) {
    next(error);
  }
});

export default router;
