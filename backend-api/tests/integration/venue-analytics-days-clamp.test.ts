/**
 * INV-RDM-028-2: GET /api/stickers/venue/:venueId/analytics clamps days to [1, 365]
 *
 * BC-REDEMPTION-RDM-028-2
 *
 * Validates that the days query parameter is clamped to the [1, 365] range:
 *   - omitted     → HTTP 200, period.days = 30 (default)
 *   - days=0      → HTTP 200, period.days = 30 (falsy, treated as default)
 *   - days=-1     → HTTP 200, period.days = 1  (clamped to minimum)
 *   - days=1      → HTTP 200, period.days = 1  (minimum honoured)
 *   - days=365    → HTTP 200, period.days = 365 (maximum honoured)
 *   - days=400    → HTTP 200, period.days = 365 (capped to maximum)
 *
 * Runtime: NODE_ENV=test, DATABASE_URL → boomcard_test (from .env.test).
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
      businessName: `RDM-028-2 Test Partner ${Date.now()}`,
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
      name: 'RDM-028-2 Test Venue',
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
  try { await prisma.venueStickerConfig.deleteMany({ where: { venueId } }); } catch {}
  try { await prisma.venue.delete({ where: { id: venueId } }); } catch {}
  try { await prisma.partner.delete({ where: { id: partnerId } }); } catch {}
  try { await cleanupTestUser(partnerUserId); } catch {}
  await prisma.$disconnect();
}, 30_000);

describe('INV-RDM-028-2 — GET /api/stickers/venue/:venueId/analytics days clamped to [1, 365]', () => {
  it('[INPUT] days omitted → 200, period.days = 30 (default)', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period.days).toBe(30);
  });

  it('[INPUT] days=0 → 200, period.days = 30 (falsy, treated as default)', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics?days=0`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period.days).toBe(30);
  });

  it('[INPUT] days=-1 → 200, period.days = 1 (clamped to minimum, not defaulted to 30)', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics?days=-1`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period.days).toBe(1);
  });

  it('[INPUT] days=1 → 200, period.days = 1 (minimum honoured)', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics?days=1`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period.days).toBe(1);
  });

  it('[INPUT] days=365 → 200, period.days = 365 (maximum honoured)', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics?days=365`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period.days).toBe(365);
  });

  it('[INPUT] days=400 → 200, period.days = 365 (capped to maximum)', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics?days=400`)
      .set('Authorization', `Bearer ${partnerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period.days).toBe(365);
  });

  it('[AUTH] no token → 401', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${venueId}/analytics`);

    expect(res.status).toBe(401);
  });
});
