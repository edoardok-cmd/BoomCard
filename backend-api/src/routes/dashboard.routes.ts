import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { walletService } from '../services/wallet.service';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /api/dashboard/me
 * Aggregate: subscription status + cashback balances + last 3 receipts
 */
router.get('/me', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [subscription, wallet, receipts] = await Promise.all([
    subscriptionService.getActiveSubscription(userId),
    walletService.getBalance(userId),
    prisma.receipt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        merchantName: true,
        totalAmount: true,
        cashbackAmount: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const resolvedSubscription = subscription
    ? { ...subscription, benefits: await subscriptionService.getPlanBenefits(subscription.plan) }
    : { plan: 'LIGHT', status: 'ACTIVE', benefits: await subscriptionService.getPlanBenefits('LIGHT') };

  // Show upgrade-to-Premium-Monthly prompt for BASIC or Premium Weekly subscribers only (per spec §6.1)
  const subMetadata = (() => {
    try { return (resolvedSubscription as any).metadata ? JSON.parse((resolvedSubscription as any).metadata) : {}; }
    catch { return {}; }
  })();
  const billingPeriod = ((subMetadata.billingPeriod ?? '') as string).toLowerCase();
  const isPremiumWeekly = resolvedSubscription.plan === 'PREMIUM' && billingPeriod.includes('week');

  res.json({
    subscription: resolvedSubscription,
    wallet,
    receipts,
    nextPaymentDate: ('currentPeriodEnd' in resolvedSubscription ? resolvedSubscription.currentPeriodEnd : null) ?? null,
    showUpgradePrompt: (resolvedSubscription.plan === 'BASIC' || isPremiumWeekly) && resolvedSubscription.status === 'ACTIVE',
  });
}));

export default router;
