/**
 * Poster POS Integration
 * Popular POS system for restaurants and cafes
 */

import { POSAdapter, POSCredentials, POSTransaction, POSConnectionStatus, POSWebhookPayload } from './POSAdapter';
import crypto from 'crypto';

export class PosterPOS extends POSAdapter {
  protected getBaseUrl(): string {
    return this.credentials.environment === 'production'
      ? 'https://joinposter.com/api'
      : 'https://demo.joinposter.com/api';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
    };
  }

  async testConnection(): Promise<POSConnectionStatus> {
    try {
      const response = await this.makeRequest('/settings.getAllSettings');
      return {
        connected: true,
        lastSync: new Date(),
        version: response.response?.version || '2.0',
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async fetchTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    try {
      const dateFrom = startDate.toISOString().split('T')[0];
      const dateTo = endDate.toISOString().split('T')[0];

      const response = await this.makeRequest(
        `/dash.getTransactions?dateFrom=${dateFrom}&dateTo=${dateTo}`
      );

      return response.response?.map((tx: any) => this.mapTransaction(tx)) || [];
    } catch (error) {
      console.error('Error fetching Poster transactions:', error);
      return [];
    }
  }

  async applyDiscount(
    transactionId: string,
    discountPercentage: number,
    boomCardNumber: string
  ): Promise<POSTransaction> {
    // Poster uses transaction modification endpoint
    const response = await this.makeRequest(
      `/transactions.changeTransaction`,
      'POST',
      {
        transaction_id: transactionId,
        discount: discountPercentage,
        loyalty_code: boomCardNumber,
      }
    );

    return this.mapTransaction(response.response);
  }

  async getTransaction(transactionId: string): Promise<POSTransaction | null> {
    try {
      const response = await this.makeRequest(`/transactions.getTransaction?transaction_id=${transactionId}`);
      return this.mapTransaction(response.response);
    } catch (error) {
      console.error('Error getting transaction:', error);
      return null;
    }
  }

  async refundTransaction(transactionId: string, amount?: number): Promise<POSTransaction> {
    const response = await this.makeRequest(
      `/transactions.removeTransaction`,
      'POST',
      {
        spot_id: transactionId,
        remove_payment: true,
        return_amount: amount,
      }
    );

    return this.mapTransaction(response.response);
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.credentials.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const computedSignature = crypto
      .createHmac('sha256', this.credentials.webhookSecret)
      .update(payload)
      .digest('hex');

    return signature === computedSignature;
  }

  async handleWebhook(payload: POSWebhookPayload): Promise<void> {
    console.log('Poster webhook received:', payload.event);

    switch (payload.event) {
      case 'transaction.created':
        await this.syncTransaction(payload.data.id);
        break;
      case 'transaction.updated':
        await this.syncTransaction(payload.data.id);
        break;
      case 'transaction.refunded':
        await this.handleRefund(payload.data);
        break;
    }
  }

  private async syncTransaction(transactionId: string): Promise<void> {
    const transaction = await this.getTransaction(transactionId);
    if (transaction) {
      // Save to database
      console.log('Syncing transaction:', transaction.id);
    }
  }

  private async handleRefund(transaction: POSTransaction): Promise<void> {
    console.log('Handling refund for transaction:', transaction.id);
  }

  private mapTransaction(data: any): POSTransaction {
    const amount = parseFloat(data.sum || data.total_sum || '0') / 100; // Poster uses kopecks
    const discountAmount = parseFloat(data.discount_sum || '0') / 100;
    const discountPercentage = amount > 0 ? (discountAmount / amount) * 100 : 0;

    return {
      id: data.transaction_id?.toString() || data.id?.toString(),
      amount,
      currency: 'BGN',
      discount: discountPercentage,
      discountAmount,
      boomCardNumber: data.loyalty_code || data.client_card_number,
      timestamp: new Date(data.date_close || data.created_at),
      status: this.mapStatus(data.status),
      items: data.products?.map((item: any) => ({
        name: item.product_name,
        quantity: item.count,
        price: parseFloat(item.product_sum) / 100,
        category: item.category_name,
      })),
      metadata: {
        tableNumber: data.table_name,
        waiter: data.waiter_name,
        spotId: data.spot_id,
      },
    };
  }

  private mapStatus(status: number | string): POSTransaction['status'] {
    const statusNum = typeof status === 'string' ? parseInt(status) : status;

    // Poster status codes
    switch (statusNum) {
      case 0:
        return 'pending';
      case 1:
      case 2:
        return 'completed';
      case 3:
        return 'refunded';
      default:
        return 'failed';
    }
  }
}
