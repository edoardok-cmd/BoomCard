/**
 * INV-RDM-061 — GET /api/venues/cities only counts cities with at least one
 * publicly visible venue.
 *
 * BC-REDEMPTION-RDM-061-6
 *
 * A venue is "publicly visible" when ALL of:
 *   1. venue.venueStatus === 'ACTIVE'
 *   2. partner.status === 'ACTIVE'
 *   3. partner.verifiedAt is not null
 *   4. partner.isVisible === true
 *
 * If a city has NO venue satisfying all four conditions, that city must NOT
 * appear in the GET /api/venues/cities response at all.
 *
 * If a city has a MIX of public and hidden venues, the returned count must
 * reflect only the publicly visible ones.
 *
 * Implementation surface: venueService.getCities (venue.service.ts L303-321)
 * which gates on publicPartnerJoinFilter and venueStatus='ACTIVE'.
 *
 * Runtime: NODE_ENV=test, DATABASE_URL=boomcard_test
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

interface Fixture {
  userIds: string[];
  venueIds: string[];
}

const fixtures: Record<string, Fixture> = {};

async function createCityFixture(
  label: string,
  city: string,
  partnerOverrides: {
    status?: string;
    verifiedAt?: Date | null;
    isVisible?: boolean;
  },
  venueOverrides: {
    venueStatus?: string;
  } = {},
): Promise<string> {
  const { user } = await createTestUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'PARTNER', status: 'ACTIVE' },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      businessName: `RDM-061 ${label} Partner ${Date.now()}`,
      category: 'Restaurant',
      status: (partnerOverrides.status ?? 'ACTIVE') as any,
      verifiedAt:
        partnerOverrides.verifiedAt !== undefined
          ? partnerOverrides.verifiedAt
          : new Date(),
      isVisible: partnerOverrides.isVisible ?? true,
      discountRate: 5,
    },
  });

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: `RDM-061 ${label} Venue`,
      address: `${label} Street 1`,
      city,
      latitude: 42.6977,
      longitude: 23.3219,
      venueStatus: (venueOverrides.venueStatus ?? 'ACTIVE') as any,
    },
  });

  // Register for cleanup before the sticker-config write so a failure there
  // does not orphan the already-created venue, partner, and user.
  fixtures[label] = {
    userIds: [user.id],
    venueIds: [venue.id],
  };

  await prisma.venueStickerConfig.create({
    data: { venueId: venue.id, minBillAmount: 5 },
  });

  return venue.id;
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

async function getCities(): Promise<{ city: string; count: number }[]> {
  const res = await request(app).get('/api/venues/cities');
  expect(res.status).toBe(200);
  return res.body.data as { city: string; count: number }[];
}

// ─── Test cases ───────────────────────────────────────────────────────────────

describe('[VIS] INV-RDM-061: positive control — city with publicly visible venue appears', () => {
  // Timestamp + random suffix guarantees uniqueness even under concurrent runs
  const city = `RDM-061-Public-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await createCityFixture(
      'VISIBLE',
      city,
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    );
  });

  afterAll(async () => {
    await destroyFixture('VISIBLE');
  });

  it('[VIS] INV-RDM-061: city with one ACTIVE venue + ACTIVE+verified+visible partner appears in /cities', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    expect(entry).toBeDefined();
    // Exactly one publicly visible venue was seeded for this unique city
    expect(entry!.count).toBe(1);
  });
});

describe('[VIS] INV-RDM-061: inactive venue (venueStatus=INACTIVE) — city excluded', () => {
  const city = `RDM-061-InactiveVenue-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await createCityFixture(
      'INACTIVE-VENUE',
      city,
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'INACTIVE' },
    );
  });

  afterAll(async () => {
    await destroyFixture('INACTIVE-VENUE');
  });

  it('[VIS] INV-RDM-061: city with only venueStatus=INACTIVE venues must not appear in /cities', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    expect(entry).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-061: suspended partner (status=SUSPENDED) — city excluded', () => {
  const city = `RDM-061-SuspendedPartner-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await createCityFixture(
      'SUSPENDED-PARTNER',
      city,
      { status: 'SUSPENDED', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    );
  });

  afterAll(async () => {
    await destroyFixture('SUSPENDED-PARTNER');
  });

  it('[VIS] INV-RDM-061: city whose only venue belongs to a SUSPENDED partner must not appear in /cities', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    expect(entry).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-061: inactive partner (status=INACTIVE) — city excluded', () => {
  const city = `RDM-061-InactivePartner-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await createCityFixture(
      'INACTIVE-PARTNER',
      city,
      { status: 'INACTIVE', verifiedAt: new Date(), isVisible: true },
      { venueStatus: 'ACTIVE' },
    );
  });

  afterAll(async () => {
    await destroyFixture('INACTIVE-PARTNER');
  });

  it('[VIS] INV-RDM-061: city whose only venue belongs to an INACTIVE partner must not appear in /cities', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    expect(entry).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-061: unverified partner (verifiedAt=null) — city excluded', () => {
  const city = `RDM-061-UnverifiedPartner-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await createCityFixture(
      'UNVERIFIED-PARTNER',
      city,
      { status: 'ACTIVE', verifiedAt: null, isVisible: true },
      { venueStatus: 'ACTIVE' },
    );
  });

  afterAll(async () => {
    await destroyFixture('UNVERIFIED-PARTNER');
  });

  it('[VIS] INV-RDM-061: city whose only venue belongs to an unverified partner (verifiedAt=null) must not appear in /cities', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    expect(entry).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-061: invisible partner (isVisible=false) — city excluded', () => {
  const city = `RDM-061-InvisiblePartner-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await createCityFixture(
      'INVISIBLE-PARTNER',
      city,
      { status: 'ACTIVE', verifiedAt: new Date(), isVisible: false },
      { venueStatus: 'ACTIVE' },
    );
  });

  afterAll(async () => {
    await destroyFixture('INVISIBLE-PARTNER');
  });

  it('[VIS] INV-RDM-061: city whose only venue belongs to a hidden partner (isVisible=false) must not appear in /cities', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    expect(entry).toBeUndefined();
  });
});

describe('[VIS] INV-RDM-061: count integrity — mixed city only counts public venues', () => {
  // This city has 2 venues: 1 publicly visible + 1 with a hidden partner.
  // The count returned must be 1, not 2.
  const city = `RDM-061-Mixed-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // IDs are pushed incrementally so partial-failure in beforeAll still cleans up.
  const mixedUserIds: string[] = [];
  const mixedVenueIds: string[] = [];

  beforeAll(async () => {
    // Venue 1: publicly visible
    const { user: user1 } = await createTestUser();
    mixedUserIds.push(user1.id);
    await prisma.user.update({
      where: { id: user1.id },
      data: { role: 'PARTNER', status: 'ACTIVE' },
    });
    const partner1 = await prisma.partner.create({
      data: {
        userId: user1.id,
        businessName: `RDM-061 Mixed Public Partner ${Date.now()}`,
        category: 'Restaurant',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        isVisible: true,
        discountRate: 5,
      },
    });
    const venue1 = await prisma.venue.create({
      data: {
        partnerId: partner1.id,
        name: 'RDM-061 Mixed Public Venue',
        address: 'Mixed Public Street 1',
        city,
        latitude: 42.6977,
        longitude: 23.3219,
        venueStatus: 'ACTIVE',
      },
    });
    mixedVenueIds.push(venue1.id);
    await prisma.venueStickerConfig.create({
      data: { venueId: venue1.id, minBillAmount: 5 },
    });

    // Venue 2: ACTIVE venue but partner is invisible — must not be counted
    const { user: user2 } = await createTestUser();
    mixedUserIds.push(user2.id);
    await prisma.user.update({
      where: { id: user2.id },
      data: { role: 'PARTNER', status: 'ACTIVE' },
    });
    const partner2 = await prisma.partner.create({
      data: {
        userId: user2.id,
        businessName: `RDM-061 Mixed Hidden Partner ${Date.now()}`,
        category: 'Bar',
        status: 'ACTIVE',
        verifiedAt: new Date(),
        isVisible: false,
        discountRate: 5,
      },
    });
    const venue2 = await prisma.venue.create({
      data: {
        partnerId: partner2.id,
        name: 'RDM-061 Mixed Hidden Venue',
        address: 'Mixed Hidden Street 2',
        city,
        latitude: 42.6977,
        longitude: 23.3219,
        venueStatus: 'ACTIVE',
      },
    });
    mixedVenueIds.push(venue2.id);
    await prisma.venueStickerConfig.create({
      data: { venueId: venue2.id, minBillAmount: 5 },
    });
  });

  afterAll(async () => {
    for (const venueId of mixedVenueIds) {
      await prisma.venueStickerConfig.deleteMany({ where: { venueId } });
      await prisma.venue.deleteMany({ where: { id: venueId } });
    }
    for (const userId of mixedUserIds) {
      await cleanupTestUser(userId);
    }
  });

  it('[VIS] INV-RDM-061: count for a mixed city equals the number of publicly visible venues only', async () => {
    const cities = await getCities();
    const entry = cities.find((c) => c.city === city);
    // City must appear because it has one public venue
    expect(entry).toBeDefined();
    // Count must be exactly 1 (the hidden venue must not be counted)
    expect(entry!.count).toBe(1);
  });
});
