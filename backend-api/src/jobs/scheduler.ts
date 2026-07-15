/**
 * Job Scheduler
 *
 * Registers all background jobs using node-cron so they run automatically
 * inside the API process. Jobs are also runnable as one-off scripts via npx tsx.
 *
 * Schedule (Europe/Sofia unless noted):
 *   subscription-expiry              — 30 1 * * *   (1:30 AM daily)
 *   cashback-expiry                  — 0 2 * * *    (2:00 AM daily)
 *   stale-pending-cashback-expiry    — 5 2 * * *    (2:05 AM daily — no-op placeholder; spec §1.3/§8.2 PENDING never expires)
 *   cashback-expiring-warning        — 0 3 * * *    (3:00 AM daily — warn users 7 days before expiry)
 *   upload-token-cleanup             — 30 3 * * *   (3:30 AM daily)
 *   pending-subscription-cleanup     — 30 3 * * *   (3:30 AM daily)
 *   menu-expiry                      — 0 5 * * *    (5:00 AM daily)
 *   trial-pending-cashback           — 30 5 * * *   (5:30 AM daily)
 *   auto-payout                      — 0 6 * * *    (6:00 AM daily — §7.1 nightly threshold payout initiation)
 *   paysera-renewal                  — 0 6 * * *    (6:00 AM UTC daily)
 *   renewal-reminders                — 0 7 * * *    (7:00 AM daily — auto-renew OFF 3d/1d/0d cadence)
 *   stale-session-cleanup            — 15 7 * * *   (7:15 AM daily)
 *   admin-informational-digest       — 0 8 * * *    (8:00 AM daily)
 *   partner-daily-digest             — 0 8 * * *    (8:00 AM daily)
 *   partner-onboarding-nudge         — 0 9 * * *    (9:00 AM daily)
 *   partner-monthly-statement        — 0 10 1 * *   (10:00 AM on 1st of month)
 *   payment-failure-spike-scan       — 0 * * * *    (every hour)
 *   pending-payment-reminders        — 0 * * * *    (every hour)
 *   ocr-backlog-scan                 — every 6 hours
 *   user-risk-sweep                  — 0 4 * * *    (4:00 AM daily)
 *   marketing-list-sync              — 30 2 * * *   (2:30 AM daily — after cashback-expiry)
 *   inactive-user-nudge              — 30 4 * * *   (4:30 AM daily — 30-day inactivity automations)
 *   activation-link-expiry-reminder  — 30 10 * * *  (10:30 AM daily — §8.3 email + admin alert 24h before expiry)
 *   partner-sla-escalation           — 0 * * * *    (every hour — §5.1 admin alert for partner applications past 24h SLA)
 *   auto-approve-sweep               — 0 * * * *    (every hour — §2.2/§3.4/§8.1 re-attempt Low/Medium auto-approval for stranded MANUAL_REVIEW scans)
 *   ticket-auto-close                — 0 23 * * *   (11:00 PM daily — §11.4 auto-close RESOLVED tickets after 7 days)
 */

