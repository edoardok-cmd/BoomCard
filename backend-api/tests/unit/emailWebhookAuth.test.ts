/**
 * Unit tests for inbound email webhook auth (spec §11.2 v1.1).
 *
 * Covers:
 *   - HMAC path: valid signature → 200; mismatched → 401
 *   - Shared-secret path: valid header → 200; mismatched → 401
 *   - Constant-time compare: a wrong-length provided value does not throw
 *   - No secret, any NODE_ENV → 401 (fail closed by default everywhere)
 *   - No secret + ALLOW_UNSIGNED_WEBHOOK=1 (and NODE_ENV≠production) → 200
 *     (explicit dev opt-in only; the mere absence of secrets never bypasses auth)
 *
 * The ticketInbound service is mocked so the test focuses purely on auth.
 */

jest.mock('../../src/services/ticketInbound.service', () => ({
  __esModule: true,
  ingestInboundEmail: jest.fn(async () => ({
    ticketId: 'ticket-1',
    replyId: 'reply-1',
    created: true,
  })),
}));

import express from 'express';
import crypto from 'crypto';
import request from 'supertest';
import emailWebhookRouter from '../../src/routes/emailWebhook.routes';

const payload = {
  from: 'user@example.com',
  to: 'support@boomcard.bg',
  subject: 'Hello',
  text: 'Hi there',
  messageId: '<abc@example.com>',
};

function buildApp() {
  const app = express();
  // Mirror production setup: raw parser on the HMAC path before json() so
  // the HMAC is verified against the original bytes, not re-serialised JSON.
  app.use('/api/email/inbound', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/api/email', emailWebhookRouter);
  return app;
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('§11.2 v1.1 emailWebhook auth', () => {
  it('accepts a valid HMAC signature', async () => {
    process.env.INBOUND_EMAIL_HMAC_SECRET = 'hmac-secret';
    delete process.env.EMAIL_WEBHOOK_SECRET;

    const signature = crypto
      .createHmac('sha256', 'hmac-secret')
      .update(JSON.stringify(payload))
      .digest('hex');

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-inbound-signature', signature)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('rejects a mismatched HMAC signature', async () => {
    process.env.INBOUND_EMAIL_HMAC_SECRET = 'hmac-secret';
    delete process.env.EMAIL_WEBHOOK_SECRET;

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-inbound-signature', 'a'.repeat(64))
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });

  it('handles a wrong-length HMAC value without throwing (timingSafeEqual guard)', async () => {
    process.env.INBOUND_EMAIL_HMAC_SECRET = 'hmac-secret';
    delete process.env.EMAIL_WEBHOOK_SECRET;

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-inbound-signature', 'short')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('accepts a matching shared secret', async () => {
    delete process.env.INBOUND_EMAIL_HMAC_SECRET;
    process.env.EMAIL_WEBHOOK_SECRET = 'shared-secret-value';

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-webhook-secret', 'shared-secret-value')
      .send(payload);

    expect(res.status).toBe(201);
  });

  it('rejects a mismatched shared secret', async () => {
    delete process.env.INBOUND_EMAIL_HMAC_SECRET;
    process.env.EMAIL_WEBHOOK_SECRET = 'shared-secret-value';

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-webhook-secret', 'wrong-secret-value')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('rejects a wrong-length shared secret without throwing', async () => {
    delete process.env.INBOUND_EMAIL_HMAC_SECRET;
    process.env.EMAIL_WEBHOOK_SECRET = 'shared-secret-value';

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-webhook-secret', 'short')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('fails closed in production when neither secret is configured', async () => {
    delete process.env.INBOUND_EMAIL_HMAC_SECRET;
    delete process.env.EMAIL_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('bypasses auth outside production only when ALLOW_UNSIGNED_WEBHOOK=1', async () => {
    delete process.env.INBOUND_EMAIL_HMAC_SECRET;
    delete process.env.EMAIL_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_UNSIGNED_WEBHOOK = '1';

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .send(payload);

    expect(res.status).toBe(201);
  });

  it('fails closed outside production when no secret is set and the opt-in flag is absent', async () => {
    // A misconfigured staging box: NODE_ENV≠production, secrets unset, and
    // ALLOW_UNSIGNED_WEBHOOK unset. A forged request bearing a deliberately
    // wrong shared-secret header must be rejected (FIX 2 — no implicit dev bypass).
    delete process.env.INBOUND_EMAIL_HMAC_SECRET;
    delete process.env.EMAIL_WEBHOOK_SECRET;
    delete process.env.ALLOW_UNSIGNED_WEBHOOK;
    process.env.NODE_ENV = 'staging';

    const res = await request(buildApp())
      .post('/api/email/inbound')
      .set('x-webhook-secret', 'forged-secret')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_signature');
  });
});
