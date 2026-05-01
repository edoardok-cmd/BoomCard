/**
 * Job Scheduler
 *
 * Registers all background jobs using node-cron so they run automatically
 * inside the API process. Jobs are also runnable as one-off scripts via npx tsx.
 *
 * Schedule (Europe/Sofia unless noted):
 *   subscription-expiry              — 30 1 * * *   (1:30 AM daily)
 *   cashback-expiry                  — 0 2 * * *    (2:00 AM daily)
 *   cashback-expiring-warning        — 0 3 * * *    (3:00 AM daily — warn users 7 days before expiry)
 *   upload-token-cleanup             — 30 3 * * *   (3:30 AM daily)
 *   pending-subscription-cleanup     — 30 3 * * *   (3:30 AM daily)
 *   menu-expiry                      — 0 5 * * *    (5:00 AM daily)
 *   trial-pending-cashback           — 30 5 * * *   (5:30 AM daily)
 *   paysera-renewal                  — 0 6 * * *    (6:00 AM UTC daily)
 *   stale-session-cleanup            — 15 7 * * *   (7:15 AM daily)
 *   partner-daily-digest             — 0 8 * * *    (8:00 AM daily)
 *   partner-onboarding-nudge         — 0 9 * * *    (9:00 AM daily)
 *   partner-monthly-statement        — 0 10 1 * *   (10:00 AM on 1st of month)
 *   payment-failure-spike-scan       — 0 * * * *    (every hour)
 *   pending-payment-reminders        — 0 * * * *    (every hour)
 *   ocr-backlog-scan                 — every 6 hours
 *   user-risk-sweep                  — 0 4 * * *    (4:00 AM daily)
 *   marketing-list-sync              — 30 2 * * *   (2:30 AM daily — after cashback-expiry)
 */

import cron from 'node-cron';
import { WalletTransactionType, WalletTransactionStatus, SubscriptionStatus, SubscriptionPlan } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';
import { processPayseraRenewals } from './paysera-renewal';
import { processPendingPaymentReminders, cleanupExpiredPendingPayments } from './pending-payment-reminders';
import { runUserRiskSweep } from './user-risk-sweep';
import { fireAutomation } from '../lib/automationDispatcher';
import { getPayoutThresholdBGN } from '../utils/payoutThreshold';

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
      where: {
        walletId,
        type: WalletTransactionType.CASHBACK_CREDIT,
        status: WalletTransactionStatus.COMPLETED,
        cashbackExpiresAt: { lt: now },
      },
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


// ── Payment failure rate spike detection ──────────────────────────────────────
// Hourly scan over the last 60m of Transaction rows. Alerts admins if the
// failure rate exceeds 20% with a minimum sample size of 10, so a single
// failure on a slow hour doesn't page.

const PAYMENT_FAILURE_RATE_WINDOW_MIN = 60;
const PAYMENT_FAILURE_RATE_MIN_SAMPLES = 10;
const PAYMENT_FAILURE_RATE_THRESHOLD_PCT = 20;

// ── Resolve TRIAL_PENDING cashback after trial window closes ──────────────────
// Finds TRIAL_PENDING CASHBACK_CREDIT transactions whose owner's subscription
// trial window (trialRefundEligibleUntil) has now expired, then promotes them
// to COMPLETED and increments availableBalance — making the funds withdrawable.

