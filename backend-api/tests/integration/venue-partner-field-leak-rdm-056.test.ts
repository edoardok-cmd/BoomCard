/**
 * INV-RDM-056 — partner.status / verifiedAt / isVisible must NOT appear in
 * any public (unauthenticated) GET /api/venues/:id response.
 *
 * Implementation: venue.service.ts getVenueById() selects these three fields
 * to evaluate the §5.3 public visibility-matrix gate, then destructures them
 * out before returning the record when includeHidden is false (lines ~267-270).
 *
 * Runtime: NODE_ENV=test, DATABASE_URL=boomcard_test
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser, loginTestUser } from '../helpers/test-utils';

const PARTNER_GATING_FIELDS = ['status', 'verifiedAt', 'isVisible'] as const;

let partnerUserId: string;
let adminUserId: string;
let partnerId: string;
let venueId: string;
let adminToken: string;

beforeAll(async () => {
  // Admin user — needed for the admin-surface check.
  const adminReg = await createTestUser();
  adminUserId = adminReg.user.id;
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
  });
  const adminLogin = await loginTestUser(adminReg.email, adminReg.password, 'web');
  adminToken = adminLogin.accessToken;

  // Partner user — the venue owner.
  const { user } = await createTestUser();
  partnerUserId = user.id;
  await prisma.user.update({
    where: { id: partnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });

  // Fully-activated partner: status=ACTIVE, verifiedAt set, isVisible=true.
  // Seeding with non-null values for all three gating fields so a regression
  // where the destructure strip is removed would cause the test to fail.
  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      businessName: `RDM-056 Leak Test Partner ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      isVisible: true,
      discountRate: 5,
    },
  });
  partnerId = partner.id;

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: 'RDM-056 Leak Test Venue',
      address: '56 Leak Street',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
      venueStatus: 'ACTIVE',
    },
  });
  venueId = venue.id;

  // Minimal sticker config — some downstream guards require it.
  await prisma.venueStickerConfig.create({
    data: { venueId: venue.id, minBillAmount: 5 },
  });
});

afterAll(async () => {
  await prisma.venueStickerConfig.deleteMany({ where: { venueId } });
  await prisma.venue.deleteMany({ where: { id: venueId } });
  await prisma.partner.deleteMany({ where: { id: partnerId } });
  await cleanupTestUser(partnerUserId);
  await cleanupTestUser(adminUserId);
});

// ─── GET /api/venues/:id (public — no auth) ───────────────────────────────────

describe('GET /api/venues/:id (public — no auth) — partner gating fields absent', () => {
  it('[LEAK] INV-RDM-056: status, verifiedAt, isVisible not in partner sub-object', async () => {
    const res = await request(app).get(`/api/venues/${venueId}`);

    // A 404 here means the test fixture is broken — the partner is ACTIVE,
    // verifiedAt is set, isVisible is true, and the venue is ACTIVE. A 404
    // would be a test-setup bug, not a passing leak-absence check.
    expect(res.status).toBe(200);

    const partner = (res.body.data as Record<string, unknown>).partner as Record<string, unknown>;

    // Positive control: the partner sub-object must exist and carry public fields.
    expect(partner).toBeDefined();
    expect(partner).toHaveProperty('id');
    expect(partner).toHaveProperty('businessName');

    // Core assertion: the three gating fields must be stripped.
    for (const field of PARTNER_GATING_FIELDS) {
      expect(partner).not.toHaveProperty(field);
    }
  });
});

// ─── GET /api/admin/venues (admin surface) ────────────────────────────────────

describe('GET /api/admin/venues (admin — partner.status present)', () => {
  it('[LEAK] INV-RDM-056: partner.status is present in admin venue list (data is not structurally absent)', async () => {
    // The public GET /api/venues/:id route always calls getVenueById without
    // includeHidden, stripping the fields for all callers regardless of role.
    // The canonical admin surface that returns partner.status is the admin venue
    // list — GET /api/admin/venues — which uses a direct Prisma select that
    // intentionally includes it. Asserting its presence here proves the stripping
    // in the public route is a deliberate gate, not a data-unavailability bug.
    const res = await request(app)
      .get(`/api/admin/venues?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const venues = res.body.data as Record<string, unknown>[];
    expect(Array.isArray(venues)).toBe(true);

    const seeded = venues.find((v) => v['id'] === venueId);
    expect(seeded).toBeDefined();

    const adminPartner = seeded!['partner'] as Record<string, unknown>;
    expect(adminPartner).toBeDefined();

    // status IS exposed to admins — proving the public strip is intentional.
    expect(adminPartner).toHaveProperty('status');
  });
});
