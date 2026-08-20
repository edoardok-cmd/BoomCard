/**
 * BC-QA-031 round 4 — GET /api/admin/transactions/business{,/stats} currency.
 *
 * Pins the F3 fix on the two admin business-transaction reads:
 *
 *   - `/business` rows: every money column on a Transaction row is denominated
 *     in that row's own `Transaction.currency`, which is genuinely mixed (schema
 *     default BGN; POST /api/payments/create defaults to EUR; Stripe writes EUR
 *     rows). A blanket `bgnToEur()` halves every already-EUR row. The row's
 *     `currency` is also relabelled 'EUR' so the amounts and the label agree —
 *     previously it passed through raw via `...rest`.
 *
 *   - `/business/stats`: a Prisma `_sum` across a mixed-currency column is wrong
 *     BEFORE any conversion, so the aggregate groups by `currency` and folds the
 *     per-currency subtotals. `averageValue` is recomputed from the converted
 *     total rather than taken from a DB `_avg` across mixed units.
 */

const transactionFindManyMock = jest.fn();
const transactionCountMock = jest.fn();
const transactionGroupByMock = jest.fn();
const receiptAggregateMock = jest.fn();
const walletTransactionFindManyMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    transaction: {
      findMany: transactionFindManyMock,
      count: transactionCountMock,
      groupBy: transactionGroupByMock,
    },
    receipt: { aggregate: receiptAggregateMock },
    walletTransaction: { findMany: walletTransactionFindManyMock },
    wallet: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['transactions.read'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/adminCashback.service', () => ({
  deriveCashbackEntryStatus: jest.fn(() => null),
}));

jest.mock('../../src/utils/pagination', () => ({
  parsePagination: jest.fn(() => ({ skip: 0, take: 20, page: 1, limit: 20 })),
}));

import express from 'express';
import request from 'supertest';
import adminTransactionsRouter from '../../src/routes/adminTransactions.routes';
import { bgnToEur } from '../../src/utils/currency';

const app = express();
app.use(express.json());
app.use('/api/admin/transactions', adminTransactionsRouter);

/** Minimal Transaction row shaped like the route's `select`. */
function txRow(over: Record<string, any> = {}) {
  return {
    id: 'tx-1',
    type: 'PURCHASE',
    status: 'COMPLETED',
    amount: 19.5583,
    marginAmount: null,
    subscriptionId: null,
    discount: null,
    discountAmount: null,
    finalAmount: null,
    cashbackAmount: null,
    netAmount: null,
    currency: 'BGN',
    paymentMethod: 'CARD',
    riskScore: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    user: { id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.c', phone: null, riskScore: null },
    partner: null,
    venue: null,
    receipt: null,
    walletTransaction: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  transactionCountMock.mockResolvedValue(0);
  walletTransactionFindManyMock.mockResolvedValue([]);
  receiptAggregateMock.mockResolvedValue({ _sum: { cashbackAmount: null } });
});

describe('GET /business — per-row currency conversion (BC-QA-031)', () => {
  it('converts a BGN row and leaves an EUR-native row unconverted', async () => {
    transactionFindManyMock.mockResolvedValue([
      txRow({ id: 'tx-bgn', amount: 19.5583, currency: 'BGN' }),
      txRow({ id: 'tx-eur', amount: 25.0, currency: 'EUR' }),
    ]);
    transactionCountMock.mockResolvedValue(2);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const rows: any[] = res.body.data ?? res.body.transactions ?? res.body;
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));

    expect(byId['tx-bgn'].amount).toBeCloseTo(10, 2);
    // 25.00 EUR must survive; a blanket bgnToEur() would report 12.78.
    expect(byId['tx-eur'].amount).toBe(25.0);
    expect(byId['tx-eur'].amount).not.toBeCloseTo(bgnToEur(25), 2);
  });

  it('relabels the row currency to EUR so amounts and label agree', async () => {
    transactionFindManyMock.mockResolvedValue([txRow({ id: 'tx-bgn', currency: 'BGN' })]);
    transactionCountMock.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const rows: any[] = res.body.data ?? res.body.transactions ?? res.body;

    // Before the fix the raw 'BGN' passed through via `...rest`, labelling a
    // converted EUR amount as BGN.
    expect(rows[0].currency).toBe('EUR');
  });

  it('converts the nullable money columns by the same row currency', async () => {
    transactionFindManyMock.mockResolvedValue([
      txRow({
        id: 'tx-eur-full',
        currency: 'EUR',
        amount: 25.0,
        marginAmount: 4.0,
        discountAmount: 2.0,
        finalAmount: 23.0,
        netAmount: 21.0,
        cashbackAmount: 1.5,
      }),
    ]);
    transactionCountMock.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const row = (res.body.data ?? res.body.transactions ?? res.body)[0];

    expect(row.marginAmount).toBe(4.0);
    expect(row.discountAmount).toBe(2.0);
    expect(row.finalAmount).toBe(23.0);
    expect(row.netAmount).toBe(21.0);
    expect(row.cashbackAmount).toBe(1.5);
  });

  it('keeps a genuinely-null money column null rather than converting it to 0', async () => {
    transactionFindManyMock.mockResolvedValue([
      txRow({ id: 'tx-nulls', currency: 'BGN', marginAmount: null, netAmount: null }),
    ]);
    transactionCountMock.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const row = (res.body.data ?? res.body.transactions ?? res.body)[0];

    expect(row.marginAmount).toBeNull();
    expect(row.netAmount).toBeNull();
  });
});

