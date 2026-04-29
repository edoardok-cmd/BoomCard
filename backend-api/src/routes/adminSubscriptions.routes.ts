import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';
import { planDisplayName } from '../utils/planDisplayName';

const router = Router();

// GET /api/admin/subscriptions?page=1&limit=20&search=...&plan=BASIC&status=ACTIVE
router.get('/', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.read'), async (req, res, next) => {
  try {
    const {
      search,
      plan,
      status,
      page = '1',
      limit = '20',
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
    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

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

    const result = subscriptions.map((s) => ({ ...s, planDisplayName: planDisplayName(s.plan) }));
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
