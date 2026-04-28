import { SubscriptionPlan, WalletTransactionType } from '@prisma/client';
import prisma from '../lib/prisma';
import { stripeService } from './stripe.service';
import { logger } from '../utils/logger';
import { cardService } from './card.service';
import { walletService } from './wallet.service';
import {
  EUR_TO_BGN_RATE,
  UPGRADE_CREDIT_WEEKLY_TO_MONTHLY,
  UPGRADE_CREDIT_BASIC_TO_PREMIUM,
} from '../constants/receipt.constants';

// Stripe Price IDs (create these in Stripe Dashboard)
const PRICE_IDS = {
  LIGHT: process.env.STRIPE_LIGHT_PRICE_ID || 'price_LIGHT',
  BASIC: process.env.STRIPE_BASIC_PRICE_ID || 'price_BASIC',
  PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_PREMIUM',
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

    if (plan === 'LIGHT') {
      // LIGHT (Premium Weekly) subscriptions must be purchased through Paysera.
      // The Paysera webhook (POST /api/payments/paysera/callback) creates the subscription
      // directly in the DB once payment is confirmed. Allowing free creation here would
      // bypass payment entirely.
      throw new Error('LIGHT plan must be purchased via the Paysera payment flow');
    }

    // Get user email for Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new Error('User not found');
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
        // FR-007: 24-hour trial refund window starts at purchase
        trialRefundEligibleUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Ensure the user has a card; create a LIGHT card if not (will be upgraded below)
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
  async cancelSubscription(subscriptionId: string, cancelAtPeriodEnd = true) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (!subscription.stripeSubscriptionId) {
      // Paysera-based subscription (LIGHT or legacy) — no external billing to cancel.
      // Mark it to expire at the end of the current period so the user keeps access
      // until then, mirroring Stripe's cancel_at_period_end behaviour.
      if (cancelAtPeriodEnd) {
        return prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            cancelAtPeriodEnd: true,
            cancelAt: subscription.currentPeriodEnd,
            canceledAt: new Date(),
          },
        });
      }

      // Immediate cancellation — end it now and downgrade the card
      await cardService.syncCardTypeWithSubscription(subscription.userId, 'LIGHT');
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'CANCELLED',
          cancelAtPeriodEnd: false,
          cancelAt: new Date(),
          canceledAt: new Date(),
        },
      });
    }

    // Stripe-based subscription — cancel through Stripe
    const stripeSubscription = await stripeService.stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: cancelAtPeriodEnd }
    );

    // Update database
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        cancelAtPeriodEnd,
        cancelAt: stripeSubscription.cancel_at
          ? new Date(stripeSubscription.cancel_at * 1000)
          : null,
        canceledAt: new Date(),
      },
    });
  }

  /**
   * Upgrade/Downgrade subscription.
   *
   * Upgrade credit rules (credited to wallet before plan change):
   *   LIGHT  → PREMIUM : 100% of remaining weekly value
   *   BASIC  → PREMIUM : 60%  of remaining monthly value
   *   All other transitions: no credit
   */
  async updateSubscriptionPlan(subscriptionId: string, newPlan: SubscriptionPlan) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { planDetails: { select: { priceWeeklyEur: true, priceMonthlyEur: true } } },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.plan === newPlan) {
      throw new Error(`Subscription is already on the ${newPlan} plan`);
    }

    // Calculate and credit any applicable upgrade credit to the user's wallet
    await this.applyUpgradeCredit(subscription, newPlan);

    if (newPlan === 'LIGHT') {
      // Downgrade to light - cancel current subscription
      if (subscription.stripeSubscriptionId) {
        await this.cancelSubscription(subscriptionId, false);
      }

      await cardService.syncCardTypeWithSubscription(subscription.userId, 'LIGHT');
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          plan: 'LIGHT',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    if (!subscription.stripeSubscriptionId) {
      // Paysera-based subscription — update plan directly in DB
      // BASIC and PREMIUM are both monthly (30d). The LIGHT case is handled above.
      const now = new Date();
      const newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await cardService.syncCardTypeWithSubscription(subscription.userId, newPlan);
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          plan: newPlan,
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
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
   *   LIGHT → PREMIUM : 100% of remaining weekly value
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
    if (oldPlan === 'LIGHT' && newPlan === 'PREMIUM') {
      creditPct = UPGRADE_CREDIT_WEEKLY_TO_MONTHLY;
    } else if (oldPlan === 'BASIC' && newPlan === 'PREMIUM') {
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

    const priceEurCents = oldPlan === 'LIGHT'
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
      description: `Upgrade credit: ${oldPlan} → ${newPlan} (${Math.round(creditPct * 100)}% of ${priceEur.toFixed(2)} EUR remaining value)`,
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
   * Ensure the user has a card. If none exists, creates a LIGHT card.
   * Called during subscription creation so the card is always present
   * before syncCardTypeWithSubscription runs.
   */
  private async ensureCardExists(userId: string) {
    const existing = await prisma.card.findFirst({ where: { userId } });
    if (!existing) {
      await cardService.createCard({ userId, cardType: 'LIGHT' });
      logger.info(`Auto-created LIGHT card for user ${userId} during subscription creation`);
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

    if (!subscription) throw new Error('Subscription not found');
    if (subscription.userId !== userId) throw new Error('Forbidden');

    if (subscription.status === 'CANCELLED') {
      throw new Error('Subscription is already cancelled and cannot be reactivated this way. Please subscribe to a new plan.');
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

    if (!subscription) throw new Error('Subscription not found');
    if (subscription.userId !== userId) throw new Error('Forbidden');

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
    });

    if (!subscription) throw new Error('Subscription not found');
    if (subscription.userId !== userId) throw new Error('Forbidden');

    const now = new Date();
    if (!subscription.trialRefundEligibleUntil || subscription.trialRefundEligibleUntil < now) {
      throw new Error('Trial refund window has expired (24 hours from purchase)');
    }
    if (subscription.trialRefundUsed) {
      throw new Error('Trial refund has already been used');
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
        // Paysera subscriptions — flag for manual refund processing
        logger.info(
          `Trial refund requested for Paysera subscription ${subscriptionId} (user ${userId}) — requires manual Paysera refund`
        );
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
          status: 'PENDING',
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
      });

      for (const receipt of approvedReceipts) {
        // Find the wallet cashback_credit entry for this receipt
        const creditEntry = await prisma.walletTransaction.findFirst({
          where: {
            receiptId: receipt.id,
            type: WalletTransactionType.CASHBACK_CREDIT,
          },
        });

        if (creditEntry && creditEntry.amount > 0) {
          // Debit the wallet to reverse the cashback
          await walletService.debit({
            userId,
            amount: creditEntry.amount,
            type: WalletTransactionType.ADJUSTMENT,
            description: 'Trial refund — cashback voided',
            receiptId: receipt.id,
          });
        }

        // Mark the receipt as REJECTED
        await prisma.receipt.update({
          where: { id: receipt.id },
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

    return this.cancelSubscription(subscriptionId, false);
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

    if (!subscription) throw new Error('Subscription not found');
    if (subscription.userId !== userId) throw new Error('Forbidden');
    if (subscription.status !== 'PAST_DUE') {
      throw new Error('Subscription is not past due');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new Error('Payment retry is not available for this subscription type. Please contact support.');
    }

    const invoices = await stripeService.stripe.invoices.list({
      subscription: subscription.stripeSubscriptionId,
      status: 'open',
      limit: 1,
    });

    if (!invoices.data.length) {
      throw new Error('No open invoice found. Please contact support.');
    }

    const paid = await stripeService.stripe.invoices.pay(invoices.data[0].id, {
      forgive: false,
    });

    if (paid.status === 'paid') {
      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'ACTIVE', gracePeriodEndsAt: null },
      });
    }

    throw new Error('Payment retry failed. Please update your payment method and try again.');
  }

  /**
   * Get user's active subscription
   */
  async getActiveSubscription(userId: string) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
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
    const row = await prisma.plan.findFirst({
      where: { planCode: plan, isActive: true },
      select: { cashbackRate: true, priceMonthlyEur: true, features: true },
    });

    const cashbackRate = row?.cashbackRate ?? 0;
    const monthlyFee   = row?.priceMonthlyEur != null ? row.priceMonthlyEur / 100 : null;
    const features: string[] = row?.features ? JSON.parse(row.features) : [];

    return { cashbackRate, monthlyFee, features };
  }
}

export const subscriptionService = new SubscriptionService();