import cron from 'node-cron';
import { WalletTransactionType, WalletTransactionStatus, SubscriptionStatus, CashbackEntryStatus, PartnerRequestStatus, ScanStatus, StickerStatus, PartnerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { stickerService } from '../services/sticker.service';
import { logger } from '../utils/logger';
import { emailService } from '../services/email.service';
import { notificationService } from '../services/notification.service';
import { processPayseraRenewals } from './paysera-renewal';
import { processPendingPaymentReminders, cleanupExpiredPendingPayments } from './pending-payment-reminders';
import { runRenewalReminders } from './renewal-reminders';
import { runUserRiskSweep } from './user-risk-sweep';
import { fireAutomation } from '../lib/automationDispatcher';
import { getPayoutThresholdBGN } from '../utils/payoutThreshold';
import { resolvePayoutEligibility } from '../services/payoutEligibility.service';
import { getSystemSettingInt } from '../utils/systemSettings';
import { CASHBACK_VALIDITY_DAYS } from '../constants/receipt.constants';
import { writeAudit } from '../middleware/audit.middleware';
import { buildTicketSubject, buildTicketHeaders, buildPlusReplyTo } from '../services/ticketEmail.service';
import { expireStalePendingCashback, assertVoidReasonCategory, SYSTEM_ACTOR_ID, TRIAL_VOID_REASON } from '../services/cashbackLifecycle.service';
import { detach } from '../utils/detach';
import { SLA_WARN_HOURS } from '../services/partnerSla.helper';

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
        // Spec §4.4 / §6.1 v1.1 — exclude entries that have already exited the
        // expirable lifecycle:
        //   LOCKED — committed to an in-flight payout (balance already debited
        //     at requestPayout time); expiring would double-decrement.
        //   PAID   — terminal state after a successful payout; markPaid leaves
        //     status=COMPLETED and does not clear cashbackExpiresAt, so without
        //     this filter the next nightly sweep would cancel a paid-out row
        //     and erase the PAID audit trail.
        // OR null — legacy pre-lifecycle-column entries that pre-date the
        //   cashbackStatus column. SQL `NOT IN (...)` never matches NULL
        //   (NULL comparisons are undefined in SQL), so the OR branch is
        //   required to include them; omitting it would leave those entries
        //   expiring in the notification job but never in the actual sweep.
        OR: [
          { cashbackStatus: { notIn: [CashbackEntryStatus.LOCKED, CashbackEntryStatus.PAID] } },
          { cashbackStatus: null },
        ],
      },
    });

    if (expired.length === 0) return;

    const currentWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });

    // Use UPDATE...RETURNING to atomically capture which transactions were actually
    // cancelled and their amounts. Under READ COMMITTED isolation, a concurrent
    // run of this job could cancel some rows between our findMany and an updateMany,
    // causing updateMany.count < expired.length and a resulting over-decrement.
    // RETURNING eliminates that race by returning only the rows we actually updated.
    //
    // Spec §4.4 v1.1: also write cashbackStatus='EXPIRED' on the new-world
    // lifecycle column so buildStateWhere('Expired') resolves these rows. Without
    // this, expired entries stay forever counted under "Cleared" in dashboard stats
    // (the new-world branch matches cashbackStatus='CLEARED' regardless of expiry).
    const cancelledRows = await (tx as any).$queryRaw<Array<{ id: string; amount: number }>>`
      UPDATE "wallet_transactions"
      SET status = 'CANCELLED'::"WalletTransactionStatus",
          "cashbackStatus" = 'EXPIRED'::"CashbackEntryStatus"
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
          description: `Кешбек изтекъл (${cancelledCount} транзакци${cancelledCount > 1 ? 'и' : 'я'})`,
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
      // Mirror expireWallet's own OR guard: skip LOCKED (in-flight payout,
      // balance already debited) and PAID (terminal), but include null-status
      // legacy entries. SQL `NOT IN (...)` excludes NULLs, so the OR branch
      // is required to pick up pre-lifecycle-column rows that expireWallet
      // now also processes.
      OR: [
        { cashbackStatus: { notIn: [CashbackEntryStatus.LOCKED, CashbackEntryStatus.PAID] } },
        { cashbackStatus: null },
      ],
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
    detach(notificationService
      .notifyAdminCashbackExpiryAnomaly({
        walletsAffected: processedWallets,
        totalExpiredBGN,
      }), (err) => logger.error('[cashback-expiry] Failed to notify admin anomaly:', err));
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
      // blindly downgrading to PREMIUM_WEEKLY.
      const otherActiveSub = await prisma.subscription.findFirst({
        where: {
          userId: sub.userId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          id: { not: sub.id },
        },
        orderBy: { createdAt: 'desc' },
      });

      const targetPlan = otherActiveSub?.plan ?? 'PREMIUM_WEEKLY';

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

  // M2 / Spec §1.2 + Clash 2.1/2.2: "Cancelled (post period end) → Auto-transitions
  // to Expired." A subscription stored as CANCELLED whose paid period has now elapsed
  // must auto-transition to EXPIRED — for ALL providers (Stripe handleSubscriptionDeleted
  // stores user-cancels as CANCELLED with a future currentPeriodEnd; the Paysera sweep
  // above also lands subs in CANCELLED). Previously nothing flipped these stored CANCELLED
  // rows to EXPIRED, so post-period cancellations lingered as CANCELLED in reports and the
  // stored-status payout gate. The scan gate already keys on currentPeriodEnd (sticker
  // .service.ts) so this does not change scan behavior; it only reconciles the persisted
  // status. In-flight payouts are unaffected (earned-rights model operates on cashback
  // entries, not subscription_status).
  const postPeriodCancelled = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.CANCELLED,
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, userId: true },
  });
  if (postPeriodCancelled.length > 0) {
    logger.info(
      `[subscription-expiry] ${postPeriodCancelled.length} post-period CANCELLED subscription(s) → EXPIRED (§1.2)`
    );
    let expiredCount = 0;
    for (const sub of postPeriodCancelled) {
      try {
        // Guard the transition on the row still being CANCELLED + past period to
        // avoid racing a concurrent webhook that already moved it.
        const result = await prisma.subscription.updateMany({
          where: {
            id: sub.id,
            status: SubscriptionStatus.CANCELLED,
            currentPeriodEnd: { lt: new Date() },
          },
          data: { status: SubscriptionStatus.EXPIRED },
        });
        if (result.count > 0) expiredCount++;
      } catch (err) {
        logger.error(`[subscription-expiry] Failed to expire post-period CANCELLED sub ${sub.id}:`, err);
      }
    }
    logger.info(`[subscription-expiry] Transitioned ${expiredCount} CANCELLED → EXPIRED`);
  }
}

// ── QR code reconciliation ────────────────────────────────────────────────────
// H3 / Spec §1.4 / §3.6 / §8.1 rule 5: "Partner status change to Inactive or Archived
// → ALL QR codes automatically deactivate (backend-enforced)." The per-transition
// sync (partner.service.syncQrCodesForPartner) runs OUTSIDE the status-change
// transaction and fails soft after a bounded retry, so a transient DB fault can leave
// a sticker stale-ACTIVE on a non-operational partner. The scan-time gate
// (isPartnerOperationallyActive in sticker.service) is the authoritative protection —
// a stale-ACTIVE sticker on a non-active partner STILL cannot be scanned — but the
// sticker.status column drifts from the partner state for display/reporting purposes.
//
// This is the reconciliation job promised in partner.service.ts: it sweeps every
// non-terminal sticker (ACTIVE / PROCESSING / PENDING) whose owning partner is NOT
// operationally active and flips it to INACTIVE, restoring column consistency.
// It is idempotent and self-correcting; it does NOT reactivate anything (reactivation
// stays an explicit per-transition / admin action per §2.4).

const QR_DEACTIVATING_PARTNER_STATUSES: PartnerStatus[] = [
  PartnerStatus.INACTIVE,
  PartnerStatus.PAUSED,
  PartnerStatus.SUSPENDED,
  PartnerStatus.ARCHIVED,
];

async function reconcileQrCodes(): Promise<void> {
  logger.info('[qr-reconcile] Starting QR code reconciliation run');

  // Stale = a non-terminal sticker on a partner that is NOT operationally active.
  // Match the deactivation set used at transition time (ACTIVE/PROCESSING/PENDING);
  // terminal/non-scannable statuses (INACTIVE/REPLACED/RETIRED/DAMAGED) are left alone.
  const stale = await prisma.sticker.findMany({
    where: {
      status: { in: [StickerStatus.ACTIVE, StickerStatus.PROCESSING, StickerStatus.PENDING] },
      venue: { partner: { status: { in: QR_DEACTIVATING_PARTNER_STATUSES } } },
    },
    select: { id: true, status: true },
  });

  if (stale.length === 0) {
    logger.info('[qr-reconcile] No stale stickers — all QR codes consistent with partner state');
    return;
  }

  // Stamp autoDeactivatedAt only on the ones that were ACTIVE, mirroring the
  // transition-time policy so a later Inactive→Active reactivation only restores
  // genuinely-active stickers (PROCESSING/PENDING stay INACTIVE until admin acts).
  const activeIds = stale.filter((s) => s.status === StickerStatus.ACTIVE).map((s) => s.id);
  const otherIds = stale.filter((s) => s.status !== StickerStatus.ACTIVE).map((s) => s.id);

  let fixed = 0;
  if (activeIds.length > 0) {
    const r = await prisma.sticker.updateMany({
      where: { id: { in: activeIds }, status: StickerStatus.ACTIVE },
      data: { status: StickerStatus.INACTIVE, autoDeactivatedAt: new Date() },
    });
    fixed += r.count;
  }
  if (otherIds.length > 0) {
    const r = await prisma.sticker.updateMany({
      where: { id: { in: otherIds }, status: { in: [StickerStatus.PROCESSING, StickerStatus.PENDING] } },
      data: { status: StickerStatus.INACTIVE },
    });
    fixed += r.count;
  }

  logger.warn(
    `[qr-reconcile] Reconciled ${fixed} stale sticker(s) to INACTIVE ` +
    `(${activeIds.length} active + ${otherIds.length} processing/pending) — ` +
    `partner-status QR auto-deactivation had drifted (§8.1 rule 5).`
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

// ── Admin informational digest ────────────────────────────────────────────────
// Daily roll-up of informational alerts (new registrations, partner activations,
// completed onboarding) sent to all active admins. Spec §3.1: Informational tier
// routes to "Daily digest". Skipped silently if all counts are zero (no activity).

async function sendAdminInformationalDigest(): Promise<void> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  logger.info(`[admin-informational-digest] Starting run at ${now.toISOString()} for window ${oneDayAgo.toISOString()} → ${now.toISOString()}`);

  // Import the shared helper to avoid drift between the GET /alerts counts
  // and the scheduled digest counts.
  const { getInformationalCounts } = await import('../services/adminAlerts.service');
  const counts = await getInformationalCounts(oneDayAgo);

  // Early return: no activity → skip notification. Avoids sending empty digests
  // and lets the cooldown mechanism keep subsequent runs clean.
  if (counts.newRegistrations === 0 && counts.activatedPartners === 0 && counts.completedOnboarding === 0) {
    logger.info('[admin-informational-digest] No informational activity in window; skipping');
    return;
  }

  try {
    await notificationService.notifyAdminInformationalDigest(counts);
    logger.info(
      `[admin-informational-digest] Sent digest: ${counts.newRegistrations} registrations, ` +
      `${counts.activatedPartners} activations, ${counts.completedOnboarding} completions`
    );
  } catch (err) {
    logger.error('[admin-informational-digest] Failed to send digest:', err);
    throw err;
  }
}

// ── Pending Super-Admin request expiry reaper ─────────────────────────────────
// DEFECT 2 fix: Delete expired PendingSuperAdminRequest rows so re-submission works.
// Expired rows occupy the global @unique(email) slot and block fresh requests.
// This reaper runs daily at 5:00 AM (before the partner digest at 8 AM) to clean up.

async function reapExpiredPendingSuperAdminRequests(): Promise<void> {
  const now = new Date();
  logger.info(`[pending-super-admin-reaper] Starting run at ${now.toISOString()}`);

  try {
    const deleted = await prisma.pendingSuperAdminRequest.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    if (deleted.count > 0) {
      logger.info(`[pending-super-admin-reaper] Deleted ${deleted.count} expired PendingSuperAdminRequest row(s)`);
    } else {
      logger.info('[pending-super-admin-reaper] No expired pending requests to clean up');
    }
  } catch (err) {
    logger.error('[pending-super-admin-reaper] Failed to reap expired pending requests:', err);
    throw err;
  }
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
      if (partner.userId) {
        detach(fireAutomation('billing.month_end', { userId: partner.userId }), (err) => logger.error(`[partner-monthly-statement] billing.month_end automation failed for partner ${partner.id}:`, err));
      }
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

// BC-ADMIN-REAUDIT2-TRIALVOID-VOCAB-1 / Spec §8.1 rule 6 + §1.3: every Voided
// cashback record requires a controlled-vocabulary reason category. This
// scheduler-driven TrialPending→Voided path is an internal reconciliation
// (cashback reclaimed because a trial refund was used) — NOT user fraud — so the
// canonical category is SYSTEM_ERROR, never FRAUD. TRIAL_VOID_REASON is now
// single-sourced in cashbackLifecycle.service (alongside VOID_REASON_CATEGORIES)
// and imported here so this scheduler fallback and the user-triggered
// WalletService.voidTrialPendingCashback fast path share the identical value. It
// is validated against the controlled vocabulary at that module's load AND once
// more below (outside the per-wallet loop) as a defensive drift guard.

export async function resolveTrialPendingCashback(): Promise<void> {
  const now = new Date();
  logger.info(`[trial-pending-cashback] Starting run at ${now.toISOString()}`);

  // Defense-in-depth: assert the canonical void reason against the shared
  // controlled vocabulary ONCE before the loop. If a future edit changes
  // TRIAL_VOID_REASON to a non-canonical prefix this throws immediately rather
  // than persisting an out-of-vocabulary voidedReason across every voided row.
  assertVoidReasonCategory(TRIAL_VOID_REASON);

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
      // Spec §4.4 — mark the entry-based lifecycle as VOIDED so it remains
      // visible to the user with a reason / audit trail (vs. silently deleted).
      const voidedAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.updateMany({
          where: { id: { in: txs.map(t => t.id) } },
          data: {
            status: WalletTransactionStatus.CANCELLED,
            cashbackStatus: CashbackEntryStatus.VOIDED,
            voidedAt,
            // §8.1 rule 6 / §1.3: canonical-prefixed reason (validated above) +
            // responsible-actor stamp. System-automated void → SYSTEM_ACTOR_ID
            // sentinel so voidedByUserId is never NULL (audit trail complete).
            voidedReason: TRIAL_VOID_REASON,
            voidedByUserId: SYSTEM_ACTOR_ID,
          },
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
      // Spec §4.4 v1.1 — the 60-day rolling window starts at clearedAt, NOT at
      // the original credit time, so the user actually gets a full 60-day
      // validity window from the moment funds become Available.
      const cashbackValidityDays = await getSystemSettingInt('cashback_expiry_days', CASHBACK_VALIDITY_DAYS);
      const releasedAt = new Date();
      const expiresAt = new Date(releasedAt.getTime() + cashbackValidityDays * 24 * 60 * 60 * 1000);
      const updatedWallet = await prisma.$transaction(async (tx) => {
        await tx.walletTransaction.updateMany({
          where: { id: { in: txs.map(t => t.id) } },
          data: {
            status: WalletTransactionStatus.COMPLETED,
            cashbackStatus: CashbackEntryStatus.CLEARED,
            clearedAt: releasedAt,
            cashbackExpiresAt: expiresAt,
          },
        });
        return tx.wallet.update({
          where: { id: wallet.id },
          data: { availableBalance: { increment: totalAmount } },
        });
      });
      logger.info(`[trial-pending-cashback] Released ${totalAmount} BGN for wallet ${wallet.id} (user ${wallet.userId}); cleared 60-day window now runs until ${expiresAt.toISOString()}`);

      // Fire payout-ready notification if the release crosses the plan's payout threshold.
      try {
        // Resolve eligibility + plan threshold through the shared helper so this
        // edge uses the SAME canonical rule as requestPayout()/getBalance()/the
        // auto-payout loop: ACTIVE / TRIALING or CANCELLED-within-paid-period, AND
        // the latest-sub FAILED_PAYMENT hard-block. The previous status IN
        // ('ACTIVE','PAUSED') clause was inconsistent (it counted PAUSED, which
        // requestPayout blocks, and ignored TRIALING / CANCELLED-in-period and the
        // FAILED_PAYMENT exclusion) — so it could prompt a payout-ineligible user.
        const { eligible, threshold } = await resolvePayoutEligibility(wallet.userId, new Date());
        const preBal = updatedWallet.availableBalance - totalAmount;
        if (eligible && preBal < threshold && updatedWallet.availableBalance >= threshold) {
          // Spec §3.7 / §7.3 / §11.2 — if no IBAN on file when the threshold is
          // crossed, hold the payout and prompt the user to add bank details
          // instead of telling them they can cash out (auto-payout cron filters
          // out null-IBAN wallets). Mirrors wallet.service credit path.
          const hasIban = !!updatedWallet.payoutIban && updatedWallet.payoutIban.trim().length > 0;
          if (!hasIban) {
            detach(notificationService
              .notifyPayoutHeldNoIban({ userId: wallet.userId, availableBalance: updatedWallet.availableBalance, threshold }), (err) => logger.error(`[trial-pending-cashback] payout-held-no-iban notify failed for ${wallet.userId}:`, err));
          } else {
            detach(notificationService
              .notifyPayoutReady({ userId: wallet.userId, availableBalance: updatedWallet.availableBalance, threshold }), (err) => logger.error(`[trial-pending-cashback] payout-ready notify failed for ${wallet.userId}:`, err));
            detach(fireAutomation('cashback.threshold_reached', { userId: wallet.userId }), (err) => logger.error(`[trial-pending-cashback] cashback.threshold_reached automation failed for ${wallet.userId}:`, err));
          }
        }
      } catch (err) {
        logger.error(`[trial-pending-cashback] payout threshold check failed for ${wallet.userId}:`, err);
      }

      resolved++;
    }
  }

  logger.info(`[trial-pending-cashback] Done — released ${resolved} wallet(s), voided ${voided} (refund-used)`);
}

// ── Nightly auto-payout initiation (spec §7.1) ────────────────────────────────
// Spec §7.1: "An automatic payout is triggered by the nightly scheduler when the
// user's Cleared cashback balance reaches the plan-specific payout threshold."
//
// The IBAN-save path (wallet.service.updatePayoutAccount) only triggers a payout
// for the user who has *just* saved an IBAN while already over threshold. The
// common case — a user with an IBAN already on file who accrues past threshold
// through normal cashback clearing — was never auto-initiated; the scheduler only
// sent a notifyPayoutReady notification. This job closes that gap.
//
// Idempotency: requestPayout() itself enforces a single in-flight payout per
// wallet (it throws if a PENDING/PROCESSING WITHDRAWAL exists, and an in-flight
// payout is exactly what holds cashback in LOCKED). We additionally pre-filter on
// availableBalance >= threshold and !isLocked, and swallow the "already pending"
// / "below threshold" races so a concurrent IBAN-save or balance change can never
// double-initiate. All eligibility (subscription, FAILED_PAYMENT, IBAN presence)
// is delegated to requestPayout() — we do not reimplement it.

async function runAutoPayouts(): Promise<void> {
  const now = new Date();
  logger.info(`[auto-payout] Starting run at ${now.toISOString()}`);

  // Candidate wallets: not locked, an IBAN on file, and a positive available
  // balance. The precise plan-specific threshold + subscription eligibility are
  // resolved per-wallet (and re-checked atomically inside requestPayout()).
  const candidates = await prisma.wallet.findMany({
    where: {
      isLocked: false,
      availableBalance: { gt: 0 },
      payoutIban: { not: null },
    },
    select: { id: true, userId: true, availableBalance: true },
  });

  if (candidates.length === 0) {
    logger.info('[auto-payout] No candidate wallets — done');
    return;
  }

  const { walletService } = await import('../services/wallet.service');

  let initiated = 0;
  let skipped = 0;
  for (const wallet of candidates) {
    try {
      // IBAN may be an empty/whitespace string even when non-null.
      // requestPayout() re-validates, but skip obvious non-candidates cheaply.

      // Resolve the eligible subscription + plan threshold the same way
      // requestPayout() does. ACTIVE / TRIALING, or CANCELLED-within-paid-period.
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: wallet.userId,
          OR: [
            { status: { in: ['ACTIVE', 'TRIALING'] } },
            { status: 'CANCELLED', currentPeriodEnd: { gt: now } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { plan: true },
      });
      if (!subscription) {
        skipped++;
        continue;
      }

      const threshold = await getPayoutThresholdBGN(subscription.plan);
      if (wallet.availableBalance < threshold) {
        skipped++;
        continue;
      }

      // Idempotency guard: skip if an in-flight payout already exists for this
      // wallet (requestPayout would throw otherwise — this avoids the noisy log).
      const inFlight = await prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          type: WalletTransactionType.WITHDRAWAL,
          status: { in: [WalletTransactionStatus.PENDING, WalletTransactionStatus.PROCESSING] },
        },
        select: { id: true },
      });
      if (inFlight) {
        skipped++;
        continue;
      }

      await walletService.requestPayout(wallet.userId);
      initiated++;
      logger.info(`[auto-payout] Initiated payout for user ${wallet.userId} (threshold ${threshold.toFixed(2)} BGN, balance ${wallet.availableBalance.toFixed(2)} BGN)`);
    } catch (err: any) {
      // Eligibility / race errors (already pending, below threshold after prune,
      // INACTIVE, FAILED_PAYMENT, missing IBAN) are expected and non-fatal — they
      // mean the wallet simply isn't payout-eligible this run.
      skipped++;
      logger.warn(`[auto-payout] Skipped user ${wallet.userId}: ${err?.message ?? err}`);
    }
  }

  logger.info(`[auto-payout] Done — initiated ${initiated} payout(s), skipped ${skipped}`);

  // ── No-IBAN hold + prompt (spec §6.5) ──────────────────────────────────────
  // The payout loop above pre-filters `payoutIban: { not: null }`, so a wallet
  // that is over its plan threshold WITHOUT an IBAN is excluded from the payout
  // candidate set and would otherwise never be paid AND never prompted. Spec
  // §6.5 requires holding the payout and prompting the user to add an IBAN.
  // The two credit-time threshold-crossing edges only fire on the single credit
  // that crosses the threshold — pre-existing over-threshold-no-IBAN wallets,
  // post-failure cases, and any dropped best-effort notify stay dark. This scan
  // closes that gap. It runs independently of the payout loop above: a failure
  // prompting one wallet must never abort the rest (per-wallet try/catch), and
  // it never initiates a payout (there is no IBAN to pay to). Idempotency is
  // enforced inside notifyPayoutHeldNoIban() via its own cooldown guard, so a
  // wallet that stays over-threshold without an IBAN is not re-prompted nightly.
  const noIbanCandidates = await prisma.wallet.findMany({
    where: {
      isLocked: false,
      availableBalance: { gt: 0 },
      OR: [
        { payoutIban: null },
        { payoutIban: '' },
      ],
    },
    select: { id: true, userId: true, availableBalance: true, payoutIban: true },
  });

  let prompted = 0;
  let promptSkipped = 0;
  for (const wallet of noIbanCandidates) {
    try {
      // Defensive: skip any wallet that actually has a usable IBAN (whitespace-
      // only strings slip past the `''` filter above). Mirrors the hasIban check
      // used in the credit path and trial-pending release path.
      const hasIban = !!wallet.payoutIban && wallet.payoutIban.trim().length > 0;
      if (hasIban) {
        promptSkipped++;
        continue;
      }

      // Resolve eligibility + plan threshold through the shared helper — the same
      // canonical rule requestPayout()/getBalance()/the payout loop use: ACTIVE /
      // TRIALING or CANCELLED-within-paid-period, AND the latest-sub FAILED_PAYMENT
      // hard-block. Without the FAILED_PAYMENT exclusion a user whose NEWEST sub is
      // FAILED_PAYMENT but who still has an older in-period row would be prompted to
      // add an IBAN — yet requestPayout() would then refuse (403), so the prompt
      // leads nowhere. Gating on `eligible` keeps the prompt and the payout aligned.
      const { eligible, threshold } = await resolvePayoutEligibility(wallet.userId, now);
      if (!eligible) {
        promptSkipped++;
        continue;
      }
      if (wallet.availableBalance < threshold) {
        promptSkipped++;
        continue;
      }

      // notifyPayoutHeldNoIban() owns the dedup/cooldown — if a recent no-IBAN
      // prompt already exists for this user it returns without writing a row, so
      // the wallet is not spammed every nightly run.
      await notificationService.notifyPayoutHeldNoIban({
        userId: wallet.userId,
        availableBalance: wallet.availableBalance,
        threshold,
      });
      prompted++;
    } catch (err: any) {
      promptSkipped++;
      logger.warn(`[auto-payout] No-IBAN prompt skipped for user ${wallet.userId}: ${err?.message ?? err}`);
    }
  }

  logger.info(`[auto-payout] No-IBAN holds — prompted ${prompted}, skipped ${promptSkipped}`);
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

// Exported so the admin "Инициализирай списъци" endpoint can run it on demand
// instead of waiting up to 24 h for the 2:30 AM cron — otherwise newly-created
// segments display 0 members until the next nightly run (BUG 4).
export async function syncMarketingListSizes(): Promise<void> {
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
          subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, plan: { in: ['PREMIUM_MONTHLY', 'PREMIUM_WEEKLY'] as any } } },
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
  detach(notificationService
    .notifyAdminSchedulerFailure({ jobName, errorMessage: message }), (notifyErr) => logger.error(`[${jobName}] Failed to post scheduler-failure alert:`, notifyErr));
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
      // Warn for CLEARED entries and legacy entries with null cashbackStatus.
      // PAID entries keep status=COMPLETED but must not trigger spurious warnings
      // (they no longer carry a spendable balance). LOCKED entries are committed
      // to an in-flight payout and will not expire, so no warning is needed.
      // null rows are legacy pre-lifecycle-column entries; expireWallet's OR
      // clause now includes them in the sweep. Warn here so users aren't
      // expired without notice.
      OR: [
        { cashbackStatus: CashbackEntryStatus.CLEARED },
        { cashbackStatus: null },
      ],
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

      // F-019: Direct notification via notificationService — mandatory per spec.
      // The spec requires cashback expiry warnings to reach the user regardless of
      // automation config. This direct call ensures delivery even when the automation
      // system is unconfigured or inactive. The automation call below is belt-and-suspenders.
      const expiringTx = await prisma.walletTransaction.findFirst({
        where: {
          walletId,
          cashbackStatus: { in: ['CLEARED', null] } as any,
          cashbackExpiresAt: { gte: warnFrom, lte: warnUntil },
        },
        select: { cashbackExpiresAt: true },
        orderBy: { cashbackExpiresAt: 'asc' },
      });
      if (expiringTx?.cashbackExpiresAt) {
        detach(notificationService
          .notifyCashbackExpiringSoon(wallet.userId, expiringTx.cashbackExpiresAt), (err) => logger.error(`[cashback-expiring-warning] notifyCashbackExpiringSoon failed for user ${wallet.userId}:`, err));
      }

      // Keep automation dispatch as secondary channel (belt-and-suspenders).
      await fireAutomation('cashback.expiring', { userId: wallet.userId });
      fired++;
    } catch (err) {
      logger.error(`[cashback-expiring-warning] Failed for walletId ${walletId}:`, err);
    }
  }

  logger.info(`[cashback-expiring-warning] Done — fired automation for ${fired} user(s)`);
}

// ── Inactive-user 30-day nudge ─────────────────────────────────────────────────
// Fires the user.inactive_30d automation for users whose lastActivityAt crossed
// the 30-day mark within the last 24 hours (narrow window to prevent re-firing
// every day). Runs at 4:30 AM daily so it fires after the risk-sweep that may
// update lastActivityAt.

async function notifyInactiveUsers(): Promise<void> {
  const now = new Date();
  const inactiveFrom = new Date(now.getTime() - 31 * MS_PER_DAY);
  const inactiveUntil = new Date(now.getTime() - 30 * MS_PER_DAY);

  logger.info(`[inactive-user-nudge] Checking for users inactive between ${inactiveFrom.toISOString()} and ${inactiveUntil.toISOString()}`);

  const users = await prisma.user.findMany({
    where: {
      role: 'USER',
      status: 'ACTIVE',
      lastActivityAt: { gte: inactiveFrom, lte: inactiveUntil },
    },
    select: { id: true },
  });

  if (users.length === 0) {
    logger.info('[inactive-user-nudge] No newly-inactive users found');
    return;
  }

  logger.info(`[inactive-user-nudge] ${users.length} user(s) crossed 30-day inactivity mark`);

  let fired = 0;
  for (const { id } of users) {
    try {
      await fireAutomation('user.inactive_30d', { userId: id });
      fired++;
    } catch (err) {
      logger.error(`[inactive-user-nudge] Failed for user ${id}:`, err);
    }
  }

  logger.info(`[inactive-user-nudge] Done — fired automation for ${fired} user(s)`);
}

// ── Activation link expiry reminder (§8.3) ────────────────────────────────────
// Daily scan: find unconsumed, non-invalidated activation links that will expire
// within the next 24 hours. For each, email the partner and post an admin alert.
// Spec: "Изтичащ activation link | 24ч преди изтичане | Email към партньора + админ alert"

async function remindExpiringActivationLinks(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  logger.info(`[activation-link-expiry-reminder] Checking for links expiring before ${in24h.toISOString()}`);

  const links = await prisma.activationLink.findMany({
    where: {
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: { gte: now, lte: in24h },
    },
    include: {
      partner: {
        include: { user: { select: { email: true, firstName: true } } },
      },
    },
  });

  if (links.length === 0) {
    logger.info('[activation-link-expiry-reminder] No expiring links found');
    return;
  }

  logger.info(`[activation-link-expiry-reminder] ${links.length} link(s) expiring within 24h`);

  const dashboardBase = process.env.PARTNER_DASHBOARD_URL || 'https://boomcard.bg';
  let reminded = 0;

  for (const link of links) {
    const email = link.partner.user?.email;
    const firstName = link.partner.user?.firstName || link.partner.businessName;
    const activationUrl = `${dashboardBase}/partner/activate?token=${link.token}`;
    const expiresAtStr = link.expiresAt.toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });

    try {
      if (email) {
        await emailService.sendEmail({
          to: email,
          subject: 'Вашият активационен линк изтича скоро — BoomCard',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff;">
              <h2 style="color:#1a1a1a;margin-bottom:8px;">Активационен линк изтича</h2>
              <p style="color:#555;margin-bottom:16px;">Здравейте, ${firstName}!</p>
              <p style="color:#555;margin-bottom:16px;">Вашият активационен линк за партньорски акаунт <strong>${link.partner.businessName}</strong> ще изтече на <strong>${expiresAtStr}</strong>.</p>
              <p style="margin-bottom:24px;">
                <a href="${activationUrl}" style="display:inline-block;background:#0052cc;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Активирай акаунта</a>
              </p>
              <p style="color:#999;font-size:13px;">Ако вече сте активирали акаунта си, игнорирайте този имейл. Ако имате нужда от нов линк, свържете се с нас на office@boomcard.bg.</p>
            </div>`,
        });
      }

      await notificationService.notifyAdminOps({
        opsType: `activation-link-expiring-${link.id}`,
        title: 'Activation link expiring soon',
        message: `Partner "${link.partner.businessName}" has an unused activation link expiring at ${expiresAtStr}.`,
        severity: 'warning',
        actionUrl: `/admin/partners?id=${link.partnerId}`,
        relatedEntityType: 'Partner',
        relatedEntityId: link.partnerId,
        cooldownHours: 20,
      });

      reminded++;
    } catch (err) {
      logger.error(`[activation-link-expiry-reminder] Failed for link ${link.id} / partner ${link.partnerId}:`, err);
    }
  }

  logger.info(`[activation-link-expiry-reminder] Done — reminded ${reminded}/${links.length} partner(s)`);
}

