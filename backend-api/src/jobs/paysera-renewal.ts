/**
 * Paysera Auto-Renewal Job
 *
 * Paysera Checkout does not support automated recurring charges (unlike Stripe),
 * so this job handles the renewal lifecycle manually:
 *   1. Pauses newly-expired ACTIVE subs and emails the user to renew manually.
 *   2. Cancels PAUSED subs that have been paused for 7+ days (grace period elapsed).
 *
 * Runs daily at 06:00 UTC via the scheduler (src/jobs/scheduler.ts).
 * Can also be run as a one-off script: npx tsx src/jobs/paysera-renewal.ts
 *
 * BC-MYPOS-002 note: this job never calls PayseraService / the gateway at
 * all — it is pure time-based Subscription-status bookkeeping (ACTIVE ->
 * FAILED_PAYMENT / PAUSED -> CANCELLED-or-EXPIRED) driven off
 * `currentPeriodEnd`, with no createCheckout/verifyAndParseWebhook/
 * createPayout call anywhere in this file. There is therefore nothing here
 * to route through the new `PaymentProvider` abstraction
 * (`../services/payment-provider.ts`); the job is provider-agnostic already,
 * which is why it's unchanged by this refactor.
 */

import { SubscriptionStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { writeAudit } from '../middleware/audit.middleware';
import { notificationService } from '../services/notification.service';
import { detach } from '../utils/detach';

const APP_URL = process.env.APP_URL || 'https://mobile.boomcard.bg';

export async function processPayseraRenewals(): Promise<void> {
  const now = new Date();
  logger.info(`[paysera-renewal] Starting run at ${now.toISOString()}`);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Cancel subscriptions that have been PAUSED for 7+ days (grace period elapsed).
  // Prefer pauseEndsAt (set by this job since the field was added) so the
  // 7-day window is measured from the actual pause instant rather than from
  // currentPeriodEnd (which drifts when this job runs late). For legacy rows
  // that pre-date pauseEndsAt, fall back to the old currentPeriodEnd logic.
  // Clean up PAUSED rows past the grace period regardless of whether the
  // user cancelled in the meantime — we still need to flip status to
  // CANCELLED so the row doesn't sit in PAUSED forever (this happens for
  // legacy rows from before cancelSubscription started forcing immediate
  // cancellation on PAUSED subs). The email side enforces spec §3.2: if the
  // user had already cancelled (`canceledAt` set), skip the expiry email so
  // we don't notify them about a sub they already chose to end.
  const expired = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.PAUSED,
      stripeSubscriptionId: null,
      OR: [
        { pauseEndsAt: { lte: now } },
        { pauseEndsAt: null, currentPeriodEnd: { lte: sevenDaysAgo } },
      ],
    },
    include: {
      user: { select: { email: true, firstName: true, preferredLanguage: true } },
      planDetails: { select: { displayName: true, displayNameBg: true } },
    },
  });

  for (const sub of expired) {
    try {
      const alreadyCancelled = !!sub.canceledAt;
      // Spec §4.2: distinguish user-initiated cancellation (CANCELLED) from
      // natural billing-period lapse (EXPIRED). canceledAt is the discriminator
      // because cancelSubscription sets it but toggleAutoRenewal does not.
      const finalStatus = alreadyCancelled
        ? SubscriptionStatus.CANCELLED
        : SubscriptionStatus.EXPIRED;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: finalStatus,
          // Preserve the original cancellation timestamp if the user explicitly
          // cancelled before the grace period elapsed; otherwise leave null
          // (EXPIRED rows did not have an explicit cancellation event).
          canceledAt: sub.canceledAt,
        },
      });
      logger.info(
        `[paysera-renewal] Subscription ${sub.id} ${finalStatus.toLowerCase()} after 7-day grace period${alreadyCancelled ? ' (user had already cancelled, no email)' : ''}`
      );

      // Audit M2 / spec §11.1+§11.2: "Subscription cancellation confirmed" is a
      // mandatory Payment notification on every cancellation channel. In this job
      // a row reaches finalStatus=CANCELLED only when the user had already
      // cancelled via subscriptionService.cancelSubscription (alreadyCancelled =
      // canceledAt is set), which ALREADY fired notifySubscriptionCancelledInApp at
      // cancel time. Firing again here would double-notify for a single
      // cancellation, so we intentionally do NOT re-emit it.
      //
      // The EXPIRED branch (natural billing-period lapse, canceledAt null) is NOT a
      // "cancellation confirmed" event and correctly gets no cancellation
      // notification here. A separate Failed Payment notification (§3.4) is emitted
      // by step 1b for the FAILED_PAYMENT path.

      // Sync the BoomCard loyalty card type to match the user's remaining active
      // BoomCard subscription, or downgrade to PREMIUM_WEEKLY if none exists. Mirrors the
      // same pattern in subscription-expiry (scheduler.ts), which handles the
      // cancelAtPeriodEnd path; this covers the autoRenewal-failure path.
      const otherActiveSub = await prisma.subscription.findFirst({
        where: {
          userId: sub.userId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          id: { not: sub.id },
        },
        orderBy: { createdAt: 'desc' },
      });
      const targetPlan = otherActiveSub?.plan ?? 'PREMIUM_WEEKLY';
      const { cardService } = await import('../services/card.service');
      await cardService.syncCardTypeWithSubscription(sub.userId, targetPlan);

      // Spec §3.2: skip the expiry email when the user had already cancelled
      // — they got their cancellation confirmation at cancel time.
      if (sub.user?.email && !alreadyCancelled) {
        const lang = (sub.user.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
        const planName = lang === 'bg'
          ? (sub.planDetails?.displayNameBg || sub.plan)
          : (sub.planDetails?.displayName || sub.plan);
        await emailService
          .sendSubscriptionExpiredEmail(
            sub.user.email,
            { customerName: sub.user.firstName || 'Customer', planName, renewUrl: `${APP_URL}/subscription` },
            lang,
          )
          .catch((err) => logger.error(`[paysera-renewal] Cancellation email failed for sub ${sub.id}:`, err));
      }
    } catch (err) {
      logger.error(`[paysera-renewal] Failed to cancel subscription ${sub.id}:`, err);
    }
  }

  // 1b. Spec §4.2 v1.1 — Paysera subscriptions with autoRenewal=true that expire
  //     get a SINGLE renewal attempt with NO grace period. Because Paysera Checkout
  //     does not actually charge automatically, the "attempt" here is the natural
  //     check at expiry: if the period is over and no manual renewal arrived, the
  //     renewal has failed and we flip straight to FAILED_PAYMENT. This bypasses
  //     the 7-day PAUSED grace (which still applies to autoRenewal=false subs
  //     handled in step 2 below).
  //
  //     While in FAILED_PAYMENT: scanning is blocked (sticker/receipt services),
  //     payouts are gated (wallet.service), and the mobile app surfaces a renewal
  //     CTA via the SUBSCRIPTION_FAILED_PAYMENT marker.
  const failedRenewals = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: null,
      autoRenewal: true,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      currentPeriodEnd: { lte: now },
    },
    include: {
      user: { select: { id: true, email: true, firstName: true, preferredLanguage: true } },
      planDetails: { select: { displayName: true, displayNameBg: true, priceWeeklyEur: true, priceMonthlyEur: true, priceYearlyEur: true } },
    },
  });

  for (const sub of failedRenewals) {
    try {
      // Spec §3.4: ONE renewal attempt, no retry period. The selection above
      // already restricts to status=ACTIVE, so a sub that has already failed its
      // single renewal (now FAILED_PAYMENT) is never re-processed. This explicit
      // guard documents and hardens that invariant against future query changes —
      // only an ACTIVE sub on its first (and only) renewal attempt may transition.
      if (sub.status !== SubscriptionStatus.ACTIVE) {
        logger.info(`[paysera-renewal] Subscription ${sub.id} not ACTIVE (${sub.status}) — skipping repeat renewal failure (spec §3.4 no-retry)`);
        continue;
      }

      const prevStatus = sub.status;
      const failedAt = new Date();

      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.FAILED_PAYMENT,
          failedPaymentAt: failedAt,
          // Paysera has no retry loop — retryAttempt is a Stripe-managed counter
          // and must be 0 for Paysera subs. Resetting here makes the invariant
          // explicit even if the field was somehow incremented by direct DB access.
          retryAttempt: 0,
        },
      });

      // Audit the transition (best-effort — must not block the renewal flow).
      detach(writeAudit({
        actorUserId: null,
        action: 'SUBSCRIPTION_FAILED_PAYMENT',
        objectType: 'Subscription',
        objectId: sub.id,
        before: { status: prevStatus },
        after: { status: 'FAILED_PAYMENT', failedPaymentAt: failedAt.toISOString() },
      }), (err) => logger.error(`[paysera-renewal] audit write failed for sub ${sub.id}:`, err));

      // Notify the user that the auto-renewal attempt failed. Spec §4.2 v1.1: the
      // mobile app shows a renewal CTA on receiving SUBSCRIPTION_FAILED_PAYMENT.
      let subMetadata: Record<string, any> = {};
      try { if (sub.metadata) subMetadata = JSON.parse(sub.metadata); } catch { subMetadata = {}; }
      const billingPeriod = (subMetadata.billingPeriod ?? '').toLowerCase();
      const priceInCents = (() => {
        const plan = sub.planDetails;
        if (!plan) return 0;
        if (billingPeriod.includes('week') && plan.priceWeeklyEur) return plan.priceWeeklyEur;
        if (billingPeriod.includes('year')) return plan.priceYearlyEur;
        return plan.priceMonthlyEur ?? 0;
      })();

      detach(notificationService
        .notifyPaymentFailed({
          userId: sub.userId,
          paymentIntentId: sub.id, // no PI for Paysera renewal — surface sub id for reference
          amount: priceInCents / 100,
          currency: 'EUR',
        }), (err) => logger.error(`[paysera-renewal] FAILED_PAYMENT notify failed for sub ${sub.id}:`, err));

      logger.info(`[paysera-renewal] Subscription ${sub.id} → FAILED_PAYMENT (spec §4.2 v1.1, no grace)`);
    } catch (err) {
      logger.error(`[paysera-renewal] Failed to transition sub ${sub.id} to FAILED_PAYMENT:`, err);
    }
  }

  // 2. Find subscriptions that expired and are still ACTIVE — begin 7-day grace period.
  //
  // Spec §4.2: any Paysera sub past currentPeriodEnd needs a terminal-state
  // transition. Previously we filtered on autoRenewal=true, which left
  // autoRenewal=false subs ACTIVE forever past their period (now reachable
  // since the admin /auto-renewal toggle decoupled autoRenewal from
  // cancelAtPeriodEnd). The filter now includes them; the canceledAt-null
  // discriminator at step 1 still distinguishes EXPIRED (natural lapse) from
  // CANCELLED (user-initiated) when the grace period elapses.
  const expiredActive = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: null,
      // cancelAtPeriodEnd=true rows are handled by scheduler.expireCancelledSubscriptions
      // (which goes straight to CANCELLED, no grace). canceledAt=null filters
      // those out too — both filters belt-and-braces.
      cancelAtPeriodEnd: false,
      canceledAt: null,
      // autoRenewal=true subs were already moved to FAILED_PAYMENT in step 1b
      // (spec §4.2 v1.1: no grace). Only autoRenewal=false subs receive the
      // legacy 7-day PAUSED grace here.
      autoRenewal: false,
      currentPeriodEnd: { lte: now },
    },
    include: {
      user: { select: { id: true, email: true, firstName: true, preferredLanguage: true } },
      planDetails: { select: { displayName: true, displayNameBg: true, priceWeeklyEur: true, priceMonthlyEur: true, priceYearlyEur: true } },
    },
  });

  for (const sub of expiredActive) {
    try {
      const pauseEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.PAUSED,
          pauseEndsAt,
          // Mirror the step-1 invariant: retryAttempt is Stripe-managed and must
          // be 0 for all Paysera subs regardless of which path transitions them.
          retryAttempt: 0,
        },
      });

      if (sub.user?.email) {
        const lang = (sub.user.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
        const planName = lang === 'bg'
          ? (sub.planDetails?.displayNameBg || sub.plan)
          : (sub.planDetails?.displayName || sub.plan);
        let subMetadata: Record<string, any> = {};
        try { if (sub.metadata) subMetadata = JSON.parse(sub.metadata); } catch { subMetadata = {}; }
        const billingPeriod = (subMetadata.billingPeriod ?? '').toLowerCase();
        const priceInCents = (() => {
          const plan = sub.planDetails;
          if (!plan) return 0;
          if (billingPeriod.includes('week') && plan.priceWeeklyEur) return plan.priceWeeklyEur;
          if (billingPeriod.includes('year')) return plan.priceYearlyEur;
          return plan.priceMonthlyEur ?? 0;
        })();

        await emailService
          .sendExpiryNotice(sub.user.email, {
            customerName: sub.user.firstName || 'Customer',
            planName,
            planNameBg: sub.planDetails?.displayNameBg || sub.plan,
            price: `€${(priceInCents / 100).toFixed(2)}`,
            renewalDate: sub.currentPeriodEnd.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB'),
            manageUrl: `${APP_URL}/subscription`,
            language: lang,
          })
          .catch((err) => logger.error(`[paysera-renewal] Email failed for sub ${sub.id}:`, err));
      }

      // §10 — in-app + push alongside the expiry-notice email.
      detach(notificationService
        .notifySubscriptionPaused({
          userId: sub.userId,
          pauseEndsAt,
        }), (err) =>
          logger.error(`[paysera-renewal] notifySubscriptionPaused failed for sub ${sub.id}:`, err));

      logger.info(`[paysera-renewal] Subscription ${sub.id} paused — renewal reminder sent`);
    } catch (err) {
      logger.error(`[paysera-renewal] Failed to process subscription ${sub.id}:`, err);
    }
  }

  // Pre-expiry reminders for autoRenewal=false subscriptions are handled exclusively
  // by the renewal-reminders job (src/jobs/renewal-reminders.ts), which runs at
  // 07:00 UTC and fires the spec §8.3 three-cadence (3d / 1d / dayOf) via the
  // renewalRemindersSent bitmask. Sending them here as well would duplicate emails.

  logger.info(`[paysera-renewal] Done — ${failedRenewals.length} → FAILED_PAYMENT (no grace), paused ${expiredActive.length} subscription(s), cancelled ${expired.length} after grace period`);
}

// Run directly as a script (npx tsx src/jobs/paysera-renewal.ts)
if (require.main === module) {
  processPayseraRenewals()
    .catch((err) => { logger.error('[paysera-renewal] Fatal error:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
