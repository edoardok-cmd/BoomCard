/**
 * BC-QA-031 round 4 — admin subscriptions payment totals / per-payment currency.
 *
 * Pins the F3 fix on the two admin subscription reads that touch the mixed
 * `Transaction.currency` column:
 *
 *   - `GET /` (list): `paymentTotalAmount` per subscriber came from a Prisma
 *     `_sum.amount` grouped by userId ONLY, then converted wholesale. A `_sum`
 *     across a mixed-currency column is wrong BEFORE any conversion can run, so
 *     the groupBy key is now `['userId', 'currency']` and the per-currency
 *     subtotals are converted then folded.
 *
 *   - `GET /user/:userId/history`: `paymentSummary.totalAmount` had the same
 *     defect via a flat `aggregate`, now a `groupBy(['currency'])`; and each
 *     per-subscription payment row is converted by its OWN currency instead of
 *     a blanket `bgnToEur()` that halved every already-EUR row.
 */

const subscriptionFindManyMock = jest.fn();
const subscriptionGroupByMock = jest.fn();
const subscriptionCountMock = jest.fn();
const transactionGroupByMock = jest.fn();
const transactionFindManyMock = jest.fn();
const userFindUniqueMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    subscription: {
      findMany: subscriptionFindManyMock,
      groupBy: subscriptionGroupByMock,
      count: subscriptionCountMock,
    },
    transaction: { groupBy: transactionGroupByMock, findMany: transactionFindManyMock },
    user: { findUnique: userFindUniqueMock },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', permissions: ['subscriptions.read'] };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(),
}));

jest.mock('../../src/services/stripe.service', () => ({ stripeService: {} }));
jest.mock('../../src/services/notification.service', () => ({ notificationService: {} }));
jest.mock('../../src/services/email.service', () => ({ emailService: {} }));

jest.mock('../../src/utils/pagination', () => ({
  parsePagination: jest.fn(() => ({ skip: 0, take: 20, page: 1, limit: 20 })),
}));

import express from 'express';
import request from 'supertest';
import adminSubscriptionsRouter from '../../src/routes/adminSubscriptions.routes';
import { bgnToEur } from '../../src/utils/currency';

const app = express();
app.use(express.json());
app.use('/api/admin/subscriptions', adminSubscriptionsRouter);

const USER = {
  id: 'u1',
  email: 'sub@test.local',
  firstName: 'A',
  lastName: 'B',
  phone: null,
  status: 'ACTIVE',
};

function subRow(over: Record<string, any> = {}) {
  return {
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
    user: USER,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  subscriptionGroupByMock.mockResolvedValue([{ userId: 'u1', _count: { _all: 1 } }]);
  subscriptionCountMock.mockResolvedValue(1);
  transactionFindManyMock.mockResolvedValue([]);
});

