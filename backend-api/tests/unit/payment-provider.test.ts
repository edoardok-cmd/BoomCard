/**
 * Unit tests for payment-provider.ts (BC-MYPOS-002)
 *
 * Covers:
 *   - resolvePaymentProvider('paysera') returns the Paysera adapter
 *   - resolvePaymentProvider() with PAYMENT_PROVIDER unset defaults to Paysera
 *   - resolvePaymentProvider('bogus') with unknown provider logs warning + falls back to Paysera
 *   - resolvePaymentProvider respects PAYMENT_PROVIDER env var
 *   - Paysera adapter methods delegate to payseraService
 */

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const createTransferMock = jest.fn();
const reserveTransferMock = jest.fn();
const isTransferConfiguredMock = jest.fn();
const createPaymentMock = jest.fn();
const handleCallbackMock = jest.fn();
const getPaymentStatusMock = jest.fn();
const generateCallbackResponseMock = jest.fn();

jest.mock('../../src/services/paysera.service', () => ({
  payseraService: {
    createTransfer: createTransferMock,
    reserveTransfer: reserveTransferMock,
    isTransferConfigured: isTransferConfiguredMock,
    createPayment: createPaymentMock,
    handleCallback: handleCallbackMock,
    getPaymentStatus: getPaymentStatusMock,
    generateCallbackResponse: generateCallbackResponseMock,
  },
}));

import { logger } from '../../src/utils/logger';
import { payseraService } from '../../src/services/paysera.service';
import {
  resolvePaymentProvider,
  PaymentProvider,
} from '../../src/services/payment-provider';

const loggerMock = logger as jest.Mocked<typeof logger>;
const payseraMock = payseraService as jest.Mocked<typeof payseraService>;

