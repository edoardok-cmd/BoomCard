/**
 * GET /api/subscriptions/status/:orderId — pending (anonymous-checkout) branch
 * field completeness (BC-QA-003)
 *
 * Round 1 fixed this branch dropping `nameBg` and `billingPeriod` from the
 * response even though PendingSubscription.billingPeriod and
 * Plan.displayNameBg are both stored at checkout time — causing the
 * confirmation page's Plan/Period fields to render blank for the anonymous
 * (payment-first onboarding) checkout flow. This pins that fix: both fields
 * must be forwarded (including the genuinely-null case, since nameBg is a
 * nullable column and the frontend fix in round 2 depends on receiving an
 * honest `null` rather than the key being dropped entirely).
 *
 * Also pins that `isActive` stays hardcoded `false` for this branch — the
 * real Subscription/account doesn't exist yet until the user completes
 * profile setup via the emailed link (round 2, F2 explicitly keeps this
 * backend behaviour unchanged and only fixes the frontend's status LABEL).
 */

const subscriptionFindFirst = jest.fn();
const pendingSubscriptionFindFirst = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client = {
    subscription: { findFirst: (...a: any[]) => subscriptionFindFirst(...a) },
    pendingSubscription: { findFirst: (...a: any[]) => pendingSubscriptionFindFirst(...a) },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: 'USER' };
    next();
  },
}));

jest.mock('../../src/services/subscription.service', () => ({
  subscriptionService: {},
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

const app = express();
app.use(express.json());
app.use('/api/subscriptions', subscriptionsRouter);

describe('GET /api/subscriptions/status/:orderId — pending branch field completeness (BC-QA-003)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No real Subscription yet — forces the PendingSubscription fallback branch.
    subscriptionFindFirst.mockResolvedValue(null);
  });

  it('forwards nameBg and billingPeriod, and keeps isActive hardcoded false, when nameBg is set', async () => {
    pendingSubscriptionFindFirst.mockResolvedValue({
      status: 'PAID',
      email: 'guest@example.com',
      billingPeriod: 'monthly',
      plan: { planCode: 'BASIC', displayName: 'Basic', displayNameBg: 'Базов' },
    });

    const res = await request(app).get('/api/subscriptions/status/ORDER-1');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('pending');
    expect(res.body.data.plan).toEqual({ code: 'BASIC', name: 'Basic', nameBg: 'Базов' });
    expect(res.body.data.billingPeriod).toBe('monthly');
    expect(res.body.data.isActive).toBe(false);
  });

  it('forwards an explicit null nameBg (not dropped/undefined) so the frontend can apply its fallback', async () => {
    pendingSubscriptionFindFirst.mockResolvedValue({
      status: 'PAID',
      email: 'guest@example.com',
      billingPeriod: 'yearly',
      plan: { planCode: 'BASIC', displayName: 'Basic', displayNameBg: null },
    });

    const res = await request(app).get('/api/subscriptions/status/ORDER-2');

    expect(res.status).toBe(200);
    // Regression guard: the pre-fix code omitted `nameBg`/`billingPeriod`
    // from the response object entirely rather than sending null/undefined,
    // so assert the key is actually present with the real null value.
    expect(res.body.data.plan).toHaveProperty('nameBg');
    expect(res.body.data.plan.nameBg).toBeNull();
    expect(res.body.data.billingPeriod).toBe('yearly');
    expect(res.body.data.isActive).toBe(false);
  });
});