async function resolveTrialPendingCashback(): Promise<void> {
  const now = new Date();
  logger.info(`[trial-pending-cashback] Starting run at ${now.toISOString()}`);

  // Find all distinct wallets that still hold TRIAL_PENDING cashback
  const pendingWallets = await prisma.walletTransaction.findMany({
    where: {
      status: WalletTransactionStatus.TRIAL_PENDING,
      type: WalletTransactionType.CASHBACK_CREDIT,
    },
    select: { walletId: true },
    distinct: ['walletId'],
  });

  if (pendingWallets.length === 0) {
    logger.info('[trial-pending-cashback] No TRIAL_PENDING transactions found — done');
    return;
  }

  // Fetch the userId for each wallet in one query
  const wallets = await prisma.wallet.findMany({
    where: { id: { in: pendingWallets.map(t => t.walletId) } },
    select: { id: true, userId: true },
  });

  let resolved = 0;
  let voided = 0;
  for (const wallet of wallets) {
    // Skip deleted (anonymized) users — their wallet funds are orphaned and
    // should not be promoted or emailed about.
    const userStatus = await prisma.user.findUnique({
      where: { id: wallet.userId },
      select: { status: true },
    });
    if (!userStatus || userStatus.status === 'DELETED') continue;

    // Still within the 24h trial window — leave as TRIAL_PENDING.
    const stillOpen = await prisma.subscription.findFirst({
      where: {
        userId: wallet.userId,
        trialRefundEligibleUntil: { gt: now },
        trialRefundUsed: false,
      },
      select: { id: true },
    });
    if (stillOpen) continue;

    // Check whether the user actually requested a trial refund.
    // If they did, the cashback voiding in requestTrialRefund() should have
    // already cleaned up these transactions, but it is non-fatal and could
    // have silently failed. Void any survivors here rather than promoting them
    // — crediting back cashback to a refunded user would be wrong.
    const refundUsedSub = await prisma.subscription.findFirst({
      where: { userId: wallet.userId, trialRefundUsed: true },
      select: { id: true },
    });

    const txs = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        status: WalletTransactionStatus.TRIAL_PENDING,
        type: WalletTransactionType.CASHBACK_CREDIT,
      },
      select: { id: true, amount: true },
    });

    const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0);
    if (totalAmount <= 0) continue;

    if (refundUsedSub) {
      // Void: trial refund was used but voiding failed earlier — clean up now.
      await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.updateMany({
          where: { id: { in: txs.map(t => t.id) } },
          data: { status: WalletTransactionStatus.CANCELLED },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: totalAmount } },
        });
      });
      logger.info(`[trial-pending-cashback] Voided ${totalAmount} BGN (refund used) for wallet ${wallet.id} (user ${wallet.userId})`);
      voided++;
    } else {
      // Promote: trial window expired without a refund — funds are now spendable.
      const updatedWallet = await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.updateMany({
          where: { id: { in: txs.map(t => t.id) } },
          data: { status: WalletTransactionStatus.COMPLETED },
        });
        return tx.wallet.update({
          where: { id: wallet.id },
          data: { availableBalance: { increment: totalAmount } },
        });
      });
      logger.info(`[trial-pending-cashback] Released ${totalAmount} BGN for wallet ${wallet.id} (user ${wallet.userId})`);

      // Fire payout-ready notification if the release crosses the plan's payout threshold.
      try {
        const sub = await prisma.subscription.findFirst({
          where: { userId: wallet.userId, status: { in: ['ACTIVE', 'PAUSED'] } },
          orderBy: { createdAt: 'desc' },
          select: { plan: true, metadata: true },
        });
        const plan: SubscriptionPlan = sub?.plan ?? 'LIGHT';
        const threshold = await getPayoutThresholdBGN(plan);
        const preBal = updatedWallet.availableBalance - totalAmount;
        if (preBal < threshold && updatedWallet.availableBalance >= threshold) {
          notificationService
            .notifyPayoutReady({ userId: wallet.userId, availableBalance: updatedWallet.availableBalance, threshold })
            .catch((err) => logger.error(`[trial-pending-cashback] payout-ready notify failed for ${wallet.userId}:`, err));
          fireAutomation('cashback.threshold_reached', { userId: wallet.userId })
            .catch((err) => logger.error(`[trial-pending-cashback] cashback.threshold_reached automation failed for ${wallet.userId}:`, err));
        }
      } catch (err) {
        logger.error(`[trial-pending-cashback] payout threshold check failed for ${wallet.userId}:`, err);
      }

      resolved++;
    }
  }

  logger.info(`[trial-pending-cashback] Done — released ${resolved} wallet(s), voided ${voided} (refund-used)`);
}

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

// ── Marketing list size sync ──────────────────────────────────────────────────
// Recomputes the `size` column for DYNAMIC and SEGMENT marketing lists that
// have a known syncKey. Static lists are kept accurate by member add/remove.

async function syncMarketingListSizes(): Promise<void> {
  const now = new Date();
  logger.info(`[marketing-list-sync] Starting run at ${now.toISOString()}`);

  const cutoff90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Map of syncKey → count query. Each entry must be independently safe to run.
  type SizeQuery = () => Promise<number>;
  const queries: Record<string, SizeQuery> = {
    all_active_subscribers: () =>
      prisma.user.count({
        where: {
          marketingConsentEmail: true,
          status: { not: 'DELETED' as any },
          subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] } } },
        },
      }),
    premium_holders: () =>
      prisma.user.count({
        where: {
          marketingConsentEmail: true,
          status: { not: 'DELETED' as any },
          subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, plan: { in: ['PREMIUM', 'LIGHT'] } } },
        },
      }),
    basic_holders: () =>
      prisma.user.count({
        where: {
          marketingConsentEmail: true,
          status: { not: 'DELETED' as any },
          subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, plan: 'BASIC' } },
        },
      }),
    inactive_users_90d: () =>
      prisma.user.count({
        where: {
          marketingConsentEmail: true,
          status: { not: 'DELETED' as any },
          subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } } },
          OR: [
            { lastActivityAt: { lt: cutoff90d } },
            { lastActivityAt: null, createdAt: { lt: cutoff90d } },
          ],
        },
      }),
    email_consent_active: () =>
      prisma.user.count({
        where: { marketingConsentEmail: true, status: { not: 'DELETED' as any } },
      }),
    active_partners: () =>
      prisma.partner.count({ where: { status: 'ACTIVE' } }),
    potential_partners: () =>
      prisma.partner.count({ where: { status: 'PENDING' } }),
  };

  const lists = await prisma.marketingList.findMany({
    where: { syncKey: { in: Object.keys(queries) } },
    select: { id: true, syncKey: true, name: true },
  });

  let updated = 0;
  for (const list of lists) {
    const query = queries[list.syncKey!];
    if (!query) continue;
    try {
      const count = await query();
      await prisma.marketingList.update({ where: { id: list.id }, data: { size: count } });
      updated++;
      logger.info(`[marketing-list-sync] ${list.syncKey} (${list.name}): ${count}`);
    } catch (err) {
      logger.error(`[marketing-list-sync] Failed for ${list.syncKey}:`, err);
    }
  }

  logger.info(`[marketing-list-sync] Done — updated ${updated}/${lists.length} list(s)`);
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

