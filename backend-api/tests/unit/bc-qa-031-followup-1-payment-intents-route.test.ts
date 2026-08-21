/**
 * BC-QA-031-FOLLOWUP-1 — `POST /api/payments/intents` rejects at the request
 * boundary.
 *
 * This route writes no `Transaction` row itself, which is exactly why it was
 * easy to miss: the currency it hands to Stripe is what
 * `stripe.service.handlePaymentSucceeded` later persists as
 * `Transaction.currency`. Enforcing the accepted domain only at the webhook
 * would mean taking a user through a complete Stripe checkout and then refusing
 * to record the payment they had already made.
 */

const createPaymentIntentMock = jest.fn();

jest.mock('../../src/services/stripe.service', () => ({
  stripeService: { createPaymentIntent: createPaymentIntentMock },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {},
}));

jest.mock('../../src/lib/prisma', () => {
  const client = {
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'u@example.com', firstName: 'A', lastName: 'B' }) },
    transaction: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'USER' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import request from 'supertest';
import paymentsRouter from '../../src/routes/payments.routes';

const app = express();
app.use(express.json());
app.use('/api/payments', paymentsRouter);

const REJECTED_CURRENCIES = ['USD', 'GBP', 'PLN', 'CZK', 'RON'];

beforeEach(() => {
  jest.clearAllMocks();
  createPaymentIntentMock.mockResolvedValue({
    paymentIntentId: 'pi_1',
    clientSecret: 'cs_1',
    amount: 100,
    currency: 'bgn',
  });
});

describe('POST /api/payments/intents — accepted currency domain', () => {
  it.each(REJECTED_CURRENCIES)('rejects %s with 400 and never reaches Stripe', async (currency) => {
    const res = await request(app)
      .post('/api/payments/intents')
      .send({ amount: 100, currency, description: 'probe' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain(currency);
    expect(res.body.message).toContain('BGN');
    expect(res.body.message).toContain('EUR');

    // No PaymentIntent is created at all, so no webhook can ever arrive
    // carrying a currency the Transaction table cannot store.
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it('accepts BGN and forwards the canonical code to Stripe', async () => {
    const res = await request(app)
      .post('/api/payments/intents')
      .send({ amount: 100, currency: 'BGN' });

    expect(res.status).toBe(201);
    expect(createPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(createPaymentIntentMock.mock.calls[0][0].currency).toBe('BGN');
  });

  it('accepts EUR and forwards the canonical code to Stripe', async () => {
    const res = await request(app)
      .post('/api/payments/intents')
      .send({ amount: 100, currency: 'eur' });

    expect(res.status).toBe(201);
    expect(createPaymentIntentMock.mock.calls[0][0].currency).toBe('EUR');
  });

  it('keeps defaulting to BGN when no currency is supplied', async () => {
    const res = await request(app).post('/api/payments/intents').send({ amount: 100 });

    expect(res.status).toBe(201);
    expect(createPaymentIntentMock.mock.calls[0][0].currency).toBe('BGN');
  });
});
