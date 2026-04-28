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
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';
import { processPayseraRenewals } from './paysera-renewal';
import { processPendingPaymentReminders, cleanupExpiredPendingPayments } from './pending-payment-reminders';

const CASHBACK_EXPIRY_BATCH = 10;

// Alert the admin-ops channel if a nightly cashback expiry run is unusually large.
// Values reflect our current scale — bump these as steady-state grows so we
// don't page on normal Black Friday traffic.
const CASHBACK_EXPIRY_ANOMALY_WALLETS = 500;
const CASHBACK_EXPIRY_ANOMALY_BGN = 5000;

// ── Sofia-calendar helpers ────────────────────────────────────────────────────
// Fly.io containers run UTC, so naive `new Date().setHours(0)` gives UTC
// midnight, which in Sofia terms is 02:00/03:00 of the same calendar day —
// events in the first 2–3 hours of the Sofia day leak into yesterday's
// window. Compute boundaries from the Sofia calendar date instead.

/** Return the UTC instant corresponding to 00:00 Europe/Sofia on `sofiaDate`. */
function sofiaMidnightUtc(sofiaDate: Date): Date {
  const dayStr = sofiaDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
  const [y, m, d] = dayStr.split('-').map(Number);
  // Probe the Sofia offset in effect at 00:00 on the target day. European DST
  // transitions happen at 03:00 local (forward last Sun of March, back last Sun
  // of October), so probing at noon of the target day returns the POST-transition
  // offset — wrong for dates where midnight is still in the prior regime. Instead
  // probe 22:00 UTC of the previous day, which is 00:00 or 01:00 Sofia on the
  // target date and always precedes any 03:00-local DST jump.
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sofia',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(Date.UTC(y, m - 1, d - 1, 22)));
  const offsetPart = dateParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const offset = offsetPart.replace(/^GMT/, '') || '+02:00';
  return new Date(`${dayStr}T00:00:00${offset}`);
}

/** Start of today in Europe/Sofia as a UTC Date. */
function todayStartSofia(now: Date): Date {
  return sofiaMidnightUtc(now);
}

/** Start of the first day of `monthsAgo` months ago in Europe/Sofia as a UTC Date. */
function monthStartSofia(now: Date, monthsAgo: number): Date {
  const dayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
  const [y, m] = dayStr.split('-').map(Number);
  const targetY = m - monthsAgo < 1 ? y - 1 : y;
  const targetM = ((m - monthsAgo - 1 + 12) % 12) + 1;
  return sofiaMidnightUtc(new Date(Date.UTC(targetY, targetM - 1, 1, 12)));
}

// ── Cashback expiry ────────────────────────────────────────────────────────────

/**
 * Expire CASHBACK_CREDIT rows past their cashbackExpiresAt for a single wallet.
 * Returns the amount deducted from availableBalance.
 *
 * Exported so ad-hoc flows (e.g. pre-payout pruning in wallet.service.ts) can
 * guarantee fresh expiry state instead of waiting on the nightly cron.
 */
