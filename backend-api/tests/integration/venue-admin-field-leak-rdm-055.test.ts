/**
 * INV-RDM-055 — Admin-only venue fields not exposed in public venue GET endpoints
 *
 * BC-REDEMPTION-RDM-055-5
 *
 * Fields under test: pendingMenuUrl, menuRejectionReason, venueStatusNote
 * (plus the full ADMIN_ONLY_VENUE_FIELDS set from venue.service.ts)
 *
 * Invariant: none of these fields may appear in any public (unauthenticated)
 * venue GET response, even when the DB row has non-null values for them.
 * Implementation: venue.service.ts stripAdminVenueFields() called on every
 * public read path.
 *
 * Routes covered:
 *   GET /api/venues/:id           — single venue by ID
 *   GET /api/venues               — paginated list
 *   GET /api/venues/nearby        — GPS proximity search
 *   GET /api/venues/search        — full-text search
 *
 * Runtime: NODE_ENV=test, DATABASE_URL=boomcard_test
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// Fields that must never appear in public venue GET responses
const ADMIN_ONLY_FIELDS = [
  'pendingMenuUrl',
  'menuRejectionReason',
  'menuReviewedBy',
  'menuReviewedAt',
  'venueStatusNote',
  'venueStatusAt',
] as const;

let partnerUserId: string;
let venueId: string;

beforeAll(async () => {
  // Create a partner that satisfies all public visibility-matrix requirements:
  //   partner.status = ACTIVE, verifiedAt set, isVisible = true
  const { user } = await createTestUser();
  partnerUserId = user.id;
  await prisma.user.update({
    where: { id: partnerUserId },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      businessName: `RDM-055 Leak Test Partner ${Date.now()}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      isVisible: true,
      discountRate: 5,
    },
  });

  // Seed the venue with non-null values for all admin-only fields so the test
  // would catch a regression where stripAdminVenueFields is removed or skipped.
  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: 'RDM-055 Leak Test Venue',
      address: '55 Leak Street',
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
      venueStatus: 'ACTIVE',
      // Admin-only fields seeded with non-null values:
      pendingMenuUrl: 'https://example.com/pending-menu-rdm055',
      menuRejectionReason: 'Blurry images (test seed)',
      venueStatusNote: 'Under admin review (test seed)',
    },
  });
  venueId = venue.id;

  // Minimal sticker config required by some downstream guards
  await prisma.venueStickerConfig.create({
    data: { venueId: venue.id, minBillAmount: 5 },
  });
});

afterAll(async () => {
  // Clean up in FK dependency order
  await prisma.venueStickerConfig.deleteMany({ where: { venueId } });
  await prisma.venue.deleteMany({ where: { id: venueId } });
  await cleanupTestUser(partnerUserId);
});

function assertNoAdminFields(body: Record<string, unknown>): void {
  for (const field of ADMIN_ONLY_FIELDS) {
    expect(body).not.toHaveProperty(field);
  }
}

// ─── GET /api/venues/:id ──────────────────────────────────────────────────────

describe('GET /api/venues/:id — admin-only fields absent', () => {
  it('[LEAK] INV-RDM-055: admin-only fields not in single-venue response', async () => {
    const res = await request(app).get(`/api/venues/${venueId}`);
    // The venue is fully activated — a 404 here is a test-setup bug, not a pass.
    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    assertNoAdminFields(data);
  });
});

// ─── GET /api/venues (list) ───────────────────────────────────────────────────

describe('GET /api/venues — admin-only fields absent in list', () => {
  it('[LEAK] INV-RDM-055: admin-only fields not in any venue in paginated list', async () => {
    const res = await request(app).get('/api/venues?city=Sofia');
    expect(res.status).toBe(200);
    const venues = res.body.data as Record<string, unknown>[];
    expect(Array.isArray(venues)).toBe(true);

    // Find our seeded venue (may not be the only one in Sofia)
    const seeded = venues.find((v) => v['id'] === venueId);
    expect(seeded).toBeDefined();
    assertNoAdminFields(seeded!);

    // Also assert no venue in the list leaks admin fields
    for (const venue of venues) {
      assertNoAdminFields(venue);
    }
  });
});

// ─── GET /api/venues/nearby ───────────────────────────────────────────────────

describe('GET /api/venues/nearby — admin-only fields absent in proximity results', () => {
  it('[LEAK] INV-RDM-055: admin-only fields not in nearby-venue response', async () => {
    // Venue is at (42.6977, 23.3219); query with 1km radius to ensure it appears.
    const res = await request(app).get(
      '/api/venues/nearby?latitude=42.6977&longitude=23.3219&radius=1',
    );
    expect(res.status).toBe(200);
    const venues = res.body.data as Record<string, unknown>[];
    expect(Array.isArray(venues)).toBe(true);

    for (const venue of venues) {
      assertNoAdminFields(venue);
    }

    // Positive control: our seeded venue must appear in the result set
    const seeded = venues.find((v) => v['id'] === venueId);
    expect(seeded).toBeDefined();
  });
});

// ─── GET /api/venues/search ───────────────────────────────────────────────────

describe('GET /api/venues/search — admin-only fields absent in search results', () => {
  it('[LEAK] INV-RDM-055: admin-only fields not in search-result venues', async () => {
    const res = await request(app).get('/api/venues/search?q=RDM-055+Leak+Test+Venue');
    expect(res.status).toBe(200);
    const venues = res.body.data as Record<string, unknown>[];
    expect(Array.isArray(venues)).toBe(true);

    for (const venue of venues) {
      assertNoAdminFields(venue);
    }

    // Positive control: our seeded venue must be found by name search
    const seeded = venues.find((v) => v['id'] === venueId);
    expect(seeded).toBeDefined();
  });
});