describe('GET / (list) — paymentTotalAmount folds per-currency subtotals (BC-QA-031)', () => {
  it('does not re-convert an EUR-native subtotal', async () => {
    subscriptionFindManyMock.mockResolvedValue([subRow()]);
    // Two rows for the same user, one per currency — the shape the new
    // groupBy(['userId','currency']) returns.
    transactionGroupByMock.mockResolvedValue([
      {
        userId: 'u1',
        currency: 'BGN',
        _count: { _all: 1 },
        _sum: { amount: 19.5583 },
        _max: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      },
      {
        userId: 'u1',
        currency: 'EUR',
        _count: { _all: 1 },
        _sum: { amount: 25.0 },
        _max: { createdAt: new Date('2026-08-05T00:00:00.000Z') },
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions').expect(200);
    const row = res.body.subscriptions[0];

    // 10.00 EUR + 25.00 EUR = 35.00 EUR. The pre-fix blanket conversion of the
    // combined 44.5583 sum would have reported 22.78.
    expect(row.paymentTotalAmount).toBeCloseTo(35.0, 2);
    expect(row.paymentTotalAmount).not.toBeCloseTo(bgnToEur(44.5583), 2);
  });

  it('re-folds the split rows back to one entry per user (count adds, lastPaymentAt takes the latest)', async () => {
    subscriptionFindManyMock.mockResolvedValue([subRow()]);
    transactionGroupByMock.mockResolvedValue([
      {
        userId: 'u1',
        currency: 'BGN',
        _count: { _all: 2 },
        _sum: { amount: 19.5583 },
        _max: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      },
      {
        userId: 'u1',
        currency: 'EUR',
        _count: { _all: 3 },
        _sum: { amount: 25.0 },
        _max: { createdAt: new Date('2026-08-05T00:00:00.000Z') },
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions').expect(200);
    const row = res.body.subscriptions[0];

    // Splitting the aggregate by currency must not split the reported count,
    // and the latest payment date must win across the currency groups.
    expect(row.paymentCount).toBe(5);
    expect(new Date(row.lastPaymentAt).toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('groups by currency as well as userId (the query shape the fix depends on)', async () => {
    subscriptionFindManyMock.mockResolvedValue([subRow()]);
    transactionGroupByMock.mockResolvedValue([]);

    await request(app).get('/api/admin/subscriptions').expect(200);

    const arg = transactionGroupByMock.mock.calls[0][0];
    expect(arg.by).toEqual(expect.arrayContaining(['userId', 'currency']));
  });

  it('reports 0 for a user with no payments rather than NaN', async () => {
    subscriptionFindManyMock.mockResolvedValue([subRow()]);
    transactionGroupByMock.mockResolvedValue([]);

    const res = await request(app).get('/api/admin/subscriptions').expect(200);
    const row = res.body.subscriptions[0];

    expect(row.paymentTotalAmount).toBe(0);
    expect(row.paymentCount).toBe(0);
  });
});

describe('GET /user/:userId/history — summary + per-payment currency (BC-QA-031)', () => {
  beforeEach(() => {
    userFindUniqueMock.mockResolvedValue({ ...USER, subscriptions: [] });
    subscriptionFindManyMock.mockResolvedValue([subRow()]);
  });

  it('folds the paymentSummary total per currency instead of converting one sum', async () => {
    transactionGroupByMock.mockResolvedValue([
      {
        currency: 'BGN',
        _count: { _all: 1 },
        _sum: { amount: 19.5583 },
        _max: { createdAt: new Date('2026-08-01T00:00:00.000Z') },
      },
      {
        currency: 'EUR',
        _count: { _all: 1 },
        _sum: { amount: 25.0 },
        _max: { createdAt: new Date('2026-08-05T00:00:00.000Z') },
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions/user/u1/history').expect(200);

    expect(res.body.paymentSummary.totalAmount).toBeCloseTo(35.0, 2);
    expect(res.body.paymentSummary.totalAmount).not.toBeCloseTo(bgnToEur(44.5583), 2);
    expect(res.body.paymentSummary.count).toBe(2);
    expect(new Date(res.body.paymentSummary.lastPaymentAt).toISOString()).toBe(
      '2026-08-05T00:00:00.000Z',
    );
  });

  it('converts each per-subscription payment row by its OWN currency', async () => {
    transactionGroupByMock.mockResolvedValue([]);
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'p-bgn',
        subscriptionId: 'sub-1',
        amount: 19.5583,
        currency: 'BGN',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        completedAt: null,
        paymentMethod: 'CARD',
        stripePaymentId: null,
      },
      {
        id: 'p-eur',
        subscriptionId: 'sub-1',
        amount: 25.0,
        currency: 'EUR',
        createdAt: new Date('2026-08-05T00:00:00.000Z'),
        completedAt: null,
        paymentMethod: 'CARD',
        stripePaymentId: null,
      },
    ]);

    const res = await request(app).get('/api/admin/subscriptions/user/u1/history').expect(200);
    const payments = res.body.subscriptions[0].payments;
    const byId = Object.fromEntries(payments.map((p: any) => [p.id, p]));

    expect(byId['p-bgn'].amount).toBeCloseTo(10, 2);
    // 25.00 EUR must survive; a blanket bgnToEur() would report 12.78.
    expect(byId['p-eur'].amount).toBe(25.0);
    // Both are relabelled EUR regardless of storage currency.
    expect(byId['p-bgn'].currency).toBe('EUR');
    expect(byId['p-eur'].currency).toBe('EUR');
  });
});
