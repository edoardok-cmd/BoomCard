/**
 * Job Scheduler
 *
 * Registers all nightly background jobs using node-cron so they run automatically
 * inside the API process. Jobs are also runnable as one-off scripts via npx tsx.
 *
 * Schedule:
 *   subscription-expiry      — 30 1 * * *  (1:30 AM every day)
 *   cashback-expiry          — 0 2 * * *   (2 AM every day)
 *   upload-token-cleanup     — 30 3 * * *  (3:30 AM every day)
 *   stale-session-cleanup    — 15 7 * * *  (7:15 AM every day — after the 6 AM deadline)
 */

import cron from 'node-cron';
import { WalletTransactionType, WalletTransactionStatus, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const CASHBACK_EXPIRY_BATCH = 10;

// ── Cashback expiry ────────────────────────────────────────────────────────────

async function expireWallet(walletId: string, now: Date): Promise<number> {
  let totalExpired = 0;

  await prisma.$transaction(async (tx) => {
    const expired = await tx.walletTransaction.findMany({
      // cashbackExpiresAt not yet in generated Prisma types — run `prisma generate` to fix
      where: {
        walletId,
        type: WalletTransactionType.CASHBACK_CREDIT,
        status: WalletTransactionStatus.COMPLETED,
        cashbackExpiresAt: { lt: now },
      } as any,
    });

    if (expired.length === 0) return;

    const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

    // Use UPDATE...RETURNING to atomically capture which transactions were actually
    // cancelled and their amounts. Under READ COMMITTED isolation, a concurrent
    // run of this job could cancel some rows between our findMany and an updateMany,
    // causing updateMany.count < expired.length and a resulting over-decrement.
    // RETURNING eliminates that race by returning only the rows we actually updated.
    const cancelledRows = await (tx as any).$queryRaw<Array<{ id: string; amount: number }>>`
      UPDATE "WalletTransaction"
      SET status = 'CANCELLED'::"WalletTransactionStatus"
      WHERE id = ANY(${expired.map(t => t.id)})
        AND status = 'COMPLETED'::"WalletTransactionStatus"
      RETURNING id, amount
    `;

    if (cancelledRows.length === 0) return;

    const cancelledCount = cancelledRows.length;
    const nominalExpired = cancelledRows.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);

    // Cap the decrement at availableBalance to prevent the wallet going negative.
    // This can happen when the user has already spent their cashback before expiry ran:
    // the CASHBACK_CREDIT transactions are still COMPLETED but the balance is lower.
    // We cancel the transactions (correct record-keeping) but only deduct what is there.
    const effectiveDecrement = Math.min(nominalExpired, Math.max(0, currentWallet.availableBalance));
    totalExpired = effectiveDecrement;

    if (effectiveDecrement > 0) {
      await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: { decrement: effectiveDecrement },
          availableBalance: { decrement: effectiveDecrement },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTransactionType.ADJUSTMENT,
          amount: -effectiveDecrement,
          balanceBefore: currentWallet.balance,
          balanceAfter: currentWallet.balance - effectiveDecrement,
          status: WalletTransactionStatus.COMPLETED,
          description: `Cashback expired (${cancelledCount} transaction${cancelledCount > 1 ? 's' : ''})`,
          metadata: JSON.stringify({
            expiredTransactionIds: cancelledRows.map(r => r.id),
            nominalExpiredBGN: nominalExpired,
            effectiveDecrementBGN: effectiveDecrement,
          }),
        },
      });

      logger.info(`[cashback-expiry] Wallet ${walletId}: expired ${effectiveDecrement.toFixed(2)} BGN (${cancelledCount} txn${cancelledCount > 1 ? 's' : ''})`);
    } else {
      logger.warn(
        `[cashback-expiry] Wallet ${walletId}: cancelled ${cancelledCount} expired txn(s) totalling ` +
        `${nominalExpired.toFixed(2)} BGN but availableBalance is already 0 — no wallet decrement applied`
      );
    }
  });

  return totalExpired;
}

