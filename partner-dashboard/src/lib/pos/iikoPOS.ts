/**
 * iiko POS Integration
 * Integration with iiko restaurant management system (popular in Russia/Eastern Europe)
 * Supports order management, menu sync, and real-time updates
 */

import crypto from 'crypto';
import { POSAdapter, POSTransaction, POSOrder, POSMenuItem, POSConfig, POSConnectionStatus, POSWebhookPayload } from './POSAdapter';

export interface iikoConfig extends POSConfig {
  apiLogin: string;
  organizationId: string;
  terminalGroupId: string;
}

interface iikoAuthResponse {
  token: string;
}

interface iikoOrder {
  id: string;
  organizationId: string;
  timestamp: number;
  status: 'New' | 'Bill' | 'Closed' | 'Deleted';
  customer?: {
    name?: string;
    phone?: string;
  };
  items: Array<{
    id: string;
    name: string;
    amount: number;
    sum: number;
    comment?: string;
  }>;
  fullSum: number;
  discountSum: number;
  resultSum: number;
}

interface iikoMenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  imageUrl?: string;
  isActive: boolean;
}

export class iikoPOS extends POSAdapter {
  private config: iikoConfig;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: iikoConfig, partnerId: string = '') {
    super({
      apiKey: config.apiLogin,
      environment: config.environment,
    }, partnerId);
    this.config = config;
  }

  /**
   * Authenticate with iiko API
   */
  private async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.token && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.token;
    }

    const response = await fetch(`${this.config.apiUrl}/api/1/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiLogin: this.config.apiLogin,
      }),
    });

    if (!response.ok) {
      throw new Error(`iiko authentication failed: ${response.statusText}`);
    }

    const data: iikoAuthResponse = await response.json();
    this.token = data.token;

    // Token is valid for 60 minutes
    this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    return data.token;
  }

  /**
   * Make authenticated API request
   */
  protected async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const token = await this.authenticate();

    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`iiko API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create a new transaction
   */
  async createTransaction(
    amount: number,
    discountPercent: number,
    metadata?: Record<string, any>
  ): Promise<POSTransaction> {
    const discountAmount = (amount * discountPercent) / 100;
    const finalAmount = amount - discountAmount;

    // Create order in iiko
    const orderData = {
      organizationId: this.config.organizationId,
      terminalGroupId: this.config.terminalGroupId,
      order: {
        phone: metadata?.phone,
        customer: metadata?.customer ? {
          name: metadata.customer.name,
          phone: metadata.customer.phone,
        } : undefined,
        items: metadata?.items || [],
        discountSum: discountAmount,
      },
    };

    const response = await this.makeRequest<iikoOrder>(
      '/api/1/order/create',
      'POST',
      orderData
    );

    return {
      id: response.id,
      amount,
      discount: discountPercent,
      discountAmount,
      finalAmount,
      status: 'pending',
      timestamp: new Date(response.timestamp),
      metadata: {
        iikoOrderId: response.id,
        iikoStatus: response.status,
      },
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<POSTransaction> {
    const response = await this.makeRequest<iikoOrder>(
      `/api/1/order/by_id?organization=${this.config.organizationId}&orderId=${transactionId}`
    );

    const status = this.mapiikoStatus(response.status);

    return {
      id: response.id,
      amount: response.fullSum,
      discount: 0,
      discountAmount: response.discountSum,
      finalAmount: response.resultSum,
      status,
      timestamp: new Date(response.timestamp),
      metadata: {
        iikoOrderId: response.id,
        iikoStatus: response.status,
        customer: response.customer,
      },
    };
  }

  /**
   * Map iiko order status to POS transaction status
   */
  private mapiikoStatus(iikoStatus: iikoOrder['status']): POSTransaction['status'] {
    switch (iikoStatus) {
      case 'New':
      case 'Bill':
        return 'pending';
      case 'Closed':
        return 'completed';
      case 'Deleted':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Cancel a transaction
   */
  async cancelTransaction(transactionId: string): Promise<void> {
    await this.makeRequest(
      '/api/1/order/delete',
      'POST',
      {
        organizationId: this.config.organizationId,
        orderId: transactionId,
      }
    );
  }

  /**
   * Get all transactions for a period
   */
  async getTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    const response = await this.makeRequest<{ orders: iikoOrder[] }>(
      `/api/1/order/by_date?organization=${this.config.organizationId}` +
      `&dateFrom=${startDate.toISOString()}&dateTo=${endDate.toISOString()}`
    );

    return response.orders.map(order => ({
      id: order.id,
      amount: order.fullSum,
      discount: 0,
      discountAmount: order.discountSum,
      finalAmount: order.resultSum,
      status: this.mapiikoStatus(order.status),
      timestamp: new Date(order.timestamp),
      metadata: {
        iikoOrderId: order.id,
        iikoStatus: order.status,
      },
    }));
  }

  /**
   * Sync menu items from iiko
   */
  async syncMenu(): Promise<POSMenuItem[]> {
    const response = await this.makeRequest<{ products: iikoMenuItem[] }>(
      `/api/1/nomenclature?organization=${this.config.organizationId}`
    );

    return response.products
      .filter(item => item.isActive)
      .map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        imageUrl: item.imageUrl,
        available: item.isActive,
      }));
  }

  /**
   * Create or update an order
   */
  async createOrder(order: Omit<POSOrder, 'id' | 'createdAt'>): Promise<POSOrder> {
    const orderData = {
      organizationId: this.config.organizationId,
      terminalGroupId: this.config.terminalGroupId,
      order: {
        phone: order.customer?.phone,
        customer: order.customer ? {
          name: order.customer.name,
          phone: order.customer.phone,
        } : undefined,
        items: order.items.map(item => ({
          id: item.menuItemId,
          amount: item.quantity,
        })),
      },
    };

    const response = await this.makeRequest<iikoOrder>(
      '/api/1/order/create',
      'POST',
      orderData
    );

    return {
      id: response.id,
      amount: response.fullSum,
      status: order.status,
      items: order.items,
      customer: order.customer,
      createdAt: new Date(response.timestamp),
    };
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<POSOrder> {
    const response = await this.makeRequest<iikoOrder>(
      `/api/1/order/by_id?organization=${this.config.organizationId}&orderId=${orderId}`
    );

    return {
      id: response.id,
      amount: response.fullSum,
      status: response.status === 'Closed' ? 'completed' : 'pending',
      items: response.items.map(item => ({
        menuItemId: item.id,
        name: item.name,
        quantity: item.amount,
        price: item.sum / item.amount,
      })),
      customer: response.customer ? {
        name: response.customer.name || '',
        phone: response.customer.phone,
      } : undefined,
      createdAt: new Date(response.timestamp),
    };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: POSOrder['status']
  ): Promise<POSOrder> {
    if (status === 'completed') {
      // Close the order
      await this.makeRequest(
        '/api/1/order/close',
        'POST',
        {
          organizationId: this.config.organizationId,
          orderId,
        }
      );
    } else if (status === 'cancelled') {
      // Delete the order
      await this.makeRequest(
        '/api/1/order/delete',
        'POST',
        {
          organizationId: this.config.organizationId,
          orderId,
        }
      );
    }

    return this.getOrder(orderId);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    // iiko uses HMAC-SHA256 for webhook verification
    const hmac = crypto.createHmac('sha256', this.config.webhookSecret || '');
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Process webhook event
   */
  async processWebhook(payload: any): Promise<void> {
    const { eventType, order } = payload;

    switch (eventType) {
      case 'OrderCreated':
        console.log('iiko order created:', order.id);
        break;

      case 'OrderClosed':
        console.log('iiko order closed:', order.id);
        // Update local transaction status
        break;

      case 'OrderDeleted':
        console.log('iiko order deleted:', order.id);
        // Mark transaction as cancelled
        break;

      default:
        console.log('Unknown iiko webhook event:', eventType);
    }
  }

  /**
   * Get POS system name
   */
  getName(): string {
    return 'iiko';
  }

  /**
   * Test connection to iiko API
   */
  async testConnection(): Promise<POSConnectionStatus> {
    try {
      await this.authenticate();
      return {
        connected: true,
        lastSync: new Date(),
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get base URL (required by POSAdapter)
   */
  protected getBaseUrl(): string {
    return this.config.apiUrl || 'https://api-ru.iiko.services';
  }

  /**
   * Fetch transactions (alias for getTransactions)
   */
  async fetchTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    return this.getTransactions(startDate, endDate);
  }

  /**
   * Apply discount to a transaction
   */
  async applyDiscount(transactionId: string, discountPercentage: number, boomCardNumber: string): Promise<POSTransaction> {
    const transaction = await this.getTransaction(transactionId);
    const discountAmount = (transaction.amount * discountPercentage) / 100;
    return {
      ...transaction,
      discount: discountPercentage,
      discountAmount,
      finalAmount: transaction.amount - discountAmount,
      boomCardNumber,
    };
  }

  /**
   * Handle webhook (required by POSAdapter)
   */
  async handleWebhook(payload: POSWebhookPayload): Promise<void> {
    await this.processWebhook(payload);
  }

  /**
   * Refund transaction (required by POSAdapter)
   */
  async refundTransaction(transactionId: string, amount?: number): Promise<POSTransaction> {
    const transaction = await this.getTransaction(transactionId);
    return {
      ...transaction,
      status: 'refunded',
      metadata: {
        ...transaction.metadata,
        refundedAt: new Date(),
        refundAmount: amount || transaction.amount,
      },
    };
  }

  /**
   * Get auth headers (required by POSAdapter)
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
    };
  }

  /**
   * Get organization info
   */
  async getOrganizationInfo(): Promise<any> {
    const response = await this.makeRequest(
      `/api/1/organization/list`
    );
    return response;
  }

  /**
   * Get delivery terminals
   */
  async getTerminalGroups(): Promise<any> {
    const response = await this.makeRequest(
      `/api/1/terminal_groups?organization=${this.config.organizationId}`
    );
    return response;
  }
}

export default iikoPOS;
