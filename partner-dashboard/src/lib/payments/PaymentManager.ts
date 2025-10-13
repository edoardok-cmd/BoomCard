/**
 * Payment Manager
 * Manages multiple payment gateways and orchestrates payment operations
 */

import { PaymentAdapter, PaymentCredentials, PaymentIntent, PaymentResult, Subscription, Invoice } from './PaymentAdapter';
import { StripePayment } from './StripePayment';
import { ePayBG } from './ePayBG';

export type PaymentProvider = 'stripe' | 'paypal' | 'epay' | 'borica';

export interface PaymentConfig {
  provider: PaymentProvider;
  credentials: PaymentCredentials;
  enabled: boolean;
  isDefault?: boolean;
}

export interface PaymentManagerOptions {
  partnerId: string;
  configs: PaymentConfig[];
}

export class PaymentManager {
  private adapters: Map<PaymentProvider, PaymentAdapter>;
  private defaultProvider: PaymentProvider;
  private partnerId: string;

  constructor(options: PaymentManagerOptions) {
    this.partnerId = options.partnerId;
    this.adapters = new Map();
    this.defaultProvider = 'stripe'; // Default

    // Initialize all configured providers
    this.initializeProviders(options.configs);
  }

  /**
   * Initialize payment providers
   */
  private async initializeProviders(configs: PaymentConfig[]): Promise<void> {
    for (const config of configs) {
      if (!config.enabled) continue;

      try {
        const adapter = this.createAdapter(config.provider, config.credentials);
        const initialized = await adapter.initialize();

        if (initialized) {
          this.adapters.set(config.provider, adapter);

          if (config.isDefault) {
            this.defaultProvider = config.provider;
          }

          console.log(`Payment provider ${config.provider} initialized successfully`);
        }
      } catch (error) {
        console.error(`Failed to initialize ${config.provider}:`, error);
      }
    }
  }

  /**
   * Create appropriate adapter for provider
   */
  private createAdapter(provider: PaymentProvider, credentials: PaymentCredentials): PaymentAdapter {
    switch (provider) {
      case 'stripe':
        return new StripePayment(credentials, this.partnerId);
      case 'epay':
        return new ePayBG(credentials, this.partnerId);
      // Add other providers as implemented
      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
  }

  /**
   * Get adapter for a specific provider
   */
  getAdapter(provider?: PaymentProvider): PaymentAdapter {
    const targetProvider = provider || this.defaultProvider;
    const adapter = this.adapters.get(targetProvider);

    if (!adapter) {
      throw new Error(`Payment provider ${targetProvider} not initialized`);
    }

    return adapter;
  }

  /**
   * Create a payment with automatic provider selection
   */
  async createPayment(
    amount: number,
    currency: string,
    customerId?: string,
    provider?: PaymentProvider,
    metadata?: Record<string, any>
  ): Promise<PaymentIntent> {
    const adapter = this.getAdapter(provider);
    return adapter.createPaymentIntent(amount, currency, customerId, metadata);
  }

  /**
   * Confirm a payment
   */
  async confirmPayment(
    paymentIntentId: string,
    paymentMethodId: string,
    provider?: PaymentProvider
  ): Promise<PaymentResult> {
    const adapter = this.getAdapter(provider);
    return adapter.confirmPayment(paymentIntentId, paymentMethodId);
  }

  /**
   * Create a customer across all providers
   */
  async createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, any>
  ): Promise<Record<PaymentProvider, string>> {
    const customerIds: Record<string, string> = {};

    for (const [provider, adapter] of this.adapters) {
      try {
        const customerId = await adapter.createCustomer(email, name, metadata);
        customerIds[provider] = customerId;
      } catch (error) {
        console.error(`Failed to create customer on ${provider}:`, error);
      }
    }

    return customerIds as Record<PaymentProvider, string>;
  }

  /**
   * Create a subscription
   */
  async createSubscription(
    customerId: string,
    planId: string,
    provider?: PaymentProvider,
    trialDays?: number,
    metadata?: Record<string, any>
  ): Promise<Subscription> {
    const adapter = this.getAdapter(provider);
    return adapter.createSubscription(customerId, planId, trialDays, metadata);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    provider?: PaymentProvider,
    immediately: boolean = false
  ): Promise<boolean> {
    const adapter = this.getAdapter(provider);
    return adapter.cancelSubscription(subscriptionId, immediately);
  }

