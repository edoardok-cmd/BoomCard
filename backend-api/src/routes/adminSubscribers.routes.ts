import { Router } from 'express';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { stripeService } from '../services/stripe.service';

const router = Router();

// GET /api/admin/subscribers?page=1&limit=20&search=...&plan=BASIC&status=ACTIVE&dateFrom=...&dateTo=...
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
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, Date>).gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setUTCHours(23, 59, 59, 999); // date-only strings parse as UTC midnight; keep end-of-day in UTC too
        (where.createdAt as Record<string, Date>).lte = to;
      }
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
          currentPeriodStart: true,
          currentPeriodEnd: true,
          canceledAt: true,
          trialEnd: true,
          autoRenewal: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
              wallet: {
                select: {
                  availableBalance: true,
                  balance: true,
                  pendingBalance: true,
                },
              },
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({ subscriptions, total, page: pageNum, limit: take });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/subscribers/:id/cancel
router.patch('/:id/cancel', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    if (subscription.status === 'CANCELLED') {
      res.status(400).json({ error: 'Subscription is already cancelled' });
      return;
    }

    if (!subscription.stripeSubscriptionId) {
      await prisma.subscription.update({
        where: { id },
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
        where: { id },
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

// PATCH /api/admin/subscribers/:id/plan
router.patch('/:id/plan', authenticate, authorize('ADMIN', 'SUPER_ADMIN'), requirePermission('subscriptions.write'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan } = req.body as { plan: SubscriptionPlan };

    if (!plan || !Object.values(SubscriptionPlan).includes(plan)) {
      res.status(400).json({ error: 'Invalid plan' });
      return;
    }

    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }

    if (subscription.stripeSubscriptionId && plan !== 'LIGHT') {
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
      where: { id },
      data: { plan },
      select: { id: true, plan: true, status: true },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
