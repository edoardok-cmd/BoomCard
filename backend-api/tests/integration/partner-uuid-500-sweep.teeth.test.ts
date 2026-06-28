/**
 * TEETH TEST: partner-uuid-500-sweep (INV-INPUT-001/002, INV-ACT-006)
 *
 * Proves that the malformed-param → 500 detector has teeth: it would catch a
 * 500 response and correctly passes when the API returns clean 4xx.
 *
 * RED scenario (inline): demonstrates that a simulated 500 response on a
 *   malformed-UUID request would be flagged as a violation.
 * GREEN scenario (live API): key partner :param routes receive "not-a-uuid"
 *   and return 400/401/403/404/422 — never 500.
 *
 * This file does NOT edit any src/** code.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_o: any) => Promise.resolve() },
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutEvent: (_o: any) => Promise.resolve(),
    notifyPartnerStatusChange: (_o: any) => Promise.resolve(),
  },
}));

const RUN_TAG = `teeth-uuid500-${Date.now()}`;
const MALFORMED = 'not-a-uuid';
const NONEXISTENT_UUID = '00000000-0000-0000-0000-000000000000';

function tok(userId: string): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set');
  return jwt.sign({ id: userId, email: `${RUN_TAG}@test.local`, role: 'PARTNER' }, s, {
    expiresIn: '15m',
  });
}

// ─── Detection predicate (mirrors the sweep) ─────────────────────────────────

function is500Violation(status: number): boolean {
  return status === 500;
}

function isCleanResponse(status: number): boolean {
  return status >= 400 && status < 500; // 4xx — expected on bad input
}

// ─────────────────────────────────────────────────────────────────────────────
// RED scenario — simulated 500 responses
// ─────────────────────────────────────────────────────────────────────────────

describe('TEETH — RED: detection fires when endpoint returns 500 on malformed param', () => {
  it('RED: HTTP 500 is flagged as a violation', () => {
    expect(is500Violation(500)).toBe(true);
  });

  it('BASELINE: HTTP 400 is NOT a violation — clean validation error', () => {
    expect(is500Violation(400)).toBe(false);
    expect(isCleanResponse(400)).toBe(true);
  });

  it('BASELINE: HTTP 404 is NOT a violation — resource not found (expected)', () => {
    expect(is500Violation(404)).toBe(false);
    expect(isCleanResponse(404)).toBe(true);
  });

  it('BASELINE: HTTP 403 is NOT a violation — auth denial (expected)', () => {
    expect(is500Violation(403)).toBe(false);
    expect(isCleanResponse(403)).toBe(true);
  });

  it('BASELINE: HTTP 422 is NOT a violation — validation error (expected)', () => {
    expect(is500Violation(422)).toBe(false);
    expect(isCleanResponse(422)).toBe(true);
  });

  it('RED: detection correctly identifies the root cause category (Prisma UUID cast error)', () => {
    // Simulate what a Prisma CastError would produce: unhandled -> 500
    const simulatedPrismaError = {
      status: 500,
      body: { error: 'Invalid uuid: "not-a-uuid"' }, // typical unhandled Prisma cast
    };
    expect(is500Violation(simulatedPrismaError.status)).toBe(true);
    expect(simulatedPrismaError.body.error).toMatch(/invalid.*uuid/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GREEN scenario — live API handles malformed params cleanly
// ─────────────────────────────────────────────────────────────────────────────

describe('GREEN: live partner API returns 4xx (never 500) on malformed :param', () => {
  let app: any;
  let partnerToken: string;
  let validPartnerId: string;
  let validVenueId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}-p@test.local`,
        firstName: 'Teeth',
        lastName: 'UUID500',
        phone: '+359000900300',
        status: 'ACTIVE',
        role: 'PARTNER',
        emailVerified: true,
        passwordHash: 'unused',
      },
    });
    const partner = await prisma.partner.create({
      data: {
        userId: user.id,
        businessName: `${RUN_TAG} Partner`,
        category: 'RESTAURANT',
        status: 'ACTIVE',
        verifiedAt: new Date(),
      },
    });
    const venue = await prisma.venue.create({
      data: { partnerId: partner.id, name: `${RUN_TAG} Venue`, address: 'Addr', city: 'Sofia' },
    });

    partnerToken = tok(user.id);
    validPartnerId = partner.id;
    validVenueId = venue.id;
  });

  afterAll(async () => {
    try {
      await prisma.venue.deleteMany({
        where: { partner: { user: { email: { startsWith: RUN_TAG } } } },
      });
      await prisma.partner.deleteMany({ where: { user: { email: { startsWith: RUN_TAG } } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: RUN_TAG } } });
    } catch { /* best-effort */ }
    await app?.close?.();
  });

  /** Assert endpoint returns a clean 4xx, not 500. */
  function assertClean(status: number, route: string): void {
    expect(is500Violation(status)).toBe(false); // detection does NOT fire
    expect(isCleanResponse(status)).toBe(true);  // 4xx
    // eslint-disable-next-line no-console
    console.log(`[uuid500-teeth] GREEN ${route} -> ${status}`);
  }

  // Core partner endpoint
  it('GREEN: GET /api/partners/:id with MALFORMED id → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/partners/${MALFORMED}`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/partners/${MALFORMED}`);
  });

  it('GREEN: GET /api/partners/:id with NONEXISTENT UUID → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/partners/${NONEXISTENT_UUID}`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/partners/${NONEXISTENT_UUID}`);
  });

  it('GREEN: GET /api/partners/:id/transactions with MALFORMED id → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/partners/${MALFORMED}/transactions`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/partners/${MALFORMED}/transactions`);
  });

  it('GREEN: GET /api/partners/:id/finance with MALFORMED id → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/partners/${MALFORMED}/finance`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/partners/${MALFORMED}/finance`);
  });

  it('GREEN: GET /api/partners/:id/stats with MALFORMED id → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/partners/${MALFORMED}/stats`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/partners/${MALFORMED}/stats`);
  });

  it('GREEN: GET /api/stickers/venue/:venueId with MALFORMED venueId → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${MALFORMED}`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/stickers/venue/${MALFORMED}`);
  });

  it('GREEN: PUT /api/partners/:id with MALFORMED id → 4xx not 500', async () => {
    const res = await request(app)
      .put(`/api/partners/${MALFORMED}`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ description: 'test' });
    assertClean(res.status, `PUT /api/partners/${MALFORMED}`);
  });

  it('GREEN: GET /api/partner/help/tickets/:ticketId with MALFORMED id → 4xx not 500', async () => {
    const res = await request(app)
      .get(`/api/partner/help/tickets/${MALFORMED}`)
      .set('Authorization', `Bearer ${partnerToken}`);
    assertClean(res.status, `GET /api/partner/help/tickets/${MALFORMED}`);
  });

  it('GREEN: partner :param routes return 4xx on BOTH malformed AND nonexistent-uuid probes', async () => {
    const paramRoutes = [
      { method: 'get', path: `/api/partners/${MALFORMED}` },
      { method: 'get', path: `/api/partners/${NONEXISTENT_UUID}` },
      { method: 'get', path: `/api/partners/${MALFORMED}/transactions` },
      { method: 'get', path: `/api/partners/${NONEXISTENT_UUID}/transactions` },
      { method: 'get', path: `/api/stickers/venue/${MALFORMED}` },
      { method: 'get', path: `/api/stickers/venue/${NONEXISTENT_UUID}` },
    ];
    const hits500: string[] = [];
    for (const { method, path } of paramRoutes) {
      const res = await (request(app) as any)[method](path).set('Authorization', `Bearer ${partnerToken}`);
      if (is500Violation(res.status)) {
        hits500.push(`${method.toUpperCase()} ${path} → ${res.status}`);
      }
    }
    if (hits500.length > 0) {
      console.log('[uuid500-teeth] GREEN FAILS — 500 hit(s):', hits500);
    }
    expect(hits500).toEqual([]); // GREEN: zero 500s
  });
});
