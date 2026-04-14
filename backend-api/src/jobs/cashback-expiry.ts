/**
 * Cashback Expiry Job
 *
 * Expires CASHBACK_CREDIT wallet transactions whose 60-day window has passed.
 * Previously this ran on every getBalance() call; moved here so reads stay fast.
 *
 * Run nightly via cron: 0 2 * * *  (2 AM daily)
 * Or: npx tsx src/jobs/cashback-expiry.ts
 *
 * Wallets are processed in concurrent batches of BATCH_SIZE to keep the job fast
 * without overwhelming the DB connection pool.
 */

import { PrismaClient, WalletTransactionType, WalletTransactionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const BATCH_SIZE = 10; // wallets processed concurrently per batch

async function expireWallet(walletId: string, now: Date): Promise<number> {
  let totalExpired = 0;

  await prisma.$transaction(async (tx) => {
    const expired = await tx.walletTransaction.findMany({
      where: {
        walletId,
        type: WalletTransactionType.CASHBACK_CREDIT,
        status: WalletTransactionStatus.COMPLETED,
        cashbackExpiresAt: { lt: now },
      },
    });

    if (expired.length === 0) return;

    const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

    // Re-check status inside the transaction. Under READ COMMITTED isolation,
    // expireOldCashback() (called from requestPayout) may have already cancelled
    // these transactions between the outer findMany and this inner updateMany.
    // Adding the status guard means count === 0 if they were already processed,
    // allowing us to skip the wallet decrement and avoid a double-deduction.
    const updateResult = await tx.walletTransaction.updateMany({
      where: {
        id: { in: expired.map(t => t.id) },
        status: WalletTransactionStatus.COMPLETED,
      },
      data: { status: WalletTransactionStatus.CANCELLED },
    });

    if (updateResult.count === 0) return; // all already cancelled by a concurrent process

    // Use updateResult.count (transactions actually cancelled this run) for accurate
    // descriptions — expired.length is the pre-filter set and may include rows already
    // cancelled by a concurrent expireOldCashback() call.
    const cancelledCount = updateResult.count;
    totalExpired = expired.reduce((sum, t) => sum + t.amount, 0);

    await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: { decrement: totalExpired },
        availableBalance: { decrement: totalExpired },
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId,
        type: WalletTransactionType.ADJUSTMENT,
        amount: -totalExpired,
        balanceBefore: currentWallet.balance,
        balanceAfter: currentWallet.balance - totalExpired,
        status: WalletTransactionStatus.COMPLETED,
        description: `Cashback expired (${cancelledCount} transaction${cancelledCount > 1 ? 's' : ''})`,
        metadata: JSON.stringify({ expiredTransactionIds: expired.map(t => t.id) }),
      },
    });

    logger.info(`[cashback-expiry] Wallet ${walletId}: expired ${totalExpired.toFixed(2)} BGN (${cancelledCount} txn${cancelledCount > 1 ? 's' : ''})`);
  });

  return totalExpired;
}

async function runCashbackExpiry(): Promise<void> {
  const now = new Date();
  logger.info(`[cashback-expiry] Starting run at ${now.toISOString()}`);

  // Find all wallets that have at least one expired CASHBACK_CREDIT entry
  const affectedWallets = await prisma.walletTransaction.findMany({
    where: {
      type: WalletTransactionType.CASHBACK_CREDIT,
      status: WalletTransactionStatus.COMPLETED,
      cashbackExpiresAt: { lt: now },
    },
    select: { walletId: true },
    distinct: ['walletId'],
  });

  logger.info(`[cashback-expiry] ${affectedWallets.length} wallet(s) have expired cashback`);

  let processedWallets = 0;
  let failedWallets = 0;
  let totalExpiredBGN = 0;

  // Process in concurrent batches to stay fast without hammering the DB pool
  for (let i = 0; i < affectedWallets.length; i += BATCH_SIZE) {
    const batch = affectedWallets.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(({ walletId }) => expireWallet(walletId, now))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const { walletId } = batch[j];
      if (result.status === 'fulfilled') {
        if (result.value > 0) {
          totalExpiredBGN += result.value;
          processedWallets++;
        }
      } else {
        failedWallets++;
        logger.error(`[cashback-expiry] Failed for wallet ${walletId}:`, result.reason);
      }
    }
  }

  logger.info(
    `[cashback-expiry] Done — processed ${processedWallets} wallet(s), ` +
    `expired ${totalExpiredBGN.toFixed(2)} BGN total` +
    (failedWallets > 0 ? `, ${failedWallets} failed` : '')
  );
}

runCashbackExpiry()
  .catch((err) => {
    logger.error('[cashback-expiry] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
