import { ScanStatus, SubscriptionPlan, SubscriptionStatus, WalletTransactionType } from '@prisma/client';
import prisma from '../lib/prisma';
import { stripeService } from './stripe.service';
import { logger } from '../utils/logger';
import { cardService } from './card.service';
import { walletService } from './wallet.service';
import { emailService } from './email.service';
import { writeAudit } from '../middleware/audit.middleware';
import { AppError } from '../middleware/error.middleware';
import { notificationService } from './notification.service';
import { safeParseJsonArray } from '../utils/json';

/**
 * Spec §4.2 v1.1 — when a user gains a new ACTIVE/TRIALING subscription, any
 * lingering FAILED_PAYMENT subs are no longer load-bearing for the gates and
 * must be transitioned to EXPIRED so the read-side guards stop firing on them.
 *
 * `excludeSubId` is the sub that just became ACTIVE (don't EXPIRE it if it
 * was previously FAILED_PAYMENT itself — that's the recovery case).
 * `actorUserId` is null when called from a webhook (system), set when an admin
 * forces the recovery.
 */
export async function clearFailedPaymentSubsForUser(
  userId: string,
  excludeSubId: string | null,
  actorUserId: string | null,
): Promise<number> {
  const failed = await prisma.subscription.findMany({
    where: {
      userId,
      status: SubscriptionStatus.FAILED_PAYMENT,
      ...(excludeSubId ? { id: { not: excludeSubId } } : {}),
    },
    select: { id: true },
  });
  if (failed.length === 0) return 0;

  const now = new Date();
  // Include status: FAILED_PAYMENT in the WHERE clause so that a concurrent
  // Stripe webhook retry that already cleared these rows gets count=0 and
  // skips the audit writes, preventing duplicate audit rows.
  const result = await prisma.subscription.updateMany({
    where: { id: { in: failed.map(f => f.id) }, status: SubscriptionStatus.FAILED_PAYMENT },
    data: { status: SubscriptionStatus.EXPIRED, failedPaymentClearedAt: now },
  });

  if (result.count === 0) {
    logger.info(`[clearFailedPaymentSubsForUser] user ${userId}: subs already cleared by concurrent request — skipping audits`);
    return 0;
  }

  for (const f of failed) {
    detach(writeAudit({
      actorUserId,
      action: 'SUBSCRIPTION_FAILED_PAYMENT_CLEARED',
      objectType: 'Subscription',
      objectId: f.id,
      before: { status: 'FAILED_PAYMENT' },
      after: { status: 'EXPIRED', failedPaymentClearedAt: now.toISOString() },
    }), (err) => logger.error(`[clearFailedPaymentSubsForUser] audit write failed for sub ${f.id}:`, err));
  }
  logger.info(`[clearFailedPaymentSubsForUser] user ${userId}: cleared ${result.count} FAILED_PAYMENT sub(s)`);
  return result.count;
}
import {
  EUR_TO_BGN_RATE,
  UPGRADE_CREDIT_WEEKLY_TO_MONTHLY,
  UPGRADE_CREDIT_BASIC_TO_PREMIUM,
} from '../constants/receipt.constants';
import { detach } from '../utils/detach';

// Stripe Price IDs (create these in Stripe Dashboard)
const PRICE_IDS = {
  // Env var kept as STRIPE_LIGHT_PRICE_ID for backward compat with existing deployments.
  PREMIUM_WEEKLY: process.env.STRIPE_PREMIUM_WEEKLY_PRICE_ID || process.env.STRIPE_LIGHT_PRICE_ID || 'price_PREMIUM_WEEKLY',
  BASIC: process.env.STRIPE_BASIC_PRICE_ID || 'price_BASIC',
  PREMIUM_MONTHLY: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_PREMIUM',
};

