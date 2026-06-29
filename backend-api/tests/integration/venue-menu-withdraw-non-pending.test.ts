/**
 * INV-RDM-023: POST /api/venues/:id/menu/withdraw returns 400 if menu not in PENDING state
 *
 * BC-REDEMPTION-RDM-023-2
 *
 * Validates that POST /api/venues/:id/menu/withdraw returns 400 when the
 * venue's menuStatus is NONE, APPROVED, or REJECTED, and returns 200 when
 * the status is PENDING (the only valid state for withdrawal).
 *
 * Route guards: authenticate → authorize(PARTNER/ADMIN/SUPER_ADMIN) →
 * requireActiveAdmin → requireActivePartnerForWritesAuthed →
 * assertPartnerOwnsVenue. A PARTNER user is used so the ownership check is
 * exercised on the real code-path.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

let partnerToken: string;
let partnerUserId: string;
let testPartnerId: string;
let testVenueId: string;

beforeAll(async () => {
  const partnerRegistered = await createTestUser();
  partnerUserId = partnerRegistered.user.id;
  await prisma.user.update({
    where: { id: partnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      businessName: `RDM-023 Test Partner ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      discountRate: 5,
    },
  });
  testPartnerId = partner.id;

  const venue = await prisma.venue.create({
    data: {
      partnerId: testPartnerId,
      name: 'RDM-023 Test Venue',
      address: '1 Test Street',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
    },
  });
  testVenueId = venue.id;

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: partnerRegistered.email, password: partnerRegistered.password, clientType: 'web' });
  if (loginRes.status !== 200) {
    throw new Error(`RDM-023 setup: partner login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }
  partnerToken = loginRes.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  if (testVenueId) {
    try { await prisma.venue.delete({ where: { id: testVenueId } }); } catch {}
  }
  if (testPartnerId) {
    try { await prisma.partner.delete({ where: { id: testPartnerId } }); } catch {}
  }
  if (partnerUserId) {
    try { await cleanupTestUser(partnerUserId); } catch {}
  }
}, 30_000);

// ─── INV-RDM-023 ─────────────────────────────────────────────────────────────

describe('INV-RDM-023 — POST /api/venues/:id/menu/withdraw returns 400 if menu not in PENDING state', () => {
  it('[INPUT] INV-RDM-023: status=NONE → 400', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuStatus: 'NONE', pendingMenuUrl: null, menuUrl: null },
    });
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/withdraw`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No pending submission to withdraw');
  });

  it('[INPUT] INV-RDM-023: status=APPROVED → 400', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuStatus: 'APPROVED', pendingMenuUrl: null, menuUrl: 'https://example.com/menu' },
    });
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/withdraw`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No pending submission to withdraw');
  });

  it('[INPUT] INV-RDM-023: status=REJECTED → 400', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuStatus: 'REJECTED', pendingMenuUrl: null, menuUrl: null, menuRejectionReason: 'Bad link' },
    });
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/withdraw`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No pending submission to withdraw');
  });

  it('[POSITIVE] INV-RDM-023: status=PENDING, no prior menuUrl → reverts to NONE, clears menuSubmittedAt', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: {
        menuStatus: 'PENDING',
        pendingMenuUrl: 'https://example.com/pending-menu',
        menuUrl: null,
        menuRejectionReason: null,
        menuSubmittedAt: new Date(),
      },
    });
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/withdraw`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.menuStatus).toBe('NONE');
    expect(res.body.data.menuUrl).toBeNull();
    expect(res.body.data.menuSubmittedAt).toBeNull();
    const dbRow = await prisma.venue.findUnique({ where: { id: testVenueId }, select: { pendingMenuUrl: true, menuRejectionReason: true } });
    expect(dbRow!.pendingMenuUrl).toBeNull();
    expect(dbRow!.menuRejectionReason).toBeNull();
  });

  it('[POSITIVE] INV-RDM-023: status=PENDING with prior menuUrl → reverts to APPROVED, preserves menuUrl', async () => {
    const approvedUrl = 'https://example.com/approved-menu';
    const seededSubmittedAt = new Date('2026-01-15T10:00:00.000Z');
    await prisma.venue.update({
      where: { id: testVenueId },
      data: {
        menuStatus: 'PENDING',
        pendingMenuUrl: 'https://example.com/new-pending-menu',
        menuUrl: approvedUrl,
        menuRejectionReason: null,
        menuSubmittedAt: seededSubmittedAt,
      },
    });
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/withdraw`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.menuStatus).toBe('APPROVED');
    expect(res.body.data.menuUrl).toBe(approvedUrl);
    expect(new Date(res.body.data.menuSubmittedAt).getTime()).toBe(seededSubmittedAt.getTime());
    const dbRow = await prisma.venue.findUnique({ where: { id: testVenueId }, select: { pendingMenuUrl: true, menuRejectionReason: true } });
    expect(dbRow!.pendingMenuUrl).toBeNull();
    expect(dbRow!.menuRejectionReason).toBeNull();
  });
});
