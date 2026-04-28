import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { stripeService } from '../services/stripe.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const router = Router();

// ============================================
// Public Routes (no auth required)
// ============================================

/**
 * GET /api/subscriptions/status/:orderId
 * Poll subscription status by Paysera order ID
 * Used by frontend after payment redirect to check if subscription is active
 * PUBLIC endpoint - no auth required (uses orderId as token)
 */
router.get('/status/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;

  // Find subscription by Paysera order ID
  const subscription = await prisma.subscription.findFirst({
    where: { payseraOrderId: orderId },
    include: {
      planDetails: {
        select: {
          displayName: true,
          displayNameBg: true,
          planCode: true,
        },
      },
    },
  });

  if (!subscription) {
    // Fallback: check PendingSubscription (anonymous checkout)
    const pending = await prisma.pendingSubscription.findFirst({
      where: { payseraOrderId: orderId },
      include: { plan: { select: { displayName: true, planCode: true } } },
    });
    if (!pending) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    return res.json({
      success: true,
      type: 'pending',
      data: {
        status: pending.status,
        email: pending.email,
        plan: { code: pending.plan.planCode, name: pending.plan.displayName },
        isActive: false,
      },
    });
  }

  // Parse metadata for additional info
  const metadata = subscription.metadata ? JSON.parse(subscription.metadata as string) : {};

  res.json({
    success: true,
    data: {
      subscriptionId: subscription.id,
      status: subscription.status,
      plan: {
        code: subscription.planDetails?.planCode || subscription.plan,
        name: subscription.planDetails?.displayName || subscription.plan,
        nameBg: subscription.planDetails?.displayNameBg,
      },
      billingPeriod: metadata.billingPeriod,
      currentPeriodEnd: subscription.currentPeriodEnd,
      isActive: subscription.status === 'ACTIVE',
    },
  });
}));

// ============================================
// Authenticated Routes
// ============================================

/**
 * GET /api/subscriptions/plans
 * Get available subscription plans
 */
router.get('/plans', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const plans = await Promise.all(
    (['LIGHT', 'BASIC', 'PREMIUM'] as const).map(async plan => ({
      plan,
      ...await subscriptionService.getPlanBenefits(plan),
    })),
  );

  res.json({ plans });
}));

/**
 * GET /api/subscriptions/current
 * Get user's current subscription, enriched with paymentMethod from SavedPaymentMethod.
 */
router.get('/current', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const subscription = await subscriptionService.getActiveSubscription(userId);

  if (!subscription) {
    return res.json({
      plan: 'LIGHT',
      status: 'ACTIVE',
      benefits: await subscriptionService.getPlanBenefits('LIGHT'),
    });
  }

  // Attach default saved payment method (Stripe subs only)
  let paymentMethod: object | null = null;
  if (subscription.stripeSubscriptionId) {
    const saved = await prisma.savedPaymentMethod.findFirst({
      where: { userId, isDefault: true },
      select: { brand: true, last4: true, expiryMonth: true, expiryYear: true, type: true },
    });
    if (!saved) {
      // Fall back to first card for this user if no default is set
      const fallback = await prisma.savedPaymentMethod.findFirst({
        where: { userId },
        select: { brand: true, last4: true, expiryMonth: true, expiryYear: true, type: true },
      });
      paymentMethod = fallback;
    } else {
      paymentMethod = saved;
    }
  }

  res.json({
    ...subscription,
    paymentMethod,
    benefits: await subscriptionService.getPlanBenefits(subscription.plan),
  });
}));

/**
 * GET /api/subscriptions/history
 * Return last 5 Stripe invoices for the user's active subscription.
 * Returns empty array for Paysera subscriptions.
 */
