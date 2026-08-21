/**
 * BC-QA-031-FOLLOWUP-1 task-r1 F1 (admin surfaces) + F2 (HTTP status).
 *
 * These mount the real routers with the permission middleware mocked. That is
 * deliberate and load-bearing: an earlier draft used `createTestUser({role:
 * 'ADMIN'})` against the live app and every admin case came back 403 "Not
 * authorized" — the assertions never ran and the file passed vacuously. The
 * mocked-permission form is the repo's existing convention for admin route
 * tests (`adminTransactionsBusinessCurrency`, `adminSubscriptionsCurrency`) and
 * it actually executes the handler.
 *
 * F1 — `GET /api/admin/transactions/stats` returned `totalVolume: 156.02` while
 * the sibling `GET /api/admin/transactions` grid displayed those same rows as
 * `50 USD / 40 EUR / 10 EUR / 100 EUR`; `GET /api/admin/payouts` returned
 * `summary.completedTotal: 66.47` in the same response body whose rows read
 * `-70 USD` and `-30.68 EUR`. Both flat-summed a mixed column and divided the
 * result by the BGN peg.
 *
 * F2 — `UnsupportedCurrencyError` promised 400 in its docblock and produced 500
 * plus a server stack trace, because it extended plain `Error` while
 * `errorHandler` reads `statusCode` only from its `AppError` branch.
 */

const walletTransactionGroupByMock = jest.fn();
const walletTransactionAggregateMock = jest.fn();
const walletTransactionCountMock = jest.fn();
const walletTransactionFindManyMock = jest.fn();
const walletFindUniqueMock = jest.fn();
const transactionGroupByMock = jest.fn();
const transactionCountMock = jest.fn();
const receiptAggregateMock = jest.fn();
const prismaTransactionMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    walletTransaction: {
      groupBy: walletTransactionGroupByMock,
      aggregate: walletTransactionAggregateMock,
      count: walletTransactionCountMock,
      findMany: walletTransactionFindManyMock,
    },
    wallet: { findUnique: walletFindUniqueMock },
    transaction: { groupBy: transactionGroupByMock, findMany: jest.fn(), count: transactionCountMock },
    receipt: { aggregate: receiptAggregateMock },
    $transaction: prismaTransactionMock,
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['transactions.read', 'transactions.write', 'finance.payouts.read'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(),
}));

jest.mock('../../src/services/adminCashback.service', () => ({
  deriveCashbackEntryStatus: jest.fn(() => null),
}));
jest.mock('../../src/services/notification.service', () => ({ notificationService: {} }));
jest.mock('../../src/services/email.service', () => ({ emailService: {} }));
jest.mock('../../src/services/wallet.service', () => ({ walletService: {} }));
jest.mock('../../src/services/payoutEligibility.service', () => ({ resolvePayoutEligibility: jest.fn() }));
jest.mock('../../src/utils/pagination', () => ({
  parsePagination: jest.fn(() => ({ skip: 0, take: 20, page: 1, limit: 20 })),
}));

import express from 'express';
import request from 'supertest';
import adminTransactionsRouter from '../../src/routes/adminTransactions.routes';
import adminPayoutsRouter from '../../src/routes/adminPayouts.routes';
import { errorHandler, AppError } from '../../src/middleware/error.middleware';
import { bgnToEur, UnsupportedCurrencyError } from '../../src/utils/currency';

const app = express();
app.use(express.json());
app.use('/api/admin/transactions', adminTransactionsRouter);
app.use(errorHandler);

const payoutsApp = express();
payoutsApp.use(express.json());
payoutsApp.use('/api/admin/payouts', adminPayoutsRouter);
payoutsApp.use(errorHandler);

beforeEach(() => {
  jest.clearAllMocks();
  walletTransactionCountMock.mockResolvedValue(0);
  walletTransactionFindManyMock.mockResolvedValue([]);
});

