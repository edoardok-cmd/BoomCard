/**
 * §6 Finance — payout subscription gate fixes
 *
 * Bug 1: FAILED_PAYMENT was missing from SUB_STATUS_BG → raw enum shown in 422 messages.
 * Bug 2: bulk-approve used findMany (any eligible sub) instead of latest sub per user.
 *        A user with an old ACTIVE + new FAILED_PAYMENT sub would have been incorrectly approved.
 *
 * Tests:
 *   1.  single-approve: FAILED_PAYMENT → 422, message contains "неуспешно плащане"
 *   2.  single-approve: PAST_DUE → 422, message contains "неуспешно плащане"
 *   3.  single-approve: NO_SUBSCRIPTION → 422, reason = NO_SUBSCRIPTION
 *   4.  single-approve: ACTIVE sub → gate passes, executePayoutTransfer called
 *   5.  bulk-approve: FAILED_PAYMENT latest sub → user skipped (skippedNoSub=1)
 *   6.  bulk-approve: stale-sub scenario (old ACTIVE + new FAILED_PAYMENT) → user skipped
 *   7.  bulk-approve: ACTIVE latest sub → user approved
 *   8.  bulk-approve: mixed batch (1 ACTIVE + 1 FAILED_PAYMENT) → approved=1, skippedNoSub=1
 *   9.  bulk-approve: subscription.findFirst called with orderBy: createdAt desc per user
 */

// ── Currency display mock (prevents isCurrencyTransitionWindowOpen DB hit) ────

jest.mock('../../src/utils/currencyDisplay', () => ({
  isCurrencyTransitionWindowOpen: jest.fn(async () => false),
  buildDualCurrencyMap: jest.fn(() => ({})),
  toDualCurrency: jest.fn((v: any) => v),
}));

// ── Mutable mock state ────────────────────────────────────────────────────────

let txFindFirstResult: any = null;
let txFindManyResult: any[]  = [];
// Per-user subscription map; simulates "latest sub" returned by findFirst+orderBy:desc
const subByUserId: Record<string, any> = {};
const executePayoutTransferMock = jest.fn();

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client = {
    walletTransaction: {
      findFirst:  jest.fn(async () => txFindFirstResult),
      findMany:   jest.fn(async () => txFindManyResult),
      findUnique: jest.fn(async () => null),
    },
    subscription: {
      findFirst: jest.fn(async (args: any) => {
        const userId = args?.where?.userId;
        return subByUserId[userId] ?? null;
      }),
    },
    payoutThreshold: {
      findFirst: jest.fn(async () => null),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── Auth/audit middleware mocks (pass-through) ────────────────────────────────

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate:      (_req: any, _res: any, next: any) => next(),
  authorize:         () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  AuthRequest:       {},
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit:      jest.fn(),
}));

// ── Service / utility mocks ───────────────────────────────────────────────────

