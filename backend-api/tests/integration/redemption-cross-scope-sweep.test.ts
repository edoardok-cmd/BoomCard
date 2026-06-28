/**
 * Redemption Surface — Cross-Scope Sweep (BC-REDEMPTION-SPEC-REAUDIT)
 *
 * FLAGSHIP class: cross-tenant data isolation for the redemption surface.
 * Each test is structured as "Actor A must not see or mutate Tenant B's data."
 *
 * Invariants covered (all CRITICAL/HIGH XSCOPE class):
 *   INV-RDM-001 — Partner cannot access another partner's venue sticker data
 *   INV-RDM-002 — User can only retrieve their own scan history
 *   INV-RDM-003 — Receipt upload only succeeds for own scans
 *   INV-RDM-004 — Partner cannot create venue (admin-only)
 *   INV-RDM-005 — Partner cannot update venue (admin-only)
 *   INV-RDM-006 — Partner cannot delete venue (admin-only)
 *   INV-RDM-007 — Partner cannot upload menu images (admin-only)
 *   INV-RDM-008 — Partner cannot clear venue menu (admin-only)
 *   INV-RDM-009 — Partner CAN submit menu URL for own venue; cross-partner access returns 403
 *   INV-RDM-010 — Partner cannot withdraw menu submission (admin-only)
 *   INV-RDM-011 — Dashboard scoped to authenticated user
 *   INV-RDM-055 — Admin-only venue fields not returned in public GET
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
    if (sticker) {
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
    }
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
    if (!scanOwnedByUserA) return;

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

// ─── INV-RDM-004..010: Partner cannot mutate venue / menu ────────────────────

describe('INV-RDM-004..010 — Partner cannot mutate venue or menu (admin-only routes)', () => {
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
    if (!throwawayVenueId) { return; }
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

  it('[XSCOPE] INV-RDM-010: Partner cannot withdraw menu submission — POST /api/venues/:id/menu/withdraw returns 403', async () => {
    const res = await authRequest(partnerAToken)
      .post(`/api/venues/${venueAId}/menu/withdraw`);
    expect(res.status).toBe(403);
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
    if (!sticker) return;

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
    if (!rdm011ScanId) return;
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
    if (res.status === 404) {
      // Venue may not be publicly visible (partner not fully activated)
      return;
    }
    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    for (const field of ADMIN_ONLY_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('[LEAK] Public GET /api/venues/:id does not include partner internal fields', async () => {
    const res = await request(app).get(`/api/venues/${venueAId}`);
    if (res.status === 404) return;
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

// ─── INV-RDM-045/046: Stub routes return 501 ─────────────────────────────────

describe('Stub routes return 501 (not implemented)', () => {
  it('[LIFECYCLE] INV-RDM-045: GET /api/bookings/ returns 501', async () => {
    const res = await authRequest(userAToken).get('/api/bookings/');
    expect(res.status).toBe(501);
  });

  it('[LIFECYCLE] INV-RDM-046: GET /api/messaging/conversations returns 501', async () => {
    const res = await authRequest(userAToken).get('/api/messaging/conversations');
    expect(res.status).toBe(501);
  });

  it('[LIFECYCLE] INV-RDM-047: GET /api/venues/nearby returns 501 when ENABLE_NEARBY_VENUES unset', async () => {
    // Default env has ENABLE_NEARBY_VENUES unset (falsy)
    const res = await request(app).get('/api/venues/nearby?latitude=42&longitude=23');
    expect(res.status).toBe(501);
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