describe('GET /api/admin/transactions/stats — totals agree with the grid beside them (task-r1 F1)', () => {
  /** The reviewer's live fixture, as groupBy(['currency']) returns it. */
  const MIXED = [
    { currency: 'BGN', _sum: { amount: 195.58 }, _count: { _all: 1 } },
    { currency: 'BGN', _sum: { amount: 19.56 }, _count: { _all: 1 } },
    { currency: 'USD', _sum: { amount: 50 }, _count: { _all: 1 } },
    { currency: 'EUR', _sum: { amount: 40 }, _count: { _all: 1 } },
  ];

  it('REGRESSION: totalVolume excludes the USD row instead of dividing it by the BGN peg', async () => {
    walletTransactionGroupByMock.mockResolvedValue(MIXED);

    const res = await request(app).get('/api/admin/transactions/stats').expect(200);
    const body = res.body.data ?? res.body;

    const expected = bgnToEur(195.58) + bgnToEur(19.56) + 40;
    expect(body.totalVolume).toBeCloseTo(expected, 1);
    // (195.58 + 19.56 + 50 + 40) / 1.95583 = 156.02 — the pre-fix figure.
    expect(body.totalVolume).not.toBeCloseTo(156.02, 1);
  });

  it('reports what it could not account for', async () => {
    walletTransactionGroupByMock.mockResolvedValue(MIXED);

    const res = await request(app).get('/api/admin/transactions/stats').expect(200);
    const body = res.body.data ?? res.body;

    expect(body.excludedCount).toBe(1);
    expect(body.excludedCurrencies).toEqual(['USD']);
  });

  it('is unchanged for an all-BGN database — the fold equals the old flat conversion', async () => {
    walletTransactionGroupByMock.mockResolvedValue([
      { currency: 'BGN', _sum: { amount: 195.58 }, _count: { _all: 1 } },
      { currency: 'BGN', _sum: { amount: 19.56 }, _count: { _all: 1 } },
    ]);

    const res = await request(app).get('/api/admin/transactions/stats').expect(200);
    const body = res.body.data ?? res.body;

    expect(body.totalVolume).toBeCloseTo(bgnToEur(195.58) + bgnToEur(19.56), 1);
    expect(body.excludedCount).toBe(0);
    expect(body.excludedCurrencies).toEqual([]);
  });
});

describe('GET /api/admin/transactions/stats — the cashback total reports its exclusions too', () => {
  it('folds Transaction.cashbackAmount per currency rather than silently dropping', async () => {
    // /business/stats groups Transaction rows by currency; the cashback total
    // used `sumMixedCurrencyToEur`, which drops without reporting (task-r1 F1).
    transactionGroupByMock.mockResolvedValue([
      { currency: 'EUR', _sum: { amount: 25, cashbackAmount: 5 }, _count: { _all: 1 } },
      { currency: 'USD', _sum: { amount: 100, cashbackAmount: 50 }, _count: { _all: 1 } },
    ]);
    transactionCountMock.mockResolvedValue(2);
    receiptAggregateMock.mockResolvedValue({ _sum: { cashbackAmount: null } });

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);
    const body = res.body.data ?? res.body;

    expect(body.totalCashback).toBeCloseTo(5, 2);
    // The USD cashback subtotal is excluded — and now SAID so.
    expect(body.excludedCurrencies).toEqual(['USD']);
  });
});

