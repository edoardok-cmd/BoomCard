/**
 * BC-QA-031-FOLLOWUP-8 — end-to-end route coverage (real Express router +
 * real Prisma test DB) for:
 *   - ss3 forwarding from every callback route through to the verifier
 *     (acceptance criterion 1's caller-side half).
 *   - /verify-redirect's RSA exemption being wired end-to-end via the route,
 *     not just implemented in payment-provider.ts in isolation (criterion 2).
 *   - A rejected signature producing a real, queryable AuditLog row via each
 *     route's own catch block (criterion 5 / item 4's observability
 *     requirement), proven through the actual HTTP path.
 *
 * `paysera.service` is MOCKED here so a rejected/accepted signature can be
 * driven deterministically without a real Paysera RSA keypair. This is a
 * DELIBERATE trade-off against re-importing the full app with a different
 * PAYSERA_SS2_MODE/PAYSERA_PUBLIC_KEY (which would mean a second
 * PrismaClient / connection pool for this file — see the AX harness memory
 * on shared-checkout races and Postgres cluster pressure on this machine).
 * The real require-mode/modeOverride RSA mechanics this mock stands in for
 * are pinned with NO mocks in paysera.service.test.ts's "modeOverride
 * parameter (verify-redirect exemption mechanism)" suite; this file proves
 * the ROUTE LAYER wiring on top of that (forwarding, error-shape handling,
 * observability), which is what criterion 1 asks to have "exercised, not
 * just implemented in isolation".
 */

import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma';
import { drainDetached } from '../../src/utils/detach';

const handleCallbackMock = jest.fn();
const generateCallbackResponseMock = jest.fn(() => 'OK');

jest.mock('../../src/services/paysera.service', () => ({
  payseraService: {
    handleCallback: (...args: unknown[]) => handleCallbackMock(...args),
    generateCallbackResponse: () => generateCallbackResponseMock(),
  },
  PayseraService: class {
    static validateAmount() { return true; }
    static amountToCents(a: number) { return Math.round(a * 100); }
    static getAcceptedCurrencies() { return ['BGN', 'EUR']; }
    static getSupportedPaymentMethods() { return []; }
  },
}));

// eslint-disable-next-line import/first
import paymentsRouter from '../../src/routes/payments.paysera.routes';
// eslint-disable-next-line import/first
import checkoutRouter from '../../src/routes/pending-checkout.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/payments', paymentsRouter);
  app.use('/api/checkout', checkoutRouter);
  return app;
}

const app = buildApp();

const REJECTED_SIGNATURE_ERROR = new Error('Invalid callback signature');
const AUDIT_ACTION = 'PAYSERA_SIGNATURE_REJECTED';

async function countRejectionAuditRows(): Promise<number> {
  return prisma.auditLog.count({ where: { action: AUDIT_ACTION, objectType: 'PayseraCallback' } });
}