export async function expireWallet(walletId: string, now: Date): Promise<number> {
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
      UPDATE "wallet_transactions"
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

  // Anomaly alert: big nightly expiries are either a legitimate one-time
  // backlog flush (scale-up, seeded data) or a bug. Either way the ops team
  // should see it the next morning, not discover it weeks later in logs.
  if (
    processedWallets >= CASHBACK_EXPIRY_ANOMALY_WALLETS ||
    totalExpiredBGN >= CASHBACK_EXPIRY_ANOMALY_BGN
  ) {
    notificationService
      .notifyAdminCashbackExpiryAnomaly({
        walletsAffected: processedWallets,
        totalExpiredBGN,
      })
      .catch((err) => logger.error('[cashback-expiry] Failed to notify admin anomaly:', err));
  }
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

// ── PendingSubscription expiry cleanup ───────────────────────────────────────
// PendingSubscription rows in CREATED or FAILED state past their expiresAt
// (set to ~24h at checkout initiation) are never going to convert — remove them.

async function cleanupExpiredPendingSubscriptions(): Promise<void> {
  const now = new Date();
  const { count } = await prisma.pendingSubscription.deleteMany({
    where: {
      status: { in: ['CREATED', 'FAILED'] },
      expiresAt: { lt: now },
    },
  });
  if (count > 0) {
    logger.info(`[pending-subscription-cleanup] Deleted ${count} expired PendingSubscription row(s)`);
  }
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

      // Check if the user has another active subscription (e.g. they re-subscribed
      // before the old period ended). If so, sync card to the new plan rather than
      // blindly downgrading to LIGHT.
      const otherActiveSub = await prisma.subscription.findFirst({
        where: {
          userId: sub.userId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          id: { not: sub.id },
        },
        orderBy: { createdAt: 'desc' },
      });

      const targetPlan = otherActiveSub?.plan ?? 'LIGHT';

      // Dynamic import to avoid circular dependency (card → subscription → scheduler)
      const { cardService } = await import('../services/card.service');
      await cardService.syncCardTypeWithSubscription(sub.userId, targetPlan);

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

// ── Stale menu submission expiry ──────────────────────────────────────────────
// Submissions left PENDING for more than MENU_EXPIRY_DAYS are auto-rejected.
// Partner receives an email so they know to resubmit.

const MENU_EXPIRY_DAYS = 30;

async function expireStaleMenuSubmissions(): Promise<void> {
  const now = new Date();
  logger.info(`[menu-expiry] Starting run at ${now.toISOString()}`);

  const cutoff = new Date(now.getTime() - MENU_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.venue.findMany({
    where: {
      menuStatus: 'PENDING',
      menuSubmittedAt: { lt: cutoff },
    },
    include: {
      partner: {
        select: { businessName: true, user: { select: { email: true } } },
      },
    },
  });

  logger.info(`[menu-expiry] ${stale.length} submission(s) older than ${MENU_EXPIRY_DAYS} days`);

  let processed = 0;
  let failed = 0;

  for (const venue of stale) {
    try {
      const expiryReason = `Review request expired after ${MENU_EXPIRY_DAYS} days without admin action. Please resubmit.`;

      await prisma.venue.update({
        where: { id: venue.id },
        data: {
          menuStatus: 'REJECTED',
          menuRejectionReason: expiryReason,
          menuReviewedAt: now,
        },
      });

      const partnerEmail: string | undefined = venue.partner?.user?.email;
      if (partnerEmail) {
        await emailService.sendMenuRejectedEmail(partnerEmail, {
          partnerName: venue.partner.businessName,
          venueName: venue.name,
          rejectedUrl: venue.pendingMenuUrl ?? '',
          reason: expiryReason,
          dashboardUrl: process.env.PARTNER_DASHBOARD_URL,
        });
      }

      logger.info(`[menu-expiry] Expired venue ${venue.id} (${venue.name})`);
      processed++;
    } catch (err) {
      failed++;
      logger.error(`[menu-expiry] Failed for venue ${venue.id}:`, err);
    }
  }

  logger.info(
    `[menu-expiry] Done — expired ${processed} submission(s)` +
    (failed > 0 ? `, ${failed} failed` : '')
  );
}

// ── Partner daily digest ──────────────────────────────────────────────────────
// Aggregates yesterday's activity per partner/venue and sends one digest
// notification. Skipped silently when the partner had no events — avoids
// spamming inactive partners.

async function sendPartnerDailyDigests(): Promise<void> {
  const now = new Date();
  // Sofia-calendar window: [yesterday 00:00 Sofia, today 00:00 Sofia). The
  // server clock runs UTC so naive setHours would off-by-2h in winter / 3h
  // in summer.
  const dayStart = todayStartSofia(now);
  const yesterdayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);

  logger.info(`[partner-daily-digest] Starting run at ${now.toISOString()} for window ${yesterdayStart.toISOString()} → ${dayStart.toISOString()}`);

  // One partner per row, summarised across all their venues. Stats are pulled
  // per-source so scans and receipts don't collide even when the underlying
  // tables are disjoint.
  const partners = await prisma.partner.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      businessName: true,
      user: { select: { id: true } },
      venues: { select: { id: true } },
    },
  });

  let sent = 0;
  for (const partner of partners) {
    if (!partner.user?.id || partner.venues.length === 0) continue;
    const venueIds = partner.venues.map((v) => v.id);

    const [scans, receipts, redemptions] = await Promise.all([
      prisma.stickerScan.findMany({
        where: {
          venueId: { in: venueIds },
          status: 'APPROVED',
          processedAt: { gte: yesterdayStart, lt: dayStart },
        },
        select: { verifiedAmount: true, billAmount: true, cashbackAmount: true },
      }),
      prisma.receipt.findMany({
        where: {
          venueId: { in: venueIds },
          status: 'APPROVED',
          reviewedAt: { gte: yesterdayStart, lt: dayStart },
        },
        select: { totalAmount: true, cashbackAmount: true },
      }),
      prisma.offerRedemption.count({
        where: {
          offer: { partnerId: partner.id },
          redeemedAt: { gte: yesterdayStart, lt: dayStart },
        },
      }),
    ]);

    const revenueBGN =
      scans.reduce((sum, s) => sum + (s.verifiedAmount ?? s.billAmount ?? 0), 0) +
      receipts.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
    const cashbackOwedBGN =
      scans.reduce((sum, s) => sum + s.cashbackAmount, 0) +
      receipts.reduce((sum, r) => sum + r.cashbackAmount, 0);

    try {
      await notificationService.notifyPartnerDailyDigest({
        partnerUserId: partner.user.id,
        businessName: partner.businessName,
        scans: scans.length,
        receipts: receipts.length,
        redemptions,
        revenueBGN,
        cashbackOwedBGN,
      });
      if (scans.length + receipts.length + redemptions > 0) sent++;
    } catch (err) {
      logger.error(`[partner-daily-digest] Failed for partner ${partner.id}:`, err);
    }
  }

  logger.info(`[partner-daily-digest] Done — sent ${sent}/${partners.length} digest(s)`);
}

