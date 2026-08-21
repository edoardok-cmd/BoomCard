import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireActiveSubscription } from '../middleware/auth.middleware';
import { walletService } from '../services/wallet.service';
import { asyncHandler } from '../utils/asyncHandler';
import { paymentRateLimiter } from '../middleware/security.middleware';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { WalletTransactionStatus, WalletTransactionType } from '@prisma/client';
import { parsePagination } from '../utils/pagination';
import { logger } from '../utils/logger';
import { bgnToEur, toEur, displayCurrency, foldMixedCurrencyToEur, isAcceptedCurrency } from '../utils/currency';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * DEFENSE-IN-DEPTH ACCOUNT STATUS GATING (BC-ADMIN-SPEC-REAUDIT-SCANGATE-INACTIVE-1)
 *
 * Spec §2 and §8.1 rule 1: Operational wallet write endpoints (POST /topup)
 * mount requireActiveSubscription middleware to check account status BEFORE
 * subscription status. Spec §1.2 + §13.1 exempt account-maintenance endpoints
 * (PUT /payout-account) from this gate — INACTIVE users may update their
 * payout details but cannot initiate payments or top-ups.
 */

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
 *
 * Defense-in-depth account status check: requireActiveSubscription middleware
 * (Spec §2, §8.1 rule 1) blocks INACTIVE/ARCHIVED/DELETED users from
 * operational write endpoints (which includes wallet top-ups).
 */
router.post('/topup', requireActiveSubscription, asyncHandler(async (req: AuthRequest, res: Response) => {
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
 *
 * NOTE: Spec §1.2 + §13.1 explicitly permit INACTIVE users to enter/update their
 * payout account (read-mostly maintenance, not an operational scanning write).
 * Therefore, this endpoint does NOT mount requireActiveSubscription — INACTIVE
 * users may update their payout details, but cannot initiate payouts.
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

  // Spec §1.2 + §13.1: "Enter or update IBAN" = Yes for Inactive accounts.
  // This is read-mostly account maintenance, not an operational scanning/payout write,
  // so INACTIVE users are explicitly permitted to enter/update their payout account.
  // (Reverses the prior F-002 decision, which misread §1.2.) Scanning and
  // payout-initiation remain blocked for INACTIVE accounts elsewhere.

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

  try {
    const wallet = await walletService.getOrCreateWallet(userId);

    // `currency` is part of the grouping key (BC-QA-031-FOLLOWUP-1 task-r1 F1).
    //
    // It used to group by `type` alone, and the comment here claimed the result
    // was safe because "WalletTransaction.currency is copied from the wallet".
    // That was false twice over: `walletService.credit()`/`debit()`, the void
    // path and the withdrawal path all OMIT the column and rely on
    // `@default("BGN")` (only the admin adjust route copies `wallet.currency`);
    // and even if every writer had copied it, a `groupBy` without `currency` in
    // its key sums across whatever currencies are present regardless. With one
    // 50.00 USD and one 40.00 EUR row seeded, `totalTopups` came back 156.02
    // under `"currency":"EUR"` — the USD magnitude divided by the BGN peg and
    // labelled euros. That is the exact `{ amount: converted, currency: EUR }`
    // shape this task exists to remove, one aggregation level up.
    const stats = await prisma.walletTransaction.groupBy({
      by: ['type', 'currency'],
      where: {
        walletId: wallet.id,
        status: WalletTransactionStatus.COMPLETED,
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    /** Fold one transaction type's per-currency subtotals into a EUR figure. */
    const foldType = (type: WalletTransactionType, absolute = false) =>
      foldMixedCurrencyToEur(
        stats
          .filter(s => s.type === type)
          .map(s => ({
            currency: s.currency,
            amount: absolute ? Math.abs(s._sum.amount ?? 0) : (s._sum.amount ?? 0),
            count: typeof s._count === 'number' ? s._count : undefined,
          })),
      );

    const cashback = foldType(WalletTransactionType.CASHBACK_CREDIT);
    const topups = foldType(WalletTransactionType.TOP_UP);
    const spent = foldType(WalletTransactionType.PURCHASE, true);

    // Re-fold the per-(type, currency) rows back to one entry per type for the
    // wire, so splitting the grouping key does not split the reported breakdown.
    //
    // THROUGH THE FOLD, not through `toEur` per row (impl-r4 F9). `toEur`
    // deliberately returns an out-of-domain amount UNCONVERTED — that is its
    // documented legacy-row contract, and it is only honest when the caller
    // also carries the row's own label. Here there is no per-row label to
    // carry: the whole response asserts `currency: EUR`. Summing `toEur` per
    // row therefore added a raw 50 USD straight into a EUR-labelled figure, so
    // `transactionsByType[TOP_UP]._sum.amount` read 200.00 three fields below
    // an honest `totalTopups` of 150.00 — arguably worse than before the fix,
    // since the pre-fix code at least divided that magnitude by the peg.
    // Folding per type drops what it cannot convert and counts it as excluded.
    const byType = new Map<
      string,
      { type: string; _count: number; _sum: { amount: number | null }; excludedCount: number }
    >();
    for (const type of new Set(stats.map((s) => s.type))) {
      const fold = foldMixedCurrencyToEur(
        stats
          .filter((s) => s.type === type)
          .map((s) => ({
            currency: s.currency,
            amount: s._sum.amount ?? 0,
            count: typeof s._count === 'number' ? s._count : 0,
          })),
      );
      byType.set(type, {
        type,
        // The count describes the rows the amount covers, as everywhere else.
        _count: fold.includedCount,
        _sum: { amount: fold.total },
        excludedCount: fold.excludedCount,
      });
    }

    // Exclusions are counted over EVERY type present, not just the three the
    // named totals cover (impl-r4 F9): a USD WITHDRAWAL row appears in
    // `transactionsByType` but in none of cashback/topups/spent, so it used to
    // be excluded from no fold and counted in no exclusion — invisible to a
    // client reading the response.
    const perTypeExcluded = Array.from(byType.values()).reduce((n, t) => n + t.excludedCount, 0);
    const excludedCurrencies = Array.from(
      new Set(
        stats
          .filter((s) => s.currency != null && !isAcceptedCurrency(s.currency))
          .map((s) => String(s.currency).trim().toUpperCase()),
      ),
    ).sort();

    // The wallet's own balance columns are denominated in `Wallet.currency`
    // (BGN by write policy; see WALLET_LEDGER_CURRENCIES) — convert keyed on
    // that column (BC-QA-031 — EUR-only responses).
    res.json({
      totalCashback: cashback.total,
      totalTopups: topups.total,
      totalSpent: spent.total,
      currentBalance: toEur(wallet.balance, wallet.currency),
      availableBalance: toEur(wallet.availableBalance, wallet.currency),
      pendingBalance: toEur(wallet.pendingBalance, wallet.currency),
      transactionsByType: Array.from(byType.values()),
      currency: displayCurrency(wallet.currency),
      // What the totals above could NOT account for: rows whose stored currency
      // has no conversion rate. Zero for any database without legacy rows.
      excludedCount: perTypeExcluded,
      excludedCurrencies,
    });
  } catch (error: any) {
    logger.error('Error fetching wallet statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet statistics',
    });
  }
}));

export default router;
