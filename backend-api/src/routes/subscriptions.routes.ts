import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { stripeService } from '../services/stripe.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { payseraService } from '../services/paysera.service';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { isCurrencyTransitionWindowOpen, toDualCurrency } from '../utils/currencyDisplay';

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
    (['PREMIUM_WEEKLY', 'BASIC', 'PREMIUM_MONTHLY'] as const).map(async plan => ({
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
    return res.json({ hasSubscription: false, subscription: null });
  }

  // F-006: Attach payment method info for both Stripe and Paysera subscribers.
  // Stripe subscribers: read from SavedPaymentMethod table.
  // Paysera subscribers: return a safe placeholder using the stored wallet IBAN so
  //   the client has something to display (instead of null).
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
  } else {
    // Paysera subscriber — no SavedPaymentMethod row exists. Return a placeholder
    // so the client can display something on the subscription screen.
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { payoutIban: true },
    });
    paymentMethod = {
      provider: 'paysera',
      maskedAccount: wallet?.payoutIban
        ? '****' + wallet.payoutIban.slice(-4)
        : null,
    };
  }

  res.json({
    id: subscription.id,
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    cancelAt: subscription.cancelAt,
    trialStart: subscription.trialStart,
    trialEnd: subscription.trialEnd,
    autoRenewal: subscription.autoRenewal,
    pauseEndsAt: subscription.pauseEndsAt,
    createdAt: subscription.createdAt,
    paymentMethod,
    benefits: await subscriptionService.getPlanBenefits(subscription.plan),
  });
}));

/**
 * GET /api/subscriptions/history
 * Returns payment history for the user's active subscription.
 * Stripe: last 5 invoices. Paysera: Transaction table, falling back to a
 * synthetic entry from the subscription record for T9 (anonymous checkout)
 * users who paid before a Transaction row existed.
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

    const showDualCurrency = await isCurrencyTransitionWindowOpen();

    const history = transactions.map(t => {
      const meta = t.metadata ? JSON.parse(t.metadata as string) : {};
      return {
        id: t.id,
        date: t.createdAt.toISOString(),
        amount: toDualCurrency(t.amount, showDualCurrency),
        currency: showDualCurrency ? t.currency : 'EUR',
        status: t.status.toLowerCase(),
        description: t.description,
        orderId: meta.orderId,
      };
    });

    // T9 anonymous-checkout users: payment was captured via PendingSubscription
    // before a Transaction row was created. If the Transaction table is empty,
    // synthesize a history entry from the subscription itself.
    if (history.length === 0 && subscription?.payseraOrderId && subscription.planId) {
      const plan = await prisma.plan.findUnique({
        where: { id: subscription.planId },
        select: { displayName: true, priceWeeklyEur: true, priceMonthlyEur: true, priceYearlyEur: true },
      });
      if (plan) {
        let subMeta: Record<string, any> = {};
        try { if (subscription.metadata) subMeta = JSON.parse(subscription.metadata); } catch { /* ignore */ }
        const billingPeriod = (subMeta.billingPeriod ?? '').toLowerCase();
        const priceInCents = (() => {
          if (billingPeriod.includes('week') && plan.priceWeeklyEur) return plan.priceWeeklyEur;
          if (billingPeriod.includes('year')) return plan.priceYearlyEur ?? plan.priceMonthlyEur ?? 0;
          return plan.priceMonthlyEur ?? 0;
        })();
        // T9 synthetic entry: plan prices are stored in EUR (not BGN), so we
        // build the display object directly rather than routing through
        // toDualCurrency (which assumes BGN input and would mis-convert).
        // windowOpen is forced false: no BGN source exists for this EUR-native
        // price, so there is nothing to show even when the transition window is open.
        const eurAmount = priceInCents / 100;
        history.push({
          id: subscription.payseraOrderId,
          date: subscription.currentPeriodStart.toISOString(),
          amount: { bgn: null, eur: eurAmount, windowOpen: false },
          currency: 'EUR',
          status: 'completed',
          description: `Subscription: ${plan.displayName}`,
          orderId: subscription.payseraOrderId,
        });
      }
    }

    return res.json({ history });
  }

  const stripeInvoices = await stripeService.stripe.invoices.list({
    subscription: subscription.stripeSubscriptionId,
    limit: 5,
  });

  const history = stripeInvoices.data.map(inv => ({
    id: inv.id,
    date: new Date(inv.created * 1000).toISOString(),
    amount: { bgn: null, eur: (inv.amount_paid ?? inv.amount_due ?? 0) / 100, windowOpen: false },
    currency: 'EUR',
    status: inv.status ?? 'unknown',
    pdfUrl: inv.invoice_pdf,
  }));

  res.json({ history });
}));

/**
 * POST /api/subscriptions/create
 * Create new subscription (BASIC or PREMIUM only via Stripe).
 * The PREMIUM_WEEKLY plan must be purchased via POST /api/payments/subscription (Paysera).
 */
