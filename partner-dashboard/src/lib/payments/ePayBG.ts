/**
 * ePay.bg Payment Integration
 * Bulgarian payment gateway integration
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

export class ePayBG extends PaymentAdapter {
  protected getBaseUrl(): string {
    return this.credentials.environment === 'production'
      ? 'https://www.epay.bg'
      : 'https://demo.epay.bg';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }

  async initialize(): Promise<boolean> {
    try {
      // ePay doesn't have an initialization endpoint
      // Just verify credentials exist
      return !!(this.credentials.merchantId && this.credentials.secretKey);
    } catch (error) {
      console.error('ePay initialization failed:', error);
      return false;
    }
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    customerId?: string,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent> {
    // ePay uses a different flow - generate payment URL
    const invoice = `INV-${Date.now()}`;
    const description = metadata?.description || 'BoomCard Payment';

    const paymentData = {
      MIN: this.credentials.merchantId,
      INVOICE: invoice,
      AMOUNT: amount.toFixed(2),
      CURRENCY: currency,
      DESCR: description,
      ENCODING: 'UTF-8',
    };

    const checksum = this.generateChecksum(paymentData);

    const intent: PaymentIntent = {
      id: invoice,
      amount,
      currency,
      status: 'pending',
      customerId,
      metadata: {
        ...metadata,
        checksum,
        paymentUrl: `${this.baseUrl}/ezp/reg_bill.cgi`,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return intent;
  }

  async confirmPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult> {
    // ePay confirmation happens via redirect/webhook
    // This method would check payment status
    try {
      const status = await this.checkPaymentStatus(paymentIntentId);

      return {
        success: status === 'succeeded',
        paymentIntentId,
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
    // ePay doesn't have customer objects
    // Generate a unique customer ID
    return `cust_${crypto.randomBytes(12).toString('hex')}`;
  }

  async addPaymentMethod(
    customerId: string,
    paymentMethodData: any
  ): Promise<PaymentMethod> {
    // ePay doesn't store payment methods
    // Return a placeholder
    return {
      id: `pm_${crypto.randomBytes(12).toString('hex')}`,
      type: 'card',
      isDefault: true,
    };
  }

  async getPaymentMethods(customerId: string): Promise<PaymentMethod[]> {
    // ePay doesn't store payment methods
    return [];
  }

  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<boolean> {
    // Not supported by ePay
    return true;
  }

  async createSubscription(
    customerId: string,
    planId: string,
    trialDays?: number,
    metadata?: Record<string, any>
  ): Promise<Subscription> {
    // ePay doesn't natively support subscriptions
    // This would be handled by creating recurring payment intents
    const subscription: Subscription = {
      id: `sub_${crypto.randomBytes(12).toString('hex')}`,
      customerId,
      planId,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      amount: 0, // Would be set based on plan
      currency: 'BGN',
      interval: 'month',
      metadata,
    };

    return subscription;
  }

  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<boolean> {
    // Implementation would update subscription status in database
    return true;
  }

  async updateSubscription(
    subscriptionId: string,
    newPlanId: string
  ): Promise<Subscription> {
    // Implementation would update subscription in database
    const subscription = await this.getSubscription(subscriptionId);
    if (subscription) {
      subscription.planId = newPlanId;
      return subscription;
    }

    throw new Error('Subscription not found');
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    // Implementation would fetch from database
    return null;
  }

  async createInvoice(
    customerId: string,
    items: Array<{ description: string; amount: number }>,
    metadata?: Record<string, any>
  ): Promise<Invoice> {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const invoiceNumber = `INV-${Date.now()}`;

    const invoice: Invoice = {
      id: `inv_${crypto.randomBytes(12).toString('hex')}`,
      customerId,
      amount: totalAmount,
      currency: 'BGN',
      status: 'open',
      invoiceNumber,
      metadata,
    };

    return invoice;
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    // Implementation would fetch from database
    return null;
  }

  async listInvoices(customerId: string, limit: number = 10): Promise<Invoice[]> {
    // Implementation would fetch from database
    return [];
  }

  async refundPayment(
    paymentIntentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult> {
    try {
      // ePay refund process
      const refundData = {
        MIN: this.credentials.merchantId,
        INVOICE: paymentIntentId,
        AMOUNT: amount ? amount.toFixed(2) : undefined,
      };

      const checksum = this.generateChecksum(refundData);

      // Make refund request
      const response = await fetch(`${this.baseUrl}/api/refund`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: this.encodeFormData({ ...refundData, CHECKSUM: checksum }),
      });

      const result = await response.text();

      return {
        success: result.includes('OK'),
        refundId: paymentIntentId,
        amount: amount || 0,
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
      throw new Error('Secret key not configured');
    }

    // Parse ePay notification
    const params = new URLSearchParams(payload);
    const checksum = params.get('CHECKSUM');

    if (!checksum) {
      return false;
    }

    // Recreate checksum
    const data: any = {};
    for (const [key, value] of params.entries()) {
      if (key !== 'CHECKSUM') {
        data[key] = value;
      }
    }

    const expectedChecksum = this.generateChecksum(data);

    return checksum === expectedChecksum;
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    console.log(`ePay webhook received: ${event.type}`);

    const data = event.data;

    if (data.STATUS === 'PAID') {
      await this.handlePaymentSuccess(data);
    } else if (data.STATUS === 'DENIED') {
      await this.handlePaymentFailed(data);
    } else if (data.STATUS === 'EXPIRED') {
      await this.handlePaymentExpired(data);
    }
  }

  async getPaymentStatus(paymentIntentId: string): Promise<PaymentIntent['status']> {
    return await this.checkPaymentStatus(paymentIntentId);
  }

  // Private helper methods

  private async checkPaymentStatus(invoiceId: string): Promise<PaymentIntent['status']> {
    try {
      // ePay status check
      const data = {
        MIN: this.credentials.merchantId,
        INVOICE: invoiceId,
      };

      const checksum = this.generateChecksum(data);

      const response = await fetch(`${this.baseUrl}/api/status`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: this.encodeFormData({ ...data, CHECKSUM: checksum }),
      });

      const result = await response.text();

      if (result.includes('PAID')) return 'succeeded';
      if (result.includes('DENIED')) return 'failed';
      if (result.includes('EXPIRED')) return 'canceled';

      return 'pending';
    } catch (error) {
      console.error('Error checking payment status:', error);
      return 'pending';
    }
  }

  private generateChecksum(data: Record<string, any>): string {
    // ePay checksum algorithm
    const sortedKeys = Object.keys(data).sort();
    const values = sortedKeys
      .map(key => data[key])
      .filter(value => value !== undefined && value !== null);

    const concatenated = values.join('') + this.credentials.secretKey;

    return crypto
      .createHash('md5')
      .update(concatenated, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  private encodeFormData(data: Record<string, any>): string {
    return Object.keys(data)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
      .join('&');
  }

  private async handlePaymentSuccess(data: any): Promise<void> {
    console.log('ePay payment succeeded:', data.INVOICE);
    // Implementation would update database
  }

  private async handlePaymentFailed(data: any): Promise<void> {
    console.log('ePay payment failed:', data.INVOICE);
    // Implementation would notify user
  }

  private async handlePaymentExpired(data: any): Promise<void> {
    console.log('ePay payment expired:', data.INVOICE);
    // Implementation would update database
  }
}
