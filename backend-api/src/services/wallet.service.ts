import { PrismaClient, WalletTransactionType, WalletTransactionStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class WalletService {
  /**
   * Get or create wallet for user
   */
  async getOrCreateWallet(userId: string) {
    let wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
      logger.info(`Created wallet for user ${userId}`);
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      balance: wallet.balance,
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
      isLocked: wallet.isLocked,
      lastUpdated: wallet.updatedAt,
    };
  }

  /**
   * Credit wallet (add funds)
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

    if (wallet.isLocked) {
      throw new Error(`Wallet is locked: ${wallet.lockedReason}`);
    }

    // Update wallet balance
    const newBalance = wallet.balance + amount;
    const newAvailableBalance = wallet.availableBalance + amount;

    const [updatedWallet, walletTransaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          status: WalletTransactionStatus.COMPLETED,
          description,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          ...links,
        },
      }),
    ]);

    logger.info(`Credited ${amount} BGN to wallet ${wallet.id}. Type: ${type}`);

    return {
      wallet: updatedWallet,
      transaction: walletTransaction,
    };
  }

  /**
   * Debit wallet (subtract funds)
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

    if (wallet.isLocked) {
      throw new Error(`Wallet is locked: ${wallet.lockedReason}`);
    }

    if (wallet.availableBalance < amount) {
      throw new Error('Insufficient wallet balance');
    }

    // Update wallet balance
    const newBalance = wallet.balance - amount;
    const newAvailableBalance = wallet.availableBalance - amount;

    const [updatedWallet, walletTransaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
        },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: -amount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          status: WalletTransactionStatus.COMPLETED,
          description,
          metadata: metadata ? JSON.stringify(metadata) : undefined,
          transactionId,
        },
      }),
    ]);

    logger.info(`Debited ${amount} BGN from wallet ${wallet.id}. Type: ${type}`);

    return {
      wallet: updatedWallet,
      transaction: walletTransaction,
    };
  }

  /**
   * Add pending balance (for pending cashback)
   */
  async addPendingBalance(userId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);

    await prisma.wallet.update({
      where: { userId },
      data: {
        pendingBalance: wallet.pendingBalance + amount,
      },
    });

    logger.info(`Added ${amount} BGN pending balance to wallet ${wallet.id}`);
  }

  /**
   * Move pending to available (when cashback approved)
   */
  async approvePending(userId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.pendingBalance < amount) {
      throw new Error('Insufficient pending balance');
    }

    await prisma.wallet.update({
      where: { userId },
      data: {
        pendingBalance: wallet.pendingBalance - amount,
        availableBalance: wallet.availableBalance + amount,
        balance: wallet.balance + amount,
      },
    });

    logger.info(`Approved ${amount} BGN pending balance for wallet ${wallet.id}`);
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

    const transactions = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        ...(params?.type && { type: params.type }),
      },
      orderBy: { createdAt: 'desc' },
      take: params?.limit || 50,
      skip: params?.offset || 0,
    });

    const total = await prisma.walletTransaction.count({
      where: {
        walletId: wallet.id,
        ...(params?.type && { type: params.type }),
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
