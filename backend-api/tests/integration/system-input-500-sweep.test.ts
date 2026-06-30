/**
 * System Surface — INPUT class sweep (BC-SYSTEM-SPEC-REAUDIT)
 *
 * Mechanical guard: malformed / missing input on system endpoints returns a
 * clean 4xx, never a 500 / unhandled Prisma or runtime fault.
 *
 * Covers:
 *   INV-SYS-018 — POST /api/integrations/connect response must NOT echo credentials
 *   INV-SYS-026 — POST /api/integrations/connect, missing integrationId → 4xx (400 if authed; never 500)
 *   INV-SYS-027 — GET  /api/integrations/available/:id, unknown id → 404 (never 500)
 *   INV-SYS-028 — POST /api/webhooks/stripe & /api/email/inbound, malformed body → 4xx (auth rejects first)
 *   INV-SYS-029 — POST /api/email/inbound, authed (dev bypass) invalid payload → 400 + required[]
 *
 * The core invariant is "never 500". Exact positive codes are asserted only on
 * the fixture-free, no-auth rows.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, loginTestUser, cleanupTestUser } from '../helpers/test-utils';

// INV-SYS-029 needs the email auth bypass ON (dev opt-in) so the request reaches
// payload validation; setup.ts already sets ALLOW_UNSIGNED_WEBHOOK=1, but make it
// explicit and self-contained, and ensure no HMAC secret forces the strict path.
const prevHmac = process.env.INBOUND_EMAIL_HMAC_SECRET;
const prevShared = process.env.EMAIL_WEBHOOK_SECRET;
const prevAllow = process.env.ALLOW_UNSIGNED_WEBHOOK;

beforeAll(() => {
  delete process.env.INBOUND_EMAIL_HMAC_SECRET;
  delete process.env.EMAIL_WEBHOOK_SECRET;
  process.env.ALLOW_UNSIGNED_WEBHOOK = '1';
});

afterAll(() => {
  if (prevHmac === undefined) delete process.env.INBOUND_EMAIL_HMAC_SECRET;
  else process.env.INBOUND_EMAIL_HMAC_SECRET = prevHmac;
  if (prevShared === undefined) delete process.env.EMAIL_WEBHOOK_SECRET;
  else process.env.EMAIL_WEBHOOK_SECRET = prevShared;
  if (prevAllow === undefined) delete process.env.ALLOW_UNSIGNED_WEBHOOK;
  else process.env.ALLOW_UNSIGNED_WEBHOOK = prevAllow;
});

// INV-SYS-018: credentials must not appear in the POST /connect response.
// Requires a real PARTNER-role user with a linked Partner record so the
// authorize('PARTNER') middleware and partnerId resolution both pass.
describe('[INV-SYS-018] POST /api/integrations/connect — credentials not echoed in response', () => {
  let accessToken: string;
  let userId: string;
  let partnerId: string;

  beforeAll(async () => {
    // 1. Register a base user.
    const { user, email, password } = await createTestUser();
    userId = user.id;

    // 2. Flip the user to PARTNER role so the JWT issued on login carries role=PARTNER.
    //    Also create a linked Partner row so resolvePartnerId() succeeds.
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'PARTNER', status: 'ACTIVE' },
    });
    const partner = await prisma.partner.create({
      data: {
        userId,
        businessName: `Test Partner ${Date.now()}`,
        category: 'Restaurant',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        discountRate: 5,
      },
    });
    partnerId = partner.id;

    // 3. Log in fresh so the JWT contains role=PARTNER (registration token had role=USER).
    const { accessToken: freshToken } = await loginTestUser(email, password);
    accessToken = freshToken;
  });

  afterAll(async () => {
    if (partnerId) {
      await prisma.connectedIntegration.deleteMany({ where: { partnerId } }).catch(() => null);
      await prisma.partner.delete({ where: { id: partnerId } }).catch(() => null);
    }
    if (userId) await cleanupTestUser(userId);
  });

  test('response body does not contain credentials', async () => {
    const res = await request(app)
      .post('/api/integrations/connect')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send({
        integrationId: 'stripe',
        credentials: { publishableKey: 'pk_test_key', secretKey: 'sk_test_key' },
        settings: { mode: 'sandbox' },
      });

    // Must succeed (2xx)
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    // credentials must NOT appear anywhere in the response data (including nested)
    expect(JSON.stringify(res.body.data)).not.toContain('"credentials"');
    expect(JSON.stringify(res.body.data)).not.toContain('sk_test_key');
    expect(JSON.stringify(res.body.data)).not.toContain('pk_test_key');
  });
});

describe('System INPUT sweep — malformed input never 500s', () => {
  test('[INV-SYS-027] GET /api/integrations/available/:id unknown id → 404', async () => {
    const res = await request(app).get('/api/integrations/available/no-such-integration-id');
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(500);
  });

  test('[INV-SYS-027b] GET /api/integrations/available/:id weird id → never 500', async () => {
    for (const bad of ['', '%20', '../../etc', "a'b", '😀', 'a'.repeat(2000)]) {
      const res = await request(app).get(`/api/integrations/available/${encodeURIComponent(bad)}`);
      expect(res.status).toBeLessThan(500);
    }
  });

  test('[INV-SYS-026] POST /api/integrations/connect missing integrationId → 4xx (never 500)', async () => {
    // Anonymous → 401 (clean 4xx). The invariant under test is "never 500" on
    // missing/garbage input regardless of where the rejection happens.
    for (const body of [{}, { foo: 'bar' }, { integrationId: null }, { integrationId: 123 }]) {
      const res = await request(app)
        .post('/api/integrations/connect')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });

  test('[INV-SYS-028] POST /api/webhooks/stripe malformed body → 4xx (never 500)', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('not json at all <<<'));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('[INV-SYS-029] POST /api/email/inbound authed invalid payload → 400 + required[]', async () => {
    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify({ from: 'a@b.c' }))); // missing to/subject/text/messageId
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_payload');
    expect(Array.isArray(res.body.required)).toBe(true);
  });

  test('[INV-SYS-029b] POST /api/email/inbound authed malformed JSON bytes → never 500', async () => {
    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{ broken json'));
    expect(res.status).toBeLessThan(500);
  });
});
