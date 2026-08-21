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
 *
 * Callback signatures: ss1 is md5(data + password); ss2/ss3 are RSA signatures
 * made with Paysera's own private key (SHA-1 and SHA-256 respectively) and are
 * verified against Paysera's published public key. See `verifyCallback` for the
 * exact rule and `./paysera-public-key.ts` for the key and its rotation levers.
 * Required env: PAYSERA_PROJECT_ID, PAYSERA_SIGN_PASSWORD (missing/empty is a
 * hard boot failure when NODE_ENV=production). Optional env:
 * PAYSERA_PUBLIC_KEY, PAYSERA_PUBLIC_KEY_PATH, PAYSERA_SS2_MODE.
 *
 * BC-MYPOS-002: this class is unchanged and remains the single source of
 * truth for all Paysera-specific behavior (callback verification, status
 * code mapping, Transfer API MAC auth). It is adapted to the
 * provider-agnostic `PaymentProvider` interface by the Paysera adapter in
 * `./payment-provider.ts`, which every route/service/job now calls through
 * instead of importing `payseraService` directly. See that file's header
 * comment for why the adapter itself lives there rather than in this file.
 */

import crypto from 'crypto';
import fs from 'fs';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../utils/logger';
import { ACCEPTED_CURRENCIES } from '../utils/currency';
import { PAYSERA_LIVE_PUBLIC_KEY_PEM } from './paysera-public-key';

// ============================================
// Types & Interfaces
// ============================================

export interface PayseraConfig {
  projectId: string;
  signPassword: string;
  testMode: boolean;
}

/**
 * How hard the RSA callback signature (ss2/ss3) is enforced. See the
 * "Callback signature verification" block comment above `verifyCallback`.
 *   'require' — an RSA signature MUST be present on every callback and valid.
 *   'enforce' — (default) if present it must be valid; if absent, ss1 alone.
 *   'off'     — break-glass: skip RSA verification; ss1 alone.
 * ss1 (MD5 + shared signing password) is an unconditional hard gate in ALL
 * three modes — no mode makes a callback easier to forge than it was before
 * BC-QA-031-FOLLOWUP-7.
 */
