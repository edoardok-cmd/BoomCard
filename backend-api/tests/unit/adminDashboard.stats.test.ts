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
  const grp = jest.fn();
  const txGrp = jest.fn();
  const client = {
    $queryRaw: qr,
    // BC-QA-031: the two transaction-volume reads are groupBy(['currency']),
    // not aggregate — Transaction.currency is mixed, so the volume subtotals
    // must be converted per currency before they are folded. `txGrp` is kept
    // separate from the walletTransaction `grp` so each can be asserted alone.
    transaction: { count: cnt, aggregate: agg, groupBy: txGrp },
    walletTransaction: { aggregate: agg, count: cnt, groupBy: grp },
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
import { bgnToEur } from '../../src/utils/currency';

const app = express();
app.use(express.json());
app.use('/admin/dashboard', dashboardRouter);

// Retrieve the mock functions from the registered mock (the factory defined them inside).
const m = prisma as unknown as {
  $queryRaw: jest.Mock;
  transaction: { count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };
  walletTransaction: { aggregate: jest.Mock; count: jest.Mock; groupBy: jest.Mock };
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
  m.transaction.groupBy.mockReset();
  m.walletTransaction.aggregate.mockReset();
  m.walletTransaction.count.mockReset();
  m.walletTransaction.groupBy.mockReset();
  m.partner.count.mockReset();
  m.venue.count.mockReset();
  m.partnerCashbackPayment.aggregate.mockReset();
  m.user.count.mockReset();

  // Two $queryRaw calls: latestSubCountsRaw (status rows) + activeSubscribersRaw (cnt row)
  m.$queryRaw
    .mockResolvedValueOnce([])          // latestSubCountsRaw — no subscriptions
    .mockResolvedValueOnce([{ cnt: 0n }]); // activeSubscribersRaw
  m.transaction.aggregate.mockResolvedValue(ZERO_AGGREGATE);
  // Transaction volume groupBy(['currency']) — default to no rows, which the
  // route folds to a 0 EUR total (BC-QA-031).
  m.transaction.groupBy.mockResolvedValue([]);
  m.walletTransaction.aggregate.mockResolvedValue(ZERO_AGGREGATE);
  m.partnerCashbackPayment.aggregate.mockResolvedValue(ZERO_AGGREGATE);
  m.transaction.count.mockResolvedValue(0);
  m.walletTransaction.count.mockResolvedValue(0);
  // §3.1 cashback-status breakdown groupBy — default to no rows (route zero-fills).
  m.walletTransaction.groupBy.mockResolvedValue([]);
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

  it('payoutsDue is the absolute value of the negative WITHDRAWAL sum, converted BGN→EUR (WITHDRAWAL amounts stored negative)', async () => {
    // wallet.service.ts stores WITHDRAWAL amount as -payoutAmount (BGN). The
    // dashboard surfaces a positive EUR figure via Math.abs() + bgnToEur()
    // (BC-QA-031 — EUR-only responses).
    m.$queryRaw.mockReset();
    m.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 0n }]);

    // Simulate a total withdrawal sum of -250 BGN (two PENDING withdrawals of 125 each)
    // The cashback tiles and payoutsDue group by currency (impl-r4 F12), so the
    // mock returns the real per-currency array shape Prisma produces.
    m.walletTransaction.groupBy.mockImplementation(({ where, by }: any) => {
      if (Array.isArray(by) && by.includes('cashbackStatus')) return Promise.resolve([]);
      if (where?.type === 'WITHDRAWAL' && where?.status?.in) {
        return Promise.resolve([{ currency: 'BGN', _sum: { amount: -250 }, _count: { _all: 2 } }]);
      }
      return Promise.resolve([]);
    });

    const res = await request(app).get('/admin/dashboard').expect(200);
    expect(res.body.data.finance.payoutsDue).toBe(bgnToEur(250));
  });

  it('transaction volume folds per-currency subtotals — an EUR-native subtotal is NOT re-converted (BC-QA-031)', async () => {
    // Transaction.currency is genuinely mixed (schema default BGN;
    // POST /api/payments/create defaults to EUR; Stripe writes EUR rows), so the
    // volume reads group by currency. A blanket bgnToEur() over one combined
    // `_sum.finalAmount` would divide the already-EUR half a second time.
    //
    // Seed: 19.5583 BGN (→ 10.00 EUR) + 25.00 EUR (unchanged) = 35.00 EUR.
    // A blanket conversion of the raw sum (44.5583) would report 22.78.
    m.transaction.groupBy.mockResolvedValue([
      { currency: 'BGN', _sum: { finalAmount: 19.5583 }, _count: { _all: 1 } },
      { currency: 'EUR', _sum: { finalAmount: 25.0 }, _count: { _all: 1 } },
    ]);
    m.transaction.count.mockResolvedValue(2);

    const res = await request(app).get('/admin/dashboard').expect(200);

    expect(res.body.data.transactions.todayVolume).toBeCloseTo(35.0, 2);
    expect(res.body.data.transactions.totalVolume).toBeCloseTo(35.0, 2);
    // The blanket-conversion value must NOT appear.
    expect(res.body.data.transactions.todayVolume).not.toBeCloseTo(bgnToEur(44.5583), 2);
    // todayAvg is derived from the CONVERTED total, not a DB _avg across mixed units.
    expect(res.body.data.transactions.todayAvg).toBeCloseTo(17.5, 2);
  });

  it('treats a null currency subtotal as BGN, matching the schema column default', async () => {
    m.transaction.groupBy.mockResolvedValue([
      { currency: null, _sum: { finalAmount: 19.5583 }, _count: { _all: 1 } },
    ]);
    m.transaction.count.mockResolvedValue(1);

    const res = await request(app).get('/admin/dashboard').expect(200);
    expect(res.body.data.transactions.todayVolume).toBeCloseTo(10.0, 2);
  });

  it('todayAvg is 0 (not NaN/Infinity) when there are no transactions today', async () => {
    m.transaction.count.mockResolvedValue(0); // todayTxCount = 0
    const res = await request(app).get('/admin/dashboard').expect(200);
    expect(res.body.data.transactions.todayAvg).toBe(0);
    expect(Number.isFinite(res.body.data.transactions.todayAvg)).toBe(true);
  });

  /**
   * BC-QA-031-FOLLOWUP-1 impl-r2 — `todayAvg`'s denominator.
   *
   * `foldMixedCurrencyToEur` drops any subtotal it has no conversion rate for
   * (a legacy row written before the accepted domain was narrowed to
   * {BGN, EUR}). `todayAvg` must therefore divide by the fold's `includedCount`
   * and not by `todayTxCount`, or the numerator and denominator describe
   * different sets of rows and the "average" is the mean of nothing.
   *
   * Every other fixture in this file is all-in-domain, where the two
   * denominators are numerically identical and the distinction is invisible —
   * which is exactly why this case uses a DIVERGENT fixture. It exists because
   * a per-site fix-pinning audit found this denominator uncovered: undoing it
   * on its own left the whole suite green.
   */
  it('todayAvg divides by the rows its volume covers, not by the raw row count', async () => {
    // 2 EUR rows totalling 50.00 (included) + 1 USD row of 100.00 (no rate →
    // excluded). `transaction.count` sees all three.
    m.transaction.groupBy.mockResolvedValue([
      { currency: 'EUR', _sum: { finalAmount: 50.0 }, _count: { _all: 2 } },
      { currency: 'USD', _sum: { finalAmount: 100.0 }, _count: { _all: 1 } },
    ]);
    m.transaction.count.mockResolvedValue(3);

    const res = await request(app).get('/admin/dashboard').expect(200);
    const tx = res.body.data.transactions;

    expect(tx.todayVolume).toBeCloseTo(50.0, 2);
    // 25.00 = 50 / 2. Dividing by the raw count of 3 gives 16.67 — the mean of
    // neither the included rows nor of all of them.
    expect(tx.todayAvg).toBeCloseTo(25.0, 2);
    expect(tx.todayAvg).not.toBeCloseTo(50 / 3, 2);

    // The row count stays the true full count — a count of rows is honest
    // whatever currency they are in — and the excluded figures let a client
    // reconstruct the denominator: todayCount - todayExcludedCount === 2.
    expect(tx.todayCount).toBe(3);
    expect(tx.todayExcludedCount).toBe(1);
    expect(tx.todayCount - tx.todayExcludedCount).toBe(2);
    expect(tx.excludedCurrencies).toEqual(['USD']);
  });

  /**
   * impl-r4 F12 — the cashback tiles and payoutsDue were exempted from the
   * aggregate sweep as `internal-threshold` ("never leaves the storage unit"),
   * which was false: every one of them is wrapped in bgnToEur() and rendered.
   * They now group by currency and fold, so a legacy non-BGN row is excluded
   * rather than divided by the peg.
   */
  it('REGRESSION: a cashback tile excludes an out-of-domain subtotal', async () => {
    m.walletTransaction.groupBy.mockImplementation(({ where, by }: any) => {
      if (Array.isArray(by) && by.includes('cashbackStatus')) return Promise.resolve([]);
      if (where?.type === 'CASHBACK_CREDIT') {
        return Promise.resolve([
          { currency: 'BGN', _sum: { amount: 19.5583 }, _count: { _all: 1 } },
          { currency: 'USD', _sum: { amount: 100 }, _count: { _all: 1 } },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await request(app).get('/admin/dashboard').expect(200);
    const cb = res.body.data.cashback;

    // Only the BGN subtotal converts: 19.5583 BGN -> 10.00 EUR.
    expect(cb.accrued).toBeCloseTo(10, 2);
    // The pre-fix figure divided the USD magnitude by the peg too:
    // (19.5583 + 100) / 1.95583 = 61.13.
    expect(cb.accrued).not.toBeCloseTo(61.13, 1);
    expect(cb.excludedCount).toBeGreaterThan(0);
    expect(cb.excludedCurrencies).toEqual(['USD']);
  });

  it('REGRESSION: payoutsDue excludes an out-of-domain withdrawal subtotal', async () => {
    m.walletTransaction.groupBy.mockImplementation(({ where, by }: any) => {
      if (Array.isArray(by) && by.includes('cashbackStatus')) return Promise.resolve([]);
      if (where?.type === 'WITHDRAWAL') {
        return Promise.resolve([
          { currency: 'BGN', _sum: { amount: -250 }, _count: { _all: 1 } },
          { currency: 'USD', _sum: { amount: -70 }, _count: { _all: 1 } },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await request(app).get('/admin/dashboard').expect(200);
    expect(res.body.data.finance.payoutsDue).toBeCloseTo(bgnToEur(250), 2);
    expect(res.body.data.finance.payoutsDue).not.toBeCloseTo(bgnToEur(320), 2);
    expect(res.body.data.finance.payoutsDueExcludedCount).toBe(1);
  });

  it('reports no exclusions and the plain average for an all-in-domain day', async () => {
    m.transaction.groupBy.mockResolvedValue([
      { currency: 'BGN', _sum: { finalAmount: 19.5583 }, _count: { _all: 1 } },
      { currency: 'EUR', _sum: { finalAmount: 25.0 }, _count: { _all: 1 } },
    ]);
    m.transaction.count.mockResolvedValue(2);

    const res = await request(app).get('/admin/dashboard').expect(200);
    const tx = res.body.data.transactions;

    expect(tx.todayExcludedCount).toBe(0);
    expect(tx.totalExcludedCount).toBe(0);
    expect(tx.excludedCurrencies).toEqual([]);
    expect(tx.todayAvg).toBeCloseTo(17.5, 2);
  });

  it('cashback.accrued equals approved + pending (FAILED/REVERSED/PAID excluded from accrued)', async () => {
    // accrued query: status.in=[COMPLETED,TRIAL_PENDING,PENDING,PROCESSING] + cashbackStatus.not=PAID
    // approved query: status=COMPLETED + cashbackStatus.not=PAID (no cashbackExpiresAt)
    // pending query:  status.in=[TRIAL_PENDING,PENDING,PROCESSING] (no cashbackStatus filter needed)
    // expiringSoon:   status=COMPLETED + cashbackStatus.notIn=[PAID,LOCKED] + cashbackExpiresAt set
    //
    // Simulate: approved=100, pending=40, PAID cashback=25 (must not count in accrued/approved)
    m.$queryRaw.mockReset();
    m.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 0n }]);

    m.walletTransaction.groupBy.mockImplementation(({ where, by }: any) => {
      const wrap = (amount: number) => Promise.resolve([{ currency: 'BGN', _sum: { amount }, _count: { _all: 1 } }]);
      if (Array.isArray(by) && by.includes('cashbackStatus')) return Promise.resolve([]);
      if (where?.type === 'CASHBACK_CREDIT') {
        const statuses: string[] = where?.status?.in ?? [];
        // accrued: 4-element in-array + cashbackStatus.not=PAID → 140 (25 PAID excluded)
        if (
          statuses.includes('COMPLETED') &&
          statuses.includes('TRIAL_PENDING') &&
          statuses.includes('PENDING') &&
          statuses.includes('PROCESSING') &&
          statuses.length === 4 &&
          where?.cashbackStatus?.not === 'PAID'
        ) {
          return wrap(140); // 100 approved + 40 pending
        }
        // approved: single COMPLETED + cashbackStatus.not=PAID + no cashbackExpiresAt → 100
        if (
          where?.status === 'COMPLETED' &&
          where?.cashbackStatus?.not === 'PAID' &&
          !where?.cashbackExpiresAt
        ) {
          return wrap(100);
        }
        // pending: 3-element in-array (TRIAL_PENDING, PENDING, PROCESSING) — 40
        if (statuses.includes('TRIAL_PENDING') && !statuses.includes('COMPLETED')) {
          return wrap(40);
        }
      }
      return Promise.resolve([]);
    });

    const res = await request(app).get('/admin/dashboard').expect(200);
    const { accrued, approved, pending } = res.body.data.cashback;
    // PAID cashback (25 BGN) must not be counted. Stored amounts are BGN;
    // the response converts to EUR (BC-QA-031 — EUR-only responses).
    expect(accrued).toBe(bgnToEur(140));
    expect(accrued).toBe(approved + pending);
  });

  it('cashback.accrued and cashback.approved carry cashbackStatus.not=PAID filter (excludes settled payouts)', async () => {
    // Captures the where-clause passed to walletTransaction.aggregate and asserts
    // that both the accrued and approved queries include cashbackStatus: { not: 'PAID' }.
    // The cashback queries are groupBy(['currency']) since impl-r4 F12; the
    // where-clause assertions below are unchanged, only the mocked method moved.
    const capturedWheres: object[] = [];
    m.walletTransaction.groupBy.mockImplementation(({ where }: any) => {
      capturedWheres.push(where);
      return Promise.resolve([]);
    });

    await request(app).get('/admin/dashboard').expect(200);

    const cashbackWheres = capturedWheres.filter(
      (w: any) => w?.type === 'CASHBACK_CREDIT',
    );

    // accrued — has status.in (4 elements) + cashbackStatus.not='PAID'
    const accruedWhere = cashbackWheres.find(
      (w: any) => Array.isArray(w?.status?.in) && w.status.in.length === 4,
    ) as any;
    expect(accruedWhere).toBeDefined();
    expect(accruedWhere.cashbackStatus).toEqual({ not: 'PAID' });

    // approved — has status='COMPLETED' (string) + cashbackStatus.not='PAID' + no cashbackExpiresAt
    const approvedWhere = cashbackWheres.find(
      (w: any) =>
        w?.status === 'COMPLETED' &&
        w?.cashbackStatus?.not === 'PAID' &&
        !w?.cashbackExpiresAt,
    ) as any;
    expect(approvedWhere).toBeDefined();
    expect(approvedWhere.cashbackStatus).toEqual({ not: 'PAID' });
  });

  it('cashback.expiringSoon carries cashbackStatus.notIn=[PAID,LOCKED] filter (excludes settled and in-flight payouts)', async () => {
    // markPaid() leaves cashbackExpiresAt intact, so without this guard PAID entries
    // with a future expiry would inflate the "expiring soon" figure. LOCKED entries
    // (in-flight payout) should also be excluded — they are being processed, not
    // at risk of expiry.
    // The cashback queries are groupBy(['currency']) since impl-r4 F12; the
    // where-clause assertions below are unchanged, only the mocked method moved.
    const capturedWheres: object[] = [];
    m.walletTransaction.groupBy.mockImplementation(({ where }: any) => {
      capturedWheres.push(where);
      return Promise.resolve([]);
    });

    await request(app).get('/admin/dashboard').expect(200);

    const expiringSoonWhere = capturedWheres.find(
      (w: any) =>
        w?.type === 'CASHBACK_CREDIT' &&
        w?.status === 'COMPLETED' &&
        w?.cashbackExpiresAt?.gte !== undefined &&
        w?.cashbackExpiresAt?.lte !== undefined,
    ) as any;

    expect(expiringSoonWhere).toBeDefined();
    // Must exclude both PAID (settled) and LOCKED (in-flight payout)
    expect(expiringSoonWhere.cashbackStatus?.notIn).toEqual(
      expect.arrayContaining(['PAID', 'LOCKED']),
    );
    expect(expiringSoonWhere.cashbackStatus.notIn).toHaveLength(2);
  });

  it('partners.locations counts only venueStatus=ACTIVE venues (spec §3.1 "активни локации")', async () => {
    // Without this filter, SUSPENDED and REPLACED venues under active partners
    // are counted as "active locations", over-reporting the operational footprint.
    //
    // venue.count shares the `cnt` mock with partner.count, user.count, etc., so
    // we capture all count `where` objects and find the one that targets venues
    // (identified by the presence of `partner.status` + `venueStatus`).
    const allCountWheres: object[] = [];
    m.venue.count.mockImplementation(({ where }) => {
      allCountWheres.push(where);
      return Promise.resolve(0);
    });

    await request(app).get('/admin/dashboard').expect(200);

    // Locate the venue.count call — it's the only where clause that contains
    // both `partner.status` and `venueStatus`.
    const venueWhere = allCountWheres.find(
      (w: any) => w?.partner?.status !== undefined && w?.venueStatus !== undefined,
    ) as any;

    expect(venueWhere).toBeDefined();
    expect(venueWhere.partner.status).toBe('ACTIVE');
    expect(venueWhere.venueStatus).toBe('ACTIVE');
  });
});
