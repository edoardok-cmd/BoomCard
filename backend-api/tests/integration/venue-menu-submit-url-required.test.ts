/**
 * INV-RDM-020: POST /api/venues/:id/menu/submit rejects empty/missing URL with 400
 *
 * BC-REDEMPTION-RDM-020-2
 *
 * Validates that POST /api/venues/:id/menu/submit returns 400 when `url` is
 * absent, an empty string, or whitespace-only, and returns 200 when a valid
 * https URL is provided.
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
      businessName: `RDM-020 Test Partner ${Date.now()}`,
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
      name: 'RDM-020 Test Venue',
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
    throw new Error(`RDM-020 setup: partner login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
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

// ─── INV-RDM-020 ─────────────────────────────────────────────────────────────

describe('INV-RDM-020 — POST /api/venues/:id/menu/submit rejects empty/missing URL with 400', () => {
  it('[INPUT] INV-RDM-020: missing url field → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-020: empty string url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-020: whitespace-only url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-020: non-string url (number) → 400, not 500', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 0 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] INV-RDM-020: valid https url → 200', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'https://example.com/menu' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
