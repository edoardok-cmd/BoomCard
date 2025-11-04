import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

/**
 * GET /api/subscriptions/plans
 * Get available subscription plans
 */
router.get('/plans', asyncHandler(async (req: AuthRequest, res: Response) => {
  const plans = ['STANDARD', 'PREMIUM', 'PLATINUM'].map(plan => ({
    plan,
    ...subscriptionService.getPlanBenefits(plan as any),
  }));

  res.json({ plans });
}));

/**
 * GET /api/subscriptions/current
 * Get user's current subscription
 */
router.get('/current', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const subscription = await subscriptionService.getActiveSubscription(userId);

  if (!subscription) {
    return res.json({
      plan: 'STANDARD',
      status: 'ACTIVE',
      benefits: subscriptionService.getPlanBenefits('STANDARD'),
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
  plan: z.enum(['STANDARD', 'PREMIUM', 'PLATINUM']),
  paymentMethodId: z.string().optional(),
});

router.post('/create', asyncHandler(async (req: AuthRequest, res: Response) => {
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

router.post('/:id/cancel', asyncHandler(async (req: AuthRequest, res: Response) => {
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
  plan: z.enum(['STANDARD', 'PREMIUM', 'PLATINUM']),
});

router.post('/:id/update-plan', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { plan } = updatePlanSchema.parse(req.body);

  const subscription = await subscriptionService.updateSubscriptionPlan(id, plan);

  res.json(subscription);
}));

export default router;