// ── Partner onboarding nudges ─────────────────────────────────────────────────
// Daily scan: find ACTIVE/PENDING partners missing critical profile fields
// (logo, description, venue with menu) and nudge them. Each nudge goes to
// the partner's in-app bell — we don't email daily, too aggressive.

async function sendPartnerOnboardingNudges(): Promise<void> {
  logger.info(`[partner-onboarding-nudge] Starting run at ${new Date().toISOString()}`);

  const partners = await prisma.partner.findMany({
    where: { status: { in: ['ACTIVE', 'PENDING'] } },
    select: {
      id: true,
      businessName: true,
      logo: true,
      description: true,
      coverImage: true,
      userId: true,
      venues: {
        select: { id: true, menuStatus: true, menuUrl: true },
      },
    },
  });

  let nudged = 0;
  for (const partner of partners) {
    const missing: string[] = [];
    if (!partner.logo) missing.push('logo');
    if (!partner.description) missing.push('description');
    if (partner.venues.length === 0) {
      missing.push('at least one venue');
    } else if (partner.venues.every((v) => !v.menuUrl && v.menuStatus !== 'APPROVED')) {
      missing.push('menu');
    }

    if (missing.length === 0) continue;

    try {
      await notificationService.notifyPartnerOnboardingIncomplete({
        partnerUserId: partner.userId,
        businessName: partner.businessName,
        missing,
      });
      nudged++;
    } catch (err) {
      logger.error(`[partner-onboarding-nudge] Failed for partner ${partner.id}:`, err);
    }
  }

  logger.info(`[partner-onboarding-nudge] Done — nudged ${nudged}/${partners.length} partner(s)`);
}

// ── Partner monthly statement ─────────────────────────────────────────────────
// 1st of month: aggregates last-month revenue per partner and fires a
// notification (+email) with the totals. The existing PartnerCashbackPayment
// model is the long-term settlement record; this is just the heads-up
// notification so partners know a statement exists.