describe('Paysera callback routes — ss3 forwarding + require-mode/observability wiring', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.auditLog.deleteMany({ where: { action: AUDIT_ACTION, objectType: 'PayseraCallback' } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { action: AUDIT_ACTION, objectType: 'PayseraCallback' } });
  });

  describe('POST /api/payments/callback', () => {
    it('forwards ss3 alongside ss2 to the verifier', async () => {
      handleCallbackMock.mockResolvedValue({
        orderId: 'NON-EXISTENT-ORDER', status: 'pending', rawStatus: '0', amount: 0,
        currency: 'EUR', transactionId: 'tx', paymentMethod: 'card', isTest: true,
      });

      await request(app)
        .post('/api/payments/callback')
        .send({ data: 'somedata', ss1: 'somess1', ss2: 'somess2', ss3: 'somess3' });

      expect(handleCallbackMock).toHaveBeenCalledWith({
        data: 'somedata', ss1: 'somess1', ss2: 'somess2', ss3: 'somess3',
      });
    });

    it('acks the webhook but records an observable signature rejection when verification fails', async () => {
      handleCallbackMock.mockRejectedValue(REJECTED_SIGNATURE_ERROR);

      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: 'somedata', ss1: 'somess1', ss3: 'somess3-only' });

      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
      await drainDetached();
      expect(await countRejectionAuditRows()).toBeGreaterThan(0);
    });

    it('does NOT record a signature-rejection audit row for an unrelated failure', async () => {
      handleCallbackMock.mockRejectedValue(new Error('Invalid project ID: bogus'));

      const res = await request(app)
        .post('/api/payments/callback')
        .send({ data: 'somedata', ss1: 'somess1' });

      expect(res.status).toBe(200);
      await drainDetached();
      expect(await countRejectionAuditRows()).toBe(0);
    });
  });

  describe('POST /api/payments/subscription/callback', () => {
    it('forwards ss3 and records an observable rejection', async () => {
      handleCallbackMock.mockRejectedValue(REJECTED_SIGNATURE_ERROR);

      const res = await request(app)
        .post('/api/payments/subscription/callback')
        .send({ data: 'subdata', ss1: 'ss1val', ss3: 'ss3val' });

      expect(res.status).toBe(200);
      expect(handleCallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: 'subdata', ss1: 'ss1val', ss3: 'ss3val' })
      );
      await drainDetached();
      expect(await countRejectionAuditRows()).toBeGreaterThan(0);
    });
  });

  describe('POST /api/checkout/callback (pending-checkout.routes.ts)', () => {
    it('forwards ss3 (calls payseraService.handleCallback directly) and records an observable rejection', async () => {
      handleCallbackMock.mockRejectedValue(REJECTED_SIGNATURE_ERROR);

      const res = await request(app)
        .post('/api/checkout/callback')
        .send({ data: 'chkdata', ss1: 'ss1v', ss2: 'ss2v', ss3: 'ss3v' });

      expect(res.status).toBe(200);
      expect(handleCallbackMock).toHaveBeenCalledWith({
        data: 'chkdata', ss1: 'ss1v', ss2: 'ss2v', ss3: 'ss3v',
      });
      await drainDetached();
      expect(await countRejectionAuditRows()).toBeGreaterThan(0);
    });

    it('does NOT record a rejection row for an unrelated failure', async () => {
      handleCallbackMock.mockRejectedValue(new Error('Some other processing error'));

      const res = await request(app)
        .post('/api/checkout/callback')
        .send({ data: 'chkdata', ss1: 'ss1v' });

      expect(res.status).toBe(200);
      await drainDetached();
      expect(await countRejectionAuditRows()).toBe(0);
    });
  });

  describe('POST /api/payments/verify-redirect', () => {
    it('calls the verifier with the "enforce" mode override and no ss2/ss3 — the RSA exemption wired end-to-end via the route', async () => {
      handleCallbackMock.mockResolvedValue({
        orderId: 'ORDER-1', status: 'success', rawStatus: '1', amount: 1000,
        currency: 'EUR', transactionId: 'tx-1', paymentMethod: 'card', isTest: true,
      });

      const res = await request(app)
        .post('/api/payments/verify-redirect')
        .send({ data: 'redirectdata', ss1: 'redirectss1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Proves the route used verifyAndParseRedirect (mode override present),
      // not verifyAndParseWebhook (which would call with just the callback,
      // no second argument) — this is the exact mechanism that keeps
      // PAYSERA_SS2_MODE=require from rejecting this endpoint's traffic.
      expect(handleCallbackMock).toHaveBeenCalledWith(
        { data: 'redirectdata', ss1: 'redirectss1' },
        'enforce'
      );
    });

    it('still requires ss1 — 400s without ever calling the verifier (RSA exemption does not weaken ss1)', async () => {
      const res = await request(app)
        .post('/api/payments/verify-redirect')
        .send({ data: 'redirectdata' });

      expect(res.status).toBe(400);
      expect(handleCallbackMock).not.toHaveBeenCalled();
    });

    it('returns 400 when the verifier rejects (e.g. a bad ss1)', async () => {
      handleCallbackMock.mockRejectedValue(new Error('Invalid callback signature'));

      const res = await request(app)
        .post('/api/payments/verify-redirect')
        .send({ data: 'redirectdata', ss1: 'bad-ss1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