describe('GET /api/admin/payouts — the summary agrees with the rows in its own body (task-r1 F1)', () => {
  it('REGRESSION: completedTotal excludes the USD withdrawal instead of dividing it by the peg', async () => {
    // The reviewer's live fixture: rows -70 USD and -60 BGN.
    walletTransactionFindManyMock.mockResolvedValue([]);
    walletTransactionCountMock.mockResolvedValue(2);
    walletTransactionGroupByMock.mockImplementation(async (args: any) => {
      const byStatus = Array.isArray(args?.by) && args.by.includes('status');
      const rows = [
        { status: 'COMPLETED', currency: 'USD', _sum: { amount: -70 }, _count: { _all: 1 } },
        { status: 'COMPLETED', currency: 'BGN', _sum: { amount: -60 }, _count: { _all: 1 } },
      ];
      if (byStatus) return rows;
      // The per-status aggregates only ask for COMPLETED etc.
      if (args?.where?.status === 'COMPLETED') return rows.map(({ status, ...r }) => r);
      return [];
    });

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    expect(res.status).toBe(200);
    const summary = res.body.summary;

    // 60 BGN = 30.68 EUR. The 70 USD has no rate.
    expect(summary.completedTotal).toBeCloseTo(bgnToEur(60), 2);
    // (70 + 60) / 1.95583 = 66.47 — the pre-fix figure, measured live.
    expect(summary.completedTotal).not.toBeCloseTo(66.47, 1);
    expect(summary.excludedCount).toBe(1);
    expect(summary.excludedCurrencies).toEqual(['USD']);
  });

  /**
   * impl-r4 F11 — `summary` and `filteredSummary` are rendered by the SAME card
   * (`AdminPayoutsPage` chooses between them with
   * `displaySummary = (search || dateFilter) ? filteredSummary : summary`), so
   * any asymmetry is a number that changes as the admin types. Measured live:
   * `summary.completedCount` 2 beside a total covering 1 row, flipping to 1 the
   * moment a search filter was applied.
   */
  it('REGRESSION: summary and filteredSummary report the SAME count for the same rows', async () => {
    walletTransactionFindManyMock.mockResolvedValue([]);
    walletTransactionCountMock.mockResolvedValue(2);
    walletTransactionGroupByMock.mockImplementation(async (args: any) => {
      const byStatus = Array.isArray(args?.by) && args.by.includes('status');
      const rows = [
        { status: 'COMPLETED', currency: 'USD', _sum: { amount: -70 }, _count: { _all: 1 } },
        { status: 'COMPLETED', currency: 'BGN', _sum: { amount: -60 }, _count: { _all: 1 } },
      ];
      if (byStatus) return rows;
      if (args?.where?.status === 'COMPLETED') return rows.map(({ status, ...r }) => r);
      return [];
    });

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    expect(res.status).toBe(200);

    // The card must show the same number whether or not a filter is active.
    expect(res.body.summary.completedCount).toBe(res.body.filteredSummary.completedCount);
    expect(res.body.summary.completedCount).toBe(1);
    // 2 was the pre-fix value — the raw row count beside a total covering 1 row.
    expect(res.body.summary.completedCount).not.toBe(2);
    // And the count describes the total it sits beside.
    expect(res.body.summary.completedTotal).toBeCloseTo(bgnToEur(60), 2);
  });

  it('reports exclusions PER STATUS, so the relationship is stated not reconstructed', async () => {
    // The shipped comment offered `<status>Count - excludedCount`, which is
    // false when exclusions span statuses: with pending 1 and completed 2
    // excluded 2, completed - excluded = 0 for a total covering 1 row.
    walletTransactionFindManyMock.mockResolvedValue([]);
    walletTransactionCountMock.mockResolvedValue(4);
    walletTransactionGroupByMock.mockImplementation(async (args: any) => {
      const byStatus = Array.isArray(args?.by) && args.by.includes('status');
      const rows = [
        { status: 'COMPLETED', currency: 'USD', _sum: { amount: -70 }, _count: { _all: 1 } },
        { status: 'COMPLETED', currency: 'BGN', _sum: { amount: -60 }, _count: { _all: 1 } },
        { status: 'PENDING', currency: 'USD', _sum: { amount: -25 }, _count: { _all: 1 } },
      ];
      if (byStatus) return rows;
      if (args?.where?.status === 'COMPLETED') {
        return rows.filter(r => r.status === 'COMPLETED').map(({ status, ...r }) => r);
      }
      if (args?.where?.status === 'PENDING') {
        return rows.filter(r => r.status === 'PENDING').map(({ status, ...r }) => r);
      }
      return [];
    });

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    expect(res.status).toBe(200);
    const sm = res.body.summary;

    expect(sm.completedExcludedCount).toBe(1);
    expect(sm.pendingExcludedCount).toBe(1);
    expect(sm.excludedCount).toBe(2);
    // The false recipe would have produced 2 - 2 = 0 here.
    expect(sm.completedCount).toBe(1);
    expect(sm.completedCount - sm.completedExcludedCount).toBe(0);
    // filteredSummary carries the same per-status fields.
    expect(res.body.filteredSummary.completedExcludedCount).toBe(1);
    expect(res.body.filteredSummary.pendingExcludedCount).toBe(1);
  });

  it('filteredSummary keeps its counts and totals describing the same rows', async () => {
    walletTransactionFindManyMock.mockResolvedValue([]);
    walletTransactionCountMock.mockResolvedValue(2);
    walletTransactionGroupByMock.mockImplementation(async (args: any) => {
      const byStatus = Array.isArray(args?.by) && args.by.includes('status');
      if (!byStatus) return [];
      return [
        { status: 'COMPLETED', currency: 'USD', _sum: { amount: -70 }, _count: { _all: 1 } },
        { status: 'COMPLETED', currency: 'BGN', _sum: { amount: -60 }, _count: { _all: 1 } },
      ];
    });

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    expect(res.status).toBe(200);
    const f = res.body.filteredSummary;

    expect(f.completedTotal).toBeCloseTo(bgnToEur(60), 2);
    // 1, not 2: the count must not claim to cover the row the total dropped.
    expect(f.completedCount).toBe(1);
    expect(f.excludedCount).toBe(1);
    expect(f.excludedCurrencies).toEqual(['USD']);
  });
});