async function sendPartnerMonthlyStatements(): Promise<void> {
  const now = new Date();
  logger.info(`[partner-monthly-statement] Starting run at ${now.toISOString()}`);

  // Compute the month that just ended in Europe/Sofia. Aligning the window to
  // Sofia midnight (not UTC midnight) is important: events between 00:00 and
  // 03:00 Sofia on the 1st would otherwise bleed into "last month" because
  // naive Date math uses the UTC-container's local TZ.
  const thisMonth = monthStartSofia(now, 0);
  const lastMonthStart = monthStartSofia(now, 1);
  // Derive the month label from the Sofia calendar so a run that fires at
  // 07:00 UTC on April 1 (10:00 Sofia) reports "2026-03", not "2026-04".
  const lastMonthDayStr = new Date(thisMonth.getTime() - 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
  const monthLabel = lastMonthDayStr.slice(0, 7);

  const partners = await prisma.partner.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      businessName: true,
      userId: true,
      venues: { select: { id: true } },
    },
  });

  let sent = 0;
  for (const partner of partners) {
    if (partner.venues.length === 0) continue;
    const venueIds = partner.venues.map((v) => v.id);

    const [scans, receipts] = await Promise.all([
      prisma.stickerScan.findMany({
        where: {
          venueId: { in: venueIds },
          status: 'APPROVED',
          processedAt: { gte: lastMonthStart, lt: thisMonth },
        },
        select: { verifiedAmount: true, billAmount: true, cashbackAmount: true },
      }),
      prisma.receipt.findMany({
        where: {
          venueId: { in: venueIds },
          status: 'APPROVED',
          reviewedAt: { gte: lastMonthStart, lt: thisMonth },
        },
        select: { totalAmount: true, cashbackAmount: true },
      }),
    ]);

    const receiptCount = scans.length + receipts.length;
    if (receiptCount === 0) continue;

    const revenueBGN =
      scans.reduce((sum, s) => sum + (s.verifiedAmount ?? s.billAmount ?? 0), 0) +
      receipts.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);
    const cashbackOwedBGN =
      scans.reduce((sum, s) => sum + s.cashbackAmount, 0) +
      receipts.reduce((sum, r) => sum + r.cashbackAmount, 0);

    try {
      await notificationService.notifyPartnerMonthlyStatement({
        partnerUserId: partner.userId,
        businessName: partner.businessName,
        month: monthLabel,
        receipts: receiptCount,
        revenueBGN,
        cashbackOwedBGN,
      });
      sent++;
    } catch (err) {
      logger.error(`[partner-monthly-statement] Failed for partner ${partner.id}:`, err);
    }
  }

  logger.info(`[partner-monthly-statement] Done — sent ${sent} statement(s) for ${monthLabel}`);
}

// ── Subscription renewal reminders (cron wrapper) ─────────────────────────────
// Daily scan for subscriptions renewing in ~7 days. Also fires an in-app
// notification in addition to the existing renewal email so partners who
// live in the dashboard see it too. Idempotent via subscription.metadata.renewalReminderSent.

async function runSubscriptionRenewalReminders(): Promise<void> {
  const now = new Date();
  logger.info(`[subscription-renewal-reminders] Starting run at ${now.toISOString()}`);

  const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gte: sixDaysFromNow, lte: eightDaysFromNow },
    },
    include: {
      user: { select: { id: true, email: true, firstName: true, status: true } },
      planDetails: true,
    },
  });

  logger.info(`[subscription-renewal-reminders] Found ${subscriptions.length} subscription(s) in the 6–8 day window`);

  let reminded = 0;
  for (const sub of subscriptions) {
    if (!sub.user || (sub.user.status !== 'ACTIVE' && sub.user.status !== 'PENDING_VERIFICATION')) continue;

    let metadata: Record<string, any> = {};
    if (sub.metadata) {
      try { metadata = JSON.parse(sub.metadata); } catch { metadata = {}; }
    }
    const periodKey = sub.currentPeriodEnd.toISOString().split('T')[0];
    if (metadata.renewalReminderSent === periodKey) continue;

    const plan = sub.planDetails;
    const priceInCents = (() => {
      if (!plan) return 0;
      const billingPeriod = (metadata.billingPeriod ?? '').toLowerCase();
      if (billingPeriod.includes('week') && plan.priceWeeklyEur) return plan.priceWeeklyEur;
      if (billingPeriod.includes('year')) return plan.priceYearlyEur;
      return plan.priceMonthlyEur ?? 0;
    })();
    const price = `€${(priceInCents / 100).toFixed(2)}`;
    const planName = plan?.displayName ?? sub.plan;

    // In-app notification (new)
    await notificationService
      .notifyPartnerRenewalUpcoming({
        userId: sub.user.id,
        planName,
        renewalDate: sub.currentPeriodEnd,
        price,
      })
      .catch((err) => logger.error(`[subscription-renewal-reminders] In-app notify failed for sub ${sub.id}:`, err));

    // Existing email path
    if (sub.user.email) {
      await emailService
        .sendRenewalReminder(sub.user.email, {
          customerName: sub.user.firstName || 'Customer',
          planName,
          planNameBg: plan?.displayNameBg || planName,
          price,
          renewalDate: sub.currentPeriodEnd.toLocaleDateString('en-GB'),
          manageUrl: 'https://boomcard.bg/dashboard/subscription',
          language: 'en',
        })
        .catch((err) => logger.error(`[subscription-renewal-reminders] Email failed for sub ${sub.id}:`, err));
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        metadata: JSON.stringify({ ...metadata, renewalReminderSent: periodKey }),
      },
    });
    reminded++;
  }

  logger.info(`[subscription-renewal-reminders] Done — reminded ${reminded} user(s)`);
}

