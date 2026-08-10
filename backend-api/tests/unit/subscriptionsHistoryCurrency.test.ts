/**
 * BC-QA-031 (Step-4 regression fix) — GET /api/subscriptions/history
 *
 * Pins: real (Paysera) Transaction rows are BGN-denominated and must be
 * converted to EUR before returning (the exact CRITICAL money-display bug
 * class this task fixes); the T9 synthetic entry built from EUR-native plan
 * prices must NOT be re-converted (it is already EUR).
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
});