export type PayseraSs2Mode = 'require' | 'enforce' | 'off';

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
  /**
   * RSA-SHA1 signature over the raw `data` string, created with Paysera's own
   * private key and itself URL-safe-base64 encoded. Verified against Paysera's
   * published public key — see `verifyCallback`. Optional: Paysera only sends
   * it for projects/flows where OpenSSL signing is enabled.
   */
  ss2?: string;
  /**
   * Same as `ss2` but with a SHA-256 digest. Preferred over `ss2` when both are
   * present, matching paysera/lib-webtopay's own precedence. Not currently
   * forwarded by this codebase's callback routes (they read only data/ss1/ss2),
   * but verified here if a caller supplies it.
   */
  ss3?: string;
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

  /**
   * Paysera's callback-signing public key, resolved once at construction time
   * (never on the callback hot path). `null` means "no usable key" — see
   * `loadPublicKey()` for when that happens and `verifyCallback()` for what it
   * then does.
   */
  private readonly publicKey: crypto.KeyObject | null;
  private readonly ss2Mode: PayseraSs2Mode;

  constructor() {
    this.config = {
      projectId: process.env.PAYSERA_PROJECT_ID || '',
      signPassword: process.env.PAYSERA_SIGN_PASSWORD || '',
      testMode: process.env.PAYSERA_TEST_MODE === 'true',
    };

    // ── Fail closed on a missing signing secret (BC-QA-031-FOLLOWUP-7) ──────
    // Both values are load-bearing for callback authentication, but by two
    // DIFFERENT mechanisms — they are not interchangeable:
    //   • `signPassword` is the shared secret in ss1 = md5(data + signPassword).
    //     Falling back to '' collapsed that gate to `ss1 === md5(data)`, which
    //     any anonymous caller can compute.
    //   • `projectId` has no part in ss1 at all. It is checked separately in
    //     `handleCallback` (`data.projectid !== this.config.projectId`), and
    //     falling back to '' defeats THAT check, because a forged callback
    //     satisfies it simply by carrying `projectid=`.
    // Empty values therefore combined into a complete callback-forgery bypass,
    // not merely a degraded check. In production that must be a loud boot
    // failure, never a warning. Development and test keep warn-and-continue so
    // local work and the unit suite still run without Paysera credentials.
    const missing: string[] = [];
    if (!this.config.projectId) missing.push('PAYSERA_PROJECT_ID');
    if (!this.config.signPassword) missing.push('PAYSERA_SIGN_PASSWORD');

    if (missing.length > 0) {
      if (PayseraService.isProduction()) {
        const message =
          `Paysera is misconfigured: ${missing.join(' and ')} ` +
          `${missing.length > 1 ? 'are' : 'is'} missing or empty. Refusing to start: ` +
          'an empty signing secret makes payment-callback signatures forgeable by anyone. ' +
          'Set these environment variables (see backend-api/.env.example).';
        logger.error(message);
        throw new Error(message);
      }
      logger.warn('Paysera credentials not configured. Payments will not work.');
    }

    this.ss2Mode = PayseraService.resolveSs2Mode();
    this.publicKey = this.loadPublicKey();

    logger.info(
      `Paysera Service initialized (${this.config.testMode ? 'TEST' : 'LIVE'} mode, ` +
        `ss2Mode=${this.ss2Mode}, rsaKey=${this.publicKey ? 'loaded' : 'none'})`
    );
  }

  private static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private static resolveSs2Mode(): PayseraSs2Mode {
    const raw = (process.env.PAYSERA_SS2_MODE || '').trim().toLowerCase();
    if (raw === 'require' || raw === 'enforce' || raw === 'off') {
      if (raw === 'off') {
        logger.warn(
          'PAYSERA_SS2_MODE=off — RSA callback signature (ss2/ss3) verification is DISABLED. ' +
            'ss1 (MD5 + signing password) remains enforced. Re-provision a public key and unset this.'
        );
      }
      return raw;
    }
    if (raw !== '') {
      logger.warn(`Ignoring unrecognised PAYSERA_SS2_MODE="${raw}"; falling back to "enforce".`);
    }
    return 'enforce';
  }

  /**
   * Resolve the RSA public key used to verify callback ss2/ss3 signatures.
   *
   * Sources, in precedence order:
   *   1. `PAYSERA_PUBLIC_KEY`      — inline PEM (literal newlines or \n-escaped)
   *   2. `PAYSERA_PUBLIC_KEY_PATH` — path to a PEM file
   *   3. the bundled `PAYSERA_LIVE_PUBLIC_KEY_PEM` (Paysera's published key)
   *
   * Both PEM shapes Paysera publishes are accepted: an X.509 CERTIFICATE (what
   * www.paysera.com/download/public.key serves) and a bare SPKI PUBLIC KEY
   * (what sandbox.paysera.com serves).
   *
   * If an operator EXPLICITLY configured a key (source 1 or 2) and it cannot be
   * read or parsed, we deliberately do NOT silently fall back to the bundled
   * key — quietly verifying against a different key than the operator asked for
   * is the same class of bug as the empty-secret fallback above. In production
   * that is a boot failure; elsewhere it is a warning and no key at all.
   */
  private loadPublicKey(): crypto.KeyObject | null {
    const inline = process.env.PAYSERA_PUBLIC_KEY;
    const keyPath = process.env.PAYSERA_PUBLIC_KEY_PATH;

    let pem: string;
    let source: string;

    try {
      if (inline && inline.trim()) {
        // Env vars often carry PEMs with literal backslash-n escapes.
        pem = inline.includes('-----BEGIN') && !inline.includes('\n')
          ? inline.replace(/\\n/g, '\n')
          : inline;
        source = 'PAYSERA_PUBLIC_KEY';
      } else if (keyPath && keyPath.trim()) {
        pem = fs.readFileSync(keyPath.trim(), 'utf-8');
        source = `PAYSERA_PUBLIC_KEY_PATH (${keyPath.trim()})`;
      } else {
        pem = PAYSERA_LIVE_PUBLIC_KEY_PEM;
        source = 'bundled Paysera public key';
      }

      const key = PayseraService.parsePublicKeyPem(pem);
      logger.info(`Paysera callback RSA public key loaded from ${source}`);
      return key;
    } catch (error: any) {
      const explicit = Boolean((inline && inline.trim()) || (keyPath && keyPath.trim()));
      const message =
        `Failed to load the Paysera callback public key from ` +
        `${explicit ? 'PAYSERA_PUBLIC_KEY / PAYSERA_PUBLIC_KEY_PATH' : 'the bundled key'}: ${error.message}`;

      if (explicit && PayseraService.isProduction()) {
        logger.error(message);
        throw new Error(message);
      }
      logger.warn(`${message} — RSA (ss2/ss3) callback verification will be unavailable.`);
      return null;
    }
  }

  /**
   * Parse either PEM shape Paysera publishes into a public key.
   *
   * The `BEGIN CERTIFICATE` branch is NOT what makes the certificate shape
   * work: `crypto.createPublicKey` already accepts a certificate PEM and
   * returns the identical SPKI. The branch is an explicit, portable path to the
   * embedded key that does not depend on that convenience, and it is where a
   * certificate-specific check would go if one is ever wanted. Keep it, but do
   * not read it as load-bearing — removing it changes no observable behaviour
   * on Node, and no test can distinguish the two paths.
   */
  private static parsePublicKeyPem(pem: string): crypto.KeyObject {
    if (pem.includes('BEGIN CERTIFICATE')) {
      return new crypto.X509Certificate(pem).publicKey;
    }
    return crypto.createPublicKey(pem);
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
   * Decode a URL-safe-base64 string to raw bytes (Paysera's `decodeSafeUrlBase64`).
   * The explicit alphabet swap is kept for clarity/portability — Node's own
   * base64 decoder happens to accept `-`/`_` too, so this is documentation of
   * intent rather than a behavioural difference on Node.
   */
  private static decodeSafeUrlBase64(value: string): Buffer {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }

  /**
   * Length-safe constant-time string comparison, so the ss1 check cannot leak
   * how many leading characters of the expected MD5 an attacker got right.
   */
  private static timingSafeStringEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Digest used for each of Paysera's RSA signature fields, per
   * paysera/lib-webtopay `WebToPay_Sign_SSOpenSslSignChecker::SIGN_TYPE_TO_HASH_ALGO_MAP`:
   *   ss2 => OPENSSL_ALGO_SHA1, ss3 => OPENSSL_ALGO_SHA256.
   * Order matters: the last present field wins, so ss3 is preferred over ss2.
   */
  private static readonly RSA_SIGN_FIELDS: ReadonlyArray<{ field: 'ss2' | 'ss3'; digest: string }> = [
    { field: 'ss2', digest: 'sha1' },
    { field: 'ss3', digest: 'sha256' },
  ];

  /**
   * Verify callback signatures.
   *
   * ── The two signatures Paysera sends ──────────────────────────────────────
   *   ss1 — `md5(data + signPassword)`, a shared-secret MAC. Hex.
   *   ss2 — an RSA signature (PKCS#1 v1.5, SHA-1 digest) created with PAYSERA's
   *         own private key over the raw `data` string, and itself URL-safe-
   *         base64 encoded. It is NOT `sha256(data + signPassword)`; there is
   *         no shared-secret SHA-256 variant in the Paysera scheme at all.
   *   ss3 — identical to ss2 but with a SHA-256 digest; preferred when present.
   * Evidence: paysera/lib-webtopay `WebToPay_Sign_SSOpenSslSignChecker`
   * (`SIGN_TYPE_TO_HASH_ALGO_MAP = ['ss2' => OPENSSL_ALGO_SHA1, 'ss3' =>
   * OPENSSL_ALGO_SHA256]`, `decodeSafeUrlBase64($request[$signTypeKey])`, then
   * `openssl_verify($request['data'], $ssValue, $publicKey, $algo)`), and
   * `WebToPay_Factory::getSigner`, which sources the key from
   * https://www.paysera.com/download/public.key.
   *
   * ── The rule this method implements (BC-QA-031-FOLLOWUP-7) ────────────────
   *  1. ss1 is an UNCONDITIONAL HARD GATE. It is checked first and a mismatch
   *     rejects immediately, whatever ss2/ss3 say. Nothing below can relax it,
   *     so a valid RSA signature can never rescue a bad ss1.
   *  2. If an RSA field is present AND a public key is available AND mode is
   *     not 'off', the RSA signature MUST verify. A tampered, garbage or
   *     wrong-key signature REJECTS the callback.
   *  3. If NO RSA field is present, or no key could be loaded, the callback is
   *     accepted on ss1 alone and the gap is logged. Rationale: Paysera only
   *     emits ss2/ss3 for projects with OpenSSL signing enabled, so rejecting
   *     here would drop legitimate live callbacks in a deployment that has not
   *     provisioned a key yet. This is NOT a bypass — it lands exactly on the
   *     pre-existing ss1 gate, which already requires the shared signing
   *     password, so an attacker gains nothing by omitting ss2 that they did
   *     not already have.
   *
   *     `PAYSERA_SS2_MODE=require` is the mode that would close this gap, and
   *     it is CURRENTLY UNUSABLE — do not enable it as things stand:
   *       • `POST /api/payments/verify-redirect` (the guest-checkout success
   *         path, payments.paysera.routes.ts) reaches this method with `data`
   *         and `ss1` only and never an ss2, so `require` would reject 100% of
   *         that route's traffic regardless of what Paysera signs.
   *       • No in-repo caller forwards the `ss3` field at all — the route
   *         handlers and `payment-provider.ts` read `data`/`ss1`/`ss2` only —
   *         so a Paysera project that signs with ss3 (which the vendor library
   *         prefers over ss2 when both are present) is rejected under
   *         `require`, and under `enforce` is silently skipped rather than
   *         verified, landing on the ss1 gate as in rule 3.
   *     Making `require` mean what it says needs the callers to forward `ss3`
   *     and the redirect path to be exempted from the RSA requirement. Those
   *     files are outside this change; nothing here promises when that lands.
   *  4. `PAYSERA_SS2_MODE=off` is a documented break-glass for a Paysera key
   *     rotation: it skips step 2 and falls back to ss1 only. It cannot make a
   *     callback easier to forge than it was before this change.
   */
  async verifyCallback(callback: PayseraCallback): Promise<boolean> {
    try {
      // (1) ss1 — hard gate, always, first.
      const expectedSs1 = this.generateSign(callback.data);
      if (
        typeof callback.ss1 !== 'string' ||
        !PayseraService.timingSafeStringEquals(callback.ss1, expectedSs1)
      ) {
        logger.warn('Invalid MD5 signature (ss1)', { dataPrefix: callback.data.slice(0, 64) });
        return false;
      }

      // Pick the strongest RSA field present (ss3 beats ss2), matching Paysera.
      const present = PayseraService.RSA_SIGN_FIELDS.filter(
        (f) => typeof callback[f.field] === 'string' && (callback[f.field] as string).length > 0
      );
      const chosen = present.length > 0 ? present[present.length - 1] : undefined;

      if (this.ss2Mode === 'off') {
        logger.info('Callback signature verified (ss1); RSA check skipped (PAYSERA_SS2_MODE=off)');
        return true;
      }

      // (3) Nothing to verify, or nothing to verify it with.
      if (!chosen || !this.publicKey) {
        const reason = !chosen
          ? 'callback carries no ss2/ss3 signature'
          : 'no Paysera public key is configured';
        if (this.ss2Mode === 'require') {
          logger.warn(`Rejecting callback: PAYSERA_SS2_MODE=require but ${reason}`, {
            dataPrefix: callback.data.slice(0, 64),
          });
          return false;
        }
        logger.warn(`Callback verified by ss1 only — RSA signature not checked (${reason})`);
        return true;
      }

      // (2) Verify the RSA signature over the raw `data` string.
      const signature = PayseraService.decodeSafeUrlBase64(callback[chosen.field] as string);
      const rsaOk =
        signature.length > 0 &&
        crypto.verify(chosen.digest, Buffer.from(callback.data, 'utf-8'), this.publicKey, signature);

      if (!rsaOk) {
        logger.warn(`Invalid Paysera RSA signature (${chosen.field}/${chosen.digest})`, {
          dataPrefix: callback.data.slice(0, 64),
        });
        return false;
      }

      logger.info(`Callback signature verified (ss1 + ${chosen.field} RSA/${chosen.digest})`);
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
      // Verify signatures: ss1 (MD5, always) plus Paysera's RSA ss2/ss3 when the
      // callback carries one and a public key is available. See verifyCallback.
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

  /**
   * The currencies the PAYSERA GATEWAY can process.
   *
   * ⚠ THIS IS NOT AN ACCEPTANCE GATE, and must never be used as one — that is
   * exactly the mistake BC-QA-031-FOLLOWUP-1 fixed. `POST /api/payments/create`
   * used to validate the caller's currency against this list and store it
   * verbatim on `Transaction.currency`, but BoomCard has no FX rate source and
   * every read path converts/labels in EUR, so a USD row shipped its raw
   * magnitude under a EUR label.
   *
   * This method reports a PROVIDER CAPABILITY (a fact about Paysera). What
   * BoomCard is willing to store is an APPLICATION POLICY, and it is narrower:
   * see {@link getAcceptedCurrencies} / `ACCEPTED_CURRENCIES` in
   * `src/utils/currency.ts`. Keep the two apart — widening the app policy to
   * match this list again would reintroduce the defect.
   */
  static getSupportedCurrencies(): string[] {
    return ['EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON', 'BGN'];
  }

  /**
   * The currencies BOOMCARD accepts — the intersection of what the gateway can
   * process and what this application can store and display truthfully.
   *
   * Delegates to the single source of truth (`ACCEPTED_CURRENCIES`) rather than
   * repeating the codes, so the checkout metadata this service publishes and
   * the guard the write paths apply cannot drift apart.
   *
   * Two coherence properties this must keep — both asserted in
   * `tests/unit/paysera.service.test.ts` rather than claimed here, so that a
   * future edit to either list or to {@link getSupportedPaymentMethods} fails a
   * test instead of quietly falsifying a comment:
   *   1. every accepted currency is one the gateway can actually process;
   *   2. every payment method this service advertises is quoted in an accepted
   *      currency.
   */
  static getAcceptedCurrencies(): string[] {
    return [...ACCEPTED_CURRENCIES];
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
