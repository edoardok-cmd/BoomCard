/**
 * Unit tests for PATCH /api/admin/payouts/bulk-approve response semantics.
 *
 * Pins:
 *   • `approved` counts ONLY the rows this call newly transitioned
 *     PENDING → PROCESSING — not rows another concurrent caller already
 *     claimed (those count under `alreadyProcessed`).
 *   • Email notifications fire only on the newly-approved set, never on
 *     already-processed rows (would double-email the subscriber).
 *   • Failed rows are counted separately and a failed-payout email fires.
 *   • Aggregate `skipped` includes no-IBAN + no-sub + failed for backwards
 *     compatibility with older API callers.
 *   • Subscription gate uses findFirst+orderBy:desc per user so the LATEST
 *     subscription determines eligibility ("latest-sub-wins" semantics).
 */

const findManyMock        = jest.fn();
// The (..._args: any[]) rest param (rather than a zero-arg () =>) keeps
// updateMock.mock.calls[n] typed as any[] instead of TS inferring the
// narrower `[]` tuple from a zero-parameter implementation -- the latter
// makes `call[0]` (used throughout this file) a type error.
const updateMock          = jest.fn(async (..._args: any[]) => ({}));
const subFindFirstMock    = jest.fn();
const findUniqueMock      = jest.fn();
const executeTransferMock = jest.fn();
const sendEmailMock       = jest.fn(async () => undefined);

// subByUserId maps userId → subscription row (or undefined = no sub)
const subByUserId: Record<string, { status: string } | null> = {};

jest.mock('../../src/lib/prisma', () => {
  const client = {
    walletTransaction: {
      findMany: findManyMock,
      findUnique: findUniqueMock,
      update: updateMock,
    },
    subscription: {
      findFirst: subFindFirstMock,
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutHeldNoIban: jest.fn(async () => undefined),
    notifyPayoutEvent: jest.fn(async () => undefined),
  },
}));

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
  emailService: { sendEmail: sendEmailMock },
}));