const createSchema = z.object({
  plan: z.enum(['BASIC', 'PREMIUM_MONTHLY']),
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
  plan: z.enum(['PREMIUM_WEEKLY', 'BASIC', 'PREMIUM_MONTHLY']),
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

// Redirect/callback URLs for Paysera change-card flow. These MUST be set in any
// non-local environment, otherwise users get redirected to a dead URL after
// paying. Fall back to the correct local-dev origins (partner app :3021,
// backend :3025 — matching .env / .env.example) and log a loud warning so a
// misconfigured deploy is caught instead of silently sending users to localhost.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3021';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3025';

if (!process.env.FRONTEND_URL) {
  logger.warn(`[subscriptions] FRONTEND_URL is not set — falling back to "${FRONTEND_URL}". Paysera change-card accept/cancel redirects will be wrong in any non-local environment. Set FRONTEND_URL.`);
}
if (!process.env.API_BASE_URL) {
  logger.warn(`[subscriptions] API_BASE_URL is not set — falling back to "${API_BASE_URL}". The Paysera change-card callback URL will be wrong in any non-local environment. Set API_BASE_URL.`);
}

/**
 * POST /api/subscriptions/:id/change-card
 *
 * Paysera subscriptions: since Paysera does not support card tokenisation in
 * this integration, "change card" is implemented as an early-renewal payment.
 * The user is redirected to Paysera where they choose any supported payment
 * method. On success the callback extends the current period by one full
 * billing cycle and records the new Paysera order ID.
 *
 * Stripe subscriptions: returns a Stripe billing-portal session URL so the
 * user can update their saved card through Stripe's hosted UI.
 */
router.post('/:id/change-card', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const subscription = await subscriptionService.getActiveSubscription(req.user!.id);
  if (!subscription || subscription.id !== id) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  // --- Stripe path ---
  if (subscription.stripeSubscriptionId) {
    const returnUrl = `${FRONTEND_URL}/subscription`;
    const portalSession = await stripeService.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId!,
      return_url: returnUrl,
    });
    return res.json({ type: 'stripe', url: portalSession.url });
  }

  // --- Paysera path ---
  // Determine renewal price from subscription metadata (set at subscription creation time).
  const meta = subscription.metadata ? JSON.parse(subscription.metadata as string) : {};
  const priceInCents: number | undefined = meta.priceInCents;
  const billingPeriod: string = meta.billingPeriod || 'monthly';

  if (!priceInCents || priceInCents <= 0) {
    return res.status(400).json({ error: 'Cannot determine subscription renewal price' });
  }

  // Guard against double-initiation: if the user opens two tabs and clicks the
  // button twice, the second request would overwrite pendingCardUpdateOrderId and
  // the first payment's callback would be silently dropped (money lost, no renewal).
  // TTL: treat the pending order as stale after 2 h so that an abandoned browser
  // session (tab closed mid-payment, Paysera never called back) does not
  // permanently block the user. Paysera payment sessions expire well before this.
  if (meta.pendingCardUpdateOrderId) {
    const pendingAgeMs = meta.pendingCardUpdateAt
      ? Date.now() - new Date(meta.pendingCardUpdateAt).getTime()
      : Infinity;
    const CARD_UPDATE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (pendingAgeMs < CARD_UPDATE_TTL_MS) {
      return res.status(409).json({ error: 'A card update is already in progress. Please complete or cancel the current payment before starting a new one.' });
    }
    // Stale pending order — fall through and allow a fresh initiation.
    logger.warn(`Clearing stale pendingCardUpdateOrderId ${meta.pendingCardUpdateOrderId} for subscription ${id} (age ${Math.round(pendingAgeMs / 60000)} min)`);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { email: true, firstName: true, lastName: true },
  });

  const orderId = `BOOM-CU-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Store the pending card-update order ID so the subscription callback can
  // recognise it and extend the period instead of creating a new subscription.
  await prisma.subscription.update({
    where: { id },
    data: {
      metadata: JSON.stringify({
        ...meta,
        pendingCardUpdateOrderId: orderId,
        pendingCardUpdateBillingPeriod: billingPeriod,
        pendingCardUpdateAt: new Date().toISOString(),
      }),
    },
  });

  const acceptUrl = `${FRONTEND_URL}/subscription?cardUpdated=true&orderId=${orderId}`;
  const cancelUrl = `${FRONTEND_URL}/subscription`;
  const callbackUrl = `${API_BASE_URL}/api/payments/subscription/callback`;

  const payment = await payseraService.createPayment({
    orderId,
    amount: priceInCents,
    currency: 'EUR',
    description: 'BoomCard — обновяване на начин на плащане',
    acceptUrl,
    cancelUrl,
    callbackUrl,
    customerEmail: user?.email,
    customerName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email,
    lang: 'BUL',
    country: 'BG',
  });

  return res.json({ type: 'paysera', paymentUrl: payment.paymentUrl, orderId });
}));

export default router;
