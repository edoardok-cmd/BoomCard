/**
 * Unit tests for Paysera Payment Service
 */

import crypto from 'crypto';
import { PayseraService } from '../../src/services/paysera.service';
import { PAYSERA_LIVE_PUBLIC_KEY_PEM } from '../../src/services/paysera-public-key';
import { logger } from '../../src/utils/logger';

describe('PayseraService', () => {
  let payseraService: PayseraService;
  let originalEnv: NodeJS.ProcessEnv;

  const mockConfig = {
    projectId: '123456',
    signPassword: 'test-password',
    apiUrl: 'https://www.paysera.com/pay',
    testMode: true,
  };

  /**
   * Throwaway RSA keypair standing in for Paysera's. The public half is fed to
   * the service via PAYSERA_PUBLIC_KEY; the private half signs `data` in the
   * ss2/ss3 tests exactly the way Paysera does.
   */
  let rsa: crypto.KeyPairKeyObjectResult;
  let testPublicKeyPem: string;

  /** URL-safe base64, as Paysera encodes the ss2/ss3 field itself. */
  const toSafeB64 = (buf: Buffer): string =>
    buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  /** Sign the raw `data` string the way Paysera does: RSA PKCS#1 v1.5. */
  const signData = (data: string, digest: 'sha1' | 'sha256'): string =>
    toSafeB64(crypto.sign(digest, Buffer.from(data, 'utf-8'), rsa.privateKey));

  beforeAll(() => {
    originalEnv = { ...process.env };
    rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    testPublicKeyPem = rsa.publicKey.export({ type: 'spki', format: 'pem' }) as string;
  });

  beforeEach(() => {
    // Reset environment variables
    process.env.PAYSERA_PROJECT_ID = mockConfig.projectId;
    process.env.PAYSERA_SIGN_PASSWORD = mockConfig.signPassword;
    process.env.PAYSERA_API_URL = mockConfig.apiUrl;
    process.env.PAYSERA_TEST_MODE = 'true';

    payseraService = new PayseraService();
  });

  afterEach(() => {
    // Restore original env to prevent pollution between tests
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createPayment', () => {
    it('should create a payment with correct structure', async () => {
      const params = {
        orderId: 'BOOM-1234567890-abcd',
        amount: 5000, // 50.00 BGN in cents
        currency: 'BGN',
        description: 'BoomCard subscription',
        acceptUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
        callbackUrl: 'http://localhost:3000/callback',
      };

      const result = await payseraService.createPayment(params);

      expect(result).toHaveProperty('orderId', params.orderId);
      expect(result).toHaveProperty('projectId', mockConfig.projectId);
      expect(result).toHaveProperty('amount', params.amount);
      expect(result).toHaveProperty('currency', params.currency);
      expect(result).toHaveProperty('status', 'pending');
      expect(result).toHaveProperty('paymentUrl');
      expect(result.paymentUrl).toContain('paysera.com/pay');
    });

    it('should include test mode parameter when enabled', async () => {
      const params = {
        orderId: 'TEST-001',
        amount: 1000,
        currency: 'EUR',
        description: 'Test payment',
        acceptUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
        callbackUrl: 'http://localhost:3000/callback',
      };

      const result = await payseraService.createPayment(params);

      // Decode the data parameter from URL (URL-safe base64 → URL-encoded query string)
      const url = new URL(result.paymentUrl);
      const encodedData = url.searchParams.get('data');
      expect(encodedData).toBeTruthy();

      const base64 = encodedData!.replace(/-/g, '+').replace(/_/g, '/');
      const queryString = Buffer.from(base64, 'base64').toString();
      const params2 = new URLSearchParams(queryString);
      expect(params2.get('test')).toBe('1');
    });

    it('should generate valid MD5 signature', async () => {
      const params = {
        orderId: 'SIG-TEST',
        amount: 2500,
        currency: 'BGN',
        description: 'Signature test',
        acceptUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
        callbackUrl: 'http://localhost:3000/callback',
      };

      const result = await payseraService.createPayment(params);

      // Extract signature from URL
      const url = new URL(result.paymentUrl);
      const signature = url.searchParams.get('sign');
      const encodedData = url.searchParams.get('data');

      expect(signature).toBeTruthy();
      expect(encodedData).toBeTruthy();

      // Verify signature
      const expectedSignature = crypto
        .createHash('md5')
        .update(`${encodedData}${mockConfig.signPassword}`)
        .digest('hex');

      expect(signature).toBe(expectedSignature);
    });

    it('should handle different currencies', async () => {
      const currencies = ['BGN', 'EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON'];

      for (const currency of currencies) {
        const params = {
          orderId: `CURR-${currency}`,
          amount: 1000,
          currency,
          description: `Test payment in ${currency}`,
          acceptUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel',
          callbackUrl: 'http://localhost:3000/callback',
        };

        const result = await payseraService.createPayment(params);
        expect(result.currency).toBe(currency);
      }
    });
  });

  describe('verifyCallback', () => {
    it('should verify valid callback with MD5 signature', async () => {
      const data = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${data}${mockConfig.signPassword}`)
        .digest('hex');

      const callback = { data, ss1 };
      const result = await payseraService.verifyCallback(callback);

      expect(result).toBe(true);
    });

    it('should reject callback with invalid MD5 signature', async () => {
      const data = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const ss1 = 'invalid-signature';

      const callback = { data, ss1 };
      const result = await payseraService.verifyCallback(callback);

      expect(result).toBe(false);
    });

    /**
     * ss2/ss3 are NOT `sha256(data + signPassword)` — that scheme does not exist
     * anywhere in Paysera's protocol; the tests that used to assert it here were
     * fiction (BC-QA-031-FOLLOWUP-7). Paysera signs the raw `data` string with
     * ITS OWN RSA private key and URL-safe-base64-encodes the result:
     *   ss2 => RSA PKCS#1 v1.5 over a SHA-1 digest
     *   ss3 => the same over a SHA-256 digest (preferred when both are sent)
     * Source: paysera/lib-webtopay, WebToPay_Sign_SSOpenSslSignChecker
     * (SIGN_TYPE_TO_HASH_ALGO_MAP + decodeSafeUrlBase64 + openssl_verify).
     */
    describe('RSA ss2/ss3 signatures', () => {
      const data = Buffer.from(
        new URLSearchParams({ projectid: '123456', orderid: 'RSA-1', status: '1' }).toString()
      )
        .toString('base64')
        .replace(/\//g, '_')
        .replace(/\+/g, '-');

      const validSs1 = () =>
        crypto.createHash('md5').update(`${data}${mockConfig.signPassword}`).digest('hex');

      /** Build a service that trusts the throwaway test keypair. */
      const serviceWithTestKey = (mode?: string): PayseraService => {
        process.env.PAYSERA_PUBLIC_KEY = testPublicKeyPem;
        if (mode) process.env.PAYSERA_SS2_MODE = mode;
        else delete process.env.PAYSERA_SS2_MODE;
        return new PayseraService();
      };

      it('accepts a genuine RSA-SHA1 ss2 signature over data', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: signData(data, 'sha1'),
        });
        expect(result).toBe(true);
      });

      it('accepts a genuine RSA-SHA256 ss3 signature over data', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss3: signData(data, 'sha256'),
        });
        expect(result).toBe(true);
      });

      it('prefers ss3 over ss2 when both are present (rejects a bad ss3 beside a good ss2)', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: signData(data, 'sha1'),
          ss3: signData('some-other-data', 'sha256'),
        });
        expect(result).toBe(false);
      });

      it('rejects an ss2 signed over different data (tampered payload)', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: signData(`${data}TAMPERED`, 'sha1'),
        });
        expect(result).toBe(false);
      });

      it('rejects an ss2 produced with the wrong digest (sha256 bytes in the ss2 field)', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: signData(data, 'sha256'), // ss2 must be SHA-1
        });
        expect(result).toBe(false);
      });

      it('rejects an ss2 signed by a different (attacker) RSA key', async () => {
        const service = serviceWithTestKey();
        const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        const forged = toSafeB64(
          crypto.sign('sha1', Buffer.from(data, 'utf-8'), attacker.privateKey)
        );
        const result = await service.verifyCallback({ data, ss1: validSs1(), ss2: forged });
        expect(result).toBe(false);
      });

      it('rejects a garbage (non-signature) ss2 value', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: 'invalid-signature-value',
        });
        expect(result).toBe(false);
      });

      it('rejects a bad ss1 even when ss2 is perfectly valid (ss1 is a hard gate)', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({
          data,
          ss1: 'invalid-signature',
          ss2: signData(data, 'sha1'),
        });
        expect(result).toBe(false);
      });

      it('accepts an ss1-only callback when no ss2/ss3 is present (default enforce mode)', async () => {
        const service = serviceWithTestKey();
        const result = await service.verifyCallback({ data, ss1: validSs1() });
        expect(result).toBe(true);
      });

      it('rejects an ss1-only callback under PAYSERA_SS2_MODE=require', async () => {
        const service = serviceWithTestKey('require');
        const result = await service.verifyCallback({ data, ss1: validSs1() });
        expect(result).toBe(false);
      });

      it('still verifies a genuine ss2 under PAYSERA_SS2_MODE=require', async () => {
        const service = serviceWithTestKey('require');
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: signData(data, 'sha1'),
        });
        expect(result).toBe(true);
      });

      it('falls back to ss1 only when no public key could be loaded', async () => {
        // An explicitly configured but unparseable key is deliberately NOT
        // replaced by the bundled key — the service ends up with no key at all.
        process.env.PAYSERA_PUBLIC_KEY = 'this-is-not-a-pem';
        delete process.env.PAYSERA_SS2_MODE;
        const service = new PayseraService();

        // ss1 valid + unverifiable ss2 => accepted on ss1 alone (documented rule 3)
        await expect(
          service.verifyCallback({ data, ss1: validSs1(), ss2: signData(data, 'sha1') })
        ).resolves.toBe(true);
        // ...but ss1 still gates absolutely.
        await expect(
          service.verifyCallback({ data, ss1: 'invalid-signature', ss2: signData(data, 'sha1') })
        ).resolves.toBe(false);
      });

      it('rejects when no public key could be loaded under PAYSERA_SS2_MODE=require', async () => {
        process.env.PAYSERA_PUBLIC_KEY = 'this-is-not-a-pem';
        process.env.PAYSERA_SS2_MODE = 'require';
        const service = new PayseraService();
        const result = await service.verifyCallback({
          data,
          ss1: validSs1(),
          ss2: signData(data, 'sha1'),
        });
        expect(result).toBe(false);
      });

      it('PAYSERA_SS2_MODE=off skips the RSA check but keeps ss1 as a hard gate', async () => {
        const service = serviceWithTestKey('off');
        await expect(
          service.verifyCallback({ data, ss1: validSs1(), ss2: 'garbage' })
        ).resolves.toBe(true);
        await expect(
          service.verifyCallback({ data, ss1: 'invalid-signature', ss2: signData(data, 'sha1') })
        ).resolves.toBe(false);
      });

      it('verifies against the bundled Paysera public key by default (no env override)', async () => {
        delete process.env.PAYSERA_PUBLIC_KEY;
        delete process.env.PAYSERA_PUBLIC_KEY_PATH;
        delete process.env.PAYSERA_SS2_MODE;
        const service = new PayseraService();

        // Our throwaway key is NOT Paysera's, so its signature must be rejected
        // — proving the bundled key is genuinely loaded and used, not ignored.
        await expect(
          service.verifyCallback({ data, ss1: validSs1(), ss2: signData(data, 'sha1') })
        ).resolves.toBe(false);
        // An ss1-only callback is still accepted.
        await expect(service.verifyCallback({ data, ss1: validSs1() })).resolves.toBe(true);
      });
    });
  });

  describe('handleCallback', () => {
    it('should parse successful payment callback', async () => {
      const callbackData = {
        projectid: mockConfig.projectId,
        orderid: 'ORDER-123',
        request_amount: '50',     // 50.00 BGN = 5000 cents
        request_currency: 'BGN',
        status: '1', // Success
        requestid: 'REQ-123',
      };

      const queryString = new URLSearchParams(callbackData).toString();
      const encodedData = Buffer.from(queryString).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
      const ss1 = crypto
        .createHash('md5')
        .update(`${encodedData}${mockConfig.signPassword}`)
        .digest('hex');

      const result = await payseraService.handleCallback({ data: encodedData, ss1 });

      expect(result.orderId).toBe('ORDER-123');
      expect(result.status).toBe('success');
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('BGN');
      expect(result.transactionId).toBe('REQ-123');
    });

    it('should parse pending payment callback', async () => {
      const callbackData = {
        projectid: mockConfig.projectId,
        orderid: 'ORDER-456',
        request_amount: '25',
        request_currency: 'EUR',
        status: '0', // Pending
        requestid: 'REQ-456',
      };

      const queryString = new URLSearchParams(callbackData).toString();
      const encodedData = Buffer.from(queryString).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
      const ss1 = crypto
        .createHash('md5')
        .update(`${encodedData}${mockConfig.signPassword}`)
        .digest('hex');

      const result = await payseraService.handleCallback({ data: encodedData, ss1 });

      expect(result.orderId).toBe('ORDER-456');
      expect(result.status).toBe('pending');
    });

    it('should parse failed payment callback', async () => {
      const callbackData = {
        projectid: mockConfig.projectId,
        orderid: 'ORDER-789',
        request_amount: '10',
        request_currency: 'USD',
        status: '2', // Failed
        requestid: 'REQ-789',
      };

      const queryString = new URLSearchParams(callbackData).toString();
      const encodedData = Buffer.from(queryString).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
      const ss1 = crypto
        .createHash('md5')
        .update(`${encodedData}${mockConfig.signPassword}`)
        .digest('hex');

      const result = await payseraService.handleCallback({ data: encodedData, ss1 });

      expect(result.orderId).toBe('ORDER-789');
      expect(result.status).toBe('failed');
    });

    it('should throw error for invalid signature', async () => {
      const callbackData = {
        projectid: mockConfig.projectId,
        orderid: 'ORDER-999',
        amount: '1000',
        currency: 'BGN',
        status: '1',
        requestid: 'REQ-999',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
      const ss1 = 'invalid-signature';

      await expect(
        payseraService.handleCallback({ data: encodedData, ss1 })
      ).rejects.toThrow('Invalid callback signature');
    });
  });

  describe('parseCallback', () => {
    it('should parse base64 encoded callback data', () => {
      const callbackData = {
        projectid: '123456',
        orderid: 'TEST-001',
        amount: '5000',
        currency: 'BGN',
        status: '1',
      };

      const queryString = new URLSearchParams(callbackData).toString();
      const encodedData = Buffer.from(queryString).toString('base64').replace(/\//g, '_').replace(/\+/g, '-');
      const result = payseraService.parseCallback(encodedData);

      expect(result).toEqual(callbackData);
    });

    it('should handle malformed data gracefully', () => {
      const invalidData = 'not-base64-encoded';

      expect(() => {
        payseraService.parseCallback(invalidData);
      }).toThrow();
    });
  });

  describe('getPaymentStatus', () => {
    it('should map status "1" to "success"', () => {
      const result = payseraService.getPaymentStatus('1');
      expect(result).toBe('success');
    });

    it('should map status "0" to "pending"', () => {
      const result = payseraService.getPaymentStatus('0');
      expect(result).toBe('pending');
    });

    it('should map status "2" to "failed"', () => {
      const result = payseraService.getPaymentStatus('2');
      expect(result).toBe('failed');
    });

    it('should map status "3" to "cancelled"', () => {
      const result = payseraService.getPaymentStatus('3');
      expect(result).toBe('cancelled');
    });

    it('should map unknown status to "unknown"', () => {
      const result = payseraService.getPaymentStatus('999');
      expect(result).toBe('unknown');
    });
  });

  describe('generateCallbackResponse', () => {
    it('should return "OK" text', () => {
      const result = payseraService.generateCallbackResponse();
      expect(result).toBe('OK');
    });
  });

  describe('Static helper methods', () => {
    describe('amountToCents', () => {
      it('should convert 50.00 BGN to 5000 cents', () => {
        const result = PayseraService.amountToCents(50.0);
        expect(result).toBe(5000);
      });

      it('should convert 10.50 BGN to 1050 cents', () => {
        const result = PayseraService.amountToCents(10.5);
        expect(result).toBe(1050);
      });

      it('should convert 0.99 BGN to 99 cents', () => {
        const result = PayseraService.amountToCents(0.99);
        expect(result).toBe(99);
      });

      it('should handle zero correctly', () => {
        const result = PayseraService.amountToCents(0);
        expect(result).toBe(0);
      });

      it('should round to nearest cent', () => {
        const result = PayseraService.amountToCents(10.555);
        expect(result).toBe(1056); // Rounds up
      });
    });

    describe('centsToAmount', () => {
      it('should convert 5000 cents to 50.00 BGN', () => {
        const result = PayseraService.centsToAmount(5000);
        expect(result).toBe(50.0);
      });

      it('should convert 1050 cents to 10.50 BGN', () => {
        const result = PayseraService.centsToAmount(1050);
        expect(result).toBe(10.5);
      });

      it('should convert 99 cents to 0.99 BGN', () => {
        const result = PayseraService.centsToAmount(99);
        expect(result).toBe(0.99);
      });

      it('should handle zero correctly', () => {
        const result = PayseraService.centsToAmount(0);
        expect(result).toBe(0);
      });
    });

    describe('getSupportedCurrencies', () => {
      it('should return array of supported currencies', () => {
        const result = PayseraService.getSupportedCurrencies();
        expect(Array.isArray(result)).toBe(true);
        expect(result).toContain('BGN');
        expect(result).toContain('EUR');
        expect(result).toContain('USD');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should include all expected currencies', () => {
        const result = PayseraService.getSupportedCurrencies();
        const expected = ['BGN', 'EUR', 'USD', 'GBP', 'PLN', 'CZK', 'RON'];

        expected.forEach((currency) => {
          expect(result).toContain(currency);
        });
      });
    });
  });

  describe('Configuration validation', () => {
    it('should warn if project ID is missing', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      delete process.env.PAYSERA_PROJECT_ID;

      const service = new PayseraService();
      expect(service).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Paysera credentials not configured')
      );
    });

    it('should warn if sign password is missing', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      delete process.env.PAYSERA_SIGN_PASSWORD;

      const service = new PayseraService();
      expect(service).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Paysera credentials not configured')
      );
    });

    it('should use default API URL if not provided', () => {
      delete process.env.PAYSERA_API_URL;
      const service = new PayseraService();

      // The service should still work with default URL
      expect(service).toBeDefined();
    });

    it('should default to production mode if not specified', async () => {
      delete process.env.PAYSERA_TEST_MODE;
      const service = new PayseraService();

      // Should not include test parameter in payment URL
      const params = {
        orderId: 'TEST',
        amount: 1000,
        currency: 'BGN',
        description: 'Test payment',
        acceptUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
        callbackUrl: 'http://localhost:3000/callback',
      };

      const result = await service.createPayment(params);
      const url = new URL(result.paymentUrl);
      const encodedData = url.searchParams.get('data');
      const base64 = encodedData!.replace(/-/g, '+').replace(/_/g, '/');
      const queryString = Buffer.from(base64, 'base64').toString();
      const urlParams = new URLSearchParams(queryString);
      expect(urlParams.get('test')).toBeNull();
    });
  });

  /**
   * BC-QA-031-FOLLOWUP-7 review F1 — the IDENTITY of the bundled key.
   *
   * The other tests that touch the bundled certificate only prove that it
   * parses and that it is genuinely consulted; ANY parseable key satisfies
   * them, so swapping in an unrelated valid certificate left the whole suite
   * green. That failure mode is silent and lands on money: under the default
   * PAYSERA_SS2_MODE=enforce a wrong or stale key makes every genuine
   * ss2/ss3-carrying callback fail verification, handleCallback throws, and the
   * callback route replies with the webhook ack anyway to suppress Paysera's
   * retries — so a paid order is dropped permanently with only a log line.
   *
   * The digests below are Paysera's published live callback-signing key
   * (https://www.paysera.com/download/public.key, fetched 2026-08-20). This is
   * the executable form of the provenance claim that used to live only in a
   * comment in paysera-public-key.ts. If Paysera rotates the key, this is what
   * goes red: replace the constant and both digests together, and see that
   * module's ROTATION section for the levers that end the outage meanwhile.
   */
  describe('bundled Paysera public key identity', () => {
    /** `openssl x509 -noout -fingerprint -sha256` over the bundled certificate. */
    const EXPECTED_CERT_SHA256 =
      'AA:EB:A5:7B:AF:8F:77:9D:BE:06:FB:94:17:67:02:36:' +
      'F4:60:0B:E2:BC:59:D8:27:AE:6E:23:83:DA:12:82:8C';
    /** SHA-256 over the SubjectPublicKeyInfo DER — the key itself, not its wrapper. */
    const EXPECTED_SPKI_SHA256 =
      '457d34b44ac72ee2331c491e5d25ba9ed2839a4409b67c4ea91d02abea73c330';

    const spkiSha256 = (key: crypto.KeyObject): string =>
      crypto
        .createHash('sha256')
        .update(key.export({ type: 'spki', format: 'der' }) as Buffer)
        .digest('hex');

    it('is the exact certificate Paysera publishes', () => {
      const cert = new crypto.X509Certificate(PAYSERA_LIVE_PUBLIC_KEY_PEM);
      expect(cert.fingerprint256).toBe(EXPECTED_CERT_SHA256);
    });

    it('carries the exact public key callback signatures are verified against', () => {
      const cert = new crypto.X509Certificate(PAYSERA_LIVE_PUBLIC_KEY_PEM);
      expect(cert.publicKey.asymmetricKeyType).toBe('rsa');
      expect(spkiSha256(cert.publicKey)).toBe(EXPECTED_SPKI_SHA256);
    });

    it('is the key the service actually loads when no override is configured', () => {
      delete process.env.PAYSERA_PUBLIC_KEY;
      delete process.env.PAYSERA_PUBLIC_KEY_PATH;
      const service = new PayseraService();

      // Reaching into the private field is deliberate: the point of this
      // assertion is that the DEFAULT resolution path ends at that exact key,
      // which no public API exposes.
      const loaded = (service as unknown as { publicKey: crypto.KeyObject | null }).publicKey;
      expect(loaded).not.toBeNull();
      expect(spkiSha256(loaded as crypto.KeyObject)).toBe(EXPECTED_SPKI_SHA256);
    });
  });

  /**
   * BC-QA-031-FOLLOWUP-7 item 1. The service used to fall back to '' for both
   * signing inputs and merely warn. With signPassword='' the ss1 gate collapses
   * to `ss1 === md5(data)`, which any anonymous caller can compute — a complete
   * callback-forgery bypass, not a degraded check. In production that must now
   * be a hard boot failure; dev/test keep warn-and-continue.
   */
  describe('Fail-closed on a missing signing secret (production)', () => {
    const inProduction = <T>(fn: () => T): T => {
      const previous = process.env.NODE_ENV;
      // NODE_ENV is readonly in @types/node's ProcessEnv typing.
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      try {
        return fn();
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = previous;
      }
    };

    it('throws when PAYSERA_PROJECT_ID is missing in production', () => {
      delete process.env.PAYSERA_PROJECT_ID;
      inProduction(() => {
        expect(() => new PayseraService()).toThrow(/PAYSERA_PROJECT_ID/);
        expect(() => new PayseraService()).toThrow(/Refusing to start/);
      });
    });

    it('throws when PAYSERA_SIGN_PASSWORD is missing in production', () => {
      delete process.env.PAYSERA_SIGN_PASSWORD;
      inProduction(() => {
        expect(() => new PayseraService()).toThrow(/PAYSERA_SIGN_PASSWORD/);
      });
    });

    it('throws when PAYSERA_SIGN_PASSWORD is set but empty in production', () => {
      process.env.PAYSERA_SIGN_PASSWORD = '';
      inProduction(() => {
        expect(() => new PayseraService()).toThrow(/PAYSERA_SIGN_PASSWORD/);
      });
    });

    it('names both variables when both are missing in production', () => {
      delete process.env.PAYSERA_PROJECT_ID;
      delete process.env.PAYSERA_SIGN_PASSWORD;
      inProduction(() => {
        expect(() => new PayseraService()).toThrow(/PAYSERA_PROJECT_ID and PAYSERA_SIGN_PASSWORD/);
      });
    });

    it('does not throw in production when both credentials are present', () => {
      inProduction(() => {
        expect(() => new PayseraService()).not.toThrow();
      });
    });

    it('only warns (does not throw) outside production', () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      delete process.env.PAYSERA_PROJECT_ID;
      delete process.env.PAYSERA_SIGN_PASSWORD;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

      expect(() => new PayseraService()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Paysera credentials not configured')
      );
    });

    /** The message of the boot failure, asserting that one actually happened. */
    const messageFromFailedBoot = (): string =>
      inProduction(() => {
        try {
          // eslint-disable-next-line no-new
          new PayseraService();
        } catch (err: any) {
          return err.message as string;
        }
        throw new Error('expected the constructor to throw, but it returned');
      });

    /*
     * Review F3. The earlier version of this assertion emptied
     * PAYSERA_SIGN_PASSWORD to trigger the throw and then checked the message
     * did not contain the password — but with the password empty the service
     * holds no password to leak, so it held for every possible implementation
     * (a mutation interpolating this.config into the message stayed green).
     * Each case below triggers the failure with the OTHER variable missing, so
     * the secret under test is genuinely present in the config the message is
     * built from. This matters because the message is passed to logger.error
     * and surfaces in deploy output.
     */
    it('does not leak the signing password it holds when the project id is missing', () => {
      const password = 'live-signing-password-must-not-be-logged';
      process.env.PAYSERA_SIGN_PASSWORD = password;
      delete process.env.PAYSERA_PROJECT_ID;

      const message = messageFromFailedBoot();
      expect(message).toMatch(/PAYSERA_PROJECT_ID/);
      expect(message).not.toContain(password);
    });

    it('does not leak the project id it holds when the signing password is missing', () => {
      const projectId = 'project-id-must-not-be-logged-987654';
      process.env.PAYSERA_PROJECT_ID = projectId;
      delete process.env.PAYSERA_SIGN_PASSWORD;

      const message = messageFromFailedBoot();
      expect(message).toMatch(/PAYSERA_SIGN_PASSWORD/);
      expect(message).not.toContain(projectId);
    });

    /*
     * Review F5. The non-production half of this behaviour is covered above
     * ("falls back to ss1 only when no public key could be loaded"); the
     * production half — refusing to boot rather than silently verifying against
     * a key the operator did not ask for — had no test, so disabling the throw
     * left the suite green. Credentials are present here (beforeEach), so the
     * failure can only come from key loading, not the credential check.
     */
    it('throws in production when an explicitly configured public key cannot be parsed', () => {
      process.env.PAYSERA_PUBLIC_KEY = 'this-is-not-a-pem';
      inProduction(() => {
        expect(() => new PayseraService()).toThrow(
          /Failed to load the Paysera callback public key/
        );
        expect(() => new PayseraService()).toThrow(/PAYSERA_PUBLIC_KEY/);
      });
    });
  });
});
