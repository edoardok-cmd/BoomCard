/**
 * INV-RDM-022: POST /api/venues/:id/menu/submit rejects non-http(s) URL with 400
 *
 * BC-REDEMPTION-RDM-022-2
 *
 * Validates that the POST /api/venues/:id/menu/submit endpoint:
 *   - Returns 400 when url uses ftp:// scheme
 *   - Returns 400 when url uses file:// scheme
 *   - Returns 400 when url uses javascript: scheme
 *   - Returns 400 when url uses mailto: scheme
 *   - Returns 400 when url uses data: scheme
 *   - Returns 200 when url uses http:// scheme (positive)
 *   - Returns 200 when url uses https:// scheme (positive)
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
      businessName: `RDM-022 Test Partner ${Date.now()}`,
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
      name: 'RDM-022 Test Venue',
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

describe('INV-RDM-022 — POST /api/venues/:id/menu/submit rejects non-http(s) URL with 400', () => {
  it('[INPUT] ftp:// url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'ftp://example.com/menu.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] file:// url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] javascript: url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] mailto: url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'mailto:info@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] data: url → 400', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'data:text/html,<h1>hi</h1>' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] http:// url → 200', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'http://example.com/menu' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pendingMenuUrl).toBeUndefined();
    expect(res.body.data.menuRejectionReason).toBeUndefined();
  });

  it('[POSITIVE] https:// url → 200', async () => {
    const res = await request(app)
      .post(`/api/venues/${venueId}/menu/submit`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ url: 'https://example.com/menu' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pendingMenuUrl).toBeUndefined();
    expect(res.body.data.menuRejectionReason).toBeUndefined();
  });
});
