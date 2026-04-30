import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';
import { planDisplayName } from '../utils/planDisplayName';

const router = Router();

// Email patterns that mark seed/test accounts. Kept here (not config) because
// the admin list explicitly filters them out by default per ops feedback.
const TEST_EMAIL_PATTERNS = [
  /@boomcard-test\.dev$/i,
  /^e2e-/i,
  /@test\.boomcard\.bg$/i,
  /^(premiumuser|lightuser|basicuser)@/i,
  /@test\.com$/i,
];
const isTestEmail = (email: string) => TEST_EMAIL_PATTERNS.some((p) => p.test(email));

// Derive billing cycle from period length. Stripe price metadata is the source
// of truth, but we don't fetch it for every list row — period delta is reliable.
const billingCycleFromPeriod = (start: Date, end: Date): 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'OTHER' => {
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days >= 6 && days <= 8) return 'WEEKLY';
  if (days >= 28 && days <= 32) return 'MONTHLY';
  if (days >= 360 && days <= 370) return 'YEARLY';
  return 'OTHER';
};

// GET /api/admin/subscriptions?page=1&limit=20&search=...&plan=BASIC&status=ACTIVE&excludeTest=true
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.read'), async (req, res, next) => {
  try {
    const {
      search,
      plan,
      status,
      page = '1',
      limit = '20',
      excludeTest,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);
    const skip = (pageNum - 1) * limitNum;
    const take = limitNum;

    const where: Parameters<typeof prisma.subscription.findMany>[0]['where'] = {};

    if (plan && Object.values(SubscriptionPlan).includes(plan as SubscriptionPlan)) {
      where.plan = plan as SubscriptionPlan;
    }
    if (status && Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)) {
      where.status = status as SubscriptionStatus;
    }

    const userFilter: Record<string, unknown> = {};
    if (search) {
      userFilter.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (excludeTest === 'true') {
      // Prisma puts `mode` at the top level of a string filter; for negation
      // we wrap the whole filter in `NOT` rather than nesting `not + mode`.
      userFilter.AND = [
        { NOT: { email: { contains: 'boomcard-test.dev', mode: 'insensitive' } } },
        { NOT: { email: { contains: 'test.boomcard.bg', mode: 'insensitive' } } },
        { NOT: { email: { contains: '@test.com', mode: 'insensitive' } } },
        { NOT: { email: { startsWith: 'e2e-', mode: 'insensitive' } } },
        { NOT: { email: { startsWith: 'premiumuser@', mode: 'insensitive' } } },
        { NOT: { email: { startsWith: 'lightuser@', mode: 'insensitive' } } },
        { NOT: { email: { startsWith: 'basicuser@', mode: 'insensitive' } } },
      ];
    }
    if (Object.keys(userFilter).length > 0) {
      where.user = userFilter;
    }

    // Defensive: promote stale INCOMPLETE rows to INCOMPLETE_EXPIRED on read.
    // Stripe normally does this via webhook within 23h; this catches drift.
    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.subscription.updateMany({
      where: { status: 'INCOMPLETE', createdAt: { lt: staleCutoff } },
      data: { status: 'INCOMPLETE_EXPIRED' },
    });

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
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
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    // Spec §4.2 — history of past plans per user, plus payment count/total.
    const userIds = Array.from(new Set(subscriptions.map((s) => s.user.id)));

    const [subscriptionCounts, paymentAggregates] = await Promise.all([
      userIds.length
        ? prisma.subscription.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ userId: string; _count: { _all: number } }>),
      userIds.length
        ? prisma.transaction.groupBy({
            by: ['userId'],
            where: {
              userId: { in: userIds },
              type: TransactionType.SUBSCRIPTION,
              status: TransactionStatus.COMPLETED,
            },
            _count: { _all: true },
            _sum: { amount: true },
          })
        : Promise.resolve([] as Array<{ userId: string; _count: { _all: number }; _sum: { amount: number | null } }>),
    ]);

    const countByUser = new Map(subscriptionCounts.map((c) => [c.userId, c._count._all]));
    const paymentsByUser = new Map(
      paymentAggregates.map((p) => [p.userId, { count: p._count._all, totalAmount: p._sum.amount ?? 0 }]),
    );

    const result = subscriptions.map((s) => {
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
      };
    });
    res.json({ subscriptions: result, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscriptions/:id/cancel — cancel at period end
router.post('/:id/cancel', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (subscription.cancelAtPeriodEnd) {
      return res.status(400).json({ error: 'Subscription is already scheduled for cancellation' });
    }
    if (subscription.status === 'CANCELLED' || subscription.status === 'INCOMPLETE_EXPIRED') {
      return res.status(400).json({ error: 'Cannot cancel a terminated subscription' });
    }
    if (!subscription.stripeSubscriptionId) {
      await prisma.subscription.update({
        where: { id: req.params.id },
        data: { cancelAtPeriodEnd: true, cancelAt: subscription.currentPeriodEnd, canceledAt: new Date() },
      });
    } else {
      const stripeSub = await stripeService.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: true },
      );
      await prisma.subscription.update({
        where: { id: req.params.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelAt: stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null,
          canceledAt: new Date(),
        },
      });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscriptions/:id/reactivate — remove scheduled cancellation
router.post('/:id/reactivate', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (!subscription.cancelAtPeriodEnd || subscription.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Subscription is not scheduled for cancellation' });
    }

    if (subscription.stripeSubscriptionId) {
      await stripeService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    }

    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null, autoRenewal: true },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/subscriptions/:id/resume — resume a PAUSED subscription
router.post('/:id/resume', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (subscription.status !== 'PAUSED') {
      return res.status(400).json({ error: 'Subscription is not paused' });
    }

    if (subscription.stripeSubscriptionId) {
      await stripeService.stripe.subscriptions.resume(subscription.stripeSubscriptionId);
    }

    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscriptions/:id/auto-renewal — toggle auto-renewal without ownership check
router.patch('/:id/auto-renewal', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { autoRenewal } = req.body;
    if (typeof autoRenewal !== 'boolean') {
      return res.status(400).json({ error: 'autoRenewal must be a boolean' });
    }
    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
    if (subscription.status === 'CANCELLED' || subscription.status === 'INCOMPLETE_EXPIRED') {
      return res.status(400).json({ error: 'Cannot modify auto-renewal for a terminated subscription' });
    }

    if (subscription.stripeSubscriptionId) {
      await stripeService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: !autoRenewal,
      });
    }

    await prisma.subscription.update({
      where: { id: req.params.id },
      data: {
        autoRenewal,
        cancelAtPeriodEnd: !autoRenewal,
        cancelAt: !autoRenewal ? subscription.currentPeriodEnd : null,
      },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