export class SubscriptionService {
  /**
   * Create subscription
   */
  async createSubscription(params: {
    userId: string;
    plan: SubscriptionPlan;
    paymentMethodId?: string;
  }) {
    const { userId, plan, paymentMethodId } = params;

    if (plan === 'PREMIUM_WEEKLY') {
      // PREMIUM_WEEKLY subscriptions must be purchased through Paysera.
      // The Paysera webhook (POST /api/payments/paysera/callback) creates the subscription
      // directly in the DB once payment is confirmed. Allowing free creation here would
      // bypass payment entirely.
      throw new AppError('PREMIUM_WEEKLY plan must be purchased via the Paysera payment flow', 400);
    }

    // Get user email for Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const customerName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : undefined;

    // Get or create Stripe customer
    const customerId = await stripeService.getOrCreateCustomer(userId, user.email, customerName);

    // Create Stripe subscription
    const stripeSubscription = await stripeService.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PRICE_IDS[plan] }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId,
        plan,
      },
      default_payment_method: paymentMethodId,
    });

    // Create subscription in database
    const isImmediatelyActive = stripeSubscription.status === 'active';
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        status: isImmediatelyActive ? 'ACTIVE' : 'INCOMPLETE',
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: PRICE_IDS[plan],
        stripeCustomerId: customerId,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start
          ? new Date(stripeSubscription.trial_start * 1000)
          : null,
        trialEnd: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
        // FR-007: 24-hour trial refund window. For immediately-active subscriptions
        // (saved payment method) the clock starts now. For INCOMPLETE subscriptions
        // the payment hasn't been confirmed yet — the webhook sets this field when
        // the subscription transitions INCOMPLETE → ACTIVE.
        trialRefundEligibleUntil: isImmediatelyActive
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : null,
        autoRenewal: true,
      },
    });

    // Ensure the user has a card; create a PREMIUM_WEEKLY card if not (will be upgraded below)
    await this.ensureCardExists(userId);

    // Sync card type immediately if Stripe activated the subscription right away
    // (e.g. when a saved payment method is used). For INCOMPLETE subscriptions,
    // the webhook handler (customer.subscription.updated) triggers the sync.
    if (isImmediatelyActive) {
      await cardService.syncCardTypeWithSubscription(userId, plan);
    }

    const invoice = stripeSubscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent;

    return {
      subscription,
      clientSecret: paymentIntent?.client_secret,
      status: stripeSubscription.status,
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd = true, suppressEmail = false) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: { select: { email: true, firstName: true, preferredLanguage: true } },
        planDetails: { select: { displayName: true, displayNameBg: true } },
      },
    });

    if (!subscription) {
      throw new AppError('Subscription not found', 404);
    }

    let updated: typeof subscription;

    if (!subscription.stripeSubscriptionId) {
      // Paysera-based subscription (PREMIUM_WEEKLY or legacy) — no external billing to cancel.
      // Mark it to expire at the end of the current period so the user keeps access
      // until then, mirroring Stripe's cancel_at_period_end behaviour.
      // PAUSED rows (or rows whose period has already ended) need immediate
      // cancellation: setting cancelAt to a past currentPeriodEnd would leave
      // the row stuck in PAUSED forever because the renewal cron now skips
      // canceled / autoRenewal=false rows.
      const periodAlreadyEnded = subscription.currentPeriodEnd <= new Date();
      const forceImmediate = subscription.status === 'PAUSED' || periodAlreadyEnded;

      if (cancelAtPeriodEnd && !forceImmediate) {
        updated = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            cancelAtPeriodEnd: true,
            cancelAt: subscription.currentPeriodEnd,
            canceledAt: new Date(),
            // Spec §3.2: after manual cancellation, all renewal/expiry/retry
            // emails must stop. The Paysera renewal cron filters on
            // autoRenewal=true, so flip this to false to exclude this row.
            autoRenewal: false,
          },
          include: {
            user: { select: { email: true, firstName: true, preferredLanguage: true } },
            planDetails: { select: { displayName: true, displayNameBg: true } },
          },
        });
      } else {
        // Immediate cancellation — end it now and downgrade the card
        await cardService.syncCardTypeWithSubscription(subscription.userId, 'PREMIUM_WEEKLY');
        updated = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'CANCELLED',
            cancelAtPeriodEnd: false,
            cancelAt: new Date(),
            canceledAt: new Date(),
            autoRenewal: false,
          },
          include: {
            user: { select: { email: true, firstName: true, preferredLanguage: true } },
            planDetails: { select: { displayName: true, displayNameBg: true } },
          },
        });
      }
    } else {
      // Stripe-based subscription — cancel through Stripe
      const stripeSubscription = await stripeService.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: cancelAtPeriodEnd }
      );

      updated = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          cancelAtPeriodEnd,
          cancelAt: stripeSubscription.cancel_at
            ? new Date(stripeSubscription.cancel_at * 1000)
            : null,
          canceledAt: new Date(),
          autoRenewal: false,
        },
        include: {
          user: { select: { email: true, firstName: true, preferredLanguage: true } },
          planDetails: { select: { displayName: true, displayNameBg: true } },
        },
      });
    }

    // Send cancellation confirmation email (non-fatal).
    // Suppressed when called internally (e.g. from requestTrialRefund which sends its own email).
    const userEmail = updated.user?.email;
    if (userEmail && !suppressEmail) {
      const lang = (updated.user?.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
      detach(emailService
        .sendSubscriptionCancelledEmail(userEmail, {
          customerName: updated.user?.firstName || 'Customer',
          planName: updated.planDetails?.displayName || updated.plan,
          planNameBg: updated.planDetails?.displayNameBg || updated.plan,
          accessUntil: updated.cancelAtPeriodEnd ? (updated.cancelAt ?? null) : null,
          manageUrl: `${process.env.APP_URL || 'https://mobile.boomcard.bg'}/subscription`,
          language: lang,
        }), (err) => logger.error(`[cancelSubscription] Failed to send cancellation email for sub ${subscriptionId}:`, err));
    }

    // F-018: Spec requires an in-app notification on user-initiated subscription cancellation
    // alongside the existing email (not instead of it). Non-fatal.
    if (!suppressEmail) {
      // Pass sendEmail=false: cancelSubscription already sends the richer templated
      // cancellation email above (sendSubscriptionCancelledEmail). The in-app record
      // is still created; only the notification's duplicate plain email is suppressed.
      detach(notificationService
        .notifySubscriptionCancelledInApp(updated.userId, false), (err) => logger.error(`[cancelSubscription] notifySubscriptionCancelledInApp failed for sub ${subscriptionId}:`, err));
    }

    return updated;
  }

  /**
   * Upgrade/Downgrade subscription.
   *
   * Upgrade credit rules (credited to wallet before plan change):
   *   PREMIUM_WEEKLY  → PREMIUM : 100% of remaining weekly value
   *   BASIC  → PREMIUM : 60%  of remaining monthly value
   *   All other transitions: no credit
   */
  async updateSubscriptionPlan(subscriptionId: string, newPlan: SubscriptionPlan) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { planDetails: { select: { priceWeeklyEur: true, priceMonthlyEur: true } } },
    });

    if (!subscription) {
      throw new AppError('Subscription not found', 404);
    }

    if (subscription.plan === newPlan) {
      throw new AppError(`Subscription is already on the ${newPlan} plan`, 400);
    }

    if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIALING') {
      throw new AppError('Plan upgrade is only available for active subscriptions', 422);
    }
    if (subscription.plan !== 'BASIC' && subscription.plan !== 'PREMIUM_WEEKLY') {
      throw new AppError('Plan upgrade is only available for Basic or Premium-Weekly subscribers', 422);
    }

    // Calculate and credit any applicable upgrade credit to the user's wallet
    await this.applyUpgradeCredit(subscription, newPlan);

    if (newPlan === 'PREMIUM_WEEKLY') {
      // Downgrade to light - cancel current subscription
      if (subscription.stripeSubscriptionId) {
        // suppressEmail=true: this is a plan downgrade, not a cancellation, so do
        // not fire the "subscription cancelled" email or in-app notification.
        await this.cancelSubscription(subscriptionId, false, /* suppressEmail */ true);
      }

      await cardService.syncCardTypeWithSubscription(subscription.userId, 'PREMIUM_WEEKLY');
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          plan: 'PREMIUM_WEEKLY',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          // New period → eligible for a fresh pre-expiry reminder.
          lastRenewalReminderSentAt: null,
          // Spec §8.3 v1.1 — clear auto-renew-OFF reminder bitmask on new period.
          renewalRemindersSent: 0,
        },
      });
    }

    if (!subscription.stripeSubscriptionId) {
      // Paysera-based subscription — update plan directly in DB
      // BASIC and PREMIUM are both monthly (30d). The PREMIUM_WEEKLY case is handled above.
      const now = new Date();
      const newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await cardService.syncCardTypeWithSubscription(subscription.userId, newPlan);
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          plan: newPlan,
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
          // New period → eligible for a fresh pre-expiry reminder.
          lastRenewalReminderSentAt: null,
          // Spec §8.3 v1.1 — clear auto-renew-OFF reminder bitmask on new period.
          renewalRemindersSent: 0,
        },
      });
    }

    // Stripe-based subscription — update through Stripe
    const stripeSubscription = await stripeService.stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    await stripeService.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [{
          id: stripeSubscription.items.data[0].id,
          price: PRICE_IDS[newPlan],
        }],
        proration_behavior: 'none', // Credits are handled via wallet, not Stripe prorations
        metadata: { plan: newPlan },
      }
    );

    // Sync card type immediately — don't wait for Stripe webhook
    await cardService.syncCardTypeWithSubscription(subscription.userId, newPlan);

    // Update database
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        plan: newPlan,
        stripePriceId: PRICE_IDS[newPlan],
      },
    });
  }

  /**
   * Calculate and apply upgrade wallet credit based on document rules:
   *   PREMIUM_WEEKLY → PREMIUM : 100% of remaining weekly value
   *   BASIC → PREMIUM : 60%  of remaining monthly value
   */
  private async applyUpgradeCredit(
    subscription: {
      id: string;
      userId: string;
      plan: SubscriptionPlan;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      planDetails: { priceWeeklyEur: number | null; priceMonthlyEur: number | null } | null;
    },
    newPlan: SubscriptionPlan,
  ): Promise<void> {
    const { plan: oldPlan, currentPeriodStart, currentPeriodEnd, userId } = subscription;

    // Determine credit percentage
    let creditPct: number;
    if (oldPlan === 'PREMIUM_WEEKLY' && ((newPlan as string) === 'PREMIUM' || newPlan === ('PREMIUM_MONTHLY' as any))) {
      creditPct = UPGRADE_CREDIT_WEEKLY_TO_MONTHLY;
    } else if (oldPlan === 'BASIC' && ((newPlan as string) === 'PREMIUM' || newPlan === ('PREMIUM_MONTHLY' as any))) {
      creditPct = UPGRADE_CREDIT_BASIC_TO_PREMIUM;
    } else {
      return; // No credit for other transitions
    }

    // Resolve plan price from planDetails or fall back to Plan table
    let planDetails = subscription.planDetails;
    if (!planDetails) {
      planDetails = await prisma.plan.findFirst({
        where: { planCode: oldPlan, isActive: true },
        select: { priceWeeklyEur: true, priceMonthlyEur: true },
      });
    }

    const priceEurCents = oldPlan === 'PREMIUM_WEEKLY'
      ? (planDetails?.priceWeeklyEur ?? 0)
      : (planDetails?.priceMonthlyEur ?? 0);

    if (priceEurCents <= 0) return; // Can't calculate credit without a price

    const priceEur = priceEurCents / 100;
    const now = Date.now();
    const totalMs = currentPeriodEnd.getTime() - currentPeriodStart.getTime();
    const remainingMs = Math.max(0, currentPeriodEnd.getTime() - now);

    if (totalMs <= 0 || remainingMs <= 0) return; // Period already ended

    const remainingFraction = remainingMs / totalMs;
    const creditEur = priceEur * remainingFraction * creditPct;
    const creditBGN = parseFloat((creditEur * EUR_TO_BGN_RATE).toFixed(2));

    if (creditBGN < 0.01) return; // Too small to credit

    await walletService.credit({
      userId,
      amount: creditBGN,
      type: WalletTransactionType.ADJUSTMENT,
      description: `Кредит при надграждане: ${oldPlan} → ${newPlan} (${Math.round(creditPct * 100)}% от ${priceEur.toFixed(2)} EUR оставаща стойност)`,
      metadata: {
        upgradeFrom: oldPlan,
        upgradeTo: newPlan,
        creditPct,
        remainingFraction: parseFloat(remainingFraction.toFixed(4)),
        creditEur,
        creditBGN,
      },
    });

    logger.info(
      `Upgrade credit applied: ${creditBGN} BGN (€${creditEur.toFixed(2)}) to user ${userId} ` +
      `for ${oldPlan}→${newPlan} upgrade (${Math.round(creditPct * 100)}%, ${(remainingFraction * 100).toFixed(1)}% remaining)`
    );
  }

  /**
   * Ensure the user has a card. If none exists, creates a PREMIUM_WEEKLY card.
   * Called during subscription creation so the card is always present
   * before syncCardTypeWithSubscription runs.
   */
  private async ensureCardExists(userId: string) {
    const existing = await prisma.card.findFirst({ where: { userId } });
    if (!existing) {
      await cardService.createCard({ userId, cardType: 'PREMIUM_WEEKLY' });
      logger.info(`Auto-created PREMIUM_WEEKLY card for user ${userId} during subscription creation`);
    }
  }

  /**
   * Reactivate a subscription that is scheduled for cancellation (cancelAtPeriodEnd=true).
   * Removes the cancellation schedule and re-enables auto-renewal.
   */
  async reactivateSubscription(subscriptionId: string, userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) throw new AppError('Subscription not found', 404);
    if (subscription.userId !== userId) throw new AppError('Forbidden', 403);

    if (
      subscription.status === 'CANCELLED' ||
      subscription.status === 'EXPIRED' ||
      subscription.status === 'INCOMPLETE_EXPIRED'
    ) {
      throw new AppError('Subscription is terminated and cannot be reactivated this way. Please subscribe to a new plan.', 400);
    }

    if (subscription.stripeSubscriptionId) {
      await stripeService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    }

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        autoRenewal: true,
      },
    });
  }

  /**
   * Toggle auto-renewal for a subscription (FR-004).
   * For Stripe: mirrors the change to cancel_at_period_end.
   * For Paysera: DB-only update (no external billing to cancel).
   */
  async toggleAutoRenewal(subscriptionId: string, userId: string, autoRenewal: boolean) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) throw new AppError('Subscription not found', 404);
    if (subscription.userId !== userId) throw new AppError('Forbidden', 403);

    if (subscription.stripeSubscriptionId) {
      await stripeService.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: !autoRenewal,
      });
    }

    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        autoRenewal,
        cancelAtPeriodEnd: !autoRenewal,
        cancelAt: !autoRenewal ? subscription.currentPeriodEnd : null,
      },
    });
  }

  /**
   * Request a 24-hour trial refund (FR-007).
   * Eligibility: trialRefundEligibleUntil is in the future and refund not yet used.
   * Issues a Stripe refund for Stripe subscriptions; logs for manual action on Paysera.
   * Immediately cancels the subscription in both cases.
   */
  async requestTrialRefund(subscriptionId: string, userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: { select: { email: true, firstName: true, preferredLanguage: true } },
        planDetails: { select: { displayName: true, priceWeeklyEur: true, priceMonthlyEur: true, priceYearlyEur: true } },
      },
    });

    if (!subscription) throw new AppError('Subscription not found', 404);
    if (subscription.userId !== userId) throw new AppError('Forbidden', 403);
    // payseraOrderId is a top-level field on subscription — no extra include needed

    const now = new Date();
    if (!subscription.trialRefundEligibleUntil || subscription.trialRefundEligibleUntil < now) {
      throw new AppError('Trial refund window has expired (24 hours from purchase)', 400);
    }
    if (subscription.trialRefundUsed) {
      throw new AppError('Trial refund has already been used', 400);
    }

    // Mark used immediately — prevents duplicate concurrent requests
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { trialRefundUsed: true },
    });

    try {
      if (subscription.stripeSubscriptionId) {
        const invoices = await stripeService.stripe.invoices.list({
          subscription: subscription.stripeSubscriptionId,
          limit: 1,
        });
        const paymentIntentId = invoices.data[0]?.payment_intent as string | null;
        if (paymentIntentId) {
          await stripeService.createRefund({
            paymentIntentId,
            reason: 'requested_by_customer',
          });
        }
      } else {
        // Paysera subscriptions — flag for manual refund processing and notify user + admin
        logger.info(
          `Trial refund requested for Paysera subscription ${subscriptionId} (user ${userId}) — requires manual Paysera refund`
        );

        const lang = (subscription.user?.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
        let subMetadata: Record<string, any> = {};
        try { if (subscription.metadata) subMetadata = JSON.parse(subscription.metadata); } catch { subMetadata = {}; }
        const billingPeriod = (subMetadata.billingPeriod ?? '').toLowerCase();
        const priceInCents = (() => {
          const plan = subscription.planDetails;
          if (!plan) return 0;
          if (billingPeriod.includes('week') && plan.priceWeeklyEur) return plan.priceWeeklyEur;
          if (billingPeriod.includes('year')) return plan.priceYearlyEur;
          return plan.priceMonthlyEur ?? 0;
        })();
        const refundAmountEur = priceInCents / 100;
        const planName = subscription.planDetails?.displayName || subscription.plan;
        const refundData = {
          customerName: subscription.user?.firstName || 'Customer',
          planName,
          amount: refundAmountEur,
          currency: 'EUR',
          subscriptionId,
          userId,
          payseraOrderId: subscription.payseraOrderId ?? undefined,
          language: lang,
        };

        if (subscription.user?.email) {
          detach(emailService
            .sendTrialRefundPendingEmail(subscription.user.email, refundData), (err) => logger.error(`[requestTrialRefund] User email failed for sub ${subscriptionId}:`, err));
        }
        detach(emailService
          .sendAdminTrialRefundAlert(refundData), (err) => logger.error(`[requestTrialRefund] Admin alert email failed for sub ${subscriptionId}:`, err));
      }
    } catch (err) {
      // Undo the used flag so the user can retry if the refund API call failed
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { trialRefundUsed: false },
      });
      throw err;
    }

    // Void cashback earned during the trial period
    try {
      // Cancel any PENDING receipts first (they haven't been credited yet)
      await prisma.receipt.updateMany({
        where: {
          userId,
          status: { in: ['PENDING', 'MANUAL_REVIEW'] },
          createdAt: { gte: subscription.createdAt },
        },
        data: {
          status: 'REJECTED',
          rejectionReason: 'Trial refund — pending cashback cancelled',
        },
      });

      // Find all APPROVED receipts created during the trial period
      const approvedReceipts = await prisma.receipt.findMany({
        where: {
          userId,
          status: 'APPROVED',
          createdAt: { gte: subscription.createdAt },
        },
        select: { id: true },
      });

      if (approvedReceipts.length > 0) {
        const receiptIds = approvedReceipts.map(r => r.id);

        // Sum all CASHBACK_CREDIT entries for these receipts, split by status.
        // TRIAL_PENDING credits only hit balance (not availableBalance), so they
        // must be reversed via voidTrialPendingCashback rather than debit().
        //
        // Exclude ghost VOIDED rows (status=ANNULLED, cashbackStatus=VOIDED):
        // these were never credited to the wallet (recordRejectedAsVoided writes
        // balanceBefore == balanceAfter), so debiting them here would steal funds
        // the user actually earned via other transactions.
        const credits = await prisma.walletTransaction.findMany({
          where: {
            receiptId: { in: receiptIds },
            type: WalletTransactionType.CASHBACK_CREDIT,
            amount: { gt: 0 },
            status: { not: 'ANNULLED' },
            cashbackStatus: { not: 'VOIDED' },
          },
          select: { id: true, amount: true, status: true },
        });

        const completedTotal = credits
          .filter(c => c.status !== 'TRIAL_PENDING')
          .reduce((sum, c) => sum + c.amount, 0);
        const trialPendingCredits = credits.filter(c => c.status === 'TRIAL_PENDING');
        const trialPendingTotal = trialPendingCredits.reduce((sum, c) => sum + c.amount, 0);

        if (completedTotal > 0) {
          await walletService.debit({
            userId,
            amount: completedTotal,
            type: WalletTransactionType.ADJUSTMENT,
            description: 'Анулиран кешбек при пробен период',
            metadata: { receiptIds },
          });
        }
        if (trialPendingTotal > 0) {
          await walletService.voidTrialPendingCashback({
            userId,
            amount: trialPendingTotal,
            transactionIds: trialPendingCredits.map(c => c.id),
            metadata: { receiptIds },
          });
        }

        // Bulk-reject all approved receipts atomically
        await prisma.receipt.updateMany({
          where: { id: { in: receiptIds } },
          data: {
            status: 'REJECTED',
            rejectionReason: 'Trial refund — cashback voided',
          },
        });
      }
    } catch (cashbackErr) {
      logger.error(
        `Failed to void cashback for trial refund (subscription ${subscriptionId}, user ${userId}): ${cashbackErr instanceof Error ? cashbackErr.message : cashbackErr}`
      );
      // Do not rethrow — cashback voiding failure must not block the refund
    }

    // Void StickerScan cashback earned during the trial period (Spec §2.2)
    try {
      // Cancel pre-approval scans — no wallet credit has been issued yet
      await prisma.stickerScan.updateMany({
        where: {
          userId,
          status: { in: [ScanStatus.PENDING, ScanStatus.VALIDATING, ScanStatus.MANUAL_REVIEW] },
          createdAt: { gte: subscription.createdAt },
        },
        data: {
          status: ScanStatus.REJECTED,
          rejectionReason: 'Trial refund — pending cashback cancelled',
          processedAt: new Date(),
        },
      });

      // Find APPROVED scans — their cashback is already in the wallet
      const approvedScans = await prisma.stickerScan.findMany({
        where: {
          userId,
          status: ScanStatus.APPROVED,
          createdAt: { gte: subscription.createdAt },
        },
        select: { id: true },
      });

      if (approvedScans.length > 0) {
        const scanIds = approvedScans.map(s => s.id);

        // Same exclusion for sticker-scan credits: ghost VOIDED rows must not be debited.
        const stickerCredits = await prisma.walletTransaction.findMany({
          where: {
            stickerScanId: { in: scanIds },
            type: WalletTransactionType.CASHBACK_CREDIT,
            amount: { gt: 0 },
            status: { not: 'ANNULLED' },
            cashbackStatus: { not: 'VOIDED' },
          },
          select: { id: true, amount: true, status: true },
        });

        const stickerCompletedTotal = stickerCredits
          .filter(c => c.status !== 'TRIAL_PENDING')
          .reduce((sum, c) => sum + c.amount, 0);
        const stickerTrialPendingCredits = stickerCredits.filter(c => c.status === 'TRIAL_PENDING');
        const stickerTrialPendingTotal = stickerTrialPendingCredits.reduce((sum, c) => sum + c.amount, 0);

        if (stickerCompletedTotal > 0) {
          await walletService.debit({
            userId,
            amount: stickerCompletedTotal,
            type: WalletTransactionType.ADJUSTMENT,
            description: 'Анулиран кешбек от стикер при пробен период',
            metadata: { scanIds },
          });
        }
        if (stickerTrialPendingTotal > 0) {
          await walletService.voidTrialPendingCashback({
            userId,
            amount: stickerTrialPendingTotal,
            transactionIds: stickerTrialPendingCredits.map(c => c.id),
            metadata: { scanIds },
          });
        }

        await prisma.stickerScan.updateMany({
          where: { id: { in: scanIds } },
          data: {
            status: ScanStatus.REJECTED,
            rejectionReason: 'Trial refund — cashback voided',
            processedAt: new Date(),
          },
        });
      }
    } catch (stickerCashbackErr) {
      logger.error(
        `Failed to void sticker scan cashback for trial refund (subscription ${subscriptionId}, user ${userId}): ${stickerCashbackErr instanceof Error ? stickerCashbackErr.message : stickerCashbackErr}`
      );
    }

    return this.cancelSubscription(subscriptionId, false, /* suppressEmail */ true);
  }

  /**
   * Retry payment for a PAST_DUE Stripe subscription.
   * Finds the latest open invoice and attempts to pay it immediately.
   * Paysera subscriptions cannot be retried programmatically.
   */
  async retryPayment(subscriptionId: string, userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) throw new AppError('Subscription not found', 404);
    if (subscription.userId !== userId) throw new AppError('Forbidden', 403);
    if (subscription.status !== 'PAST_DUE') {
      throw new AppError('Subscription is not past due', 400);
    }
    // Spec §3.3: one retry attempt allowed. Guard against webhook ordering races
    // where PAST_DUE arrives before FAILED_PAYMENT — if a retry has already been
    // attempted (retryAttempt > 0) we must not allow a second one.
    if (subscription.retryAttempt > 0) {
      throw new AppError('Payment retry already attempted', 400);
    }
    if (subscription.cancelAtPeriodEnd || subscription.canceledAt) {
      throw new AppError('Cannot retry payment on a subscription that has been cancelled', 400);
    }

    if (!subscription.stripeSubscriptionId) {
      throw new AppError('Payment retry is not available for this subscription type. Please contact support.', 400);
    }

    const invoices = await stripeService.stripe.invoices.list({
      subscription: subscription.stripeSubscriptionId,
      status: 'open',
      limit: 1,
    });

    if (!invoices.data.length) {
      throw new AppError('No open invoice found. Please contact support.', 400);
    }

    const paid = await stripeService.stripe.invoices.pay(invoices.data[0].id, {
      forgive: false,
    });

    if (paid.status === 'paid') {
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'ACTIVE', pauseEndsAt: null },
      });
    }

    throw new AppError('Payment retry failed. Please update your payment method and try again.', 400);
  }

  /**
   * Get user's active subscription
   */
  async getActiveSubscription(userId: string) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        OR: [
          // Spec §3.2 canonical statuses: Active (ACTIVE/TRIALING), Paused (PAUSED).
          { status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
          // Cancelled-within-paid-period: spec §3.3 — user retains access through period end.
          { status: 'CANCELLED', currentPeriodEnd: { gt: new Date() } },
          // PAST_DUE / FAILED_PAYMENT: return the subscription object so the frontend can
          // show the correct "payment failed" / "update payment method" CTA. These statuses
          // block scanning (assertSubscriptionAllowsScanning) but the user still needs to
          // see the subscription to take remedial action. Without this, GET /subscriptions/current
          // returns { hasSubscription: false } during the Stripe dunning window, hiding the CTA.
          { status: { in: ['PAST_DUE', 'FAILED_PAYMENT'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string) {
    return prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Get plan benefits — reads from DB Plans table (source of truth).
   */
  async getPlanBenefits(plan: SubscriptionPlan) {
    const dbCode =
      (plan as string) === 'PREMIUM_WEEKLY' ? 'LIGHT'
      : (plan as string) === 'PREMIUM_MONTHLY' ? 'PREMIUM'
      : (plan as string);
    const row = await prisma.plan.findFirst({
      where: { planCode: dbCode as any, isActive: true },
      select: { cashbackRate: true, priceMonthlyEur: true, features: true },
    });

    const cashbackRate = row?.cashbackRate ?? 0;
    const monthlyFee   = row?.priceMonthlyEur != null ? row.priceMonthlyEur / 100 : null;
    const features: string[] = row?.features ? JSON.parse(row.features) : [];

    return { cashbackRate, monthlyFee, features };
  }
}

export const subscriptionService = new SubscriptionService();