// ── Payment failure rate spike detection ──────────────────────────────────────
// Hourly scan over the last 60m of Transaction rows. Alerts admins if the
// failure rate exceeds 20% with a minimum sample size of 10, so a single
// failure on a slow hour doesn't page.

const PAYMENT_FAILURE_RATE_WINDOW_MIN = 60;
const PAYMENT_FAILURE_RATE_MIN_SAMPLES = 10;
const PAYMENT_FAILURE_RATE_THRESHOLD_PCT = 20;

async function checkPaymentFailureSpike(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - PAYMENT_FAILURE_RATE_WINDOW_MIN * 60 * 1000);

  const [failures, successes] = await Promise.all([
    prisma.transaction.count({
      where: { status: 'FAILED', createdAt: { gte: windowStart } },
    }),
    prisma.transaction.count({
      where: { status: 'COMPLETED', createdAt: { gte: windowStart } },
    }),
  ]);

  const total = failures + successes;
  if (total < PAYMENT_FAILURE_RATE_MIN_SAMPLES) {
    logger.info(`[payment-failure-spike-scan] Below sample threshold (${total}/${PAYMENT_FAILURE_RATE_MIN_SAMPLES}) — skipping`);
    return;
  }

  const rate = (failures / total) * 100;
  if (rate < PAYMENT_FAILURE_RATE_THRESHOLD_PCT) {
    logger.info(`[payment-failure-spike-scan] Rate ${rate.toFixed(1)}% below threshold`);
    return;
  }

  await notificationService.notifyAdminPaymentFailureSpike({
    failures,
    successes,
    windowMinutes: PAYMENT_FAILURE_RATE_WINDOW_MIN,
  });
  logger.warn(`[payment-failure-spike-scan] ALERT — ${failures}/${total} (${rate.toFixed(1)}%) failed in last ${PAYMENT_FAILURE_RATE_WINDOW_MIN}m`);
}

// ── OCR manual-review backlog scan ───────────────────────────────────────────
// Every 6h: if the queue or oldest-pending age exceeds thresholds, alert.
// Non-urgent — this is a staffing signal, not an incident.

const OCR_BACKLOG_COUNT_THRESHOLD = 50;
const OCR_BACKLOG_AGE_HOURS_THRESHOLD = 48;

