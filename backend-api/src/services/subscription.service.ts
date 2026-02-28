import { SubscriptionPlan } from '@prisma/client';
import prisma from '../lib/prisma';
import { stripeService } from './stripe.service';
import { logger } from '../utils/logger';

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
      // Light is the entry-level weekly plan
      return prisma.subscription.create({
        data: {
          userId,
          plan: 'LIGHT',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });
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
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        status: stripeSubscription.status === 'active' ? 'ACTIVE' : 'INCOMPLETE',
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
      },
    });

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

    if (subscription.plan === 'LIGHT') {
      // Can't cancel light plan
      throw new Error('Cannot cancel light plan');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new Error('No Stripe subscription found');
    }

    // Cancel in Stripe
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
   * Upgrade/Downgrade subscription
   */
  async updateSubscriptionPlan(subscriptionId: string, newPlan: SubscriptionPlan) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (newPlan === 'LIGHT') {
      // Downgrade to light - cancel current subscription
      if (subscription.stripeSubscriptionId) {
        await this.cancelSubscription(subscriptionId, false);
      }

      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: { plan: 'LIGHT' },
      });
    }

    if (!subscription.stripeSubscriptionId) {
      throw new Error('No Stripe subscription to update');
    }

    // Update in Stripe
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
        proration_behavior: 'create_prorations',
        metadata: { plan: newPlan },
      }
    );

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
   * Get user's active subscription
   */
  async getActiveSubscription(userId: string) {
    return prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIALING'] },
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
   * Get plan benefits
   */
  getPlanBenefits(plan: SubscriptionPlan) {
    const benefits = {
      LIGHT: {
        cashbackRate: 0.20,
        monthlyFee: 4.99,
        features: [
          'Up to 20% cashback',
          'Weekly Premium access',
          'Exclusive Premium offers',
          'VIP priority support',
          'Cashback via the app',
        ],
      },
      BASIC: {
        cashbackRate: 0.10,
        monthlyFee: 7.99,
        features: [
          'Up to 10% cashback',
          'Monthly access',
          'Cashback via the app',
          'Access to partner offers',
          'Standard support',
        ],
      },
      PREMIUM: {
        cashbackRate: 0.20,
        monthlyFee: 12.99,
        features: [
          'Up to 20% cashback',
          '+5% bonus on BOOM-Sticker scans',
          'Exclusive Premium offers',
          'VIP priority support',
          'Cashback via the app',
          'Additional sticker bonus',
        ],
      },
    };

    return benefits[plan];
  }
}

export const subscriptionService = new SubscriptionService();
