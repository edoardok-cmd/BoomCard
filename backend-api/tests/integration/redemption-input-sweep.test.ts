/**
 * Redemption Surface — INPUT class sweep (BC-REDEMPTION-RDM-019-2)
 *
 * Covers INV-RDM-019:
 *   INPUT | MEDIUM | POST /api/venues/ rejects invalid or missing geolocation with 400
 *
 * All requests use an ADMIN token because POST /api/venues/ is gated on
 * authorize('ADMIN', 'SUPER_ADMIN') + requireActiveAdmin. A valid partnerId
 * is required in the body, so a partner record is created in beforeAll and
 * torn down in afterAll.
 *
 * Runtime: backend on :3025 (NODE_ENV=test, DATABASE_URL=boomcard_test).
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

let adminToken: string;
let adminUserId: string;
let rdm019PartnerId: string;
let rdm019PartnerUserId: string;

// Venues created by the positive-control test need cleanup
const rdm019CleanupVenueIds: string[] = [];

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Create an ADMIN user and re-login to obtain a JWT that carries role=ADMIN.
  const adminRegistered = await createTestUser();
  adminUserId = adminRegistered.user.id;
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'ADMIN', status: 'ACTIVE' },
  });
  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminRegistered.email, password: adminRegistered.password, clientType: 'web' });
  if (adminLoginRes.status !== 200) {
    throw new Error(`INV-RDM-019 setup: admin login failed (${adminLoginRes.status}): ${JSON.stringify(adminLoginRes.body)}`);
  }
  adminToken = adminLoginRes.body.data.accessToken;

  // Create a partner record so POST /api/venues/ has a valid partnerId to work with.
  const partnerUser = await createTestUser();
  rdm019PartnerUserId = partnerUser.user.id;
  await prisma.user.update({
    where: { id: rdm019PartnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: rdm019PartnerUserId,
      businessName: `RDM019 Test Partner ${Date.now()}`,
      businessNameBg: `RDM019 Тест Партньор ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      discountRate: 5,
      isVisible: true,
    },
  });
  rdm019PartnerId = partner.id;
}, 30_000);

afterAll(async () => {
  // Clean up any venues the positive-control test may have created.
  for (const id of rdm019CleanupVenueIds) {
    try { await cleanupTestVenue(id); } catch {}
  }
  // Remove the partner record before its owning user.
  if (rdm019PartnerId) {
    await prisma.partner.delete({ where: { id: rdm019PartnerId } }).catch(() => {});
  }
  if (rdm019PartnerUserId) {
    try { await cleanupTestUser(rdm019PartnerUserId); } catch {}
  }
  if (adminUserId) {
    try { await cleanupTestUser(adminUserId); } catch {}
  }
}, 30_000);

// ─── Helper: base valid body (geolocation injected per test) ──────────────────

function baseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    partnerId: rdm019PartnerId,
    name: `RDM019 Venue ${Date.now()}`,
    address: '1 Test Street',
    city: 'Sofia',
    ...overrides,
  };
}

// ─── INV-RDM-019: POST /api/venues/ geolocation validation ───────────────────

describe('INV-RDM-019 — POST /api/venues/ rejects invalid or missing geolocation with 400', () => {

  it('[INPUT] INV-RDM-019: missing latitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: missing longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: missing both latitude and longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody());
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: non-numeric latitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 'notanumber', longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: non-numeric longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: 'abc' }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: out-of-range latitude (91) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 91, longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: out-of-range latitude (-91) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: -91, longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: out-of-range longitude (181) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: 181 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: out-of-range longitude (-181) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: -181 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: boolean latitude (false) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: false, longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: array latitude ([]) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: [], longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: boolean true latitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: true, longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: boolean true longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: true }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: boolean false longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: false }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: array longitude ([]) returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: [] }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: empty-string latitude returns 400 (edge case — Number("") === 0 without guard)', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: '', longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: whitespace-only latitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: '   ', longitude: 23.3219 }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: empty-string longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: '' }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: whitespace-only longitude returns 400', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: '   ' }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('[INPUT] INV-RDM-019: valid coordinates return 201 (positive control)', async () => {
    const res = await authRequest(adminToken)
      .post('/api/venues/')
      .send(baseBody({ latitude: 42.6977, longitude: 23.3219 }));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Track the created venue for afterAll cleanup.
    if (res.body?.data?.id) {
      rdm019CleanupVenueIds.push(res.body.data.id);
    }
  });

});
