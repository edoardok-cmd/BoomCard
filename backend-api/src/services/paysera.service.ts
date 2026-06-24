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
  ss2?: string; // RSA signature from Paysera (not verified — ss1 is sufficient)
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

// ============================================
// Transfer API (B2C) types
// ============================================

export interface CreateTransferParams {
  amountEUR: number;         // Amount in EUR (major units, e.g. 12.34)
  beneficiaryIban: string;   // Destination IBAN
  beneficiaryName: string;   // Account holder name
  purpose: string;           // Payment purpose text
  callbackUrl: string;       // URL Paysera will POST status updates to
  /** Stable idempotency key — prevents duplicate transfers on retry. Format: walletId+withdrawalTxId */
  idempotencyKey?: string;
}

export interface PayseraTransfer {
  id: string;
  status: 'pending' | 'reserved' | 'done' | 'failed' | 'rejected' | string;
  amount: { amount: string; currency: string };
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

// Paysera payment gateway URL (Checkout API)
const PAYSERA_PAY_URL = 'https://www.paysera.com/pay/';
const PAYSERA_METHODS_URL = 'https://www.paysera.com/new/api/paymentMethods';

// Paysera Transfer API (B2C) base URL
const PAYSERA_TRANSFER_API_URL = 'https://bank.paysera.com/rest/v1';

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
      testMode: process.env.PAYSERA_TEST_MODE === 'true',
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

      // Log payer info for debugging name issues
      logger.info(`Paysera payment params for ${params.orderId}: p_firstname=${paymentParams.p_firstname || '(not set)'}, p_lastname=${paymentParams.p_lastname || '(not set)'}, p_email=${paymentParams.p_email || '(not set)'}, test=${paymentParams.test || '0'}`);

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
   * Verify callback signatures.
   * ss1 = MD5(data + signPassword) — required per Paysera spec.
   * ss2 is a Paysera RSA signature (not an HMAC); we skip it and rely on ss1.
   */
  async verifyCallback(callback: PayseraCallback): Promise<boolean> {
    try {
      const expectedSs1 = this.generateSign(callback.data);
      if (callback.ss1 !== expectedSs1) {
        logger.warn('Invalid MD5 signature (ss1)', { dataPrefix: callback.data.slice(0, 64) });
        return false;
      }
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
      if (!data.projectid && !data.orderid) {
        throw new Error('Missing required callback fields');
      }
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
   * 2 = Payment failed / rejected
   * 3 = Payment cancelled
   * 4 = Payment executed, but no bank confirmation
   * 5 = Payment was refunded
   */
  getPaymentStatus(status: string): 'pending' | 'success' | 'failed' | 'cancelled' | 'unknown' {
    switch (status) {
      case '1':
        return 'success';
      case '4':
        return 'success'; // executed but no bank confirmation
      case '0':
        return 'pending';
      case '2':
        return 'failed';
      case '3':
        return 'cancelled';
      case '5':
        return 'cancelled'; // refunded
      default:
        return 'unknown';
    }
  }

  /**
   * Handle payment callback: verify, parse, and return result
   */
  async handleCallback(callback: PayseraCallback): Promise<{
    orderId: string;
    status: 'pending' | 'success' | 'failed' | 'cancelled' | 'unknown';
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
      // Verify signature (async — includes RSA ss2 check when available)
      if (!await this.verifyCallback(callback)) {
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
  // Transfer API (B2C) — Paysera MAC auth
  // Credentials: PAYSERA_TRANSFER_CLIENT_ID, PAYSERA_TRANSFER_MAC_KEY
  // Business account: PAYSERA_ACCOUNT_NUMBER
  // ============================================

  isTransferConfigured(): boolean {
    return !!(
      process.env.PAYSERA_TRANSFER_CLIENT_ID &&
      process.env.PAYSERA_TRANSFER_MAC_KEY &&
      process.env.PAYSERA_ACCOUNT_NUMBER
    );
  }

  /**
   * Build MAC Access Authentication header for the Paysera Transfer API.
   * Normalization string (each part on its own line, terminated by \n):
   *   ts, nonce, METHOD, /path, host, port, ext
   * ext = SHA256(body) base64 for POST/PUT, empty string for GET.
   * mac = HMAC-SHA256(normalization, macKey) base64.
   */
  private buildTransferMacHeader(
    method: string,
    urlPath: string,
    body?: string
  ): string {
    const clientId = process.env.PAYSERA_TRANSFER_CLIENT_ID!;
    const macKey = process.env.PAYSERA_TRANSFER_MAC_KEY!;

    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(8).toString('hex');

    let ext = '';
    if (body && (method === 'POST' || method === 'PUT')) {
      ext = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
    }

    const normalString = [ts, nonce, method.toUpperCase(), urlPath, 'bank.paysera.com', '443', ext, ''].join('\n');
    const mac = crypto.createHmac('sha256', macKey).update(normalString, 'utf8').digest('base64');

    return `MAC id="${clientId}", ts="${ts}", nonce="${nonce}", mac="${mac}", ext="${ext}"`;
  }

  /**
   * Verify an incoming MAC Authorization header from Paysera Transfer API callbacks.
   * Returns true if the signature is valid.
   */
  verifyTransferCallbackMac(
    method: string,
    urlPath: string,
    authHeader: string,
    host: string,
    body?: string
  ): boolean {
    try {
      const macKey = process.env.PAYSERA_TRANSFER_MAC_KEY;
      if (!macKey) return false;

      const tsMatch = authHeader.match(/ts="([^"]+)"/);
      const nonceMatch = authHeader.match(/nonce="([^"]+)"/);
      const macMatch = authHeader.match(/(?:^|,\s*)mac="([^"]+)"/);
      const extMatch = authHeader.match(/(?:^|,\s*)ext="([^"]*)"/);

      if (!tsMatch || !nonceMatch || !macMatch) {
        logger.warn('Transfer callback MAC: missing required fields');
        return false;
      }

      const ts = tsMatch[1];
      const nonce = nonceMatch[1];
      const providedMac = macMatch[1];
      const ext = extMatch ? extMatch[1] : '';

      // Verify body hash if ext was provided
      if (ext && body) {
        const expectedBodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
        if (ext !== expectedBodyHash) {
          logger.warn('Transfer callback MAC: body hash mismatch');
          return false;
        }
      }

      const normalString = [ts, nonce, method.toUpperCase(), urlPath, host, '443', ext, ''].join('\n');
      const expectedMac = crypto.createHmac('sha256', macKey).update(normalString, 'utf8').digest('base64');

      if (providedMac !== expectedMac) {
        logger.warn('Transfer callback MAC: signature mismatch');
        return false;
      }

      return true;
    } catch (err) {
      logger.error('Transfer callback MAC verification error:', err);
      return false;
    }
  }