/**
 * task-r2 F1 — the payouts LIST endpoint specifically.
 *
 * `toEurPayout` converts the nested wallet balances keyed on
 * `payout.wallet.currency`. Every single-row handler fetches the wallet with
 * `include: { wallet: true }` and was correct; the LIST handler hand-picks
 * columns with a `select` and omitted `currency`, so `walletCurrency` was
 * permanently `undefined`, `toEur` fell through to `bgnToEur`, and the
 * conditional-spread label never fired. Measured live: an 80.00 GBP wallet
 * balance served as `40.9` with no `currency` field beside it.
 *
 * The other call sites' passing tests are exactly what hid this, so this case
 * drives the LIST route and asserts BOTH the amount and the label.
 */
describe('GET /api/admin/payouts — the list handler selects wallet.currency (task-r2 F1)', () => {
  function payoutRow(walletCurrency: string | undefined, availableBalance: number) {
    return {
      id: 'wt-1',
      type: 'WITHDRAWAL',
      amount: -25,
      balanceBefore: 80,
      balanceAfter: 55,
      currency: 'BGN',
      status: 'PENDING',
      description: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      metadata: null,
      wallet: {
        id: 'w-1',
        availableBalance,
        pendingBalance: 0,
        ...(walletCurrency !== undefined && { currency: walletCurrency }),
        payoutIban: null,
        payoutBeneficiaryName: null,
        user: { id: 'u-1', firstName: 'A', lastName: 'B', email: 'a@b.c', phone: null, subscriptions: [] },
      },
    };
  }

  beforeEach(() => {
    walletTransactionCountMock.mockResolvedValue(1);
    walletTransactionGroupByMock.mockResolvedValue([]);
  });

  it('REGRESSION: an 80.00 GBP wallet balance keeps its magnitude and its label', async () => {
    walletTransactionFindManyMock.mockResolvedValue([payoutRow('GBP', 80)]);

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    expect(res.status).toBe(200);
    const wallet = res.body.payouts[0].wallet;

    // GBP has no conversion rate, so the magnitude passes through untouched…
    expect(wallet.availableBalance).toBe(80);
    // …and 40.9 (= bgnToEur(80)) is what the missing select column produced.
    expect(wallet.availableBalance).not.toBeCloseTo(bgnToEur(80), 2);
    // …under its own code, never a fabricated EUR.
    expect(wallet.currency).toBe('GBP');
  });

  it('proves the defect was the ABSENT column, not the conversion', async () => {
    // Same route, same fold — but with `currency` missing from the row, exactly
    // as the old `select` produced. This is the shape the fix eliminates.
    walletTransactionFindManyMock.mockResolvedValue([payoutRow(undefined, 80)]);

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    const wallet = res.body.payouts[0].wallet;

    expect(wallet.availableBalance).toBeCloseTo(bgnToEur(80), 2);
    expect(wallet).not.toHaveProperty('currency');
  });

  it('REGRESSION: the query ASKS for wallet.currency — the defect was the select, not the mapping', async () => {
    // The two cases above feed `toEurPayout` a row that already contains
    // `wallet.currency`, so they pass whether or not the route asked the
    // database for it. That is precisely how this defect survived: every other
    // call site's test supplied the column. The only assertion that observes
    // the actual bug is one on the QUERY.
    walletTransactionFindManyMock.mockResolvedValue([payoutRow('GBP', 80)]);

    await request(payoutsApp).get('/api/admin/payouts?limit=5');

    const args = walletTransactionFindManyMock.mock.calls[0][0];
    expect(args.select.wallet.select.currency).toBe(true);
  });

  it('still converts and labels a BGN wallet balance', async () => {
    walletTransactionFindManyMock.mockResolvedValue([payoutRow('BGN', 195.583)]);

    const res = await request(payoutsApp).get('/api/admin/payouts?limit=5');
    const wallet = res.body.payouts[0].wallet;

    expect(wallet.availableBalance).toBeCloseTo(100, 1);
    expect(wallet.currency).toBe('EUR');
  });
});

