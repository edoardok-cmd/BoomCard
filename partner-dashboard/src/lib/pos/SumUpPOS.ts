/**
 * SumUp Integration
 * Integration with SumUp payment terminals and API
 * Popular mobile POS solution in Europe
 */

import { POSAdapter, POSTransaction, POSOrder, POSMenuItem, POSConfig } from './POSAdapter';

export interface SumUpConfig extends POSConfig {
  clientId: string;
  clientSecret: string;
  merchantCode: string;
  accessToken?: string;
  refreshToken?: string;
  environment: 'production' | 'sandbox';
}

interface SumUpAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface SumUpCheckout {
  id: string;
  checkout_reference: string;
  amount: number;
  currency: string;
  merchant_code: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  description?: string;
  return_url?: string;
  date: string;
  valid_until?: string;
  transactions?: Array<{
    id: string;
    transaction_code: string;
    amount: number;
    currency: string;
    timestamp: string;
    status: 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'PENDING';
    payment_type: string;
    card?: {
      last_4_digits: string;
      type: string;
    };
  }>;
}

export class SumUpPOS extends POSAdapter {
  private config: SumUpConfig;
  private baseURL: string;
  private tokenExpiry: Date | null = null;

  constructor(config: SumUpConfig) {
    super();
    this.config = config;
    this.baseURL = config.environment === 'production'
      ? 'https://api.sumup.com/v0.1'
      : 'https://api.sumup.com/v0.1'; // SumUp uses same URL for both
  }