router.get('/history', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const subscription = await subscriptionService.getActiveSubscription(userId);

  if (!subscription?.stripeSubscriptionId) {
    // Paysera subscriptions — use Transaction table
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: { in: ['WALLET_TOPUP', 'SUBSCRIPTION'] as any },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        currency: true,
        status: true,
        description: true,
        metadata: true,
      },
    });

    const history = transactions.map(t => {
      const meta = t.metadata ? JSON.parse(t.metadata as string) : {};
      return {
        id: t.id,
        date: t.createdAt.toISOString(),
        amount: t.amount,
        currency: t.currency,
        status: t.status.toLowerCase(),
        description: t.description,
        orderId: meta.orderId,
      };
    });

    return res.json({ history });
  }

  const stripeInvoices = await stripeService.stripe.invoices.list({
    subscription: subscription.stripeSubscriptionId,
    limit: 5,
  });

  const history = stripeInvoices.data.map(inv => ({
    id: inv.id,
    date: new Date(inv.created * 1000).toISOString(),
    amount: (inv.amount_paid ?? inv.amount_due ?? 0) / 100,
    currency: (inv.currency ?? 'eur').toUpperCase(),
    status: inv.status ?? 'unknown',
    pdfUrl: inv.invoice_pdf,
  }));

  res.json({ history });
}));

/**
 * POST /api/subscriptions/create
 * Create new subscription (BASIC or PREMIUM only via Stripe).
 * The LIGHT (Premium Weekly) plan must be purchased via POST /api/payments/subscription (Paysera).
 */
const createSchema = z.object({
  plan: z.enum(['BASIC', 'PREMIUM']),
  paymentMethodId: z.string().optional(),
});

router.post('/create', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { plan, paymentMethodId } = createSchema.parse(req.body);

  // Check if user already has active subscription
  const existing = await subscriptionService.getActiveSubscription(userId);
  if (existing) {
    return res.status(400).json({
      error: 'You already have an active subscription. Use update endpoint to change plans.'
    });
  }

  const result = await subscriptionService.createSubscription({
    userId,
    plan,
    paymentMethodId,
  });

  res.json(result);
}));

/**
 * POST /api/subscriptions/:id/reactivate
 * Remove a pending cancellation (cancelAtPeriodEnd) and re-enable auto-renewal.
 */
router.post('/:id/reactivate', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await subscriptionService.reactivateSubscription(id, req.user!.id);
  res.json(result);
}));

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription
 */
const cancelSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
});

router.post('/:id/cancel', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { cancelAtPeriodEnd } = cancelSchema.parse(req.body);

  const subscription = await subscriptionService.getSubscription(id);
  if (!subscription) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (subscription.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to cancel this subscription' });
  }

  const result = await subscriptionService.cancelSubscription(id, cancelAtPeriodEnd);

  res.json(result);
}));

/**
 * PATCH /api/subscriptions/:id/auto-renewal
 * Enable or disable auto-renewal for a subscription (FR-004)
 */
const autoRenewalSchema = z.object({
  autoRenewal: z.boolean(),
});

router.patch('/:id/auto-renewal', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { autoRenewal } = autoRenewalSchema.parse(req.body);

  const result = await subscriptionService.toggleAutoRenewal(id, req.user!.id, autoRenewal);
  res.json(result);
}));

/**
 * POST /api/subscriptions/:id/trial-refund
 * Request a 24-hour trial refund (FR-007)
 * Eligible within 24h of purchase if trialRefundUsed is false
 */
router.post('/:id/trial-refund', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await subscriptionService.requestTrialRefund(id, req.user!.id);
  res.json(result);
}));

/**
 * POST /api/subscriptions/:id/retry-payment
 * Retry payment for a PAST_DUE subscription (FR-grace-retry)
 */
router.post('/:id/retry-payment', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await subscriptionService.retryPayment(id, req.user!.id);
  res.json(result);
}));

/**
 * POST /api/subscriptions/:id/update-plan
 * Upgrade or downgrade subscription
 */
const updatePlanSchema = z.object({
  plan: z.enum(['LIGHT', 'BASIC', 'PREMIUM']),
});

router.post('/:id/update-plan', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { plan } = updatePlanSchema.parse(req.body);

  const subscription = await subscriptionService.getSubscription(id);
  if (!subscription) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (subscription.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to update this subscription' });
  }

  const result = await subscriptionService.updateSubscriptionPlan(id, plan);

  res.json(result);
}));

export default router;