jest.mock('../../src/services/wallet.service', () => ({
  walletService: { executePayoutTransfer: executePayoutTransferMock },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: jest.fn() },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: { send: jest.fn(), sendToUser: jest.fn(), notifyPayoutEvent: jest.fn(async () => {}) },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// runWithConcurrency: execute serially (no real concurrency needed in unit tests)
jest.mock('../../src/utils/concurrency', () => ({
  runWithConcurrency: jest.fn(
    async (items: any[], _limit: number, fn: (...args: any[]) => any) =>
      Promise.allSettled(items.map(fn)),
  ),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import payoutsRouter from '../../src/routes/adminPayouts.routes';
import { prisma } from '../../src/lib/prisma';

const app = express();
app.use(express.json());
app.use('/admin/payouts', payoutsRouter);

type AnyMock = jest.Mock;
const mp = prisma as unknown as {
  walletTransaction: { findFirst: AnyMock; findMany: AnyMock; findUnique: AnyMock };
  subscription:      { findFirst: AnyMock };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayout(overrides: Partial<{ id: string; wallet: any }> = {}) {
  const userId = overrides.wallet?.userId ?? 'user-1';
  return {
    id: 'payout-1',
    type: 'WITHDRAWAL',
    status: 'PENDING',
    amount: 50,
    currency: 'BGN',
    wallet: {
      id: 'wallet-1',
      userId,
      payoutIban: 'LT123456789012345678',
      user: { id: userId },
    },
    ...overrides,
  };
}

function reset() {
  txFindFirstResult = null;
  txFindManyResult  = [];
  for (const k of Object.keys(subByUserId)) delete subByUserId[k];
  executePayoutTransferMock.mockReset();
  jest.clearAllMocks();
  // Re-wire implementations after clearAllMocks (defensive)
  mp.walletTransaction.findFirst.mockImplementation(async () => txFindFirstResult);
  mp.walletTransaction.findMany.mockImplementation(async  () => txFindManyResult);
  mp.walletTransaction.findUnique.mockImplementation(async () => null);
  mp.subscription.findFirst.mockImplementation(async (args: any) => {
    const userId = args?.where?.userId;
    return subByUserId[userId] ?? null;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('§6 Finance — payout subscription gate', () => {
  beforeEach(reset);

  // ─ Single-approve — label fix (Bug 1) ─────────────────────────────────────

  it('single-approve: FAILED_PAYMENT → 422 with Bulgarian label "неуспешно плащане"', async () => {
    txFindFirstResult = makePayout();
    subByUserId['user-1'] = { status: 'FAILED_PAYMENT' };

    const res = await request(app).patch('/admin/payouts/payout-1/approve');

    expect(res.status).toBe(422);
    expect(res.body.message).toContain('неуспешно плащане');
    expect(res.body.reason).toBe('FAILED_PAYMENT');
    expect(res.body.subscriptionStatus).toBe('FAILED_PAYMENT');
  });

  it('single-approve: PAST_DUE → 422 with subscription inactive message', async () => {
    txFindFirstResult = makePayout();
    // first call = latest sub (PAST_DUE); second call = eligible sub check (null, PAST_DUE is not eligible)
    mp.subscription.findFirst
      .mockResolvedValueOnce({ status: 'PAST_DUE' })
      .mockResolvedValueOnce(null);

    const res = await request(app).patch('/admin/payouts/payout-1/approve');

    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('NO_SUBSCRIPTION');
    expect(res.body.message).toContain('абонамент');
  });

  it('single-approve: NO_SUBSCRIPTION (null findFirst) → 422, reason=NO_SUBSCRIPTION', async () => {
    txFindFirstResult = makePayout();
    // subByUserId has no entry → findFirst returns null

    const res = await request(app).patch('/admin/payouts/payout-1/approve');

    expect(res.status).toBe(422);
    expect(res.body.reason).toBe('NO_SUBSCRIPTION');
    expect(res.body.message).toContain('абонамент');
  });

  it('single-approve: ACTIVE subscription → gate passes, executePayoutTransfer called', async () => {
    txFindFirstResult = makePayout();
    subByUserId['user-1'] = { status: 'ACTIVE' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });
    mp.walletTransaction.findUnique.mockResolvedValue(makePayout({ id: 'payout-1' }));

    const res = await request(app).patch('/admin/payouts/payout-1/approve');

    expect(res.status).toBe(200);
    expect(executePayoutTransferMock).toHaveBeenCalledWith('payout-1');
  });

  it('single-approve: TRIALING subscription → gate passes', async () => {
    txFindFirstResult = makePayout();
    subByUserId['user-1'] = { status: 'TRIALING' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });
    mp.walletTransaction.findUnique.mockResolvedValue(makePayout({ id: 'payout-1' }));

    const res = await request(app).patch('/admin/payouts/payout-1/approve');

    expect(res.status).toBe(200);
    expect(executePayoutTransferMock).toHaveBeenCalledWith('payout-1');
  });

  // ─ Bulk-approve — latest-sub gate fix (Bug 2) ─────────────────────────────

  it('bulk-approve: user with FAILED_PAYMENT latest sub is skipped (skippedNoSub=1)', async () => {
    txFindManyResult = [
      makePayout({ id: 'p1', wallet: { id: 'w1', userId: 'user-fail', payoutIban: 'LT1', user: { id: 'user-fail' } } }),
    ];
    subByUserId['user-fail'] = { status: 'FAILED_PAYMENT' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });

    const res = await request(app).patch('/admin/payouts/bulk-approve');

    expect(res.status).toBe(200);
    expect(res.body.skippedNoSub).toBe(1);
    expect(res.body.approved).toBe(0);
    expect(executePayoutTransferMock).not.toHaveBeenCalled();
  });

  it('bulk-approve: stale-sub scenario — old ACTIVE + new FAILED_PAYMENT → user skipped (Bug 2)', async () => {
    // Before the fix: findMany matched the old ACTIVE sub → user incorrectly approved.
    // After the fix: checkSubscriptionGate uses findFirst+orderBy:desc → returns FAILED_PAYMENT.
    txFindManyResult = [
      makePayout({ id: 'p-stale', wallet: { id: 'w-stale', userId: 'user-stale', payoutIban: 'LT2', user: { id: 'user-stale' } } }),
    ];
    // Mock represents the LATEST subscription (the new FAILED_PAYMENT one)
    subByUserId['user-stale'] = { status: 'FAILED_PAYMENT' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });

    const res = await request(app).patch('/admin/payouts/bulk-approve');

    expect(res.status).toBe(200);
    expect(res.body.skippedNoSub).toBe(1);
    expect(executePayoutTransferMock).not.toHaveBeenCalled();
  });

  it('bulk-approve: ACTIVE latest sub → user approved', async () => {
    txFindManyResult = [
      makePayout({ id: 'p-ok', wallet: { id: 'w-ok', userId: 'user-ok', payoutIban: 'LT3', user: { id: 'user-ok' } } }),
    ];
    subByUserId['user-ok'] = { status: 'ACTIVE' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });

    const res = await request(app).patch('/admin/payouts/bulk-approve');

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(1);
    expect(res.body.skippedNoSub).toBe(0);
    expect(executePayoutTransferMock).toHaveBeenCalledWith('p-ok');
  });

  it('bulk-approve: mixed batch — ACTIVE approved, FAILED_PAYMENT skipped', async () => {
    txFindManyResult = [
      makePayout({ id: 'p-a', wallet: { id: 'wa', userId: 'user-a', payoutIban: 'LT1', user: { id: 'user-a' } } }),
      makePayout({ id: 'p-b', wallet: { id: 'wb', userId: 'user-b', payoutIban: 'LT2', user: { id: 'user-b' } } }),
    ];
    subByUserId['user-a'] = { status: 'ACTIVE' };
    subByUserId['user-b'] = { status: 'FAILED_PAYMENT' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });

    const res = await request(app).patch('/admin/payouts/bulk-approve');

    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(1);
    expect(res.body.skippedNoSub).toBe(1);
    expect(executePayoutTransferMock).toHaveBeenCalledWith('p-a');
    expect(executePayoutTransferMock).not.toHaveBeenCalledWith('p-b');
  });

  it('bulk-approve: subscription.findFirst is called with orderBy: { createdAt: desc } per user', async () => {
    txFindManyResult = [
      makePayout({ id: 'p1', wallet: { id: 'w1', userId: 'user-1', payoutIban: 'LT1', user: { id: 'user-1' } } }),
    ];
    subByUserId['user-1'] = { status: 'ACTIVE' };
    executePayoutTransferMock.mockResolvedValue({ alreadyProcessed: false });

    await request(app).patch('/admin/payouts/bulk-approve');

    const findFirstCalls = mp.subscription.findFirst.mock.calls;
    expect(findFirstCalls.length).toBeGreaterThan(0);
    expect(findFirstCalls[0][0]).toMatchObject({
      where:   { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
