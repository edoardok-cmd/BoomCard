import Stripe from 'stripe';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';

/**
 * Stripe Service for Payment Processing
 * Handles all Stripe operations: Payment Intents, Customers, Cards, Webhooks
 */
class StripeService {
  private stripe: Stripe;

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
    // TODO: Update transaction status in database
    logger.info(`Payment succeeded: ${paymentIntent.id} - ${paymentIntent.amount / 100} ${paymentIntent.currency}`);
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // TODO: Update transaction status, notify user
    logger.warn(`Payment failed: ${paymentIntent.id}`);
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // TODO: Update transaction status
    logger.info(`Payment canceled: ${paymentIntent.id}`);
  }

  /**
   * Handle refund
   */
  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    // TODO: Update transaction status, credit wallet
    logger.info(`Refund processed: ${charge.id}`);
  }

  /**
   * Handle subscription update
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    // TODO: Update subscription in database
    logger.info(`Subscription updated: ${subscription.id} - ${subscription.status}`);
  }

  /**
   * Handle subscription deletion
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    // TODO: Mark subscription as canceled in database
    logger.info(`Subscription deleted: ${subscription.id}`);
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // TODO: Record invoice payment in database
    logger.info(`Invoice paid: ${invoice.id}`);
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // TODO: Notify user of failed payment
    logger.warn(`Invoice payment failed: ${invoice.id}`);
  }
}

export const stripeService = new StripeService();
