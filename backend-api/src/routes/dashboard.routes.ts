import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { walletService } from '../services/wallet.service';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../lib/prisma';
import { isCurrencyTransitionWindowOpen, toDualCurrency } from '../utils/currencyDisplay';

const router = Router();

/**
 * GET /api/dashboard/me
 * Aggregate: subscription status + cashback balances + last 3 transactions (§3.5.1)
 *
 * M4 (user-spec audit): recent transactions now read the StickerScan pipeline, not
 * the Receipt model. Direct Receipt submission is RETIRED (receipts.routes.ts returns
 * 410) — the live cashback pipeline creates StickerScan rows, so the Receipt table is
 * no longer populated and the old query rendered stale/empty. We map each scan to the
 * shape the dashboard previously returned. The user-facing cashback figure is read
 * directly from StickerScan.cashbackAmount (INV-RDM-057), which is the authoritative
 * formula result and is non-zero even before a wallet credit is issued.
 */
router.get('/me', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Resolve the currency transition window state ONCE before any data fetch so that
  // all money fields in this response (receipts and the wallet block returned by
  // walletService.getBalance) share the same snapshot (INV-USER-CUR-003).
  const showDualCurrency = await isCurrencyTransitionWindowOpen();

  const [subscription, wallet, scans] = await Promise.all([
    subscriptionService.getActiveSubscription(userId),
    walletService.getBalance(userId),
    prisma.stickerScan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        billAmount: true,
        verifiedAmount: true,
        status: true,
        createdAt: true,
        venue: { select: { name: true } },
        cashbackAmount: true,
      },
    }),
  ]);

  // L (user-spec audit): normalize the StickerScan ScanStatus enum back to the
  // ReceiptStatus vocabulary the dashboard emitted pre-M4, so switching the
  // recent-transactions source from Receipt → StickerScan is NOT a silent
  // response-contract change for existing clients. ScanStatus shares all values
  // with ReceiptStatus except SESSION_ACTIVE (a scan session opened but no
  // receipt submitted/processed yet) — that has no Receipt equivalent and is
  // surfaced as PENDING (awaiting review), matching the user-facing "Pending
  // Review" label in spec §4.4. Any unknown future value falls back to PENDING.
  const SCAN_TO_RECEIPT_STATUS: Record<string, string> = {
    PENDING: 'PENDING',
    VALIDATING: 'VALIDATING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    MANUAL_REVIEW: 'MANUAL_REVIEW',
    EXPIRED: 'EXPIRED',
    SESSION_ACTIVE: 'PENDING',
  };

  // Map scans to the dashboard "recent transactions" shape (§3.5.1).
  // INV-USER-CUR-003: all monetary amounts must go through the currency transition
  // window gate — raw BGN scalars must never be serialized to the user surface.
  const receipts = scans.map((s) => ({
    id: s.id,
    merchantName: s.venue?.name ?? null,
    totalAmount: toDualCurrency(s.verifiedAmount ?? s.billAmount ?? 0, showDualCurrency),
    cashbackAmount: toDualCurrency(s.cashbackAmount ?? 0, showDualCurrency), // INV-RDM-057: authoritative source is StickerScan.cashbackAmount
    status: SCAN_TO_RECEIPT_STATUS[s.status] ?? 'PENDING',
    createdAt: s.createdAt,
  }));

  // INV-RDM-081: strip payment-provider ids and internal metadata before sending.
  // getActiveSubscription returns the full Prisma row (other callers in
  // subscriptions.routes.ts need stripeSubscriptionId/payseraOrderId to perform
  // Stripe/Paysera operations). Here we allow only the client-visible fields.
  const resolvedSubscription = subscription
    ? {
        id: subscription.id,
        userId: subscription.userId,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelAt: subscription.cancelAt,
        canceledAt: subscription.canceledAt,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
        autoRenewal: subscription.autoRenewal,
        pauseEndsAt: subscription.pauseEndsAt,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        benefits: await subscriptionService.getPlanBenefits(subscription.plan),
      }
    : null;

  // Show upgrade-to-Premium-Monthly prompt for BASIC or Premium Weekly subscribers only (per spec §6.1)
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
