/**
 * Barsy POS Integration
 * Used by cafes, bars, clubs, restaurants, and retail stores in Bulgaria
 * API Documentation: https://www.barsy.bg/ui/api.html
 */

import { POSAdapter, POSCredentials, POSTransaction, POSConnectionStatus, POSWebhookPayload } from './POSAdapter';
import crypto from 'crypto';

export class BarsyPOS extends POSAdapter {
  protected getBaseUrl(): string {
    return this.credentials.environment === 'production'
      ? 'https://api.barsy.bg/v1'
      : 'https://sandbox-api.barsy.bg/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.credentials.apiKey || '',
      'X-Merchant-ID': this.credentials.merchantId || '',
    };
  }

  async testConnection(): Promise<POSConnectionStatus> {
    try {
      const response = await this.makeRequest('/health');
      return {
        connected: true,
        lastSync: new Date(),
        version: response.version || '1.0',
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async fetchTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    try {
      const response = await this.makeRequest(
        `/transactions?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
      );

      return response.transactions.map((tx: any) => this.mapTransaction(tx));
    } catch (error) {
      console.error('Error fetching Barsy transactions:', error);
      return [];
    }
  }

  async applyDiscount(
    transactionId: string,
    discountPercentage: number,
    boomCardNumber: string
  ): Promise<POSTransaction> {
    const response = await this.makeRequest(
      `/transactions/${transactionId}/discount`,
      'POST',
      {
        discountPercentage,
        metadata: {
          boomCardNumber,
          partnerId: this.partnerId,
        },
      }
    );

    return this.mapTransaction(response);
  }

  async getTransaction(transactionId: string): Promise<POSTransaction | null> {
    try {
      const response = await this.makeRequest(`/transactions/${transactionId}`);
      return this.mapTransaction(response);
    } catch (error) {
      console.error('Error getting transaction:', error);
      return null;
    }
  }

  async refundTransaction(transactionId: string, amount?: number): Promise<POSTransaction> {
    const response = await this.makeRequest(
      `/transactions/${transactionId}/refund`,
      'POST',
      amount ? { amount } : {}
    );

    return this.mapTransaction(response);
  }

  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.credentials.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const computedSignature = crypto
      .createHmac('sha256', this.credentials.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }

  async handleWebhook(payload: POSWebhookPayload): Promise<void> {
    // Process webhook - this would typically update database
    console.log('Barsy webhook received:', payload.event, payload.data.id);

    switch (payload.event) {
      case 'transaction.created':
        // Handle new transaction
        await this.processNewTransaction(payload.data);
        break;
      case 'transaction.updated':
        // Handle transaction update
        await this.processTransactionUpdate(payload.data);
        break;
      case 'transaction.refunded':
        // Handle refund
        await this.processRefund(payload.data);
        break;
    }
  }

  private async processNewTransaction(transaction: POSTransaction): Promise<void> {
    // Implementation would save to database
    console.log('Processing new transaction:', transaction.id);
  }

  private async processTransactionUpdate(transaction: POSTransaction): Promise<void> {
    // Implementation would update database
    console.log('Processing transaction update:', transaction.id);
  }

  private async processRefund(transaction: POSTransaction): Promise<void> {
    // Implementation would update database
    console.log('Processing refund:', transaction.id);
  }

  private mapTransaction(data: any): POSTransaction {
    return {
      id: data.id || data.transaction_id,
      amount: parseFloat(data.amount),
      currency: data.currency || 'BGN',
      discount: parseFloat(data.discount_percentage || '0'),
      discountAmount: parseFloat(data.discount_amount || '0'),
      boomCardNumber: data.metadata?.boomCardNumber,
      timestamp: new Date(data.created_at || data.timestamp),
      status: this.mapStatus(data.status),
      items: data.items?.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
        category: item.category,
      })),
      metadata: data.metadata,
    };
  }

  private mapStatus(status: string): POSTransaction['status'] {
    const statusMap: Record<string, POSTransaction['status']> = {
      'pending': 'pending',
      'completed': 'completed',
      'success': 'completed',
      'failed': 'failed',
      'error': 'failed',
      'refunded': 'refunded',
      'cancelled': 'refunded',
    };

    return statusMap[status.toLowerCase()] || 'pending';
  }
}
