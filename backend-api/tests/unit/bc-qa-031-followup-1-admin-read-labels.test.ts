/**
 * BC-QA-031-FOLLOWUP-1 — the admin read paths no longer fabricate a EUR label.
 *
 * The task's failure scenario named three surfaces that took a
 * `Transaction.currency` row, converted only the BGN case, and then asserted
 * `currency: 'EUR'`:
 *
 *   - `adminTransactions.routes.ts` — the admin business grid (a 100.00 USD
 *     row showed as EUR 100.00 against a true value near EUR 92);
 *   - `adminSubscriptions.routes.ts` — per-subscriber payment rows, plus the
 *     lifetime `paymentSummary.totalAmount` that folded the same unconverted
 *     magnitude into a EUR total;
 *   - `subscriptions.routes.ts` — covered end-to-end against a live database in
 *     `tests/integration/bc-qa-031-followup-1-legacy-row-labels.test.ts`.
 *
 * The write domain is now {BGN, EUR}, so these rows can only be LEGACY ones
 * written before the narrowing. They must surface under their own currency
 * code, and must not be folded into a EUR aggregate.
 */

const transactionFindManyMock = jest.fn();
const transactionCountMock = jest.fn();
const transactionGroupByMock = jest.fn();
const receiptAggregateMock = jest.fn();
const walletTransactionFindManyMock = jest.fn();
const subscriptionFindManyMock = jest.fn();
const subscriptionGroupByMock = jest.fn();
const subscriptionCountMock = jest.fn();
const userFindUniqueMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    transaction: {
      findMany: transactionFindManyMock,
      count: transactionCountMock,
      groupBy: transactionGroupByMock,
    },
    subscription: {
      findMany: subscriptionFindManyMock,
      groupBy: subscriptionGroupByMock,
      count: subscriptionCountMock,
    },
    user: { findUnique: userFindUniqueMock },
    receipt: { aggregate: receiptAggregateMock },
    walletTransaction: { findMany: walletTransactionFindManyMock },
    wallet: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'admin-1',
      role: 'ADMIN',
      permissions: ['transactions.read', 'subscriptions.read'],
    };
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
jest.mock('../../src/services/stripe.service', () => ({ stripeService: {} }));
jest.mock('../../src/services/notification.service', () => ({ notificationService: {} }));
jest.mock('../../src/services/email.service', () => ({ emailService: {} }));

jest.mock('../../src/utils/pagination', () => ({
  parsePagination: jest.fn(() => ({ skip: 0, take: 20, page: 1, limit: 20 })),
}));

import express from 'express';
import request from 'supertest';
import adminTransactionsRouter from '../../src/routes/adminTransactions.routes';
import adminSubscriptionsRouter from '../../src/routes/adminSubscriptions.routes';

const app = express();
app.use(express.json());
app.use('/api/admin/transactions', adminTransactionsRouter);
app.use('/api/admin/subscriptions', adminSubscriptionsRouter);

const LEGACY_CURRENCIES = ['USD', 'GBP', 'PLN', 'CZK', 'RON'];

/** Minimal Transaction row shaped like the business grid's `select`. */
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

describe('GET /api/admin/transactions/business — legacy rows keep their own currency', () => {
  it('REGRESSION: a 100.00 USD row is not reported as EUR 100.00', async () => {
    transactionFindManyMock.mockResolvedValue([
      txRow({ id: 'tx-usd', amount: 100, currency: 'USD' }),
    ]);
    transactionCountMock.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const rows: any[] = res.body.data ?? res.body.transactions ?? res.body;
    const row = rows.find((r: any) => r.id === 'tx-usd');

    expect(row.currency).toBe('USD');
    expect(row.currency).not.toBe('EUR');
    expect(row.amount).toBe(100);
  });

  it('keeps every out-of-domain code, not just USD', async () => {
    transactionFindManyMock.mockResolvedValue(
      LEGACY_CURRENCIES.map((c) => txRow({ id: `tx-${c}`, amount: 100, currency: c })),
    );
    transactionCountMock.mockResolvedValue(LEGACY_CURRENCIES.length);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const rows: any[] = res.body.data ?? res.body.transactions ?? res.body;

    for (const currency of LEGACY_CURRENCIES) {
      const row = rows.find((r: any) => r.id === `tx-${currency}`);
      expect(row.currency).toBe(currency);
    }
  });

  it('still labels in-domain rows EUR — a BGN row converts, a EUR row passes through', async () => {
    transactionFindManyMock.mockResolvedValue([
      txRow({ id: 'tx-bgn', amount: 19.5583, currency: 'BGN' }),
      txRow({ id: 'tx-eur', amount: 25, currency: 'EUR' }),
    ]);
    transactionCountMock.mockResolvedValue(2);

    const res = await request(app).get('/api/admin/transactions/business').expect(200);
    const rows: any[] = res.body.data ?? res.body.transactions ?? res.body;
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));

    expect(byId['tx-bgn'].currency).toBe('EUR');
    expect(byId['tx-bgn'].amount).toBeCloseTo(10, 2);
    expect(byId['tx-eur'].currency).toBe('EUR');
    expect(byId['tx-eur'].amount).toBe(25);
  });
});

