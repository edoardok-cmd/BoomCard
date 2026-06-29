/**
 * INV-RDM-021: POST /api/venues/:id/menu/submit rejects URL >2048 chars with 400
 *
 * BC-REDEMPTION-RDM-021-2
 *
 * Validates that the POST /api/venues/:id/menu/submit endpoint:
 *   - Returns 400 when url is missing / empty
 *   - Returns 400 when url exceeds 2048 characters
 *   - Returns 400 when url is exactly 2049 characters
 *   - Returns 200 when url is exactly 2048 characters (boundary)
 *   - Returns 400 when url is not a valid URL
 *   - Returns 400 when url uses a non-http/https scheme
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
let partnerId: string;
let venueId: string;

beforeAll(async () => {
  const registered = await createTestUser();
  partnerUserId = registered.user.id;

  await prisma.user.update({
    where: { id: partnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      businessName: `RDM-021 Test Partner ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      discountRate: 5,
    },
  });
  partnerId = partner.id;

  const venue = await prisma.venue.create({
    data: {
      partnerId,
      name: 'RDM-021 Test Venue',
      address: '1 Test Street',
      city: 'Sofia',
    },
  });
  venueId = venue.id;

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: registered.email, password: registered.password, clientType: 'web' });
  if (loginRes.status !== 200) {
    throw new Error(`Partner login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }
  partnerToken = loginRes.body.data.accessToken;
}, 30_000);

afterAll(async () => {
  try { await prisma.venue.delete({ where: { id: venueId } }); } catch {}
  try { await prisma.partner.delete({ where: { id: partnerId } }); } catch {}
  try { await cleanupTestUser(partnerUserId); } catch {}
}, 30_000);

describe('INV-RDM-021 — POST /api/venues/:id/menu/submit rejects URL >2048 chars with 400', () => {
  function buildUrl(length: number): string {
    // Build a valid http URL of exactly `length` characters.
    // Base: "http://a.com/" (13 chars), pad the path with "x" chars.
    const base = 'http://a.com/';
    const pad = 'x'.repeat(Math.max(0, length - base.length));
    return base + pad;
  }

  it('[INPUT] missing url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] empty string url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] url exactly 2049 chars → 400', async () => {
    const url = buildUrl(2049);
    expect(url.length).toBe(2049);
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] url longer than 2048 chars → 400', async () => {
    const url = buildUrl(3000);
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] invalid url (not parseable) → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] ftp:// url (non-http scheme) → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'ftp://example.com/menu.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] valid url exactly 2048 chars → 200', async () => {
    const url = buildUrl(2048);
    expect(url.length).toBe(2048);
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('[POSITIVE] valid short url → 200', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'https://example.com/menu' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
