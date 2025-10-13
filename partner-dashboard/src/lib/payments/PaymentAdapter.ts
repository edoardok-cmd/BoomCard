/**
 * Base Payment Adapter Interface
 * All payment gateways must implement this interface
 */

export interface PaymentCredentials {
  apiKey?: string;
  secretKey?: string;
  publishableKey?: string;
  merchantId?: string;
  clientId?: string;
  environment?: 'production' | 'sandbox' | 'test';
  [key: string]: string | undefined;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'wallet' | 'cash';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  metadata?: Record<string, any>;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  customerId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt?: Date;
  trialEnd?: Date;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
  metadata?: Record<string, any>;
}

export interface Invoice {
  id: string;
  subscriptionId?: string;
  customerId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  dueDate?: Date;
  paidAt?: Date;
  invoiceNumber: string;
  pdfUrl?: string;
  hostedInvoiceUrl?: string;
  metadata?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount: number;
  error?: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  createdAt: Date;
}

export abstract class PaymentAdapter {
  protected credentials: PaymentCredentials;
  protected partnerId: string;
  protected baseUrl: string;

  constructor(credentials: PaymentCredentials, partnerId: string) {
    this.credentials = credentials;
    this.partnerId = partnerId;
    this.baseUrl = this.getBaseUrl();
  }

  /**
   * Get the base URL for the payment gateway API
   */
  protected abstract getBaseUrl(): string;

  /**
   * Initialize payment gateway connection
   */
  abstract initialize(): Promise<boolean>;

  /**
   * Create a payment intent
   */
  abstract createPaymentIntent(
    amount: number,
    currency: string,
    customerId?: string,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent>;

  /**
   * Confirm a payment
   */
  abstract confirmPayment(
    paymentIntentId: string,
    paymentMethodId: string
  ): Promise<PaymentResult>;

  /**
   * Create a customer
   */
  abstract createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, any>
  ): Promise<string>;

  /**
   * Add payment method to customer
   */
  abstract addPaymentMethod(
    customerId: string,
    paymentMethodData: any
  ): Promise<PaymentMethod>;

  /**
   * Get customer payment methods
   */
  abstract getPaymentMethods(customerId: string): Promise<PaymentMethod[]>;

  /**
   * Set default payment method
   */
  abstract setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<boolean>;

  /**
   * Create a subscription
   */
  abstract createSubscription(
    customerId: string,
    planId: string,
    trialDays?: number,
    metadata?: Record<string, any>
  ): Promise<Subscription>;

  /**
   * Cancel a subscription
   */
  abstract cancelSubscription(
    subscriptionId: string,
    immediately?: boolean
  ): Promise<boolean>;

  /**
   * Update subscription
   */
  abstract updateSubscription(
    subscriptionId: string,
    newPlanId: string
  ): Promise<Subscription>;

  /**
   * Get subscription details
   */
  abstract getSubscription(subscriptionId: string): Promise<Subscription | null>;

  /**
   * Create an invoice
   */
  abstract createInvoice(
    customerId: string,
    items: Array<{ description: string; amount: number }>,
    metadata?: Record<string, any>
  ): Promise<Invoice>;

  /**
   * Get invoice
   */
  abstract getInvoice(invoiceId: string): Promise<Invoice | null>;

  /**
   * List invoices for customer
   */
  abstract listInvoices(customerId: string, limit?: number): Promise<Invoice[]>;

  /**
   * Refund a payment
   */
  abstract refundPayment(
    paymentIntentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult>;

  /**
   * Verify webhook signature
   */
  abstract verifyWebhook(payload: string, signature: string): boolean;

  /**
   * Handle webhook event
   */
  abstract handleWebhook(event: WebhookEvent): Promise<void>;

  /**
   * Get payment intent status
   */
  abstract getPaymentStatus(paymentIntentId: string): Promise<PaymentIntent['status']>;

  /**
   * Make authenticated API request
   */
  protected async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.getAuthHeaders();

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Payment API Error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get authentication headers
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Format amount to smallest currency unit (e.g., cents)
   */
  protected formatAmount(amount: number, currency: string): number {
    // Most currencies use 2 decimal places (cents)
    // Some currencies like JPY use 0 decimal places
    const zeroCurrencies = ['JPY', 'KRW', 'VND'];

    if (zeroCurrencies.includes(currency.toUpperCase())) {
      return Math.round(amount);
    }

    return Math.round(amount * 100);
  }

  /**
   * Parse amount from smallest currency unit
   */
  protected parseAmount(amount: number, currency: string): number {
    const zeroCurrencies = ['JPY', 'KRW', 'VND'];

    if (zeroCurrencies.includes(currency.toUpperCase())) {
      return amount;
    }

    return amount / 100;
  }
}
