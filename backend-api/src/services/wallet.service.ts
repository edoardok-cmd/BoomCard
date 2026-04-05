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
   * Expire cashback transactions whose 60-day window has passed.
   * Idempotent — transactions already CANCELLED are skipped.
   * Creates a single ADJUSTMENT debit for the total expired amount.
   */
  async expireOldCashback(userId: string): Promise<void> {
    const wallet = await this.getOrCreateWallet(userId);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const expired = await tx.walletTransaction.findMany({
        where: {
          walletId: wallet.id,
          type: WalletTransactionType.CASHBACK_CREDIT,
          status: WalletTransactionStatus.COMPLETED,
          cashbackExpiresAt: { lt: now },
        },
      });

      if (expired.length === 0) return;

      const totalExpired = expired.reduce((sum, t) => sum + t.amount, 0);

      // Read current balance inside the transaction for accurate balanceBefore/After
      const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      // Mark each expired cashback as CANCELLED
      await tx.walletTransaction.updateMany({
        where: { id: { in: expired.map(t => t.id) } },
        data: { status: WalletTransactionStatus.CANCELLED },
      });

      // Deduct expired amount from wallet (balance + availableBalance)
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: totalExpired },
          availableBalance: { decrement: totalExpired },
        },
      });

      // Record the expiry as an ADJUSTMENT transaction for transparency
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.ADJUSTMENT,
          amount: -totalExpired,
          balanceBefore: currentWallet.balance,
          balanceAfter: currentWallet.balance - totalExpired,
          status: WalletTransactionStatus.COMPLETED,
          description: `Cashback expired (${expired.length} transaction${expired.length > 1 ? 's' : ''})`,
          metadata: JSON.stringify({ expiredTransactionIds: expired.map(t => t.id) }),
        },
      });

      logger.info(`Expired ${totalExpired.toFixed(2)} BGN cashback (${expired.length} txns) for user ${userId}`);
    });
  }

  /**
   * Get wallet balance — expires stale cashback before returning figures.
   */
  async getBalance(userId: string) {
    await this.expireOldCashback(userId);
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
  }) {
    const { userId, amount, type, description, metadata, transactionId } = params;

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
   * Withdraws the full available balance and creates a WITHDRAWAL transaction.
   */
  async requestPayout(userId: string): Promise<{ amount: number; currency: string }> {
    // Expire stale cashback first so the balance is accurate
    await this.expireOldCashback(userId);

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
    const metadata = subscription?.metadata ? JSON.parse(subscription.metadata as string) : {};
    const threshold = payoutThresholdBGN(plan, metadata.billingPeriod);

    // Wrap locked check, balance check, duplicate guard, and debit in one interactive
    // transaction so concurrent payout requests can't both pass the guards.
    const { amount, currency } = await prisma.$transaction(async (tx) => {
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

      await tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: 0,
          balance: { decrement: payoutAmount },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: currentWallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          amount: -payoutAmount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          status: WalletTransactionStatus.PROCESSING,
          description: 'Cashback payout initiated (3–5 business days)',
          metadata: JSON.stringify({ plan, thresholdBGN: threshold }),
        },
      });

      return { amount: payoutAmount, currency: currentWallet.currency };
    });

    logger.info(`Payout of ${amount.toFixed(2)} BGN initiated for user ${userId} (plan: ${plan})`);
    return { amount, currency };
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