  /**
   * Authenticate with SumUp API
   */
  private async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.config.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.config.accessToken;
    }

    // Get new token using client credentials or refresh token
    const grantType = this.config.refreshToken
      ? 'refresh_token'
      : 'client_credentials';

    const params = new URLSearchParams({
      grant_type: grantType,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    if (grantType === 'refresh_token' && this.config.refreshToken) {
      params.append('refresh_token', this.config.refreshToken);
    }

    const response = await fetch('https://api.sumup.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`SumUp authentication failed: ${response.statusText}`);
    }

    const data: SumUpAuthResponse = await response.json();

    // Store tokens
    this.config.accessToken = data.access_token;
    this.config.refreshToken = data.refresh_token;

    // Token expires in seconds
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

    return data.access_token;
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const token = await this.authenticate();

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SumUp API request failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Create a new transaction (checkout)
   */
  async createTransaction(
    amount: number,
    discountPercent: number,
    metadata?: Record<string, any>
  ): Promise<POSTransaction> {
    const discountAmount = (amount * discountPercent) / 100;
    const finalAmount = amount - discountAmount;

    const checkoutData = {
      checkout_reference: metadata?.reference || `CHK_${Date.now()}`,
      amount: finalAmount / 100, // Convert cents to currency
      currency: metadata?.currency || 'EUR',
      merchant_code: this.config.merchantCode,
      description: metadata?.description,
      return_url: metadata?.returnUrl,
    };

    const response = await this.makeRequest<SumUpCheckout>(
      '/checkouts',
      'POST',
      checkoutData
    );

    return {
      id: response.id,
      amount,
      discount: discountPercent,
      discountAmount,
      finalAmount,
      status: this.mapSumUpStatus(response.status),
      timestamp: new Date(response.date),
      metadata: {
        sumUpCheckoutId: response.id,
        checkoutReference: response.checkout_reference,
      },
    };
  }

  /**
   * Get transaction (checkout) by ID
   */
  async getTransaction(transactionId: string): Promise<POSTransaction> {
    const response = await this.makeRequest<SumUpCheckout>(
      `/checkouts/${transactionId}`
    );

    const amount = response.amount * 100; // Convert to cents

    return {
      id: response.id,
      amount,
      discount: 0,
      discountAmount: 0,
      finalAmount: amount,
      status: this.mapSumUpStatus(response.status),
      timestamp: new Date(response.date),
      metadata: {
        sumUpCheckoutId: response.id,
        checkoutReference: response.checkout_reference,
        transactions: response.transactions,
      },
    };
  }

  /**
   * Map SumUp checkout status to POS transaction status
   */
  private mapSumUpStatus(sumUpStatus: SumUpCheckout['status']): POSTransaction['status'] {
    switch (sumUpStatus) {
      case 'PENDING':
        return 'PENDING';
      case 'PAID':
        return 'COMPLETED';
      case 'FAILED':
      case 'CANCELLED':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Cancel a transaction - SumUp doesn't support cancellation, only refunds
   */
  async cancelTransaction(transactionId: string): Promise<void> {
    console.warn('SumUp does not support checkout cancellation. Use refund instead.');
  }

  /**
   * Refund a transaction
   */
  async refundTransaction(transactionId: string, amount?: number): Promise<void> {
    const refundData = amount ? { amount: amount / 100 } : {};

    await this.makeRequest(
      `/me/refund/${transactionId}`,
      'POST',
      refundData
    );
  }

  /**
   * Get all transactions for a period
   */
  async getTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    // SumUp supports transaction history
    const params = new URLSearchParams({
      limit: '100',
      order: 'descending',
    });

    const response = await this.makeRequest<{ items: any[] }>(
      `/me/transactions/history?${params}`
    );

    // Filter by date range
    const filtered = response.items.filter(item => {
      const txDate = new Date(item.timestamp);
      return txDate >= startDate && txDate <= endDate;
    });

    return filtered.map(tx => ({
      id: tx.id,
      amount: tx.amount * 100,
      discount: 0,
      discountAmount: 0,
      finalAmount: tx.amount * 100,
      status: tx.status === 'SUCCESSFUL' ? 'COMPLETED' : 'FAILED',
      timestamp: new Date(tx.timestamp),
      metadata: {
        transactionCode: tx.transaction_code,
        paymentType: tx.payment_type,
        card: tx.card,
      },
    }));
  }

  /**
   * Sync menu items - Not applicable for SumUp (payment terminal only)
   */
  async syncMenu(): Promise<POSMenuItem[]> {
    return [];
  }

  /**
   * Create or update an order - Not applicable for SumUp
   */
  async createOrder(order: Omit<POSOrder, 'id' | 'createdAt'>): Promise<POSOrder> {
    throw new Error('SumUp does not support order management');
  }

  /**
   * Get order by ID - Not applicable for SumUp
   */
  async getOrder(orderId: string): Promise<POSOrder> {
    throw new Error('SumUp does not support order management');
  }

  /**
   * Update order status - Not applicable for SumUp
   */
  async updateOrderStatus(
    orderId: string,
    status: POSOrder['status']
  ): Promise<POSOrder> {
    throw new Error('SumUp does not support order management');
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    // SumUp uses HMAC-SHA256 for webhook verification
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', this.config.webhookSecret || '');
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Process webhook event
   */
  async processWebhook(payload: any): Promise<void> {
    const { event_type, resource_type, resource } = payload;

    console.log(`SumUp webhook received: ${event_type} for ${resource_type}`);

    switch (event_type) {
      case 'CHECKOUT_CREATED':
        console.log('Checkout created:', resource.id);
        break;

      case 'CHECKOUT_PAID':
        console.log('Checkout paid:', resource.id);
        break;

      case 'CHECKOUT_EXPIRED':
        console.log('Checkout expired:', resource.id);
        break;

      case 'TRANSACTION_SUCCESSFUL':
        console.log('Transaction successful:', resource.transaction_code);
        break;

      case 'TRANSACTION_FAILED':
        console.log('Transaction failed:', resource.transaction_code);
        break;

      default:
        console.log('Unknown SumUp webhook event:', event_type);
    }
  }

  /**
   * Get POS system name
   */
  getName(): string {
    return 'SumUp';
  }

  /**
   * Test connection to SumUp
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      // Test by getting merchant profile
      await this.makeRequest('/me');
      return true;
    } catch (error) {
      console.error('SumUp connection test failed:', error);
      return false;
    }
  }

  /**
   * Get merchant profile
   */
  async getMerchantProfile(): Promise<any> {
    return this.makeRequest('/me');
  }

  /**
   * Get account details
   */
  async getAccountDetails(): Promise<any> {
    return this.makeRequest('/me/account');
  }

  /**
   * Get merchant receipts
   */
  async getReceipts(limit: number = 10): Promise<any[]> {
    const response = await this.makeRequest<{ items: any[] }>(
      `/me/transactions/history?limit=${limit}`
    );
    return response.items;
  }

  /**
   * Create checkout link for online payment
   */
  async createCheckoutLink(
    amount: number,
    currency: string,
    description: string,
    returnUrl?: string
  ): Promise<string> {
    const checkout = await this.createTransaction(amount, 0, {
      currency,
      description,
      returnUrl,
    });

    // SumUp returns checkout ID which can be used to build payment link
    const checkoutId = checkout.metadata?.sumUpCheckoutId;
    return `https://pay.sumup.com/checkout/${checkoutId}`;
  }

  /**
   * Process card payment via terminal
   */
  async processCardPayment(
    amount: number,
    currency: string,
    metadata?: Record<string, any>
  ): Promise<POSTransaction> {
    // This would interact with SumUp terminal SDK in a real implementation
    console.log('Processing card payment via SumUp terminal');

    return this.createTransaction(amount, 0, {
      currency,
      ...metadata,
      description: 'Card payment via SumUp terminal',
    });
  }
}

export default SumUpPOS;
