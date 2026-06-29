/**
 * System Surface — SIG class sweep (BC-SYSTEM-SPEC-REAUDIT)
 *
 * Mechanical guard for the webhook signature-verification invariants. A webhook
 * is only processed when its provider signature verifies; missing/tampered
 * signatures are rejected before any side effect.
 *
 * Covers:
 *   INV-SYS-001 — POST /api/webhooks/stripe, no stripe-signature → 400
 *   INV-SYS-002 — POST /api/webhooks/stripe, tampered signature → 401
 *   INV-SYS-005 — POST /api/email/inbound, no auth header (strict path) → 401
 *   INV-SYS-006 — POST /api/email/inbound, wrong X-Inbound-Signature → 401
 *   INV-SYS-019 — GET  /api/webhooks/health → 200, status-only (no secrets)
 *
 * Env: the Stripe path needs STRIPE_WEBHOOK_SECRET set so a bad signature takes
 * the 401 branch (an UNSET secret is a 500 fail-closed — a different invariant).
 * The email path needs the HMAC secret SET and ALLOW_UNSIGNED_WEBHOOK cleared so
 * verifyAuth runs the strict (non-dev-bypass) branch.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import { app } from '../../src/server';

const SECRET_KEYS = /secret|password|sk_live|sk_test|whsec|api[_-]?key|dsn|connection/i;

// ─── Env: force the strict verification branches ─────────────────────────────
const prevStripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
const prevHmac = process.env.INBOUND_EMAIL_HMAC_SECRET;
const prevAllowUnsigned = process.env.ALLOW_UNSIGNED_WEBHOOK;

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy_for_sweep';
  process.env.INBOUND_EMAIL_HMAC_SECRET = 'sweep-inbound-hmac-secret';
  delete process.env.ALLOW_UNSIGNED_WEBHOOK; // strict: do not bypass auth
});

afterAll(() => {
  if (prevStripeSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = prevStripeSecret;
  if (prevHmac === undefined) delete process.env.INBOUND_EMAIL_HMAC_SECRET;
  else process.env.INBOUND_EMAIL_HMAC_SECRET = prevHmac;
  if (prevAllowUnsigned === undefined) delete process.env.ALLOW_UNSIGNED_WEBHOOK;
  else process.env.ALLOW_UNSIGNED_WEBHOOK = prevAllowUnsigned;
});

const validEmailPayload = {
  from: 'sender@example.com',
  to: 'support@boomcard.bg',
  subject: 'sweep',
  text: 'body',
  messageId: 'sweep-msg-1',
};

describe('System SIG sweep — webhook signature verification', () => {
  test('[INV-SYS-001] POST /api/webhooks/stripe without signature → 400', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ id: 'evt_1', type: 'ping' })));
    expect(res.status).toBe(400);
  });

  test('[INV-SYS-002] POST /api/webhooks/stripe with tampered signature → 401', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1700000000,v1=deadbeefdeadbeef')
      .send(Buffer.from(JSON.stringify({ id: 'evt_1', type: 'ping' })));
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(500); // never a server fault on a forged signature
  });

  test('[INV-SYS-005] POST /api/email/inbound with no auth header (strict) → 401', async () => {
    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(validEmailPayload)));
    expect(res.status).toBe(401);
  });

  test('[INV-SYS-006] POST /api/email/inbound with wrong X-Inbound-Signature → 401', async () => {
    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .set('X-Inbound-Signature', 'not-a-valid-hmac')
      .send(Buffer.from(JSON.stringify(validEmailPayload)));
    expect(res.status).toBe(401);
  });

  test('[INV-SYS-019] GET /api/webhooks/health → 200, status-only, no secrets', async () => {
    const res = await request(app).get('/api/webhooks/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(SECRET_KEYS);
  });
});
