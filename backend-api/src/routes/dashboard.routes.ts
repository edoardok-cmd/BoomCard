import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { subscriptionService } from '../services/subscription.service';
import { walletService } from '../services/wallet.service';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../lib/prisma';

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
  const receipts = scans.map((s) => ({
    id: s.id,
    merchantName: s.venue?.name ?? null,
    totalAmount: s.verifiedAmount ?? s.billAmount,
    cashbackAmount: s.cashbackAmount ?? 0, // INV-RDM-057: authoritative source is StickerScan.cashbackAmount
    status: SCAN_TO_RECEIPT_STATUS[s.status] ?? 'PENDING',
    createdAt: s.createdAt,
  }));

  const resolvedSubscription = subscription
    ? { ...subscription, benefits: await subscriptionService.getPlanBenefits(subscription.plan) }
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
