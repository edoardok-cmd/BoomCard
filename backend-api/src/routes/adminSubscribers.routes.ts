import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';
import { getSubscriberCashbackEntries } from '../services/adminCashback.service';
import { planDisplayName } from '../utils/planDisplayName';

const router = Router();
router.use(auditMiddleware);

// GET /api/admin/subscribers?page=1&limit=20&search=...&plan=BASIC&status=ACTIVE&dateFrom=...&dateTo=...
// "Абонати" = user profile management: user-centric view with subscription summary
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscribers.read'), async (req, res, next) => {
  try {
    const {
      search,
      plan,
      status,
      dateFrom,
      dateTo,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.user.findMany>[0]['where'] = {
      role: 'USER',
    };

    // Apply subscription filters (plan, status, date range) only when values are
    // provided so that users with no subscription are still visible without filters.
    const subFilter: Record<string, unknown> = {};
    if (plan && Object.values(SubscriptionPlan).includes(plan as SubscriptionPlan)) {
      subFilter.plan = plan as SubscriptionPlan;
    }
    if (status && Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)) {
      subFilter.status = status as SubscriptionStatus;
    }
    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setUTCHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
      subFilter.createdAt = createdAt;
    }
    const hasSubFilter = Object.keys(subFilter).length > 0;
    if (hasSubFilter) {
      where.subscriptions = { some: subFilter };
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Subscription type shorthand for casting the filter into nested where clauses.
    type SubWhere = Parameters<typeof prisma.subscription.findMany>[0]['where'];

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          status: true,
          deletedAt: true,
          riskScore: true,
          lastLoginAt: true,
          createdAt: true,
          wallet: {
            select: {
              availableBalance: true,
              balance: true,
              pendingBalance: true,
            },
          },
          subscriptions: {
            // Mirror the outer filter so the embedded subscription always matches
            // what the admin filtered on, not just the chronologically latest one.
            where: hasSubFilter ? (subFilter as SubWhere) : undefined,
            orderBy: { createdAt: 'desc' },
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
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Flatten the subscription array to a single object for ergonomic frontend consumption.
    // planDisplayName resolves the counter-intuitive LIGHT enum value to "Premium Weekly".
    const subscribers = users.map(({ subscriptions, ...u }) => {
      const sub = subscriptions[0] ?? null;
      return {
        ...u,
        subscription: sub
          ? { ...sub, planDisplayName: planDisplayName(sub.plan) }
          : null,
      };
    });

    res.json({ subscribers, total, page: pageNum, limit: take });
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

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { not: 'CANCELLED' } },
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

    // Defensive guard — findFirst already excludes CANCELLED, but guard is kept for type narrowing
    if (subscription.status === 'CANCELLED') {
      res.status(400).json({ error: 'Cannot change plan on a cancelled subscription' });
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
    const paymentIntentId: string | undefined =
      typeof invoice?.payment_intent === 'string'
        ? invoice.payment_intent
        : invoice?.payment_intent?.id;

    if (!paymentIntentId) {
      res.status(422).json({ error: 'No payment found for this subscription. Nothing to refund.' });
      return;
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

export default router;
