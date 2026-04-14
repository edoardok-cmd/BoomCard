import crypto from 'crypto';
import { SubscriptionPlan, WalletTransactionType, WalletTransactionStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import {
  CASHBACK_VALIDITY_DAYS,
  EUR_TO_BGN_RATE,
  PAYOUT_THRESHOLD_BASIC_EUR,
  PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR,
  PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR,
} from '../constants/receipt.constants';
import { payseraService } from './paysera.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function payoutThresholdBGN(plan: SubscriptionPlan, billingPeriod?: string | null): number {
  if (plan === 'BASIC') {
    return PAYOUT_THRESHOLD_BASIC_EUR * EUR_TO_BGN_RATE;
  }
  // LIGHT = Premium Weekly; PREMIUM may be monthly or weekly billing period stored in metadata
  if (plan === 'LIGHT' || billingPeriod === 'weekly') {
    return PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR * EUR_TO_BGN_RATE;
  }
  return PAYOUT_THRESHOLD_PREMIUM_MONTHLY_EUR * EUR_TO_BGN_RATE;
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
   * nightly cron job (see cashbackExpiry.cron.ts) to keep reads lightweight.
   */
  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    // Resolve payout threshold for this user's active plan
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
    });

    const plan: SubscriptionPlan = subscription?.plan ?? 'LIGHT';
    const metadata = subscription?.metadata ? JSON.parse(subscription.metadata as string) : {};
    const threshold = payoutThresholdBGN(plan, metadata.billingPeriod);

    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
      isLocked: wallet.isLocked,
      lastUpdated: wallet.updatedAt,
      payoutThreshold: parseFloat(threshold.toFixed(2)),
      payoutThresholdEUR: parseFloat((threshold / EUR_TO_BGN_RATE).toFixed(2)),
      canRequestPayout: !wallet.isLocked && wallet.availableBalance >= threshold,
      payoutIban: wallet.payoutIban ?? null,
      payoutBeneficiaryName: wallet.payoutBeneficiaryName ?? null,
    };
  }

  /**
   * Credit wallet (add funds)
   * CASHBACK_CREDIT transactions automatically receive a 60-day expiry window.
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

    const wallet = await this.getOrCreateWallet(userId);

    // Cashback transactions expire 60 days from crediting
    const cashbackExpiresAt =
      type === WalletTransactionType.CASHBACK_CREDIT
        ? new Date(Date.now() + CASHBACK_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
        : undefined;

    // Re-read wallet inside interactive transaction so isLocked is checked atomically
    // with the balance update — prevents a race where wallet is locked between our
    // pre-read and the actual write.
    const [updatedWallet, walletTransaction] = await prisma.$transaction(async (tx) => {
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      if (currentWallet.isLocked) {
        throw new Error(`Wallet is locked: ${currentWallet.lockedReason}`);
      }

      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: amount },
          availableBalance: { increment: amount },
        },
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
          status: WalletTransactionStatus.COMPLETED,
          description,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          cashbackExpiresAt,
          ...links,
        },
      });

      return [updated, txRecord] as const;
    });

    logger.info(`Credited ${amount} BGN to wallet ${wallet.id}. Type: ${type}${cashbackExpiresAt ? `. Expires: ${cashbackExpiresAt.toISOString()}` : ''}`);

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
   * Request a cashback payout.
   * Validates:
   *   1. Wallet is not locked
   *   2. No existing PROCESSING withdrawal
   *   3. Available balance >= plan payout threshold
   * Withdraws the full available balance, then fires the Paysera B2C Transfer API
   * to move the funds to the user's bank account.  If the Transfer API fails the
   * DB debit is reversed atomically so the user keeps their balance.
   *
   * @param opts.iban  - Destination IBAN (optional; falls back to stored wallet IBAN)
   * @param opts.beneficiaryName - Account holder name (optional; falls back to stored name)
   */
  async requestPayout(
    userId: string,
    opts: { iban?: string; beneficiaryName?: string } = {}
  ): Promise<{ amount: number; currency: string; transferId?: string }> {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.isLocked) {
      throw new Error(`Wallet is locked: ${wallet.lockedReason}`);
    }

    // Resolve plan and threshold
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { createdAt: 'desc' },
    });

    const plan: SubscriptionPlan = subscription?.plan ?? 'LIGHT';
    const subMetadata = subscription?.metadata ? JSON.parse(subscription.metadata as string) : {};
    const threshold = payoutThresholdBGN(plan, subMetadata.billingPeriod);

    // Resolve IBAN — prefer caller-supplied value, fall back to stored wallet value
    const ibanRaw = opts.iban?.replace(/\s+/g, '').toUpperCase() || wallet.payoutIban || '';
    const beneficiaryName = opts.beneficiaryName?.trim() || wallet.payoutBeneficiaryName || '';

    // If Transfer API is configured, require an IBAN
    if (payseraService.isTransferConfigured() && !ibanRaw) {
      throw new Error('Please provide your bank IBAN to receive the payout.');
    }
    if (payseraService.isTransferConfigured() && !beneficiaryName) {
      throw new Error('Please provide the beneficiary name as it appears on your bank account.');
    }

    // Per-payout secret embedded in the callback URL for lightweight verification
    const callbackSecret = crypto.randomBytes(16).toString('hex');

    // Wrap locked check, balance check, duplicate guard, and debit in one interactive
    // transaction so concurrent payout requests can't both pass the guards.
    const { amount, currency, withdrawalTxId } = await prisma.$transaction(async (tx) => {
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

      const existing = await tx.walletTransaction.findFirst({
        where: {
          walletId: currentWallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          status: WalletTransactionStatus.PROCESSING,
        },
      });
      if (existing) {
        throw new Error('A payout is already being processed. Please wait for it to complete.');
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

      const withdrawalTx = await tx.walletTransaction.create({
        data: {
          walletId: currentWallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          amount: -payoutAmount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          status: WalletTransactionStatus.PROCESSING,
          description: 'Cashback payout initiated (3–5 business days)',
          metadata: JSON.stringify({
            plan,
            thresholdBGN: threshold,
            beneficiaryIban: ibanRaw,
            beneficiaryName,
            callbackSecret,
          }),
        },
      });

      return { amount: payoutAmount, currency: currentWallet.currency, withdrawalTxId: withdrawalTx.id };
    });

    logger.info(`Payout of ${amount.toFixed(2)} BGN initiated for user ${userId} (plan: ${plan})`);

    // ── Paysera Transfer API (B2C) ───────────────────────────────────────────
    if (!payseraService.isTransferConfigured()) {
      logger.warn('Paysera Transfer API not configured — payout recorded as PROCESSING but no funds transferred');
      return { amount, currency };
    }

    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const amountEUR = parseFloat((amount / EUR_TO_BGN_RATE).toFixed(2));

    try {
      // Stable idempotency key: walletId + withdrawalTxId ensures a network-retry
      // of createTransfer does not create a duplicate bank transfer.
      const idempotencyKey = `${wallet.id}-${withdrawalTxId}`;

      // Create transfer then reserve (auto_process_to_done moves it to "done")
      const transfer = await payseraService.createTransfer({
        amountEUR,
        beneficiaryIban: ibanRaw,
        beneficiaryName,
        purpose: 'BoomCard cashback payout',
        callbackUrl: `${apiBaseUrl}/api/payments/transfer-callback?secret=${callbackSecret}`,
        idempotencyKey,
      });

      // Stamp the transfer ID BEFORE reserving — if reserve throws the outer catch
      // reverses the debit and the transfer stays pending (never executed).
      // If we stamped after reserve and the DB write failed, the callback would arrive
      // but find no matching walletTransaction, leaving the withdrawal stuck PROCESSING.
      // Build metadata directly (no extra DB read — we know exactly what we wrote).
      await prisma.walletTransaction.update({
        where: { id: withdrawalTxId },
        data: {
          metadata: JSON.stringify({
            plan,
            thresholdBGN: threshold,
            beneficiaryIban: ibanRaw,
            beneficiaryName,
            callbackSecret,
            payseraTransferId: transfer.id,
          }),
        },
      });

      await payseraService.reserveTransfer(transfer.id);

      logger.info(`Paysera transfer ${transfer.id} created & reserved for user ${userId}`);
      return { amount, currency, transferId: transfer.id };

    } catch (transferError: any) {
      logger.error(`Paysera Transfer API failed for user ${userId}: ${transferError.message}`);

      // Reverse the DB debit — credit the amount back, mark WITHDRAWAL FAILED, and
      // create an ADJUSTMENT record so the audit trail shows the credit-back.
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
            where: { id: withdrawalTxId },
            data: {
              status: WalletTransactionStatus.FAILED,
              description: `Payout failed: ${transferError.message}`,
            },
          });

          // Audit record for the credit-back so balance history is complete
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: WalletTransactionType.ADJUSTMENT,
              amount,
              balanceBefore: currentWallet.balance - amount, // post-increment minus amount = pre-increment
              balanceAfter: currentWallet.balance,
              status: WalletTransactionStatus.COMPLETED,
              description: `Payout reversal: Transfer API error — balance restored`,
              metadata: JSON.stringify({ reversedWithdrawalId: withdrawalTxId, reason: transferError.message }),
            },
          });
        });
        logger.info(`Payout reversal complete for user ${userId} — balance restored`);
      } catch (reversalError: any) {
        // Reversal itself failed — wallet is now inconsistent, lock it for manual review
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

      throw new Error(`Payout could not be processed: ${transferError.message}`);
    }
  }

  /**
   * Save the user's payout bank account details without initiating a payout.
   * Creates the wallet if it doesn't exist yet.
   */
  async updatePayoutAccount(
    userId: string,
    opts: { iban: string; beneficiaryName: string }
  ): Promise<void> {
    await this.getOrCreateWallet(userId);
    await prisma.wallet.update({
      where: { userId },
      data: {
        payoutIban: opts.iban,
        payoutBeneficiaryName: opts.beneficiaryName,
      },
    });
    logger.info(`Payout account updated for user ${userId}: ${opts.iban}`);
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
   * Get wallet transaction history
   */
  async getTransactions(userId: string, params?: {
    type?: WalletTransactionType;
    limit?: number;
    offset?: number;
  }) {
    const wallet = await this.getOrCreateWallet(userId);

    // When filtering by CASHBACK_CREDIT, hide CANCELLED entries (expired cashback)
    // so the cashback tab only shows live/active cashback credits.
    const statusFilter =
      params?.type === WalletTransactionType.CASHBACK_CREDIT
        ? { status: { not: WalletTransactionStatus.CANCELLED } }
        : {};

    const transactions = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        ...(params?.type && { type: params.type }),
        ...statusFilter,
      },
      orderBy: { createdAt: 'desc' },
      take: params?.limit || 50,
      skip: params?.offset || 0,
    });

    const total = await prisma.walletTransaction.count({
      where: {
        walletId: wallet.id,
        ...(params?.type && { type: params.type }),
        ...statusFilter,
      },
    });

    return {
      transactions,
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
