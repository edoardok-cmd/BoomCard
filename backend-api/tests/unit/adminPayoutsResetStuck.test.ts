/**
 * Unit tests for PATCH /api/admin/payouts/:id/reset-stuck.
 *
 * Recovery path for the narrow crash window where executePayoutTransfer
 * wins the PENDING → PROCESSING race but the process dies before Paysera
 * createTransfer fires. The row is stuck PROCESSING with no
 * payseraTransferId; reset-stuck demotes it back to PENDING so /approve
 * can retry. Strict guards prevent misuse on rows where a transfer was
 * actually created.
 */

const findFirstMock = jest.fn();
const findUniqueMock = jest.fn();
const updateManyMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    walletTransaction: {
      findFirst: findFirstMock,
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['finance.payouts.write'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: jest.fn(async () => undefined) },
}));

jest.mock('../../src/services/wallet.service', () => ({
  walletService: { executePayoutTransfer: jest.fn() },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import adminPayoutsRouter from '../../src/routes/adminPayouts.routes';

const app = express();
app.use(express.json());
app.use('/api/admin/payouts', adminPayoutsRouter);

const FIVE_MINUTES_AGO = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();
const TEN_SECONDS_AGO = () => new Date(Date.now() - 10 * 1000).toISOString();

beforeEach(() => {
  findFirstMock.mockReset();
  findUniqueMock.mockReset();
  updateManyMock.mockReset();
});

describe('PATCH /api/admin/payouts/:id/reset-stuck', () => {
  it('demotes a stuck PROCESSING row (no payseraTransferId, past grace) to PENDING', async () => {
    findFirstMock.mockResolvedValue({
      id: 'tx-1',
      type: 'WITHDRAWAL',
      status: 'PROCESSING',
      metadata: JSON.stringify({ processingStartedAt: FIVE_MINUTES_AGO(), callbackSecret: 'sek' }),
    });
    updateManyMock.mockResolvedValue({ count: 1 });
    findUniqueMock.mockResolvedValue({ id: 'tx-1', status: 'PENDING' });

    const res = await request(app).patch('/api/admin/payouts/tx-1/reset-stuck').send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const call = updateManyMock.mock.calls[0][0];
    // Atomic precondition — must scope to PROCESSING rows only
    expect(call.where).toEqual({ id: 'tx-1', status: 'PROCESSING' });
    expect(call.data.status).toBe('PENDING');

    // processingStartedAt is stripped; resetStuckAt is stamped; callbackSecret preserved
    const newMeta = JSON.parse(call.data.metadata);
    expect(newMeta.processingStartedAt).toBeUndefined();
    expect(newMeta.resetStuckAt).toBeTruthy();
    expect(newMeta.callbackSecret).toBe('sek');
  });

  it('refuses when the row has a payseraTransferId (transfer was already created)', async () => {
    findFirstMock.mockResolvedValue({
      id: 'tx-2',
      type: 'WITHDRAWAL',
      status: 'PROCESSING',
      metadata: JSON.stringify({
        processingStartedAt: FIVE_MINUTES_AGO(),
        payseraTransferId: 'pay-xyz',
      }),
    });

    const res = await request(app).patch('/api/admin/payouts/tx-2/reset-stuck').send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('TRANSFER_ALREADY_CREATED');
    expect(res.body.payseraTransferId).toBe('pay-xyz');
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('refuses when processingStartedAt is within the 2-minute grace period', async () => {
    findFirstMock.mockResolvedValue({
      id: 'tx-3',
      type: 'WITHDRAWAL',
      status: 'PROCESSING',
      metadata: JSON.stringify({ processingStartedAt: TEN_SECONDS_AGO() }),
    });

    const res = await request(app).patch('/api/admin/payouts/tx-3/reset-stuck').send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('WITHIN_GRACE_PERIOD');
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('refuses non-PROCESSING rows', async () => {
    findFirstMock.mockResolvedValue({
      id: 'tx-4',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      metadata: null,
    });

    const res = await request(app).patch('/api/admin/payouts/tx-4/reset-stuck').send({});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('NOT_PROCESSING');
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('404s on unknown payout', async () => {
    findFirstMock.mockResolvedValue(null);
    const res = await request(app).patch('/api/admin/payouts/missing/reset-stuck').send({});
    expect(res.status).toBe(404);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('returns 409 CONCURRENT_TRANSITION if another caller already changed the status', async () => {
    findFirstMock.mockResolvedValue({
      id: 'tx-5',
      type: 'WITHDRAWAL',
      status: 'PROCESSING',
      metadata: JSON.stringify({ processingStartedAt: FIVE_MINUTES_AGO() }),
    });
    // Simulate: between findFirst and updateMany, someone else flipped the row
    updateManyMock.mockResolvedValue({ count: 0 });

    const res = await request(app).patch('/api/admin/payouts/tx-5/reset-stuck').send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('CONCURRENT_TRANSITION');
  });

  it('refuses when metadata.manualHold === true (no-Paysera-configured park)', async () => {
    // executePayoutTransfer stamps manualHold:true on rows it parks in
    // PROCESSING because Paysera Transfer API is not configured. Those rows
    // must be /completed or /failed by an admin, NOT demoted back to PENDING.
    findFirstMock.mockResolvedValue({
      id: 'tx-7',
      type: 'WITHDRAWAL',
      status: 'PROCESSING',
      metadata: JSON.stringify({
        processingStartedAt: FIVE_MINUTES_AGO(),
        manualHold: true,
      }),
    });

    const res = await request(app).patch('/api/admin/payouts/tx-7/reset-stuck').send({});
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('MANUAL_HOLD');
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('handles a PROCESSING row with no processingStartedAt (legacy) — allows reset', async () => {
    // Defensive: if metadata is missing the timestamp altogether, we cannot
    // enforce the grace window. Current code allows the reset; this test pins
    // that behavior so future tighteners don't accidentally lock out legacy rows.
    findFirstMock.mockResolvedValue({
      id: 'tx-6',
      type: 'WITHDRAWAL',
      status: 'PROCESSING',
      metadata: JSON.stringify({}),
    });
    updateManyMock.mockResolvedValue({ count: 1 });
    findUniqueMock.mockResolvedValue({ id: 'tx-6', status: 'PENDING' });

    const res = await request(app).patch('/api/admin/payouts/tx-6/reset-stuck').send({});
    expect(res.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });
});