async function runCashbackExpiry(): Promise<void> {
  const now = new Date();
  logger.info(`[cashback-expiry] Starting run at ${now.toISOString()}`);

  const affectedWallets = await prisma.walletTransaction.findMany({
    // cashbackExpiresAt not yet in generated Prisma types — run `prisma generate` to fix
    where: {
      type: WalletTransactionType.CASHBACK_CREDIT,
      status: WalletTransactionStatus.COMPLETED,
      cashbackExpiresAt: { lt: now },
    } as any,
    select: { walletId: true },
    distinct: ['walletId'],
  });

  logger.info(`[cashback-expiry] ${affectedWallets.length} wallet(s) have expired cashback`);

  let processedWallets = 0;
  let failedWallets = 0;
  let totalExpiredBGN = 0;

  for (let i = 0; i < affectedWallets.length; i += CASHBACK_EXPIRY_BATCH) {
    const batch = affectedWallets.slice(i, i + CASHBACK_EXPIRY_BATCH);
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

// ── Upload token cleanup ──────────────────────────────────────────────────────

async function purgeExpiredUploadTokens(): Promise<void> {
  const now = new Date();
  logger.info(`[upload-token-cleanup] Starting run at ${now.toISOString()}`);

  const { count } = await prisma.receiptUploadToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  logger.info(`[upload-token-cleanup] Purged ${count} expired token(s)`);
}

// ── Stale session cleanup ─────────────────────────────────────────────────
// SESSION_ACTIVE sticker scans that were never completed (user scanned QR but
// never submitted a receipt). Runs at 7:15 AM Sofia, well after the 6 AM deadline.

async function expireStaleSessions(): Promise<void> {
  const now = new Date();
  logger.info(`[stale-session-cleanup] Starting run at ${now.toISOString()}`);

  // The per-session deadline is "6 AM Sofia the calendar day after the scan".
  // The maximum possible wait is ~30 hours (scan at 23:59 → deadline next day 06:00).
  // We use a 36-hour cutoff from now: any SESSION_ACTIVE scan older than 36 hours has
  // definitely passed its deadline regardless of timezone or DST transitions. This is
  // slightly conservative (sessions linger 6 hours past deadline at worst) but avoids
  // all timezone edge cases.
  const cutoff = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const { count } = await prisma.stickerScan.updateMany({
    where: {
      status: 'SESSION_ACTIVE' as any,
      createdAt: { lt: cutoff },
    },
    data: {
      status: 'EXPIRED' as any,
    },
  });

  logger.info(`[stale-session-cleanup] Expired ${count} stale session(s)`);
}

// ── Subscription expiry ───────────────────────────────────────────────────────
// Paysera subscriptions marked with cancelAtPeriodEnd=true have no external
// webhook to finalize the cancellation. This job checks daily and expires them.
// Stripe subscriptions don't need this — Stripe fires customer.subscription.deleted.

async function expireCancelledSubscriptions(): Promise<void> {
  const now = new Date();
  logger.info(`[subscription-expiry] Starting run at ${now.toISOString()}`);

  const expiredSubs = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lt: now },
      // Only Paysera-based (no Stripe subscription ID)
      stripeSubscriptionId: null,
    },
  });

  logger.info(`[subscription-expiry] Found ${expiredSubs.length} subscription(s) past period end`);

  let processed = 0;
  let failed = 0;

  for (const sub of expiredSubs) {
    try {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.CANCELLED },
      });

      // Dynamic import to avoid circular dependency (card → subscription → scheduler)
      const { cardService } = await import('../services/card.service');
      await cardService.syncCardTypeWithSubscription(sub.userId, 'LIGHT');

      processed++;
      logger.info(`[subscription-expiry] Expired subscription ${sub.id} for user ${sub.userId}`);
    } catch (err) {
      failed++;
      logger.error(`[subscription-expiry] Failed to expire subscription ${sub.id}:`, err);
    }
  }

  logger.info(
    `[subscription-expiry] Done — expired ${processed} subscription(s)` +
    (failed > 0 ? `, ${failed} failed` : '')
  );
}

// ── Registration ───────────────────────────────────────────────────────────────

export function registerScheduledJobs(): void {
  // Never register cron jobs in test mode — they keep the process alive and
  // can corrupt test fixtures with async DB mutations.
  if (process.env.NODE_ENV === 'test') {
    logger.info('[scheduler] Skipping job registration in test environment');
    return;
  }

  // 2 AM every day — expire CASHBACK_CREDIT transactions past their 60-day window
  cron.schedule('0 2 * * *', () => {
    runCashbackExpiry().catch((err) =>
      logger.error('[cashback-expiry] Unhandled error in scheduled run:', err)
    );
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: cashback-expiry (0 2 * * *)');

  // 3:30 AM every day — purge expired upload tokens (already past 1h TTL)
  cron.schedule('30 3 * * *', () => {
    purgeExpiredUploadTokens().catch((err) =>
      logger.error('[upload-token-cleanup] Unhandled error in scheduled run:', err)
    );
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: upload-token-cleanup (30 3 * * *)');

  // 7:15 AM every day — expire SESSION_ACTIVE sticker scans past their deadline
  // Runs after the 6 AM Sofia deadline so all expired sessions are caught.
  cron.schedule('15 7 * * *', () => {
    expireStaleSessions().catch((err) =>
      logger.error('[stale-session-cleanup] Unhandled error in scheduled run:', err)
    );
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: stale-session-cleanup (15 7 * * *)');

  // 1:30 AM every day — expire Paysera subscriptions past their billing period
  // that were marked cancelAtPeriodEnd=true but never finalized.
  cron.schedule('30 1 * * *', () => {
    expireCancelledSubscriptions().catch((err) =>
      logger.error('[subscription-expiry] Unhandled error in scheduled run:', err)
    );
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: subscription-expiry (30 1 * * *)');
}
