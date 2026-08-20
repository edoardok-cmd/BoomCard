/**
 * Regression test for BC-QA-002 (CRITICAL, revenue-blocking).
 *
 * Root cause: `applyRateLimiters()` in src/config/security.config.ts used to
 * mount a BLANKET `app.use('/api/payments', paymentRateLimiter)` covering the
 * entire /api/payments/* prefix, on top of the SAME `paymentRateLimiter`
 * instance already applied directly to POST /anonymous-subscription and
 * POST /verify-redirect in payments.paysera.routes.ts. Because
 * `paymentRateLimiter` is a single shared middleware/counter instance,
 * Express ran it TWICE per request on those routes, silently halving the
 * advertised 10-requests/15-minutes budget to 5 real attempts before a 429.
 * It also covered the Paysera webhook callback endpoints (the ONLY place a
 * subscription is ever activated or a wallet top-up is ever credited) and
 * read-only endpoints (/methods, /history, /:orderId/status) that have
 * nothing to do with a "payment attempt".
 *
 * Reproduced live against boomcard-api.fly.dev: a handful of real
 * create-payment attempts from one IP was enough to 429 the guest checkout
 * flow, surfacing to the user as CheckoutPage's generic
 * "Грешка при обработка на плащането" error and blocking the purchase.
 *
 * Fix: paymentRateLimiter is now applied directly, exactly once, only on the
 * routes that represent a genuine user-initiated payment-creation attempt
 * (POST /create, POST /subscription, POST /anonymous-subscription,
 * POST /verify-redirect). Webhook callbacks and read-only endpoints are no
 * longer subject to it.
 *
 * Both `applyRateLimiters()` (its own early-return) and `paymentRateLimiter`
 * (its `skip` option) are gated on NODE_ENV === 'production', so this file
 * temporarily forces NODE_ENV to 'production' to exercise the real gate and
 * restores it in `afterAll` — this mutation must never leak into other test
 * files (jest.config.js runs this suite with maxWorkers: 1).
 */
import express from 'express';
import request from 'supertest';

describe('Payment rate limiter wiring (BC-QA-002 regression)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  let app: express.Express;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    // Guarantee module-load safety regardless of which other test files have
    // already run and populated these from .env — payments.paysera.routes.ts
    // throws at import time if either is unset while NODE_ENV === 'production'.
    process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:19006';
    process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3025';

    const { applyRateLimiters } = await import('../../src/config/security.config');
    const paymentsRouter = (await import('../../src/routes/payments.paysera.routes')).default;

    app = express();
    app.use(express.json());
    applyRateLimiters(app);
    app.use('/api/payments', paymentsRouter);
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  const guestBody = (i: number) => ({
    planId: '00000000-0000-0000-0000-000000000000', // valid UUID shape, no matching Plan row — 404s downstream, after the limiter
    billingPeriod: 'weekly',
    email: `bc-qa-002-rl-${i}@example.com`,
    firstName: 'QA',
    lastName: 'Repro',
  });

  it('allows the full advertised budget (10 req/15min) of anonymous-subscription attempts from one IP — not half of it', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/payments/anonymous-subscription')
        .send(guestBody(i));
      // Any status OTHER than 429 proves this attempt was NOT rate-limited.
      // A nonexistent planId 404s further downstream (past the limiter),
      // which is expected and irrelevant to this test.
      expect(res.status).not.toBe(429);
    }

    const eleventh = await request(app)
      .post('/api/payments/anonymous-subscription')
      .send(guestBody(10));
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toBe('Payment rate limit exceeded');
  });

  it('never rate-limits the Paysera webhook callback, even once the create-endpoint budget above is exhausted', async () => {
    // The IP-keyed budget consumed above is already past its limit. Under the
    // original bug this route shared that same bucket, so Paysera's "OK"
    // acknowledgement would never be sent once any customer's confirmations
    // exhausted it — a paid subscription would silently never activate.
    const res = await request(app)
      .post('/api/payments/callback')
      .send({ data: 'irrelevant', ss1: 'irrelevant' });
    expect(res.status).not.toBe(429);
    expect(res.text).toBe('OK');
  });

  it('never rate-limits GET /api/payments/methods, even once the create-endpoint budget above is exhausted', async () => {
    const res = await request(app).get('/api/payments/methods');
    expect(res.status).not.toBe(429);
  });
});

/**
 * Regression test for BC-QA-007 round-2 finding F1 (MEDIUM).
 *
 * Root cause: round-1's fix added `authRateLimiter` for
 * POST /api/auth/resend-complete-profile-link's doc comment claim, but round
 * 1 never actually registered it in `applyRateLimiters()` (src/config/
 * security.config.ts). Round 2 added the missing
 * `app.use('/api/auth/resend-complete-profile-link', authRateLimiter)` line,
 * but round-2 review found no test anywhere in the repo actually exercises
 * `applyRateLimiters()`'s registration path for this route: the implementer's
 * own `resend-complete-profile-link` suite (tests/integration/
 * auth-flow.test.ts) runs entirely under NODE_ENV=test, where
 * `applyRateLimiters()` itself is an early-return no-op (see its own
 * top-of-function `isProduction` gate) — so reverting the added line left
 * every one of those tests green.
 *
 * Mirrors the pattern established above for BC-QA-002 (paymentRateLimiter):
 * force NODE_ENV=production, call the real `applyRateLimiters(app)` against a
 * minimal Express app carrying only the real auth router, and assert the
 * configured budget (`AUTH_RATE_LIMIT_MAX_REQUESTS`, default 5 req/15min) is
 * actually enforced end-to-end through the registration path — not just the
 * route handler in isolation.
 */
describe('Auth resend-complete-profile-link rate limiter wiring (BC-QA-007 F1 regression)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  let app: express.Express;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    // Same module-load-safety guarantee as the describe block above — auth
    // routes/services are pulled in transitively and some (e.g. email/notify
    // services) read these under production mode.
    process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:19006';
    process.env.API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3025';

    const { applyRateLimiters } = await import('../../src/config/security.config');
    const authRouter = (await import('../../src/routes/auth.routes')).default;

    app = express();
    app.use(express.json());
    applyRateLimiters(app);
    app.use('/api/auth', authRouter);
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5');

  it(`rate-limits POST /api/auth/resend-complete-profile-link to the configured auth budget (${AUTH_RATE_LIMIT_MAX} req/15min) once applyRateLimiters() actually registers it`, async () => {
    for (let i = 0; i < AUTH_RATE_LIMIT_MAX; i++) {
      const res = await request(app)
        .post('/api/auth/resend-complete-profile-link')
        .send({});
      // A missing token 400s well past the limiter (see auth.routes.ts) — any
      // status OTHER than 429 proves this attempt was NOT rate-limited.
      expect(res.status).not.toBe(429);
      expect(res.status).toBe(400);
    }

    const overBudget = await request(app)
      .post('/api/auth/resend-complete-profile-link')
      .send({});
    expect(overBudget.status).toBe(429);
  });
});
