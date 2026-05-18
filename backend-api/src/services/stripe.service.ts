import Stripe from 'stripe';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { walletService } from './wallet.service';
import { notificationService } from './notification.service';
import { emailService } from './email.service';

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
   *
   * Spec §4.2 — single-attempt enforcement:
   * We do NOT disable Stripe smart retries at the API level here (e.g. via
   * `payment_settings.payment_method_options` or a separate smart-retry toggle)
   * because Stripe's retry window is controlled at the account level and
   * overriding per-subscription is unreliable across Stripe API versions.
   * Instead, the webhook handler (handleInvoicePaymentFailed) enforces the
   * single-attempt policy: the very first `invoice.payment_failed` event sets
   * the subscription to FAILED_PAYMENT and increments `retryAttempt`; any
   * subsequent retry events are ignored via the `retryAttempt > 0` guard.
   * If a retry eventually succeeds, handlePaymentSucceeded resets the counter.
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

        case 'charge.dispute.created':
        case 'charge.dispute.updated':
        case 'charge.dispute.closed':
          // Stripe chargebacks need a human response within ~7 days. The
          // handler posts to admin-ops (in-app + critical email).
          await this.handleChargebackDispute(event.data.object as Stripe.Dispute, event.type);
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

        case 'invoice.upcoming':
          await this.handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
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

    // Map metadata type to the TransactionType enum. Metadata stores 'TOP_UP'
    // but the enum value is 'WALLET_TOPUP'.
    const isTopUp = type === 'TOP_UP';
    const txType = isTopUp ? 'WALLET_TOPUP' : (type || 'PURCHASE');

    try {
      // Upsert transaction — atomic on the unique stripePaymentId to eliminate the
      // TOCTOU race between findFirst and create when Stripe retries the webhook.
      await prisma.transaction.upsert({
        where: { stripePaymentId: paymentIntent.id },
        create: {
          userId,
          type: txType as any,
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
      // Idempotency: use a Serializable transaction so two concurrent webhook
      // deliveries can't both pass the findFirst check and double-credit.
      if (isTopUp) {
        await prisma.$transaction(async (tx) => {
          const alreadyCredited = await tx.walletTransaction.findFirst({
            where: {
              stripePaymentIntentId: paymentIntent.id,
              type: 'TOP_UP',
              status: 'COMPLETED',
            },
          });

          if (alreadyCredited) {
            logger.info(`Wallet already credited for payment ${paymentIntent.id} — skipping (idempotent)`);
            return;
          }

          const amount = paymentIntent.amount / 100;

          // Credit creates a COMPLETED walletTransaction inside its own
          // nested transaction — safe because Prisma flattens nested calls.
          await walletService.credit({
            userId,
            amount,
            type: 'TOP_UP',
            description: 'Wallet top-up via card payment',
            stripePaymentIntentId: paymentIntent.id,
            metadata: { paymentIntent: paymentIntent.id },
          });

          // Update any pre-existing PENDING wallet transactions to COMPLETED
          await tx.walletTransaction.updateMany({
            where: {
              stripePaymentIntentId: paymentIntent.id,
              status: 'PENDING',
            },
            data: {
              status: 'COMPLETED',
            },
          });

          logger.info(`Credited ${amount} BGN to wallet for user ${userId}`);
        }, { isolationLevel: 'Serializable' });
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
      // Use the unique stripePaymentId for a direct lookup (consistent with the
      // upsert pattern in handlePaymentSucceeded / handlePaymentFailed).
      const existing = await prisma.transaction.findUnique({
        where: { stripePaymentId: paymentIntent.id },
      });

      if (existing) {
        await prisma.transaction.update({
          where: { stripePaymentId: paymentIntent.id },
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
   * Handle Stripe dispute (chargeback) — posts to the admin-ops channel so
   * someone can respond via the Stripe dashboard within the 7-day window.
   * Fires for 'created', 'updated', and 'closed' so every dispute-state
   * transition is visible; 'created' is urgent, later states are info-level.
   */
  private async handleChargebackDispute(dispute: Stripe.Dispute, eventType: string): Promise<void> {
    logger.warn(`Stripe dispute ${eventType}: ${dispute.id} (status: ${dispute.status}, charge: ${dispute.charge})`);

    try {
      if (eventType === 'charge.dispute.created') {
        await notificationService.notifyAdminChargeback({
          chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id,
          disputeId: dispute.id,
          amountCents: dispute.amount,
          currency: dispute.currency,
          reason: dispute.reason,
        });
      } else {
        // Status-change variants use ops channel directly so admins see the
        // dispute progressing (won, lost, needs_response) without another
        // dedicated wrapper.
        await notificationService.notifyAdminOps({
          opsType: 'stripe_chargeback_update',
          title: `Chargeback ${dispute.status}`,
          message: `Dispute ${dispute.id} is now ${dispute.status}.`,
          severity: dispute.status === 'lost' ? 'warning' : 'info',
          fields: [
            { label: 'Dispute', value: dispute.id },
            { label: 'Status', value: dispute.status },
            { label: 'Reason', value: dispute.reason ?? 'unknown' },
          ],
          actionUrl: `https://dashboard.stripe.com/disputes/${dispute.id}`,
        });
      }
    } catch (err) {
      logger.error('Failed to post chargeback admin-ops notification:', err);
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

      // Use the latest refund ID as the unique key so partial refunds each
      // get their own transaction, and webhook retries are idempotent.
      const latestRefund = charge.refunds?.data?.[0];
      const refundKey = latestRefund?.id ?? `refund_${charge.id}`;
      const refundAmount = latestRefund
        ? latestRefund.amount / 100
        : charge.amount_refunded / 100;

      // Upsert — Stripe may deliver the same charge.refunded event more than
      // once. Without upsert, retries would hit the unique stripePaymentId
      // constraint and throw, leaving the wallet credit below un-guarded.
      await prisma.transaction.upsert({
        where: { stripePaymentId: refundKey },
        create: {
          userId: transaction.userId,
          type: 'REFUND',
          status: 'COMPLETED',
          amount: refundAmount,
          finalAmount: refundAmount,
          currency: charge.currency.toUpperCase(),
          paymentMethod: 'CARD',
          stripePaymentId: refundKey,
          metadata: JSON.stringify({
            originalTransaction: transaction.id,
            chargeId: charge.id,
            refundId: latestRefund?.id,
          }),
          completedAt: new Date(),
        },
        update: {
          status: 'COMPLETED',
          amount: refundAmount,
          finalAmount: refundAmount,
          completedAt: new Date(),
        },
      });

      // Credit wallet if the original payment was a wallet top-up.
      // Idempotency: wrap in Serializable transaction (same pattern as TOP_UP).
      if (transaction.type === 'WALLET_TOPUP') {
        await prisma.$transaction(async (tx) => {
          const alreadyRefunded = await tx.walletTransaction.findFirst({
            where: {
              description: { contains: refundKey },
              type: 'REFUND',
              status: 'COMPLETED',
            },
          });
          if (alreadyRefunded) {
            logger.info(`Wallet refund already processed for ${refundKey} — skipping`);
            return;
          }
          await walletService.credit({
            userId: transaction.userId,
            amount: refundAmount,
            type: 'REFUND',
            description: `Refund ${refundKey} for payment ${charge.payment_intent}`,
            metadata: { chargeId: charge.id, refundId: latestRefund?.id },
          });
        }, { isolationLevel: 'Serializable' });
      }

      logger.info(`Refund transaction created for ${refundAmount} BGN (${refundKey})`);
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

    // Pure computation — no DB access, cannot throw. Hoisted outside the
    // swallow-all try/catch so mappedStatus is visible to the trialRefundEligibleUntil
    // stamp below, which must run outside that catch to allow Stripe retries.
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

    const mappedStatus = (() => {
      const s = statusMap[subscription.status];
      if (!s) {
        logger.warn(`Unknown Stripe subscription status "${subscription.status}" for sub ${subscription.id} — defaulting to INCOMPLETE`);
        return 'INCOMPLETE';
      }
      return s;
    })();

    try {
      // Determine plan from Stripe price ID, falling back to metadata
      const priceId = subscription.items.data[0]?.price.id;
      let plan: 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM' = 'PREMIUM_WEEKLY';

      // Reverse-lookup the plan from the configured Stripe price IDs
      const priceIdToPlan: Record<string, 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM'> = {};
      const PRICE_IDS = {
        // Env var kept as STRIPE_LIGHT_PRICE_ID for backward compat with existing deployments.
        PREMIUM_WEEKLY: process.env.STRIPE_PREMIUM_WEEKLY_PRICE_ID || process.env.STRIPE_LIGHT_PRICE_ID || 'price_PREMIUM_WEEKLY',
        BASIC: process.env.STRIPE_BASIC_PRICE_ID || 'price_BASIC',
        PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_PREMIUM',
      };
      for (const [key, val] of Object.entries(PRICE_IDS)) {
        priceIdToPlan[val] = key as 'PREMIUM_WEEKLY' | 'BASIC' | 'PREMIUM';
      }

      if (priceId && priceIdToPlan[priceId]) {
        plan = priceIdToPlan[priceId];
      } else if (subscription.metadata.plan) {
        plan = subscription.metadata.plan as any;
      }

      // Don't downgrade FAILED_PAYMENT → PAST_DUE: spec §4.2 single attempt, no retry.
      // invoice.payment_failed immediately sets FAILED_PAYMENT; Stripe then fires
      // customer.subscription.updated with status=past_due. We preserve the stricter state.
      const existingForStatusCheck = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
        select: { status: true },
      });
      const effectiveStatus =
        mappedStatus === 'PAST_DUE' && existingForStatusCheck?.status === 'FAILED_PAYMENT'
          ? 'FAILED_PAYMENT'
          : mappedStatus;

      // Update or create subscription
      await prisma.subscription.upsert({
        where: { stripeSubscriptionId: subscription.id },
        create: {
          userId,
          plan,
          status: mappedStatus,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          stripeCustomerId: subscription.customer as string,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          autoRenewal: !subscription.cancel_at_period_end,
          cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
          trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
          trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        },
        update: {
          plan,
          stripePriceId: priceId,
          status: effectiveStatus,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          // Spec §4.2: autoRenewal is a user/admin preference (set by the
          // /auto-renewal toggle), NOT derived from Stripe state. Re-deriving
          // it here would silently overwrite the admin's choice on every
          // unrelated webhook (price update, trial-end, invoice paid, …).
          // The "effective" renewal state is computed in the UI from
          // (autoRenewal && !cancelAtPeriodEnd).
          cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
          // Spec §8.3 v1.1 — reset auto-renew-OFF reminder bitmask. This
          // upsert.update path always rewrites currentPeriodEnd from the
          // webhook payload; on a real renewal the bitmask should clear. On
          // non-renewal updates (plan change, cancelAtPeriodEnd toggle) Stripe
          // typically carries the same period anyway, so the only side-effect
          // is potentially re-permitting an early reminder if a sub flipped
          // autoRenewal mid-period — acceptable for §8.3 v1.1.
          renewalRemindersSent: 0,
        },
      });

      // Sync card type when subscription becomes active (handles INCOMPLETE→ACTIVE
      // transitions after payment completes). Without this, users who create an
      // incomplete subscription and pay later keep a PREMIUM_WEEKLY card indefinitely.
      if (mappedStatus === 'ACTIVE' || mappedStatus === 'TRIALING') {
        const { cardService } = await import('./card.service');
        await cardService.syncCardTypeWithSubscription(userId, plan);

        // Spec §4.2 v1.1 — recovery: clear any prior FAILED_PAYMENT subs so the
        // scan/payout gates stop firing on them. The current sub is excluded so
        // a sub that itself recovered from FAILED_PAYMENT (re-activated by the
        // user) is not double-marked.
        try {
          const { clearFailedPaymentSubsForUser } = await import('./subscription.service');
          const dbSub = await prisma.subscription.findUnique({
            where: { stripeSubscriptionId: subscription.id },
            select: { id: true },
          });
          await clearFailedPaymentSubsForUser(userId, dbSub?.id ?? null, null);
        } catch (clearErr) {
          logger.error(`[stripe-webhook] FAILED_PAYMENT cleanup failed for user ${userId}:`, clearErr);
        }
      }

      logger.info(`Subscription updated in database for user ${userId} (plan: ${plan}, status: ${statusMap[subscription.status]})`);
    } catch (error) {
      logger.error(`Error handling subscription update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Stamp the 24-hour trial refund window at payment confirmation (INCOMPLETE→ACTIVE).
    // This runs OUTSIDE the swallow-all catch above: if the DB update fails here,
    // the error propagates to handleWebhookEvent which rethrows → the webhook route
    // returns 500 → Stripe retries the event rather than silently losing the window.
    // The null filter makes this a no-op on renewals and plan upgrades (window already set).
    if (mappedStatus === 'ACTIVE') {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id, trialRefundEligibleUntil: null },
        data: { trialRefundEligibleUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
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
        // Spec §4.2: distinguish natural billing-period lapse (EXPIRED) from
        // user-initiated cancel (CANCELLED). Stripe doesn't tell us *why* the
        // subscription was deleted on this event, so we infer:
        //   - retry exhaustion / past_due: Stripe gave up after final retry → EXPIRED
        //   - cancellation_details.reason === 'payment_failed': same → EXPIRED
        //   - everything else (user click, admin /cancel, plan migration): CANCELLED
        const reason = subscription.cancellation_details?.reason;
        const wasPaymentFailure =
          dbSub.status === 'PAST_DUE' ||
          dbSub.status === 'FAILED_PAYMENT' ||
          dbSub.retryAttempt > 0 ||
          reason === 'payment_failed';
        const finalStatus = wasPaymentFailure ? 'EXPIRED' : 'CANCELLED';

        await prisma.subscription.update({
          where: { id: dbSub.id },
          data: {
            status: finalStatus,
            // Preserve any explicit cancellation timestamp; only stamp one for
            // user-initiated cancels so the EXPIRED-vs-CANCELLED discriminator
            // (canceledAt presence) stays consistent with the Paysera path.
            canceledAt: finalStatus === 'CANCELLED'
              ? (dbSub.canceledAt ?? new Date())
              : dbSub.canceledAt,
            pauseEndsAt: null,
            retryAttempt: 0,
          },
        });

        // Check if the user has another active subscription (e.g. they upgraded
        // to a new Stripe subscription before the old one was deleted). Sync card
        // to the surviving plan rather than blindly downgrading to PREMIUM_WEEKLY.
        const otherActiveSub = await prisma.subscription.findFirst({
          where: {
            userId: dbSub.userId,
            status: { in: ['ACTIVE', 'TRIALING'] },
            id: { not: dbSub.id },
          },
          orderBy: { createdAt: 'desc' },
        });

        const targetPlan = otherActiveSub?.plan ?? 'PREMIUM_WEEKLY';
        const { cardService } = await import('./card.service');
        await cardService.syncCardTypeWithSubscription(dbSub.userId, targetPlan);

        if (wasPaymentFailure) {
          const planName = dbSub.plan;
          await notificationService.notifySubscriptionAccessEnded({ userId: dbSub.userId, planName })
            .catch((err: unknown) => logger.error('Failed to send access-ended notification:', err));
        }

        logger.info(`Subscription ${subscription.id} ${finalStatus.toLowerCase()} for user ${dbSub.userId}, card synced to ${targetPlan} (payment failure: ${wasPaymentFailure})`);
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
        include: { user: { select: { email: true, firstName: true, preferredLanguage: true } } },
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

      // Spec §3.1: send renewal confirmation email for recurring payments
      if (invoice.billing_reason === 'subscription_cycle' && dbSub.user?.email) {
        const lang = (dbSub.user.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
        emailService
          .sendPaymentConfirmation(
            dbSub.user.email,
            {
              customerName: dbSub.user.firstName || 'Customer',
              orderId: invoiceStripePaymentId,
              amount,
              currency: (invoice.currency ?? 'bgn').toUpperCase(),
              date: new Date(),
            },
            lang,
          )
          .catch((err: unknown) => logger.error(`Failed to send renewal confirmation email for sub ${dbSub.id}:`, err));
      }

      // If this payment clears a previously failed renewal, recover to ACTIVE
      if (dbSub.retryAttempt > 0 || dbSub.status === 'PAST_DUE' || dbSub.status === 'FAILED_PAYMENT') {
        await prisma.subscription.update({
          where: { id: dbSub.id },
          data: {
            status: 'ACTIVE',
            retryAttempt: 0,
            failedPaymentAt: null,
            pauseEndsAt: null,
            currentPeriodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : undefined,
            currentPeriodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
            // Spec §8.3 v1.1 — new period → fresh reminder cadence.
            renewalRemindersSent: 0,
          },
        });
        logger.info(`Subscription ${dbSub.id} recovered from ${dbSub.status} — payment cleared`);
      }

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

      // Spec §3.2: stop payment notifications if user manually cancelled
      if (dbSub.cancelAtPeriodEnd || !dbSub.autoRenewal) {
        logger.info(`Subscription ${dbSub.id} is manually cancelled — skipping PAST_DUE update and notification`);
        return;
      }

      // Spec §4.2 v1.1: single attempt, no retry window. Set FAILED_PAYMENT immediately
      // so scanning and payout are blocked. If Stripe's own retry later succeeds,
      // handleInvoicePaymentSucceeded will recover the subscription to ACTIVE.
      const failedAt = new Date();
      await prisma.subscription.update({
        where: { id: dbSub.id },
        data: {
          status: 'FAILED_PAYMENT',
          failedPaymentAt: failedAt,
          retryAttempt: dbSub.retryAttempt + 1,
        },
      });

      await notificationService.notifyPaymentFailed({
        userId: dbSub.userId,
        paymentIntentId: invoice.payment_intent as string ?? invoice.id,
        amount: (invoice.amount_due ?? 0) / 100,
        currency: (invoice.currency ?? 'bgn').toUpperCase(),
      }).catch((err: unknown) => logger.error('Failed to send invoice-failed notification:', err));

      logger.info(`Subscription ${dbSub.id} → FAILED_PAYMENT (spec §4.2, no retry window) for user ${dbSub.userId}`);
    } catch (error) {
      logger.error(`Error handling invoice failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle upcoming invoice — fires ~7 days before renewal.
   * Sends a renewal reminder notification to the subscriber.
   */
  private async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    logger.info(`Upcoming invoice: ${invoice.id}`);

    try {
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) return;

      const dbSub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        include: {
          planDetails: { select: { displayName: true, displayNameBg: true, priceMonthlyEur: true } },
          user: { select: { email: true, firstName: true, preferredLanguage: true } },
        },
      });

      if (!dbSub) return;

      // Spec §3.1: don't send reminders when auto-renewal is ON (payment happens automatically)
      if (dbSub.autoRenewal) return;

      const lang = (dbSub.user?.preferredLanguage === 'en' ? 'en' : 'bg') as 'bg' | 'en';
      const planName = lang === 'bg'
        ? (dbSub.planDetails?.displayNameBg ?? dbSub.planDetails?.displayName ?? dbSub.plan)
        : (dbSub.planDetails?.displayName ?? dbSub.plan);
      const amountDue = (invoice.amount_due ?? 0) / 100;
      const currency = (invoice.currency ?? 'eur').toUpperCase();
      const price = `${amountDue.toFixed(2)} ${currency}`;
      const renewalDate = new Date((invoice.period_end ?? 0) * 1000);

      await notificationService.notifyPartnerRenewalUpcoming({
        userId: dbSub.userId,
        planName,
        renewalDate,
        price,
      });

      if (dbSub.user?.email) {
        emailService
          .sendExpiryNotice(dbSub.user.email, {
            customerName: dbSub.user.firstName || 'Customer',
            planName,
            planNameBg: dbSub.planDetails?.displayNameBg ?? planName,
            price,
            renewalDate: renewalDate.toLocaleDateString(lang === 'bg' ? 'bg-BG' : 'en-GB'),
            manageUrl: `${process.env.APP_URL || 'https://mobile.boomcard.bg'}/subscription`,
            language: lang,
          })
          .catch((err: unknown) => logger.error(`Failed to send renewal reminder email for sub ${dbSub.id}:`, err));
      }

      logger.info(`Renewal reminder sent to user ${dbSub.userId} for ${planName} renewing ${renewalDate.toISOString()}`);
    } catch (error) {
      logger.error(`Error handling upcoming invoice: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const stripeService = new StripeService();
