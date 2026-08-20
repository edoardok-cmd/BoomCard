/**
 * BC-QA-031 (Step-4 regression fix) — GET /api/subscriptions/history
 *
 * Pins: BGN-denominated Transaction rows are converted to EUR before returning
 * (the exact CRITICAL money-display bug class this task fixes); EUR-native
 * Transaction rows pass through UNCONVERTED (Transaction.currency is genuinely
 * mixed — POST /api/payments/create defaults to EUR and Stripe writes EUR rows,
 * so a blanket bgnToEur() halves them); and the T9 synthetic entry built from
 * EUR-native plan prices must NOT be re-converted either.
 */

const transactionFindManyMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    transaction: { findMany: transactionFindManyMock },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'USER' };
    next();
  },
}));

const getActiveSubscriptionMock = jest.fn();
jest.mock('../../src/services/subscription.service', () => ({
  subscriptionService: {
    getActiveSubscription: (...args: any[]) => getActiveSubscriptionMock(...args),
  },
}));

jest.mock('../../src/services/stripe.service', () => ({
  stripeService: {},
}));

jest.mock('../../src/services/paysera.service', () => ({
  payseraService: {},
}));

import express from 'express';
import request from 'supertest';
import subscriptionsRouter from '../../src/routes/subscriptions.routes';
import { bgnToEur } from '../../src/utils/currency';

const app = express();
app.use(express.json());
app.use('/api/subscriptions', subscriptionsRouter);

describe('GET /api/subscriptions/history — currency (BC-QA-031)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('converts real Transaction rows (Paysera, BGN-stored) to EUR', async () => {
    getActiveSubscriptionMock.mockResolvedValue({ stripeSubscriptionId: null });
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'tx-1',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        amount: 19.5583, // BGN — should convert to 10 EUR
        currency: 'BGN',
        status: 'COMPLETED',
        description: 'Subscription payment',
        metadata: null,
      },
    ]);

    const res = await request(app).get('/api/subscriptions/history');

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].amount).toBe(bgnToEur(19.5583));
    expect(res.body.history[0].amount).toBeCloseTo(10, 2);
    expect(res.body.history[0].currency).toBe('EUR');
  });

  it('leaves EUR-native Transaction rows unconverted (no second division)', async () => {
    // A wallet top-up created through POST /api/payments/create, whose
    // createPaymentSchema defaults `currency` to 'EUR' — the row is already
    // EUR-denominated. Converting it again would report 25.00 EUR as €12.78.
    getActiveSubscriptionMock.mockResolvedValue({ stripeSubscriptionId: null });
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'tx-eur',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        amount: 25.0,
        currency: 'EUR',
        status: 'COMPLETED',
        description: 'Wallet top-up',
        metadata: null,
      },
    ]);

    const res = await request(app).get('/api/subscriptions/history');

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].amount).toBe(25.0);
    expect(res.body.history[0].amount).not.toBeCloseTo(bgnToEur(25.0), 2);
    expect(res.body.history[0].currency).toBe('EUR');
  });

  it('converts each row by its OWN currency when the two are mixed in one response', async () => {
    // The realistic shape of the column: a legacy BGN row alongside an
    // EUR-native one. A blanket conversion would halve the second.
    getActiveSubscriptionMock.mockResolvedValue({ stripeSubscriptionId: null });
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'tx-bgn',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        amount: 19.5583,
        currency: 'BGN',
        status: 'COMPLETED',
        description: 'Subscription payment',
        metadata: null,
      },
      {
        id: 'tx-eur',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        amount: 25.0,
        currency: 'EUR',
        status: 'COMPLETED',
        description: 'Wallet top-up',
        metadata: null,
      },
    ]);

    const res = await request(app).get('/api/subscriptions/history');

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.history.map((h: any) => [h.id, h]));
    expect(byId['tx-bgn'].amount).toBeCloseTo(10, 2);
    expect(byId['tx-eur'].amount).toBe(25.0);
    expect(byId['tx-bgn'].currency).toBe('EUR');
    expect(byId['tx-eur'].currency).toBe('EUR');
  });

  it('treats a null/absent currency as BGN, matching the schema column default', async () => {
    getActiveSubscriptionMock.mockResolvedValue({ stripeSubscriptionId: null });
    transactionFindManyMock.mockResolvedValue([
      {
        id: 'tx-null',
        createdAt: new Date('2026-08-03T00:00:00.000Z'),
        amount: 19.5583,
        currency: null,
        status: 'COMPLETED',
        description: 'Legacy row',
        metadata: null,
      },
    ]);

    const res = await request(app).get('/api/subscriptions/history');

    expect(res.status).toBe(200);
    expect(res.body.history[0].amount).toBeCloseTo(10, 2);
  });
});
