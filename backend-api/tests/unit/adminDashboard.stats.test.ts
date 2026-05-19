/**
 * Unit tests for GET /api/admin/dashboard stats endpoint — spec §3.1.
 *
 * Pins:
 *   • latestSubCountsRaw SQL contains `u."deletedAt" IS NULL` so soft-deleted
 *     users are excluded from expired/paused/failed subscriber sub-stats,
 *     matching the symmetry of the active count query (Bug 2 fix).
 *   • Response shape matches the AdminDashboardStats interface consumed by the
 *     frontend adminDashboard.service.ts.
 *   • payoutsDue is positive (absolute value of negative WITHDRAWAL sum).
 *   • todayAvg is 0 when there are no transactions (not NaN/Infinity).
 */

// All mock functions are defined INSIDE the factory to avoid TDZ / closure
// interference with other test files that mock the same module path.
jest.mock('../../src/lib/prisma', () => {
  const qr = jest.fn();
  const agg = jest.fn();
  const cnt = jest.fn();
  const client = {
    $queryRaw: qr,
    transaction: { count: cnt, aggregate: agg },
    walletTransaction: { aggregate: agg, count: cnt },
    partner: { count: cnt },
    venue: { count: cnt },
    partnerCashbackPayment: { aggregate: agg },
    user: { count: cnt },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'admin-1',
      rawRole: 'SUPER_ADMIN',
      permissions: ['dashboard.read'],
    };
    next();
  },
  authorize: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
}));

jest.mock('../../src/middleware/error.middleware', () => ({
  asyncHandler: (fn) => fn,
}));

import request from 'supertest';
import express from 'express';
import dashboardRouter from '../../src/routes/adminDashboard.routes';
import { prisma } from '../../src/lib/prisma';

const app = express();
app.use(express.json());
app.use('/admin/dashboard', dashboardRouter);

// Retrieve the mock functions from the registered mock (the factory defined them inside).
const m = prisma as unknown as {
  $queryRaw: jest.Mock;
  transaction: { count: jest.Mock; aggregate: jest.Mock };
  walletTransaction: { aggregate: jest.Mock; count: jest.Mock };
  partner: { count: jest.Mock };
  venue: { count: jest.Mock };
  partnerCashbackPayment: { aggregate: jest.Mock };
  user: { count: jest.Mock };
};

const ZERO_AGGREGATE = {
  _sum: { amount: null, finalAmount: null, totalCashbackOwed: null, marginAmount: null },
};

function resetMocks() {
  m.$queryRaw.mockReset();
  m.transaction.count.mockReset();
  m.transaction.aggregate.mockReset();
  m.walletTransaction.aggregate.mockReset();
  m.walletTransaction.count.mockReset();
  m.partner.count.mockReset();
  m.venue.count.mockReset();
  m.partnerCashbackPayment.aggregate.mockReset();
  m.user.count.mockReset();

  // Two $queryRaw calls: latestSubCountsRaw (status rows) + activeSubscribersRaw (cnt row)
  m.$queryRaw
    .mockResolvedValueOnce([])          // latestSubCountsRaw — no subscriptions
    .mockResolvedValueOnce([{ cnt: 0n }]); // activeSubscribersRaw
  m.transaction.aggregate.mockResolvedValue(ZERO_AGGREGATE);
  m.walletTransaction.aggregate.mockResolvedValue(ZERO_AGGREGATE);
  m.partnerCashbackPayment.aggregate.mockResolvedValue(ZERO_AGGREGATE);
  m.transaction.count.mockResolvedValue(0);
  m.walletTransaction.count.mockResolvedValue(0);
  m.partner.count.mockResolvedValue(0);
  m.venue.count.mockResolvedValue(0);
  m.user.count.mockResolvedValue(0);
}

describe('GET /admin/dashboard — spec §3.1 stats', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('latestSubCountsRaw SQL contains deletedAt IS NULL so soft-deleted users are excluded from expired/paused/failed counts (Bug 2 fix)', async () => {
    await request(app).get('/admin/dashboard').expect(200);

    // $queryRaw is called twice: latestSubCountsRaw and activeSubscribersRaw.
    // Both are tagged template calls — the first argument is a TemplateStringsArray
    // whose parts form the SQL string when joined.
    expect(m.$queryRaw).toHaveBeenCalledTimes(2);

    // Reconstruct each SQL string by joining the template parts (index 0 of each call).
    const sqlStrings = (m.$queryRaw.mock.calls as unknown[][]).map((callArgs) => {
      const parts = callArgs[0] as readonly string[];
      return parts.join('');
    });

    // Both raw queries must guard against soft-deleted users.
    // Before the fix, latestSubCountsRaw was missing this guard, causing
    // expired/paused/failed sub-stats to include soft-deleted accounts.
    for (const sql of sqlStrings) {
      expect(sql).toContain('"deletedAt" IS NULL');
    }
  });

  it('returns the 5 stat blocks required by spec §3.1 with correct shape', async () => {
    const res = await request(app).get('/admin/dashboard').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.generatedAt).toBeDefined();

    const { data } = res.body;

    // §3.1 Абонати
    expect(data.subscribers).toMatchObject({
      active: expect.any(Number),
      newLast30Days: expect.any(Number),
      expired: expect.any(Number),
      paused: expect.any(Number),
      failedPayment: expect.any(Number),
    });
    // §3.1 Транзакции
    expect(data.transactions).toMatchObject({
      todayCount: expect.any(Number),
      todayVolume: expect.any(Number),
      todayAvg: expect.any(Number),
      totalVolume: expect.any(Number),
    });
    // §3.1 Кешбек
    expect(data.cashback).toMatchObject({
      accrued: expect.any(Number),
      approved: expect.any(Number),
      pending: expect.any(Number),
      expiringSoon: expect.any(Number),
    });
    // §3.1 Партньори
    expect(data.partners).toMatchObject({
      active: expect.any(Number),
      requests: expect.any(Number),
      locations: expect.any(Number),
    });
    // §3.1 Финанси
    expect(data.finance).toMatchObject({
      payoutsDue: expect.any(Number),
      payoutsDueCount: expect.any(Number),
      partnerReceivables: expect.any(Number),
      margin: expect.any(Number),
    });
  });

  it('payoutsDue is the absolute value of the negative WITHDRAWAL sum (WITHDRAWAL amounts stored negative)', async () => {
    // wallet.service.ts stores WITHDRAWAL amount as -payoutAmount. The dashboard
    // must surface a positive BGN figure via Math.abs().
    m.$queryRaw.mockReset();
    m.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 0n }]);

    // Simulate a total withdrawal sum of -250 (two PENDING withdrawals of 125 each)
    m.walletTransaction.aggregate.mockImplementation(({ where }) => {
      if (where?.type === 'WITHDRAWAL' && where?.status?.in) {
        return Promise.resolve({ _sum: { amount: -250 } });
      }
      return Promise.resolve(ZERO_AGGREGATE);
    });

    const res = await request(app).get('/admin/dashboard').expect(200);
    expect(res.body.data.finance.payoutsDue).toBe(250);
  });

  it('todayAvg is 0 (not NaN/Infinity) when there are no transactions today', async () => {
    m.transaction.count.mockResolvedValue(0); // todayTxCount = 0
    const res = await request(app).get('/admin/dashboard').expect(200);
    expect(res.body.data.transactions.todayAvg).toBe(0);
    expect(Number.isFinite(res.body.data.transactions.todayAvg)).toBe(true);
  });
});
