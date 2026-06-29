/**
 * INV-RDM-024: POST /api/venues/:id/menu enforces 100-image cap per venue
 *
 * BC-REDEMPTION-RDM-024-2
 *
 * Validates that the image-upload route rejects a batch that would push the
 * total count of stored menu images past 100, and accepts one that keeps it
 * at or below 100.
 *
 * imageUploadService is mocked so no real S3/R2 traffic is generated.
 * Runtime: backend against boomcard_test DB (NODE_ENV=test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: jest.fn(async (_params: any) => ({
      url: `https://cdn.example.com/menu-${Math.random().toString(36).slice(2)}.jpg`,
      key: 'test-key',
      size: 1024,
    })),
  },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: (_opts: any) => Promise.resolve() },
}));

let adminToken: string;
let adminUserId: string;
let partnerUserId: string;
let testPartnerId: string;
let testVenueId: string;

function makeExistingImages(count: number): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => `https://cdn.example.com/existing-${i}.jpg`),
  );
}

beforeAll(async () => {
  const adminRegistered = await createTestUser();
  adminUserId = adminRegistered.user.id;
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminRegistered.email, password: adminRegistered.password, clientType: 'web' });
  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }
  adminToken = loginRes.body.data.accessToken;

  const partnerRegistered = await createTestUser();
  partnerUserId = partnerRegistered.user.id;
  await prisma.user.update({
    where: { id: partnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      businessName: `RDM-024 Cap Test Partner ${Date.now()}`,
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
      name: `RDM-024 Cap Test Venue ${Date.now()}`,
      address: '1 Cap Test Street',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
    },
  });
  testVenueId = venue.id;
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
  if (adminUserId) {
    try { await cleanupTestUser(adminUserId); } catch {}
  }
}, 30_000);

// ─── INV-RDM-024: 100-image cap ──────────────────────────────────────────────

describe('INV-RDM-024 — POST /api/venues/:id/menu enforces 100-image cap', () => {
  const fakeImg = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header bytes

  beforeEach(async () => {
    // Reset menuImages to empty before each test so cases are independent.
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuImages: null },
    });
  });

  it('[INPUT] venue already at 100 images → uploading 1 more returns 400 with cap error', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuImages: makeExistingImages(100) },
    });

    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', fakeImg, { filename: 'extra.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/100/);
  });

  it('[INPUT] venue at 99 images → uploading 2 more (total 101) returns 400', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuImages: makeExistingImages(99) },
    });

    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', fakeImg, { filename: 'img1.png', contentType: 'image/png' })
      .attach('images', fakeImg, { filename: 'img2.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/100/);
  });

  it('[POSITIVE] venue at 99 images → uploading 1 more (total 100) returns 200', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuImages: makeExistingImages(99) },
    });

    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', fakeImg, { filename: 'ok.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.menuImages).toHaveLength(100);
  });

  it('[POSITIVE] venue at 0 images → uploading 1 returns 200', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', fakeImg, { filename: 'first.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uploaded).toBe(1);
  });

  it('[POSITIVE] venue with malformed menuImages JSON → fallback to 0 existing → upload succeeds', async () => {
    await prisma.venue.update({
      where: { id: testVenueId },
      data: { menuImages: 'not-valid-json' as any },
    });

    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', fakeImg, { filename: 'ok.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uploaded).toBe(1);
  });

  it('[INPUT] uploading a file with disallowed MIME type → multer discards file → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${testVenueId}/menu`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('images', fakeImg, { filename: 'malware.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
