/**
 * INV-RDM-060 — GET /api/venues/search returns only publicly visible venues
 *
 * BC-REDEMPTION-RDM-060-6
 *
 * Invariant: every venue in the /api/venues/search response must satisfy ALL of:
 *   1. venue.venueStatus === 'ACTIVE'
 *   2. partner.status === 'ACTIVE'
 *   3. partner.verifiedAt is not null
 *   4. partner.isVisible === true
 *
 * Any venue that fails any single condition must be excluded from results even
 * when its name matches the query string.
 *
 * Implementation surface: venueService.searchVenues (venue.service.ts ~L459)
 * which gates on publicPartnerJoinFilter from publicPartnerFilter.ts.
 *
 * Runtime: NODE_ENV=test, DATABASE_URL=boomcard_test
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// ─── Fixture registry ─────────────────────────────────────────────────────────
// Each fixture tracks the IDs created so afterAll can clean them up in FK order.

interface Fixture {
  userIds: string[];
  venueIds: string[];
}

const fixtures: Record<string, Fixture> = {};

/**
 * Create a partner + venue fixture with the given visibility parameters.
 * Returns IDs so individual describe blocks can reference them.
 */
async function createFixture(
  label: string,
  partnerOverrides: {
    status?: string;
    verifiedAt?: Date | null;
    isVisible?: boolean;
  },
  venueOverrides: {
    venueStatus?: string;
  } = {},
): Promise<{ venueId: string; venueName: string }> {
  const { user } = await createTestUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      businessName: `RDM-060 ${label} Partner`,
      category: 'Restaurant',
      status: (partnerOverrides.status ?? 'ACTIVE') as any,
      verifiedAt: partnerOverrides.verifiedAt !== undefined
        ? partnerOverrides.verifiedAt
        : new Date(),
      isVisible: partnerOverrides.isVisible ?? true,
      discountRate: 5,
    },
  });

  // Embed the label in the venue name so search queries are collision-free.
  const venueName = `RDM-060 ${label} Venue ${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: venueName,
      address: `${label} Street 1`,
      city: 'Sofia',
      latitude: 42.6977,
      longitude: 23.3219,
      venueStatus: (venueOverrides.venueStatus ?? 'ACTIVE') as any,
    },
  });

  // Minimal sticker config required by downstream guards
  await prisma.venueStickerConfig.create({
    data: { venueId: venue.id, minBillAmount: 5 },
  });

  fixtures[label] = {
    userIds: [user.id],
    venueIds: [venue.id],
  };

  return { venueId: venue.id, venueName };
}

async function destroyFixture(label: string): Promise<void> {
  const f = fixtures[label];
  if (!f) return;
  for (const venueId of f.venueIds) {
    await prisma.venueStickerConfig.deleteMany({ where: { venueId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
  }
  for (const userId of f.userIds) {
    await cleanupTestUser(userId);
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function searchVenues(name: string) {
  return request(app).get(`/api/venues/search?q=${encodeURIComponent(name)}`);
}

// ─── Test cases ───────────────────────────────────────────────────────────────

describe('[VIS] INV-RDM-060: positive control — fully visible venue appears in search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'VISIBLE',
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('VISIBLE');
  });

  it('[VIS] INV-RDM-060: ACTIVE venue with fully-visible partner appears in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeDefined();
  });
});

describe('[VIS] INV-RDM-060: hidden partner (isVisible=false) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'HIDDEN-PARTNER',
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: false },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('HIDDEN-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has isVisible=false must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: unverified partner (verifiedAt=null) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'UNVERIFIED-PARTNER',
      { status: 'ACTIVE', verifiedAt: null, isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('UNVERIFIED-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has verifiedAt=null must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: suspended partner (status=SUSPENDED) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'SUSPENDED-PARTNER',
      { status: 'SUSPENDED', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('SUSPENDED-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has status=SUSPENDED must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: inactive venue (venueStatus=INACTIVE) — excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'INACTIVE-VENUE',
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'INACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('INACTIVE-VENUE');
  });

  it('[VIS] INV-RDM-060: venue with venueStatus=INACTIVE must not appear in search results even with a fully-visible partner', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: suspended venue (venueStatus=SUSPENDED) — excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'SUSPENDED-VENUE',
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'SUSPENDED' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('SUSPENDED-VENUE');
  });

  it('[VIS] INV-RDM-060: venue with venueStatus=SUSPENDED must not appear in search results even with a fully-visible partner', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: replaced venue (venueStatus=REPLACED) — excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'REPLACED-VENUE',
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'REPLACED' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('REPLACED-VENUE');
  });

  it('[VIS] INV-RDM-060: venue with venueStatus=REPLACED must not appear in search results even with a fully-visible partner', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: paused partner (status=PAUSED) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'PAUSED-PARTNER',
      { status: 'PAUSED', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('PAUSED-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has status=PAUSED must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: pending partner (status=PENDING) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'PENDING-PARTNER',
      { status: 'PENDING', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('PENDING-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has status=PENDING must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: inactive partner (status=INACTIVE) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'INACTIVE-PARTNER',
      { status: 'INACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('INACTIVE-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has status=INACTIVE must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: archived partner (status=ARCHIVED) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'ARCHIVED-PARTNER',
      { status: 'ARCHIVED', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('ARCHIVED-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has status=ARCHIVED must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-060: rejected partner (status=REJECTED) — venue excluded from search', () => {
  let venueId: string;
  let venueName: string;

  beforeAll(async () => {
    ({ venueId, venueName } = await createFixture(
      'REJECTED-PARTNER',
      { status: 'REJECTED', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    ));
  });

  afterAll(async () => {
    await destroyFixture('REJECTED-PARTNER');
  });

  it('[VIS] INV-RDM-060: venue whose partner has status=REJECTED must not appear in search results', async () => {
    const res = await searchVenues(venueName);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    const found = venues.find((v) => v.id === venueId);
    expect(found).toBeUndefined();
  });
});
