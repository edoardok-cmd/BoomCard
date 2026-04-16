import Stripe from 'stripe';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { walletService } from './wallet.service';
import { notificationService } from './notification.service';

/**
 * Stripe Service for Payment Processing
 * Handles all Stripe operations: Payment Intents, Customers, Cards, Webhooks
 */
class StripeService {
  public stripe: Stripe;

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;

    if (!apiKey) {
      logger.warn('STRIPE_SECRET_KEY not configured - using test mode');
      // Use Stripe test key for development
      this.stripe = new Stripe('sk_test_placeholder', {
        apiVersion: '2023-10-16',
      });
    } else {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2023-10-16',
      });
    }

    logger.info('Stripe service initialized');
  }

  /**
   * Create or retrieve Stripe customer for user
   */
  async getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string> {
    try {
      // Check if user already has a Stripe customer ID
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { stripeCustomerId: true },
      });

      if (user?.stripeCustomerId) {
        return user.stripeCustomerId;
      }

      // Create new Stripe customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });

      // Save customer ID to database
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
      });

      logger.info(`Created Stripe customer ${customer.id} for user ${userId}`);
      return customer.id;
    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
      throw new AppError('Failed to create payment customer', 500);
    }
  }

  /**
   * Create Payment Intent for booking or subscription
   */
  async createPaymentIntent(params: {
    amount: number;
    currency?: string;
    userId: string;
    email: string;
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
  }> {
    try {
      const { amount, currency = 'bgn', userId, email, description, metadata } = params;

      // Get or create customer
      const customerId = await this.getOrCreateCustomer(userId, email);

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe expects amount in cents/stotinki
        currency: currency.toLowerCase(),
        customer: customerId,
        description,
        metadata: {
          userId,
          ...metadata,
        },
        // Enable automatic payment methods (cards, wallets, etc.)
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info(`Created payment intent ${paymentIntent.id} for ${amount} ${currency}`);

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      };
    } catch (error) {
      logger.error('Error creating payment intent:', error);
      throw new AppError('Failed to create payment', 500);
    }
  }

  /**
   * Confirm Payment Intent (server-side confirmation)
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      logger.info(`Confirmed payment intent ${paymentIntentId}: ${paymentIntent.status}`);
      return paymentIntent;
    } catch (error) {
      logger.error('Error confirming payment intent:', error);
      throw new AppError('Failed to confirm payment', 500);
    }
  }

  /**
   * Cancel Payment Intent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
      logger.info(`Cancelled payment intent ${paymentIntentId}`);
    } catch (error) {
      logger.error('Error cancelling payment intent:', error);
      throw new AppError('Failed to cancel payment', 500);
    }
  }

  /**
   * Retrieve Payment Intent
   */
  async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      logger.error('Error retrieving payment intent:', error);
      throw new AppError('Payment not found', 404);
    }
  }

  /**
   * Attach Payment Method to Customer
   */
  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });

      logger.info(`Attached payment method ${paymentMethodId} to customer ${customerId}`);
      return paymentMethod;
    } catch (error) {
      logger.error('Error attaching payment method:', error);
      throw new AppError('Failed to save payment method', 500);
    }
  }

  /**
   * List Customer Payment Methods
   */
  async listPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data;
    } catch (error) {
      logger.error('Error listing payment methods:', error);
      throw new AppError('Failed to retrieve payment methods', 500);
    }
  }

  /**
   * Detach Payment Method (remove card)
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);
      logger.info(`Detached payment method ${paymentMethodId}`);
    } catch (error) {
      logger.error('Error detaching payment method:', error);
      throw new AppError('Failed to remove payment method', 500);
    }
  }

  /**
   * Set Default Payment Method
   */
  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      logger.info(`Set default payment method ${paymentMethodId} for customer ${customerId}`);
    } catch (error) {
      logger.error('Error setting default payment method:', error);
      throw new AppError('Failed to set default payment method', 500);
    }
  }

  /**
   * Create Refund
   */
  async createRefund(params: {
    paymentIntentId: string;
    amount?: number; // If not provided, full refund
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  }): Promise<Stripe.Refund> {
    try {
      const { paymentIntentId, amount, reason } = params;

      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason,
      });

      logger.info(`Created refund ${refund.id} for payment ${paymentIntentId}`);
      return refund;
    } catch (error) {
      logger.error('Error creating refund:', error);
      throw new AppError('Failed to process refund', 500);
    }
  }

  /**
   * Create Subscription
   */
  async createSubscription(params: {
    customerId: string;
    priceId: string; // Stripe Price ID
    trialDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    try {
      const { customerId, priceId, trialDays, metadata } = params;

      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        metadata,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      logger.info(`Created subscription ${subscription.id} for customer ${customerId}`);
      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw new AppError('Failed to create subscription', 500);
    }
  }

  /**
   * Cancel Subscription
   */
  async cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<Stripe.Subscription> {
    try {
      let subscription;

      if (immediately) {
        subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }

      logger.info(`Cancelled subscription ${subscriptionId} (immediate: ${immediately})`);
      return subscription;
    } catch (error) {
      logger.error('Error cancelling subscription:', error);
      throw new AppError('Failed to cancel subscription', 500);
    }
  }

  /**
   * Verify Webhook Signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new AppError('Webhook secret not configured', 500);
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      logger.error('Webhook signature verification failed:', error);
      throw new AppError('Invalid webhook signature', 401);
    }
  }

  /**
   * Handle Webhook Event
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    logger.info(`Processing webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.refunded':
          await this.handleRefund(event.data.object as Stripe.Charge);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.info(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      logger.error(`Error handling webhook event ${event.type}:`, error);
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    logger.info(`Payment succeeded: ${paymentIntent.id}`);

    const { userId, type } = paymentIntent.metadata;

    if (!userId) {
      logger.error('No userId in payment intent metadata');
      return;
    }

    try {
      // Upsert transaction — atomic on the unique stripePaymentId to eliminate the
      // TOCTOU race between findFirst and create when Stripe retries the webhook.
      await prisma.transaction.upsert({
        where: { stripePaymentId: paymentIntent.id },
        create: {
          userId,
          type: (type || 'PURCHASE') as any,
          status: 'COMPLETED',
          amount: paymentIntent.amount / 100,
          finalAmount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          paymentMethod: 'CARD',
          stripePaymentId: paymentIntent.id,
          paymentIntentId: paymentIntent.id,
          metadata: JSON.stringify(paymentIntent.metadata),
          completedAt: new Date(),
        },
        update: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // If this is a wallet top-up, credit the wallet.
      // Idempotency guard: Stripe may deliver the same event more than once.
      // Skip the credit if a COMPLETED wallet transaction already exists for this
      // paymentIntent — otherwise we'd double-credit the user's wallet.
      if (type === 'TOP_UP') {
        const alreadyCredited = await prisma.walletTransaction.findFirst({
          where: {
            stripePaymentIntentId: paymentIntent.id,
            type: 'TOP_UP',
            status: 'COMPLETED',
          },
        });

        if (alreadyCredited) {
          logger.info(`Wallet already credited for payment ${paymentIntent.id} — skipping (idempotent)`);
        } else {
          const amount = paymentIntent.amount / 100;

          await walletService.credit({
            userId,
            amount,
            type: 'TOP_UP',
            description: 'Wallet top-up via card payment',
            stripePaymentIntentId: paymentIntent.id,
            metadata: { paymentIntent: paymentIntent.id },
          });

          // Update wallet transaction status
          await prisma.walletTransaction.updateMany({
            where: {
              stripePaymentIntentId: paymentIntent.id,
              status: 'PENDING',
            },
            data: {
              status: 'COMPLETED',
            },
          });

          logger.info(`Credited ${amount} BGN to wallet for user ${userId}`);
        }
      }

      logger.info(`Transaction created/updated for payment ${paymentIntent.id}`);
    } catch (error) {
      logger.error(`Error handling payment success: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    logger.warn(`Payment failed: ${paymentIntent.id}`);

    const { userId, type } = paymentIntent.metadata;

    if (!userId) return;

    try {
      // Upsert transaction — atomic on unique stripePaymentId (same rationale as
      // handlePaymentSucceeded). Also handles the retry-after-success case: if the
      // payment previously succeeded and Stripe later fires a failure, we update status.
      await prisma.transaction.upsert({
        where: { stripePaymentId: paymentIntent.id },
        create: {
          userId,
          type: (type || 'PURCHASE') as any,
          status: 'FAILED',
          amount: paymentIntent.amount / 100,
          finalAmount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          paymentMethod: 'CARD',
          stripePaymentId: paymentIntent.id,
          paymentIntentId: paymentIntent.id,
          metadata: JSON.stringify(paymentIntent.metadata),
        },
        update: {
          status: 'FAILED',
        },
      });

      // If wallet top-up, mark transaction as failed
      if (type === 'TOP_UP') {
        await prisma.walletTransaction.updateMany({
          where: {
            stripePaymentIntentId: paymentIntent.id,
            status: 'PENDING',
          },
          data: {
            status: 'FAILED',
          },
        });
      }

      // Notify user so they can update their payment method
      await notificationService.notifyPaymentFailed({
        userId,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
      }).catch((err: unknown) => logger.error('Failed to send payment-failed notification:', err));

      logger.info(`Transaction marked as failed for payment ${paymentIntent.id}`);
    } catch (error) {
      logger.error(`Error handling payment failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    logger.info(`Payment canceled: ${paymentIntent.id}`);

    try {
      const existing = await prisma.transaction.findFirst({
        where: { paymentIntentId: paymentIntent.id },
      });

      if (existing) {
        await prisma.transaction.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED' },
        });
      }

      // Mark any pending wallet top-up as failed
      if (paymentIntent.metadata.type === 'TOP_UP') {
        await prisma.walletTransaction.updateMany({
          where: {
            stripePaymentIntentId: paymentIntent.id,
            status: 'PENDING',
          },
          data: { status: 'FAILED' },
        });
      }
    } catch (error) {
      logger.error(`Error handling payment cancel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle refund
   */
  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    logger.info(`Refund processed: ${charge.id}`);

    try {
      // Find original transaction
      const transaction = await prisma.transaction.findFirst({
        where: { stripePaymentId: charge.payment_intent as string },
      });

      if (!transaction) {
        logger.error(`No transaction found for charge ${charge.id}`);
        return;
      }

      const refundAmount = charge.amount_refunded / 100;

      // Create refund transaction
      await prisma.transaction.create({
        data: {
          userId: transaction.userId,
          type: 'REFUND',
          status: 'COMPLETED',
          amount: refundAmount,
          finalAmount: refundAmount,
          currency: charge.currency.toUpperCase(),
          paymentMethod: 'CARD',
          stripePaymentId: charge.id,
          metadata: JSON.stringify({
            originalTransaction: transaction.id,
            chargeId: charge.id,
          }),
          completedAt: new Date(),
        },
      });

      // Credit wallet if this was a wallet top-up
      if (transaction.type === 'WALLET_TOPUP') {
        await walletService.credit({
          userId: transaction.userId,
          amount: refundAmount,
          type: 'REFUND',
          description: `Refund for payment ${charge.payment_intent}`,
          metadata: { chargeId: charge.id },
        });
      }

      logger.info(`Refund transaction created for ${refundAmount} BGN`);
    } catch (error) {
      logger.error(`Error handling refund: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle subscription update
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    logger.info(`Subscription updated: ${subscription.id}`);

    const userId = subscription.metadata.userId;
    if (!userId) {
      logger.error('No userId in subscription metadata');
      return;
    }

    try {
      // Map Stripe status to our status
      const statusMap: Record<string, any> = {
        'active': 'ACTIVE',
        'past_due': 'PAST_DUE',
        'canceled': 'CANCELLED',
        'incomplete': 'INCOMPLETE',
        'incomplete_expired': 'INCOMPLETE_EXPIRED',
        'trialing': 'TRIALING',
        'unpaid': 'UNPAID',
        'paused': 'PAUSED',
      };

      // Determine plan from Stripe price ID, falling back to metadata
      const priceId = subscription.items.data[0]?.price.id;
      let plan: 'LIGHT' | 'BASIC' | 'PREMIUM' = 'LIGHT';

      // Reverse-lookup the plan from the configured Stripe price IDs
      const priceIdToPlan: Record<string, 'LIGHT' | 'BASIC' | 'PREMIUM'> = {};
      const PRICE_IDS = {
        LIGHT: process.env.STRIPE_LIGHT_PRICE_ID || 'price_LIGHT',
        BASIC: process.env.STRIPE_BASIC_PRICE_ID || 'price_BASIC',
        PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_PREMIUM',
      };
      for (const [key, val] of Object.entries(PRICE_IDS)) {
        priceIdToPlan[val] = key as 'LIGHT' | 'BASIC' | 'PREMIUM';
      }

      if (priceId && priceIdToPlan[priceId]) {
        plan = priceIdToPlan[priceId];
      } else if (subscription.metadata.plan) {
        plan = subscription.metadata.plan as any;
      }

      // Update or create subscription
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: subscription.id },
        create: {
          userId,
          plan,
          status: statusMap[subscription.status] || 'ACTIVE',
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          stripeCustomerId: subscription.customer as string,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
        update: {
          plan,
          stripePriceId: priceId,
          status: statusMap[subscription.status] || 'ACTIVE',
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
        },
      });

      // Sync card type when subscription becomes active (handles INCOMPLETE→ACTIVE
      // transitions after payment completes). Without this, users who create an
      // incomplete subscription and pay later keep a LIGHT card indefinitely.
      const mappedStatus = statusMap[subscription.status];
      if (mappedStatus === 'ACTIVE' || mappedStatus === 'TRIALING') {
        const { cardService } = await import('./card.service');
        await cardService.syncCardTypeWithSubscription(userId, plan);
      }

      logger.info(`Subscription updated in database for user ${userId} (plan: ${plan}, status: ${statusMap[subscription.status]})`);
    } catch (error) {
      logger.error(`Error handling subscription update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle subscription deletion
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    logger.info(`Subscription deleted: ${subscription.id}`);

    try {
      const dbSub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (dbSub) {
        await prisma.subscription.update({
          where: { id: dbSub.id },
          data: {
            status: 'CANCELLED',
            canceledAt: new Date(),
          },
        });

        // Check if the user has another active subscription (e.g. they upgraded
        // to a new Stripe subscription before the old one was deleted). Sync card
        // to the surviving plan rather than blindly downgrading to LIGHT.
        const otherActiveSub = await prisma.subscription.findFirst({
          where: {
            userId: dbSub.userId,
            status: { in: ['ACTIVE', 'TRIALING'] },
            id: { not: dbSub.id },
          },
          orderBy: { createdAt: 'desc' },
        });

        const targetPlan = otherActiveSub?.plan ?? 'LIGHT';
        const { cardService } = await import('./card.service');
        await cardService.syncCardTypeWithSubscription(dbSub.userId, targetPlan);

        logger.info(`Subscription ${subscription.id} cancelled for user ${dbSub.userId}, card synced to ${targetPlan}`);
      } else {
        logger.warn(`No DB subscription found for Stripe subscription ${subscription.id}`);
      }
    } catch (error) {
      logger.error(`Error handling subscription deletion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    logger.info(`Invoice paid: ${invoice.id}`);

    try {
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) return; // One-off invoice, handled by payment_intent.succeeded

      // Find the subscription to get the userId
      const dbSub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!dbSub) {
        logger.warn(`No DB subscription for invoice ${invoice.id} (sub: ${subscriptionId})`);
        return;
      }

      // Upsert the invoice payment as a transaction — Stripe may retry the webhook,
      // and a blind create would hit the unique constraint on stripePaymentId.
      const amount = (invoice.amount_paid ?? 0) / 100;
      const invoiceStripePaymentId = (invoice.payment_intent as string) ?? invoice.id;
      await prisma.transaction.upsert({
        where: { stripePaymentId: invoiceStripePaymentId },
        create: {
          userId: dbSub.userId,
          type: 'SUBSCRIPTION' as any,
          status: 'COMPLETED',
          amount,
          finalAmount: amount,
          currency: (invoice.currency ?? 'bgn').toUpperCase(),
          paymentMethod: 'CARD',
          stripePaymentId: invoiceStripePaymentId,
          paymentIntentId: (invoice.payment_intent as string) ?? null,
          metadata: JSON.stringify({
            invoiceId: invoice.id,
            subscriptionId,
            billingReason: invoice.billing_reason,
          }),
          completedAt: new Date(),
        },
        update: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      logger.info(`Invoice payment recorded: ${amount} ${invoice.currency} for user ${dbSub.userId}`);
    } catch (error) {
      logger.error(`Error handling invoice payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    logger.warn(`Invoice payment failed: ${invoice.id}`);

    try {
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) return;

      const dbSub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });

      if (!dbSub) return;

      // Notify user so they can update their payment method
      await notificationService.notifyPaymentFailed({
        userId: dbSub.userId,
        paymentIntentId: invoice.payment_intent as string ?? invoice.id,
        amount: (invoice.amount_due ?? 0) / 100,
        currency: (invoice.currency ?? 'bgn').toUpperCase(),
      }).catch((err: unknown) => logger.error('Failed to send invoice-failed notification:', err));

      logger.info(`User ${dbSub.userId} notified of failed invoice ${invoice.id}`);
    } catch (error) {
      logger.error(`Error handling invoice failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const stripeService = new StripeService();