// ── Cashback expiry warning ────────────────────────────────────────────────────
// Fires the cashback.expiring automation for users who have CASHBACK_CREDIT
// transactions expiring within the next 7 days. Runs at 3 AM daily, after the
// 2 AM expiry job, so we never warn about cashback that already expired tonight.

const CASHBACK_EXPIRY_WARN_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function notifyCashbackExpiring(): Promise<void> {
  const now = new Date();
  // Narrow the window to exactly one cron-interval (24 h) centred on the
  // CASHBACK_EXPIRY_WARN_DAYS mark. Running at 3 AM daily, this catches
  // wallets whose cashback expires between 6 d and 7 d from now — exactly
  // once per wallet per expiry cycle, preventing the 7-email/push daily spam
  // that a full [now, now+7d] window would produce.
  const warnFrom = new Date(now.getTime() + (CASHBACK_EXPIRY_WARN_DAYS - 1) * MS_PER_DAY);
  const warnUntil = new Date(now.getTime() + CASHBACK_EXPIRY_WARN_DAYS * MS_PER_DAY);

  logger.info(`[cashback-expiring-warning] Checking for cashback expiring between ${warnFrom.toISOString()} and ${warnUntil.toISOString()}`);

  // Find distinct wallets with cashback expiring in the warning window
  const expiringRows = await prisma.walletTransaction.findMany({
    where: {
      type: WalletTransactionType.CASHBACK_CREDIT,
      status: WalletTransactionStatus.COMPLETED,
      cashbackExpiresAt: { gte: warnFrom, lte: warnUntil },
    },
    select: { walletId: true },
    distinct: ['walletId'],
  });

  if (expiringRows.length === 0) {
    logger.info('[cashback-expiring-warning] No wallets with expiring cashback found');
    return;
  }

  logger.info(`[cashback-expiring-warning] ${expiringRows.length} wallet(s) have cashback expiring within ${CASHBACK_EXPIRY_WARN_DAYS} days`);

  let fired = 0;
  for (const { walletId } of expiringRows) {
    try {
      const wallet = await prisma.wallet.findUnique({ where: { id: walletId }, select: { userId: true } });
      if (!wallet) continue;
      await fireAutomation('cashback.expiring', { userId: wallet.userId });
      fired++;
    } catch (err) {
      logger.error(`[cashback-expiring-warning] Failed for walletId ${walletId}:`, err);
    }
  }

  logger.info(`[cashback-expiring-warning] Done — fired automation for ${fired} user(s)`);
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

  // 3 AM every day — warn users whose cashback expires within the next 7 days
  cron.schedule('0 3 * * *', () => {
    notifyCashbackExpiring().catch((err) => alertSchedulerFailure('cashback-expiring-warning', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: cashback-expiring-warning (0 3 * * *)');

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

  // 5:30 AM every day — promote TRIAL_PENDING cashback to COMPLETED once trial window closes
  cron.schedule('30 5 * * *', () => {
    resolveTrialPendingCashback().catch((err) => alertSchedulerFailure('trial-pending-cashback', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: trial-pending-cashback (30 5 * * *)');

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

  // 4 AM every day — recompute User.riskScore/riskBucket for every subscriber
  // so the SQL risk-level filter on the admin list converges to fresh values.
  // Lazy on-read covers users who get paginated to; this catches everyone else.
  cron.schedule('0 4 * * *', () => {
    runUserRiskSweep().catch((err) => alertSchedulerFailure('user-risk-sweep', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: user-risk-sweep (0 4 * * *)');

  // 2:30 AM every day — recompute sizes for DYNAMIC/SEGMENT marketing lists
  // (STATIC list sizes are kept accurate by member add/remove events).
  cron.schedule('30 2 * * *', () => {
    syncMarketingListSizes().catch((err) => alertSchedulerFailure('marketing-list-sync', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: marketing-list-sync (30 2 * * *)');
}