  /**
   * Make an authenticated request to the Paysera Transfer API.
   */
  private async transferApiRequest<T>(
    method: string,
    path: string,
    body?: Record<string, any>,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const bodyString = body ? JSON.stringify(body) : undefined;
    const authorization = this.buildTransferMacHeader(method, path, bodyString);

    const response = await axios({
      method,
      url: `${PAYSERA_TRANSFER_API_URL}${path}`,
      headers: {
        Authorization: authorization,
        ...(bodyString ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        ...extraHeaders,
      },
      data: bodyString,
      timeout: 15000,
    });

    return response.data as T;
  }

  /**
   * Create a Paysera B2C transfer (bank account payout).
   * Sets auto_process_to_done=true so Paysera executes after reserve without
   * requiring a separate /done call.
   */
  async createTransfer(params: CreateTransferParams): Promise<PayseraTransfer> {
    if (params.amountEUR < 0.01) {
      throw new Error(`Transfer amount too small: €${params.amountEUR.toFixed(2)} (minimum €0.01)`);
    }

    const accountNumber = process.env.PAYSERA_ACCOUNT_NUMBER!;
    const amountStr = params.amountEUR.toFixed(2);

    const body = {
      amount: { amount: amountStr, currency: 'EUR' },
      beneficiary: {
        type: 'bank_account',
        name: params.beneficiaryName,
        bank_account: { iban: params.beneficiaryIban.replace(/\s+/g, '') },
      },
      payer: { account_number: accountNumber },
      purpose: params.purpose,
      auto_process_to_done: true,
      callback_url: params.callbackUrl,
    };

    logger.info(`Creating Paysera transfer: ${amountStr} EUR → ${params.beneficiaryIban}`);

    const idempotencyHeaders = params.idempotencyKey
      ? { 'Idempotency-Key': params.idempotencyKey }
      : undefined;

    const transfer = await this.transferApiRequest<PayseraTransfer>('POST', '/transfers', body, idempotencyHeaders);

    logger.info(`Paysera transfer created: ${transfer.id}, status: ${transfer.status}`);
    return transfer;
  }

  /**
   * Reserve (commit) a pending Paysera transfer.
   * After reserve + auto_process_to_done the transfer moves to "done" and the
   * callback fires.
   */
  async reserveTransfer(transferId: string): Promise<PayseraTransfer> {
    const accountNumber = process.env.PAYSERA_ACCOUNT_NUMBER!;

    const transfer = await this.transferApiRequest<PayseraTransfer>(
      'PUT',
      `/transfers/${transferId}/reserve`,
      { account_numbers: [accountNumber] }
    );

    logger.info(`Paysera transfer reserved: ${transferId}, status: ${transfer.status}`);
    return transfer;
  }

  /**
   * Fetch the current status of a transfer.
   */
  async getTransfer(transferId: string): Promise<PayseraTransfer> {
    return this.transferApiRequest<PayseraTransfer>('GET', `/transfers/${transferId}`);
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

  static getSupportedPaymentMethods(): PayseraPaymentMethod[] {
    return [
      {
        key: 'card',
        title: 'Банкови карти',
        titleBg: 'Банкови карти',
        titleEn: 'Bank cards',
        logoUrl: 'https://bank.paysera.com/assets/image/payment_types/card.png',
        currency: 'EUR',
        group: 'cards',
        groupTitle: 'Cards',
      },
      {
        key: 'paysera',
        title: 'Paysera',
        titleBg: 'Paysera',
        titleEn: 'Paysera',
        logoUrl: 'https://bank.paysera.com/assets/image/payment_types/wallet.png',
        currency: 'EUR',
        group: 'wallet',
        groupTitle: 'Wallet',
      },
      {
        key: 'banklink',
        title: 'Банков превод',
        titleBg: 'Банков превод',
        titleEn: 'Bank transfer',
        logoUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="8" fill="#EEF2FF"/><path d="M24 10L10 18v2h28v-2L24 10z" fill="#4F46E5"/><rect x="13" y="22" width="4" height="10" rx="1" fill="#6366F1"/><rect x="22" y="22" width="4" height="10" rx="1" fill="#6366F1"/><rect x="31" y="22" width="4" height="10" rx="1" fill="#6366F1"/><rect x="10" y="34" width="28" height="4" rx="1" fill="#4F46E5"/></svg>')}`,
        currency: 'EUR',
        group: 'banks',
        groupTitle: 'Banks',
      },
    ];
  }
}

// Export singleton instance
export const payseraService = new PayseraService();

export default payseraService;