describe('GET /api/admin/transactions/business/stats — totals exclude what they cannot convert', () => {
  it('does not fold an unconverted USD subtotal into the EUR volume total', async () => {
    // groupBy(['currency']) shape used by the stats route.
    transactionGroupByMock.mockResolvedValue([
      { currency: 'EUR', _sum: { amount: 25, cashbackAmount: null, marginAmount: null }, _count: { _all: 1 } },
      { currency: 'USD', _sum: { amount: 100, cashbackAmount: null, marginAmount: null }, _count: { _all: 1 } },
    ]);
    transactionCountMock.mockResolvedValue(2);

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);
    const body = res.body.data ?? res.body;
    const total = body.totalVolume ?? body.totalAmount ?? body.volume;

    // Pre-fix this was 125 — a "EUR" figure containing 100 USD at face value.
    expect(total).toBe(25);
    expect(total).not.toBe(125);
  });

  // impl-r1 F4: the total excludes what it cannot convert, so every figure
  // rendered beside it — the row count, and the average derived by dividing by
  // that count — has to describe the same set of rows, or the card contradicts
  // itself and `averageValue` is a number that means nothing.
  it('counts only the rows its total covers, and the average agrees with both', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'EUR', _sum: { amount: 50, cashbackAmount: null, marginAmount: null }, _count: { _all: 2 } },
      { currency: 'USD', _sum: { amount: 100, cashbackAmount: null, marginAmount: null }, _count: { _all: 1 } },
    ]);
    transactionCountMock.mockResolvedValue(3);

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);
    const body = res.body.data ?? res.body;

    expect(body.totalVolume).toBe(50);
    // 2, not 3: the USD row is not represented in totalVolume.
    expect(body.count).toBe(2);
    // 25.00 = 50 / 2. Dividing by the full count of 3 gave 16.67 — the mean of
    // neither the included rows nor of all of them.
    expect(body.averageValue).toBe(25);
    expect(body.averageValue).not.toBeCloseTo(50 / 3, 2);
    // total === average × count is the self-consistency the fix restores.
    expect(body.averageValue * body.count).toBeCloseTo(body.totalVolume, 2);
  });

  it('reports what it excluded so a client can say the picture is partial', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'EUR', _sum: { amount: 50, cashbackAmount: null, marginAmount: null }, _count: { _all: 2 } },
      { currency: 'USD', _sum: { amount: 100, cashbackAmount: null, marginAmount: null }, _count: { _all: 1 } },
      { currency: 'GBP', _sum: { amount: 10, cashbackAmount: null, marginAmount: null }, _count: { _all: 3 } },
    ]);
    transactionCountMock.mockResolvedValue(6);

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);
    const body = res.body.data ?? res.body;

    expect(body.excludedCount).toBe(4);
    expect(body.excludedCurrencies).toEqual(['GBP', 'USD']);
  });

  it('reports zero exclusions for an all-in-domain database', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'BGN', _sum: { amount: 19.5583, cashbackAmount: null, marginAmount: null }, _count: { _all: 1 } },
      { currency: 'EUR', _sum: { amount: 25, cashbackAmount: null, marginAmount: null }, _count: { _all: 1 } },
    ]);
    transactionCountMock.mockResolvedValue(2);

    const res = await request(app).get('/api/admin/transactions/business/stats').expect(200);
    const body = res.body.data ?? res.body;

    expect(body.count).toBe(2);
    expect(body.excludedCount).toBe(0);
    expect(body.excludedCurrencies).toEqual([]);
    expect(body.totalVolume).toBeCloseTo(35, 2);
  });
});

