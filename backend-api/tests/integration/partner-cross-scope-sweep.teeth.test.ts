/**
 * TEETH TEST: partner-cross-scope-sweep (INV-SCOPE-001..017)
 *
 * Proves that the cross-scope IDOR detection has teeth: it would catch a 200
 * response (indicating scoping failure) and correctly passes when the API
 * enforces ownership guards.
 *
 * RED scenario (inline simulation): demonstrates that a 200/500 response from
 *   partner-A requesting partner-B's resource would be flagged as a violation.
 * GREEN scenario (live API): partner A actually requests partner B's resource
 *   IDs across key routes and receives 401/403/404 on ALL of them.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { genTestPhone } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_o: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_o: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_o: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `teeth-xscope-${Date.now()}`;

function tok(userId: string): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${RUN_TAG}-${userId}@test.local`, role: 'PARTNER' }, s, {
    expiresIn: '15m',
  });
}

// ─── The detection predicate (mirror of the sweep) ───────────────────────────

/** Returns true when a cross-scope request status is a violation (not a denial). */
function isCrossScopeViolation(status: number): boolean {
  return status !== 401 && status !== 403 && status !== 404 && status !== 422;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedPartner(tag: string) {
  const user = await prisma.user.create({
    data: {
      email: `${RUN_TAG}-${tag}@test.local`,
      firstName: tag,
      lastName: 'Teeth',
      phone: genTestPhone(),
      status: 'ACTIVE',
      role: 'PARTNER',
      emailVerified: true,
      passwordHash: 'unused',
    },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      businessName: `${RUN_TAG}-${tag}-Biz`,
      category: 'RESTAURANT',
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
  });
  const venue = await prisma.venue.create({
    data: { partnerId: partner.id, name: `${RUN_TAG}-${tag}-Venue`, address: 'A', city: 'Sofia' },
  });
  const ticket = await prisma.helpTicket.create({
    data: {
      subject: `${RUN_TAG}-${tag}-ticket`,
      body: 'body',
      category: 'OTHER',
      status: 'OPEN',
      userId: user.id,
      partnerId: partner.id,
    },
  });
  return { userId: user.id, partnerId: partner.id, venueId: venue.id, ticketId: ticket.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// RED scenario — simulated broken API response
// ─────────────────────────────────────────────────────────────────────────────

describe('TEETH — RED: detection fires when cross-scope request returns 200', () => {
  it('RED: status 200 is flagged as IDOR violation', () => {
    // A broken API returning 200 with B's data — detection MUST catch this
    const simulatedBrokenStatus = 200;
    expect(isCrossScopeViolation(simulatedBrokenStatus)).toBe(true);
  });

  it('RED: status 500 is flagged as violation (unhandled server error on B resource)', () => {
    expect(isCrossScopeViolation(500)).toBe(true);
  });

  it('RED: status 201 (created on B resource) is flagged', () => {
    expect(isCrossScopeViolation(201)).toBe(true);
  });

  it('BASELINE: status 403 is NOT a violation — correctly denied', () => {
    expect(isCrossScopeViolation(403)).toBe(false);
  });

  it('BASELINE: status 404 is NOT a violation — correctly denied', () => {
    expect(isCrossScopeViolation(404)).toBe(false);
  });

  it('BASELINE: status 401 is NOT a violation — correctly denied', () => {
    expect(isCrossScopeViolation(401)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN scenario — live API enforces ownership guard
// ─────────────────────────────────────────────────────────────────────────────

describe('GREEN: live API denies partner A access to partner B resources', () => {
  let app: any;
  let A: Awaited<ReturnType<typeof seedPartner>>;
  let B: Awaited<ReturnType<typeof seedPartner>>;
  let tokenA: string;

  beforeAll(async () => {
    app = await createTestApp();
    A = await seedPartner('A');
    B = await seedPartner('B');
    tokenA = tok(A.userId);
  });

  afterAll(async () => {
    try {
      await prisma.helpTicket.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.venue.deleteMany({ where: { partner: { user: { email: { startsWith: RUN_TAG } } } } });
      await prisma.partner.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
    } catch { /* best-effort */ }
    await app?.close?.();
  });

  /** Assert status is a denial and the sweep's detector would NOT flag it. */
  function assertDenied(status: number, route: string): void {
    expect([401, 403, 404, 422]).toContain(status); // clean denial
    expect(isCrossScopeViolation(status)).toBe(false); // GREEN: detection does not fire
    // eslint-disable-next-line no-console
    console.log(`[cross-scope-teeth] GREEN ${route} -> ${status}`);
  }

  it('GREEN: GET /api/partners/:id/transactions using B partnerId → denied', async () => {
    const res = await request(app)
      .get(`/api/partners/${B.partnerId}/transactions`)
      .set('Authorization', `Bearer ${tokenA}`);
    assertDenied(res.status, `GET /api/partners/${B.partnerId}/transactions`);
  });

  it('GREEN: GET /api/partners/:id/finance using B partnerId → denied', async () => {
    const res = await request(app)
      .get(`/api/partners/${B.partnerId}/finance`)
      .set('Authorization', `Bearer ${tokenA}`);
    assertDenied(res.status, `GET /api/partners/${B.partnerId}/finance`);
  });

  it('GREEN: GET /api/partners/:id/analytics using B partnerId → denied', async () => {
    const res = await request(app)
      .get(`/api/partners/${B.partnerId}/analytics`)
      .set('Authorization', `Bearer ${tokenA}`);
    assertDenied(res.status, `GET /api/partners/${B.partnerId}/analytics`);
  });

  it('GREEN: GET /api/partners/:id/stats using B partnerId → denied', async () => {
    const res = await request(app)
      .get(`/api/partners/${B.partnerId}/stats`)
      .set('Authorization', `Bearer ${tokenA}`);
    assertDenied(res.status, `GET /api/partners/${B.partnerId}/stats`);
  });

  it('GREEN: PUT /api/partners/:id using B partnerId → denied', async () => {
    const res = await request(app)
      .put(`/api/partners/${B.partnerId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ description: 'IDOR attempt' });
    assertDenied(res.status, `PUT /api/partners/${B.partnerId}`);
  });

  it('GREEN: GET /api/partner/help/tickets/:ticketId using B ticketId → denied', async () => {
    const res = await request(app)
      .get(`/api/partner/help/tickets/${B.ticketId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assertDenied(res.status, `GET /api/partner/help/tickets/${B.ticketId}`);
  });

  it('GREEN: GET /api/stickers/venue/:venueId using B venueId → denied', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${B.venueId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    assertDenied(res.status, `GET /api/stickers/venue/${B.venueId}`);
  });

  it('GREEN: collection routes (/me) contain NO partner B private marker', async () => {
    const meRoutes = [
      '/api/partners/me/transactions',
      '/api/partners/me/finance',
      '/api/partners/me/analytics',
    ];
    const bMarkers = [B.partnerId, B.venueId, `${RUN_TAG}-B-Biz`];

    for (const route of meRoutes) {
      const res = await request(app).get(route).set('Authorization', `Bearer ${tokenA}`);
      if (res.status < 200 || res.status >= 300) continue;
      const body = JSON.stringify(res.body);
      for (const marker of bMarkers) {
        if (body.includes(marker)) {
          throw new Error(`IDOR: partner B marker "${marker}" found in partner A's ${route}`);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[cross-scope-teeth] GREEN collection ${route} -> no B markers`);
    }
  });
});
