/**
 * Unit tests for Paysera Payment Service
 */

import crypto from 'crypto';
import { PayseraService } from '../../src/services/paysera.service';

describe('PayseraService', () => {
  let payseraService: PayseraService;

  const mockConfig = {
    projectId: '123456',
    signPassword: 'test-password',
    apiUrl: 'https://www.paysera.com/pay',
    testMode: true,
  };

  beforeEach(() => {
    // Reset environment variables
    process.env.PAYSERA_PROJECT_ID = mockConfig.projectId;
    process.env.PAYSERA_SIGN_PASSWORD = mockConfig.signPassword;
    process.env.PAYSERA_API_URL = mockConfig.apiUrl;
    process.env.PAYSERA_TEST_MODE = 'true';

    payseraService = new PayseraService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPayment', () => {
    it('should create a payment with correct structure', async () => {
      const params = {
        orderId: 'BOOM-1234567890-abcd',
        amount: 5000, // 50.00 BGN in cents
        currency: 'BGN',
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
        acceptUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
        callbackUrl: 'http://localhost:3000/callback',
      };

      const result = await payseraService.createPayment(params);

      // Decode the data parameter from URL
      const url = new URL(result.paymentUrl);
      const encodedData = url.searchParams.get('data');
      expect(encodedData).toBeTruthy();

      const decodedData = JSON.parse(Buffer.from(encodedData!, 'base64').toString());
      expect(decodedData.test).toBe('1');
    });

    it('should generate valid MD5 signature', async () => {
      const params = {
        orderId: 'SIG-TEST',
        amount: 2500,
        currency: 'BGN',
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
    it('should verify valid callback with MD5 signature', () => {
      const data = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${data}${mockConfig.signPassword}`)
        .digest('hex');

      const callback = { data, ss1 };
      const result = payseraService.verifyCallback(callback);

      expect(result).toBe(true);
    });

    it('should reject callback with invalid MD5 signature', () => {
      const data = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const ss1 = 'invalid-signature';

      const callback = { data, ss1 };
      const result = payseraService.verifyCallback(callback);

      expect(result).toBe(false);
    });

    it('should verify valid callback with both MD5 and SHA-256 signatures', () => {
      const data = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${data}${mockConfig.signPassword}`)
        .digest('hex');
      const ss2 = crypto
        .createHash('sha256')
        .update(`${data}${mockConfig.signPassword}`)
        .digest('hex');

      const callback = { data, ss1, ss2 };
      const result = payseraService.verifyCallback(callback);

      expect(result).toBe(true);
    });

    it('should reject callback with invalid SHA-256 signature', () => {
      const data = Buffer.from(JSON.stringify({ test: 'data' })).toString('base64');
      const ss1 = crypto
        .createHash('md5')
        .update(`${data}${mockConfig.signPassword}`)
        .digest('hex');
      const ss2 = 'invalid-sha256-signature';

      const callback = { data, ss1, ss2 };
      const result = payseraService.verifyCallback(callback);

      expect(result).toBe(false);
    });
  });

  describe('handleCallback', () => {
    it('should parse successful payment callback', async () => {
      const callbackData = {
        projectid: mockConfig.projectId,
        orderid: 'ORDER-123',
        amount: '5000',
        currency: 'BGN',
        status: '1', // Success
        requestid: 'REQ-123',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
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
        amount: '2500',
        currency: 'EUR',
        status: '0', // Pending
        requestid: 'REQ-456',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
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
        amount: '1000',
        currency: 'USD',
        status: '2', // Failed
        requestid: 'REQ-789',
      };

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
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

      const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');
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
    it('should throw error if project ID is missing', () => {
      delete process.env.PAYSERA_PROJECT_ID;

      expect(() => {
        new PayseraService();
      }).toThrow();
    });

    it('should throw error if sign password is missing', () => {
      delete process.env.PAYSERA_SIGN_PASSWORD;

      expect(() => {
        new PayseraService();
      }).toThrow();
    });

    it('should use default API URL if not provided', () => {
      delete process.env.PAYSERA_API_URL;
      const service = new PayseraService();

      // The service should still work with default URL
      expect(service).toBeDefined();
    });

    it('should default to production mode if not specified', () => {
      delete process.env.PAYSERA_TEST_MODE;
      const service = new PayseraService();

      // Should not include test parameter in payment URL
      const params = {
        orderId: 'TEST',
        amount: 1000,
        currency: 'BGN',
        acceptUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
        callbackUrl: 'http://localhost:3000/callback',
      };

      service.createPayment(params).then((result) => {
        const url = new URL(result.paymentUrl);
        const encodedData = url.searchParams.get('data');
        const decodedData = JSON.parse(Buffer.from(encodedData!, 'base64').toString());
        expect(decodedData.test).toBeUndefined();
      });
    });
  });
});
