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

// writeAudit / notificationService are exercised for real (fire-and-forget via
// `detach`) by recordPayseraSignatureRejection — mock both so the observability
// tests below don't touch a real DB or send a real notification.
const writeAuditMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: (...args: unknown[]) => writeAuditMock(...args),
}));

const notifyAdminOpsMock = jest.fn().mockResolvedValue(true);
jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: (...args: unknown[]) => notifyAdminOpsMock(...args) },
}));

import { logger } from '../../src/utils/logger';
import { payseraService } from '../../src/services/paysera.service';
import {
  resolvePaymentProvider,
  PaymentProvider,
  PayseraSignatureVerificationError,
  recordPayseraSignatureRejection,
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

      // BC-QA-031-FOLLOWUP-8 item 1 (closes FOLLOWUP-7 impl-r1 F2) — ss3 must
      // reach the verifier alongside ss2, not just ss2. This is the caller-side
      // half of "the documented last-field-wins preference is exercised, not
      // just implemented in isolation": PayseraService.verifyCallback's own
      // ss3-over-ss2 preference is unit-tested directly in
      // paysera.service.test.ts ("prefers ss3 over ss2 when both are
      // present"); THIS test proves the field that preference depends on
      // actually arrives here from a caller instead of being silently dropped.
      it('forwards ss3 alongside ss2 to payseraService.handleCallback', async () => {
        const payload = { data: 'base64data', ss1: 'hash1', ss2: 'hash2', ss3: 'hash3' };
        handleCallbackMock.mockResolvedValue({ orderId: 'order-1' } as any);

        await provider.verifyAndParseWebhook(payload);

        expect(handleCallbackMock).toHaveBeenCalledWith({
          data: 'base64data',
          ss1: 'hash1',
          ss2: 'hash2',
          ss3: 'hash3',
        });
      });

      it('forwards ss3 even when ss2 is absent (ss3-only callback)', async () => {
        const payload = { data: 'base64data', ss1: 'hash1', ss3: 'hash3' };
        handleCallbackMock.mockResolvedValue({ orderId: 'order-1' } as any);

        await provider.verifyAndParseWebhook(payload);

        expect(handleCallbackMock).toHaveBeenCalledWith(
          expect.objectContaining({ data: 'base64data', ss1: 'hash1', ss3: 'hash3' })
        );
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

      it('wraps a rejected-signature failure in PayseraSignatureVerificationError', async () => {
        handleCallbackMock.mockRejectedValue(new Error('Invalid callback signature'));

        await expect(
          provider.verifyAndParseWebhook({ data: 'base64data', ss1: 'hash1' })
        ).rejects.toBeInstanceOf(PayseraSignatureVerificationError);
      });

      it('does NOT wrap an unrelated failure (e.g. a downstream parse error)', async () => {
        handleCallbackMock.mockRejectedValue(new Error('Invalid project ID: bogus'));

        await expect(
          provider.verifyAndParseWebhook({ data: 'base64data', ss1: 'hash1' })
        ).rejects.toThrow('Invalid project ID: bogus');
        await expect(
          provider.verifyAndParseWebhook({ data: 'base64data', ss1: 'hash1' })
        ).rejects.not.toBeInstanceOf(PayseraSignatureVerificationError);
      });
    });

    describe('verifyAndParseRedirect', () => {
      // BC-QA-031-FOLLOWUP-8 item 1 / acceptance criterion 2. This is the
      // route-adjacent proof that the exemption mechanism is actually wired:
      // it must call handleCallback with the 'enforce' mode override rather
      // than leaving the global PAYSERA_SS2_MODE (which could be 'require')
      // to reject a call that structurally can never carry ss2/ss3.
      it('calls handleCallback with the "enforce" mode override and no ss2/ss3', async () => {
        handleCallbackMock.mockResolvedValue({ orderId: 'order-1' } as any);

        await provider.verifyAndParseRedirect!({ data: 'base64data', ss1: 'hash1' });

        expect(handleCallbackMock).toHaveBeenCalledWith(
          { data: 'base64data', ss1: 'hash1' },
          'enforce'
        );
      });

      it('still requires ss1 — the hard gate is not weakened by the RSA exemption', async () => {
        await expect(provider.verifyAndParseRedirect!({ data: 'base64data' })).rejects.toThrow(
          'Invalid callback data'
        );
        expect(handleCallbackMock).not.toHaveBeenCalled();
      });

      it('still requires data', async () => {
        await expect(provider.verifyAndParseRedirect!({ ss1: 'hash1' })).rejects.toThrow(
          'Invalid callback data'
        );
      });

      it('wraps a rejected-signature failure in PayseraSignatureVerificationError', async () => {
        handleCallbackMock.mockRejectedValue(new Error('Invalid callback signature'));

        await expect(
          provider.verifyAndParseRedirect!({ data: 'base64data', ss1: 'invalid' })
        ).rejects.toBeInstanceOf(PayseraSignatureVerificationError);
      });
    });

    describe('refund', () => {
      it('throws with clear message', async () => {
        await expect(
          provider.refund({ transactionId: 'tx-1', amount: 100, currency: 'EUR', orderId: 'order-1' })
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

  // BC-QA-031-FOLLOWUP-8 item 4 — an RSA signature rejection must be
  // observable, not just logged: a durable AuditLog row (read by
  // scheduler.ts#checkPaymentFailureSpike) plus a near-real-time admin-ops
  // notification.
  describe('recordPayseraSignatureRejection', () => {
    beforeEach(() => {
      writeAuditMock.mockClear();
      notifyAdminOpsMock.mockClear();
    });

    it('writes an AuditLog entry with the shared PAYSERA_SIGNATURE_REJECTED action', () => {
      recordPayseraSignatureRejection({ route: '/api/payments/callback', dataPrefix: 'abc123' });

      expect(writeAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: null,
          action: 'PAYSERA_SIGNATURE_REJECTED',
          objectType: 'PayseraCallback',
          after: expect.objectContaining({ route: '/api/payments/callback', dataPrefix: 'abc123' }),
        })
      );
    });

    it('sends a critical, cooldown-bounded admin-ops alert', () => {
      recordPayseraSignatureRejection({ route: '/api/checkout/callback', dataPrefix: 'xyz789' });

      expect(notifyAdminOpsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          opsType: 'paysera_rsa_signature_rejected',
          severity: 'critical',
          cooldownHours: 1,
        })
      );
    });
  });
});
