import { Router, Response, Request } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
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
    return res.status(404).json({
      success: false,
      message: 'Subscription not found',
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
  const plans = ['LIGHT', 'BASIC', 'PREMIUM'].map(plan => ({
    plan,
    ...subscriptionService.getPlanBenefits(plan as any),
  }));

  res.json({ plans });
}));

/**
 * GET /api/subscriptions/current
 * Get user's current subscription
 */
router.get('/current', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const subscription = await subscriptionService.getActiveSubscription(userId);

  if (!subscription) {
    return res.json({
      plan: 'LIGHT',
      status: 'ACTIVE',
      benefits: subscriptionService.getPlanBenefits('LIGHT'),
    });
  }

  res.json({
    ...subscription,
    benefits: subscriptionService.getPlanBenefits(subscription.plan),
  });
}));

/**
 * POST /api/subscriptions/create
 * Create new subscription
 */
const createSchema = z.object({
  plan: z.enum(['LIGHT', 'BASIC', 'PREMIUM']),
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
 * POST /api/subscriptions/:id/cancel
 * Cancel subscription
 */
const cancelSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
});

router.post('/:id/cancel', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { cancelAtPeriodEnd } = cancelSchema.parse(req.body);

  const subscription = await subscriptionService.cancelSubscription(id, cancelAtPeriodEnd);

  res.json(subscription);
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

  const subscription = await subscriptionService.updateSubscriptionPlan(id, plan);

  res.json(subscription);
}));

export default router;