// ── Partner SLA overdue escalation (Spec §5.1) ───────────────────────────────
// Hourly scan: find partner applications stuck in a non-terminal request status
// for more than 24 h. Posts an admin-ops alert per overdue partner (with a 20 h
// cooldown so we don't spam on every tick). U2: also fires an "approaching"
// warning once an unassigned application crosses the 18h (75% of 24h) mark.

// U2 — warning threshold for the "deadline approaching" alert: 18h = 75% of the
// 24h internal assignment SLA (matches computePartnerSla's 'warning' boundary).
// Shared constant imported from partnerSla.helper so both sources stay in sync.

async function escalateOverduePartnerSla(): Promise<void> {
  // Spec §1.6 (L201): the 24h internal SLA is an ASSIGNMENT deadline — "24 hours
  // from creation for admin assignment; an alert is triggered if the deadline is
  // approaching." L6 fix: the alert must fire on applications that are still
  // UNASSIGNED past 24h (assignedAdminId is null), not merely "still open in a
  // non-terminal status". An application that has been claimed by an admin
  // (assignedAdminId set) has met the assignment SLA even if it is still mid-pipeline.
  //
  // SLA clock starts at application submission (createdAt), not at partner
  // activation (joinedAt). We still exclude terminal request statuses (a rejected
  // application that was never assigned should not alert forever). We compare via the
  // Prisma enum constants (PartnerRequestStatus.APPROVED / .REJECTED): the generated
  // client exposes the TypeScript enum keys (APPROVED/REJECTED), while the Bulgarian
  // values (ODOBRENA/OTKAZANA) are only the @map'd DB storage strings.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const overduePartners = await prisma.partner.findMany({
    where: {
      createdAt: { lte: cutoff },
      // L6 — fire only on UNASSIGNED applications (assignment SLA breach).
      assignedAdminId: null,
      requestStatus: {
        notIn: [PartnerRequestStatus.APPROVED, PartnerRequestStatus.REJECTED],
        not: null,
      },
    },
    select: { id: true, businessName: true, createdAt: true, requestStatus: true },
  });

  // Each overdue partner still gets its own in-app bell row (and its own 20h
  // per-partner cooldown, so a persistently-overdue application doesn't
  // re-alert every hourly tick) — but the emails are batched into ONE digest
  // below instead of one email per partner. Without this, N overdue partners
  // in the same run produced N separate "[BoomCard admin] Partner SLA Overdue"
  // emails; admins only need one message listing all of them.
  const overdueDigestFields: Array<{ label: string; value: string }> = [];
  for (const partner of overduePartners) {
    const hoursElapsed = Math.round((Date.now() - partner.createdAt.getTime()) / 36e5 * 10) / 10;
    try {
      const fired = await notificationService.notifyAdminOps({
        opsType: `partner-sla-overdue-${partner.id}`,
        title: 'Partner SLA Overdue',
        message: `Application "${partner.businessName}" (status: ${partner.requestStatus}) has been UNASSIGNED for ${hoursElapsed}h — past the 24h internal assignment SLA (§1.6).`,
        severity: 'critical',
        actionUrl: `/admin/partners?id=${partner.id}`,
        relatedEntityType: 'Partner',
        relatedEntityId: partner.id,
        cooldownHours: 20,
        sendEmail: false,
      });
      if (fired) {
        overdueDigestFields.push({
          label: partner.businessName,
          value: `${hoursElapsed}h unassigned (status: ${partner.requestStatus})`,
        });
      }
    } catch (err) {
      logger.error(`[partner-sla-escalation] Failed to alert for partner ${partner.id}:`, err);
    }
  }

  if (overdueDigestFields.length > 0) {
    try {
      await notificationService.sendAdminOpsDigestEmail({
        title: 'Partner SLA Overdue',
        message: `${overdueDigestFields.length} partner application(s) have been UNASSIGNED past the 24h internal assignment SLA (§1.6).`,
        fields: overdueDigestFields,
        actionUrl: '/admin/partners?filter=unassigned',
      });
    } catch (err) {
      logger.error('[partner-sla-escalation] Failed to send overdue-SLA digest email:', err);
    }
  }

  // U2 (Spec §1.6 / §3.5) — "an alert is triggered if the deadline is APPROACHING."
  // The overdue scan above fires only AFTER the 24h deadline has passed. The spec
  // requires a separate proactive alert as the deadline nears. We fire a warning
  // for unassigned applications between the 75% mark (18h) and the deadline (24h) —
  // the same threshold the computePartnerSla helper uses for its 'warning' state —
  // so an admin can claim the application before the SLA is breached. A 6h cooldown
  // keeps this to roughly one nudge inside the warning window (hourly tick).
  const warnFrom = new Date(Date.now() - 24 * 60 * 60 * 1000);          // 24h ago (deadline)
  const warnUntil = new Date(Date.now() - SLA_WARN_HOURS * 60 * 60 * 1000); // 18h ago
  const approachingPartners = await prisma.partner.findMany({
    where: {
      // Older than 18h but not yet past 24h (the overdue scan owns >24h).
      createdAt: { gt: warnFrom, lte: warnUntil },
      assignedAdminId: null,
      requestStatus: {
        notIn: [PartnerRequestStatus.APPROVED, PartnerRequestStatus.REJECTED],
        not: null,
      },
    },
    select: { id: true, businessName: true, createdAt: true, requestStatus: true },
  });

  for (const partner of approachingPartners) {
    const hoursElapsed = Math.round((Date.now() - partner.createdAt.getTime()) / 36e5 * 10) / 10;
    const hoursRemaining = Math.max(0, Math.round((24 - hoursElapsed) * 10) / 10);
    try {
      await notificationService.notifyAdminOps({
        opsType: `partner-sla-approaching-${partner.id}`,
        title: 'Partner SLA Approaching',
        message: `Application "${partner.businessName}" (status: ${partner.requestStatus}) is still UNASSIGNED — the 24h internal assignment SLA is approaching (~${hoursRemaining}h remaining, §1.6). Claim it to avoid a breach.`,
        severity: 'warning',
        actionUrl: `/admin/partners?id=${partner.id}`,
        relatedEntityType: 'Partner',
        relatedEntityId: partner.id,
        cooldownHours: 6,
      });
    } catch (err) {
      logger.error(`[partner-sla-escalation] Failed to send approaching-SLA alert for partner ${partner.id}:`, err);
    }
  }

  if (overduePartners.length === 0 && approachingPartners.length === 0) {
    logger.info('[partner-sla-escalation] No unassigned partner applications approaching or past SLA');
    return;
  }
  logger.info(
    `[partner-sla-escalation] Alerted on ${overduePartners.length} overdue + ` +
    `${approachingPartners.length} approaching application(s)`
  );
}