  /**
   * Update subscription plan
   */
  async updateSubscription(
    subscriptionId: string,
    newPlanId: string,
    provider?: PaymentProvider
  ): Promise<Subscription> {
    const adapter = this.getAdapter(provider);
    return adapter.updateSubscription(subscriptionId, newPlanId);
  }

  /**
   * Get subscription details
   */
  async getSubscription(
    subscriptionId: string,
    provider?: PaymentProvider
  ): Promise<Subscription | null> {
    const adapter = this.getAdapter(provider);
    return adapter.getSubscription(subscriptionId);
  }

  /**
   * Create an invoice
   */
  async createInvoice(
    customerId: string,
    items: Array<{ description: string; amount: number }>,
    provider?: PaymentProvider,
    metadata?: Record<string, any>
  ): Promise<Invoice> {
    const adapter = this.getAdapter(provider);
    return adapter.createInvoice(customerId, items, metadata);
  }

  /**
   * Get invoice
   */
  async getInvoice(
    invoiceId: string,
    provider?: PaymentProvider
  ): Promise<Invoice | null> {
    const adapter = this.getAdapter(provider);
    return adapter.getInvoice(invoiceId);
  }

  /**
   * List customer invoices
   */
  async listInvoices(
    customerId: string,
    provider?: PaymentProvider,
    limit?: number
  ): Promise<Invoice[]> {
    const adapter = this.getAdapter(provider);
    return adapter.listInvoices(customerId, limit);
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    paymentIntentId: string,
    provider?: PaymentProvider,
    amount?: number,
    reason?: string
  ): Promise<any> {
    const adapter = this.getAdapter(provider);
    return adapter.refundPayment(paymentIntentId, amount, reason);
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(
    paymentIntentId: string,
    provider?: PaymentProvider
  ): Promise<PaymentIntent['status']> {
    const adapter = this.getAdapter(provider);
    return adapter.getPaymentStatus(paymentIntentId);
  }

  /**
   * Handle webhook from any provider
   */
  async handleWebhook(
    provider: PaymentProvider,
    payload: string,
    signature: string
  ): Promise<boolean> {
    const adapter = this.adapters.get(provider);

    if (!adapter) {
      console.error(`No adapter found for provider: ${provider}`);
      return false;
    }

    try {
      // Verify webhook signature
      const isValid = adapter.verifyWebhook(payload, signature);

      if (!isValid) {
        console.error('Invalid webhook signature');
        return false;
      }

      // Parse and handle webhook
      const event = JSON.parse(payload);
      await adapter.handleWebhook(event);

      return true;
    } catch (error) {
      console.error(`Error handling webhook from ${provider}:`, error);
      return false;
    }
  }

  /**
   * Get all enabled providers
   */
  getEnabledProviders(): PaymentProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a provider is enabled
   */
  isProviderEnabled(provider: PaymentProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Get default provider
   */
  getDefaultProvider(): PaymentProvider {
    return this.defaultProvider;
  }

  /**
   * Set default provider
   */
  setDefaultProvider(provider: PaymentProvider): void {
    if (!this.adapters.has(provider)) {
      throw new Error(`Provider ${provider} is not initialized`);
    }

    this.defaultProvider = provider;
  }

  /**
   * Test connection to all providers
   */
  async testConnections(): Promise<Record<PaymentProvider, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [provider, adapter] of this.adapters) {
      try {
        const isConnected = await adapter.initialize();
        results[provider] = isConnected;
      } catch (error) {
        results[provider] = false;
      }
    }

    return results as Record<PaymentProvider, boolean>;
  }
}

/**
 * Global payment manager instance
 */
let globalPaymentManager: PaymentManager | null = null;

/**
 * Initialize payment manager
 */
export function initPaymentManager(options: PaymentManagerOptions): PaymentManager {
  if (!globalPaymentManager || globalPaymentManager['partnerId'] !== options.partnerId) {
    globalPaymentManager = new PaymentManager(options);
  }

  return globalPaymentManager;
}

/**
 * Get payment manager instance
 */
export function getPaymentManager(): PaymentManager | null {
  return globalPaymentManager;
}

/**
 * Disconnect payment manager
 */
export function disconnectPaymentManager(): void {
  globalPaymentManager = null;
}
