/**
 * Redemption Surface — Cross-Scope Sweep (BC-REDEMPTION-SPEC-REAUDIT)
 *
 * FLAGSHIP class: cross-tenant data isolation for the redemption surface.
 * Each test is structured as "Actor A must not see or mutate Tenant B's data."
 *
 * Invariants covered (XSCOPE CRITICAL/HIGH class; also selected LIFECYCLE and MEDIUM invariants):
 *
 *   XSCOPE class:
 *   INV-RDM-001 — Partner cannot access another partner's venue sticker data
 *   INV-RDM-002 — User can only retrieve their own scan history
 *   INV-RDM-003 — Receipt upload only succeeds for own scans
 *   INV-RDM-004 — Partner cannot create venue (admin-only)
 *   INV-RDM-005 — Partner cannot update venue (admin-only)
 *   INV-RDM-006 — Partner cannot delete venue (admin-only)
 *   INV-RDM-007 — Partner cannot upload menu images (admin-only)
 *   INV-RDM-008 — Partner cannot clear venue menu (admin-only)
 *   INV-RDM-009 — Partner CAN submit menu URL for own venue; cross-partner access returns 403
 *   INV-RDM-010 — Partner CAN withdraw menu submission for own venue; cross-partner access returns 403
 *   INV-RDM-011 — Dashboard scoped to authenticated user
 *   INV-RDM-055 — Admin-only venue fields not returned in public GET
 *   INV-RDM-069 — Bookings cross-tenant isolation (user B cannot read/mutate user A's booking)
 *   INV-RDM-070 — Messaging participant isolation (non-participant 403, no admin bypass, author-only PATCH/DELETE)
 *   INV-RDM-071 — Bookings partner-status cross-tenant isolation (GET /api/bookings/partner scoped to own partner; PATCH /api/bookings/partner/:id/status cross-tenant 403)
 *   INV-RDM-074 — GET /api/messaging/unread-count self-scope (401 unauth; own unread only; own sent excluded; foreign conv does not leak)
 *   INV-RDM-077 — GET /api/messaging/conversations/:id/messages `before` cursor cross-conversation IDOR guard (cursor from conv B rejected 400 when fetching conv A)
 *
 *   AUTH class (MEDIUM):
 *   INV-RDM-072 — POST /api/bookings/ requires active subscription + validates input/partner/venue ownership; userId server-derived
 *   INV-RDM-073 — POST /api/messaging/conversations validates type-enum/title/participants/DIRECT-cardinality; creator server-derived (no IDOR); TOCTOU-dedup idempotent
 *
 *   INPUT class (MEDIUM/LOW):
 *   INV-RDM-075 — POST /api/messaging/conversations/:id/messages content gate (required/non-empty/≤10000/type-enum)
 *   INV-RDM-076 — PATCH /api/messaging/messages/:messageId edit gate (content required/≤10000; rejects deleted/non-TEXT messages)
 *   INV-RDM-078 — PATCH /api/messaging/conversations/:id title gate (missing/blank/>200 → 400)
 *
 *   LIFECYCLE class:
 *   INV-RDM-045 — GET /api/bookings/ returns 200 with owner-scoped pagination (active-admin-only bypass)
 *   INV-RDM-046 — GET /api/messaging/conversations returns 200 with participant-scoped list; non-participant sees empty list
 *   INV-RDM-047 — GET /api/venues/nearby returns 200 unconditionally (ENABLE_NEARBY_VENUES flag removed)
 *
 * Teeth-proving: each test includes a "positive control" that confirms the
 * authorized caller CAN access the same resource (proving the 403 is an auth
 * gate, not a bug in the test setup).
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 * Uses real DB through the test-utils helpers, same as other integration tests.
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  createTestVenue,
  createTestSubscription,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

let partnerAUserId: string;
let partnerAToken: string;
let partnerBUserId: string;
let partnerBToken: string;
let userAUserId: string;
let userAToken: string;
let userBUserId: string;
let userBToken: string;
// Admin credentials for positive-control tests in INV-RDM-004..010
let adminToken: string;
let adminUserId: string;

// Venues and stickers owned by Partner A / Partner B
let venueAId: string;
let stickersAVenueId: string;
let venueBId: string;

const cleanupVenueIds: string[] = [];
const cleanupUserIds: string[] = [];

async function createPartnerWithVenue(): Promise<{
  userId: string;
  token: string;
  partnerId: string;
  venueId: string;
}> {
  // Create user
  const { user, accessToken } = await createTestUser();
  cleanupUserIds.push(user.id);

  // Promote to PARTNER role + activate — status=PENDING_VERIFICATION blocks both login
  // (auth.service.ts L879) and the authenticate middleware (auth.middleware.ts L189).
  await prisma.user.update({ where: { id: user.id }, data: { role: 'PARTNER', status: 'ACTIVE' } });

  // Login again to get a fresh JWT with role=PARTNER (token from registration has role=USER)
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: (await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } }))!.email, password: 'TestPass123!', clientType: 'web' });
  const partnerToken = loginRes.status === 200 ? loginRes.body.data.accessToken : accessToken;

  // Create partner record
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      businessName: `Sweep Test Partner ${Date.now()}`,
      businessNameBg: `Sweep Test Partner ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      discountRate: 5,
      isVisible: true,
    },
  });

  // Create venue owned by this partner
  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: `Sweep Venue ${Date.now()}`,
      address: '1 Test Street',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
      venueStatus: 'ACTIVE',
    },
  });
  cleanupVenueIds.push(venue.id);

  // Create a sticker location and sticker for this venue
  const location = await prisma.stickerLocation.create({
    data: {
      venueId: venue.id,
      name: 'Main',
      nameBg: 'Основна',
      locationType: 'TABLE',
      locationNumber: '1',
      isActive: true,
    },
  });

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  await prisma.sticker.create({
    data: {
      locationId: location.id,
      venueId: venue.id,
      stickerId: `SWEEP-${uniqueSuffix}`,
      qrCode: `https://boomcard.bg/qr/SWEEP-${uniqueSuffix}`,
      status: 'ACTIVE',
    },
  });

  await prisma.venueStickerConfig.create({
    data: { venueId: venue.id, minBillAmount: 5 },
  });

  return {
    userId: user.id,
    token: partnerToken,
    partnerId: partner.id,
    venueId: venue.id,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Partner A owns venueA; Partner B owns venueB
  const pA = await createPartnerWithVenue();
  partnerAUserId = pA.userId;
  partnerAToken = pA.token;
  venueAId = pA.venueId;
  stickersAVenueId = pA.venueId;

  const pB = await createPartnerWithVenue();
  partnerBUserId = pB.userId;
  partnerBToken = pB.token;
  venueBId = pB.venueId;

  // Two subscriber users — use BASIC which is valid in both schema and test DB.
  // Must also set status=ACTIVE: auth middleware blocks PENDING_VERIFICATION (auth.middleware.ts L189).
  const uA = await createTestUser();
  userAUserId = uA.user.id;
  userAToken = uA.accessToken;
  cleanupUserIds.push(userAUserId);
  await prisma.user.update({ where: { id: userAUserId }, data: { status: 'ACTIVE' } });
  await createTestSubscription(userAUserId, 'BASIC', 'ACTIVE');

  const uB = await createTestUser();
  userBUserId = uB.user.id;
  userBToken = uB.accessToken;
  cleanupUserIds.push(userBUserId);
  await prisma.user.update({ where: { id: userBUserId }, data: { status: 'ACTIVE' } });
  await createTestSubscription(userBUserId, 'BASIC', 'ACTIVE');

  // Admin user for positive-control tests in INV-RDM-004..010.
  // Register normally, then elevate role+status, then re-login to get a fresh
  // JWT that carries role=ADMIN through the auth.middleware.ts token check.
  const adminRegistered = await createTestUser();
  adminUserId = adminRegistered.user.id;
  cleanupUserIds.push(adminUserId);
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });
  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminRegistered.email, password: adminRegistered.password, clientType: 'web' });
  if (adminLoginRes.status !== 200) {
    throw new Error(`Admin login failed (${adminLoginRes.status}): ${JSON.stringify(adminLoginRes.body)}`);
  }
  adminToken = adminLoginRes.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  for (const id of cleanupVenueIds) {
    try { await cleanupTestVenue(id); } catch {}
  }
  for (const id of cleanupUserIds) {
    try { await cleanupTestUser(id); } catch {}
  }
}, 30_000);

// ─── INV-RDM-001: Partner cross-venue sticker access ─────────────────────────

describe('INV-RDM-001 — Partner cannot access another partner venue sticker data', () => {
  it('[XSCOPE] Partner B gets 403 on GET /api/stickers/venue/:id for Partner A venue', async () => {
    const res = await authRequest(partnerBToken).get(`/api/stickers/venue/${venueAId}`);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] Partner A gets 200 on GET /api/stickers/venue/:id for own venue', async () => {
    const res = await authRequest(partnerAToken).get(`/api/stickers/venue/${venueAId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('[XSCOPE] Partner B gets 403 on GET /api/stickers/venue/:id/scans for Partner A venue', async () => {
    const res = await authRequest(partnerBToken).get(`/api/stickers/venue/${venueAId}/scans`);
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] Partner A gets 200 on GET /api/stickers/venue/:id/scans for own venue', async () => {
    const res = await authRequest(partnerAToken).get(`/api/stickers/venue/${venueAId}/scans`);
    expect(res.status).toBe(200);
  });

  it('[XSCOPE] Partner B gets 403 on GET /api/stickers/venue/:id/analytics for Partner A venue', async () => {
    const res = await authRequest(partnerBToken).get(`/api/stickers/venue/${venueAId}/analytics`);
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] Partner A gets 200 on GET /api/stickers/venue/:id/analytics for own venue', async () => {
    const res = await authRequest(partnerAToken).get(`/api/stickers/venue/${venueAId}/analytics`);
    expect(res.status).toBe(200);
  });

  it('[XSCOPE] Partner B gets 403 on GET /api/stickers/venue/:id/config for Partner A venue', async () => {
    const res = await authRequest(partnerBToken).get(`/api/stickers/venue/${venueAId}/config`);
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] Partner A gets 200 on GET /api/stickers/venue/:id/config for own venue', async () => {
    const res = await authRequest(partnerAToken).get(`/api/stickers/venue/${venueAId}/config`);
    expect(res.status).toBe(200);
  });
});

// ─── INV-RDM-002: User scan history scoped to own userId ─────────────────────

describe('INV-RDM-002 — GET /api/stickers/my-scans returns only own scans', () => {
  let scanId: string;

  let rdm002CardId: string;

  beforeAll(async () => {
    // StickerScan.cardId is required — create a card for User A
    const card = await prisma.card.create({
      data: {
        userId: userAUserId,
        cardNumber: `SWEEP-RDM002-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        qrCode: `https://boomcard.bg/card-qr/RDM002-${Date.now()}`,
        type: 'BASIC',
        status: 'ACTIVE',
      },
    });
    rdm002CardId = card.id;

    const sticker = await prisma.sticker.findFirst({ where: { venueId: venueAId } });
    if (!sticker) throw new Error(`INV-RDM-002 setup: no sticker found for venueId ${venueAId}`);
    const scan = await prisma.stickerScan.create({
      data: {
        userId: userAUserId,
        stickerId: sticker.id,
        venueId: venueAId,
        cardId: rdm002CardId,
        billAmount: 100,
        status: 'PENDING',
      },
    });
    scanId = scan.id;
  });

  afterAll(async () => {
    if (scanId) {
      await prisma.stickerScan.delete({ where: { id: scanId } }).catch(() => {});
    }
    if (rdm002CardId) {
      await prisma.card.delete({ where: { id: rdm002CardId } }).catch(() => {});
    }
  });

  it('[XSCOPE] User B cannot see User A scans via GET /my-scans', async () => {
    const resB = await authRequest(userBToken).get('/api/stickers/my-scans');
    expect(resB.status).toBe(200);
    const ids = (resB.body.data || []).map((s: any) => s.id);
    expect(ids).not.toContain(scanId);
  });

  it('[POSITIVE] User A sees their own scan in GET /my-scans', async () => {
    const resA = await authRequest(userAToken).get('/api/stickers/my-scans');
    expect(resA.status).toBe(200);
    const ids = (resA.body.data || []).map((s: any) => s.id);
    expect(ids).toContain(scanId);
  });
});

// ─── INV-RDM-003: Receipt upload IDOR ────────────────────────────────────────

describe('INV-RDM-003 — Receipt upload IDOR: cannot upload for another user scan', () => {
  let scanOwnedByUserA: string;

  let cardAId: string;

  beforeAll(async () => {
    // Create a Card for User A (required by StickerScan.cardId FK)
    const card = await prisma.card.create({
      data: {
        userId: userAUserId,
        cardNumber: `SWEEP-CARD-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        qrCode: `https://boomcard.bg/card-qr/SWEEP-${Date.now()}`,
        type: 'BASIC',
        status: 'ACTIVE',
      },
    });
    cardAId = card.id;

    // Create a scan owned by User A
    const sticker = await prisma.sticker.findFirst({ where: { venueId: venueAId } });
    if (!sticker) throw new Error(`INV-RDM-003 setup: no sticker found for venueId ${venueAId}`);
    const scan = await prisma.stickerScan.create({
      data: {
        userId: userAUserId,
        stickerId: sticker.id,
        venueId: venueAId,
        cardId: cardAId,
        billAmount: 50,
        status: 'PENDING',
      },
    });
    scanOwnedByUserA = scan.id;
  });

  afterAll(async () => {
    if (scanOwnedByUserA) {
      await prisma.stickerScan.delete({ where: { id: scanOwnedByUserA } }).catch(() => {});
    }
    if (cardAId) {
      await prisma.card.delete({ where: { id: cardAId } }).catch(() => {});
    }
  });

  it('[XSCOPE] User B cannot upload receipt for User A scan (returns 400 "Scan not found")', async () => {
    expect(scanOwnedByUserA).toBeDefined();

    // User B sends a tiny fake image so the request reaches the service layer
    const fakeImg = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000',
      'hex'
    );

    const res = await authRequest(userBToken)
      .post(`/api/stickers/scan/${scanOwnedByUserA}/receipt`)
      .attach('file', fakeImg, { filename: 'receipt.jpg', contentType: 'image/jpeg' });

    // Must NOT be 200 — should be 400 ("Scan not found") or 401 (sub check)
    expect(res.status).not.toBe(200);
  });
});

// ─── INV-RDM-004..010: Venue / menu mutation ─────────────────────────────────

describe('INV-RDM-004..010 — Venue/menu mutation: admin-only except partner self-service submit/withdraw', () => {
  it('[XSCOPE] INV-RDM-004: Partner cannot create venue — POST /api/venues/ returns 403', async () => {
    const res = await authRequest(partnerAToken)
      .post('/api/venues/')
      .send({
        partnerId: partnerAUserId,
        name: 'Test Venue',
        address: '1 Street',
        city: 'Sofia',
        latitude: 42.0,
        longitude: 23.0,
      });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-005: Partner cannot update venue — PUT /api/venues/:id returns 403', async () => {
    const res = await authRequest(partnerAToken)
      .put(`/api/venues/${venueAId}`)
      .send({ name: 'Hacked Name' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-006: Partner cannot delete venue — DELETE /api/venues/:id returns 403', async () => {
    const res = await authRequest(partnerAToken).delete(`/api/venues/${venueAId}`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-007: Partner cannot upload menu images — POST /api/venues/:id/menu returns 403', async () => {
    const fakeImg = Buffer.from('89504e47', 'hex');
    const res = await authRequest(partnerAToken)
      .post(`/api/venues/${venueAId}/menu`)
      .attach('images', fakeImg, { filename: 'menu.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-008: Partner cannot clear menu — DELETE /api/venues/:id/menu returns 403', async () => {
    const res = await authRequest(partnerAToken).delete(`/api/venues/${venueAId}/menu`);
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] INV-RDM-009: Partner CAN submit menu URL for own venue — POST /api/venues/:id/menu/submit returns 200 or 400 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    const res = await authRequest(partnerAToken)
      .post(`/api/venues/${throwawayVenueId}/menu/submit`)
      .send({ url: 'https://example.com/menu.pdf' });
    expect([200, 400]).toContain(res.status);
  });

  it('[XSCOPE] INV-RDM-009-CROSS: Partner CANNOT submit menu URL for another partner\'s venue — returns 403', async () => {
    const res = await authRequest(partnerBToken)
      .post(`/api/venues/${venueAId}/menu/submit`)
      .send({ url: 'https://example.com/menu.pdf' });
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] INV-RDM-010: Partner CAN withdraw menu submission for own venue — POST /api/venues/:id/menu/withdraw returns 200 or 400 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    const res = await authRequest(partnerAToken)
      .post(`/api/venues/${throwawayVenueId}/menu/withdraw`);
    expect([200, 400]).toContain(res.status);
  });

  it('[XSCOPE] INV-RDM-010-CROSS: Partner CANNOT withdraw menu submission for another partner\'s venue — returns 403', async () => {
    const res = await authRequest(partnerBToken)
      .post(`/api/venues/${venueAId}/menu/withdraw`);
    expect(res.status).toBe(403);
  });

  // ─── Positive controls: ADMIN can access admin-only venue/menu routes ────────
  // throwawayVenueId is created in a nested beforeAll so it is available for
  // RDM-005, RDM-007, RDM-008, RDM-009, and RDM-010 positive-control tests
  // without risking venueAId or venueBId (which the XSCOPE tests above depend on).
  let throwawayVenueId: string;
  let throwawayVenueDeleteId: string;
  let partnerAPartnerId: string;

  beforeAll(async () => {
    const partnerRecord = await prisma.partner.findFirst({
      where: { userId: partnerAUserId },
      select: { id: true },
    });
    if (!partnerRecord) {
      throw new Error('Positive-control setup: Partner A record not found');
    }
    partnerAPartnerId = partnerRecord.id;

    // Venue used for menu upload / submit / withdraw positive controls.
    const tv = await prisma.venue.create({
      data: {
        partnerId: partnerRecord.id,
        name: `Throwaway Menu Venue ${Date.now()}`,
        address: '1 Throwaway Rd',
        city: 'Sofia',
        latitude: 42.6977,
        longitude: 23.3219,
        venueStatus: 'ACTIVE',
      },
    });
    throwawayVenueId = tv.id;

    // Separate venue used only by the DELETE positive-control test so it is
    // not destroyed before the menu tests run.
    const td = await prisma.venue.create({
      data: {
        partnerId: partnerRecord.id,
        name: `Ephemeral Delete Venue ${Date.now()}`,
        address: '99 Delete Me St',
        city: 'Sofia',
        latitude: 42.6977,
        longitude: 23.3219,
        venueStatus: 'ACTIVE',
      },
    });
    throwawayVenueDeleteId = td.id;
  });

  afterAll(async () => {
    // Best-effort cleanup — the DELETE positive test may have already removed
    // throwawayVenueDeleteId; the menu venue is cleaned up here.
    if (throwawayVenueId) {
      await prisma.venue.delete({ where: { id: throwawayVenueId } }).catch(() => {});
    }
    if (throwawayVenueDeleteId) {
      await prisma.venue.delete({ where: { id: throwawayVenueDeleteId } }).catch(() => {});
    }
  });

  it('[POSITIVE] INV-RDM-006: ADMIN can delete a venue — DELETE /api/venues/:id returns 200', async () => {
    expect(throwawayVenueDeleteId).toBeDefined();
    const res = await authRequest(adminToken).delete(`/api/venues/${throwawayVenueDeleteId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('[POSITIVE] INV-RDM-007: ADMIN can upload menu images — POST /api/venues/:id/menu returns 200, 400, or 500 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    // In the test environment the image-upload backend (S3/Cloudinary) is
    // unavailable, so the route returns 500 ("All image uploads failed") instead
    // of 200. That is still proof the request passed the auth gate — a 403 would
    // mean the ADMIN role was rejected, which is what we are ruling out.
    const fakeImg = Buffer.from('89504e47', 'hex');
    const res = await authRequest(adminToken)
      .post(`/api/venues/${throwawayVenueId}/menu`)
      .attach('images', fakeImg, { filename: 'menu.png', contentType: 'image/png' });
    expect([200, 400, 500]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('[POSITIVE] INV-RDM-009: ADMIN can submit menu URL — POST /api/venues/:id/menu/submit returns 200 or 400 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    const res = await authRequest(adminToken)
      .post(`/api/venues/${throwawayVenueId}/menu/submit`)
      .send({ url: 'https://example.com/menu.pdf' });
    expect([200, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('[POSITIVE] INV-RDM-010: ADMIN can withdraw menu submission — POST /api/venues/:id/menu/withdraw returns 200 or 400 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    const res = await authRequest(adminToken)
      .post(`/api/venues/${throwawayVenueId}/menu/withdraw`);
    expect([200, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
  });

  it('[POSITIVE] INV-RDM-004: ADMIN can create venue — POST /api/venues/ returns 201 or 400 (not 403)', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send({
        partnerId: partnerAPartnerId,
        name: `Positive-RDM004-Venue-${Date.now()}`,
        address: '1 Admin Create St',
        city: 'Sofia',
        latitude: 42.6977,
        longitude: 23.3219,
      });
    expect([201, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
    // Clean up the venue if it was created
    if (res.status === 201 && res.body?.data?.id) {
      await prisma.venue.delete({ where: { id: res.body.data.id } }).catch(() => {});
    }
  });

  it('[POSITIVE] INV-RDM-005: ADMIN can update venue — PUT /api/venues/:id returns 200 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    const res = await authRequest(adminToken)
      .put(`/api/venues/${throwawayVenueId}`)
      .send({ name: `Admin Updated ${Date.now()}` });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('[POSITIVE] INV-RDM-008: ADMIN can clear menu images — DELETE /api/venues/:id/menu returns 200 (not 403)', async () => {
    expect(throwawayVenueId).toBeDefined();
    const res = await authRequest(adminToken).delete(`/api/venues/${throwawayVenueId}/menu`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── INV-RDM-011: Dashboard scoped to authenticated user ─────────────────────

describe('INV-RDM-011 — Dashboard scoped to authenticated user', () => {
  let rdm011ScanId: string;
  let rdm011CardId: string;

  beforeAll(async () => {
    const card = await prisma.card.create({
      data: {
        userId: userAUserId,
        cardNumber: `RDM011-CARD-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        qrCode: `https://boomcard.bg/card-qr/RDM011-${Date.now()}`,
        type: 'BASIC',
        status: 'ACTIVE',
      },
    });
    rdm011CardId = card.id;

    const sticker = await prisma.sticker.findFirst({ where: { venueId: venueAId } });
    if (!sticker) throw new Error(`INV-RDM-011 setup: no sticker found for venueId ${venueAId}`);

    const scan = await prisma.stickerScan.create({
      data: {
        userId: userAUserId,
        stickerId: sticker.id,
        venueId: venueAId,
        cardId: rdm011CardId,
        billAmount: 75,
        status: 'APPROVED',
      },
    });
    rdm011ScanId = scan.id;
  });

  afterAll(async () => {
    await prisma.stickerScan.delete({ where: { id: rdm011ScanId } }).catch(() => {});
    await prisma.card.delete({ where: { id: rdm011CardId } }).catch(() => {});
  });

  it('[AUTH] GET /api/dashboard/me without token returns 401', async () => {
    const res = await request(app).get('/api/dashboard/me');
    expect(res.status).toBe(401);
  });

  it('[POSITIVE] GET /api/dashboard/me returns 200 for authenticated user', async () => {
    const res = await authRequest(userAToken).get('/api/dashboard/me');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('subscription');
    expect(res.body).toHaveProperty('wallet');
    expect(res.body).toHaveProperty('receipts');
  });

  it('[XSCOPE] User B cannot see User A scan in GET /api/dashboard/me receipts', async () => {
    if (!rdm011ScanId) throw new Error('INV-RDM-011 beforeAll: sticker not found — isolation test cannot proceed');
    const res = await authRequest(userBToken).get('/api/dashboard/me');
    expect(res.status).toBe(200);
    const receiptIds: string[] = (res.body.receipts as Array<{ id: string }>).map((r) => r.id);
    expect(receiptIds).not.toContain(rdm011ScanId);
  });
});

// ─── INV-RDM-055: Admin-only venue fields not exposed ────────────────────────

describe('INV-RDM-055 — Admin-only venue fields not exposed in public GET /api/venues/:id', () => {
  const ADMIN_ONLY_FIELDS = [
    'pendingMenuUrl',
    'menuRejectionReason',
    'menuReviewedBy',
    'menuReviewedAt',
    'venueStatusNote',
    'venueStatusAt',
  ];

  it('[LEAK] Public GET /api/venues/:id does not include admin-only fields', async () => {
    const res = await request(app).get(`/api/venues/${venueAId}`);
    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    for (const field of ADMIN_ONLY_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('[LEAK] Public GET /api/venues/:id does not include partner internal fields', async () => {
    const res = await request(app).get(`/api/venues/${venueAId}`);
    expect(res.status).toBe(200);
    const partnerData = (res.body.data || res.body)?.partner;
    if (partnerData) {
      expect(partnerData).not.toHaveProperty('status');
      expect(partnerData).not.toHaveProperty('verifiedAt');
      expect(partnerData).not.toHaveProperty('isVisible');
    }
  });
});

// ─── INV-RDM-040/033: Auth gates on dashboard and my-scans ───────────────────

describe('Auth gates — unauthenticated callers receive 401', () => {
  it('[AUTH] INV-RDM-040: GET /api/dashboard/me without token → 401', async () => {
    expect((await request(app).get('/api/dashboard/me')).status).toBe(401);
  });

  it('[AUTH] INV-RDM-033: GET /api/stickers/my-scans without token → 401', async () => {
    expect((await request(app).get('/api/stickers/my-scans')).status).toBe(401);
  });

  it('[AUTH] GET /api/stickers/admin/stats without token → 401', async () => {
    expect((await request(app).get('/api/stickers/admin/stats')).status).toBe(401);
  });

  it('[AUTH] GET /api/stickers/admin/pending-review without token → 401', async () => {
    expect((await request(app).get('/api/stickers/admin/pending-review')).status).toBe(401);
  });

  it('[AUTH] POST /api/venues/:id/menu without token → 401', async () => {
    const fakeImg = Buffer.from('89504e47', 'hex');
    const res = await request(app)
      .post(`/api/venues/${venueAId}/menu`)
      .attach('images', fakeImg, { filename: 'menu.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});

// ─── INV-RDM-045: Bookings list route (implemented, active-admin-only bypass) ──

describe('INV-RDM-045 — GET /api/bookings/ (fully-implemented, active-admin-only list-all)', () => {
  it('[LIFECYCLE] INV-RDM-045: GET /api/bookings/ — unauthenticated returns 401; authenticated non-admin returns 200 with owner-scoped pagination; active ADMIN returns 200 (active-admin-only bypass)', async () => {
    const unauth = await request(app).get('/api/bookings/');
    expect(unauth.status).toBe(401);

    const auth = await authRequest(userAToken).get('/api/bookings/');
    expect(auth.status).toBe(200);
    expect(auth.body.success).toBe(true);
    expect(Array.isArray(auth.body.data)).toBe(true);
    expect(auth.body.meta).toMatchObject({
      total: expect.any(Number),
      page: expect.any(Number),
      limit: expect.any(Number),
    });

    // ACTIVE admin (aro=false) may list all bookings — positive control for the active-admin-only gate.
    const adminRes = await authRequest(adminToken).get('/api/bookings/');
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
  });
});

// ─── INV-RDM-069: Bookings cross-tenant isolation ────────────────────────────

describe('INV-RDM-069 — Bookings cross-tenant isolation', () => {
  let bookingAId: string;

  beforeAll(async () => {
    // Create a booking for user A via Prisma (POST /api/bookings requires an active
    // subscription gate; direct insert avoids that gate cleanly for isolation tests).
    const partner = await prisma.partner.findFirstOrThrow({ where: { userId: partnerAUserId } });
    const booking = await prisma.booking.create({
      data: {
        userId: userAUserId,
        partnerId: partner.id,
        venueId: venueAId,
        bookingDate: new Date(Date.now() + 86400000),
        bookingTime: '18:00',
        guestCount: 2,
        // timestamp + random suffix avoids @unique collisions in parallel CI workers
        confirmationCode: `RDM069-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: 'PENDING',
      },
      select: { id: true },
    });
    bookingAId = booking.id;
  }, 10_000);

  afterAll(async () => {
    if (bookingAId) await prisma.booking.delete({ where: { id: bookingAId } }).catch(() => {});
  });

  it('[POSITIVE] INV-RDM-069: user A gets 200 on GET /api/bookings/:id for own booking', async () => {
    const res = await authRequest(userAToken).get(`/api/bookings/${bookingAId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(bookingAId);
  });

  it('[XSCOPE] INV-RDM-069: user B gets 403 on GET /api/bookings/:id for user A booking', async () => {
    const res = await authRequest(userBToken).get(`/api/bookings/${bookingAId}`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-069: partner B (non-owner partner) gets 403 on GET /api/bookings/:id for user A booking', async () => {
    const res = await authRequest(partnerBToken).get(`/api/bookings/${bookingAId}`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-069: user B gets 403 on PATCH /api/bookings/:id for user A booking', async () => {
    const res = await authRequest(userBToken)
      .patch(`/api/bookings/${bookingAId}`)
      .send({ guestCount: 10 });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-069: user B gets 403 on DELETE /api/bookings/:id for user A booking', async () => {
    const res = await authRequest(userBToken).delete(`/api/bookings/${bookingAId}`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-069: user B GET /api/bookings/ list does not leak user A booking', async () => {
    const res = await authRequest(userBToken).get('/api/bookings/');
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((b) => b.id);
    expect(ids).not.toContain(bookingAId);
  });

  it('[POSITIVE] INV-RDM-069: active ADMIN gets 200 on GET /api/bookings/:id for any booking', async () => {
    const res = await authRequest(adminToken).get(`/api/bookings/${bookingAId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(bookingAId);
  });
});

// ─── INV-RDM-046: Messaging conversations participant-scoped list ─────────────

describe('INV-RDM-046 — GET /api/messaging/conversations returns 200 with participant-scoped list', () => {
  it('[LIFECYCLE] INV-RDM-046: GET /api/messaging/conversations returns 200 with participant-scoped conversation list — non-participant caller sees empty list', async () => {
    // Negative control: userA is not a participant of any conversation yet
    // (no conversations seeded for userA in the global beforeAll).
    const resEmpty = await authRequest(userAToken).get('/api/messaging/conversations');
    expect(resEmpty.status).toBe(200);
    expect(Array.isArray(resEmpty.body.data)).toBe(true);
    // The list is participant-scoped — userA has no conversations at this point, so the list must be empty.
    expect(resEmpty.body.data.length).toBe(0);

    // Positive control: create a conversation with userA as a participant, confirm it appears.
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        title: 'RDM-046 test conv',
      },
    });
    const participantA = await prisma.conversationParticipant.create({
      data: { conversationId: conv.id, userId: userAUserId, isActive: true },
    });
    // Also need a second participant for a DIRECT conv to be well-formed (not required by list query)
    const participantB = await prisma.conversationParticipant.create({
      data: { conversationId: conv.id, userId: userBUserId, isActive: true },
    });

    try {
      const resWithConv = await authRequest(userAToken).get('/api/messaging/conversations');
      expect(resWithConv.status).toBe(200);
      expect(Array.isArray(resWithConv.body.data)).toBe(true);
      const ids = resWithConv.body.data.map((c: any) => c.id);
      expect(ids).toContain(conv.id);
      // userA must see exactly this conversation (scoped to their participations).
      // userB also sees it since they are a participant — this is intentional.
    } finally {
      // Inline cleanup: participants first (FK), then conversation.
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv.id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv.id } }).catch(() => {});
    }
  });
});

// ─── INV-RDM-070: Messaging participant isolation ─────────────────────────────

describe('INV-RDM-070 — Messaging participant isolation', () => {
  let conv070Id: string;
  let messageAId: string; // sent by userA
  let messageBId: string; // sent by userB
  let outsiderUserId: string;
  let outsiderToken: string;

  beforeAll(async () => {
    // Create a DIRECT conversation with userA and userB as participants.
    const conv = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        title: 'RDM-070 isolation test',
      },
    });
    conv070Id = conv.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv070Id, userId: userAUserId, isActive: true },
        { conversationId: conv070Id, userId: userBUserId, isActive: true },
      ],
    });

    // Send a message from userA.
    const msgA = await prisma.message.create({
      data: {
        conversationId: conv070Id,
        userId: userAUserId,
        content: 'Hello from A (RDM-070)',
        type: 'TEXT',
      },
    });
    messageAId = msgA.id;

    // Send a message from userB.
    const msgB = await prisma.message.create({
      data: {
        conversationId: conv070Id,
        userId: userBUserId,
        content: 'Hello from B (RDM-070)',
        type: 'TEXT',
      },
    });
    messageBId = msgB.id;

    // Create a third user who is NOT a participant of this conversation.
    const outsider = await createTestUser();
    outsiderUserId = outsider.user.id;
    outsiderToken = outsider.accessToken;
    cleanupUserIds.push(outsiderUserId);
    await prisma.user.update({ where: { id: outsiderUserId }, data: { status: 'ACTIVE' } });
    await createTestSubscription(outsiderUserId, 'BASIC', 'ACTIVE');
  }, 20_000);

  afterAll(async () => {
    // Clean up messages, participants, then conversation.
    if (messageAId) await prisma.message.deleteMany({ where: { id: messageAId } }).catch(() => {});
    if (messageBId) await prisma.message.deleteMany({ where: { id: messageBId } }).catch(() => {});
    if (conv070Id) {
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv070Id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv070Id } }).catch(() => {});
    }
  }, 20_000);

  // Positive control: participant userB CAN access the conversation.
  it('[POSITIVE] INV-RDM-070: participant (userB) gets 200 on GET /api/messaging/conversations/:id', async () => {
    const res = await authRequest(userBToken).get(`/api/messaging/conversations/${conv070Id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(conv070Id);
  });

  // Non-participant outsider must be blocked on every conversation-scoped route.
  it('[XSCOPE] INV-RDM-070: non-participant gets 403 on GET /api/messaging/conversations/:id', async () => {
    const res = await authRequest(outsiderToken).get(`/api/messaging/conversations/${conv070Id}`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-070: non-participant gets 403 on GET /api/messaging/conversations/:id/messages', async () => {
    const res = await authRequest(outsiderToken).get(`/api/messaging/conversations/${conv070Id}/messages`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-070: non-participant gets 403 on POST /api/messaging/conversations/:id/messages', async () => {
    const res = await authRequest(outsiderToken)
      .post(`/api/messaging/conversations/${conv070Id}/messages`)
      .send({ content: 'Injected message' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-070: non-participant gets 403 on PATCH /api/messaging/conversations/:id', async () => {
    const res = await authRequest(outsiderToken)
      .patch(`/api/messaging/conversations/${conv070Id}`)
      .send({ title: 'Hacked title' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-070: non-participant gets 403 on DELETE /api/messaging/conversations/:id', async () => {
    const res = await authRequest(outsiderToken).delete(`/api/messaging/conversations/${conv070Id}`);
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-070: non-participant gets 403 on POST /api/messaging/conversations/:id/read', async () => {
    const res = await authRequest(outsiderToken).post(`/api/messaging/conversations/${conv070Id}/read`);
    expect(res.status).toBe(403);
  });

  // Admin without a participant row must also get 403 (no role bypass in assertParticipant).
  it('[XSCOPE] INV-RDM-070: admin non-participant gets 403 on GET /api/messaging/conversations/:id (no admin bypass)', async () => {
    const res = await authRequest(adminToken).get(`/api/messaging/conversations/${conv070Id}`);
    expect(res.status).toBe(403);
  });

  // Only the message author may PATCH/DELETE their own message;
  // userB (a participant but NOT the author of messageA) must get 403.
  it('[XSCOPE] INV-RDM-070: participant non-author (userB) gets 403 on PATCH /api/messaging/messages/:messageId for userA message', async () => {
    const res = await authRequest(userBToken)
      .patch(`/api/messaging/messages/${messageAId}`)
      .send({ content: 'Tampered by B' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-070: participant non-author (userB) gets 403 on DELETE /api/messaging/messages/:messageId for userA message', async () => {
    const res = await authRequest(userBToken).delete(`/api/messaging/messages/${messageAId}`);
    expect(res.status).toBe(403);
  });
});

// ─── INV-RDM-047: Nearby venues — feature flag lifted ───────────────────────

describe('Nearby venues — feature flag lifted', () => {
  it('[LIFECYCLE] INV-RDM-047: GET /api/venues/nearby returns 200 — flag removed, endpoint unconditionally active', async () => {
    // Flag ENABLE_NEARBY_VENUES removed; endpoint unconditionally active and returns 200 with empty list when no venues match.
    const res = await request(app).get('/api/venues/nearby?latitude=42&longitude=23');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({
      coordinates: { latitude: 42, longitude: 23 },
      radius: expect.any(Number),
      count: expect.any(Number),
    });
  });

  it('[LIFECYCLE] INV-RDM-047: GET /api/venues/nearby returns 400 for non-numeric radius', async () => {
    const res = await request(app).get('/api/venues/nearby?latitude=42&longitude=23&radius=abc');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-047: GET /api/venues/nearby returns 400 when latitude is missing', async () => {
    const res = await request(app).get('/api/venues/nearby?longitude=23');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-047: GET /api/venues/nearby returns 400 for non-numeric latitude', async () => {
    const res = await request(app).get('/api/venues/nearby?latitude=abc&longitude=23');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── INV-RDM-071: Bookings partner-status cross-tenant isolation ─────────────

describe('INV-RDM-071 — Bookings partner-status cross-tenant isolation', () => {
  let bookingForPartnerAId: string;
  let bookingForPartnerBId: string;
  let partnerAPartnerId: string;
  let partnerBPartnerId: string;

  beforeAll(async () => {
    // Resolve partner record IDs from the global user fixtures.
    const partnerA = await prisma.partner.findFirstOrThrow({ where: { userId: partnerAUserId } });
    partnerAPartnerId = partnerA.id;
    const partnerB = await prisma.partner.findFirstOrThrow({ where: { userId: partnerBUserId } });
    partnerBPartnerId = partnerB.id;

    // Booking owned by Partner A's partner record (booked by userA for Partner A's venue).
    const bA = await prisma.booking.create({
      data: {
        userId: userAUserId,
        partnerId: partnerAPartnerId,
        venueId: venueAId,
        bookingDate: new Date(Date.now() + 86400000),
        bookingTime: '18:00',
        guestCount: 2,
        confirmationCode: `RDM071A-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: 'PENDING',
      },
      select: { id: true },
    });
    bookingForPartnerAId = bA.id;

    // Booking owned by Partner B's partner record (booked by userB for Partner B's venue).
    const bB = await prisma.booking.create({
      data: {
        userId: userBUserId,
        partnerId: partnerBPartnerId,
        venueId: venueBId,
        bookingDate: new Date(Date.now() + 86400000),
        bookingTime: '19:00',
        guestCount: 3,
        confirmationCode: `RDM071B-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: 'PENDING',
      },
      select: { id: true },
    });
    bookingForPartnerBId = bB.id;
  }, 15_000);

  afterAll(async () => {
    if (bookingForPartnerAId) await prisma.booking.delete({ where: { id: bookingForPartnerAId } }).catch(() => {});
    if (bookingForPartnerBId) await prisma.booking.delete({ where: { id: bookingForPartnerBId } }).catch(() => {});
  });

  // ── GET /api/bookings/partner ─────────────────────────────────────────────

  it('[POSITIVE] INV-RDM-071: partner A gets 200 on GET /api/bookings/partner and sees own booking', async () => {
    const res = await authRequest(partnerAToken).get('/api/bookings/partner');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = (res.body.data as Array<{ id: string }>).map((b) => b.id);
    expect(ids).toContain(bookingForPartnerAId);
  });

  it('[XSCOPE] INV-RDM-071: partner A GET /api/bookings/partner does not leak partner B booking', async () => {
    const res = await authRequest(partnerAToken).get('/api/bookings/partner');
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((b) => b.id);
    expect(ids).not.toContain(bookingForPartnerBId);
  });

  it('[XSCOPE] INV-RDM-071: non-partner user gets 403 on GET /api/bookings/partner', async () => {
    const res = await authRequest(userAToken).get('/api/bookings/partner');
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-071: unauthenticated caller gets 401 on GET /api/bookings/partner', async () => {
    const res = await request(app).get('/api/bookings/partner');
    expect(res.status).toBe(401);
  });

  // ── PATCH /api/bookings/partner/:id/status ───────────────────────────────

  it('[POSITIVE] INV-RDM-071: partner A can PATCH /api/bookings/partner/:id/status for own booking', async () => {
    // CONFIRMED is deliberately non-terminal so subsequent XSCOPE tests exercise the 403 gate, not the 409 gate.
    const res = await authRequest(partnerAToken)
      .patch(`/api/bookings/partner/${bookingForPartnerAId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('[XSCOPE] INV-RDM-071: partner B gets 403 on PATCH /api/bookings/partner/:id/status for partner A booking', async () => {
    const res = await authRequest(partnerBToken)
      .patch(`/api/bookings/partner/${bookingForPartnerAId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-071: non-partner user gets 403 on PATCH /api/bookings/partner/:id/status', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/bookings/partner/${bookingForPartnerAId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
  });

  it('[XSCOPE] INV-RDM-071: unauthenticated caller gets 401 on PATCH /api/bookings/partner/:id/status', async () => {
    // authenticate middleware fires before route logic; booking id need not exist for a 401
    const res = await request(app)
      .patch(`/api/bookings/partner/${bookingForPartnerAId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(401);
  });
});

// ─── INV-RDM-072: POST /api/bookings/ subscription gate + input/ownership validation ─────────

describe('INV-RDM-072 — POST /api/bookings/ requires active subscription + validates input/partner/venue ownership; userId server-derived', () => {
  let partnerAPartnerId: string;
  let noSubUserId: string;
  let noSubToken: string;
  let createdBookingId: string | undefined;

  beforeAll(async () => {
    const partnerA = await prisma.partner.findFirstOrThrow({ where: { userId: partnerAUserId } });
    partnerAPartnerId = partnerA.id;

    // USER-role + ACTIVE status but NO subscription — triggers 402 from requireActiveSubscription.
    // createTestUser() sets status=ACTIVE internally; explicit update here makes the fixture
    // self-documenting and robust against future changes to the helper's default.
    const noSub = await createTestUser();
    noSubUserId = noSub.user.id;
    cleanupUserIds.push(noSubUserId);
    await prisma.user.update({ where: { id: noSubUserId }, data: { status: 'ACTIVE' } });
    noSubToken = noSub.accessToken;
  }, 15_000);

  afterAll(async () => {
    if (createdBookingId) {
      await prisma.booking.delete({ where: { id: createdBookingId } }).catch(() => {});
    }
  });

  it('[AUTH] unauthenticated caller gets 401 on POST /api/bookings/', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post('/api/bookings/')
      .send({ partnerId: partnerAPartnerId, bookingDate: futureDate, bookingTime: '18:00', guestCount: 2 });
    expect(res.status).toBe(401);
  });

  it('[AUTH] non-subscribed user gets 402 on POST /api/bookings/', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await authRequest(noSubToken)
      .post('/api/bookings/')
      .send({ partnerId: partnerAPartnerId, bookingDate: futureDate, bookingTime: '18:00', guestCount: 2 });
    expect(res.status).toBe(402);
  });

  it('[VALIDATION] missing required field (partnerId) returns 400', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await authRequest(userAToken)
      .post('/api/bookings/')
      .send({ bookingDate: futureDate, bookingTime: '18:00', guestCount: 2 });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] invalid bookingTime format returns 400', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await authRequest(userAToken)
      .post('/api/bookings/')
      .send({ partnerId: partnerAPartnerId, bookingDate: futureDate, bookingTime: '25:99', guestCount: 2 });
    expect(res.status).toBe(400);
  });

  it('[OWNERSHIP] non-existent partnerId returns 404', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await authRequest(userAToken)
      .post('/api/bookings/')
      .send({ partnerId: '00000000-0000-0000-0000-000000000000', bookingDate: futureDate, bookingTime: '18:00', guestCount: 2 });
    expect(res.status).toBe(404);
  });

  it('[OWNERSHIP] venueId belonging to a different partner returns 400', async () => {
    // venueBId belongs to Partner B, not Partner A — should be rejected
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await authRequest(userAToken)
      .post('/api/bookings/')
      .send({ partnerId: partnerAPartnerId, venueId: venueBId, bookingDate: futureDate, bookingTime: '18:00', guestCount: 2 });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] subscribed user creates booking with server-derived userId — 201', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await authRequest(userAToken)
      .post('/api/bookings/')
      .send({ partnerId: partnerAPartnerId, venueId: venueAId, bookingDate: futureDate, bookingTime: '18:00', guestCount: 2 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    createdBookingId = res.body.data.id;

    // Fetch back to confirm userId is server-derived from the JWT (not client-supplied).
    const getRes = await authRequest(userAToken).get(`/api/bookings/${createdBookingId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.userId).toBe(userAUserId);
  });
});

// ─── requireActiveAdmin: inactive admin blocked from venue writes ─────────────

describe('requireActiveAdmin — inactive admin (aro=true) cannot mutate venues', () => {
  let inactiveAdminToken: string;
  let inactiveAdminUserId: string;

  beforeAll(async () => {
    const { user, accessToken } = await createTestUser();
    inactiveAdminUserId = user.id;
    cleanupUserIds.push(inactiveAdminUserId);

    // Promote to ADMIN with INACTIVE status — the authenticate middleware
    // re-derives aro=true from status===INACTIVE on every request (auth.middleware.ts
    // §M4), so no separate aro column is needed. INACTIVE admins may log in
    // (read-only) but requireActiveAdmin blocks all non-GET/HEAD/OPTIONS requests.
    await prisma.user.update({
      where: { id: inactiveAdminUserId },
      data: { role: 'ADMIN', status: 'INACTIVE' },
    });

    // Re-login to get a token with ADMIN role + aro=true in the JWT.
    // INACTIVE admins are explicitly allowed to log in per auth.service.ts L850
    // ("INACTIVE → login allowed, but operational rights limited to read-only").
    // Throw here so the test cannot silently degrade to a wrong-role fallback.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: (await prisma.user.findUnique({ where: { id: inactiveAdminUserId }, select: { email: true } }))!.email,
        password: 'TestPass123!',
        clientType: 'web',
      });
    if (loginRes.status !== 200) {
      throw new Error(`Inactive-admin login failed (${loginRes.status}) — cannot prove requireActiveAdmin gate`);
    }
    inactiveAdminToken = loginRes.body.data.accessToken;
  }, 15_000);

  it('[ARO] Inactive admin gets 403 on POST /api/venues/', async () => {
    const res = await authRequest(inactiveAdminToken)
      .post('/api/venues/')
      .send({
        partnerId: 'dummy-partner',
        name: 'ARO Test Venue',
        address: '1 ARO St',
        city: 'Sofia',
        latitude: 42.0,
        longitude: 23.0,
      });
    expect(res.status).toBe(403);
  });

  it('[ARO] Inactive admin gets 403 on PUT /api/venues/:id', async () => {
    const res = await authRequest(inactiveAdminToken)
      .put(`/api/venues/${venueAId}`)
      .send({ name: 'ARO Hack' });
    expect(res.status).toBe(403);
  });

  it('[ARO] Inactive admin gets 403 on DELETE /api/venues/:id', async () => {
    const res = await authRequest(inactiveAdminToken)
      .delete(`/api/venues/${venueAId}`);
    expect(res.status).toBe(403);
  });

  it('[ARO] Inactive admin gets 403 on POST /api/venues/:id/menu', async () => {
    const fakeImg = Buffer.from('89504e47', 'hex');
    const res = await authRequest(inactiveAdminToken)
      .post(`/api/venues/${venueAId}/menu`)
      .attach('images', fakeImg, { filename: 'menu.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('[POSITIVE] Inactive admin can still read venues — GET /api/venues/:id returns 200 or 404', async () => {
    const res = await authRequest(inactiveAdminToken).get(`/api/venues/${venueAId}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ─── INV-RDM-073: POST /api/messaging/conversations input gates + server-derived creator ─────────

describe('INV-RDM-073 — POST /api/messaging/conversations validates type-enum/title/participants/cardinality; creator server-derived', () => {
  // Fresh user for the positive-creation test — guarantees no pre-existing conversation
  // with userA (avoids the INV-RDM-070 setup creating a userA-userB conv first).
  let conv073UserId: string;
  let createdConv073Id: string | undefined;

  beforeAll(async () => {
    const { user } = await createTestUser();
    conv073UserId = user.id;
    cleanupUserIds.push(conv073UserId);
    await prisma.user.update({ where: { id: conv073UserId }, data: { status: 'ACTIVE' } });
  }, 15_000);

  afterAll(async () => {
    if (createdConv073Id) {
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: createdConv073Id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: createdConv073Id } }).catch(() => {});
    }
  }, 20_000);

  it('[AUTH] INV-RDM-073: unauthenticated caller gets 401 on POST /api/messaging/conversations', async () => {
    const res = await request(app)
      .post('/api/messaging/conversations')
      .send({ participantIds: [userBUserId] });
    expect(res.status).toBe(401);
  });

  it('[VALIDATION] INV-RDM-073: invalid type value returns 400', async () => {
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'INVALID_TYPE', participantIds: [userBUserId] });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-073: title exceeding 200 chars returns 400', async () => {
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'GROUP', title: 'x'.repeat(201), participantIds: [userBUserId] });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-073: missing participantIds field returns 400', async () => {
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'DIRECT' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-073: empty participantIds array returns 400', async () => {
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'DIRECT', participantIds: [] });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-073: non-DIRECT conversation with >50 participantIds returns 400', async () => {
    // NOTE: The user-existence check (messaging.routes.ts:262) fires before the ≤50-cap check (L279).
    // Sending 51 fake-but-valid UUIDs returns 400 from the existence guard (not the cap guard).
    // This verifies the input-gate sequence rejects oversized GROUP requests; the ≤50-cap guard
    // itself (L279) requires 50 real user fixtures to test in isolation.
    const fakeIds = Array.from({ length: 51 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'GROUP', participantIds: fakeIds });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-073: non-existent participantId returns 400', async () => {
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ participantIds: ['00000000-0000-0000-0000-000000000099'] });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-073: DIRECT conversation with != 2 participants returns 400', async () => {
    // userA (creator) + userB + partnerAUser = 3 participants for a DIRECT conv.
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'DIRECT', participantIds: [userBUserId, partnerAUserId] });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] INV-RDM-073: authenticated user creates DIRECT conversation — exactly 201 with server-derived creator as participant', async () => {
    // Uses conv073UserId (fresh, never paired with userA) so this is guaranteed to be a new
    // conversation, not an idempotent dedup. Asserts exactly 201 to exercise the create path
    // (messaging.routes.ts:314–383), not the dedup path.
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'DIRECT', participantIds: [conv073UserId] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('participants');
    // Creator (userA) must be in the participant list even though only conv073UserId was sent.
    const participantIds = (res.body.participants as Array<{ userId: string }>).map((p) => p.userId);
    expect(participantIds).toContain(userAUserId);
    createdConv073Id = res.body.id;
  });

  it('[POSITIVE] INV-RDM-073: duplicate DIRECT conv request returns 200 idempotent with alreadyExisted:true (TOCTOU dedup)', async () => {
    // After the positive test above, the userA–conv073User conversation exists.
    // A second POST for the same pair must return the existing conversation (200 + alreadyExisted:true),
    // not 201 (which would mean the Serializable dedup regressed and created a duplicate).
    const res = await authRequest(userAToken)
      .post('/api/messaging/conversations')
      .send({ type: 'DIRECT', participantIds: [conv073UserId] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    // messaging.routes.ts:363 — dedup path exclusively sets alreadyExisted:true.
    // If this is missing or false, the Serializable guard has regressed.
    expect(res.body.alreadyExisted).toBe(true);
  });
});

// ─── INV-RDM-074: GET /api/messaging/unread-count self-scope ─────────────────

describe('INV-RDM-074 — GET /api/messaging/unread-count self-scope', () => {
  let conv074Id: string;
  let user074AId: string;
  let user074AToken: string;
  let user074BId: string;
  let user074BToken: string;

  beforeAll(async () => {
    // Fresh dedicated users to enable tight count assertions — avoids shared-fixture
    // noise from other describe blocks that also use userA/userB.
    const a = await createTestUser();
    user074AId = a.user.id;
    cleanupUserIds.push(user074AId);
    user074AToken = a.accessToken;

    const b = await createTestUser();
    user074BId = b.user.id;
    cleanupUserIds.push(user074BId);
    user074BToken = b.accessToken;

    // One conversation, one message from A → B.
    const conv = await prisma.conversation.create({
      data: { type: 'DIRECT', title: 'RDM-074 unread-count test' },
    });
    conv074Id = conv.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv074Id, userId: user074AId, isActive: true },
        { conversationId: conv074Id, userId: user074BId, isActive: true },
      ],
    });

    await prisma.message.create({
      data: {
        conversationId: conv074Id,
        userId: user074AId,
        content: 'Hello from A (RDM-074)',
        type: 'TEXT',
      },
    });
  }, 20_000);

  afterAll(async () => {
    if (conv074Id) {
      await prisma.message.deleteMany({ where: { conversationId: conv074Id } }).catch(() => {});
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv074Id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv074Id } }).catch(() => {});
    }
  }, 20_000);

  it('[AUTH] INV-RDM-074: unauthenticated call gets 401', async () => {
    const res = await request(app).get('/api/messaging/unread-count');
    expect(res.status).toBe(401);
  });

  it('[XSCOPE] INV-RDM-074: fresh userB count is exactly 1 (only userA message; no foreign leakage)', async () => {
    const res = await authRequest(user074BToken).get('/api/messaging/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);
  });

  it('[XSCOPE] INV-RDM-074: outsider with no conversations gets unreadCount=0 (no foreign data leaks)', async () => {
    // Create a fresh user with no conversations to verify foreign conv data does not leak.
    const { user: outsider, accessToken: outsiderToken } = await createTestUser();
    cleanupUserIds.push(outsider.id);

    const res = await authRequest(outsiderToken).get('/api/messaging/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);
  });

  it('[XSCOPE] INV-RDM-074: after marking conversation read (lastReadAt after message), count is 0', async () => {
    // Simulate "read" by setting lastReadAt to now (after the message was created in beforeAll).
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: conv074Id, userId: user074BId },
      data: { lastReadAt: new Date() },
    });

    const res = await authRequest(user074BToken).get('/api/messaging/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);

    // Reset so the tight-count test is not affected if run after this one.
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: conv074Id, userId: user074BId },
      data: { lastReadAt: null },
    });
  });

  it('[XSCOPE] INV-RDM-074: sender (userA) own sent messages excluded — unreadCount is 0', async () => {
    // userA sent the only message in this conversation; userId:{not:userId} in the route
    // must exclude it from A's own unread count. If this predicate were removed, A would
    // see unreadCount=1 (their own sent message) — a regression this case would catch.
    const res = await authRequest(user074AToken).get('/api/messaging/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);
  });
});

// ─── INV-RDM-077: GET /api/messaging/conversations/:id/messages `before` cursor IDOR guard ──

describe('INV-RDM-077 — GET /api/messaging/conversations/:id/messages before-cursor cross-conversation IDOR guard', () => {
  // conv077A: conversation where userA is a participant; used as the target of all fetches.
  // conv077B: second conversation where userA is also a participant; used only to obtain
  //           a messageId that belongs to a DIFFERENT conversation (the cross-scope cursor).
  let conv077AId: string;
  let conv077BId: string;
  let msg077AId: string; // message in conv A — valid cursor for case 5
  let msg077BId: string; // message in conv B — cross-conversation cursor for case 2

  beforeAll(async () => {
    // ── conv077A ──────────────────────────────────────────────────────────────
    const convA = await prisma.conversation.create({
      data: { type: 'DIRECT', title: 'RDM-077 conv A' },
    });
    conv077AId = convA.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv077AId, userId: userAUserId, isActive: true },
        { conversationId: conv077AId, userId: userBUserId, isActive: true },
      ],
    });

    // Seed a message in conv A (needed for case 5 — valid cursor).
    const msgA = await prisma.message.create({
      data: {
        conversationId: conv077AId,
        userId: userAUserId,
        content: 'Seed message in conv A (RDM-077)',
        type: 'TEXT',
      },
    });
    msg077AId = msgA.id;

    // ── conv077B ──────────────────────────────────────────────────────────────
    const convB = await prisma.conversation.create({
      data: { type: 'DIRECT', title: 'RDM-077 conv B' },
    });
    conv077BId = convB.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv077BId, userId: userAUserId, isActive: true },
        { conversationId: conv077BId, userId: userBUserId, isActive: true },
      ],
    });

    // Seed a message in conv B — this ID will be supplied as the `before` cursor
    // when fetching conv A (the cross-conversation IDOR attempt).
    const msgB = await prisma.message.create({
      data: {
        conversationId: conv077BId,
        userId: userAUserId,
        content: 'Seed message in conv B (RDM-077)',
        type: 'TEXT',
      },
    });
    msg077BId = msgB.id;
  }, 20_000);

  afterAll(async () => {
    // Clean up messages first (FK), then participants, then conversations.
    if (conv077AId) {
      await prisma.message.deleteMany({ where: { conversationId: conv077AId } }).catch(() => {});
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv077AId } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv077AId } }).catch(() => {});
    }
    if (conv077BId) {
      await prisma.message.deleteMany({ where: { conversationId: conv077BId } }).catch(() => {});
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv077BId } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv077BId } }).catch(() => {});
    }
  }, 20_000);

  it('[AUTH] INV-RDM-077: unauthenticated call gets 401', async () => {
    // No token — authenticate middleware must reject before the cursor guard is reached.
    const res = await request(app).get(`/api/messaging/conversations/${conv077AId}/messages`);
    expect(res.status).toBe(401);
  });

  it('[XSCOPE] INV-RDM-077: participant supplies before cursor from a different conversation — 400', async () => {
    // userA IS a participant in conv077A so assertParticipant passes (→ no 403).
    // The cursor (msg077BId) belongs to conv077B, not conv077A.
    // messaging.routes.ts:528–535: findFirst({ where: { id: before, conversationId: id } })
    // returns null → AppError 400 "Cursor message not found".
    const res = await authRequest(userAToken)
      .get(`/api/messaging/conversations/${conv077AId}/messages`)
      .query({ before: msg077BId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cursor message not found/i);
  });

  it('[VALIDATION] INV-RDM-077: participant supplies a random UUID before cursor (no such message) — 400', async () => {
    // A cursor that does not exist anywhere must also be rejected with 400.
    const nonExistentId = '00000000-0000-4000-a000-000000000099';
    const res = await authRequest(userAToken)
      .get(`/api/messaging/conversations/${conv077AId}/messages`)
      .query({ before: nonExistentId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cursor message not found/i);
  });

  it('[POSITIVE] INV-RDM-077: participant fetches with no cursor — 200 with data array and hasMore boolean', async () => {
    // No `before` param — baseline fetch proving the route itself works for this user.
    const res = await authRequest(userAToken).get(`/api/messaging/conversations/${conv077AId}/messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.hasMore).toBe('boolean');
  });

  it('[POSITIVE] INV-RDM-077: participant fetches with valid before cursor from THIS conversation — 200 empty page', async () => {
    // msg077AId is the only message in conv077A. cursor + skip:1 must return an empty page.
    // The guard passes (same-conv cursor) and hasMore must be false.
    const res = await authRequest(userAToken)
      .get(`/api/messaging/conversations/${conv077AId}/messages`)
      .query({ before: msg077AId });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
    expect(res.body.hasMore).toBe(false);
  });
});

// ─── INV-RDM-079: Partner-status terminal-state guard (409) ──────────────────

describe('INV-RDM-079 — PATCH /api/bookings/partner/:id/status rejects transitions from terminal states', () => {
  let partnerA079PartnerId: string;
  let booking079CancelledId: string;
  let booking079CompletedId: string;
  let booking079NoShowId: string;
  let booking079PendingId: string;

  beforeAll(async () => {
    const partnerA = await prisma.partner.findFirstOrThrow({ where: { userId: partnerAUserId } });
    partnerA079PartnerId = partnerA.id;

    const makeBooking = (status: string) => prisma.booking.create({
      data: {
        userId: userAUserId,
        partnerId: partnerA079PartnerId,
        venueId: venueAId,
        bookingDate: new Date(Date.now() + 86400000),
        bookingTime: '18:00',
        guestCount: 2,
        confirmationCode: `RDM079-${status}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status,
      },
      select: { id: true },
    });

    booking079CancelledId = (await makeBooking('CANCELLED')).id;
    booking079CompletedId = (await makeBooking('COMPLETED')).id;
    booking079NoShowId = (await makeBooking('NO_SHOW')).id;
    booking079PendingId = (await makeBooking('PENDING')).id;
  }, 15_000);

  afterAll(async () => {
    for (const id of [booking079CancelledId, booking079CompletedId, booking079NoShowId, booking079PendingId]) {
      if (id) await prisma.booking.delete({ where: { id } }).catch(() => {});
    }
  });

  it('[LIFECYCLE] INV-RDM-079: PATCH partner/:id/status on CANCELLED booking returns 409', async () => {
    const res = await authRequest(partnerAToken)
      .patch(`/api/bookings/partner/${booking079CancelledId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-079: PATCH partner/:id/status on COMPLETED booking returns 409', async () => {
    const res = await authRequest(partnerAToken)
      .patch(`/api/bookings/partner/${booking079CompletedId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-079: PATCH partner/:id/status on NO_SHOW booking returns 409', async () => {
    const res = await authRequest(partnerAToken)
      .patch(`/api/bookings/partner/${booking079NoShowId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] INV-RDM-079: PATCH partner/:id/status on PENDING booking succeeds (200)', async () => {
    const res = await authRequest(partnerAToken)
      .patch(`/api/bookings/partner/${booking079PendingId}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONFIRMED');
  });
});

// ─── INV-RDM-080: Owner booking mutation restricted to non-terminal state ─────

describe('INV-RDM-080 — PATCH/DELETE /api/bookings/:id restricted to non-terminal state', () => {
  let partnerA080PartnerId: string;
  let booking080PendingPatchId: string;
  let booking080ConfirmedId: string;
  let booking080CancelledId: string;
  let booking080CompletedId: string;
  let booking080NoShowId: string;
  let booking080PendingDeleteId: string;

  beforeAll(async () => {
    const partnerA = await prisma.partner.findFirstOrThrow({ where: { userId: partnerAUserId } });
    partnerA080PartnerId = partnerA.id;

    const makeBooking = (status: string, tag: string) => prisma.booking.create({
      data: {
        userId: userAUserId,
        partnerId: partnerA080PartnerId,
        venueId: venueAId,
        bookingDate: new Date(Date.now() + 86400000),
        bookingTime: '20:00',
        guestCount: 2,
        confirmationCode: `RDM080-${tag}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status,
      },
      select: { id: true },
    });

    booking080PendingPatchId = (await makeBooking('PENDING', 'PPATCH')).id;
    booking080ConfirmedId = (await makeBooking('CONFIRMED', 'CONF')).id;
    booking080CancelledId = (await makeBooking('CANCELLED', 'CANC')).id;
    booking080CompletedId = (await makeBooking('COMPLETED', 'COMP')).id;
    booking080NoShowId = (await makeBooking('NO_SHOW', 'NOSH')).id;
    booking080PendingDeleteId = (await makeBooking('PENDING', 'PDEL')).id;
  }, 15_000);

  afterAll(async () => {
    for (const id of [booking080PendingPatchId, booking080ConfirmedId, booking080CancelledId, booking080CompletedId, booking080NoShowId, booking080PendingDeleteId]) {
      if (id) await prisma.booking.delete({ where: { id } }).catch(() => {});
    }
  });

  it('[LIFECYCLE] INV-RDM-080: PATCH /api/bookings/:id on CONFIRMED booking returns 409 (PENDING-only guard)', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/bookings/${booking080ConfirmedId}`)
      .send({ guestCount: 5 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-080: PATCH /api/bookings/:id on CANCELLED booking returns 409 (PENDING-only guard)', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/bookings/${booking080CancelledId}`)
      .send({ guestCount: 5 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-080: PATCH /api/bookings/:id on COMPLETED booking returns 409 (PENDING-only guard)', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/bookings/${booking080CompletedId}`)
      .send({ guestCount: 5 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-080: PATCH /api/bookings/:id on NO_SHOW booking returns 409 (PENDING-only guard)', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/bookings/${booking080NoShowId}`)
      .send({ guestCount: 5 });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] INV-RDM-080: PATCH /api/bookings/:id on PENDING booking succeeds (200)', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/bookings/${booking080PendingPatchId}`)
      .send({ guestCount: 4 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.guestCount).toBe(4);
  });

  it('[LIFECYCLE] INV-RDM-080: DELETE /api/bookings/:id on CANCELLED booking returns 409', async () => {
    const res = await authRequest(userAToken).delete(`/api/bookings/${booking080CancelledId}`);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-080: DELETE /api/bookings/:id on COMPLETED booking returns 409', async () => {
    const res = await authRequest(userAToken).delete(`/api/bookings/${booking080CompletedId}`);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[LIFECYCLE] INV-RDM-080: DELETE /api/bookings/:id on NO_SHOW booking returns 409', async () => {
    const res = await authRequest(userAToken).delete(`/api/bookings/${booking080NoShowId}`);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] INV-RDM-080: DELETE /api/bookings/:id on PENDING booking succeeds (200, status set to CANCELLED)', async () => {
    const res = await authRequest(userAToken).delete(`/api/bookings/${booking080PendingDeleteId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CANCELLED');
  });
});

// ─── INV-RDM-075: POST /api/messaging/conversations/:id/messages input gates ──

describe('INV-RDM-075 — POST /api/messaging/conversations/:id/messages validates content gate (required/non-empty/≤10000/type-enum)', () => {
  // Dedicated conversation so positive-control cases create real messages without
  // polluting the shared fixtures used by INV-RDM-070/074/077.
  let conv075Id: string;
  const createdMsg075Ids: string[] = [];

  beforeAll(async () => {
    const conv = await prisma.conversation.create({
      data: { type: 'DIRECT', title: 'RDM-075 message-send input gate test' },
    });
    conv075Id = conv.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv075Id, userId: userAUserId, isActive: true },
        { conversationId: conv075Id, userId: userBUserId, isActive: true },
      ],
    });
  }, 15_000);

  afterAll(async () => {
    if (conv075Id) {
      if (createdMsg075Ids.length > 0) {
        await prisma.message.deleteMany({ where: { id: { in: createdMsg075Ids } } }).catch(() => {});
      }
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv075Id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv075Id } }).catch(() => {});
    }
  }, 20_000);

  it('[AUTH] INV-RDM-075: unauthenticated caller gets 401', async () => {
    const fakeConvId = '00000000-0000-4000-a000-000000000075';
    const res = await request(app)
      .post(`/api/messaging/conversations/${fakeConvId}/messages`)
      .send({ content: 'hello' });
    expect(res.status).toBe(401);
  });

  it('[VALIDATION] INV-RDM-075: missing content field returns 400', async () => {
    // Content gate fires before assertParticipant — any authenticated caller triggers it.
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-075: empty string content returns 400', async () => {
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-075: whitespace-only content returns 400', async () => {
    // messaging.routes.ts:578 — content.trim() === '' guard catches whitespace-only strings.
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-075: content exceeding 10000 chars returns 400', async () => {
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: 'x'.repeat(10001) });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] INV-RDM-075: content at exactly 10000 chars is accepted — 201 (boundary)', async () => {
    // messaging.routes.ts:579 — guard is `> 10000`, so exactly 10000 must succeed.
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: 'x'.repeat(10000) });
    expect(res.status).toBe(201);
    if (res.body.id) createdMsg075Ids.push(res.body.id);
  });

  it('[VALIDATION] INV-RDM-075: invalid type enum value returns 400', async () => {
    // messaging.routes.ts:584 — type must be in MESSAGE_TYPES (TEXT/IMAGE/FILE/SYSTEM).
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: 'valid content', type: 'INVALID_TYPE' });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] INV-RDM-075: participant sends valid content without type — 201 with server-set type TEXT', async () => {
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: 'Valid message for RDM-075 (default type)' });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('TEXT');
    expect(res.body.content).toBe('Valid message for RDM-075 (default type)');
    if (res.body.id) createdMsg075Ids.push(res.body.id);
  });

  it('[POSITIVE] INV-RDM-075: participant sends valid content with explicit type IMAGE — 201', async () => {
    // Confirms that non-TEXT valid enum values are accepted (the guard only rejects unknowns).
    const res = await authRequest(userAToken)
      .post(`/api/messaging/conversations/${conv075Id}/messages`)
      .send({ content: 'https://example.com/image.jpg', type: 'IMAGE' });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('IMAGE');
    if (res.body.id) createdMsg075Ids.push(res.body.id);
  });
});

// ─── INV-RDM-076: PATCH /api/messaging/messages/:messageId input + lifecycle gates ──

describe('INV-RDM-076 — PATCH /api/messaging/messages/:messageId validates edit payload and rejects deleted/non-TEXT messages', () => {
  let conv076Id: string;
  let msg076TextId: string;    // editable TEXT message by userA (positive case + content validation)
  let msg076DeletedId: string; // soft-deleted TEXT message by userA (delete-reject case)
  let msg076ImageId: string;   // IMAGE message by userA (non-TEXT reject case)

  beforeAll(async () => {
    const conv = await prisma.conversation.create({
      data: { type: 'DIRECT', title: 'RDM-076 message-edit gate test' },
    });
    conv076Id = conv.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv076Id, userId: userAUserId, isActive: true },
        { conversationId: conv076Id, userId: userBUserId, isActive: true },
      ],
    });

    // Three messages owned by userA covering all lifecycle states needed.
    const textMsg = await prisma.message.create({
      data: { conversationId: conv076Id, userId: userAUserId, content: 'Editable TEXT (RDM-076)', type: 'TEXT' },
    });
    msg076TextId = textMsg.id;

    const deletedMsg = await prisma.message.create({
      data: {
        conversationId: conv076Id,
        userId: userAUserId,
        content: 'Soft-deleted TEXT (RDM-076)',
        type: 'TEXT',
        deletedAt: new Date(),
      },
    });
    msg076DeletedId = deletedMsg.id;

    const imageMsg = await prisma.message.create({
      data: { conversationId: conv076Id, userId: userAUserId, content: 'IMAGE type (RDM-076)', type: 'IMAGE' },
    });
    msg076ImageId = imageMsg.id;
  }, 20_000);

  afterAll(async () => {
    if (conv076Id) {
      await prisma.message.deleteMany({ where: { conversationId: conv076Id } }).catch(() => {});
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv076Id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv076Id } }).catch(() => {});
    }
  }, 20_000);

  it('[AUTH] INV-RDM-076: unauthenticated caller gets 401', async () => {
    const fakeMsgId = '00000000-0000-4000-a000-000000000076';
    const res = await request(app)
      .patch(`/api/messaging/messages/${fakeMsgId}`)
      .send({ content: 'updated' });
    expect(res.status).toBe(401);
  });

  it('[VALIDATION] INV-RDM-076: missing content field returns 400 (fires before message lookup)', async () => {
    // messaging.routes.ts:620 — content gate fires before prisma.message.findUnique,
    // so a non-existent message ID is safe to use here.
    const fakeMsgId = '00000000-0000-4000-a000-000000000076';
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${fakeMsgId}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-076: empty content returns 400', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076TextId}`)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-076: whitespace-only content returns 400', async () => {
    // messaging.routes.ts:620 — `content.trim() === ''` is a distinct branch from `!content`.
    // INV-RDM-075 already tests this; must also be covered for the edit path.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076TextId}`)
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-076: content exceeding 10000 chars returns 400', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076TextId}`)
      .send({ content: 'z'.repeat(10001) });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] INV-RDM-076: content at exactly 10000 chars is accepted — 200 (boundary)', async () => {
    // messaging.routes.ts:623 — guard is `> 10000`, so exactly 10000 must succeed.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076TextId}`)
      .send({ content: 'y'.repeat(10000) });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('y'.repeat(10000));
  });

  it('[VALIDATION] INV-RDM-076: editing a soft-deleted message returns 400', async () => {
    // messaging.routes.ts:640 — deletedAt !== null gate.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076DeletedId}`)
      .send({ content: 'trying to revive a deleted message' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-076: editing a non-TEXT (IMAGE) message returns 400', async () => {
    // messaging.routes.ts:643 — type !== TEXT gate; only TEXT messages are editable.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076ImageId}`)
      .send({ content: 'trying to edit an image message' });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] INV-RDM-076: author edits own TEXT message with valid content — 200 with updated content and isEdited:true', async () => {
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/messages/${msg076TextId}`)
      .send({ content: 'Edited content (RDM-076 positive)' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Edited content (RDM-076 positive)');
    expect(res.body.isEdited).toBe(true);
  });
});

// ─── INV-RDM-078: PATCH /api/messaging/conversations/:id title gate ──────────

describe('INV-RDM-078 — PATCH /api/messaging/conversations/:id validates title field (missing/blank/>200 → 400)', () => {
  let conv078Id: string;

  beforeAll(async () => {
    const conv = await prisma.conversation.create({
      data: { type: 'DIRECT', title: 'RDM-078 title-update gate test' },
    });
    conv078Id = conv.id;

    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv078Id, userId: userAUserId, isActive: true },
        { conversationId: conv078Id, userId: userBUserId, isActive: true },
      ],
    });
  }, 15_000);

  afterAll(async () => {
    if (conv078Id) {
      await prisma.conversationParticipant.deleteMany({ where: { conversationId: conv078Id } }).catch(() => {});
      await prisma.conversation.delete({ where: { id: conv078Id } }).catch(() => {});
    }
  }, 20_000);

  it('[AUTH] INV-RDM-078: unauthenticated caller gets 401', async () => {
    const fakeConvId = '00000000-0000-4000-a000-000000000078';
    const res = await request(app)
      .patch(`/api/messaging/conversations/${fakeConvId}`)
      .send({ title: 'new title' });
    expect(res.status).toBe(401);
  });

  it('[VALIDATION] INV-RDM-078: missing title field returns 400 ("at least one field must be provided")', async () => {
    // messaging.routes.ts:435 — title === undefined guard fires after assertParticipant.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/conversations/${conv078Id}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-078: blank (whitespace-only) title returns 400', async () => {
    // messaging.routes.ts:439 — title.trim().length === 0 guard.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/conversations/${conv078Id}`)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('[VALIDATION] INV-RDM-078: title exceeding 200 chars returns 400', async () => {
    // messaging.routes.ts:444 — title.length > 200 guard.
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/conversations/${conv078Id}`)
      .send({ title: 'T'.repeat(201) });
    expect(res.status).toBe(400);
  });

  it('[POSITIVE] INV-RDM-078: title at exactly 200 chars is accepted — 200 (boundary)', async () => {
    // messaging.routes.ts:444 — guard is `> 200`, so exactly 200 must succeed.
    const exactTitle = 'T'.repeat(200);
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/conversations/${conv078Id}`)
      .send({ title: exactTitle });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(exactTitle);
  });

  it('[POSITIVE] INV-RDM-078: participant updates title with valid value — 200 with updated title', async () => {
    const newTitle = 'Updated title (RDM-078 positive)';
    const res = await authRequest(userAToken)
      .patch(`/api/messaging/conversations/${conv078Id}`)
      .send({ title: newTitle });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(newTitle);
  });
});
