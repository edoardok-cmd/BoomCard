import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware, writeAudit } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';
import { getSubscriberCashbackEntries } from '../services/adminCashback.service';
import { computeRiskForUsers, persistRiskAssessments } from '../services/userRisk.service';
import { planDisplayName } from '../utils/planDisplayName';
import { logger } from '../utils/logger';

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
  lastLoginAt: true,
  lastActivityAt: true,
  ibanLastChangedAt: true,
  createdAt: true,
  wallet: {
    select: { availableBalance: true, balance: true, pendingBalance: true },
  },
} as const;

function buildSubscriberQuery(q: Record<string, string | undefined>) {
  const { search, plan, status, accountStatus, riskLevel, dateFrom, dateTo } = q;
  const where: UserWhere = { role: 'USER' };

  const subFilter: Record<string, unknown> = {};
  if (plan && Object.values(SubscriptionPlan).includes(plan as SubscriptionPlan)) {
    subFilter.plan = plan as SubscriptionPlan;
  }
  if (status && Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)) {
    subFilter.status = status as SubscriptionStatus;
  }
  const hasSubFilter = Object.keys(subFilter).length > 0;
  if (hasSubFilter) {
    where.subscriptions = { some: subFilter as SubWhere };
  }

  // Date range applies to user.createdAt (account registration) so that
  // never-subscribed users are not silently dropped from the result.
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.gte = new Date(dateFrom);
    if (dateTo) {
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  if (accountStatus === 'ACTIVE' || accountStatus === 'SUSPENDED') {
    where.status = accountStatus;
    where.deletedAt = null;
  } else if (accountStatus === 'DELETED') {
    where.deletedAt = { not: null };
  }

  if (riskLevel === 'low') where.riskScore = { lte: 30 };
  else if (riskLevel === 'medium') where.riskScore = { gt: 30, lte: 60 };
  else if (riskLevel === 'high') where.riskScore = { gt: 60 };

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

// Mirror the outer filter so the embedded subscription matches what the admin
// filtered on, not just the chronologically latest record.
function subscriptionInclude(hasSubFilter: boolean, subFilter: Record<string, unknown>) {
  return {
    where: hasSubFilter ? (subFilter as SubWhere) : undefined,
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

// GET /api/admin/subscribers?page=1&limit=20&search=...&plan=BASIC&status=ACTIVE&accountStatus=ACTIVE&riskLevel=high&dateFrom=...&dateTo=...
// "Абонати" = user profile management: user-centric view with subscription summary
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20', ...filters } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;

    const { where, subFilter, hasSubFilter } = buildSubscriberQuery(filters);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          ...SUBSCRIBER_SELECT,
          subscriptions: subscriptionInclude(hasSubFilter, subFilter),
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Spec §4.1 — Risk column must reflect a behaviour-based score, not the
    // never-updated DB default. Recompute for the visible page only (cheap; one
    // groupBy per rule across ≤ limit users) and persist so filters converge.
    let subscribers = users.map(flattenSubscriber);
    try {
      const assessments = await computeRiskForUsers(
        users.map((u) => ({ id: u.id, createdAt: u.createdAt, ibanLastChangedAt: u.ibanLastChangedAt })),
      );
      subscribers = subscribers.map((s) => {
        const a = assessments.get(s.id);
        return a ? { ...s, riskScore: a.score, riskBucket: a.bucket } : s;
      });
      // Persist asynchronously so the response isn't blocked on writes.
      // Fire-and-forget is acceptable here: persistence runs sequentially
      // across PERSIST_CONCURRENCY chunks and may be cut short by a worker
      // restart between chunks. The next admin GET (or the daily sweep in
      // jobs/user-risk-sweep.ts) recomputes the same assessments and writes
      // any users that were missed, so the failure mode self-heals.
      void persistRiskAssessments(Array.from(assessments.values())).catch(() => {});
    } catch {
      // Computation failure must not break the list — fall back to stored values.
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
    const { where, subFilter, hasSubFilter } = buildSubscriberQuery(req.query as Record<string, string>);
    const users = await prisma.user.findMany({
      where,
      take: EXPORT_MAX,
      orderBy: { createdAt: 'desc' },
      select: {
        ...SUBSCRIBER_SELECT,
        subscriptions: subscriptionInclude(hasSubFilter, subFilter),
      },
    });
    res.json({ subscribers: users.map(flattenSubscriber), limit: EXPORT_MAX });
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
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);

    const result = await getSubscriberCashbackEntries(userId, page, limit);

    writeAudit({
      actorUserId: (req as AuthRequest).user?.id ?? null,
      action: 'subscriber.cashback.view',
      objectType: 'cashback',
      objectId: userId,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }).catch(() => {});

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
          },
        },
      },
    });

    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }

    // Enrich each subscription with a human-readable plan name (LIGHT → "Premium Weekly")
    const enriched = {
      ...user,
      subscriptions: user.subscriptions.map((s) => ({
        ...s,
        planDisplayName: planDisplayName(s.plan),
      })),
    };

    const actorReq = req as AuthRequest;
    writeAudit({
      actorUserId: actorReq.user?.id ?? null,
      action: 'subscriber.view',
      objectType: 'subscriber',
      objectId: userId,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    }).catch(() => {});

    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscribers/:userId/status — suspend or unsuspend a subscriber (#7)
router.patch('/:userId/status', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.write'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body as { status?: string };

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      return res.status(400).json({ error: 'status must be ACTIVE or SUSPENDED' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'USER') {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    if (user.deletedAt) {
      return res.status(400).json({ error: 'Cannot change status of a deleted account' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, status: true },
    });

    res.json({ ok: true, ...updated });
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
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { notIn: ['CANCELLED', 'EXPIRED', 'INCOMPLETE_EXPIRED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found for this subscriber' });
      return;
    }

    if (!subscription.stripeSubscriptionId) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelAt: subscription.currentPeriodEnd,
          canceledAt: new Date(),
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
          canceledAt: new Date(),
          autoRenewal: false,
        },
      });
    }

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

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      res.status(404).json({ error: 'No active subscription found for this subscriber' });
      return;
    }

    // Defensive guard — findFirst already excludes terminated states, but
    // guard is kept for type narrowing. EXPIRED rows are also unmodifiable
    // (natural-lapse end state introduced for spec §4.2).
    if (
      subscription.status === 'CANCELLED' ||
      subscription.status === 'EXPIRED' ||
      subscription.status === 'INCOMPLETE_EXPIRED'
    ) {
      res.status(400).json({ error: 'Cannot change plan on a terminated subscription' });
      return;
    }

    if (subscription.stripeSubscriptionId) {
      if (plan === 'LIGHT') {
        // Downgrading to LIGHT exits Stripe billing — cancel at period end to avoid mid-period refund
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

      const priceIdMap: Partial<Record<SubscriptionPlan, string | undefined>> = {
        BASIC: process.env.STRIPE_BASIC_PRICE_ID,
        PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID,
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
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

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

    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        status: 'DELETED',
      },
    });

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

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, status: true },
    });

    res.json({ ok: true, ...updated });
  } catch (error) {
    next(error);
  }
});

export default router;
