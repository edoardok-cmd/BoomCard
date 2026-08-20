/**
 * Unit tests for the MyPOS Checkout service (BC-MYPOS-003)
 *
 * Mirrors the coverage bar of tests/unit/paysera.service.test.ts (checkout
 * creation, signature generation, callback verification, status mapping, ack
 * body, static helpers, configuration validation) and adds the negative
 * signature cases the MyPOS adapter is required to reject: missing signature,
 * invalid signature, tampered field, signature made with the wrong key,
 * mismatched store id, malformed payload, and unset verification key
 * (fail-closed).
 *
 * KEY MATERIAL: every key used here is generated in-process by
 * `crypto.generateKeyPairSync`. No real or sandbox myPOS key/certificate
 * appears anywhere in this file.
 *
 * The tests deliberately recompute the myPOS signing base
 * (`base64(values.join('-'))`) locally instead of calling the service's own
 * `buildSignatureBase`, so a mutation of the production helper cannot be
 * masked by the test using the same (mutated) code path.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { MyPOSService, MyPOSCheckoutSession } from '../../src/services/mypos.service';
import type { PaymentProvider, RefundParams } from '../../src/services/payment-provider';
import { logger } from '../../src/utils/logger';

// ---------------------------------------------------------------------------
// Throwaway key material (generated per run — nothing real is embedded)
// ---------------------------------------------------------------------------

type Keypair = { publicKey: string; privateKey: string };

function generateKeypair(): Keypair {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/** Merchant keypair: private key signs OUR outgoing IPC requests. */
let merchantKeys: Keypair;
/** myPOS keypair: its private key signs inbound notifies; public cert verifies. */
let myposKeys: Keypair;
/** An unrelated keypair, used for "signed with the wrong key" cases. */
let attackerKeys: Keypair;

/**
 * Independent implementation of the myPOS signing base, kept separate from the
 * production helper on purpose (see file header).
 */
function signingBase(values: string[]): string {
  return Buffer.from(values.join('-'), 'utf8').toString('base64');
}

function signValues(values: string[], privateKeyPem: string): string {
  return crypto.createSign('RSA-SHA256').update(signingBase(values), 'utf8').sign(privateKeyPem, 'base64');
}

function verifyValues(values: string[], signatureB64: string, publicKeyPem: string): boolean {
  return crypto
    .createVerify('RSA-SHA256')
    .update(signingBase(values), 'utf8')
    .verify(publicKeyPem, Buffer.from(signatureB64, 'base64'));
}

const STORE_ID = '000000000000010';
const WALLET_NUMBER = '61938166610';
const KEY_INDEX = '1';

const baseCheckoutParams = {
  orderId: 'BOOM-1234567890-abcd',
  amount: 5000, // 50.00 in MINOR units (cents)
  currency: 'BGN',
  description: 'BoomCard subscription',
  acceptUrl: 'https://boomcard.bg/payment/success',
  cancelUrl: 'https://boomcard.bg/payment/cancel',
  callbackUrl: 'https://api.boomcard.bg/api/payments/mypos/callback',
};

/**
 * Build a notify payload in wire order and sign it with myPOS's private key.
 * Returns the payload WITH `Signature` appended last, exactly as myPOS sends.
 */
function buildSignedNotify(
  overrides: Record<string, string> = {},
  signWith: string = myposKeys.privateKey
): Record<string, string> {
  const payload: Record<string, string> = {
    IPCmethod: 'IPCPurchaseNotify',
    IPCVersion: '1.4',
    IPCLanguage: 'en',
    SID: STORE_ID,
    WalletNumber: WALLET_NUMBER,
    Amount: '50.00',
    Currency: 'BGN',
    OrderID: 'BOOM-1234567890-abcd',
    IPC_Trnref: 'TRN-9988776655',
    Status: '0',
    StatusMsg: 'Success',
    CustomerEmail: 'buyer@example.com',
    ...overrides,
  };
  payload.Signature = signValues(Object.values(payload), signWith);
  return payload;
}

