import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { walletService } from '../services/wallet.service';
import { asyncHandler } from '../utils/asyncHandler';
import { paymentRateLimiter } from '../middleware/security.middleware';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { WalletTransactionStatus, WalletTransactionType } from '@prisma/client';
import { parsePagination } from '../utils/pagination';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/wallet/balance
 * Get wallet balance
 */
router.get('/balance', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const balance = await walletService.getBalance(userId);

  res.json(balance);
}));

/**
 * GET /api/wallet/transactions
 * Get wallet transaction history.
 *
 * F-012: Added ?status and ?period query params per spec §9.5.
 *   ?status=PENDING|CLEARED|LOCKED|PAID|EXPIRED|VOIDED  — filter by cashbackStatus
 *   ?period=7d|30d|all                                   — filter by createdAt relative window
 */
router.get('/transactions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const { type, status, period } = req.query;

  // Clamp limit/offset so a non-numeric/negative/zero/over-max value can never
  // reach Prisma malformed (skip = the offset-derived value from parsePagination).
  const { take: limit, skip: offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  const result = await walletService.getTransactions(userId, {
    type: type as any,
    limit,
    offset,
    cashbackStatus: status as any,
    period: period as any,
  });

  res.json(result);
}));

/**
 * POST /api/wallet/topup
 * Top up wallet with Paysera payment
 * NOTE: This endpoint redirects to Paysera payment gateway
 * Use /api/payments/create for direct payment creation
 */
router.post('/topup', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Wallet top-ups are now handled by Paysera payment gateway
  // Redirect to /api/payments/create endpoint
  res.status(308).json({
    success: false,
    message: 'Wallet top-ups are now handled by /api/payments/create endpoint',
    redirectTo: '/api/payments/create',
    instructions: 'Please use the Paysera payment endpoint to top up your wallet',
  });
}));

/**
 * PUT /api/wallet/payout-account
 * Save the user's payout bank account (IBAN + beneficiary name) without initiating a payout.
 * These are stored on the wallet and reused on subsequent payout requests.
 */
const payoutAccountSchema = z.object({
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine((v) => /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v), 'Invalid IBAN format'),
  beneficiaryName: z.string().min(2).max(100),
});

router.put('/payout-account', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // F-002: Spec §1.2 — INACTIVE users must not be able to perform operational writes.
  // Payout account update is an operational write path; block INACTIVE accounts.
  const liveUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  }).catch(() => null);
  if ((liveUser?.status as string) === 'INACTIVE') {
    return res.status(403).json({
      success: false,
      message: 'ACCOUNT_INACTIVE: Account is inactive. Contact support to reactivate.',
    });
  }

  const parseResult = payoutAccountSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid payout account details',
      errors: parseResult.error.issues,
    });
  }

  const { iban, beneficiaryName } = parseResult.data;
  await walletService.updatePayoutAccount(userId, { iban, beneficiaryName });

  res.json({ success: true, iban, beneficiaryName });
}));

// F-013: POST /api/wallet/payout user-facing endpoint REMOVED per spec §7.1.
// Spec §7.1 states: "There is no user-initiated payout action — there is no
// 'Request Payout' button or endpoint." Payouts are triggered automatically
// by the nightly scheduler (jobs/scheduler.ts) or by admin approval flow.
// The walletService.requestPayout() method is retained for internal/scheduler use only.
// If an admin endpoint exists for manually triggering payouts, it is managed via
// the admin routes (routes/adminPayouts.routes.ts) — only the user-accessible
// path is removed here.

/**
 * GET /api/wallet/statistics
 * Get wallet statistics
 */
router.get('/statistics', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const wallet = await walletService.getOrCreateWallet(userId);

  const stats = await prisma.walletTransaction.groupBy({
    by: ['type'],
    where: {
      walletId: wallet.id,
      status: WalletTransactionStatus.COMPLETED,
    },
    _sum: {
      amount: true,
    },
    _count: true,
  });

  const totalCashback = stats
    .filter(s => s.type === WalletTransactionType.CASHBACK_CREDIT)
    .reduce((sum, s) => sum + (s._sum.amount || 0), 0);

  const totalTopups = stats
    .filter(s => s.type === WalletTransactionType.TOP_UP)
    .reduce((sum, s) => sum + (s._sum.amount || 0), 0);

  const totalSpent = stats
    .filter(s => s.type === WalletTransactionType.PURCHASE)
    .reduce((sum, s) => sum + Math.abs(s._sum.amount || 0), 0);

  res.json({
    totalCashback,
    totalTopups,
    totalSpent,
    currentBalance: wallet.balance,
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    transactionsByType: stats,
  });
}));

export default router;