// ── Low/Medium-risk auto-approve sweep (Spec §2.2 / §3.4 / §8.1) ─────────────
// Auto-approval is performed synchronously at scan time (sticker.service.uploadReceipt):
// Low (0–20) and Medium (21–50) risk scans are immediately promoted PENDING→Cleared
// (Medium auto-approves per spec §2.2/§3.4 amendment 2026-06-24). If that inline promote
// throws, the scan is left stranded in MANUAL_REVIEW with a PENDING cashback row and
// nothing ever retries it. §3.4/§8.1 require Low/Medium Pending records to clear
// within the 24h auto-approval window.
//
// This hourly sweep finds scans still in MANUAL_REVIEW whose stored specRiskLevel is
// Low or Medium and re-attempts the auto-approval by calling the SAME service method
// the inline path uses (stickerService.approveScan with adminUserId=null). No
// credit/wallet logic is duplicated here. High-risk scans are intentionally skipped —
// they require a human decision and must stay in the queue.
const AUTO_APPROVE_SWEEP_BATCH = 50;

async function sweepAutoApprovePendingScans(): Promise<void> {
  // Only sweep scans that have aged at least a few minutes, so we never race the
  // inline auto-approve still in flight for a just-uploaded receipt. The 24h window
  // in §3.4/§8.1 is the deadline, not a delay — retrying earlier is fine and desirable
  // for stranded rows, but a small floor avoids double-processing fresh uploads.
  const minAge = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes

  const strandedScans = await prisma.stickerScan.findMany({
    where: {
      status: ScanStatus.MANUAL_REVIEW,
      specRiskLevel: { in: ['Low', 'Medium'] },
      updatedAt: { lte: minAge },
      cashbackAmount: { gt: 0 },
    },
    select: { id: true, specRiskLevel: true, createdAt: true },
    take: AUTO_APPROVE_SWEEP_BATCH,
    orderBy: { createdAt: 'asc' },
  });

  if (strandedScans.length === 0) {
    logger.info('[auto-approve-sweep] No stranded Low/Medium-risk scans to auto-approve');
    return;
  }

  logger.info(`[auto-approve-sweep] Re-attempting auto-approval for ${strandedScans.length} stranded Low/Medium-risk scan(s)`);

  let approved = 0;
  for (const scan of strandedScans) {
    try {
      // Reuse the canonical promote path (credit + wallet + audit + notifications).
      await stickerService.approveScan(scan.id, { adminUserId: null });
      approved += 1;
    } catch (err) {
      // Leave it in MANUAL_REVIEW for the next sweep / admin action.
      logger.error(`[auto-approve-sweep] auto-approve still failing for scan ${scan.id} (risk ${scan.specRiskLevel}):`, err);
    }
  }

  logger.info(`[auto-approve-sweep] Auto-approved ${approved}/${strandedScans.length} stranded scan(s)`);
}

