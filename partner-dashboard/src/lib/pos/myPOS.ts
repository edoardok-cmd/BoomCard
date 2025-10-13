/**
 * myPOS Integration
 * Integration with myPOS payment terminals and gateway (popular in Europe)
 * Supports card payments, QR payments, and mobile POS
 */

import { POSAdapter, POSTransaction, POSOrder, POSMenuItem, POSConfig } from './POSAdapter';

export interface myPOSConfig extends POSConfig {
  sid: string; // Store ID
  walletNumber: string;
  privateKey: string;
  publicKey: string;
  keyIndex: number;
  environment: 'production' | 'development';
}

interface myPOSPaymentRequest {
  IPCmethod: string;
  IPCversion: string;
  IPCLanguage: string;
  SID: string;
  WalletNumber: string;
  Amount: string;
  Currency: string;
  OrderID: string;
  URL_OK?: string;
  URL_Cancel?: string;
  URL_Notify?: string;
  Note?: string;
  CustomerEmail?: string;
  CustomerPhone?: string;
  CardTokenRequest?: string;
}

interface myPOSPaymentResponse {
  IPCmethod: string;
  OrderID: string;
  IPCTransactionID: string;
  Amount: string;
  Currency: string;
  Status: '0' | '1' | '2' | '3'; // 0=Denied, 1=Approved, 2=Cancelled, 3=Refunded
  StatusMsg: string;
  Signature: string;
}

export class myPOS extends POSAdapter {
  private config: myPOSConfig;
  private baseURL: string;

  constructor(config: myPOSConfig) {
    super();
    this.config = config;
    this.baseURL = config.environment === 'production'
      ? 'https://www.mypos.com/vmp/checkout'
      : 'https://www.mypos.com/vmp/checkout-test';
  }

