/**
 * venueService unit tests
 *
 * Focuses on the non-trivial logic:
 *   - getNearbyVenues: Haversine distance filter, null-coord exclusion, sort order
 *   - createVenue / updateVenue: array fields (images, openingHours, features) are
 *     JSON-serialized before being written to DB
 *   - Admin-only field stripping via stripAdminVenueFields (tested through getVenueById)
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  venue: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    count: jest.fn(async () => 0),
    create: jest.fn(async (args) => ({ id: 'v-1', ...args.data })),
    update: jest.fn(async (args) => ({ id: args.where.id, ...args.data })),
    delete: jest.fn(async () => ({})),
  },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

jest.mock('../../src/services/publicPartnerFilter', () => ({
  publicPartnerJoinFilter: { status: 'ACTIVE', verifiedAt: { not: null }, isVisible: true },
}));

import { venueService } from '../../src/services/venue.service';

beforeEach(() => jest.clearAllMocks());

// ─── Helper: build a mock venue with coordinates ──────────────────────────────

function makeVenue(id: string, lat: number | null, lon: number | null, extra: any = {}) {
  return {
    id, name: `Venue ${id}`, nameBg: null, address: 'addr', city: 'Sofia',
    region: null, latitude: lat, longitude: lon, phone: null, email: null,
    description: null, descriptionBg: null, capacity: null,
    images: null, openingHours: null, features: null,
    menuUrl: null, pendingMenuUrl: null, menuStatus: 'NONE',
    menuRejectionReason: null, menuReviewedBy: null, menuReviewedAt: null, menuSubmittedAt: null,
    isActive: true, partnerId: 'p-1', createdAt: new Date(), updatedAt: new Date(),
    partner: { id: 'p-1', businessName: 'Partner', logo: null },
    ...extra,
  };
}

// ─── getNearbyVenues — distance filter ───────────────────────────────────────

describe('venueService.getNearbyVenues — Haversine filter', () => {
  // Reference: Sofia (42.6977°N, 23.3219°E)
  const SOFIA_LAT = 42.6977;
  const SOFIA_LON = 23.3219;

  it('returns venue at same coordinates (distance ≈ 0)', async () => {
    const v = makeVenue('v-same', SOFIA_LAT, SOFIA_LON);
    mockPrisma.venue.findMany.mockResolvedValueOnce([v]);
    const result = await venueService.getNearbyVenues(SOFIA_LAT, SOFIA_LON, 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('v-same');
    expect(result[0].distance).toBeLessThan(0.01);
  });

  it('excludes venue outside radius', async () => {
    // Plovdiv is ~132 km from Sofia
    const plovdiv = makeVenue('v-far', 42.1477, 24.7505);
    mockPrisma.venue.findMany.mockResolvedValueOnce([plovdiv]);
    const result = await venueService.getNearbyVenues(SOFIA_LAT, SOFIA_LON, 5); // 5 km radius
    expect(result).toHaveLength(0);
  });

  it('includes venue within radius and excludes one outside', async () => {
    // ~0.1 km north of Sofia centre — within any reasonable radius
    const close = makeVenue('v-close', SOFIA_LAT + 0.001, SOFIA_LON);
    // ~132 km away
    const far = makeVenue('v-far', 42.1477, 24.7505);
    mockPrisma.venue.findMany.mockResolvedValueOnce([close, far]);

    const result = await venueService.getNearbyVenues(SOFIA_LAT, SOFIA_LON, 5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('v-close');
  });

  it('returns venues sorted by distance ascending', async () => {
    const near = makeVenue('v-near', SOFIA_LAT + 0.001, SOFIA_LON);   // ~0.1 km
    const mid = makeVenue('v-mid', SOFIA_LAT + 0.01, SOFIA_LON);      // ~1.1 km
    const close = makeVenue('v-close', SOFIA_LAT + 0.0001, SOFIA_LON); // ~0.01 km
    mockPrisma.venue.findMany.mockResolvedValueOnce([near, mid, close]);

    const result = await venueService.getNearbyVenues(SOFIA_LAT, SOFIA_LON, 10);
    expect(result.map(v => v.id)).toEqual(['v-close', 'v-near', 'v-mid']);
  });

  it('excludes venues with null latitude or longitude', async () => {
    const withCoords = makeVenue('v-ok', SOFIA_LAT, SOFIA_LON);
    const noLat = makeVenue('v-nolat', null, SOFIA_LON);
    const noLon = makeVenue('v-nolon', SOFIA_LAT, null);
    const both = makeVenue('v-both', null, null);
    mockPrisma.venue.findMany.mockResolvedValueOnce([withCoords, noLat, noLon, both]);

    const result = await venueService.getNearbyVenues(SOFIA_LAT, SOFIA_LON, 100);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('v-ok');
  });

  it('respects the limit parameter', async () => {
    const venues = Array.from({ length: 10 }, (_, i) =>
      makeVenue(`v-${i}`, SOFIA_LAT + i * 0.001, SOFIA_LON),
    );
    mockPrisma.venue.findMany.mockResolvedValueOnce(venues);

    const result = await venueService.getNearbyVenues(SOFIA_LAT, SOFIA_LON, 50, 3);
    expect(result).toHaveLength(3);
  });
});

// ─── createVenue — JSON serialization ────────────────────────────────────────

describe('venueService.createVenue — array serialization', () => {
  it('serializes images array to JSON string', async () => {
    await venueService.createVenue({
      partnerId: 'p-1', name: 'Cafe', address: 'Str 1', city: 'Sofia',
      images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
    });
    const createCall = mockPrisma.venue.create.mock.calls[0][0];
    expect(createCall.data.images).toBe('["https://cdn.example.com/1.jpg","https://cdn.example.com/2.jpg"]');
  });

  it('serializes openingHours to JSON string', async () => {
    const hours = { mon: '09:00-18:00', tue: '09:00-18:00' };
    await venueService.createVenue({
      partnerId: 'p-1', name: 'Shop', address: 'Str 1', city: 'Sofia', openingHours: hours,
    });
    const createCall = mockPrisma.venue.create.mock.calls[0][0];
    expect(createCall.data.openingHours).toBe(JSON.stringify(hours));
  });

  it('serializes features array to JSON string', async () => {
    await venueService.createVenue({
      partnerId: 'p-1', name: 'Bar', address: 'Str 1', city: 'Sofia',
      features: ['wifi', 'parking'],
    });
    const createCall = mockPrisma.venue.create.mock.calls[0][0];
    expect(createCall.data.features).toBe('["wifi","parking"]');
  });

  it('stores null for missing array fields', async () => {
    await venueService.createVenue({ partnerId: 'p-1', name: 'Min', address: 'A', city: 'B' });
    const createCall = mockPrisma.venue.create.mock.calls[0][0];
    expect(createCall.data.images).toBeNull();
    expect(createCall.data.openingHours).toBeNull();
    expect(createCall.data.features).toBeNull();
  });
});

// ─── updateVenue — JSON serialization ────────────────────────────────────────

describe('venueService.updateVenue — array serialization', () => {
  it('serializes images when provided in update', async () => {
    mockPrisma.venue.update.mockResolvedValueOnce({ id: 'v-1' });
    await venueService.updateVenue('v-1', { images: ['https://cdn.example.com/new.jpg'] });
    const updateCall = mockPrisma.venue.update.mock.calls[0][0];
    expect(updateCall.data.images).toBe('["https://cdn.example.com/new.jpg"]');
  });

  it('passes plain string fields without modification', async () => {
    mockPrisma.venue.update.mockResolvedValueOnce({ id: 'v-1' });
    await venueService.updateVenue('v-1', { name: 'New Name', city: 'Plovdiv' });
    const updateCall = mockPrisma.venue.update.mock.calls[0][0];
    expect(updateCall.data.name).toBe('New Name');
    expect(updateCall.data.city).toBe('Plovdiv');
  });
});

// ─── getVenueById — public visibility gate (INV-RDM-059) ─────────────────────

describe('venueService.getVenueById — public visibility gate', () => {
  function makeVenueRow(extra: any = {}) {
    return {
      id: 'v-1', name: 'Venue 1', nameBg: null, address: 'Str 1', city: 'Sofia',
      region: null, latitude: 42.6977, longitude: 23.3219, phone: null, email: null,
      description: null, descriptionBg: null, capacity: null,
      images: null, openingHours: null, features: null,
      menuUrl: null, pendingMenuUrl: null, menuStatus: 'NONE',
      menuRejectionReason: null, menuReviewedBy: null, menuReviewedAt: null,
      menuImages: null, menuSubmittedAt: null, venueStatusNote: null, venueStatusAt: null,
      isActive: true, partnerId: 'p-1', createdAt: new Date(), updatedAt: new Date(),
      venueStatus: 'ACTIVE',
      partner: {
        id: 'p-1', businessName: 'Partner', logo: null,
        email: 'partner@example.com', phone: null,
        status: 'ACTIVE', verifiedAt: new Date('2025-01-01'), isVisible: true,
      },
      ...extra,
    };
  }

  it('returns venue when all public visibility conditions are met', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow());
    const result = await venueService.getVenueById('v-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('v-1');
  });

  it('returns null when venue does not exist', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(null);
    const result = await venueService.getVenueById('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for INACTIVE venueStatus', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({ venueStatus: 'INACTIVE' }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('returns null for SUSPENDED venueStatus', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({ venueStatus: 'SUSPENDED' }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('returns null for REPLACED venueStatus', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({ venueStatus: 'REPLACED' }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('returns null when partner is null', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({ partner: null }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('returns null when partner status is not ACTIVE', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({
      partner: { id: 'p-1', businessName: 'Partner', logo: null, email: null, phone: null,
        status: 'PENDING', verifiedAt: new Date('2025-01-01'), isVisible: true },
    }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('returns null when partner verifiedAt is null (unverified)', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({
      partner: { id: 'p-1', businessName: 'Partner', logo: null, email: null, phone: null,
        status: 'ACTIVE', verifiedAt: null, isVisible: true },
    }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('returns null when partner isVisible is false (hidden)', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({
      partner: { id: 'p-1', businessName: 'Partner', logo: null, email: null, phone: null,
        status: 'ACTIVE', verifiedAt: new Date('2025-01-01'), isVisible: false },
    }));
    const result = await venueService.getVenueById('v-1');
    expect(result).toBeNull();
  });

  it('bypasses visibility gate when includeHidden=true for suspended venue', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({ venueStatus: 'SUSPENDED' }));
    const result = await venueService.getVenueById('v-1', { includeHidden: true });
    expect(result).not.toBeNull();
    expect(result!.id).toBe('v-1');
  });

  it('bypasses visibility gate when includeHidden=true for hidden partner', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({
      partner: { id: 'p-1', businessName: 'Partner', logo: null, email: null, phone: null,
        status: 'ACTIVE', verifiedAt: null, isVisible: false },
    }));
    const result = await venueService.getVenueById('v-1', { includeHidden: true });
    expect(result).not.toBeNull();
  });

  it('strips all six admin-only fields from public response', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow({
      pendingMenuUrl: 'https://menu.example.com/pending',
      menuRejectionReason: 'Not appropriate',
      menuReviewedBy: 'admin@boomcard.bg',
      menuReviewedAt: new Date('2025-06-01'),
      venueStatusNote: 'Internal note',
      venueStatusAt: new Date('2025-06-01'),
    }));
    const result = await venueService.getVenueById('v-1') as any;
    expect(result).not.toBeNull();
    expect(result.pendingMenuUrl).toBeUndefined();
    expect(result.menuRejectionReason).toBeUndefined();
    expect(result.menuReviewedBy).toBeUndefined();
    expect(result.menuReviewedAt).toBeUndefined();
    expect(result.venueStatusNote).toBeUndefined();
    expect(result.venueStatusAt).toBeUndefined();
  });

  it('strips partner.status/verifiedAt/isVisible from public response', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce(makeVenueRow());
    const result = await venueService.getVenueById('v-1') as any;
    expect(result).not.toBeNull();
    expect(result.partner.status).toBeUndefined();
    expect(result.partner.verifiedAt).toBeUndefined();
    expect(result.partner.isVisible).toBeUndefined();
  });
});
