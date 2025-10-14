/**
 * Webhook Handler
 * Centralized webhook processing for all POS and payment systems
 */

import crypto from 'crypto';
import { POSManager } from '../pos/POSManager';
import { PaymentManager } from '../payments/PaymentManager';

export type WebhookProvider =
  | 'stripe'
  | 'epay'
  | 'barsy'
  | 'poster'
  | 'iiko'
  | 'rkeeper'
  | 'mypos'
  | 'sumup';

export interface WebhookEvent {
  provider: WebhookProvider;
  eventType: string;
  payload: any;
  signature?: string;
  timestamp: Date;
}

export interface WebhookResult {
  success: boolean;
  message?: string;
  error?: string;
  processed: boolean;
}

type WebhookCallback = (event: WebhookEvent) => Promise<void> | void;

export class WebhookHandler {
  private callbacks: Map<WebhookProvider, Set<WebhookCallback>> = new Map();
  private posManager?: POSManager;
  private paymentManager?: PaymentManager;

  constructor(posManager?: POSManager, paymentManager?: PaymentManager) {
    this.posManager = posManager;
    this.paymentManager = paymentManager;
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(
    provider: WebhookProvider,
    payload: any,
    signature?: string
  ): Promise<WebhookResult> {
    try {
      // Verify webhook signature
      const isValid = await this.verifySignature(provider, payload, signature);
      if (!isValid) {
        return {
          success: false,
          processed: false,
          error: 'Invalid webhook signature',
        };
      }

      // Create webhook event
      const event: WebhookEvent = {
        provider,
        eventType: this.extractEventType(provider, payload),
        payload,
        signature,
        timestamp: new Date(),
      };

      // Log webhook
      this.logWebhook(event);

      // Process based on provider
      await this.routeWebhook(event);

      // Notify callbacks
      await this.notifyCallbacks(event);

      return {
        success: true,
        processed: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      console.error(`Webhook processing error for ${provider}:`, error);
      return {
        success: false,
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify webhook signature
   */
  private async verifySignature(
    provider: WebhookProvider,
    payload: any,
    signature?: string
  ): Promise<boolean> {
    if (!signature) {
      // Some providers don't use signatures
      return true;
    }

    try {
      switch (provider) {
        case 'stripe':
          return this.verifyStripeSignature(payload, signature);

        case 'epay':
          return this.verifyEPaySignature(payload, signature);

        case 'barsy':
        case 'poster':
        case 'iiko':
        case 'rkeeper':
        case 'mypos':
        case 'sumup':
          return this.verifyPOSSignature(provider, payload, signature);

        default:
          return true;
      }
    } catch (error) {
      console.error(`Signature verification failed for ${provider}:`, error);
      return false;
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  private verifyStripeSignature(payload: any, signature: string): boolean {
    // Stripe uses HMAC-SHA256
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Verify ePay webhook signature
   */
  private verifyEPaySignature(payload: any, signature: string): boolean {
    // ePay uses MD5 checksum
    const secret = process.env.EPAY_SECRET_KEY || '';

    const sortedKeys = Object.keys(payload).sort();
    const values = sortedKeys.map(key => payload[key]).join('');
    const concatenated = values + secret;

    const md5 = crypto.createHash('md5').update(concatenated, 'utf8').digest('hex');

    return md5.toUpperCase() === signature.toUpperCase();
  }

  /**
   * Verify POS webhook signature
   */
  private verifyPOSSignature(
    provider: WebhookProvider,
    payload: any,
    signature: string
  ): boolean {
    if (!this.posManager) {
      return false;
    }

    const adapter = this.posManager.getAdapter(provider as any);
    if (!adapter) {
      return false;
    }

    return adapter.verifyWebhook(JSON.stringify(payload), signature);
  }

  /**
   * Extract event type from payload
   */
  private extractEventType(provider: WebhookProvider, payload: any): string {
    switch (provider) {
      case 'stripe':
        return payload.type || 'unknown';

      case 'epay':
        return payload.STATUS || 'unknown';

      case 'barsy':
      case 'poster':
        return payload.event || 'unknown';

      case 'iiko':
        return payload.eventType || 'unknown';

      case 'rkeeper':
        return payload.eventType || 'unknown';

      case 'mypos':
        return payload.IPCmethod || 'unknown';

      case 'sumup':
        return payload.event_type || 'unknown';

      default:
        return 'unknown';
    }
  }

  /**
   * Route webhook to appropriate handler
   */
  private async routeWebhook(event: WebhookEvent): Promise<void> {
    switch (event.provider) {
      case 'stripe':
        await this.handleStripeWebhook(event);
        break;

      case 'epay':
        await this.handleEPayWebhook(event);
        break;

      case 'barsy':
      case 'poster':
      case 'iiko':
      case 'rkeeper':
      case 'mypos':
      case 'sumup':
        await this.handlePOSWebhook(event);
        break;
    }
  }

  /**
   * Handle Stripe webhooks
   */
  private async handleStripeWebhook(event: WebhookEvent): Promise<void> {
    const { eventType, payload } = event;

    switch (eventType) {
      case 'payment_intent.succeeded':
        console.log('Stripe payment succeeded:', payload.id);
        // Update transaction status
        break;

      case 'payment_intent.payment_failed':
        console.log('Stripe payment failed:', payload.id);
        // Update transaction status
        break;

      case 'customer.subscription.created':
        console.log('Stripe subscription created:', payload.id);
        // Create subscription record
        break;

      case 'customer.subscription.updated':
        console.log('Stripe subscription updated:', payload.id);
        // Update subscription record
        break;

      case 'customer.subscription.deleted':
        console.log('Stripe subscription deleted:', payload.id);
        // Cancel subscription
        break;

      case 'invoice.paid':
        console.log('Stripe invoice paid:', payload.id);
        // Mark invoice as paid
        break;

      case 'invoice.payment_failed':
        console.log('Stripe invoice payment failed:', payload.id);
        // Handle failed payment
        break;

      default:
        console.log('Unhandled Stripe event:', eventType);
    }
  }

  /**
   * Handle ePay webhooks
   */
  private async handleEPayWebhook(event: WebhookEvent): Promise<void> {
    const { payload } = event;

    switch (payload.STATUS) {
      case 'PAID':
        console.log('ePay payment succeeded:', payload.INVOICE);
        // Update transaction status
        break;

      case 'DENIED':
        console.log('ePay payment denied:', payload.INVOICE);
        // Update transaction status
        break;

      case 'EXPIRED':
        console.log('ePay payment expired:', payload.INVOICE);
        // Handle expired payment
        break;

      default:
        console.log('Unhandled ePay status:', payload.STATUS);
    }
  }

  /**
   * Handle POS webhooks
   */
  private async handlePOSWebhook(event: WebhookEvent): Promise<void> {
    if (!this.posManager) {
      return;
    }

    const adapter = this.posManager.getAdapter(event.provider as any);
    if (!adapter) {
      return;
    }

    await adapter.handleWebhook(event.payload);
  }

  /**
   * Register callback for webhook events
   */
  registerCallback(provider: WebhookProvider, callback: WebhookCallback): () => void {
    if (!this.callbacks.has(provider)) {
      this.callbacks.set(provider, new Set());
    }

    this.callbacks.get(provider)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.callbacks.get(provider);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Notify all callbacks for a provider
   */
  private async notifyCallbacks(event: WebhookEvent): Promise<void> {
    const callbacks = this.callbacks.get(event.provider);
    if (!callbacks) {
      return;
    }

    for (const callback of callbacks) {
      try {
        await callback(event);
      } catch (error) {
        console.error(`Webhook callback error for ${event.provider}:`, error);
      }
    }
  }

  /**
   * Log webhook for debugging
   */
  private logWebhook(event: WebhookEvent): void {
    console.log('Webhook received:', {
      provider: event.provider,
      eventType: event.eventType,
      timestamp: event.timestamp,
    });

    // In production, log to external service (e.g., Datadog, CloudWatch)
    // or database for audit trail
  }

  /**
   * Get webhook URL for a provider
   */
  static getWebhookUrl(provider: WebhookProvider): string {
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://api.boomcard.com';
    return `${baseUrl}/webhooks/${provider}`;
  }

  /**
   * Express middleware for handling webhooks
   */
  static expressMiddleware(handler: WebhookHandler) {
    return async (req: any, res: any) => {
      try {
        const provider = req.params.provider as WebhookProvider;
        const signature = req.headers['x-signature'] || req.headers['stripe-signature'];

        const result = await handler.processWebhook(provider, req.body, signature);

        if (result.success) {
          res.status(200).json({ success: true, message: result.message });
        } else {
          res.status(400).json({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('Webhook middleware error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    };
  }
}

export default WebhookHandler;
