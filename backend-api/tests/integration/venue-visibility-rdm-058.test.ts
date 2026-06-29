/**
 * INV-RDM-058 — VIS: GET /api/venues/ returns only ACTIVE venues with
 * ACTIVE+verified+visible partners.
 *
 * Implementation: venue.service.ts L118-121 — publicPartnerJoinFilter +
 * venueStatus:'ACTIVE' gate applied when includeHidden=false.
 *
 * Cases:
 *   Positive  — ACTIVE venue + ACTIVE+verified+visible partner → appears
 *   Negative A — venueStatus=INACTIVE → excluded
 *   Negative B — venueStatus=SUSPENDED → excluded
 *   Negative C — venueStatus=REPLACED → excluded
 *   Negative D — partner.status=INACTIVE → excluded
 *   Negative E — partner.status=PAUSED → excluded
 *   Negative F — partner.status=SUSPENDED → excluded
 *   Negative G — partner.status=ARCHIVED → excluded
 *   Negative H — partner.status=REJECTED → excluded
 *   Negative I — partner.status=PENDING → excluded
 *   Negative J — partner.verifiedAt=null → excluded
 *   Negative K — partner.isVisible=false → excluded
 *
 * Runtime: NODE_ENV=test, DATABASE_URL=boomcard_test
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { createTestUser, cleanupTestUser } from '../helpers/test-utils';

// Collected IDs for afterAll cleanup.
const venueIds: string[] = [];
const partnerIds: string[] = [];
const userIds: string[] = [];

interface Case {
  label: string;
  partnerId: string;
  venueId: string;
  expectVisible: boolean;
}

const cases: Case[] = [];

describe('GET /api/venues/ (public) — VIS gate INV-RDM-058', () => {
  beforeAll(async () => {
    const testSuffix = Date.now();

    async function makeFixture(opts: {
      label: string;
      venueStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REPLACED';
      partnerStatus: 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'SUSPENDED' | 'ARCHIVED' | 'REJECTED' | 'PENDING';
      verifiedAt: Date | null;
      isVisible: boolean;
      expectVisible: boolean;
      addressNum: string;
      suffix: string;
    }) {
      const { user } = await createTestUser();
      userIds.push(user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'PARTNER', status: 'ACTIVE' },
      });
      const partner = await prisma.partner.create({
        data: {
          userId: user.id,
          businessName: `RDM-058 ${opts.suffix} ${testSuffix}`,
          category: 'Restaurant',
          status: opts.partnerStatus,
          verifiedAt: opts.verifiedAt,
          isVisible: opts.isVisible,
          discountRate: 5,
        },
      });
      partnerIds.push(partner.id);
      const venue = await prisma.venue.create({
        data: {
          partnerId: partner.id,
          name: `RDM-058 ${opts.suffix} Venue ${testSuffix}`,
          address: `${opts.addressNum} Test Street`,
          city: 'Sofia',
          latitude: 42.6977,
          longitude: 23.3219,
          venueStatus: opts.venueStatus,
        },
      });
      venueIds.push(venue.id);
      cases.push({ label: opts.label, partnerId: partner.id, venueId: venue.id, expectVisible: opts.expectVisible });
    }

    await makeFixture({ label: 'Positive', venueStatus: 'ACTIVE', partnerStatus: 'ACTIVE', verifiedAt: new Date(), isVisible: true, expectVisible: true, addressNum: '1', suffix: 'Pos' });
    await makeFixture({ label: 'Negative A (venueStatus=INACTIVE)', venueStatus: 'INACTIVE', partnerStatus: 'ACTIVE', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '2', suffix: 'NegA' });
    await makeFixture({ label: 'Negative B (venueStatus=SUSPENDED)', venueStatus: 'SUSPENDED', partnerStatus: 'ACTIVE', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '3', suffix: 'NegB' });
    await makeFixture({ label: 'Negative C (venueStatus=REPLACED)', venueStatus: 'REPLACED', partnerStatus: 'ACTIVE', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '4', suffix: 'NegC' });
    await makeFixture({ label: 'Negative D (partner.status=INACTIVE)', venueStatus: 'ACTIVE', partnerStatus: 'INACTIVE', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '5', suffix: 'NegD' });
    await makeFixture({ label: 'Negative E (partner.status=PAUSED)', venueStatus: 'ACTIVE', partnerStatus: 'PAUSED', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '6', suffix: 'NegE' });
    await makeFixture({ label: 'Negative F (partner.status=SUSPENDED)', venueStatus: 'ACTIVE', partnerStatus: 'SUSPENDED', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '7', suffix: 'NegF' });
    await makeFixture({ label: 'Negative G (partner.status=ARCHIVED)', venueStatus: 'ACTIVE', partnerStatus: 'ARCHIVED', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '8', suffix: 'NegG' });
    await makeFixture({ label: 'Negative H (partner.status=REJECTED)', venueStatus: 'ACTIVE', partnerStatus: 'REJECTED', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '9', suffix: 'NegH' });
    await makeFixture({ label: 'Negative I (partner.status=PENDING)', venueStatus: 'ACTIVE', partnerStatus: 'PENDING', verifiedAt: new Date(), isVisible: true, expectVisible: false, addressNum: '10', suffix: 'NegI' });
    await makeFixture({ label: 'Negative J (partner.verifiedAt=null)', venueStatus: 'ACTIVE', partnerStatus: 'ACTIVE', verifiedAt: null, isVisible: true, expectVisible: false, addressNum: '11', suffix: 'NegJ' });
    await makeFixture({ label: 'Negative K (partner.isVisible=false)', venueStatus: 'ACTIVE', partnerStatus: 'ACTIVE', verifiedAt: new Date(), isVisible: false, expectVisible: false, addressNum: '12', suffix: 'NegK' });
  });

  afterAll(async () => {
    await prisma.venueStickerConfig.deleteMany({ where: { venueId: { in: venueIds } } });
    await prisma.venue.deleteMany({ where: { id: { in: venueIds } } });
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    for (const userId of userIds) {
      await cleanupTestUser(userId);
    }
  });

  it('[VIS] INV-RDM-058 positive: ACTIVE venue with ACTIVE+verified+visible partner appears in public list', async () => {
    const c = cases.find((x) => x.label === 'Positive')!;
    expect(c).toBeDefined();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    const venues = res.body.data as Array<{ id: string }>;
    expect(Array.isArray(venues)).toBe(true);
    expect(venues.map((v) => v.id)).toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative A: INACTIVE venue does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative A (venueStatus=INACTIVE)')!;
    expect(c).toBeDefined();
    // Teeth: venue exists in DB — the absence from the API is the gate, not missing data.
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative B: SUSPENDED venue does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative B (venueStatus=SUSPENDED)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative C: REPLACED venue does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative C (venueStatus=REPLACED)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative D: venue with partner.status=INACTIVE does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative D (partner.status=INACTIVE)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative E: venue with partner.status=PAUSED does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative E (partner.status=PAUSED)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative F: venue with partner.status=SUSPENDED does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative F (partner.status=SUSPENDED)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative G: venue with partner.status=ARCHIVED does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative G (partner.status=ARCHIVED)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative H: venue with partner.status=REJECTED does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative H (partner.status=REJECTED)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative I: venue with partner.status=PENDING does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative I (partner.status=PENDING)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative J: venue with partner.verifiedAt=null does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative J (partner.verifiedAt=null)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });

  it('[VIS] INV-RDM-058 negative K: venue with partner.isVisible=false does NOT appear in public list', async () => {
    const c = cases.find((x) => x.label === 'Negative K (partner.isVisible=false)')!;
    expect(c).toBeDefined();
    const dbVenue = await prisma.venue.findUnique({ where: { id: c.venueId } });
    expect(dbVenue).not.toBeNull();
    const res = await request(app).get(`/api/venues/?partnerId=${c.partnerId}`);
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ id: string }>).map((v) => v.id)).not.toContain(c.venueId);
  });
});