async function checkOcrBacklog(): Promise<void> {
  const now = new Date();
  const [pendingCount, oldest] = await Promise.all([
    prisma.receipt.count({ where: { status: 'MANUAL_REVIEW' } }),
    prisma.receipt.findFirst({
      where: { status: 'MANUAL_REVIEW' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  if (pendingCount === 0) return;
  const oldestAgeHours = oldest ? (now.getTime() - oldest.createdAt.getTime()) / (60 * 60 * 1000) : 0;

  if (pendingCount < OCR_BACKLOG_COUNT_THRESHOLD && oldestAgeHours < OCR_BACKLOG_AGE_HOURS_THRESHOLD) {
    return;
  }

  await notificationService.notifyAdminOcrBacklog({
    pendingCount,
    oldestAgeHours,
  });
  logger.warn(`[ocr-backlog-scan] ALERT — ${pendingCount} pending, oldest ${oldestAgeHours.toFixed(1)}h`);
}

// ── Registration ───────────────────────────────────────────────────────────────

/**
 * Shared wrapper: log, and post an admin-ops alert, when a scheduled job
 * throws. Keeping this in one place means every cron hooks failure
 * reporting the same way — no silent 2 AM breakage.
 */
function alertSchedulerFailure(jobName: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`[${jobName}] Unhandled error in scheduled run:`, err);
  notificationService
    .notifyAdminSchedulerFailure({ jobName, errorMessage: message })
    .catch((notifyErr) => logger.error(`[${jobName}] Failed to post scheduler-failure alert:`, notifyErr));
}

export function registerScheduledJobs(): void {
  // Never register cron jobs in test mode — they keep the process alive and
  // can corrupt test fixtures with async DB mutations.
  if (process.env.NODE_ENV === 'test') {
    logger.info('[scheduler] Skipping job registration in test environment');
    return;
  }

  // 2 AM every day — expire CASHBACK_CREDIT transactions past their 60-day window
  cron.schedule('0 2 * * *', () => {
    runCashbackExpiry().catch((err) => alertSchedulerFailure('cashback-expiry', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: cashback-expiry (0 2 * * *)');

  // 3:30 AM every day — purge expired upload tokens + expired PendingSubscription rows
  cron.schedule('30 3 * * *', () => {
    purgeExpiredUploadTokens().catch((err) => alertSchedulerFailure('upload-token-cleanup', err));
    cleanupExpiredPendingSubscriptions().catch((err) => alertSchedulerFailure('pending-subscription-cleanup', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: upload-token-cleanup (30 3 * * *)');
  logger.info('[scheduler] Registered: pending-subscription-cleanup (30 3 * * *)');

  // 7:15 AM every day — expire SESSION_ACTIVE sticker scans past their deadline
  // Runs after the 6 AM Sofia deadline so all expired sessions are caught.
  cron.schedule('15 7 * * *', () => {
    expireStaleSessions().catch((err) => alertSchedulerFailure('stale-session-cleanup', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: stale-session-cleanup (15 7 * * *)');

  // 1:30 AM every day — expire Paysera subscriptions past their billing period
  // that were marked cancelAtPeriodEnd=true but never finalized.
  cron.schedule('30 1 * * *', () => {
    expireCancelledSubscriptions().catch((err) => alertSchedulerFailure('subscription-expiry', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: subscription-expiry (30 1 * * *)');

  // 6:00 AM UTC every day — Paysera auto-renewal: pause expired active subs,
  // send renewal reminder email, cancel subs past the 7-day grace period.
  cron.schedule('0 6 * * *', () => {
    processPayseraRenewals().catch((err) => alertSchedulerFailure('paysera-renewal', err));
  });

  logger.info('[scheduler] Registered: paysera-renewal (0 6 * * * UTC)');

  // 5 AM every day — auto-reject menu submissions pending for more than 30 days
  cron.schedule('0 5 * * *', () => {
    expireStaleMenuSubmissions().catch((err) => alertSchedulerFailure('menu-expiry', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: menu-expiry (0 5 * * *)');

  // 8 AM every day — partner daily digest of yesterday's activity per venue
  cron.schedule('0 8 * * *', () => {
    sendPartnerDailyDigests().catch((err) => alertSchedulerFailure('partner-daily-digest', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: partner-daily-digest (0 8 * * *)');

  // 9 AM every day — onboarding nudges to partners missing profile fields
  cron.schedule('0 9 * * *', () => {
    sendPartnerOnboardingNudges().catch((err) => alertSchedulerFailure('partner-onboarding-nudge', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: partner-onboarding-nudge (0 9 * * *)');

  // 1st of month 10 AM — monthly statements for partners
  cron.schedule('0 10 1 * *', () => {
    sendPartnerMonthlyStatements().catch((err) => alertSchedulerFailure('partner-monthly-statement', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: partner-monthly-statement (0 10 1 * *)');

  // 3 AM every day — subscription renewal reminders (7 days out)
  cron.schedule('0 3 * * *', () => {
    runSubscriptionRenewalReminders().catch((err) => alertSchedulerFailure('subscription-renewal-reminders', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: subscription-renewal-reminders (0 3 * * *)');

  // Every hour — scan for payment failure rate spikes
  cron.schedule('0 * * * *', () => {
    checkPaymentFailureSpike().catch((err) => alertSchedulerFailure('payment-failure-spike-scan', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: payment-failure-spike-scan (0 * * * *)');

  // Every hour — pending-payment reminder emails (1h / 24h / 7d windows) + cleanup INCOMPLETE_EXPIRED
  cron.schedule('0 * * * *', () => {
    processPendingPaymentReminders()
      .catch((err) => alertSchedulerFailure('pending-payment-reminders', err));
    cleanupExpiredPendingPayments()
      .catch((err) => alertSchedulerFailure('pending-payment-cleanup', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: pending-payment-reminders (0 * * * *)');

  // Every 6 hours — OCR manual-review backlog check
  cron.schedule('0 */6 * * *', () => {
    checkOcrBacklog().catch((err) => alertSchedulerFailure('ocr-backlog-scan', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: ocr-backlog-scan (0 */6 * * *)');
}