describe('POST /api/admin/transactions/adjust — the write guard surfaces as 400 (task-r1 F2)', () => {
  it('REGRESSION: renders 400, not 500 with a server stack trace', async () => {
    walletFindUniqueMock.mockResolvedValue({
      id: 'w1',
      balance: 100,
      availableBalance: 100,
      currency: 'USD', // a legacy wallet row predating the narrowing
    });
    // The interactive transaction body is what throws, exactly as the Prisma
    // write guard does when it sees `currency: wallet.currency` = 'USD'.
    prismaTransactionMock.mockImplementation(async () => {
      throw new UnsupportedCurrencyError('USD', 'prisma WalletTransaction.create', ['BGN']);
    });

    const res = await request(app)
      .post('/api/admin/transactions/adjust')
      .send({ userId: 'u1', amount: 5, reason: 'BC-QA-031-FOLLOWUP-1 F2 probe' });

    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
    // errorHandler's `statusCode >= 500` branch attaches the stack to the body.
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('UnsupportedCurrencyError:');
  });

  it('is an AppError, which is the only reason errorHandler reads its status', () => {
    const err = new UnsupportedCurrencyError('USD', 'prisma Wallet.update', ['BGN']);

    // THIS is the assertion that pins task-r1 F2 (task-r2, pinning nuance).
    // The previous version asserted only `err.statusCode === 400`, which stayed
    // GREEN under the revert: the pre-fix class extended plain `Error` and
    // declared `readonly statusCode = 400` as an ordinary field. The status was
    // always *present*; what it was not, was *read* — `errorHandler` takes
    // `statusCode` only from its `err instanceof AppError` branch, so the
    // response was a 500 with a stack. An assertion that cannot fail is worse
    // than no assertion, so it now checks the base class the middleware
    // actually dispatches on.
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('USD');
    expect(err.message).toContain('Supported currencies: BGN.');
  });
});