jest.mock('../../src/services/wallet.service', () => ({
  walletService: { executePayoutTransfer: executeTransferMock },
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

function row(id: string, opts: { iban?: string | null; userId?: string } = {}) {
  return {
    id,
    type: 'WITHDRAWAL',
    status: 'PENDING',
    amount: -100,
    currency: 'BGN',
    wallet: {
      payoutIban: opts.iban === undefined ? 'BG80BNBG96611020345678' : opts.iban,
      user: { id: opts.userId ?? `user-${id}`, email: `${id}@x.com`, firstName: 'A', lastName: 'B' },
    },
  };
}

beforeEach(() => {
  findManyMock.mockReset();
  updateMock.mockReset();
  updateMock.mockResolvedValue({});
  findUniqueMock.mockReset();
  executeTransferMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  for (const k of Object.keys(subByUserId)) delete subByUserId[k];
  // notifySubscriber re-reads the tx to populate the email body — return a
  // minimal shape so the email sender doesn't crash on missing fields.
  findUniqueMock.mockImplementation(async (_args: any) => ({
    amount: -100,
    currency: 'BGN',
    wallet: { userId: 'u-1', user: { email: 'u@x.com', firstName: 'U', lastName: 'B' } },
  }));
  // Wire findFirst to the per-user subByUserId map (latest-sub-wins semantics)
  subFindFirstMock.mockImplementation(async (args: any) => {
    const userId = args?.where?.userId;
    return subByUserId[userId] ?? null;
  });
});

describe('PATCH /api/admin/payouts/bulk-approve — response counts', () => {
  it('counts approved separately from alreadyProcessed; only newly-approved rows get notified', async () => {
    const a = row('a');                         // newly approved
    const b = row('b');                         // already processed by a concurrent caller
    const c = row('c', { iban: null });         // skipped: no IBAN
    const d = row('d', { userId: 'no-sub' });   // skipped: no eligible subscription
    findManyMock.mockResolvedValue([a, b, c, d]);
    // user-a and user-b have ACTIVE subs; user-no-sub absent → d gets skippedNoSub
    subByUserId['user-a'] = { status: 'ACTIVE' };
    subByUserId['user-b'] = { status: 'ACTIVE' };

    executeTransferMock.mockImplementation(async (id: string) => {
      if (id === 'a') return { amount: 100, currency: 'BGN', transferId: 't-1' };
      if (id === 'b') return { amount: 100, currency: 'BGN', alreadyProcessed: true };
      throw new Error('unexpected execute call for ' + id);
    });

    const res = await request(app).patch('/api/admin/payouts/bulk-approve').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      approved: 1,
      alreadyProcessed: 1,
      failed: 0,
      held: 1,
      skippedNoSub: 1,
      total: 4,
      skipped: 2, // noIban + noSub + failed
    });

    // Exactly one APPROVED email — the alreadyProcessed row must NOT re-notify.
    // (Subjects include "одобрено" for approved; "не беше успешно" for failed.)
    const approvedEmails = sendEmailMock.mock.calls.filter(
      (c: any[]) => /одобрено/.test((c[0] as any).subject),
    );
    expect(approvedEmails).toHaveLength(1);

    // Verify the no-IBAN hold (row c) was written with metadata.noIbanHold=true so
    // the two-strike counter excludes it from genuine failure counts.
    const holdCall = updateMock.mock.calls.find(
      (call: any[]) => call[0]?.where?.id === 'c',
    );
    expect(holdCall).toBeDefined();
    const holdMeta = JSON.parse(holdCall![0].data.metadata);
    expect(holdMeta.noIbanHold).toBe(true);
  });

  it('counts failures and sends a failed-payout email for each failure', async () => {
    const a = row('a');
    const b = row('b');
    findManyMock.mockResolvedValue([a, b]);
    subByUserId['user-a'] = { status: 'ACTIVE' };
    subByUserId['user-b'] = { status: 'ACTIVE' };

    executeTransferMock.mockImplementation(async (id: string) => {
      if (id === 'a') return { amount: 100, currency: 'BGN', transferId: 't-1' };
      throw new Error('Paysera 503');
    });

    const res = await request(app).patch('/api/admin/payouts/bulk-approve').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      approved: 1,
      alreadyProcessed: 0,
      failed: 1,
      held: 0,
      skippedNoSub: 0,
      total: 2,
      skipped: 1, // 0 + 0 + 1 failed
    });

    const failedEmails = sendEmailMock.mock.calls.filter(
      (c: any[]) => /не беше успешно/.test((c[0] as any).subject),
    );
    expect(failedEmails).toHaveLength(1);
  });

  it('returns zeros when there is nothing pending', async () => {
    findManyMock.mockResolvedValue([]);

    const res = await request(app).patch('/api/admin/payouts/bulk-approve').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      approved: 0,
      alreadyProcessed: 0,
      failed: 0,
      held: 0,
      skippedNoSub: 0,
      total: 0,
      skipped: 0,
    });
    expect(executeTransferMock).not.toHaveBeenCalled();
  });

  it('no-IBAN hold preserves pre-existing metadata fields when stamping noIbanHold=true', async () => {
    const priorMeta = { plan: 'BASIC', requestedAt: '2025-01-01T00:00:00.000Z' };
    const c = { ...row('c', { iban: null }), metadata: JSON.stringify(priorMeta) };
    findManyMock.mockResolvedValue([c]);

    await request(app).patch('/api/admin/payouts/bulk-approve').send({});

    const holdCall = updateMock.mock.calls.find((call: any[]) => call[0]?.where?.id === 'c');
    expect(holdCall).toBeDefined();
    const writtenMeta = JSON.parse(holdCall![0].data.metadata);
    expect(writtenMeta.noIbanHold).toBe(true);
    expect(writtenMeta.plan).toBe('BASIC');
    expect(writtenMeta.requestedAt).toBe('2025-01-01T00:00:00.000Z');
  });
});