/**
 * BC-QA-031-FOLLOWUP-1 impl-r2 F7 — the LIST grid's `paymentCount`.
 *
 * `enrichSubscriptions` is the fourth site of the F4 shape and the one the
 * round-2 reviewer found unpinned: reverting `paymentCount` to a raw sum of the
 * per-currency `_count._all` values left every existing assertion green,
 * because the only fixtures touching that field
 * (`adminSubscriptionsCurrency.test.ts:162,184`) are entirely in-domain — so
 * `includedCount` and the raw sum are numerically identical and the fix is
 * invisible.
 *
 * These cases use a DIVERGENT fixture (one EUR subtotal, one USD subtotal) so
 * the two numbers cannot coincide. Without that divergence a future edit could
 * silently restore the "N payments, EUR 0.00" self-contradiction on the grid —
 * the exact shape F4 was raised about, and the shape the sibling
 * `/user/:userId/history` endpoint is already pinned against.
 */
describe('GET /api/admin/subscriptions (list) — paymentCount counts only what the total covers', () => {
  const LIST_SUB = {
    id: 'sub-1',
    plan: 'BASIC',
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    cancelAt: null,
    canceledAt: null,
    autoRenewal: true,
    stripeSubscriptionId: null,
    payseraOrderId: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    failedPaymentAt: null,
    failedPaymentClearedAt: null,
    user: {
      id: 'u1',
      email: 'sub@test.local',
      firstName: 'A',
      lastName: 'B',
      phone: null,
      status: 'ACTIVE',
    },
  };

  beforeEach(() => {
    subscriptionFindManyMock.mockResolvedValue([LIST_SUB]);
    subscriptionGroupByMock.mockResolvedValue([{ userId: 'u1', _count: { _all: 1 } }]);
    subscriptionCountMock.mockResolvedValue(1);
    transactionFindManyMock.mockResolvedValue([]);
  });

  it('REGRESSION: counts only the rows behind the total when a USD row is excluded', async () => {
    // The per-(userId, currency) aggregate shape the route groups by.
    transactionGroupByMock.mockResolvedValue([
      {
        userId: 'u1',
        currency: 'EUR',
        _count: { _all: 2 },
        _sum: { amount: 25 },
        _max: { createdAt: new Date('2026-08-05T00:00:00.000Z') },
      },
      {
        userId: 'u1',
        currency: 'USD',
        _count: { _all: 3 },
        _sum: { amount: 100 },
        _max: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions').expect(200);
    const row = res.body.subscriptions[0];

    // The USD subtotal has no rate, so it is not in the total…
    expect(row.paymentTotalAmount).toBe(25);
    // …and must therefore not be in the count either. The raw sum is 5.
    expect(row.paymentCount).toBe(2);
    expect(row.paymentCount).not.toBe(5);
    // total / count stays a meaningful per-payment figure: 12.50, not 5.00.
    expect(row.paymentTotalAmount / row.paymentCount).toBeCloseTo(12.5, 2);

    // And the grid can say WHY the two disagree with the raw row count.
    expect(row.paymentExcludedCount).toBe(3);
    expect(row.paymentExcludedCurrencies).toEqual(['USD']);
  });

  it('REGRESSION: a subscriber whose ONLY payment is out-of-domain reports 0 payments, not 1', async () => {
    transactionGroupByMock.mockResolvedValue([
      {
        userId: 'u1',
        currency: 'USD',
        _count: { _all: 1 },
        _sum: { amount: 100 },
        _max: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions').expect(200);
    const row = res.body.subscriptions[0];

    // "1 payment, EUR 0.00" is indistinguishable from a genuinely zero-value
    // payment. "0 payments, 1 excluded (USD)" is not.
    expect(row.paymentTotalAmount).toBe(0);
    expect(row.paymentCount).toBe(0);
    expect(row.paymentCount).not.toBe(1);
    expect(row.paymentExcludedCount).toBe(1);
    expect(row.paymentExcludedCurrencies).toEqual(['USD']);
  });

  it('still reports the full count and reports no exclusions for an all-in-domain subscriber', async () => {
    transactionGroupByMock.mockResolvedValue([
      {
        userId: 'u1',
        currency: 'BGN',
        _count: { _all: 3 },
        _sum: { amount: 19.5583 },
        _max: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      },
      {
        userId: 'u1',
        currency: 'EUR',
        _count: { _all: 2 },
        _sum: { amount: 25 },
        _max: { createdAt: new Date('2026-08-05T00:00:00.000Z') },
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions').expect(200);
    const row = res.body.subscriptions[0];

    expect(row.paymentCount).toBe(5);
    expect(row.paymentTotalAmount).toBeCloseTo(35, 2);
    expect(row.paymentExcludedCount).toBe(0);
    expect(row.paymentExcludedCurrencies).toEqual([]);
    // lastPaymentAt still takes the latest across currency groups.
    expect(new Date(row.lastPaymentAt).toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });
});

describe('GET /api/admin/subscriptions/user/:userId/history — per-payment labels and totals', () => {
  beforeEach(() => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1',
      email: 'sub@test.local',
      firstName: 'A',
      lastName: 'B',
      phone: null,
      status: 'ACTIVE',
    });
    // One subscription so the per-payment array is actually reachable in the
    // response (payments are exposed under `subscriptions[].payments`).
    subscriptionFindManyMock.mockResolvedValue([
      {
        id: 'sub-1',
        plan: 'BASIC',
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        autoRenewal: true,
        stripeSubscriptionId: null,
        payseraOrderId: null,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        failedPaymentAt: null,
        failedPaymentClearedAt: null,
      },
    ]);
  });

  it('REGRESSION: a 100.00 USD payment row is not relabelled EUR', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'USD', _sum: { amount: 100 }, _count: { _all: 1 }, _max: { createdAt: new Date('2026-08-01') } },
    ]);
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'pay-usd',
        subscriptionId: 'sub-1',
        amount: 100,
        currency: 'USD',
        createdAt: new Date('2026-08-01'),
        completedAt: new Date('2026-08-01'),
        paymentMethod: 'CARD',
        stripePaymentId: null,
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions/user/u1/history').expect(200);
    const body = res.body;

    const payments: any[] = body.subscriptions[0].payments;
    const usdRow = payments.find((p: any) => p.id === 'pay-usd');
    expect(usdRow).toBeDefined();
    expect(usdRow.currency).toBe('USD');
    expect(usdRow.currency).not.toBe('EUR');
    expect(usdRow.amount).toBe(100);

    // The lifetime total must not contain the unconverted USD magnitude.
    expect(body.paymentSummary.totalAmount).toBe(0);
    expect(body.paymentSummary.totalAmount).not.toBe(100);

    // impl-r1 F4 — and the COUNT beside that total must not claim to cover the
    // payment the total could not represent. An earlier revision of this file
    // asserted `count: 1, totalAmount: 0` as correct; that pairing is exactly
    // the self-contradiction ("1 payment, EUR 0.00") an admin cannot tell apart
    // from a genuinely zero-value payment.
    expect(body.paymentSummary.count).toBe(0);
    expect(body.paymentSummary.excludedCount).toBe(1);
    expect(body.paymentSummary.excludedCurrencies).toEqual(['USD']);
  });

  it('keeps count and total describing the same rows when only some are excluded', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'EUR', _sum: { amount: 25 }, _count: { _all: 2 }, _max: { createdAt: new Date('2026-08-02') } },
      { currency: 'USD', _sum: { amount: 100 }, _count: { _all: 1 }, _max: { createdAt: new Date('2026-08-01') } },
    ]);
    transactionFindManyMock.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/subscriptions/user/u1/history').expect(200);

    expect(res.body.paymentSummary.totalAmount).toBe(25);
    expect(res.body.paymentSummary.count).toBe(2);
    expect(res.body.paymentSummary.excludedCount).toBe(1);
    expect(res.body.paymentSummary.excludedCurrencies).toEqual(['USD']);
  });

  it('still converts a BGN subtotal and passes a EUR one through', async () => {
    transactionGroupByMock.mockResolvedValue([
      { currency: 'BGN', _sum: { amount: 19.5583 }, _count: { _all: 1 }, _max: { createdAt: new Date('2026-08-01') } },
      { currency: 'EUR', _sum: { amount: 25 }, _count: { _all: 1 }, _max: { createdAt: new Date('2026-08-02') } },
    ]);
    transactionFindManyMock.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/subscriptions/user/u1/history').expect(200);

    expect(res.body.paymentSummary.totalAmount).toBeCloseTo(35, 2);
  });
});