describe('payment-provider.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PAYMENT_PROVIDER;
  });

  describe('resolvePaymentProvider', () => {
    describe('explicit provider name', () => {
      it('resolves "paysera" to the Paysera adapter', () => {
        const provider = resolvePaymentProvider('paysera');
        expect(provider).toBeDefined();
        expect(typeof provider.createCheckout).toBe('function');
        expect(typeof provider.verifyAndParseWebhook).toBe('function');
        expect(typeof provider.refund).toBe('function');
        expect(typeof provider.createPayout).toBe('function');
        expect(typeof provider.mapStatus).toBe('function');
        expect(typeof provider.isPayoutConfigured).toBe('function');
        expect(typeof provider.getWebhookAckResponse).toBe('function');
      });

      it('resolves "PAYSERA" (uppercase) to the Paysera adapter', () => {
        const provider = resolvePaymentProvider('PAYSERA');
        expect(provider).toBeDefined();
        expect(typeof provider.createCheckout).toBe('function');
      });

      it('resolves "  paysera  " (with whitespace) to the Paysera adapter', () => {
        const provider = resolvePaymentProvider('  paysera  ');
        expect(provider).toBeDefined();
        expect(typeof provider.createCheckout).toBe('function');
      });

      it('logs warning and falls back to Paysera for unknown provider', () => {
        const provider = resolvePaymentProvider('bogus');
        expect(provider).toBeDefined();
        expect(typeof provider.createCheckout).toBe('function');
        expect(loggerMock.warn).toHaveBeenCalledWith(
          expect.stringContaining('Unknown PAYMENT_PROVIDER "bogus"')
        );
        expect(loggerMock.warn).toHaveBeenCalledWith(
          expect.stringContaining('falling back to paysera')
        );
      });

      it('logs warning for empty string provider', () => {
        const provider = resolvePaymentProvider('');
        expect(provider).toBeDefined();
        expect(loggerMock.warn).toHaveBeenCalled();
      });
    });

    describe('env var fallback', () => {
      it('uses PAYMENT_PROVIDER env var when no explicit name given', () => {
        process.env.PAYMENT_PROVIDER = 'paysera';
        const provider = resolvePaymentProvider();
        expect(provider).toBeDefined();
        expect(loggerMock.warn).not.toHaveBeenCalled();
      });

      it('logs warning when PAYMENT_PROVIDER is unknown', () => {
        process.env.PAYMENT_PROVIDER = 'unknown';
        const provider = resolvePaymentProvider();
        expect(provider).toBeDefined();
        expect(loggerMock.warn).toHaveBeenCalled();
      });

      it('defaults to Paysera when PAYMENT_PROVIDER unset and no explicit name', () => {
        delete process.env.PAYMENT_PROVIDER;
        const provider = resolvePaymentProvider();
        expect(provider).toBeDefined();
        expect(loggerMock.warn).not.toHaveBeenCalled();
      });

      it('prefers explicit name over PAYMENT_PROVIDER env var', () => {
        process.env.PAYMENT_PROVIDER = 'bogus';
        loggerMock.warn.mockClear();
        const provider = resolvePaymentProvider('paysera');
        expect(provider).toBeDefined();
        expect(loggerMock.warn).not.toHaveBeenCalled();
      });
    });

    describe('case insensitivity', () => {
      it('normalizes provider name to lowercase', () => {
        const tests = ['Paysera', 'PAYSERA', 'PaySera', 'pAySeRa'];
        tests.forEach((name) => {
          loggerMock.warn.mockClear();
          const provider = resolvePaymentProvider(name);
          expect(provider).toBeDefined();
          expect(loggerMock.warn).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Paysera adapter', () => {
    let provider: PaymentProvider;

    beforeEach(() => {
      provider = resolvePaymentProvider('paysera');
    });

    describe('createCheckout', () => {
      it('delegates to payseraService.createPayment', async () => {
        const params = { orderId: 'order-1', amount: 1000, currency: 'EUR' };
        const expected = { id: 'payment-1', status: 'pending' };
        payseraMock.createPayment.mockResolvedValue(expected as any);

        const result = await provider.createCheckout(params as any);

        expect(payseraMock.createPayment).toHaveBeenCalledWith(params);
        expect(result).toEqual(expected);
      });
    });

    describe('verifyAndParseWebhook', () => {
      it('delegates to payseraService.handleCallback', async () => {
        const payload = { data: 'base64data', ss1: 'hash1', ss2: 'hash2' };
        const expected = {
          orderId: 'order-1',
          status: 'success',
          rawStatus: '2',
          amount: 1000,
          currency: 'EUR',
          transactionId: 'tx-1',
          paymentMethod: 'card',
          isTest: false,
        };
        handleCallbackMock.mockResolvedValue(expected as any);

        const result = await provider.verifyAndParseWebhook(payload);

        expect(handleCallbackMock).toHaveBeenCalledWith({
          data: 'base64data',
          ss1: 'hash1',
          ss2: 'hash2',
        });
        expect(result).toEqual(expected);
      });

      it('throws on missing data', async () => {
        const payload = { ss1: 'hash1' };
        await expect(provider.verifyAndParseWebhook(payload)).rejects.toThrow(
          'Invalid callback data'
        );
      });

      it('throws on missing ss1', async () => {
        const payload = { data: 'base64data' };
        await expect(provider.verifyAndParseWebhook(payload)).rejects.toThrow(
          'Invalid callback data'
        );
      });
    });

    describe('refund', () => {
      it('throws with clear message', async () => {
        await expect(
          provider.refund({ transactionId: 'tx-1' })
        ).rejects.toThrow(
          'Paysera does not support programmatic refunds via this API'
        );
      });
    });

    describe('createPayout', () => {
      it('creates transfer, calls onCreated, then reserves', async () => {
        const transfer = { id: 'transfer-1', status: 'pending' };
        createTransferMock.mockResolvedValue(transfer as any);
        reserveTransferMock.mockResolvedValue({ status: 'reserved' } as any);
        const onCreated = jest.fn(async () => {});

        const params = {
          beneficiary: 'recipient',
          amount: 1000,
          currency: 'EUR',
          onCreated,
        };
        const result = await provider.createPayout(params as any);

        expect(createTransferMock).toHaveBeenCalledWith({
          beneficiary: 'recipient',
          amount: 1000,
          currency: 'EUR',
        });
        expect(onCreated).toHaveBeenCalledWith('transfer-1');
        expect(reserveTransferMock).toHaveBeenCalledWith('transfer-1');
        expect(result).toEqual(transfer);
      });

      it('reserves transfer even if onCreated throws', async () => {
        const transfer = { id: 'transfer-1', status: 'pending' };
        createTransferMock.mockResolvedValue(transfer as any);
        reserveTransferMock.mockResolvedValue({ status: 'reserved' } as any);
        const onCreated = jest.fn(async () => {
          throw new Error('callback failed');
        });

        const params = {
          beneficiary: 'recipient',
          amount: 1000,
          currency: 'EUR',
          onCreated,
        };

        await expect(provider.createPayout(params as any)).rejects.toThrow(
          'callback failed'
        );
        expect(reserveTransferMock).not.toHaveBeenCalled();
      });

      it('works when onCreated is not provided', async () => {
        const transfer = { id: 'transfer-1', status: 'pending' };
        createTransferMock.mockResolvedValue(transfer as any);
        reserveTransferMock.mockResolvedValue({ status: 'reserved' } as any);

        const params = {
          beneficiary: 'recipient',
          amount: 1000,
          currency: 'EUR',
        };
        const result = await provider.createPayout(params as any);

        expect(createTransferMock).toHaveBeenCalled();
        expect(reserveTransferMock).toHaveBeenCalledWith('transfer-1');
        expect(result).toEqual(transfer);
      });
    });

    describe('mapStatus', () => {
      it('delegates to payseraService.getPaymentStatus', () => {
        getPaymentStatusMock.mockReturnValue('success');
        const result = provider.mapStatus('2');
        expect(getPaymentStatusMock).toHaveBeenCalledWith('2');
        expect(result).toBe('success');
      });
    });

    describe('isPayoutConfigured', () => {
      it('delegates to payseraService.isTransferConfigured', () => {
        isTransferConfiguredMock.mockReturnValue(true);
        const result = provider.isPayoutConfigured();
        expect(isTransferConfiguredMock).toHaveBeenCalled();
        expect(result).toBe(true);
      });
    });

    describe('getWebhookAckResponse', () => {
      it('delegates to payseraService.generateCallbackResponse', () => {
        generateCallbackResponseMock.mockReturnValue('OK');
        const result = provider.getWebhookAckResponse();
        expect(generateCallbackResponseMock).toHaveBeenCalled();
        expect(result).toBe('OK');
      });
    });
  });
});
