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
    : null;

  // Show upgrade-to-Premium-Monthly prompt for BASIC or Premium Weekly subscribers only (per spec §6.1)
  const subMetadata = resolvedSubscription ? (() => {
    try { return (resolvedSubscription as any).metadata ? JSON.parse((resolvedSubscription as any).metadata) : {}; }
    catch { return {}; }
  })() : {};
  const billingPeriod = ((subMetadata.billingPeriod ?? '') as string).toLowerCase();
  // F-007 fix: was incorrectly checking for 'PREMIUM_MONTHLY' — should check 'PREMIUM_WEEKLY'.
  // The second clause (PREMIUM_MONTHLY && billingPeriod.includes('week')) was removed:
  // a PREMIUM_MONTHLY row having a weekly billingPeriod is contradictory and should
  // not occur in normal operation. If a legacy migration scenario requires it, a
  // targeted data migration should normalise the plan column rather than branching here.
  const isPremiumWeekly = resolvedSubscription?.plan === 'PREMIUM_WEEKLY';

  res.json({
    subscription: resolvedSubscription,
    wallet,
    receipts,
    nextPaymentDate: (resolvedSubscription && 'currentPeriodEnd' in resolvedSubscription ? resolvedSubscription.currentPeriodEnd : null) ?? null,
    showUpgradePrompt: resolvedSubscription ? ((resolvedSubscription.plan === 'BASIC' || isPremiumWeekly) && resolvedSubscription.status === 'ACTIVE') : false,
  });
}));

export default router;