describe('GET /business/stats — mixed-currency aggregate folding (BC-QA-031)', () => {
  it('folds per-currency subtotals instead of converting one combined sum', async () => {
    // 19.5583 BGN → 10.00 EUR, plus 25.00 EUR native = 35.00 EUR over 2 rows.
    // The pre-fix blanket conversion of the raw 44.5583 sum yields 22.78.
    transactionGroupByMock.mockResolvedValue([
      { currency: 'BGN', _sum: { amount: 19.5583, cashbackAmount: null }, _count: { _all: 1 } },
      { currency: 'EUR', _sum: { amount: 25.0, cashbackAmount: null }, _count: { _all: 1 } },
    ]);

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);

    expect(res.body.count).toBe(2);
    expect(res.body.totalVolume).toBeCloseTo(35.0, 2);
    expect(res.body.totalVolume).not.toBeCloseTo(bgnToEur(44.5583), 2);
    // averageValue is derived from the CONVERTED total, not a DB _avg over mixed units.
    expect(res.body.averageValue).toBeCloseTo(17.5, 2);
  });

  it('groups the aggregate by currency (the query shape the fix depends on)', async () => {
    transactionGroupByMock.mockResolvedValue([]);
    await request(app).get('/api/admin/transactions/business/stats').expect(200);

    expect(transactionGroupByMock).toHaveBeenCalled();
    const arg = transactionGroupByMock.mock.calls[0][0];
    expect(arg.by).toContain('currency');
    // _avg is deliberately NOT requested — averaging across mixed units is meaningless.
    expect(arg._avg).toBeUndefined();
  });

  it('returns zeroes (not NaN) when no rows match', async () => {
    transactionGroupByMock.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);

    expect(res.body.count).toBe(0);
    expect(res.body.totalVolume).toBe(0);
    expect(res.body.averageValue).toBe(0);
    expect(Number.isFinite(res.body.averageValue)).toBe(true);
  });

  it('converts the receipt-side cashback fallback as BGN (Receipt has no currency column)', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'EUR', _sum: { amount: 25.0, cashbackAmount: 1.0 }, _count: { _all: 1 } },
    ]);
    receiptAggregateMock.mockResolvedValue({ _sum: { cashbackAmount: 19.5583 } });

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);

    // 1.00 EUR (native, unconverted) + 19.5583 BGN → 10.00 EUR = 11.00 EUR.
    expect(res.body.totalCashback).toBeCloseTo(11.0, 2);
  });
});
