import crypto from 'crypto';
import { Prisma, SubscriptionPlan, WalletTransactionType, WalletTransactionStatus, CashbackEntryStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { CASHBACK_VALIDITY_DAYS, EUR_TO_BGN_RATE } from '../constants/receipt.constants';
import { getPayoutThresholdBGN } from '../utils/payoutThreshold';
import { payseraService } from './paysera.service';
import { notificationService } from './notification.service';
import { fireAutomation } from '../lib/automationDispatcher';
import { getSystemSettingInt } from '../utils/systemSettings';
import { isCurrencyTransitionWindowOpen } from '../utils/currencyDisplay';
import { cashbackLifecycleService, SYSTEM_ACTOR_ID, TRIAL_VOID_REASON } from './cashbackLifecycle.service';
import { AppError } from '../middleware/error.middleware';
import { detach } from '../utils/detach';
import { reasonIndicatesIbanProblem } from '../utils/payoutFailureReason';
import { resolvePayoutEligibility } from './payoutEligibility.service';
import { RISK_HOLD_FLOOR_SCORE } from './userRisk.service';
import { validateIBAN, ValidationError } from '../utils/validation';

// ── User-facing payout-status masking (Spec §3.2 / §3.7) ─────────────────────
// Spec §3.7 (line 461): on the SECOND failed payout the record routes to manual
// review, the user is NOT notified, and it still reads "Sent to payout" from the
// user's perspective. That is the ONLY state the spec mandates be hidden. The
// strike logic stamps WITHDRAWAL rows as RISK_HOLD on the second failure. We mask
// RISK_HOLD → PROCESSING server-side so the "Sent to payout" label is enforced at
// the API boundary and does not depend on a frontend relabel.
//
// Spec §3.2 (line 336): on the FIRST failed payout the user IS notified to check
// their IBAN and the WITHDRAWAL is reversed (a paired COMPLETED ADJUSTMENT credit
// is written). The user legitimately sees that failure alongside its reversal
// credit, so a normal reversed first-failure FAILED row is NOT masked — masking it
// would show a phantom in-flight "Sent to payout" payout next to its own reversal,
// which the spec does not call for.
//
// FAILED is masked ONLY on WITHDRAWAL rows that were NOT reversed (no paired
// ADJUSTMENT credit) — i.e. the rare race where the reversal failed to land. In
// that case the user has neither a refund nor an in-flight payout; surfacing a raw
// FAILED is misleading, so we mask it defensively to "Sent to payout".
//
// Only WITHDRAWAL (payout) rows are affected; every other transaction type passes
// through untouched. Admin-facing payout APIs (adminPayouts.routes) read the raw
// status directly and are intentionally NOT routed through this helper.

/**
 * Extract the withdrawal id a reversal ADJUSTMENT refers to, from its metadata
 * (`{ reversedWithdrawalId }`). Returns null when the row is not a reversal.
 */
function reversedWithdrawalIdOf(tx: { type: WalletTransactionType; metadata?: string | null }): string | null {
  if (tx.type !== WalletTransactionType.ADJUSTMENT || !tx.metadata) return null;
  try {
    const parsed = JSON.parse(tx.metadata);
    const id = parsed?.reversedWithdrawalId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function maskUserFacingPayoutStatus<
  T extends { id?: string; type: WalletTransactionType; status: WalletTransactionStatus }
>(
  tx: T,
  reversedWithdrawalIds?: ReadonlySet<string>,
): T {
  if (tx.type !== WalletTransactionType.WITHDRAWAL) return tx;

  // Second-failure escalation — spec §3.7 requires this to read "Sent to payout".
  if (tx.status === WalletTransactionStatus.RISK_HOLD) {
    return { ...tx, status: WalletTransactionStatus.PROCESSING };
  }

  // First-failure FAILED: only mask when it was NOT reversed (no paired credit).
  // A reversed first-failure row surfaces honestly alongside its reversal credit.
  if (tx.status === WalletTransactionStatus.FAILED) {
    const isReversed = !!(tx.id && reversedWithdrawalIds?.has(tx.id));
    if (!isReversed) {
      return { ...tx, status: WalletTransactionStatus.PROCESSING };
    }
  }

  return tx;
}

/**
 * Apply user-facing payout-status masking to a page of transactions, resolving
 * which FAILED withdrawals were reversed from the ADJUSTMENT rows present in the
 * same page (the reversal credit is written in the same wallet history).
 */
export function maskUserFacingPayoutStatuses<
  T extends { id?: string; type: WalletTransactionType; status: WalletTransactionStatus; metadata?: string | null }
>(
  txs: T[],
): T[] {
  const reversedWithdrawalIds = new Set<string>();
  for (const tx of txs) {
    const id = reversedWithdrawalIdOf(tx);
    if (id) reversedWithdrawalIds.add(id);
  }
  return txs.map((tx) => maskUserFacingPayoutStatus(tx, reversedWithdrawalIds));
}

// ── Service ────────────────────────────────────────────────────────────────────

export class WalletService {
  /**
   * Get or create wallet for user
   */
  async getOrCreateWallet(userId: string) {
    return prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: 0,
        availableBalance: 0,
        pendingBalance: 0,
      },
    });
  }

  /**
   * Get wallet balance.
   * Cashback expiry is intentionally NOT run here — it is handled by a
   * nightly cron job (jobs/scheduler.ts, runCashbackExpiry) to keep reads lightweight.
   */
  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    // Resolve payout threshold and eligibility. The query mirrors requestPayout()'s
    // Step B exactly: ACTIVE, TRIALING, or CANCELLED-within-paid-period.
    // PAUSED is intentionally excluded — requestPayout() blocks it with a 402,
    // so canRequestPayout must also be false for PAUSED subscribers.
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          { status: { in: ['ACTIVE', 'TRIALING'] } },
          { status: 'CANCELLED' as any, currentPeriodEnd: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    const plan: SubscriptionPlan = subscription?.plan ?? 'PREMIUM_WEEKLY';
    const threshold = await getPayoutThresholdBGN(plan);

    // Spec §8.1 point 3 — Payout eligibility gate for the wallet info display.
    // FAILED_PAYMENT blocks payout. Cancelled-within-paid-period allows payout.
    const latestSub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, currentPeriodEnd: true },
    });
    const hasFailedPayment = latestSub?.status === 'FAILED_PAYMENT';

    // Spec §8.1 point 3: new payouts allowed when subscription is Active or
    // Cancelled-within-paid-period (currentPeriodEnd still in the future).
    // "Cancelled post-period" → blocked (same as Expired).
    const walletNow = new Date();
    const hasEligibleSubscription =
      !!subscription && (
        subscription.status === 'ACTIVE' ||
        subscription.status === 'TRIALING' ||
        (subscription.status === 'CANCELLED' &&
          subscription.currentPeriodEnd != null &&
          subscription.currentPeriodEnd > walletNow)
      );

    const pendingAgg = await prisma.walletTransaction.aggregate({
      where: { walletId: wallet.id, cashbackStatus: { in: [CashbackEntryStatus.PENDING, CashbackEntryStatus.TRIAL_PENDING] } },
      _sum: { amount: true },
    });
    const computedPendingBalance = pendingAgg._sum.amount ?? 0;

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiringAgg = await prisma.walletTransaction.aggregate({
      where: {
        walletId: wallet.id,
        cashbackStatus: CashbackEntryStatus.CLEARED,
        cashbackExpiresAt: { lte: sevenDaysFromNow, gt: new Date() },
      },
      _sum: { amount: true },
    });
    const expiringBalance = expiringAgg._sum.amount ?? 0;

    const hasIban = !!wallet.payoutIban && wallet.payoutIban.trim().length > 0;

    // Spec §8.1 rule 4: Currency transition window is controlled by a single source of truth
    // (the DB SystemSetting 'currency_transition_window_open'), which is shared with the admin
    // finance/payout display. This ensures both user and admin sides show the same window state.
    const showDualCurrency = await isCurrencyTransitionWindowOpen();

    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      pendingBalance: computedPendingBalance,
      expiringBalance,
      currency: wallet.currency,
      // Dual-currency display. When showDualCurrency is true, both BGN and EUR
      // amounts are included so clients can render a transition-mode display.
      // When the transition window is closed, only EUR fields are populated.
      ...(showDualCurrency
        ? {
            balanceBGN: wallet.balance,
            availableBalanceBGN: wallet.availableBalance,
            pendingBalanceBGN: computedPendingBalance,
            expiringBalanceBGN: expiringBalance,
            balanceEUR: parseFloat((wallet.balance / EUR_TO_BGN_RATE).toFixed(2)),
            availableBalanceEUR: parseFloat((wallet.availableBalance / EUR_TO_BGN_RATE).toFixed(2)),
            // Spec §17/§6.6: during the BGN→EUR window all amounts are shown in both
            // currencies, including pending and expiring balances.
            pendingBalanceEUR: parseFloat((computedPendingBalance / EUR_TO_BGN_RATE).toFixed(2)),
            expiringBalanceEUR: parseFloat((expiringBalance / EUR_TO_BGN_RATE).toFixed(2)),
          }
        : {
            balanceEUR: parseFloat((wallet.balance / EUR_TO_BGN_RATE).toFixed(2)),
            availableBalanceEUR: parseFloat((wallet.availableBalance / EUR_TO_BGN_RATE).toFixed(2)),
          }),
      isLocked: wallet.isLocked,
      lastUpdated: wallet.updatedAt,
      payoutThreshold: parseFloat(threshold.toFixed(2)),
      payoutThresholdEUR: parseFloat((threshold / EUR_TO_BGN_RATE).toFixed(2)),
      canRequestPayout: !wallet.isLocked
        && wallet.availableBalance >= threshold
        && hasEligibleSubscription
        && !hasFailedPayment
        && hasIban,
      subscriptionStatus: subscription?.status ?? null,
      payoutIban: wallet.payoutIban ?? null,
      payoutBeneficiaryName: wallet.payoutBeneficiaryName ?? null,
    };
  }

  /**
   * Credit wallet (add funds)
   * CASHBACK_CREDIT transactions automatically receive a dynamic expiry window
   * (default 60 days, configurable via the cashback_expiry_days system setting).
   */
  async credit(params: {
    userId: string;
    amount: number;
    type: WalletTransactionType;
    description?: string;
    metadata?: any;
    transactionId?: string;
    receiptId?: string;
    stickerScanId?: string;
    stripePaymentIntentId?: string;
  }) {
    const { userId, amount, type, description, metadata, ...links } = params;

    if (amount <= 0) {
      throw new Error('Credit amount must be positive');
    }

    // Audit-pass [1.3]: idempotency probe — if a wallet credit already exists
    // for this stickerScanId (regardless of cashbackStatus), don't double-credit.
    // Catches the fallback path in approveScan that fires when the PENDING-row
    // lookup misses; without this, a stale PENDING ghost + a fresh credit row
    // would both exist for the same scan.
    if (type === WalletTransactionType.CASHBACK_CREDIT && links.stickerScanId) {
      const existing = await prisma.walletTransaction.findFirst({
        where: {
          stickerScanId: links.stickerScanId,
          type: WalletTransactionType.CASHBACK_CREDIT,
        },
      });
      if (existing) {
        logger.warn(`[wallet.credit] duplicate credit suppressed for stickerScanId=${links.stickerScanId} (existing tx ${existing.id}, status=${existing.cashbackStatus})`);
        const wallet = await this.getOrCreateWallet(userId);
        return { wallet, transaction: existing };
      }
    }

    const wallet = await this.getOrCreateWallet(userId);

    const cashbackValidityDays = await getSystemSettingInt('cashback_expiry_days', CASHBACK_VALIDITY_DAYS);
    const now = new Date();

    // F-004 APPROVED INTERPRETATION (BC-USER-SPEC-GAP-001 F-004, product sign-off
    // 2026-06-04 — spec §2.1 product-decision note):
    // Trial-period cashback is held as TRIAL_PENDING and surfaced to the user as
    // part of the "In Review / Pending verification" (pendingBalance) display — it
    // is fully VISIBLE, so this is NOT a hidden intermediate state. It is
    // intentionally excluded from the spendable/withdrawable availableBalance until
    // the 24h trial-refund window closes, because a trial refund within that window
    // voids this exact cashback (voidTrialPendingCashback); counting it as spendable
    // would allow a withdraw-then-refund clawback driving the wallet negative.
    // This "visible-as-Pending, not-yet-spendable" behaviour is the APPROVED
    // interpretation of §2.1 and is the canonical implementation — it is no longer
    // treated as a deviation requiring further sign-off. See spec §2.1
    // product-decision note (2026-06-04) and gap report BC-USER-SPEC-GAP-001 F-004.
    //
    // If the user is within their 24h trial refund window, hold cashback as
    // TRIAL_PENDING: it shows in balance but is not yet spendable/withdrawable.
    // The nightly resolveTrialPendingCashback job releases it once the window closes.
    let txStatus: WalletTransactionStatus = WalletTransactionStatus.COMPLETED;
    let isTrialPending = false;
    if (type === WalletTransactionType.CASHBACK_CREDIT) {
      const activeSub = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIALING'] },
          trialRefundEligibleUntil: { gt: now },
          trialRefundUsed: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (activeSub) {
        txStatus = WalletTransactionStatus.TRIAL_PENDING;
        isTrialPending = true;
      }
    }

    // Spec §4.4 v1.1: 60-day rolling window starts at clearedAt — NOT at credit
    // time when the entry is held back from the user. For TRIAL_PENDING credits
    // the entry sits as PENDING; resolveTrialPendingCashback() promotes it to
    // CLEARED (and stamps clearedAt + cashbackExpiresAt) once the trial window
    // closes. This keeps the 60-day clock honest — it starts when the cashback
    // becomes Available, not when the transaction was originally scanned.
    // F-010 SPEC-COMPLIANT (BC-USER-SPEC-GAP-001 F-010, spec amended 2026-06-04 —
    // §9.4/§9.5/§4.3):
    // Per the 2026-06-04 product decision, ONLY High-risk submissions show the
    // "In Review / Pending verification" state; Low and Medium risk auto-process
    // (automatic approval within 24h). This non-risk fast-path therefore correctly
    // creates Low/Medium cashback directly as CLEARED — there is no longer a
    // requirement for all submissions to dwell in an In-Review state. The risk-scored
    // path (recordPendingForRiskReview) still routes High-risk to PENDING. See spec
    // §9.4/§9.5/§4.3 amendments and gap report BC-USER-SPEC-GAP-001 F-010.
    const isClearedCashback = type === WalletTransactionType.CASHBACK_CREDIT && !isTrialPending;
    const cashbackExpiresAt = isClearedCashback
      ? new Date(now.getTime() + cashbackValidityDays * 24 * 60 * 60 * 1000)
      : undefined;
    // Spec §1.3: TrialPending cashback must be stored with cashbackStatus=TRIAL_PENDING
    // (not PENDING) so admin queries filtering cashbackStatus=TRIAL_PENDING find these
    // entries. PENDING is reserved for risk-hold entries pending manual review.
    const cashbackStatus = type === WalletTransactionType.CASHBACK_CREDIT
      ? (isTrialPending ? CashbackEntryStatus.TRIAL_PENDING : CashbackEntryStatus.CLEARED)
      : undefined;
    const clearedAt = isClearedCashback ? now : undefined;

    // Re-read wallet inside interactive transaction so isLocked is checked atomically
    // with the balance update — prevents a race where wallet is locked between our
    // pre-read and the actual write.
    let updatedWallet: Awaited<ReturnType<typeof prisma.wallet.update>>;
    let walletTransaction: Awaited<ReturnType<typeof prisma.walletTransaction.create>>;
    try {
      [updatedWallet, walletTransaction] = await prisma.$transaction(async (tx) => {
        const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

        if (currentWallet.isLocked) {
          throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
        }

        // TRIAL_PENDING: increment only balance (visible to user) — availableBalance
        // is not incremented until the trial window closes so the funds cannot be
        // withdrawn or applied to payouts during the refund-eligible period.
        const updated = await tx.wallet.update({
          where: { userId },
          data: isTrialPending
            ? { balance: { increment: amount } }
            : { balance: { increment: amount }, availableBalance: { increment: amount } },
        });

        const txRecord = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type,
            amount,
            // Derive from the post-increment return value so concurrent credits don't
            // leave a stale balanceBefore/After on the audit record.
            balanceBefore: updated.balance - amount,
            balanceAfter: updated.balance,
            status: txStatus,
            description,
            metadata: metadata ? JSON.stringify(metadata) : undefined,
            cashbackExpiresAt,
            cashbackStatus,
            clearedAt,
            ...links,
          },
        });

        return [updated, txRecord] as const;
      });
    } catch (err: any) {
      // Audit-fix [3]: The application-level idempotency probe (above) runs
      // outside the transaction, so two concurrent credit() calls for the
      // same stickerScanId can both pass the probe before either inserts.
      // The partial unique index on WalletTransaction rejects the second
      // insert with P2002. Catch that and return the winner's row instead of
      // surfacing a 500, preserving the caller's idempotency guarantee.
      if (
        err?.code === 'P2002' &&
        type === WalletTransactionType.CASHBACK_CREDIT &&
        links.stickerScanId
      ) {
        logger.warn(
          `[wallet.credit] P2002 unique constraint — concurrent credit race resolved for stickerScanId=${links.stickerScanId}`,
        );
        const existingTx = await prisma.walletTransaction.findFirst({
          where: {
            stickerScanId: links.stickerScanId,
            type: WalletTransactionType.CASHBACK_CREDIT,
          },
        });
        if (existingTx) {
          const currentWallet = await this.getOrCreateWallet(userId);
          return { wallet: currentWallet, transaction: existingTx };
        }
      }
      throw err;
    }

    logger.info(`Credited ${amount} BGN to wallet ${wallet.id}. Type: ${type}${isTrialPending ? ' [TRIAL_PENDING]' : ''}${cashbackExpiresAt ? `. Expires: ${cashbackExpiresAt.toISOString()}` : ''}`);

    // Payout-ready notification: fire when the credit crosses the payout threshold
    // for this user's plan (pre-credit below, post-credit above). Non-fatal.
    // Skip for TRIAL_PENDING credits — availableBalance was not incremented, so
    // the pre/post threshold comparison would be meaningless.
    if (!isTrialPending) {
      try {
        const preCreditAvailable = updatedWallet.availableBalance - amount;
        if (updatedWallet.availableBalance > 0 && !updatedWallet.isLocked) {
          // Resolve the eligible subscription + plan threshold the same way
          // requestPayout() / getBalance() / the auto-payout scheduler do via the
          // shared resolvePayoutEligibility() helper: ACTIVE / TRIALING, or
          // CANCELLED-within-paid-period (spec §7.2), AND honouring the latest-sub
          // FAILED_PAYMENT hard-block. A user whose NEWEST subscription is
          // FAILED_PAYMENT is NOT payout-eligible — requestPayout() would refuse —
          // so we must not prompt them to add an IBAN / tell them they're cashable.
          const { eligible, threshold } = await resolvePayoutEligibility(userId);
          if (eligible && preCreditAvailable < threshold && updatedWallet.availableBalance >= threshold) {
            // Spec §3.7 — if no IBAN on file when threshold is crossed, hold payout
            // and notify user to add their bank details before requesting a payout.
            const hasIban = !!updatedWallet.payoutIban && updatedWallet.payoutIban.trim().length > 0;
            if (!hasIban) {
              detach(notificationService
                .notifyPayoutHeldNoIban({
                  userId,
                  availableBalance: updatedWallet.availableBalance,
                  threshold,
                }), (err) => logger.error(`[wallet] payout-held-no-iban notify failed for ${userId}:`, err));
            } else {
              detach(notificationService
                .notifyPayoutReady({
                  userId,
                  availableBalance: updatedWallet.availableBalance,
                  threshold,
                }), (err) => logger.error(`[wallet] payout-ready notify failed for ${userId}:`, err));
              detach(fireAutomation('cashback.threshold_reached', { userId }), (err) => logger.error(`[wallet] cashback.threshold_reached automation failed for ${userId}:`, err));
            }
          }
        }
      } catch (err) {
        logger.error(`[wallet] payout-ready check failed for ${userId}:`, err);
      }
    }

    return {
      wallet: updatedWallet,
      transaction: walletTransaction,
    };
  }

  /**
   * Debit wallet (subtract funds — internal use; no threshold check)
   */
  async debit(params: {
    userId: string;
    amount: number;
    type: WalletTransactionType;
    description?: string;
    metadata?: any;
    transactionId?: string;
    receiptId?: string;
  }) {
    const { userId, amount, type, description, metadata, transactionId, receiptId } = params;

    if (amount <= 0) {
      throw new Error('Debit amount must be positive');
    }

    const wallet = await this.getOrCreateWallet(userId);

    // Re-check locked + balance inside interactive transaction so concurrent
    // debits can't both pass when only one has sufficient funds.
    const [updatedWallet, walletTransaction] = await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (currentWallet.isLocked) {
        throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
      }
      if (currentWallet.availableBalance < amount) {
        throw new Error('Insufficient wallet balance');
      }

      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: amount },
          availableBalance: { decrement: amount },
        },
      });

      const txRecord = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: -amount,
          // Derive from the post-decrement return value for accurate audit fields.
          balanceBefore: updated.balance + amount,
          balanceAfter: updated.balance,
          status: WalletTransactionStatus.COMPLETED,
          description,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          transactionId,
          receiptId,
        },
      });

      return [updated, txRecord] as const;
    });

    logger.info(`Debited ${amount} BGN from wallet ${wallet.id}. Type: ${type}`);

    return {
      wallet: updatedWallet,
      transaction: walletTransaction,
    };
  }

  /**
   * Reverse TRIAL_PENDING cashback credits.
   * Called by requestTrialRefund() to void cashback that was held in balance but
   * never made available. Only decrements balance (not availableBalance) because
   * availableBalance was never incremented for TRIAL_PENDING transactions.
   */
  async voidTrialPendingCashback(params: {
    userId: string;
    amount: number;
    transactionIds?: string[];
    metadata?: any;
  }) {
    const { userId, amount, transactionIds, metadata } = params;

    if (amount <= 0) return;

    const wallet = await this.getOrCreateWallet(userId);

    await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (currentWallet.isLocked) {
        throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
      }

      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      // Mark the originating TRIAL_PENDING transactions as CANCELLED so
      // resolveTrialPendingCashback doesn't find them and double-decrement balance.
      // Spec §3.1 / §4.4: also set cashbackStatus=VOIDED so the voided amount drops
      // out of getBalance's pending aggregation (which sums cashbackStatus IN
      // [PENDING, TRIAL_PENDING] with no status filter).
      //
      // BC-ADMIN-REAUDIT2-TRIALVOID-VOCAB-1 / Spec §8.1 rule 6 + §1.3: this is the
      // PRIMARY (user-triggered) trial-void path; the scheduler's
      // resolveTrialPendingCashback fallback only runs when this one silently
      // fails. Both now write the SAME single-sourced canonical reason
      // (TRIAL_VOID_REASON, SYSTEM_ERROR-prefixed — validated against the
      // controlled vocabulary at cashbackLifecycle.service module load) AND the
      // SYSTEM_ACTOR_ID responsible-actor stamp, so the void-reason vocabulary +
      // actor stamp are shared by ALL void paths exactly.
      if (transactionIds && transactionIds.length > 0) {
        await tx.walletTransaction.updateMany({
          where: { id: { in: transactionIds } },
          data: {
            status: WalletTransactionStatus.CANCELLED,
            cashbackStatus: CashbackEntryStatus.VOIDED,
            voidedAt: new Date(),
            voidedReason: TRIAL_VOID_REASON,
            voidedByUserId: SYSTEM_ACTOR_ID,
          },
        });
      }

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.ADJUSTMENT,
          amount: -amount,
          balanceBefore: currentWallet.balance,
          balanceAfter: currentWallet.balance - amount,
          status: WalletTransactionStatus.COMPLETED,
          description: 'Анулиран кешбек при пробен период',
          metadata: metadata ? JSON.stringify(metadata) : undefined,
        },
      });
    });

    logger.info(`Voided ${amount} BGN of TRIAL_PENDING cashback from wallet ${wallet.id}`);
  }

  /**
   * Request a cashback payout (spec §6.1 v1.1).
   *
   * The subscriber-facing flow enqueues a PENDING WITHDRAWAL for admin review;
   * the actual bank transfer is initiated only after an administrator approves
   * the payout from Финанси → Плащания към абонати. The user's available balance
   * is debited immediately so the request can't be duplicated while it sits in
   * the queue. If the administrator rejects the request, the balance is restored
   * by adminPayouts.routes.ts → /:id/reject.
   *
   * Validates:
   *   1. Wallet is not locked
   *   2. No existing PENDING or PROCESSING withdrawal for this wallet
   *   3. Available balance >= plan payout threshold
   *   4. Latest subscription is ACTIVE or TRIALING — PAST_DUE / UNPAID / PAUSED / FAILED_PAYMENT
   *      all result in a hard 402/403 rejection (not a deferred hold)
   *
   * @param opts.iban  - Destination IBAN (optional; falls back to stored wallet IBAN)
   * @param opts.beneficiaryName - Account holder name (optional; falls back to stored name)
   */
  async requestPayout(
    userId: string,
    opts: { iban?: string; beneficiaryName?: string } = {}
  ): Promise<{ amount: number; currency: string; status: 'PENDING' }> {
    // F-001: Spec §1.2 — INACTIVE users retain read access but must not be able
    // to initiate payout requests (operational write path). Check user_account_status first.
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    }).catch(() => null);
    if ((userRecord?.status as string) === 'INACTIVE') {
      throw new AppError(
        'ACCOUNT_INACTIVE: Payout requests are not available for inactive accounts. ' +
        'Please contact support to reactivate your account.',
        403,
      );
    }

    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.isLocked) {
      throw new Error(`Wallet is locked: ${wallet.lockedReason}`);
    }

    // Pre-prune any already-expired cashback before reading availableBalance.
    // Without this, a payout requested at 01:45 Sofia (before the 02:00 cashback-expiry
    // cron) would pay out BGN that had legally already expired.
    try {
      const { expireWallet } = await import('../jobs/scheduler');
      await expireWallet(wallet.id, new Date());
    } catch (pruneError) {
      logger.error(`[payout] Pre-prune failed for wallet ${wallet.id} — continuing with current balance:`, pruneError);
    }

    // Spec §8.1 point 3 — Payout eligibility (earned-rights model):
    //   New payouts allowed:  Active subscription OR Cancelled-within-paid-period.
    //   New payouts blocked:  Cancelled post-period, Failed Payment, Expired.
    //   In-flight payouts:    Always continue regardless of subscription changes.
    //
    // Step A: hard-block FAILED_PAYMENT regardless of other subscriptions.
    const latestSub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, currentPeriodEnd: true, plan: true },
    });
    if (latestSub?.status === 'FAILED_PAYMENT') {
      throw new AppError(
        'SUBSCRIPTION_FAILED_PAYMENT: Изплащане не е възможно — абонаментът ви е в статус „неуспешно плащане". ' +
        'Моля възстановете го от меню Абонамент и плащания.',
        403,
      );
    }

    // Step B: find an eligible subscription. Spec §8.1 point 3 allows payout when:
    //   1. Subscription status is ACTIVE or TRIALING (fully active), OR
    //   2. Status is CANCELLED but currentPeriodEnd > now (still within paid period).
    // "Cancelled post-period" (currentPeriodEnd in the past) is blocked like Expired.
    const now = new Date();
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          // Case 1: active subscriptions
          { status: { in: ['ACTIVE', 'TRIALING'] } },
          // Case 2: Spec §8.1 point 3 — Cancelled within paid period
          // Scanning allowed and new payouts allowed until currentPeriodEnd.
          {
            status: 'CANCELLED',
            currentPeriodEnd: { gt: now },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      throw new AppError(
        'SUBSCRIPTION_INACTIVE: Изплащане не е възможно: за да получите кешбек, абонаментът ви трябва да бъде активен. ' +
        'Моля възстановете го от меню Абонамент и плащания.',
        402,
      );
    }

    const plan: SubscriptionPlan = subscription.plan;
    const threshold = await getPayoutThresholdBGN(plan);

    // Resolve IBAN — prefer caller-supplied value, fall back to stored wallet value.
    // Spec §7.3: IBAN is required before payout initiation. Checked here (after merge)
    // so a caller can supply IBAN in the payout request without a separate pre-flight.
    const ibanRaw = opts.iban?.replace(/\s+/g, '').toUpperCase() || wallet.payoutIban || '';
    const beneficiaryName = opts.beneficiaryName?.trim() || wallet.payoutBeneficiaryName || '';

    if (!ibanRaw) {
      throw new AppError('IBAN required before requesting payout.', 400);
    }

    // Validate IBAN format (not just non-empty) — reject malformed IBANs early
    try {
      validateIBAN(ibanRaw);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new AppError(err.message, 400);
      }
      throw err;
    }

    // Require beneficiary name when Paysera Transfer API is configured.
    if (payseraService.isTransferConfigured() && !beneficiaryName) {
      throw new Error('Please provide the beneficiary name as it appears on your bank account.');
    }

    // Per-payout secret embedded in the callback URL for lightweight verification
    const callbackSecret = crypto.randomBytes(16).toString('hex');

    // Wrap locked check, balance check, duplicate guard, debit, and cashback
    // LOCKED transition in one interactive transaction so concurrent payout
    // requests can't both pass the guards and so the lock annotation is
    // committed atomically with the balance debit.
    const { amount, currency, withdrawalTxId, lockedCashbackIds } = await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (currentWallet.isLocked) {
        throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
      }

      if (currentWallet.availableBalance < threshold) {
        throw new Error(
          `Available balance (${currentWallet.availableBalance.toFixed(2)} BGN) is below the ` +
          `payout threshold for your plan (${threshold.toFixed(2)} BGN / ` +
          `€${(threshold / EUR_TO_BGN_RATE).toFixed(2)})`
        );
      }

      // Spec §6.1 — only one in-flight payout per wallet. Both PENDING (awaiting
      // admin review) and PROCESSING (admin-approved, transfer firing/in-flight)
      // count as in-flight.
      const existing = await tx.walletTransaction.findFirst({
        where: {
          walletId: currentWallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          status: { in: [WalletTransactionStatus.PENDING, WalletTransactionStatus.PROCESSING] },
        },
      });
      if (existing) {
        throw new Error('A payout is already pending review or in processing. Please wait for it to be resolved.');
      }

      const payoutAmount = currentWallet.availableBalance;
      const newBalance = currentWallet.balance - payoutAmount;

      // Persist IBAN so the user doesn't have to re-enter it next time
      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: 0,
          balance: { decrement: payoutAmount },
          ...(ibanRaw ? { payoutIban: ibanRaw } : {}),
          ...(beneficiaryName ? { payoutBeneficiaryName: beneficiaryName } : {}),
        },
      });

      // Spec §4.4 / §6.1 v1.1 — flip every CLEARED CASHBACK_CREDIT for this
      // wallet to LOCKED. requestPayout drains the full availableBalance, so
      // by invariant every CLEARED entry belongs to this in-flight payout.
      // Persist the IDs in WITHDRAWAL.metadata so revertLocked / markPaid can
      // target this exact batch when the payout outcome is known (and so new
      // CLEARED entries credited while the payout is in flight aren't dragged
      // into the outcome).
      const cleared = await tx.walletTransaction.findMany({
        where: {
          walletId: currentWallet.id,
          type: WalletTransactionType.CASHBACK_CREDIT,
          cashbackStatus: CashbackEntryStatus.CLEARED,
        },
        select: { id: true },
      });
      const lockedIds = cleared.map((r) => r.id);
      if (lockedIds.length > 0) {
        await tx.walletTransaction.updateMany({
          where: { id: { in: lockedIds } },
          data: { cashbackStatus: CashbackEntryStatus.LOCKED, lockedAt: new Date() } as any,
        });
      }

      const withdrawalTx = await tx.walletTransaction.create({
        data: {
          walletId: currentWallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          amount: -payoutAmount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          // §6.1 v1.1 — enters the admin review queue. The bank transfer is fired
          // from admin /approve → executePayoutTransfer() after risk review.
          status: WalletTransactionStatus.PENDING,
          description: 'Заявка за изплащане — в очакване на одобрение от администратор',
          payoutIbanSnapshot: currentWallet.payoutIban ?? null as any,
          metadata: JSON.stringify({
            plan,
            thresholdBGN: threshold,
            beneficiaryIban: ibanRaw,
            beneficiaryName,
            callbackSecret,
            requestedAt: new Date().toISOString(),
            lockedCashbackIds: lockedIds,
          }),
        },
      });

      return { amount: payoutAmount, currency: currentWallet.currency, withdrawalTxId: withdrawalTx.id, lockedCashbackIds: lockedIds };
    });

    if (lockedCashbackIds.length > 0) {
      // Audit the LOCK transition outside the transaction (best-effort — the
      // status change is already durable from the updateMany above).
      const { writeAudit } = await import('../middleware/audit.middleware');
      detach(writeAudit({
        actorUserId: userId,
        action: 'CASHBACK_LOCKED',
        objectType: 'WalletTransaction',
        objectId: withdrawalTxId,
        after: { count: lockedCashbackIds.length, ids: lockedCashbackIds, withdrawalId: withdrawalTxId },
      }), (err) => logger.error('[wallet] CASHBACK_LOCKED audit failed:', err));
    }

    logger.info(`Payout request enqueued for user ${userId}: ${amount.toFixed(2)} BGN (plan: ${plan}, withdrawalTxId: ${withdrawalTxId})`);
    return { amount, currency, status: 'PENDING' };
  }

  /**
   * Read the locked cashback IDs out of a WITHDRAWAL row's metadata. Empty
   * array if the metadata is missing or malformed (older withdrawals from
   * before the lifecycle was wired).
   */
  private readLockedCashbackIds(metadata: string | null | undefined): string[] {
    if (!metadata) return [];
    try {
      const meta = JSON.parse(metadata);
      const ids = Array.isArray(meta?.lockedCashbackIds) ? meta.lockedCashbackIds : [];
      return ids.filter((x: unknown): x is string => typeof x === 'string');
    } catch {
      return [];
    }
  }

  /**
   * Apply the cashback-lifecycle PAID transition to the entries recorded on
   * a WITHDRAWAL row. Best-effort: a lifecycle write failure should not block
   * the wallet/payout flow (balance is already correct elsewhere).
   */
  async markCashbackPaidForWithdrawal(
    withdrawalId: string,
    actorUserId: string | null = null,
  ): Promise<{ count: number }> {
    const row = await prisma.walletTransaction.findUnique({
      where: { id: withdrawalId },
      select: { id: true, metadata: true, type: true },
    });
    if (!row || row.type !== WalletTransactionType.WITHDRAWAL) return { count: 0 };
    const ids = this.readLockedCashbackIds(row.metadata);
    if (ids.length === 0) return { count: 0 };
    try {
      return await cashbackLifecycleService.markPaid({ walletTransactionIds: ids, actorUserId });
    } catch (err) {
      logger.error(`[wallet] markCashbackPaidForWithdrawal failed for ${withdrawalId}:`, err);
      return { count: 0 };
    }
  }

  /**
   * Revert LOCKED → CLEARED for the entries recorded on a WITHDRAWAL row.
   * Called when a payout is rejected, cancelled, or fails Paysera transfer.
   */
  async revertCashbackLockForWithdrawal(
    withdrawalId: string,
    actorUserId: string | null = null,
    reason?: string,
  ): Promise<{ count: number }> {
    const row = await prisma.walletTransaction.findUnique({
      where: { id: withdrawalId },
      select: { id: true, metadata: true, type: true },
    });
    if (!row || row.type !== WalletTransactionType.WITHDRAWAL) return { count: 0 };
    const ids = this.readLockedCashbackIds(row.metadata);
    if (ids.length === 0) return { count: 0 };
    try {
      return await cashbackLifecycleService.revertLocked({
        walletTransactionIds: ids,
        actorUserId,
        reason,
      });
    } catch (err) {
      logger.error(`[wallet] revertCashbackLockForWithdrawal failed for ${withdrawalId}:`, err);
      return { count: 0 };
    }
  }

  /**
   * Spec §3.7 / §7.4 — escalate a user to HIGH risk after a repeated payout failure.
   *
   * Single source of truth for the two-strike risk-flagging math, shared by the
   * admin `/:id/fail` route and the automatic Paysera-failure path in
   * `executePayoutTransfer`. Floors riskScore at RISK_HOLD_FLOOR_SCORE (51) and
   * never downgrades a higher existing score, so the persisted score always stays
   * inside the HIGH_51_PLUS bucket (spec §2.1) and never inflates unbounded
   * across repeated failures (the prior `riskScore += 40` Paysera path could
   * exceed 100 and drift away from the bucket boundary). Uses `updateMany` so a
   * user soft-deleted between the read and the write is a no-op rather than a
   * P2025 that would abort a caller's transaction.
   *
   * Pass a transaction client to run inside an existing `$transaction`; defaults
   * to the shared prisma client for fire-outside-tx callers.
   */
  async escalateRiskAfterRepeatedPayoutFailure(
    userId: string,
    client: Prisma.TransactionClient = prisma,
  ): Promise<void> {
    const current = await client.user.findUnique({
      where: { id: userId },
      select: { riskScore: true },
    });
    // Fix E — use the canonical RISK_HOLD_FLOOR_SCORE (51) from userRisk.service.ts
    // instead of the non-spec-compliant 61. Never downgrades a higher pre-existing score.
    const safeRiskScore = Math.max(current?.riskScore ?? 0, RISK_HOLD_FLOOR_SCORE);
    await client.user.updateMany({
      where: { id: userId },
      data: { riskBucket: 'HIGH_51_PLUS', riskScore: safeRiskScore },
    });
  }

  /**
   * Execute the bank transfer for an admin-approved payout (spec §6.1 v1.1).
   *
   * Transitions a PENDING WITHDRAWAL → PROCESSING and fires Paysera B2C Transfer.
   * On failure the wallet balance is restored and the row is marked FAILED with
   * an ADJUSTMENT audit record. Idempotent against concurrent calls: the
   * PENDING → PROCESSING transition uses an atomic precondition (`updateMany`
   * with `where status: PENDING`). Only the caller that *wins* that transition
   * fires Paysera; concurrent callers return { alreadyProcessed: true } before
   * touching Paysera or the wallet balance. This is critical — if two callers
   * both fired Paysera and one reservation failed, both catch blocks would try
   * to credit the balance back, producing a double-refund.
   *
   * Only PENDING rows are accepted. PROCESSING / FAILED rows are rejected so
   * a stuck row can't accidentally be re-fired; recovery from such states is
   * a separate admin action.
   *
   * If Paysera is not configured the row is left in PROCESSING for an admin to
   * mark complete manually via /:id/complete.
   */
  async executePayoutTransfer(
    walletTransactionId: string
  ): Promise<{ amount: number; currency: string; transferId?: string; alreadyProcessed?: boolean }> {
    const payout = await prisma.walletTransaction.findUnique({
      where: { id: walletTransactionId },
      include: { wallet: true },
    });
    if (!payout) {
      throw new Error(`Payout ${walletTransactionId} not found`);
    }
    if (payout.type !== WalletTransactionType.WITHDRAWAL) {
      throw new Error(`Transaction ${walletTransactionId} is not a withdrawal`);
    }
    if (payout.status !== WalletTransactionStatus.PENDING) {
      // PROCESSING here means another caller already won the transition (or
      // bulk-approve already started the transfer). Returning alreadyProcessed
      // — rather than re-firing Paysera — prevents the catch-block double-refund.
      if (payout.status === WalletTransactionStatus.PROCESSING) {
        return { amount: Math.abs(payout.amount), currency: payout.currency, alreadyProcessed: true };
      }
      throw new Error(`Payout ${walletTransactionId} is ${payout.status}; only PENDING can be executed`);
    }

    const meta = payout.metadata ? JSON.parse(payout.metadata) : {};
    const ibanRaw: string = meta.beneficiaryIban ?? payout.wallet.payoutIban ?? '';
    const beneficiaryName: string = meta.beneficiaryName ?? payout.wallet.payoutBeneficiaryName ?? '';
    const callbackSecret: string | undefined = meta.callbackSecret;

    // Capture once — used for both validation and the updateMany payload so we
    // never call isTransferConfigured() twice with a possible flip in between.
    const isConfigured = payseraService.isTransferConfigured();

    if (isConfigured) {
      if (!callbackSecret) {
        throw new Error(`Payout ${walletTransactionId} is missing callbackSecret — cannot execute transfer`);
      }
      if (!ibanRaw || !beneficiaryName) {
        throw new Error(`Payout ${walletTransactionId} missing IBAN or beneficiary name`);
      }
    }

    // Build the transition metadata in one place so the atomic updateMany write
    // is the only write — no stale-spread risk from a follow-up update().
    const transitionMeta: Record<string, unknown> = {
      ...meta,
      processingStartedAt: new Date().toISOString(),
    };
    if (!isConfigured) {
      // manualHold tells /reset-stuck to refuse this row: its PROCESSING state
      // is intentional (awaiting admin /complete), not a crash residue.
      transitionMeta.manualHold = true;
    }

    // Atomic PENDING → PROCESSING transition. Whoever loses the race exits
    // without touching Paysera or the wallet balance.
    const upd = await prisma.walletTransaction.updateMany({
      where: { id: walletTransactionId, status: WalletTransactionStatus.PENDING },
      data: {
        status: WalletTransactionStatus.PROCESSING,
        metadata: JSON.stringify(transitionMeta),
      },
    });
    if (upd.count === 0) {
      return { amount: Math.abs(payout.amount), currency: payout.currency, alreadyProcessed: true };
    }

    const amount = Math.abs(payout.amount);
    const currency = payout.currency;
    const userId = payout.wallet.userId;
    const walletId = payout.walletId;

    if (!isConfigured) {
      logger.warn(`[payout] Paysera Transfer API not configured — payout ${walletTransactionId} held in PROCESSING; admin must mark complete manually`);
      return { amount, currency };
    }

    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const amountEUR = parseFloat((amount / EUR_TO_BGN_RATE).toFixed(2));

    try {
      // Stable idempotency key: walletId + withdrawalTxId ensures a network-retry
      // of createTransfer does not create a duplicate bank transfer.
      const idempotencyKey = `${walletId}-${walletTransactionId}`;

      const transfer = await payseraService.createTransfer({
        amountEUR,
        beneficiaryIban: ibanRaw,
        beneficiaryName,
        purpose: 'BoomCard cashback payout',
        callbackUrl: `${apiBaseUrl}/api/payments/transfer-callback?secret=${callbackSecret}`,
        idempotencyKey,
      });

      // Stamp transferId BEFORE reserving — if reserve throws, the outer catch
      // reverses the debit and the transfer stays pending (never executed).
      await prisma.walletTransaction.update({
        where: { id: walletTransactionId },
        data: {
          metadata: JSON.stringify({
            ...meta,
            processingStartedAt: meta.processingStartedAt ?? new Date().toISOString(),
            payseraTransferId: transfer.id,
          }),
        },
      });

      await payseraService.reserveTransfer(transfer.id);
      logger.info(`Paysera transfer ${transfer.id} created & reserved for payout ${walletTransactionId} (user ${userId})`);
      return { amount, currency, transferId: transfer.id };
    } catch (transferError: any) {
      logger.error(`Paysera Transfer API failed for payout ${walletTransactionId} (user ${userId}): ${transferError.message}`);

      // M4 — unify the two-strike payout-failure outcome across the admin /fail
      // route (adminPayouts.routes.ts) and this auto-fail path. Canonical behavior
      // is the admin /fail route, because it is the spec-correct §3.7 implementation:
      //   First failure  → mark FAILED, restore wallet balance, revert cashback
      //                    LOCKED→CLEARED, notify user to correct IBAN.
      //   Second failure → mark RISK_HOLD (NOT FAILED), do NOT restore balance,
      //                    leave cashback LOCKED, flag user HIGH risk, notify admin
      //                    ops only. The user is NOT notified and the record stays
      //                    visible to them as "Sent to payout" (RISK_HOLD label).
      //
      // Previously this path ALWAYS restored balance + marked FAILED + reverted
      // cashback even on the second strike, diverging from the admin route. We now
      // determine the strike count first and branch identically.
      //
      // Strike count: count BOTH prior FAILED and RISK_HOLD withdrawals so the two
      // paths agree even when an earlier second-strike produced a RISK_HOLD row
      // (which is not FAILED). The current row is still PROCESSING here, so it is
      // not yet in either bucket.
      let isSecondFailure = false;
      try {
        // Fix B — count only genuine payout failures, excluding manual holds.
        // Manual holds have metadata.manualHold=true; escalated second-failures have
        // metadata.escalatedSecondFailure=true. Only rows WITHOUT manualHold=true count.
        const allFailedRows = await prisma.walletTransaction.findMany({
          where: {
            walletId,
            type: WalletTransactionType.WITHDRAWAL,
            status: { in: [WalletTransactionStatus.FAILED, WalletTransactionStatus.RISK_HOLD] },
          },
          select: { metadata: true },
        });
        // Filter out manual holds (metadata.manualHold=true) and only count genuine failures.
        const genuineFailures = allFailedRows.filter((row) => {
          const meta = row.metadata ? JSON.parse(row.metadata) : {};
          return meta.manualHold !== true;
        });
        isSecondFailure = genuineFailures.length >= 1;
      } catch (countErr) {
        logger.error(`[executePayoutTransfer] failed to count prior payout failures for user ${userId}:`, countErr);
      }

      if (isSecondFailure) {
        // Second failure: escalate to RISK_HOLD for manual review. Do NOT restore
        // balance and do NOT revert cashback — the balance/cashback are released
        // (or consumed) when an admin resolves the RISK_HOLD via the payouts route.
        try {
          const existingMeta = meta;
          await prisma.walletTransaction.update({
            where: { id: walletTransactionId },
            data: {
              status: WalletTransactionStatus.RISK_HOLD,
              description: `Ескалирано за ръчен преглед след повторен неуспех: ${transferError.message}`,
              // Fix A — stamp metadata.escalatedSecondFailure=true so /release can
              // distinguish this from a manual hold and refuse to re-arm it.
              metadata: JSON.stringify({
                ...existingMeta,
                escalatedSecondFailure: true,
                escalatedAt: new Date().toISOString(),
              }),
            },
          });
          // Flag user HIGH risk (floors riskScore at 51, canonical boundary, never downgrades).
          await this.escalateRiskAfterRepeatedPayoutFailure(userId)
            .catch((err) => logger.error(`[executePayoutTransfer] risk flag update failed for user ${userId}:`, err));
        } catch (holdErr: any) {
          logger.error(`CRITICAL: payout RISK_HOLD escalation failed for user ${userId}: ${holdErr.message}`);
          await prisma.wallet.update({
            where: { userId },
            data: {
              isLocked: true,
              lockedReason: `Payout RISK_HOLD escalation failed: ${holdErr.message}. Manual review required.`,
              lockedAt: new Date(),
            },
          }).catch(() => {});
        }

        // User is NOT notified on second failure per spec §3.7. Notify admin ops.
        detach(notificationService
          .notifyAdminOps({
            opsType: 'payout_failure_high_risk',
            title: 'User flagged high-risk after repeated payout failures',
            message: `User ${userId} had a repeated payout failure. Payout escalated to RISK_HOLD and flagged for manual admin review per spec §3.7.`,
            severity: 'warning',
            fields: [
              { label: 'User ID', value: userId },
              { label: 'Last error', value: transferError.message.slice(0, 200) },
            ],
          }), (err) => logger.error(`[executePayoutTransfer] admin notification failed for user ${userId}:`, err));
      } else {
        // First failure: reverse the DB debit — credit the amount back, mark
        // WITHDRAWAL FAILED, and create an ADJUSTMENT record for the audit trail.
        try {
          await prisma.$transaction(async (tx) => {
            const currentWallet = await tx.wallet.update({
              where: { userId },
              data: {
                balance: { increment: amount },
                availableBalance: { increment: amount },
              },
            });

            await tx.walletTransaction.update({
              where: { id: walletTransactionId },
              data: {
                status: WalletTransactionStatus.FAILED,
                description: `Неуспешно изплащане: ${transferError.message}`,
              },
            });

            await tx.walletTransaction.create({
              data: {
                walletId,
                type: WalletTransactionType.ADJUSTMENT,
                amount,
                balanceBefore: currentWallet.balance - amount,
                balanceAfter: currentWallet.balance,
                status: WalletTransactionStatus.COMPLETED,
                description: `Сторниране на изплащане — балансът е възстановен`,
                metadata: JSON.stringify({ reversedWithdrawalId: walletTransactionId, reason: transferError.message }),
              },
            });
          });
          logger.info(`Payout reversal complete for user ${userId} — balance restored`);

          // Spec §4.4 v1.1 — also revert the LOCKED cashback annotations to
          // CLEARED so the entries are eligible for a future payout. Best-effort.
          await this.revertCashbackLockForWithdrawal(
            walletTransactionId,
            null,
            `Paysera transfer failed: ${transferError.message}`,
          );
        } catch (reversalError: any) {
          logger.error(`CRITICAL: payout reversal failed for user ${userId}: ${reversalError.message}`);
          await prisma.wallet.update({
            where: { userId },
            data: {
              isLocked: true,
              lockedReason: `Payout reversal failed: ${reversalError.message}. Manual review required.`,
              lockedAt: new Date(),
            },
          }).catch(() => {});
        }

        // First failure: notify the user. L1 — use IBAN-correction wording only
        // when the transfer error indicates an IBAN / bank-account problem;
        // otherwise neutral "action may be required" wording. Same classifier as
        // the admin /fail path (reasonIndicatesIbanProblem) so both paths agree.
        if (reasonIndicatesIbanProblem(transferError.message)) {
          detach(notificationService
            .notifyPayoutFailedInvalidIban(userId), (err) => logger.error(`[executePayoutTransfer] notifyPayoutFailedInvalidIban failed for user ${userId}:`, err));
        } else {
          detach(notificationService
            .notifyPayoutFailedGeneric(userId), (err) => logger.error(`[executePayoutTransfer] notifyPayoutFailedGeneric failed for user ${userId}:`, err));
        }
      }

      throw new Error(`Payout could not be processed: ${transferError.message}`);
    }
  }

  /**
   * Save the user's payout bank account details without initiating a payout.
   * Creates the wallet if it doesn't exist yet.
   *
   * Writes an explicit AuditLog entry with action 'wallet.iban.update' so that
   * the fraud detection Signal 1 (+40 points) can query by this exact key rather
   * than an unsafe substring match. The action string must not change without
   * also updating sticker.service.ts ibanChangedRecently query.
   */
  async updatePayoutAccount(
    userId: string,
    opts: { iban: string; beneficiaryName: string }
  ): Promise<void> {
    // Validate IBAN format before persisting
    try {
      validateIBAN(opts.iban);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new AppError(err.message, 400);
      }
      throw err;
    }

    await this.getOrCreateWallet(userId);

    // Fetch existing IBAN for before/after audit diff.
    const existing = await prisma.wallet.findUnique({
      where: { userId },
      select: { payoutIban: true },
    });

    await prisma.wallet.update({
      where: { userId },
      data: {
        payoutIban: opts.iban,
        payoutBeneficiaryName: opts.beneficiaryName,
      },
    });

    // Write audit entry with exact action key 'wallet.iban.update'.
    // This key is consumed by fraudDetection Signal 1 (sticker.service.ts).
    // Do not use partial strings or aliases — the query in sticker.service.ts
    // uses an exact match: action: { equals: 'wallet.iban.update' }.
    const { writeAudit } = await import('../middleware/audit.middleware');
    detach(writeAudit({
      actorUserId: userId,
      action: 'wallet.iban.update',
      objectType: 'wallet',
      objectId: null,
      before: existing?.payoutIban ? { payoutIban: '[REDACTED]' } : null,
      after: { payoutIban: '[REDACTED]' },
    }), (err: unknown) => {
      logger.warn(`[updatePayoutAccount] audit write failed for user ${userId}: ${err}`);
    });

    // F-011: Spec §7.3 auto-trigger payout when IBAN is later provided.
    // After saving the IBAN, check if wallet.availableBalance >= plan payout threshold.
    // If so, enqueue an automatic payout (spec §7.3 auto-trigger on IBAN save).
    try {
      const updatedWallet = await prisma.wallet.findUnique({
        where: { userId },
        select: { availableBalance: true, isLocked: true },
      });
      if (updatedWallet && !updatedWallet.isLocked && updatedWallet.availableBalance > 0) {
        const subForThreshold = await prisma.subscription.findFirst({
          where: {
            userId,
            OR: [
              { status: { in: ['ACTIVE', 'TRIALING'] } },
              { status: 'CANCELLED', currentPeriodEnd: { gt: new Date() } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });
        if (subForThreshold) {
          const plan: SubscriptionPlan = subForThreshold.plan;
          const threshold = await getPayoutThresholdBGN(plan);
          if (updatedWallet.availableBalance >= threshold) {
            // spec §7.3 auto-trigger on IBAN save — enqueue payout asynchronously.
            // Non-fatal: if the auto-payout fails, the nightly payout scheduler
            // retries it (there is no user-initiated payout path — see F-013).
            detach(this.requestPayout(userId, { iban: opts.iban, beneficiaryName: opts.beneficiaryName })
              .then(() => logger.info(`[updatePayoutAccount] Auto-payout enqueued for user ${userId} (spec §7.3)`)), (err) => logger.error(`[updatePayoutAccount] Auto-payout failed for user ${userId} (spec §7.3):`, err));
          }
        }
      }
    } catch (autoPayoutCheckErr) {
      logger.error(`[updatePayoutAccount] Auto-payout threshold check failed for user ${userId}:`, autoPayoutCheckErr);
    }

    logger.info(`Payout account updated for user ${userId}`);
  }

  /**
   * Add pending balance (for pending cashback)
   */
  async addPendingBalance(userId: string, amount: number) {
    if (amount <= 0) {
      throw new Error('Pending balance amount must be positive');
    }

    await this.getOrCreateWallet(userId); // ensure wallet exists before interactive tx

    await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (currentWallet.isLocked) {
        throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
      }

      await tx.wallet.update({
        where: { userId },
        data: { pendingBalance: { increment: amount } },
      });
    });

    logger.info(`Added ${amount} BGN pending balance for user ${userId}`);
  }

  /**
   * Move pending to available (when cashback approved)
   */
  async approvePending(userId: string, amount: number) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    await this.getOrCreateWallet(userId); // ensure wallet exists before interactive tx

    await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (currentWallet.isLocked) {
        throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
      }

      if (currentWallet.pendingBalance < amount) {
        throw new Error('Insufficient pending balance');
      }

      await tx.wallet.update({
        where: { userId },
        data: {
          pendingBalance: { decrement: amount },
          availableBalance: { increment: amount },
          balance: { increment: amount },
        },
      });
    });

    logger.info(`Approved ${amount} BGN pending balance for user ${userId}`);
  }

  /**
   * Get wallet transaction history.
   *
   * F-012: Added cashbackStatus and period filter support per spec §9.5.
   *   cashbackStatus: PENDING | CLEARED | LOCKED | PAID | EXPIRED | VOIDED
   *   period: '7d' | '30d' | 'all' — filters by createdAt relative to now
   */
  async getTransactions(userId: string, params?: {
    type?: WalletTransactionType;
    limit?: number;
    offset?: number;
    /** F-012: Filter by cashback entry status */
    cashbackStatus?: CashbackEntryStatus;
    /** F-012: Period preset — '7d' | '30d' | 'all' (default: all) */
    period?: '7d' | '30d' | 'all';
  }) {
    const wallet = await this.getOrCreateWallet(userId);

    // F-012: Build createdAt filter from period preset
    let periodFilter: { gte: Date } | undefined;
    if (params?.period === '7d') {
      periodFilter = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (params?.period === '30d') {
      periodFilter = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    // F-012: Validate cashbackStatus against allowed values to prevent arbitrary filter injection
    const ALLOWED_CASHBACK_STATUSES: string[] = ['PENDING', 'CLEARED', 'LOCKED', 'PAID', 'EXPIRED', 'VOIDED', 'TRIAL_PENDING'];
    const cashbackStatusFilter = params?.cashbackStatus
      && ALLOWED_CASHBACK_STATUSES.includes(params.cashbackStatus as string)
      ? params.cashbackStatus
      : undefined;

    const whereClause = {
      walletId: wallet.id,
      ...(params?.type && { type: params.type }),
      ...(cashbackStatusFilter && { cashbackStatus: cashbackStatusFilter }),
      ...(periodFilter && { createdAt: periodFilter }),
    };

    const transactions = await prisma.walletTransaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: params?.limit || 50,
      skip: params?.offset || 0,
    });

    const total = await prisma.walletTransaction.count({
      where: whereClause,
    });

    // Resolve which FAILED withdrawals in this page were reversed (have a paired
    // ADJUSTMENT credit), so the mask hides only the rare UNreversed first-failure
    // row, never a normal reversed one. We look up reversals across the whole
    // wallet (not just this page) because the credit may fall on a different page.
    const failedWithdrawalIds = transactions
      .filter(
        (t) =>
          t.type === WalletTransactionType.WITHDRAWAL &&
          t.status === WalletTransactionStatus.FAILED,
      )
      .map((t) => t.id);

    const reversedWithdrawalIds = new Set<string>();
    if (failedWithdrawalIds.length > 0) {
      const reversals = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id, type: WalletTransactionType.ADJUSTMENT },
        select: { type: true, metadata: true },
      });
      for (const r of reversals) {
        const id = reversedWithdrawalIdOf(r);
        if (id && failedWithdrawalIds.includes(id)) reversedWithdrawalIds.add(id);
      }
    }

    return {
      transactions: transactions.map((tx) => maskUserFacingPayoutStatus(tx, reversedWithdrawalIds)),
      total,
      limit: params?.limit || 50,
      offset: params?.offset || 0,
    };
  }

  /**
   * Lock wallet
   */
  async lockWallet(userId: string, reason: string) {
    await prisma.wallet.update({
      where: { userId },
      data: {
        isLocked: true,
        lockedReason: reason,
        lockedAt: new Date(),
      },
    });

    logger.warn(`Locked wallet for user ${userId}: ${reason}`);
  }

  /**
   * Unlock wallet
   */
  async unlockWallet(userId: string) {
    await prisma.wallet.update({
      where: { userId },
      data: {
        isLocked: false,
        lockedReason: null,
        lockedAt: null,
      },
    });

    logger.info(`Unlocked wallet for user ${userId}`);
  }
}

export const walletService = new WalletService();
