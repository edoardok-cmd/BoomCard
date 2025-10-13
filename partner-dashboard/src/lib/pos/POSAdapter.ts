/**
 * Base POS Adapter Interface
 * All POS integrations must implement this interface
 */

export interface POSCredentials {
  apiKey?: string;
  apiSecret?: string;
  merchantId?: string;
  terminalId?: string;
  webhookSecret?: string;
  environment?: 'production' | 'sandbox';
  [key: string]: string | undefined;
}

export interface POSTransaction {
  id: string;
  amount: number;
  currency: string;
  discount: number;
  discountAmount: number;
  boomCardNumber?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  items?: TransactionItem[];
  metadata?: Record<string, any>;
}

export interface TransactionItem {
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

export interface POSConnectionStatus {
  connected: boolean;
  lastSync?: Date;
  error?: string;
  version?: string;
}

export interface POSWebhookPayload {
  event: 'transaction.created' | 'transaction.updated' | 'transaction.refunded';
  data: POSTransaction;
  signature?: string;
}

export abstract class POSAdapter {
  protected credentials: POSCredentials;
  protected baseUrl: string;
  protected partnerId: string;

  constructor(credentials: POSCredentials, partnerId: string) {
    this.credentials = credentials;
    this.partnerId = partnerId;
    this.baseUrl = this.getBaseUrl();
  }

  /**
   * Get the base URL for the POS API
   */
  protected abstract getBaseUrl(): string;

  /**
   * Test the connection to the POS system
   */
  abstract testConnection(): Promise<POSConnectionStatus>;

  /**
   * Fetch recent transactions from the POS system
   */
  abstract fetchTransactions(
    startDate: Date,
    endDate: Date
  ): Promise<POSTransaction[]>;

  /**
   * Apply a discount to a transaction
   */
  abstract applyDiscount(
    transactionId: string,
    discountPercentage: number,
    boomCardNumber: string
  ): Promise<POSTransaction>;

  /**
   * Verify webhook signature
   */
  abstract verifyWebhook(
    payload: string,
    signature: string
  ): boolean;

  /**
   * Handle incoming webhook
   */
  abstract handleWebhook(
    payload: POSWebhookPayload
  ): Promise<void>;

  /**
   * Get transaction details by ID
   */
  abstract getTransaction(transactionId: string): Promise<POSTransaction | null>;

  /**
   * Refund a transaction
   */
  abstract refundTransaction(
    transactionId: string,
    amount?: number
  ): Promise<POSTransaction>;

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
      throw new Error(`POS API Error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get authentication headers for API requests
   */
  protected abstract getAuthHeaders(): Record<string, string>;
}
