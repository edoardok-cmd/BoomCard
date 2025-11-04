import { PrismaClient, SubscriptionPlan } from '@prisma/client';
import { stripeService } from './stripe.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Stripe Price IDs (create these in Stripe Dashboard)
const PRICE_IDS = {
  STANDARD: null, // Free plan
  PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_PREMIUM',
  PLATINUM: process.env.STRIPE_PLATINUM_PRICE_ID || 'price_PLATINUM',
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

    if (plan === 'STANDARD') {
      // Standard is free, just create in database
      return prisma.subscription.create({
        data: {
          userId,
          plan: 'STANDARD',
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

    if (subscription.plan === 'STANDARD') {
      // Can't cancel standard plan
      throw new Error('Cannot cancel standard plan');
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

    if (newPlan === 'STANDARD') {
      // Downgrade to free - cancel current subscription
      if (subscription.stripeSubscriptionId) {
        await this.cancelSubscription(subscriptionId, false);
      }

      return prisma.subscription.update({
        where: { id: subscriptionId },
        data: { plan: 'STANDARD' },
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
      STANDARD: {
        cashbackRate: 0.05,
        monthlyFee: 0,
        features: [
          '5% cashback on all purchases',
          'Basic receipt scanning',
          'Transaction history',
          'Email support',
        ],
      },
      PREMIUM: {
        cashbackRate: 0.07,
        monthlyFee: 9.99,
        features: [
          '7% cashback on all purchases',
          '+2% bonus on BOOM-Sticker scans',
          'Priority receipt processing',
          'Advanced analytics',
          'Priority support',
          'No ads',
        ],
      },
      PLATINUM: {
        cashbackRate: 0.10,
        monthlyFee: 19.99,
        features: [
          '10% cashback on all purchases',
          '+5% bonus on BOOM-Sticker scans',
          'Instant receipt approval',
          'Premium analytics & insights',
          '24/7 priority support',
          'Exclusive partner offers',
          'No ads',
          'Early access to new features',
        ],
      },
    };

    return benefits[plan];
  }
}

export const subscriptionService = new SubscriptionService();
