/**
 * Stripe Payment Integration
 * Complete implementation for Stripe payment processing
 */

import {
  PaymentAdapter,
  PaymentCredentials,
  PaymentIntent,
  PaymentMethod,
  Subscription,
  Invoice,
  PaymentResult,
  RefundResult,
  WebhookEvent,
} from './PaymentAdapter';
import crypto from 'crypto';

export class StripePayment extends PaymentAdapter {
  private stripe: any; // In production, use: import Stripe from 'stripe'

  protected getBaseUrl(): string {
    return this.credentials.environment === 'production'
      ? 'https://api.stripe.com/v1'
      : 'https://api.stripe.com/v1'; // Stripe uses same URL for both
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.credentials.secretKey}`,
      'Stripe-Version': '2023-10-16',
    };
  }

  async initialize(): Promise<boolean> {
    try {
      // In production: this.stripe = new Stripe(this.credentials.secretKey);
      // For now, we'll use fetch API
      const response = await this.makeRequest('/account');
      return response.id !== undefined;
    } catch (error) {
      console.error('Stripe initialization failed:', error);
      return false;
    }
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    customerId?: string,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent> {
    const response = await this.makeRequest('/payment_intents', 'POST', {
      amount: this.formatAmount(amount, currency),
      currency: currency.toLowerCase(),
      customer: customerId,
      metadata: {
        ...metadata,
        partnerId: this.partnerId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return this.mapPaymentIntent(response);
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult> {
    try {
      const response = await this.makeRequest(
        `/payment_intents/${paymentIntentId}/confirm`,
        'POST',
        {
          payment_method: paymentMethodId,
        }
      );

      return {
        success: response.status === 'succeeded',
        paymentIntentId: response.id,
        metadata: response.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment confirmation failed',
      };
    }
  }

  async createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const response = await this.makeRequest('/customers', 'POST', {
      email,
      name,
      metadata: {
        ...metadata,
        partnerId: this.partnerId,
      },
    });

    return response.id;
  }

  async addPaymentMethod(
    customerId: string,
    paymentMethodData: any
  ): Promise<PaymentMethod> {
    // Create payment method
    const pmResponse = await this.makeRequest('/payment_methods', 'POST', {
      type: 'card',
      card: paymentMethodData.card,
      billing_details: paymentMethodData.billingDetails,
    });

    // Attach to customer
    await this.makeRequest(`/payment_methods/${pmResponse.id}/attach`, 'POST', {
      customer: customerId,
    });

    return this.mapPaymentMethod(pmResponse);
  }

  async getPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
    const response = await this.makeRequest(
      `/payment_methods?customer=${customerId}&type=card`
    );

    return response.data.map((pm: any) => this.mapPaymentMethod(pm));
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<boolean> {
    try {
      await this.makeRequest(`/customers/${customerId}`, 'POST', {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      return true;
    } catch (error) {
      console.error('Error setting default payment method:', error);
      return false;
    }
  }

  async createSubscription(
    customerId: string,
    planId: string,
    trialDays?: number,
    metadata?: Record<string, any>
  ): Promise<Subscription> {
    const subscriptionData: any = {
      customer: customerId,
      items: [{ price: planId }],
      metadata: {
        ...metadata,
        partnerId: this.partnerId,
      },
    };

    if (trialDays) {
      subscriptionData.trial_period_days = trialDays;
    }

    const response = await this.makeRequest('/subscriptions', 'POST', subscriptionData);

    return this.mapSubscription(response);
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<boolean> {
    try {
      await this.makeRequest(`/subscriptions/${subscriptionId}`, 'DELETE', {
        prorate: !immediately,
      });
      return true;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      return false;
    }
  }

  async updateSubscription(
    subscriptionId: string,
    newPlanId: string
  ): Promise<Subscription> {
    const response = await this.makeRequest(`/subscriptions/${subscriptionId}`, 'POST', {
      items: [
        {
          id: subscriptionId,
          price: newPlanId,
        },
      ],
      proration_behavior: 'always_invoice',
    });

    return this.mapSubscription(response);
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const response = await this.makeRequest(`/subscriptions/${subscriptionId}`);
      return this.mapSubscription(response);
    } catch (error) {
      console.error('Error getting subscription:', error);
      return null;
    }
  }

  async createInvoice(
    customerId: string,
    items: Array<{ description: string; amount: number }>,
    metadata?: Record<string, any>
  ): Promise<Invoice> {
    // Create invoice items
    for (const item of items) {
      await this.makeRequest('/invoiceitems', 'POST', {
        customer: customerId,
        amount: this.formatAmount(item.amount, 'BGN'),
        currency: 'bgn',
        description: item.description,
      });
    }

    // Create and finalize invoice
    const response = await this.makeRequest('/invoices', 'POST', {
      customer: customerId,
      auto_advance: true,
      metadata: {
        ...metadata,
        partnerId: this.partnerId,
      },
    });

    return this.mapInvoice(response);
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    try {
      const response = await this.makeRequest(`/invoices/${invoiceId}`);
      return this.mapInvoice(response);
    } catch (error) {
      console.error('Error getting invoice:', error);
      return null;
    }
  }

  async listInvoices(customerId: string, limit: number = 10): Promise<Invoice[]> {
    const response = await this.makeRequest(
      `/invoices?customer=${customerId}&limit=${limit}`
    );

    return response.data.map((inv: any) => this.mapInvoice(inv));
  }

  async refundPayment(
    paymentIntentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult> {
    try {
      const refundData: any = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundData.amount = this.formatAmount(amount, 'BGN');
      }

      if (reason) {
        refundData.reason = reason;
      }

      const response = await this.makeRequest('/refunds', 'POST', refundData);

      return {
        success: response.status === 'succeeded',
        refundId: response.id,
        amount: this.parseAmount(response.amount, 'BGN'),
      };
    } catch (error) {
      return {
        success: false,
        amount: 0,
        error: error instanceof Error ? error.message : 'Refund failed',
      };
    }
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.credentials.secretKey) {
      throw new Error('Webhook secret not configured');
    }

    // Stripe webhook signature verification
    const expectedSignature = crypto
      .createHmac('sha256', this.credentials.secretKey)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    console.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(event.data);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  async getPaymentStatus(paymentIntentId: string): Promise<PaymentIntent['status']> {
    const response = await this.makeRequest(`/payment_intents/${paymentIntentId}`);
    return this.mapStatus(response.status);
  }

  // Private helper methods

  private async handlePaymentSuccess(data: any): Promise<void> {
    console.log('Payment succeeded:', data.id);
    // Implementation would update database
  }

  private async handlePaymentFailed(data: any): Promise<void> {
    console.log('Payment failed:', data.id);
    // Implementation would notify user
  }

  private async handleSubscriptionUpdate(data: any): Promise<void> {
    console.log('Subscription updated:', data.id);
    // Implementation would update database
  }

  private async handleSubscriptionCanceled(data: any): Promise<void> {
    console.log('Subscription canceled:', data.id);
    // Implementation would update database
  }

  private async handleInvoicePaid(data: any): Promise<void> {
    console.log('Invoice paid:', data.id);
    // Implementation would update database
  }

  private async handleInvoicePaymentFailed(data: any): Promise<void> {
    console.log('Invoice payment failed:', data.id);
    // Implementation would notify user
  }

  private mapPaymentIntent(data: any): PaymentIntent {
    return {
      id: data.id,
      amount: this.parseAmount(data.amount, data.currency),
      currency: data.currency.toUpperCase(),
      status: this.mapStatus(data.status),
      customerId: data.customer,
      metadata: data.metadata,
      createdAt: new Date(data.created * 1000),
      updatedAt: new Date(data.created * 1000),
    };
  }

  private mapPaymentMethod(data: any): PaymentMethod {
    return {
      id: data.id,
      type: 'card',
      last4: data.card?.last4,
      brand: data.card?.brand,
      expiryMonth: data.card?.exp_month,
      expiryYear: data.card?.exp_year,
      isDefault: false, // Would be determined by customer default_payment_method
      metadata: data.metadata,
    };
  }

  private mapSubscription(data: any): Subscription {
    return {
      id: data.id,
      customerId: data.customer,
      planId: data.items.data[0]?.price?.id,
      status: data.status,
      currentPeriodStart: new Date(data.current_period_start * 1000),
      currentPeriodEnd: new Date(data.current_period_end * 1000),
      canceledAt: data.canceled_at ? new Date(data.canceled_at * 1000) : undefined,
      trialEnd: data.trial_end ? new Date(data.trial_end * 1000) : undefined,
      amount: this.parseAmount(data.items.data[0]?.price?.unit_amount || 0, 'BGN'),
      currency: 'BGN',
      interval: data.items.data[0]?.price?.recurring?.interval || 'month',
      metadata: data.metadata,
    };
  }

  private mapInvoice(data: any): Invoice {
    return {
      id: data.id,
      subscriptionId: data.subscription,
      customerId: data.customer,
      amount: this.parseAmount(data.total, data.currency),
      currency: data.currency.toUpperCase(),
      status: data.status,
      dueDate: data.due_date ? new Date(data.due_date * 1000) : undefined,
      paidAt: data.status_transitions?.paid_at
        ? new Date(data.status_transitions.paid_at * 1000)
        : undefined,
      invoiceNumber: data.number,
      pdfUrl: data.invoice_pdf,
      hostedInvoiceUrl: data.hosted_invoice_url,
      metadata: data.metadata,
    };
  }

  private mapStatus(status: string): PaymentIntent['status'] {
    const statusMap: Record<string, PaymentIntent['status']> = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'pending',
      'processing': 'processing',
      'succeeded': 'succeeded',
      'canceled': 'canceled',
      'failed': 'failed',
    };

    return statusMap[status] || 'pending';
  }
}
