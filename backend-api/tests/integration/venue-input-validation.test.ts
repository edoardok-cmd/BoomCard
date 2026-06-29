/**
 * INV-RDM-018: POST /api/venues/ rejects missing required fields with 400
 *
 * BC-REDEMPTION-RDM-018-2
 *
 * Validates that the POST /api/venues/ endpoint returns 400 when any of the
 * required fields (partnerId, name, address, city) is absent, and returns 201
 * when all required fields are present.
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

let adminToken: string;
let adminUserId: string;
let testPartnerId: string;
let partnerUserId: string;
const createdVenueIds: string[] = [];

beforeAll(async () => {
  // Create admin user
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

  // Create a partner to supply a valid partnerId for positive tests
  const partnerRegistered = await createTestUser();
  partnerUserId = partnerRegistered.user.id;
  await prisma.user.update({
    where: { id: partnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      businessName: `RDM-018 Test Partner ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      discountRate: 5,
    },
  });
  testPartnerId = partner.id;
}, 30_000);

afterAll(async () => {
  for (const id of createdVenueIds) {
    try { await prisma.venue.delete({ where: { id } }); } catch {}
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

// ─── INV-RDM-018: missing required field → 400 ───────────────────────────────

describe('INV-RDM-018 — POST /api/venues/ rejects missing required fields with 400', () => {
  function validBody() {
    return {
      partnerId: testPartnerId,
      name: 'RDM-018 Test Venue',
      address: '1 Test Street',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
    };
  }

  it('[INPUT] empty body → 400', async () => {
    const res = await request(app)
      .post('/api/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] missing partnerId → 400', async () => {
    const { partnerId: _dropped, ...body } = validBody();
    const res = await request(app)
      .post('/api/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] missing name → 400', async () => {
    const { name: _dropped, ...body } = validBody();
    const res = await request(app)
      .post('/api/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] missing address → 400', async () => {
    const { address: _dropped, ...body } = validBody();
    const res = await request(app)
      .post('/api/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] missing city → 400', async () => {
    const { city: _dropped, ...body } = validBody();
    const res = await request(app)
      .post('/api/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[POSITIVE] all required fields present → 201', async () => {
    const res = await request(app)
      .post('/api/venues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    if (res.body.data?.id) {
      createdVenueIds.push(res.body.data.id);
    }
  });
});
