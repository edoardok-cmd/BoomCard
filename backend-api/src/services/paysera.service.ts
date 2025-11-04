/**
 * Paysera Payment Gateway Service
 * Handles payment processing for Bulgarian market
 * Documentation: https://developers.paysera.com/
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// ============================================
// Types & Interfaces
// ============================================

export interface PayseraConfig {
  projectId: string;
  signPassword: string;
  apiUrl: string;
  testMode: boolean;
}

export interface CreatePaymentParams {
  orderId: string;
  amount: number; // Amount in cents (e.g., 10.00 BGN = 1000)
  currency: string; // 'BGN', 'EUR', etc.
  description: string;
  acceptUrl: string; // Success redirect URL
  cancelUrl: string; // Cancel redirect URL
  callbackUrl: string; // Webhook URL
  customerEmail?: string;
  customerName?: string;
  paymentMethod?: string; // 'card', 'bank', etc.
  lang?: string; // 'bg', 'en', 'lt', etc.
  test?: 0 | 1; // 1 for test mode
}

export interface PayseraPayment {
  orderId: string;
  projectId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  paymentUrl: string;
  transactionId?: string;
  paymentMethod?: string;
  createdAt: Date;
}

export interface PayseraCallback {
  data: string; // Base64 encoded data
  ss1: string; // MD5 signature
  ss2: string; // SHA-256 signature
}

export interface PayseraCallbackData {
  projectid: string;
  orderid: string;
  amount: string;
  currency: string;
  payment: string; // Payment method
  status: '0' | '1' | '2' | '3'; // 0=pending, 1=success, 2=cancelled, 3=failed
  requestid: string;
  payamount: string;
  paycurrency: string;
  paytext: string;
  test: '0' | '1';
}

// ============================================
// Paysera Service Class
// ============================================

export class PayseraService {
  private config: PayseraConfig;
  private apiClient: AxiosInstance;

  constructor() {
    this.config = {
      projectId: process.env.PAYSERA_PROJECT_ID || '',
      signPassword: process.env.PAYSERA_SIGN_PASSWORD || '',
      apiUrl: process.env.PAYSERA_API_URL || 'https://bank.paysera.com',
      testMode: process.env.NODE_ENV !== 'production',
    };

    if (!this.config.projectId || !this.config.signPassword) {
      logger.warn('⚠️  Paysera credentials not configured. Payments will not work.');
    }

    this.apiClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    logger.info(`✅ Paysera Service initialized (${this.config.testMode ? 'TEST' : 'LIVE'} mode)`);
  }

  /**
   * Create a new payment
   */
  async createPayment(params: CreatePaymentParams): Promise<PayseraPayment> {
    try {
      logger.info(`Creating Paysera payment for order: ${params.orderId}`);

      // Build payment data
      const paymentData = {
        projectid: this.config.projectId,
        orderid: params.orderId,
        amount: params.amount.toString(),
        currency: params.currency,
        accepturl: params.acceptUrl,
        cancelurl: params.cancelUrl,
        callbackurl: params.callbackUrl,
        p_email: params.customerEmail || '',
        p_firstname: params.customerName || '',
        payment: params.paymentMethod || '',
        lang: params.lang || 'bg',
        test: this.config.testMode ? '1' : '0',
        version: '1.6',
      };

      // Encode data to base64
      const encodedData = Buffer.from(JSON.stringify(paymentData)).toString('base64');

      // Generate signature (MD5)
      const signature = this.generateSignature(encodedData);

      // Build payment URL
      const paymentUrl = `${this.config.apiUrl}/pay/?data=${encodeURIComponent(encodedData)}&sign=${signature}`;

      const payment: PayseraPayment = {
        orderId: params.orderId,
        projectId: this.config.projectId,
        amount: params.amount,
        currency: params.currency,
        status: 'pending',
        paymentUrl,
        createdAt: new Date(),
      };

      logger.info(`✅ Payment created: ${params.orderId} - ${paymentUrl}`);

      return payment;
    } catch (error: any) {
      logger.error('❌ Error creating Paysera payment:', error);
      throw new Error(`Failed to create payment: ${error.message}`);
    }
  }

  /**
   * Verify payment callback signature
   */
  verifyCallback(callback: PayseraCallback): boolean {
    try {
      // Verify MD5 signature (ss1)
      const expectedSs1 = this.generateSignature(callback.data);
      if (callback.ss1 !== expectedSs1) {
        logger.warn('⚠️  Invalid MD5 signature (ss1)');
        return false;
      }

      // Verify SHA-256 signature (ss2) if available
      if (callback.ss2) {
        const expectedSs2 = this.generateSha256Signature(callback.data);
        if (callback.ss2 !== expectedSs2) {
          logger.warn('⚠️  Invalid SHA-256 signature (ss2)');
          return false;
        }
      }

      logger.info('✅ Callback signature verified');
      return true;
    } catch (error: any) {
      logger.error('❌ Error verifying callback:', error);
      return false;
    }
  }

  /**
   * Parse callback data
   */
  parseCallback(encodedData: string): PayseraCallbackData {
    try {
      // Decode base64
      const decodedData = Buffer.from(encodedData, 'base64').toString('utf-8');

      // Parse URL-encoded data
      const params = new URLSearchParams(decodedData);
      const data: any = {};
      params.forEach((value, key) => {
        data[key] = value;
      });

      return data as PayseraCallbackData;
    } catch (error: any) {
      logger.error('❌ Error parsing callback data:', error);
      throw new Error('Invalid callback data');
    }
  }

  /**
   * Get payment status from callback
   */
  getPaymentStatus(status: string): 'pending' | 'success' | 'failed' | 'cancelled' {
    switch (status) {
      case '0':
        return 'pending';
      case '1':
        return 'success';
      case '2':
        return 'cancelled';
      case '3':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Handle payment callback
   */
  async handleCallback(callback: PayseraCallback): Promise<{
    orderId: string;
    status: 'pending' | 'success' | 'failed' | 'cancelled';
    amount: number;
    currency: string;
    transactionId: string;
    paymentMethod: string;
    isTest: boolean;
  }> {
    try {
      // Verify signature
      if (!this.verifyCallback(callback)) {
        throw new Error('Invalid callback signature');
      }

      // Parse data
      const data = this.parseCallback(callback.data);

      // Verify project ID
      if (data.projectid !== this.config.projectId) {
        throw new Error('Invalid project ID');
      }

      const result = {
        orderId: data.orderid,
        status: this.getPaymentStatus(data.status),
        amount: parseInt(data.amount) || 0,
        currency: data.currency,
        transactionId: data.requestid,
        paymentMethod: data.payment,
        isTest: data.test === '1',
      };

      logger.info(`✅ Callback processed: ${result.orderId} - ${result.status}`);

      return result;
    } catch (error: any) {
      logger.error('❌ Error handling callback:', error);
      throw error;
    }
  }

  /**
   * Generate callback response
   * Paysera expects "OK" response
   */
  generateCallbackResponse(): string {
    return 'OK';
  }

  /**
   * Check if payment is in test mode
   */
  isTestMode(): boolean {
    return this.config.testMode;
  }

  /**
   * Get payment URL by order ID (for redirecting user)
   */
  getPaymentUrl(encodedData: string, signature: string): string {
    return `${this.config.apiUrl}/pay/?data=${encodeURIComponent(encodedData)}&sign=${signature}`;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Generate MD5 signature for payment data
   */
  private generateSignature(data: string): string {
    const signString = `${data}${this.config.signPassword}`;
    return crypto.createHash('md5').update(signString).digest('hex');
  }

  /**
   * Generate SHA-256 signature (for enhanced security)
   */
  private generateSha256Signature(data: string): string {
    const signString = `${data}${this.config.signPassword}`;
    return crypto.createHash('sha256').update(signString).digest('hex');
  }

  /**
   * Convert amount to cents
   */
  static amountToCents(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Convert cents to amount
   */
  static centsToAmount(cents: number): number {
    return cents / 100;
  }

  /**
   * Format amount for display
   */
  static formatAmount(amount: number, currency: string = 'BGN'): string {
    return `${PayseraService.centsToAmount(amount).toFixed(2)} ${currency}`;
  }

  /**
   * Validate amount
   */
  static validateAmount(amount: number): boolean {
    return amount > 0 && amount <= 1000000; // Max 10,000 BGN
  }

  /**
   * Get supported currencies
   */
  static getSupportedCurrencies(): string[] {
    return ['BGN', 'EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON'];
  }

  /**
   * Get supported payment methods
   */
  static getSupportedPaymentMethods(): Array<{
    code: string;
    name: string;
    nameEn: string;
  }> {
    return [
      { code: '', name: 'Всички методи', nameEn: 'All methods' },
      { code: 'hanzaee', name: 'Банкови карти', nameEn: 'Bank cards' },
      { code: 'paysera', name: 'Paysera wallet', nameEn: 'Paysera wallet' },
      { code: 'banklink', name: 'Bank link', nameEn: 'Bank link' },
    ];
  }
}

// Export singleton instance
export const payseraService = new PayseraService();

export default payseraService;