  /**
   * Generate signature for request
   */
  private generateSignature(params: Record<string, any>): string {
    // Sort parameters alphabetically
    const sortedKeys = Object.keys(params).sort();

    // Concatenate values
    let concatenated = '';
    sortedKeys.forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        concatenated += params[key];
      }
    });

    // Sign with private key
    const crypto = require('crypto');
    const sign = crypto.createSign('SHA256');
    sign.update(concatenated);
    sign.end();

    const signature = sign.sign(this.config.privateKey, 'base64');
    return signature;
  }

  /**
   * Verify signature from myPOS response
   */
  private verifySignature(params: Record<string, any>, signature: string): boolean {
    // Remove signature from params
    const { Signature, ...restParams } = params;

    // Sort parameters alphabetically
    const sortedKeys = Object.keys(restParams).sort();

    // Concatenate values
    let concatenated = '';
    sortedKeys.forEach(key => {
      if (restParams[key] !== undefined && restParams[key] !== null) {
        concatenated += restParams[key];
      }
    });

    // Verify with public key
    const crypto = require('crypto');
    const verify = crypto.createVerify('SHA256');
    verify.update(concatenated);
    verify.end();

    return verify.verify(this.config.publicKey, signature, 'base64');
  }

  /**
   * Create a new transaction (payment)
   */
  async createTransaction(
    amount: number,
    discountPercent: number,
    metadata?: Record<string, any>
  ): Promise<POSTransaction> {
    const discountAmount = (amount * discountPercent) / 100;
    const finalAmount = amount - discountAmount;

    const orderId = metadata?.orderId || `ORDER_${Date.now()}`;

    const params: myPOSPaymentRequest = {
      IPCmethod: 'IPCPurchase',
      IPCversion: '1.4',
      IPCLanguage: 'en',
      SID: this.config.sid,
      WalletNumber: this.config.walletNumber,
      Amount: (finalAmount / 100).toFixed(2), // Convert cents to currency
      Currency: metadata?.currency || 'EUR',
      OrderID: orderId,
      URL_OK: metadata?.urlOk,
      URL_Cancel: metadata?.urlCancel,
      URL_Notify: this.config.webhookUrl,
      Note: metadata?.note,
      CustomerEmail: metadata?.customerEmail,
      CustomerPhone: metadata?.customerPhone,
      CardTokenRequest: metadata?.saveCard ? '1' : '0',
    };

    // Generate signature
    const signature = this.generateSignature(params);

    // Create payment request
    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...params as any,
        Signature: signature,
        KeyIndex: this.config.keyIndex.toString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`myPOS payment request failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      id: orderId,
      amount,
      discount: discountPercent,
      discountAmount,
      finalAmount,
      status: 'PENDING',
      timestamp: new Date(),
      metadata: {
        myPOSTransactionId: data.IPCTransactionID,
        paymentURL: data.PaymentURL,
      },
    };
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<POSTransaction> {
    // Query transaction status
    const params = {
      IPCmethod: 'IPCGetTransactionStatus',
      IPCversion: '1.4',
      SID: this.config.sid,
      WalletNumber: this.config.walletNumber,
      OrderID: transactionId,
    };

    const signature = this.generateSignature(params);

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...params as any,
        Signature: signature,
        KeyIndex: this.config.keyIndex.toString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`myPOS transaction query failed: ${response.statusText}`);
    }

    const data: myPOSPaymentResponse = await response.json();

    // Verify response signature
    if (!this.verifySignature(data, data.Signature)) {
      throw new Error('Invalid signature in myPOS response');
    }

    const amount = parseFloat(data.Amount) * 100; // Convert to cents
    const status = this.mapmyPOSStatus(data.Status);

    return {
      id: data.OrderID,
      amount,
      discount: 0,
      discountAmount: 0,
      finalAmount: amount,
      status,
      timestamp: new Date(),
      metadata: {
        myPOSTransactionId: data.IPCTransactionID,
        statusMessage: data.StatusMsg,
      },
    };
  }

  /**
   * Map myPOS status to POS transaction status
   */
  private mapmyPOSStatus(myPOSStatus: myPOSPaymentResponse['Status']): POSTransaction['status'] {
    switch (myPOSStatus) {
      case '1':
        return 'COMPLETED';
      case '0':
      case '2':
        return 'FAILED';
      case '3':
        return 'REFUNDED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Cancel a transaction (refund)
   */
  async cancelTransaction(transactionId: string): Promise<void> {
    const params = {
      IPCmethod: 'IPCRefund',
      IPCversion: '1.4',
      SID: this.config.sid,
      WalletNumber: this.config.walletNumber,
      OrderID: transactionId,
    };

    const signature = this.generateSignature(params);

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...params as any,
        Signature: signature,
        KeyIndex: this.config.keyIndex.toString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`myPOS refund failed: ${response.statusText}`);
    }
  }

  /**
   * Get all transactions for a period
   */
  async getTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    // myPOS doesn't provide a bulk transaction query endpoint
    // This would need to be implemented using a local database of transaction IDs
    console.warn('myPOS does not support bulk transaction queries');
    return [];
  }

  /**
   * Sync menu items - Not applicable for myPOS (payment terminal only)
   */
  async syncMenu(): Promise<POSMenuItem[]> {
    return [];
  }

  /**
   * Create or update an order - Not applicable for myPOS
   */
  async createOrder(order: Omit<POSOrder, 'id' | 'createdAt'>): Promise<POSOrder> {
    throw new Error('myPOS does not support order management');
  }

  /**
   * Get order by ID - Not applicable for myPOS
   */
  async getOrder(orderId: string): Promise<POSOrder> {
    throw new Error('myPOS does not support order management');
  }

  /**
   * Update order status - Not applicable for myPOS
   */
  async updateOrderStatus(
    orderId: string,
    status: POSOrder['status']
  ): Promise<POSOrder> {
    throw new Error('myPOS does not support order management');
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    // Parse payload
    const params = JSON.parse(payload);
    return this.verifySignature(params, signature);
  }

  /**
   * Process webhook event
   */
  async processWebhook(payload: any): Promise<void> {
    const { IPCmethod, OrderID, Status, StatusMsg } = payload;

    console.log(`myPOS webhook received: ${IPCmethod} for order ${OrderID}`);
    console.log(`Status: ${Status} - ${StatusMsg}`);

    // Update local transaction status based on webhook
    switch (Status) {
      case '1':
        console.log('Payment approved for order:', OrderID);
        break;

      case '0':
        console.log('Payment denied for order:', OrderID);
        break;

      case '2':
        console.log('Payment cancelled for order:', OrderID);
        break;

      case '3':
        console.log('Payment refunded for order:', OrderID);
        break;
    }
  }

  /**
   * Get POS system name
   */
  getName(): string {
    return 'myPOS';
  }

  /**
   * Test connection to myPOS
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test by checking a dummy transaction
      const params = {
        IPCmethod: 'IPCGetPaymentMethods',
        IPCversion: '1.4',
        SID: this.config.sid,
        WalletNumber: this.config.walletNumber,
      };

      const signature = this.generateSignature(params);

      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          ...params as any,
          Signature: signature,
          KeyIndex: this.config.keyIndex.toString(),
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('myPOS connection test failed:', error);
      return false;
    }
  }

  /**
   * Get available payment methods
   */
  async getPaymentMethods(): Promise<any[]> {
    const params = {
      IPCmethod: 'IPCGetPaymentMethods',
      IPCversion: '1.4',
      SID: this.config.sid,
      WalletNumber: this.config.walletNumber,
    };

    const signature = this.generateSignature(params);

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...params as any,
        Signature: signature,
        KeyIndex: this.config.keyIndex.toString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`myPOS payment methods query failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create recurring payment (subscription)
   */
  async createRecurringPayment(
    amount: number,
    currency: string,
    period: 'day' | 'week' | 'month' | 'year',
    metadata?: Record<string, any>
  ): Promise<any> {
    const params = {
      IPCmethod: 'IPCPurchaseByCardToken',
      IPCversion: '1.4',
      SID: this.config.sid,
      WalletNumber: this.config.walletNumber,
      Amount: (amount / 100).toFixed(2),
      Currency: currency,
      OrderID: metadata?.orderId || `RECURRING_${Date.now()}`,
      CardToken: metadata?.cardToken,
      Note: `Recurring payment - ${period}`,
    };

    const signature = this.generateSignature(params);

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...params as any,
        Signature: signature,
        KeyIndex: this.config.keyIndex.toString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`myPOS recurring payment failed: ${response.statusText}`);
    }

    return response.json();
  }
}

export default myPOS;
