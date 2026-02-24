/**
 * Paysera Payment Gateway Service
 * Handles payment processing per Paysera Checkout API specification v1.6
 * Documentation: https://developers.paysera.com/en/checkout/integrations/integration-specification
 *
 * Data encoding algorithm (from spec):
 * 1. Join parameters as URL-encoded query string
 * 2. Base64 encode the string
 * 3. Replace "/" with "_" and "+" with "-" (URL-safe base64)
 * 4. Sign: sign = md5(data + password)
 */

import crypto from 'crypto';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../utils/logger';

// ============================================
// Types & Interfaces
// ============================================

export interface PayseraConfig {
  projectId: string;
  signPassword: string;
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
  customerPhone?: string;
  paymentMethod?: string;
  lang?: string; // ISO 639-2/B: BUL, ENG, LIT, etc.
  country?: string; // ISO 3166-1 alpha-2: BG, LT, etc.
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
  data: string; // URL-safe base64 encoded data
  ss1: string; // MD5 signature: md5(data + password)
  ss2?: string; // RSA SHA-1 signature (optional, verified with public key)
}

export interface PayseraCallbackData {
  projectid: string;
  orderid: string;
  request_amount?: string; // Amount in major units (e.g., "125.4")
  request_currency?: string;
  payment: string;
  status: string; // 0=not executed, 1=success, 2=accepted, 3=additional info, 4=executed no confirm, 5=refunded
  requestid: string;
  pay_amount?: string; // Actual paid amount in major units
  pay_currency?: string;
  paytext: string;
  test: '0' | '1';
  name?: string;
  surename?: string;
  p_email?: string;
  account?: string;
  version?: string;
  lang?: string;
  country?: string;
  payment_country?: string;
  payer_ip_country?: string;
  payer_country?: string;
}

export interface PayseraPaymentMethod {
  key: string;
  title: string;
  titleBg: string;
  titleEn: string;
  logoUrl: string;
  logoRoundUrl?: string;
  minAmount?: number;
  maxAmount?: number;
  currency: string;
  group: string;
  groupTitle: string;
}

// Paysera payment gateway URL
const PAYSERA_PAY_URL = 'https://www.paysera.com/pay/';
const PAYSERA_METHODS_URL = 'https://www.paysera.com/new/api/paymentMethods';

// ============================================
// Paysera Service Class
// ============================================

export class PayseraService {
  private config: PayseraConfig;
  private methodsCache: Map<string, { data: PayseraPaymentMethod[]; fetchedAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.config = {
      projectId: process.env.PAYSERA_PROJECT_ID || '',
      signPassword: process.env.PAYSERA_SIGN_PASSWORD || '',
      testMode: process.env.PAYSERA_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production',
    };

    if (!this.config.projectId || !this.config.signPassword) {
      logger.warn('Paysera credentials not configured. Payments will not work.');
    }

    logger.info(`Paysera Service initialized (${this.config.testMode ? 'TEST' : 'LIVE'} mode)`);
  }

  /**
   * Encode parameters per Paysera specification:
   * 1. URL-encode as query string
   * 2. Base64 encode
   * 3. URL-safe base64: replace "/" → "_", "+" → "-"
   */
  private encodeData(params: Record<string, string>): string {
    // Step 1: Build URL-encoded query string
    const queryString = new URLSearchParams(params).toString();

    // Step 2: Base64 encode
    const base64 = Buffer.from(queryString).toString('base64');

    // Step 3: URL-safe base64
    return base64.replace(/\//g, '_').replace(/\+/g, '-');
  }

  /**
   * Decode data from Paysera callback:
   * 1. Reverse URL-safe base64: replace "-" → "+", "_" → "/"
   * 2. Base64 decode
   * 3. Parse URL-encoded query string
   */
  private decodeData(encodedData: string): Record<string, string> {
    // Step 1: Reverse URL-safe base64
    const base64 = encodedData.replace(/-/g, '+').replace(/_/g, '/');

    // Step 2: Base64 decode
    const queryString = Buffer.from(base64, 'base64').toString('utf-8');

    // Step 3: Parse URL-encoded params
    const params = new URLSearchParams(queryString);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });

    return result;
  }

  /**
   * Generate MD5 signature: sign = md5(data + password)
   */
  private generateSign(data: string): string {
    return crypto.createHash('md5').update(data + this.config.signPassword).digest('hex');
  }

  /**
   * Create a new payment and return the redirect URL
   */
  async createPayment(params: CreatePaymentParams): Promise<PayseraPayment> {
    try {
      logger.info(`Creating Paysera payment for order: ${params.orderId}`);

      // Build payment parameters per specification
      const paymentParams: Record<string, string> = {
        projectid: this.config.projectId,
        orderid: params.orderId,
        accepturl: params.acceptUrl,
        cancelurl: params.cancelUrl,
        callbackurl: params.callbackUrl,
        version: '1.6',
      };

      // Amount in cents
      if (params.amount > 0) {
        paymentParams.amount = params.amount.toString();
      }

      // Currency
      if (params.currency) {
        paymentParams.currency = params.currency;
      }

      // Payment text with required variables
      if (params.description) {
        paymentParams.paytext = `${params.description} (Nr. [order_nr]) ([site_name])`;
      }

      // Language (ISO 639-2/B)
      if (params.lang) {
        paymentParams.lang = params.lang;
      }

      // Country
      if (params.country) {
        paymentParams.country = params.country;
      }

      // Payer info
      if (params.customerEmail) {
        paymentParams.p_email = params.customerEmail;
      }
      if (params.customerName) {
        const nameParts = params.customerName.split(' ');
        paymentParams.p_firstname = nameParts[0] || '';
        if (nameParts.length > 1) {
          paymentParams.p_lastname = nameParts.slice(1).join(' ');
        }
      }
      if (params.customerPhone) {
        paymentParams.p_phone = params.customerPhone;
      }

      // Payment method
      if (params.paymentMethod) {
        paymentParams.payment = params.paymentMethod;
      }

      // Buyer consent - skip PIS consent step when email is provided
      if (params.customerEmail && params.paymentMethod) {
        paymentParams.buyer_consent = '1';
      }

      // Test mode
      if (this.config.testMode) {
        paymentParams.test = '1';
      }

      // Encode data per Paysera specification
      const encodedData = this.encodeData(paymentParams);

      // Generate signature
      const sign = this.generateSign(encodedData);

      // Build payment URL
      const paymentUrl = `${PAYSERA_PAY_URL}?data=${encodedData}&sign=${sign}`;

      const payment: PayseraPayment = {
        orderId: params.orderId,
        projectId: this.config.projectId,
        amount: params.amount,
        currency: params.currency,
        status: 'pending',
        paymentUrl,
        createdAt: new Date(),
      };

      logger.info(`Payment created: ${params.orderId}`);

      return payment;
    } catch (error: any) {
      logger.error('Error creating Paysera payment:', error);
      throw new Error(`Failed to create payment: ${error.message}`);
    }
  }

  /**
   * Verify callback signature (ss1 = md5(data + password))
   */
  verifyCallback(callback: PayseraCallback): boolean {
    try {
      // Verify MD5 signature (ss1)
      const expectedSs1 = this.generateSign(callback.data);
      if (callback.ss1 !== expectedSs1) {
        logger.warn('Invalid MD5 signature (ss1)');
        return false;
      }

      // Note: ss2 is RSA SHA-1 signature verified with Paysera's public key
      // For production, consider downloading https://www.paysera.com/download/public.key
      // and verifying ss2/ss3 for enhanced security.
      // ss1 (md5) is sufficient for most cases per Paysera docs.

      logger.info('Callback signature verified (ss1)');
      return true;
    } catch (error: any) {
      logger.error('Error verifying callback:', error);
      return false;
    }
  }

  /**
   * Parse callback data from URL-safe base64 encoded string
   */
  parseCallback(encodedData: string): PayseraCallbackData {
    try {
      const data = this.decodeData(encodedData);
      return data as unknown as PayseraCallbackData;
    } catch (error: any) {
      logger.error('Error parsing callback data:', error);
      throw new Error('Invalid callback data');
    }
  }

  /**
   * Map Paysera status codes to our status:
   * 0 = Payment has not been executed
   * 1 = Payment successful
   * 2 = Payment order accepted, but not yet executed
   * 3 = Additional payment information
   * 4 = Payment executed, but no bank confirmation
   * 5 = Payment was refunded
   */
  getPaymentStatus(status: string): 'pending' | 'success' | 'failed' | 'cancelled' {
    switch (status) {
      case '1':
        return 'success';
      case '4':
        return 'success'; // executed but no bank confirmation
      case '0':
        return 'pending';
      case '2':
        return 'pending'; // accepted but not yet executed
      case '3':
        return 'pending'; // additional info
      case '5':
        return 'cancelled'; // refunded
      default:
        return 'pending';
    }
  }

  /**
   * Handle payment callback: verify, parse, and return result
   */
  async handleCallback(callback: PayseraCallback): Promise<{
    orderId: string;
    status: 'pending' | 'success' | 'failed' | 'cancelled';
    rawStatus: string;
    amount: number;
    currency: string;
    transactionId: string;
    paymentMethod: string;
    isTest: boolean;
    payerEmail?: string;
    payAmount?: string;
    payCurrency?: string;
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
        throw new Error(`Invalid project ID: ${data.projectid}`);
      }

      const result = {
        orderId: data.orderid,
        status: this.getPaymentStatus(data.status),
        rawStatus: data.status,
        amount: data.request_amount ? Math.round(parseFloat(data.request_amount) * 100) : 0,
        currency: data.request_currency || data.pay_currency || '',
        transactionId: data.requestid || '',
        paymentMethod: data.payment || '',
        isTest: data.test === '1',
        payerEmail: data.p_email,
        payAmount: data.pay_amount,
        payCurrency: data.pay_currency,
      };

      logger.info(`Callback processed: ${result.orderId} - status ${data.status} (${result.status})`);

      return result;
    } catch (error: any) {
      logger.error('Error handling callback:', error);
      throw error;
    }
  }

  /**
   * Paysera expects "OK" text response to confirm callback receipt
   */
  generateCallbackResponse(): string {
    return 'OK';
  }

  isTestMode(): boolean {
    return this.config.testMode;
  }

  // ============================================
  // Payment Methods (Live from Paysera XML API)
  // ============================================

  /**
   * Fetch available payment methods from Paysera's XML API
   * Results are cached in memory for 1 hour
   */
  async fetchPaymentMethods(
    country: string = 'bg',
    currency: string = 'EUR',
    amountInCents: number = 1000
  ): Promise<PayseraPaymentMethod[]> {
    const cacheKey = `${country}-${currency}-${amountInCents}`;
    const cached = this.methodsCache.get(cacheKey);

    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL_MS) {
      logger.info(`Payment methods cache hit: ${cacheKey}`);
      return cached.data;
    }

    const url = `${PAYSERA_METHODS_URL}/${this.config.projectId}/currency:${currency}/amount:${amountInCents}`;
    logger.info(`Fetching payment methods from: ${url}`);

    try {
      const response = await axios.get(url, { timeout: 10000, responseType: 'text' });
      const xmlString = response.data;

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['country', 'payment_group', 'payment_type', 'title', 'logo_url', 'min', 'max'].includes(name),
      });

      const parsed = parser.parse(xmlString);
      const doc = parsed.payment_types_document;
      if (!doc) {
        logger.warn('Invalid XML response from Paysera');
        return [];
      }

      const countries = Array.isArray(doc.country) ? doc.country : doc.country ? [doc.country] : [];
      const targetCountry = countries.find((c: any) => c['@_code'] === country);

      if (!targetCountry) {
        logger.warn(`Country ${country} not found in Paysera payment methods`);
        return [];
      }

      const groups = Array.isArray(targetCountry.payment_group)
        ? targetCountry.payment_group
        : targetCountry.payment_group ? [targetCountry.payment_group] : [];

      const methods: PayseraPaymentMethod[] = [];

      for (const group of groups) {
        const groupKey = group['@_key'] || '';
        const groupTitles = Array.isArray(group.title) ? group.title : group.title ? [group.title] : [];
        const groupTitleBg = groupTitles.find((t: any) => t['@_language'] === 'bg');
        const groupTitle = this.extractText(groupTitleBg) || groupKey;

        const paymentTypes = Array.isArray(group.payment_type)
          ? group.payment_type
          : group.payment_type ? [group.payment_type] : [];

        for (const pt of paymentTypes) {
          const key = pt['@_key'];
          if (!key) continue;

          const titles = Array.isArray(pt.title) ? pt.title : pt.title ? [pt.title] : [];
          const bgTitle = titles.find((t: any) => t['@_language'] === 'bg');
          const enTitle = titles.find((t: any) => t['@_language'] === 'en');

          const logos = Array.isArray(pt.logo_url) ? pt.logo_url : pt.logo_url ? [pt.logo_url] : [];
          const bgLogo = logos.find((l: any) => l['@_language'] === 'bg') || logos[0];

          const mins = Array.isArray(pt.min) ? pt.min : pt.min ? [pt.min] : [];
          const maxs = Array.isArray(pt.max) ? pt.max : pt.max ? [pt.max] : [];

          methods.push({
            key,
            title: this.extractText(bgTitle) || this.extractText(enTitle) || key,
            titleBg: this.extractText(bgTitle) || this.extractText(enTitle) || key,
            titleEn: this.extractText(enTitle) || this.extractText(bgTitle) || key,
            logoUrl: this.extractText(bgLogo) || `https://bank.paysera.com/assets/image/payment_types/${key}.png`,
            logoRoundUrl: pt['@_logo_round_url'] || undefined,
            minAmount: mins[0]?.['@_amount'] ? parseInt(mins[0]['@_amount']) : undefined,
            maxAmount: maxs[0]?.['@_amount'] ? parseInt(maxs[0]['@_amount']) : undefined,
            currency: mins[0]?.['@_currency'] || currency,
            group: groupKey,
            groupTitle,
          });
        }
      }

      // Cache the results
      this.methodsCache.set(cacheKey, { data: methods, fetchedAt: Date.now() });
      logger.info(`Fetched ${methods.length} payment methods for ${country}/${currency}`);

      return methods;
    } catch (error: any) {
      logger.error('Error fetching payment methods from Paysera:', error.message);
      throw error;
    }
  }

  /**
   * Extract text content from a parsed XML element (handles CDATA and plain text)
   */
  private extractText(element: any): string {
    if (!element) return '';
    if (typeof element === 'string') return element;
    if (element['#text'] !== undefined) return String(element['#text']);
    return '';
  }

  // ============================================
  // Static Utility Methods
  // ============================================

  static amountToCents(amount: number): number {
    return Math.round(amount * 100);
  }

  static centsToAmount(cents: number): number {
    return cents / 100;
  }

  static formatAmount(amount: number, currency: string = 'EUR'): string {
    return `${PayseraService.centsToAmount(amount).toFixed(2)} ${currency}`;
  }

  static validateAmount(amount: number): boolean {
    return amount > 0 && amount <= 1000000; // Max 10,000 EUR in cents
  }

  static getSupportedCurrencies(): string[] {
    return ['EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON', 'BGN'];
  }

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