describe('MyPOSService', () => {
  let service: MyPOSService;
  let originalEnv: NodeJS.ProcessEnv;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeAll(() => {
    originalEnv = { ...process.env };
    merchantKeys = generateKeypair();
    myposKeys = generateKeypair();
    attackerKeys = generateKeypair();
  });

  beforeEach(() => {
    process.env.MYPOS_STORE_ID = STORE_ID;
    process.env.MYPOS_WALLET_NUMBER = WALLET_NUMBER;
    process.env.MYPOS_KEY_INDEX = KEY_INDEX;
    process.env.MYPOS_PRIVATE_KEY = merchantKeys.privateKey;
    process.env.MYPOS_PUBLIC_CERT = myposKeys.publicKey;
    process.env.MYPOS_TEST_MODE = 'true';

    infoSpy = jest.spyOn(logger, 'info').mockImplementation((() => logger) as any);
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
    errorSpy = jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);

    service = new MyPOSService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  /** Every string argument ever handed to the logger during a test. */
  function allLoggedText(): string {
    return [infoSpy, warnSpy, errorSpy]
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  describe('Configuration validation', () => {
    it('reports configured when every MYPOS_* var is present', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('warns with the NAMES of missing vars and does not leak their values', () => {
      delete process.env.MYPOS_PRIVATE_KEY;
      delete process.env.MYPOS_STORE_ID;

      const unconfigured = new MyPOSService();

      expect(unconfigured.isConfigured()).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MyPOS credentials not configured'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MYPOS_PRIVATE_KEY'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MYPOS_STORE_ID'));
      expect(allLoggedText()).not.toContain('BEGIN PRIVATE KEY');
    });

    it('never writes key material to the log when fully configured', () => {
      expect(allLoggedText()).not.toContain('BEGIN PRIVATE KEY');
      expect(allLoggedText()).not.toContain('BEGIN PUBLIC KEY');
      expect(allLoggedText()).not.toContain(merchantKeys.privateKey.split('\n')[1]);
    });

    it('selects the sandbox host when MYPOS_TEST_MODE=true', () => {
      expect(service.isTestMode()).toBe(true);
      expect(service.getEndpoint()).toBe('https://www.mypos.com/vmp/checkout-test');
    });

    it('selects the production host when MYPOS_TEST_MODE is unset', () => {
      delete process.env.MYPOS_TEST_MODE;
      const live = new MyPOSService();

      expect(live.isTestMode()).toBe(false);
      expect(live.getEndpoint()).toBe('https://www.mypos.com/vmp/checkout');
    });

    it('selects the production host for any value other than the literal "true"', () => {
      process.env.MYPOS_TEST_MODE = 'TRUE';
      expect(new MyPOSService().getEndpoint()).toBe('https://www.mypos.com/vmp/checkout');
    });
  });

  describe('normalizePem', () => {
    it('passes a plain PEM through', () => {
      expect(MyPOSService.normalizePem(myposKeys.publicKey)).toContain('-----BEGIN PUBLIC KEY-----');
    });

    it('restores newlines from a single-line env var with \\n escapes', () => {
      const escaped = myposKeys.publicKey.replace(/\n/g, '\\n');
      expect(MyPOSService.normalizePem(escaped)).toBe(myposKeys.publicKey.trim());
    });

    it('decodes a base64-wrapped PEM', () => {
      const wrapped = Buffer.from(myposKeys.publicKey, 'utf8').toString('base64');
      expect(MyPOSService.normalizePem(wrapped)).toBe(myposKeys.publicKey.trim());
    });

    it('returns empty string for absent or unusable values (so callers fail closed)', () => {
      expect(MyPOSService.normalizePem(undefined)).toBe('');
      expect(MyPOSService.normalizePem('')).toBe('');
      expect(MyPOSService.normalizePem('   ')).toBe('');
      expect(MyPOSService.normalizePem('not-a-key-at-all')).toBe('');
    });
  });

  // =========================================================================
  // createCheckout (IPCPurchase)
  // =========================================================================

  describe('createCheckout', () => {
    it('creates a checkout session with the expected structure', async () => {
      const result = await service.createCheckout(baseCheckoutParams);

      expect(result).toHaveProperty('orderId', baseCheckoutParams.orderId);
      expect(result).toHaveProperty('projectId', STORE_ID);
      expect(result).toHaveProperty('amount', 5000); // internal model stays in minor units
      expect(result).toHaveProperty('currency', 'BGN');
      expect(result).toHaveProperty('status', 'pending');
      expect(result.paymentUrl).toBe('https://www.mypos.com/vmp/checkout-test');
      expect(result.formMethod).toBe('POST');
      expect(result.formAction).toBe(result.paymentUrl);
      expect(result.isTest).toBe(true);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('builds the documented IPCPurchase parameter set', async () => {
      const { formFields } = await service.createCheckout(baseCheckoutParams);

      expect(formFields.IPCmethod).toBe('IPCPurchase');
      expect(formFields.IPCVersion).toBe('1.4');
      expect(formFields.SID).toBe(STORE_ID);
      expect(formFields.WalletNumber).toBe(WALLET_NUMBER);
      expect(formFields.KeyIndex).toBe(KEY_INDEX);
      expect(formFields.Currency).toBe('BGN');
      expect(formFields.OrderID).toBe(baseCheckoutParams.orderId);
      expect(formFields.URL_OK).toBe(baseCheckoutParams.acceptUrl);
      expect(formFields.URL_Cancel).toBe(baseCheckoutParams.cancelUrl);
      expect(formFields.URL_Notify).toBe(baseCheckoutParams.callbackUrl);
      expect(formFields.CartItems).toBe('1');
      expect(formFields.Article_1).toBe(baseCheckoutParams.description);
    });

    it('uses the production host when test mode is off', async () => {
      delete process.env.MYPOS_TEST_MODE;
      const live = new MyPOSService();

      const result = await live.createCheckout(baseCheckoutParams);

      expect(result.paymentUrl).toBe('https://www.mypos.com/vmp/checkout');
      expect(result.isTest).toBe(false);
    });

    // ---- amount unit handling (the classic money defect) -------------------

    it('converts the MINOR-unit amount to a major-unit wire string (5000 → "50.00")', async () => {
      const result = await service.createCheckout(baseCheckoutParams);

      expect(result.wireAmount).toBe('50.00');
      expect(result.formFields.Amount).toBe('50.00');
      expect(result.formFields.Price_1).toBe('50.00');
      expect(result.formFields.Amount_1).toBe('50.00');
      // The internal representation must NOT be rewritten to major units.
      expect(result.amount).toBe(5000);
    });

    it.each([
      [1, '0.01'],
      [99, '0.99'],
      [100, '1.00'],
      [1050, '10.50'],
      [5000, '50.00'],
      [100000, '1000.00'],
      [123456789, '1234567.89'],
    ])('converts %d cents to "%s" on the wire', async (minor, expected) => {
      const result = await service.createCheckout({ ...baseCheckoutParams, amount: minor as number });
      expect(result.formFields.Amount).toBe(expected);
      expect(result.wireAmount).toBe(expected);
    });

    it('rejects a non-integer minor-unit amount instead of silently truncating', async () => {
      await expect(service.createCheckout({ ...baseCheckoutParams, amount: 50.5 })).rejects.toThrow(
        /integer number of minor units/
      );
    });

    it('rejects a negative amount', async () => {
      await expect(service.createCheckout({ ...baseCheckoutParams, amount: -100 })).rejects.toThrow(
        /must not be negative/
      );
    });

    it('rejects a zero amount', async () => {
      await expect(service.createCheckout({ ...baseCheckoutParams, amount: 0 })).rejects.toThrow(
        /greater than zero/
      );
    });

    // ---- signature --------------------------------------------------------

    it('signs the request with the merchant private key, with Signature last', async () => {
      const { formFields } = await service.createCheckout(baseCheckoutParams);

      const keys = Object.keys(formFields);
      expect(keys[keys.length - 1]).toBe('Signature');
      expect(formFields.Signature).toBeTruthy();

      const signedValues = keys.filter((k) => k !== 'Signature').map((k) => formFields[k]);
      expect(verifyValues(signedValues, formFields.Signature, merchantKeys.publicKey)).toBe(true);
    });

    it('produces a signature that does NOT verify once any field is tampered with', async () => {
      const { formFields } = await service.createCheckout(baseCheckoutParams);

      const tampered = { ...formFields, Amount: '1.00' };
      const signedValues = Object.keys(tampered)
        .filter((k) => k !== 'Signature')
        .map((k) => tampered[k]);

      expect(verifyValues(signedValues, formFields.Signature, merchantKeys.publicKey)).toBe(false);
    });

    it('produces a signature that does NOT verify against an unrelated public key', async () => {
      const { formFields } = await service.createCheckout(baseCheckoutParams);
      const signedValues = Object.keys(formFields)
        .filter((k) => k !== 'Signature')
        .map((k) => formFields[k]);

      expect(verifyValues(signedValues, formFields.Signature, attackerKeys.publicKey)).toBe(false);
    });

    it('never logs the signature or the private key', async () => {
      const { formFields } = await service.createCheckout(baseCheckoutParams);
      const logged = allLoggedText();

      expect(logged).not.toContain(formFields.Signature);
      expect(logged).not.toContain('BEGIN PRIVATE KEY');
      // Field NAMES are logged, which is the intended diagnostic surface.
      expect(logged).toContain('Signature');
    });

    // ---- tokenisation / language / validation -----------------------------

    it('defaults CardTokenRequest to 0 and passes an explicit value through', async () => {
      const plain = await service.createCheckout(baseCheckoutParams);
      expect(plain.formFields.CardTokenRequest).toBe('0');

      const tokenising = await service.createCheckout({ ...baseCheckoutParams, cardTokenRequest: 2 });
      expect(tokenising.formFields.CardTokenRequest).toBe('2');
    });

    it('maps ISO 639-2/B languages to myPOS ISO 639-1 codes', async () => {
      expect((await service.createCheckout({ ...baseCheckoutParams, lang: 'BUL' })).formFields.IPCLanguage).toBe('bg');
      expect((await service.createCheckout({ ...baseCheckoutParams, lang: 'ENG' })).formFields.IPCLanguage).toBe('en');
      expect((await service.createCheckout({ ...baseCheckoutParams, lang: 'zz' })).formFields.IPCLanguage).toBe('zz');
      expect((await service.createCheckout({ ...baseCheckoutParams, lang: 'klingon' })).formFields.IPCLanguage).toBe(
        'en'
      );
      expect((await service.createCheckout(baseCheckoutParams)).formFields.IPCLanguage).toBe('en');
    });

    it('splits a customer name into myPOS first/family name fields', async () => {
      const { formFields } = await service.createCheckout({
        ...baseCheckoutParams,
        customerName: 'Ivan Petrov Dimitrov',
        customerEmail: 'ivan@example.com',
        customerPhone: '+359888123456',
      });

      expect(formFields.CustomerFirstNames).toBe('Ivan');
      expect(formFields.CustomerFamilyName).toBe('Petrov Dimitrov');
      expect(formFields.CustomerEmail).toBe('ivan@example.com');
      expect(formFields.CustomerPhone).toBe('+359888123456');
    });

    it('handles every supported currency', async () => {
      for (const currency of ['BGN', 'EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON']) {
        const result = await service.createCheckout({ ...baseCheckoutParams, currency });
        expect(result.currency).toBe(currency);
        expect(result.formFields.Currency).toBe(currency);
      }
    });

    it('rejects missing orderId / currency / redirect URLs', async () => {
      await expect(service.createCheckout({ ...baseCheckoutParams, orderId: '' })).rejects.toThrow(/orderId/);
      await expect(service.createCheckout({ ...baseCheckoutParams, currency: '' })).rejects.toThrow(/currency/);
      await expect(service.createCheckout({ ...baseCheckoutParams, callbackUrl: '' })).rejects.toThrow(
        /acceptUrl, cancelUrl and callbackUrl/
      );
    });

    it('fails closed (naming the env var) when the signing key is not configured', async () => {
      delete process.env.MYPOS_PRIVATE_KEY;
      const unconfigured = new MyPOSService();

      await expect(unconfigured.createCheckout(baseCheckoutParams)).rejects.toThrow(/MYPOS_PRIVATE_KEY/);
    });

    it('fails closed when the store id is not configured', async () => {
      delete process.env.MYPOS_STORE_ID;
      const unconfigured = new MyPOSService();

      await expect(unconfigured.createCheckout(baseCheckoutParams)).rejects.toThrow(/MYPOS_STORE_ID/);
    });
  });

  // =========================================================================
  // Signed field SET and ORDER — literal pins (assumptions A2 / A4)
  // =========================================================================
  //
  // The implementation's own comment calls the key order of the signed field
  // maps load-bearing: the values are concatenated in insertion order, so the
  // order IS the signature. These tests are the executable form of that claim.
  //
  // Two independent assertions per request shape, deliberately NOT derived from
  // the implementation's output:
  //   1. `Object.keys(...)` / the posted body's key sequence must equal a
  //      LITERAL expected array — catches a reordering, an added field, or a
  //      dropped field.
  //   2. the signature the implementation produced must verify against a value
  //      list this test builds LITERALLY — catches the same classes again via
  //      the crypto itself, with no dependence on the map we just read back.
  //
  // These pin the CURRENT RECONSTRUCTION so that changing it fails the build
  // and forces a deliberate re-derivation. They are NOT evidence that the
  // reconstruction matches myPOS — that needs the sandbox round-trip (A4/A5).
  // If a sandbox run proves a different set/order is correct, update BOTH the
  // implementation and the literal arrays below, in the same change.

  describe('signed field set and order (A2 / A4)', () => {
    /** Ordered key sequence of an x-www-form-urlencoded body. */
    const bodyKeys = (body: string): string[] => Array.from(new URLSearchParams(body).keys());
    /** Ordered value sequence of an x-www-form-urlencoded body. */
    const bodyValues = (body: string): string[] => Array.from(new URLSearchParams(body).values());

    const okXml = (root: string, fields: Record<string, string>): string =>
      `<?xml version="1.0"?><${root}>${Object.entries(fields)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('')}</${root}>`;

    describe('IPCPurchase (createCheckout)', () => {
      it('emits exactly this ordered field set for a minimal checkout', async () => {
        const { formFields } = await service.createCheckout(baseCheckoutParams);

        expect(Object.keys(formFields)).toEqual([
          'IPCmethod',
          'IPCVersion',
          'IPCLanguage',
          'SID',
          'WalletNumber',
          'KeyIndex',
          'Amount',
          'Currency',
          'OrderID',
          'URL_OK',
          'URL_Cancel',
          'URL_Notify',
          'CardTokenRequest',
          'PaymentParametersRequired',
          'CartItems',
          'Article_1',
          'Quantity_1',
          'Price_1',
          'Amount_1',
          'Signature',
        ]);
      });

      it('signs exactly this ordered value list for a minimal checkout', async () => {
        const { formFields } = await service.createCheckout(baseCheckoutParams);

        // Built literally here — NOT read back from `formFields`.
        const expectedSignedValues = [
          'IPCPurchase',
          '1.4',
          'en',
          STORE_ID,
          WALLET_NUMBER,
          KEY_INDEX,
          '50.00',
          'BGN',
          baseCheckoutParams.orderId,
          baseCheckoutParams.acceptUrl,
          baseCheckoutParams.cancelUrl,
          baseCheckoutParams.callbackUrl,
          '0',
          '1',
          '1',
          baseCheckoutParams.description,
          '1',
          '50.00',
          '50.00',
        ];

        expect(verifyValues(expectedSignedValues, formFields.Signature, merchantKeys.publicKey)).toBe(true);
      });

      it('emits exactly this ordered field set when every optional field is supplied', async () => {
        const { formFields } = await service.createCheckout({
          ...baseCheckoutParams,
          lang: 'BUL',
          country: 'BG',
          cardTokenRequest: 2,
          customerEmail: 'ivan@example.com',
          customerName: 'Ivan Petrov',
          customerPhone: '+359888123456',
          note: 'Monthly plan',
        });

        expect(Object.keys(formFields)).toEqual([
          'IPCmethod',
          'IPCVersion',
          'IPCLanguage',
          'SID',
          'WalletNumber',
          'KeyIndex',
          'Amount',
          'Currency',
          'OrderID',
          'URL_OK',
          'URL_Cancel',
          'URL_Notify',
          'CardTokenRequest',
          'PaymentParametersRequired',
          'CustomerEmail',
          'CustomerFirstNames',
          'CustomerFamilyName',
          'CustomerPhone',
          'CustomerCountry',
          'Note',
          'CartItems',
          'Article_1',
          'Quantity_1',
          'Price_1',
          'Amount_1',
          'Signature',
        ]);
      });

      it('signs exactly this ordered value list when every optional field is supplied', async () => {
        const { formFields } = await service.createCheckout({
          ...baseCheckoutParams,
          lang: 'BUL',
          country: 'BG',
          cardTokenRequest: 2,
          customerEmail: 'ivan@example.com',
          customerName: 'Ivan Petrov',
          customerPhone: '+359888123456',
          note: 'Monthly plan',
        });

        const expectedSignedValues = [
          'IPCPurchase',
          '1.4',
          'bg',
          STORE_ID,
          WALLET_NUMBER,
          KEY_INDEX,
          '50.00',
          'BGN',
          baseCheckoutParams.orderId,
          baseCheckoutParams.acceptUrl,
          baseCheckoutParams.cancelUrl,
          baseCheckoutParams.callbackUrl,
          '2',
          '1',
          'ivan@example.com',
          'Ivan',
          'Petrov',
          '+359888123456',
          'BG',
          'Monthly plan',
          '1',
          baseCheckoutParams.description,
          '1',
          '50.00',
          '50.00',
        ];

        expect(verifyValues(expectedSignedValues, formFields.Signature, merchantKeys.publicKey)).toBe(true);
      });

      it('omits CustomerFamilyName (and nothing else) for a single-word customer name', async () => {
        const { formFields } = await service.createCheckout({
          ...baseCheckoutParams,
          customerName: 'Ivan',
        });

        expect(Object.keys(formFields)).toEqual([
          'IPCmethod',
          'IPCVersion',
          'IPCLanguage',
          'SID',
          'WalletNumber',
          'KeyIndex',
          'Amount',
          'Currency',
          'OrderID',
          'URL_OK',
          'URL_Cancel',
          'URL_Notify',
          'CardTokenRequest',
          'PaymentParametersRequired',
          'CustomerFirstNames',
          'CartItems',
          'Article_1',
          'Quantity_1',
          'Price_1',
          'Amount_1',
          'Signature',
        ]);
      });
    });

    describe('IPCRefund (refund)', () => {
      it('posts exactly this ordered field set', async () => {
        const post = jest
          .spyOn(axios, 'post')
          .mockResolvedValue({ status: 200, data: okXml('IPCRefund', { Status: '0', IPC_Trnref: 'RFD-1' }) } as any);

        await service.refund({
          transactionId: 'TRN-9988776655',
          amount: 5000,
          currency: 'BGN',
          orderId: 'REFUND-BOOM-ORDER',
        });

        expect(bodyKeys(post.mock.calls[0][1] as string)).toEqual([
          'IPCmethod',
          'IPCVersion',
          'IPCLanguage',
          'SID',
          'WalletNumber',
          'KeyIndex',
          'Amount',
          'Currency',
          'OrderID',
          'IPC_Trnref',
          'OutputFormat',
          'Signature',
        ]);
      });

      it('signs exactly this ordered value list', async () => {
        const post = jest
          .spyOn(axios, 'post')
          .mockResolvedValue({ status: 200, data: okXml('IPCRefund', { Status: '0', IPC_Trnref: 'RFD-1' }) } as any);

        await service.refund({
          transactionId: 'TRN-9988776655',
          amount: 5000,
          currency: 'BGN',
          orderId: 'REFUND-BOOM-ORDER',
        });

        const expectedSignedValues = [
          'IPCRefund',
          '1.4',
          'en',
          STORE_ID,
          WALLET_NUMBER,
          KEY_INDEX,
          '50.00',
          'BGN',
          'REFUND-BOOM-ORDER',
          'TRN-9988776655',
          'xml',
        ];
        const values = bodyValues(post.mock.calls[0][1] as string);
        const signature = values[values.length - 1];

        expect(verifyValues(expectedSignedValues, signature, merchantKeys.publicKey)).toBe(true);
      });
    });

    describe('IPCReversal (reverse)', () => {
      it('posts exactly this ordered field set (no Amount — reversal is all-or-nothing)', async () => {
        const post = jest
          .spyOn(axios, 'post')
          .mockResolvedValue({ status: 200, data: okXml('IPCReversal', { Status: '0' }) } as any);

        await service.reverse({ transactionId: 'TRN-9988776655' });

        expect(bodyKeys(post.mock.calls[0][1] as string)).toEqual([
          'IPCmethod',
          'IPCVersion',
          'IPCLanguage',
          'SID',
          'WalletNumber',
          'KeyIndex',
          'IPC_Trnref',
          'OutputFormat',
          'Signature',
        ]);
      });

      it('signs exactly this ordered value list', async () => {
        const post = jest
          .spyOn(axios, 'post')
          .mockResolvedValue({ status: 200, data: okXml('IPCReversal', { Status: '0' }) } as any);

        await service.reverse({ transactionId: 'TRN-9988776655' });

        const expectedSignedValues = [
          'IPCReversal',
          '1.4',
          'en',
          STORE_ID,
          WALLET_NUMBER,
          KEY_INDEX,
          'TRN-9988776655',
          'xml',
        ];
        const values = bodyValues(post.mock.calls[0][1] as string);

        expect(verifyValues(expectedSignedValues, values[values.length - 1], merchantKeys.publicKey)).toBe(true);
      });
    });

    describe('IPCGetTxnStatus (getPaymentStatus)', () => {
      it('posts exactly this ordered field set', async () => {
        const post = jest
          .spyOn(axios, 'post')
          .mockResolvedValue({ status: 200, data: okXml('IPCGetTxnStatus', { Status: '0' }) } as any);

        await service.getPaymentStatus('BOOM-1234567890-abcd');

        expect(bodyKeys(post.mock.calls[0][1] as string)).toEqual([
          'IPCmethod',
          'IPCVersion',
          'IPCLanguage',
          'SID',
          'WalletNumber',
          'KeyIndex',
          'OrderID',
          'OutputFormat',
          'Signature',
        ]);
      });

      it('signs exactly this ordered value list', async () => {
        const post = jest
          .spyOn(axios, 'post')
          .mockResolvedValue({ status: 200, data: okXml('IPCGetTxnStatus', { Status: '0' }) } as any);

        await service.getPaymentStatus('BOOM-1234567890-abcd');

        const expectedSignedValues = [
          'IPCGetTxnStatus',
          '1.4',
          'en',
          STORE_ID,
          WALLET_NUMBER,
          KEY_INDEX,
          'BOOM-1234567890-abcd',
          'xml',
        ];
        const values = bodyValues(post.mock.calls[0][1] as string);

        expect(verifyValues(expectedSignedValues, values[values.length - 1], merchantKeys.publicKey)).toBe(true);
      });
    });

    it('sends every outbound IPC call to the endpoint for the current mode (assumption A5)', async () => {
      const post = jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ status: 200, data: okXml('IPCRefund', { Status: '0' }) } as any);

      await service.refund({ transactionId: 'TRN-1', amount: 100, currency: 'BGN', orderId: 'R-1' });
      await service.reverse({ transactionId: 'TRN-1' });
      await service.getPaymentStatus('BOOM-1');

      for (const call of post.mock.calls) {
        expect(call[0]).toBe('https://www.mypos.com/vmp/checkout-test');
      }
    });
  });

  // =========================================================================
  // verifyAndParseWebhook (IPCPurchaseNotify)
  // =========================================================================

  describe('verifyAndParseWebhook', () => {
    it('accepts a correctly signed notify and maps it to the internal model', async () => {
      const payload = buildSignedNotify();

      const result = await service.verifyAndParseWebhook(payload);

      expect(result.orderId).toBe('BOOM-1234567890-abcd');
      expect(result.status).toBe('success');
      expect(result.rawStatus).toBe('0');
      expect(result.amount).toBe(5000); // "50.00" major → 5000 minor
      expect(result.currency).toBe('BGN');
      expect(result.transactionId).toBe('TRN-9988776655');
      expect(result.ipcTrnref).toBe('TRN-9988776655');
      expect(result.ipcMethod).toBe('IPCPurchaseNotify');
      expect(result.storeId).toBe(STORE_ID);
      expect(result.payerEmail).toBe('buyer@example.com');
      expect(result.statusMsg).toBe('Success');
      expect(result.isTest).toBe(true);
    });

    it('converts the major-unit wire amount back to minor units exactly', async () => {
      for (const [wire, minor] of [
        ['0.01', 1],
        ['0.99', 99],
        ['10.50', 1050],
        ['1000.00', 100000],
        ['1234567.89', 123456789],
      ] as Array<[string, number]>) {
        const result = await service.verifyAndParseWebhook(buildSignedNotify({ Amount: wire }));
        expect(result.amount).toBe(minor);
      }
    });

    it('surfaces the dedupe keys the caller needs (stateless — no built-in replay cache)', async () => {
      const payload = buildSignedNotify();

      const first = await service.verifyAndParseWebhook(payload);
      const replay = await service.verifyAndParseWebhook(payload);

      // The adapter intentionally verifies a replay again rather than silently
      // swallowing it; the caller dedupes on (storeId, orderId, ipcTrnref)
      // against durable state.
      expect(replay).toEqual(first);
      expect(first.storeId).toBe(STORE_ID);
      expect(first.orderId).toBeTruthy();
      expect(first.ipcTrnref).toBeTruthy();
    });

    it('surfaces a card token without ever logging it, and only a masked last-4', async () => {
      const payload = buildSignedNotify({ CardToken: 'tok_ABC123SECRET', CardMask: '4111 11** **** 1234' });

      const result = await service.verifyAndParseWebhook(payload);

      expect(result.cardToken).toBe('tok_ABC123SECRET');
      expect(result.cardLast4).toBe('1234');
      expect(allLoggedText()).not.toContain('tok_ABC123SECRET');
      expect(allLoggedText()).not.toContain('411111');
    });

    // ---- negative signature cases ----------------------------------------

    it('rejects a payload with NO Signature field', async () => {
      const payload = buildSignedNotify();
      delete payload.Signature;

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/missing Signature/);
    });

    it('rejects a payload with an empty Signature field', async () => {
      const payload = buildSignedNotify();
      payload.Signature = '   ';

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/missing Signature/);
    });

    it('rejects a garbage signature', async () => {
      const payload = buildSignedNotify();
      payload.Signature = 'not-a-real-signature';

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('rejects a structurally valid signature taken from a different message', async () => {
      const other = buildSignedNotify({ OrderID: 'SOME-OTHER-ORDER', IPC_Trnref: 'TRN-0000000000' });
      const payload = buildSignedNotify();
      payload.Signature = other.Signature;

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('rejects a payload whose Amount was tampered with after signing', async () => {
      const payload = buildSignedNotify();
      payload.Amount = '5000.00';

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('rejects a payload whose Status was tampered with after signing', async () => {
      const payload = buildSignedNotify({ Status: '9' });
      payload.Status = '0'; // flip a decline into a "success" after signing

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('rejects a payload with an injected extra field', async () => {
      const payload = buildSignedNotify();
      payload.ExtraField = 'injected';

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('rejects a payload signed with the WRONG private key', async () => {
      const payload = buildSignedNotify({}, attackerKeys.privateKey);

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    // ---- message type ----------------------------------------------------
    //
    // A valid signature proves the payload came from myPOS, NOT which IPC
    // message it is — every IPC message is signed with the same key under the
    // same scheme. These payloads are signed with the real myPOS key and are
    // otherwise byte-identical to a good notify; only `IPCmethod` differs.

    it('rejects the IPCPurchaseOK browser-redirect twin even though it is genuinely myPOS-signed', async () => {
      // IPCPurchaseOK is delivered to the CUSTOMER'S OWN BROWSER at URL_OK, so
      // a customer legitimately holds a signed copy for their own order and can
      // POST it to the public notify URL. myPOS explicitly warns not to
      // authorize off it (spike §2 row 2) because it can precede final capture.
      const payload = buildSignedNotify({ IPCmethod: 'IPCPurchaseOK' });

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(
        /expected IPCPurchaseNotify, got "IPCPurchaseOK"/
      );
    });

    it('rejects an unknown IPCmethod value', async () => {
      const payload = buildSignedNotify({ IPCmethod: 'IPCTotallyMadeUp' });

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/expected IPCPurchaseNotify/);
    });

    it.each(['IPCRefund', 'IPCReversal', 'IPCGetTxnStatus', 'IPCIAPurchase', ''])(
      'rejects a signed message whose IPCmethod is "%s"',
      async (method) => {
        const payload = buildSignedNotify({ IPCmethod: method });

        await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/expected IPCPurchaseNotify/);
      }
    );

    it('rejects a payload with no IPCmethod field at all', async () => {
      const payload = buildSignedNotify();
      delete payload.IPCmethod;
      payload.Signature = signValues(
        Object.keys(payload)
          .filter((k) => k !== 'Signature')
          .map((k) => payload[k]),
        myposKeys.privateKey
      );

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/expected IPCPurchaseNotify/);
    });

    it('accepts IPCmethod case-insensitively', async () => {
      const payload = buildSignedNotify({ IPCmethod: 'ipcpurchasenotify' });

      const result = await service.verifyAndParseWebhook(payload);

      expect(result.status).toBe('success');
      expect(result.ipcMethod).toBe('ipcpurchasenotify');
    });

    it('sanitises an attacker-influenced IPCmethod before it reaches the log or the error', async () => {
      const payload = buildSignedNotify({ IPCmethod: `IPCPurchaseNotify\ninjected: line${'x'.repeat(200)}` });

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/expected IPCPurchaseNotify/);

      const logged = allLoggedText();
      expect(logged).not.toContain('\ninjected: line');
      expect(logged).not.toContain('x'.repeat(120));
    });

    it('checks the message type only AFTER the signature, so an unsigned wrong-method payload fails on the signature', async () => {
      const payload = buildSignedNotify({ IPCmethod: 'IPCPurchaseOK' });
      payload.Signature = 'not-a-real-signature';

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('rejects a payload for an unknown / mismatched store id (SID)', async () => {
      const payload = buildSignedNotify({ SID: '999999999999999' });

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/store id/i);
    });

    // ---- fail-closed configuration ---------------------------------------

    it('FAILS CLOSED when MYPOS_PUBLIC_CERT is unset — never accepts an unverified payload', async () => {
      const payload = buildSignedNotify();
      delete process.env.MYPOS_PUBLIC_CERT;
      const unconfigured = new MyPOSService();

      await expect(unconfigured.verifyAndParseWebhook(payload)).rejects.toThrow(/MYPOS_PUBLIC_CERT/);
    });

    it('FAILS CLOSED when MYPOS_PUBLIC_CERT is an empty string (no empty-key fallback)', async () => {
      const payload = buildSignedNotify();
      process.env.MYPOS_PUBLIC_CERT = '';
      const unconfigured = new MyPOSService();

      await expect(unconfigured.verifyAndParseWebhook(payload)).rejects.toThrow(/MYPOS_PUBLIC_CERT/);
    });

    it('FAILS CLOSED when MYPOS_PUBLIC_CERT holds unusable material', async () => {
      const payload = buildSignedNotify();
      process.env.MYPOS_PUBLIC_CERT = 'garbage-not-a-pem';
      const unconfigured = new MyPOSService();

      await expect(unconfigured.verifyAndParseWebhook(payload)).rejects.toThrow(/MYPOS_PUBLIC_CERT/);
    });

    it('FAILS CLOSED when the store id is not configured', async () => {
      const payload = buildSignedNotify();
      delete process.env.MYPOS_STORE_ID;
      const unconfigured = new MyPOSService();

      await expect(unconfigured.verifyAndParseWebhook(payload)).rejects.toThrow(/MYPOS_STORE_ID/);
    });

    // ---- malformed payloads ----------------------------------------------

    it('rejects malformed payloads', async () => {
      await expect(service.verifyAndParseWebhook(null as any)).rejects.toThrow(/malformed payload/);
      await expect(service.verifyAndParseWebhook(undefined as any)).rejects.toThrow(/malformed payload/);
      await expect(service.verifyAndParseWebhook([] as any)).rejects.toThrow(/malformed payload/);
      await expect(service.verifyAndParseWebhook({})).rejects.toThrow(/empty payload/);
      await expect(
        service.verifyAndParseWebhook({ SID: STORE_ID, Nested: { a: 1 }, Signature: 'x' })
      ).rejects.toThrow(/non-scalar value/);
      await expect(service.verifyAndParseWebhook({ SID: STORE_ID, Empty: null, Signature: 'x' })).rejects.toThrow(
        /empty value/
      );
    });

    it('rejects a signed payload that is missing OrderID or IPC_Trnref', async () => {
      const withoutOrder = buildSignedNotify();
      delete withoutOrder.OrderID;
      withoutOrder.Signature = signValues(
        Object.keys(withoutOrder)
          .filter((k) => k !== 'Signature')
          .map((k) => withoutOrder[k]),
        myposKeys.privateKey
      );
      await expect(service.verifyAndParseWebhook(withoutOrder)).rejects.toThrow(/missing OrderID or IPC_Trnref/);

      const withoutTrnref = buildSignedNotify();
      delete withoutTrnref.IPC_Trnref;
      withoutTrnref.Signature = signValues(
        Object.keys(withoutTrnref)
          .filter((k) => k !== 'Signature')
          .map((k) => withoutTrnref[k]),
        myposKeys.privateKey
      );
      await expect(service.verifyAndParseWebhook(withoutTrnref)).rejects.toThrow(/missing OrderID or IPC_Trnref/);
    });

    it('rejects a signed payload whose Amount is unparseable rather than crediting zero', async () => {
      const payload = buildSignedNotify({ Amount: '50,00,00' });

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/amount is malformed/i);
    });

    // ---- status mapping through the webhook ------------------------------

    it('maps an unrecognised status code to "unknown", never to "success"', async () => {
      for (const raw of ['1', '2', '3', '17', 'OK', 'success']) {
        const result = await service.verifyAndParseWebhook(buildSignedNotify({ Status: raw }));
        expect(result.status).toBe('unknown');
        expect(result.rawStatus).toBe(raw);
      }
    });

    it('rejects a signed notify carrying a NEGATIVE Amount rather than reporting negative money', async () => {
      // Third member of the inbound Amount family: malformed throws, absent
      // warns-and-reports-0, negative throws. A negative charge is not a valid
      // state for a purchase notify, and this is the field a caller credits from.
      const payload = buildSignedNotify({ Amount: '-50.00' });

      await expect(service.verifyAndParseWebhook(payload)).rejects.toThrow(/negative Amount/);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('negative Amount'));
    });

    it('accepts a zero Amount that was actually sent (only negatives are refused)', async () => {
      const result = await service.verifyAndParseWebhook(buildSignedNotify({ Amount: '0.00' }));

      expect(result.amount).toBe(0);
      expect(result.status).toBe('success');
    });

    it('keeps the shared parser sign-permissive for the outbound echo paths', () => {
      // The guard lives in verifyAndParseWebhook, not in the parser, because a
      // refund/status echo can legitimately carry a negative amount.
      expect(MyPOSService.majorStringToMinorUnits('-50.00')).toBe(-5000);
    });

    it('warns when a notify carries no Amount field instead of reporting a silent zero', async () => {
      const payload = buildSignedNotify();
      delete payload.Amount;
      payload.Signature = signValues(
        Object.keys(payload)
          .filter((k) => k !== 'Signature')
          .map((k) => payload[k]),
        myposKeys.privateKey
      );

      const result = await service.verifyAndParseWebhook(payload);

      expect(result.amount).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no Amount field'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('field absent, not observed zero'));
    });

    it('does NOT warn about a missing Amount when one was actually sent', async () => {
      await service.verifyAndParseWebhook(buildSignedNotify({ Amount: '0.00' }));

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('no Amount field'));
    });

    it('maps a notify with no Status field to "unknown" and warns', async () => {
      const payload = buildSignedNotify();
      delete payload.Status;
      payload.Signature = signValues(
        Object.keys(payload)
          .filter((k) => k !== 'Signature')
          .map((k) => payload[k]),
        myposKeys.privateKey
      );

      const result = await service.verifyAndParseWebhook(payload);

      expect(result.status).toBe('unknown');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no Status field'));
    });
  });

  // =========================================================================
  // resolveVerificationKey — the `BEGIN CERTIFICATE` branch
  // (BC-MYPOS-003-FOLLOWUP-1, item 4)
  // =========================================================================

  /**
   * Every other test in this file configures `MYPOS_PUBLIC_CERT` with a bare
   * RSA public key (`-----BEGIN PUBLIC KEY-----`, from `generateKeypair()`),
   * which only ever exercises `resolveVerificationKey`'s
   * `crypto.createPublicKey(pem)` branch. The `pem.includes('BEGIN
   * CERTIFICATE')` branch — `new crypto.X509Certificate(pem).publicKey` — is
   * what myPOS actually issues in production (an X.509 certificate, not a
   * bare key), and it was previously unreachable by any unit test: Node's
   * `crypto` module has no `createCertificate`/self-signing API, so it
   * cannot be generated in-process the way the rest of this file generates
   * its RSA keypairs.
   *
   * The fixture pair below closes that gap: a real, valid, self-signed X.509
   * certificate plus its matching private key, generated once via
   * `openssl req -x509 ...` and checked in under `tests/unit/fixtures/` (see
   * that directory for the exact generation command and the fingerprint).
   * Both are throwaway test-only material with no relationship to any real
   * myPOS store or credential.
   */
  describe('resolveVerificationKey — BEGIN CERTIFICATE branch', () => {
    const FIXTURES_DIR = path.join(__dirname, 'fixtures');
    const selfSignedCertPem = fs.readFileSync(
      path.join(FIXTURES_DIR, 'mypos-test-self-signed-cert.pem'),
      'utf8'
    );
    const selfSignedKeyPem = fs.readFileSync(path.join(FIXTURES_DIR, 'mypos-test-self-signed-key.pem'), 'utf8');

    /**
     * A fresh instance configured with the CERTIFICATE as `MYPOS_PUBLIC_CERT`.
     * Deliberately NOT the outer `service` — `MyPOSService` reads `MYPOS_*`
     * env vars once, in its constructor (`loadConfigFromEnv`), so mutating
     * `process.env` after the outer `beforeEach` already built `service`
     * would have no effect on it and every assertion below would silently
     * run against the bare-public-key config instead of the certificate,
     * passing the "rejects" cases for the wrong reason.
     */
    let certService: MyPOSService;

    beforeEach(() => {
      process.env.MYPOS_PUBLIC_CERT = selfSignedCertPem;
      certService = new MyPOSService();
    });

    it('sanity check: the fixture is genuinely a certificate, not a bare key', () => {
      expect(selfSignedCertPem).toContain('-----BEGIN CERTIFICATE-----');
      expect(selfSignedCertPem).not.toContain('-----BEGIN PUBLIC KEY-----');
      // And it parses as a real X.509 certificate with an RSA public key —
      // confirms the fixture itself, independent of MyPOSService.
      const parsed = new crypto.X509Certificate(selfSignedCertPem);
      expect(parsed.publicKey.asymmetricKeyType).toBe('rsa');
    });

    it('verifies a genuinely-signed notify through the BEGIN CERTIFICATE branch', async () => {
      const payload = buildSignedNotify({}, selfSignedKeyPem);

      const result = await certService.verifyAndParseWebhook(payload);

      expect(result.status).toBe('success');
      expect(result.orderId).toBe('BOOM-1234567890-abcd');
    });

    it('still rejects a bad signature when verifying through a certificate', async () => {
      // Signed with an unrelated keypair, NOT the certificate's own key —
      // must be rejected by resolveVerificationKey's certificate branch.
      const payload = buildSignedNotify({}, attackerKeys.privateKey);

      await expect(certService.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('still rejects a tampered field when verifying through a certificate', async () => {
      const payload = buildSignedNotify({}, selfSignedKeyPem);
      payload.Amount = '999999.00';

      await expect(certService.verifyAndParseWebhook(payload)).rejects.toThrow(/invalid signature/);
    });

    it('still fails closed on unusable certificate material', async () => {
      process.env.MYPOS_PUBLIC_CERT = '-----BEGIN CERTIFICATE-----\nbm90LWEtcmVhbC1jZXJ0\n-----END CERTIFICATE-----';
      const unusable = new MyPOSService();
      const payload = buildSignedNotify({}, selfSignedKeyPem);

      await expect(unusable.verifyAndParseWebhook(payload)).rejects.toThrow(/verification key is unusable/);
    });
  });

  // =========================================================================
  // mapStatus
  // =========================================================================

  describe('mapStatus', () => {
    it('maps "0" to "success"', () => {
      expect(service.mapStatus('0')).toBe('success');
    });

    it('maps every other code to "unknown"', () => {
      for (const raw of ['1', '2', '3', '4', '5', '999', '', 'OK', 'weird']) {
        expect(service.mapStatus(raw)).toBe('unknown');
      }
    });

    it('maps null/undefined to "unknown"', () => {
      expect(service.mapStatus(undefined as any)).toBe('unknown');
      expect(service.mapStatus(null as any)).toBe('unknown');
    });

    it('never maps an unknown code to "success"', () => {
      const codes = Array.from({ length: 50 }, (_, i) => String(i + 1));
      for (const code of codes) {
        expect(service.mapStatus(code)).not.toBe('success');
      }
    });
  });

  // =========================================================================
  // Webhook ack
  // =========================================================================

  describe('getWebhookAckResponse', () => {
    it('returns the literal "OK" body myPOS needs to stop retrying', () => {
      expect(service.getWebhookAckResponse()).toBe('OK');
    });
  });

  // =========================================================================
  // Payouts — unsupported by design (spike §3 NO-GO)
  // =========================================================================

  describe('payouts', () => {
    it('reports payouts as not configured', () => {
      expect(service.isPayoutConfigured()).toBe(false);
    });

    it('throws loudly instead of pretending a payout was sent', async () => {
      await expect(
        service.createPayout({
          amountEUR: 12.34,
          beneficiaryIban: 'BG80BNBG96611020345678',
          beneficiaryName: 'Ivan Petrov',
          purpose: 'BoomCard cashback',
          callbackUrl: 'https://api.boomcard.bg/api/payments/transfer-callback',
        })
      ).rejects.toThrow(/does not support merchant-initiated payouts/);
    });
  });

  // =========================================================================
  // refund (IPCRefund)
  // =========================================================================

  describe('refund', () => {
    const refundXml = (fields: Record<string, string>): string =>
      `<?xml version="1.0" encoding="utf-8"?>\n<IPCRefund>${Object.entries(fields)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('')}</IPCRefund>`;

    function mockPost(xml: string): jest.SpyInstance {
      return jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: xml } as any);
    }

    it('posts a signed IPCRefund and returns the refund reference', async () => {
      const post = mockPost(
        refundXml({ IPCmethod: 'IPCRefund', Status: '0', StatusMsg: 'Success', IPC_Trnref: 'RFD-123', Amount: '50.00' })
      );

      const result = await service.refund({
        transactionId: 'TRN-9988776655',
        amount: 5000,
        currency: 'BGN',
        orderId: 'REFUND-BOOM-1',
      });

      expect(result.refundId).toBe('RFD-123');
      expect(result.status).toBe('success');
      expect(result.rawStatus).toBe('0');
      expect(result.originalTransactionId).toBe('TRN-9988776655');
      expect(result.amount).toBe(5000);

      expect(post).toHaveBeenCalledTimes(1);
      const [url, body] = post.mock.calls[0];
      expect(url).toBe('https://www.mypos.com/vmp/checkout-test');

      const sent = new URLSearchParams(body as string);
      expect(sent.get('IPCmethod')).toBe('IPCRefund');
      expect(sent.get('SID')).toBe(STORE_ID);
      expect(sent.get('KeyIndex')).toBe(KEY_INDEX);
      expect(sent.get('IPC_Trnref')).toBe('TRN-9988776655');
      expect(sent.get('OrderID')).toBe('REFUND-BOOM-1');
      expect(sent.get('Amount')).toBe('50.00'); // minor → major on the wire
      expect(sent.get('Currency')).toBe('BGN');
      expect(sent.get('Signature')).toBeTruthy();
    });

    it('signs the refund request with the merchant key, Signature last', async () => {
      const post = mockPost(refundXml({ Status: '0', IPC_Trnref: 'RFD-123' }));

      await service.refund({
        transactionId: 'TRN-9988776655',
        amount: 2550,
        currency: 'EUR',
        orderId: 'REFUND-BOOM-2',
      });

      const body = post.mock.calls[0][1] as string;
      const entries = Array.from(new URLSearchParams(body).entries());
      expect(entries[entries.length - 1][0]).toBe('Signature');

      const values = entries.filter(([k]) => k !== 'Signature').map(([, v]) => v);
      const signature = entries[entries.length - 1][1];
      expect(verifyValues(values, signature, merchantKeys.publicKey)).toBe(true);
    });

    it('sends a partial refund amount converted from minor units (2550 → "25.50")', async () => {
      const post = mockPost(refundXml({ Status: '0', IPC_Trnref: 'RFD-partial' }));

      await service.refund({
        transactionId: 'TRN-9988776655',
        amount: 2550,
        currency: 'EUR',
        orderId: 'REFUND-BOOM-3',
      });

      expect(new URLSearchParams(post.mock.calls[0][1] as string).get('Amount')).toBe('25.50');
    });

    it('throws when myPOS reports a non-success status (never records a declined refund)', async () => {
      mockPost(refundXml({ Status: '4', StatusMsg: 'Invalid signature' }));

      await expect(
        service.refund({
          transactionId: 'TRN-9988776655',
          amount: 5000,
          currency: 'BGN',
          orderId: 'REFUND-BOOM-4',
        })
      ).rejects.toThrow(/refund failed .*status=4/);
    });

    it('rejects invalid amounts', async () => {
      const post = mockPost(refundXml({ Status: '0' }));
      const base = { transactionId: 'TRN-1', currency: 'BGN', orderId: 'REFUND-X' };

      await expect(service.refund({ ...base, amount: 0 })).rejects.toThrow(/greater than zero/);
      await expect(service.refund({ ...base, amount: -1 })).rejects.toThrow(/must not be negative/);
      await expect(service.refund({ ...base, amount: 12.5 })).rejects.toThrow(/integer number of minor units/);
      await expect(service.refund({ ...base, amount: undefined as any })).rejects.toThrow(/explicit amount/);
      expect(post).not.toHaveBeenCalled();
    });

    it('rejects missing transactionId, currency, or retry-stable orderId', async () => {
      const post = mockPost(refundXml({ Status: '0' }));

      await expect(
        service.refund({ transactionId: '', amount: 100, currency: 'BGN', orderId: 'R-1' })
      ).rejects.toThrow(/transactionId/);
      await expect(
        service.refund({ transactionId: 'TRN-1', amount: 100, currency: '', orderId: 'R-1' })
      ).rejects.toThrow(/currency/);
      await expect(
        service.refund({ transactionId: 'TRN-1', amount: 100, currency: 'BGN', orderId: '' })
      ).rejects.toThrow(/retry-stable orderId/);
      expect(post).not.toHaveBeenCalled();
    });

    it('fails closed when signing credentials are missing', async () => {
      delete process.env.MYPOS_PRIVATE_KEY;
      const unconfigured = new MyPOSService();
      const post = mockPost(refundXml({ Status: '0' }));

      await expect(
        unconfigured.refund({ transactionId: 'TRN-1', amount: 100, currency: 'BGN', orderId: 'R-1' })
      ).rejects.toThrow(/MYPOS_PRIVATE_KEY/);
      expect(post).not.toHaveBeenCalled();
    });

    it('surfaces transport failures without leaking the signed request body', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue({ response: { status: 502 }, message: 'Bad Gateway' } as any);

      await expect(
        service.refund({ transactionId: 'TRN-1', amount: 100, currency: 'BGN', orderId: 'R-1' })
      ).rejects.toThrow(/refund request failed: HTTP 502/);
      expect(allLoggedText()).not.toContain('Signature=');
    });
  });

  // =========================================================================
  // reverse (IPCReversal)
  // =========================================================================

  describe('reverse', () => {
    const reversalXml = (fields: Record<string, string>): string =>
      `<?xml version="1.0"?><IPCReversal>${Object.entries(fields)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('')}</IPCReversal>`;

    it('posts a signed IPCReversal and maps the result', async () => {
      const post = jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ status: 200, data: reversalXml({ Status: '0', StatusMsg: 'Reversed' }) } as any);

      const result = await service.reverse({ transactionId: 'TRN-9988776655' });

      expect(result.status).toBe('success');
      expect(result.rawStatus).toBe('0');
      expect(result.statusMsg).toBe('Reversed');

      const sent = new URLSearchParams(post.mock.calls[0][1] as string);
      expect(sent.get('IPCmethod')).toBe('IPCReversal');
      expect(sent.get('IPC_Trnref')).toBe('TRN-9988776655');
      expect(sent.get('Amount')).toBeNull(); // reversal is all-or-nothing
      expect(sent.get('Signature')).toBeTruthy();
    });

    it('throws when myPOS declines the reversal', async () => {
      jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ status: 200, data: reversalXml({ Status: '6', StatusMsg: 'Not found' }) } as any);

      await expect(service.reverse({ transactionId: 'TRN-X' })).rejects.toThrow(/reversal failed .*status=6/);
    });

    it('requires a transaction reference', async () => {
      await expect(service.reverse({ transactionId: '' })).rejects.toThrow(/transactionId/);
    });
  });

  // =========================================================================
  // getPaymentStatus (IPCGetTxnStatus)
  // =========================================================================

  describe('getPaymentStatus', () => {
    const statusXml = (fields: Record<string, string>): string =>
      `<?xml version="1.0"?><IPCGetTxnStatus>${Object.entries(fields)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('')}</IPCGetTxnStatus>`;

    it('queries by our order id and maps the transaction status', async () => {
      const post = jest.spyOn(axios, 'post').mockResolvedValue({
        status: 200,
        data: statusXml({
          Status: '0',
          TxnStatus: '0',
          StatusMsg: 'Success',
          IPC_Trnref: 'TRN-9988776655',
          Amount: '50.00',
          Currency: 'BGN',
        }),
      } as any);

      const result = await service.getPaymentStatus('BOOM-1234567890-abcd');

      expect(result.orderId).toBe('BOOM-1234567890-abcd');
      expect(result.status).toBe('success');
      expect(result.ipcTrnref).toBe('TRN-9988776655');
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('BGN');

      const sent = new URLSearchParams(post.mock.calls[0][1] as string);
      expect(sent.get('IPCmethod')).toBe('IPCGetTxnStatus');
      expect(sent.get('OrderID')).toBe('BOOM-1234567890-abcd');
    });

    it('prefers TxnStatus over the envelope Status and maps unknown codes conservatively', async () => {
      jest
        .spyOn(axios, 'post')
        .mockResolvedValue({ status: 200, data: statusXml({ Status: '0', TxnStatus: '7' }) } as any);

      const result = await service.getPaymentStatus('BOOM-1');

      expect(result.rawStatus).toBe('7');
      expect(result.status).toBe('unknown');
    });

    it('requires an order id', async () => {
      await expect(service.getPaymentStatus('')).rejects.toThrow(/orderId/);
    });
  });

  // =========================================================================
  // Static helpers
  // =========================================================================

  describe('Static helper methods', () => {
    describe('minorUnitsToMajorString', () => {
      it.each([
        [0, '0.00'],
        [1, '0.01'],
        [99, '0.99'],
        [100, '1.00'],
        [1050, '10.50'],
        [5000, '50.00'],
        [999999, '9999.99'],
      ])('converts %d cents to "%s"', (minor, expected) => {
        expect(MyPOSService.minorUnitsToMajorString(minor as number)).toBe(expected);
      });

      it('rejects non-integer, non-finite and negative inputs', () => {
        expect(() => MyPOSService.minorUnitsToMajorString(10.5)).toThrow(/integer number of minor units/);
        expect(() => MyPOSService.minorUnitsToMajorString(NaN)).toThrow(/integer number of minor units/);
        expect(() => MyPOSService.minorUnitsToMajorString(Infinity)).toThrow(/integer number of minor units/);
        expect(() => MyPOSService.minorUnitsToMajorString('5000' as any)).toThrow(/integer number of minor units/);
        expect(() => MyPOSService.minorUnitsToMajorString(-1)).toThrow(/must not be negative/);
      });
    });

    describe('majorStringToMinorUnits', () => {
      it.each([
        ['0.00', 0],
        ['0.01', 1],
        ['0.99', 99],
        ['1', 100],
        ['10.5', 1050],
        ['50.00', 5000],
        ['1234567.89', 123456789],
      ])('converts "%s" to %d cents', (major, expected) => {
        expect(MyPOSService.majorStringToMinorUnits(major as string)).toBe(expected);
      });

      it('rounds a third decimal half-up', () => {
        expect(MyPOSService.majorStringToMinorUnits('10.555')).toBe(1056);
        expect(MyPOSService.majorStringToMinorUnits('10.554')).toBe(1055);
      });

      it('round-trips against minorUnitsToMajorString', () => {
        for (const minor of [0, 1, 7, 99, 100, 1050, 5000, 123456789]) {
          expect(MyPOSService.majorStringToMinorUnits(MyPOSService.minorUnitsToMajorString(minor))).toBe(minor);
        }
      });

      it('throws on malformed amounts', () => {
        expect(() => MyPOSService.majorStringToMinorUnits('abc')).toThrow(/malformed/);
        expect(() => MyPOSService.majorStringToMinorUnits('')).toThrow(/malformed/);
        expect(() => MyPOSService.majorStringToMinorUnits('50.00.00')).toThrow(/malformed/);
      });
    });

    describe('extractLast4', () => {
      it('returns only the last four digits of an already-masked card number', () => {
        expect(MyPOSService.extractLast4('4111 11** **** 1234')).toBe('1234');
        expect(MyPOSService.extractLast4('************9876')).toBe('9876');
      });

      it('returns undefined when there is nothing maskable', () => {
        expect(MyPOSService.extractLast4(undefined)).toBeUndefined();
        expect(MyPOSService.extractLast4('')).toBeUndefined();
        expect(MyPOSService.extractLast4('***')).toBeUndefined();
      });
    });

    describe('buildSignatureBase', () => {
      it('base64-encodes the "-"-joined values', () => {
        expect(MyPOSService.buildSignatureBase(['a', 'b', 'c'])).toBe(Buffer.from('a-b-c').toString('base64'));
      });
    });

    describe('toIpcLanguage', () => {
      it('maps ISO 639-2/B, passes ISO 639-1 through, defaults to en', () => {
        expect(MyPOSService.toIpcLanguage('BUL')).toBe('bg');
        expect(MyPOSService.toIpcLanguage('ENG')).toBe('en');
        expect(MyPOSService.toIpcLanguage('de')).toBe('de');
        expect(MyPOSService.toIpcLanguage(undefined)).toBe('en');
        expect(MyPOSService.toIpcLanguage('nonsense')).toBe('en');
      });
    });

    describe('parseIpcXml / readXmlField', () => {
      it('unwraps the method-named root element into a flat field map', () => {
        const fields = MyPOSService.parseIpcXml(
          '<?xml version="1.0"?><IPCRefund><Status>0</Status><StatusMsg>Success</StatusMsg></IPCRefund>'
        );
        expect(fields.Status).toBe('0');
        expect(MyPOSService.readXmlField(fields, 'statusmsg')).toBe('Success');
        expect(MyPOSService.readXmlField(fields, 'Nope')).toBeUndefined();
      });

      it('throws on a body-less or non-XML response', () => {
        expect(() => MyPOSService.parseIpcXml('not xml at all')).toThrow(/no recognisable body|not valid XML/);
      });
    });
  });

  // =========================================================================
  // PaymentProvider contract
  // =========================================================================

  describe('PaymentProvider contract', () => {
    it('exposes every PaymentProvider method', () => {
      for (const method of [
        'createCheckout',
        'verifyAndParseWebhook',
        'refund',
        'createPayout',
        'mapStatus',
        'isPayoutConfigured',
        'getWebhookAckResponse',
      ]) {
        expect(typeof (service as any)[method]).toBe('function');
      }
    });

    it('also exposes the extra methods BC-MYPOS-005/007 need', () => {
      expect(typeof service.reverse).toBe('function');
      expect(typeof service.getPaymentStatus).toBe('function');
    });

    it('refund no longer narrows the PaymentProvider contract: a full interface-typed call succeeds', async () => {
      // BC-MYPOS-003-FOLLOWUP-1 (item 1) widened `RefundParams` in
      // payment-provider.ts to declare `amount`, `currency` and `orderId` as
      // REQUIRED — exactly what `MyPOSService.refund` already required via
      // `MyPOSRefundParams`. Before that widening, an interface-typed caller
      // could write `p.refund({ transactionId, amount })` (omitting
      // `currency`/`orderId`): that compiled cleanly against the old
      // `RefundParams` and threw at runtime — the bivariance trap described
      // in this file's header comment above `MyPOSService`. Post-widening,
      // that object literal no longer satisfies `RefundParams` at all
      // (TypeScript would reject it for missing required properties), so
      // there is nothing left to narrow: this test instead proves the
      // POSITIVE case — a genuinely `RefundParams`-shaped object, built with
      // no knowledge of `MyPOSRefundParams`, drives a real refund end to end
      // through the interface.
      const refundXml = `<?xml version="1.0" encoding="utf-8"?>\n<IPCRefund><Status>0</Status><StatusMsg>Success</StatusMsg><IPC_Trnref>RFD-777</IPC_Trnref><Amount>50.00</Amount></IPCRefund>`;
      const post = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: refundXml } as any);

      const asInterface: PaymentProvider = service;
      // Deliberately typed as the INTERFACE's own `RefundParams`, not the
      // concrete `MyPOSRefundParams` — the point being proven is that the
      // interface alone is now sufficient.
      const refundParams: RefundParams = {
        transactionId: 'TRN-9988776655',
        amount: 5000,
        currency: 'BGN',
        orderId: 'REFUND-BOOM-3',
      };

      const result = await asInterface.refund(refundParams);

      expect(result.refundId).toBe('RFD-777');
      expect(result.status).toBe('success');
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('MyPOSService.refund still defensively validates a missing orderId at runtime, for a caller that bypasses the type system', async () => {
      // The widened interface makes it impossible to OMIT `orderId` while
      // staying type-safe, but `MyPOSService.refund` keeps its own runtime
      // guard rather than relying solely on the type system — defense in
      // depth against a caller that reaches this method via `as any`, a
      // partially-typed integration point, or a future interface change.
      // This documents that the runtime validation the original narrowing
      // test exercised is still genuinely present, just no longer reachable
      // through a type-correct `PaymentProvider`-typed call.
      const asInterface: PaymentProvider = service;

      await expect(
        asInterface.refund({ transactionId: 'TRN-1', amount: 100, currency: 'BGN' } as any)
      ).rejects.toThrow(/retry-stable orderId/);
    });

    it('returns a CheckoutSession-compatible object', async () => {
      const session: MyPOSCheckoutSession = await service.createCheckout(baseCheckoutParams);
      for (const field of ['orderId', 'projectId', 'amount', 'currency', 'status', 'paymentUrl', 'createdAt']) {
        expect(session).toHaveProperty(field);
      }
    });
  });
});