// ── Ticket auto-close (Spec §11.4) ────────────────────────────────────────────
// "Затворена: Заявителят е потвърдил или 7 дни без отговор след 'Решена'."
// Runs at 11 PM nightly: auto-close RESOLVED tickets with no activity for 7+ days.

export async function autoCloseResolvedTickets(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Use resolvedAt (set when status → RESOLVED) so the 7-day clock is anchored
  // to when resolution happened, not to any subsequent field edit (updatedAt).
  // Fall back to updatedAt for rows that existed before resolvedAt was added.
  const ELIGIBLE_WHERE = {
    status: 'RESOLVED' as const,
    OR: [
      { resolvedAt: { lte: cutoff } },
      { resolvedAt: null, updatedAt: { lte: cutoff } },
    ],
  };

  // Paginated loop: process up to BATCH_SIZE tickets per iteration so the job
  // always drains the full backlog regardless of size. MAX_ITERATIONS caps the
  // run to prevent infinite loops caused by a hypothetical DB fault.
  const BATCH_SIZE = 200;
  const MAX_ITERATIONS = 50; // 50 × 200 = 10 000 tickets per nightly run
  let totalClosed = 0;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const tickets = await prisma.helpTicket.findMany({
      where: ELIGIBLE_WHERE,
      select: {
        id: true,
        subject: true,
        userId: true,
        rootMessageId: true,
        user: { select: { email: true, firstName: true, role: true } },
      },
      take: BATCH_SIZE,
    });

    if (!tickets.length) break;

    // TOCTOU guard: add status:'RESOLVED' to the updateMany filter so a ticket
    // that was concurrently reopened (RESOLVED → OPEN via inbound email or web
    // reply) between the findMany and this updateMany is not incorrectly closed.
    // Preserving resolvedAt is intentional — CLOSED is terminal and the field
    // serves as the audit record of when the ticket was originally resolved.
    const { count: batchClosed } = await prisma.helpTicket.updateMany({
      where: {
        id: { in: tickets.map((t) => t.id) },
        status: 'RESOLVED', // re-check status to guard against concurrent reopens
      },
      data: { status: 'CLOSED' },
    });

    totalClosed += batchClosed;

    // Determine which tickets were actually closed in this batch. Tickets that
    // were concurrently reopened (RESOLVED → OPEN between findMany and updateMany)
    // are excluded — we must not audit or email them as "closed".
    const actuallyClosedIds = new Set(
      (
        await prisma.helpTicket.findMany({
          where: { id: { in: tickets.map((t) => t.id) }, status: 'CLOSED' },
          select: { id: true },
        })
      ).map((r) => r.id)
    );
    const closedTickets = tickets.filter((t) => actuallyClosedIds.has(t.id));

    // Audit one row per actually-closed ticket only.
    for (const t of closedTickets) {
      detach(writeAudit({
        actorUserId: null,
        action: 'ticket.auto_close',
        objectType: 'ticket',
        objectId: t.id,
        before: { status: 'RESOLVED' },
        after: { status: 'CLOSED', reason: 'auto-close: 7 days without reply after RESOLVED' },
      }), () => {});
    }

    // Notify each creator — all notifications in the batch start concurrently and
    // are awaited together so callers (and tests) see a consistent view after return.
    // Build the full RFC 5322 reference chain (rootMessageId + all reply messageIds)
    // so the closure email threads under the last message in the conversation.
    // Include a plus-addressed replyTo so the user's reply routes back via
    // Priority 3 (plus-address) even if X-BoomCard-Ticket-ID is stripped.
    const notifyPromises: Promise<void>[] = [];
    for (const t of closedTickets) {
      if (t.user.email) {
        notifyPromises.push(
          (async () => {
            try {
              const priorMsgs = await prisma.ticketReply.findMany({
                where: { ticketId: t.id, messageId: { not: null } },
                orderBy: { createdAt: 'asc' },
                select: { messageId: true },
              });
              const refChain: string[] = [
                t.rootMessageId,
                ...priorMsgs.map((r) => r.messageId as string),
              ].filter((id): id is string => !!id);

              const audience = t.user.role === 'PARTNER' ? 'partner' : 'subscriber';
              await emailService.sendEmail({
                to: t.user.email,
                audience: audience === 'partner' ? 'partner' : undefined,
                subject: buildTicketSubject(t.id, `[Заявката затворена] ${t.subject}`),
                headers: buildTicketHeaders({
                  ticketId: t.id,
                  inReplyTo: refChain.at(-1) ?? null,
                  references: refChain,
                }).headers,
                replyTo: buildPlusReplyTo(t.id, audience),
                html: `<p>Здравей, ${t.user.firstName || t.user.email},</p><p>Вашата заявка беше затворена автоматично, тъй като 7 дни са изминали след маркирането й като решена без допълнителна комуникация.</p><p style="color:#999;font-size:12px;">Ticket ID: ${t.id}</p>`,
                text: `Здравей, ${t.user.firstName || t.user.email},\n\nВашата заявка беше затворена автоматично след 7 дни без активност след маркиране като решена.\n\nTicket ID: ${t.id}`,
              });
            } catch (err) {
              logger.error(`[ticket-auto-close] failed to send closure notification for ticket ${t.id}:`, err);
            }
          })()
        );
      }
    }
    await Promise.allSettled(notifyPromises);

    if (tickets.length < BATCH_SIZE) break; // last batch — no more eligible tickets
  }

  if (iterations >= MAX_ITERATIONS) {
    logger.warn(
      `[ticket-auto-close] reached iteration cap (${MAX_ITERATIONS} × ${BATCH_SIZE}); ` +
      `remaining RESOLVED tickets older than 7 days will be processed in the next nightly run`
    );
  }

  if (totalClosed > 0) {
    logger.info(`[ticket-auto-close] closed ${totalClosed} RESOLVED tickets older than 7 days in ${iterations} batch(es)`);
  }
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

  // 2:05 AM every day — stale-pending-cashback-expiry job slot.
  // Spec §8.2 / §1.3: Pending cashback NEVER expires — only Cleared cashback has
  // a 60-day countdown (from clearedAt). expireStalePendingCashback() is a true no-op:
  // it returns { count: 0 } and does not throw. This cron produces no failure alerts
  // (it runs cleanly every day, zero entries modified). The cron registration is kept
  // in case the spec position changes. No Pending entries are modified by this run.
  cron.schedule('5 2 * * *', () => {
    expireStalePendingCashback(null).catch((err) => alertSchedulerFailure('stale-pending-cashback-expiry', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: stale-pending-cashback-expiry (5 2 * * *)');

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

  // H3 / Spec §8.1 rule 5 — 4:00 AM every day: reconcile QR codes against partner
  // operational status. Catches stale-ACTIVE/PROCESSING/PENDING stickers left behind
  // when the per-transition QR sync failed soft, flipping them to INACTIVE so the
  // sticker.status column stays consistent with the partner state.
  cron.schedule('0 4 * * *', () => {
    reconcileQrCodes().catch((err) => alertSchedulerFailure('qr-reconcile', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: qr-reconcile (0 4 * * *)');

  // 4:30 AM every day — DEFECT 2 fix: reap expired PendingSuperAdminRequest rows.
  // Expired rows occupy the global email @unique slot and block re-submission.
  // This cleanup allows users to re-submit after a 72h expiry window.
  cron.schedule('30 4 * * *', () => {
    reapExpiredPendingSuperAdminRequests().catch((err) => alertSchedulerFailure('pending-super-admin-reaper', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: pending-super-admin-reaper (30 4 * * *)');

  // 6:00 AM UTC every day — Paysera auto-renewal: pause expired active subs,
  // send renewal reminder email, cancel subs past the 7-day grace period.
  cron.schedule('0 6 * * *', () => {
    processPayseraRenewals().catch((err) => alertSchedulerFailure('paysera-renewal', err));
  });

  logger.info('[scheduler] Registered: paysera-renewal (0 6 * * * UTC)');

  // 7 AM every day — auto-renew OFF reminder cadence (spec §8.3 v1.1).
  // Fires 3d / 1d / day-of reminders for subscriptions with autoRenewal=false
  // that are still ACTIVE or TRIALING. Bitmask on the subscription row gates
  // each reminder to once-per-period; renewal write paths reset it to 0.
  cron.schedule('0 7 * * *', () => {
    runRenewalReminders().catch((err) => alertSchedulerFailure('renewal-reminders', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: renewal-reminders (0 7 * * *)');

  // 5 AM every day — auto-reject menu submissions pending for more than 30 days
  cron.schedule('0 5 * * *', () => {
    expireStaleMenuSubmissions().catch((err) => alertSchedulerFailure('menu-expiry', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: menu-expiry (0 5 * * *)');

  // 8 AM every day — admin informational digest (spec §3.1: routes Informational tier to Daily digest)
  cron.schedule('0 8 * * *', () => {
    sendAdminInformationalDigest().catch((err) => alertSchedulerFailure('admin-informational-digest', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: admin-informational-digest (0 8 * * *)');

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

  // 6:00 AM every day — auto-initiate payouts for wallets that have crossed the
  // plan-specific payout threshold with an IBAN on file (spec §7.1). Runs after
  // cashback-expiry (2 AM) and trial-pending promotion (5:30 AM) so the cleared
  // balance is final for the day. Idempotent against in-flight payouts.
  cron.schedule('0 6 * * *', () => {
    runAutoPayouts().catch((err) => alertSchedulerFailure('auto-payout', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: auto-payout (0 6 * * *)');

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

  // 4:30 AM every day — fire user.inactive_30d automation for users who
  // crossed the 30-day inactivity threshold within the last 24 hours.
  cron.schedule('30 4 * * *', () => {
    notifyInactiveUsers().catch((err) => alertSchedulerFailure('inactive-user-nudge', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: inactive-user-nudge (30 4 * * *)');

  // 10:30 AM every day — remind partners with activation links expiring in next 24h
  // Spec §8.3: email to partner + admin alert, fires once per day at mid-morning
  cron.schedule('30 10 * * *', () => {
    remindExpiringActivationLinks().catch((err) => alertSchedulerFailure('activation-link-expiry-reminder', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: activation-link-expiry-reminder (30 10 * * *)');

  // Every hour — scan for partner applications past the 24h internal SLA.
  // Spec §5.1: posts an admin-ops alert per overdue application (20h cooldown).
  cron.schedule('0 * * * *', () => {
    escalateOverduePartnerSla().catch((err) => alertSchedulerFailure('partner-sla-escalation', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: partner-sla-escalation (0 * * * *)');

  // Every hour — re-attempt auto-approval for Low/Medium-risk scans stranded in
  // MANUAL_REVIEW (inline auto-approve failed). Spec §2.2/§3.4/§8.1: Low/Medium
  // Pending records must clear within the 24h auto-approval window.
  cron.schedule('0 * * * *', () => {
    sweepAutoApprovePendingScans().catch((err) => alertSchedulerFailure('auto-approve-sweep', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: auto-approve-sweep (0 * * * *)');

  // 11 PM every day — auto-close RESOLVED tickets with no activity for 7+ days.
  // Spec §11.4: "Затворена: Заявителят е потвърдил или 7 дни без отговор след 'Решена'."
  cron.schedule('0 23 * * *', () => {
    autoCloseResolvedTickets().catch((err) => alertSchedulerFailure('ticket-auto-close', err));
  }, { timezone: 'Europe/Sofia' });

  logger.info('[scheduler] Registered: ticket-auto-close (0 23 * * *)');
}
