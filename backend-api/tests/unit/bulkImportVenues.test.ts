/**
 * Unit tests for the Partners CSV bulk-import → venue auto-creation path.
 *
 * Covers the audit fixes:
 *  - capacity is floored to an integer before reaching Prisma (Bug #1)
 *  - venue.count failure does NOT mark the partner as failed (Bug #2)
 *  - capacity=0 alone does not trigger venue creation (Bug #3)
 *  - venue + sticker locations are written in a single $transaction (#5)
 *  - new venuesCreated / stickerLocationsCreated counters are returned (#8)
 *  - synthetic @import.boomcard.bg email is not propagated to Venue.email (#9)
 *  - fractional tables / cash_desks values trigger a warning (#10)
 *  - skipDuplicates is no longer used (#11)
 *  - template headers + example row include the new columns
 */

import * as XLSX from 'xlsx';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUserFindFirst = jest.fn();
const mockUserCreate = jest.fn();
const mockPartnerFindUnique = jest.fn();
const mockPartnerCreate = jest.fn();
const mockPartnerUpdate = jest.fn();
const mockVenueCount = jest.fn();
const mockVenueCreate = jest.fn();
const mockStickerLocationCreateMany = jest.fn();
const mockPartnerTypeFindFirst = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => mockUserFindFirst(...a), create: (...a: unknown[]) => mockUserCreate(...a) },
    partner: {
      findUnique: (...a: unknown[]) => mockPartnerFindUnique(...a),
      create: (...a: unknown[]) => mockPartnerCreate(...a),
      update: (...a: unknown[]) => mockPartnerUpdate(...a),
    },
    venue: { count: (...a: unknown[]) => mockVenueCount(...a), create: (...a: unknown[]) => mockVenueCreate(...a) },
    stickerLocation: { createMany: (...a: unknown[]) => mockStickerLocationCreateMany(...a) },
    partnerType: { findFirst: (...a: unknown[]) => mockPartnerTypeFindFirst(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: { uploadImage: jest.fn() },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPartnerWelcome: jest.fn().mockResolvedValue(undefined),
    notifyAdminBulkImportComplete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

// LocationType is read from @prisma/client; provide an enum stand-in.
jest.mock('@prisma/client', () => ({
  OfferStatus: { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', SCHEDULED: 'SCHEDULED', EXPIRED: 'EXPIRED' },
  OfferType: { DISCOUNT: 'DISCOUNT', CASHBACK: 'CASHBACK', POINTS: 'POINTS', COMBO: 'COMBO' },
  PartnerStatus: { ACTIVE: 'ACTIVE', PENDING: 'PENDING', SUSPENDED: 'SUSPENDED', INACTIVE: 'INACTIVE', REJECTED: 'REJECTED' },
  LocationType: { TABLE: 'TABLE', COUNTER: 'COUNTER', BAR: 'BAR', ENTRANCE: 'ENTRANCE', RECEPTION: 'RECEPTION' },
}));

jest.mock('../../src/constants/receipt.constants', () => ({
  CASHBACK_MATRIX_STEPS: [5, 10, 15, 20, 25, 30],
}));

import {
  generatePartnersTemplate,
  importPartnersFromSpreadsheet,
  type ImportedFile,
} from '../../src/services/bulkImport.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildCsv(headers: string[], rows: string[][]): ImportedFile {
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  return { buffer: Buffer.from(csv, 'utf-8'), originalname: 'partners_basic.csv', mimetype: 'text/csv' };
}

const PARTNER_HEADERS = [
  'business_name', 'business_name_bg', 'category', 'categories',
  'description', 'description_bg', 'website', 'phone', 'email',
  'address', 'city', 'region', 'latitude', 'longitude',
  'opening_hours', 'discount_rate', 'status',
  'capacity', 'tables', 'cash_desks',
];

function setupHappyPartner(opts: { existingVenues?: number } = {}) {
  mockUserFindFirst.mockResolvedValue(null);
  mockUserCreate.mockResolvedValue({ id: 'user-1' });
  mockPartnerFindUnique.mockResolvedValue(null);
  mockPartnerCreate.mockResolvedValue({ id: 'partner-1' });
  mockPartnerTypeFindFirst.mockResolvedValue({ id: 'pt-1' });
  mockVenueCount.mockResolvedValue(opts.existingVenues ?? 0);
  mockVenueCreate.mockResolvedValue({ id: 'venue-1' });
  mockStickerLocationCreateMany.mockResolvedValue({ count: 0 });
  // $transaction(fn) runs the callback with the tx client; we just give it
  // the same prisma stubs.
  // $transaction(fn) runs the callback with the tx client. After the move of
  // venue.count inside the transaction, the tx must expose count too.
  mockTransaction.mockImplementation(async (fn: any) => {
    return fn({
      venue: { count: mockVenueCount, create: mockVenueCreate },
      stickerLocation: { createMany: mockStickerLocationCreateMany },
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('generatePartnersTemplate', () => {
  it('includes capacity, tables, cash_desks in headers and example row', () => {
    const buf = generatePartnersTemplate();
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const headers = rows[0];
    const example = rows[1];

    expect(headers).toContain('capacity');
    expect(headers).toContain('tables');
    expect(headers).toContain('cash_desks');

    // Example row populated in matching positions
    const capacityIdx = headers.indexOf('capacity');
    const tablesIdx = headers.indexOf('tables');
    const cashIdx = headers.indexOf('cash_desks');
    expect(String(example[capacityIdx])).toBe('80');
    expect(String(example[tablesIdx])).toBe('12');
    expect(String(example[cashIdx])).toBe('2');
  });
});

describe('importPartnersFromSpreadsheet — venue auto-create', () => {
  it('creates a venue + sticker locations in a single $transaction (audit #5)', async () => {
    setupHappyPartner();
    const file = buildCsv(PARTNER_HEADERS, [[
      'Cafe Pirin', '', 'CAFE', '',
      '', '', '', '+359 88 111 1111', 'cafe@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80', '3', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockVenueCreate).toHaveBeenCalledTimes(1);
    expect(mockStickerLocationCreateMany).toHaveBeenCalledTimes(1);

    // 3 tables + 1 cash desk = 4 sticker locations
    const stickerArg = mockStickerLocationCreateMany.mock.calls[0][0];
    expect(stickerArg.data).toHaveLength(4);
    expect(stickerArg.data.filter((r: any) => r.locationType === 'TABLE')).toHaveLength(3);
    expect(stickerArg.data.filter((r: any) => r.locationType === 'COUNTER')).toHaveLength(1);
    // No skipDuplicates (audit #11)
    expect(stickerArg.skipDuplicates).toBeUndefined();

    expect(res.venuesCreated).toBe(1);
    expect(res.partnersCreated).toBe(1);
    expect(res.errors).toEqual([]);
  });

  it('floors fractional capacity to an integer and warns (audit #1, #10)', async () => {
    setupHappyPartner();
    const file = buildCsv(PARTNER_HEADERS, [[
      'Cafe Pirin', '', 'CAFE', '',
      '', '', '', '', 'cafe2@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80.7', '3.5', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    const venueArg = mockVenueCreate.mock.calls[0][0];
    expect(venueArg.data.capacity).toBe(80);
    expect(Number.isInteger(venueArg.data.capacity)).toBe(true);

    const stickerArg = mockStickerLocationCreateMany.mock.calls[0][0];
    expect(stickerArg.data.filter((r: any) => r.locationType === 'TABLE')).toHaveLength(3);

    expect(res.warnings.some((w) => w.includes('capacity') && w.includes('80'))).toBe(true);
    expect(res.warnings.some((w) => w.includes('tables') && w.includes('3'))).toBe(true);
  });

  it('does not create a venue when only capacity=0 is provided (audit #3)', async () => {
    setupHappyPartner();
    const file = buildCsv(PARTNER_HEADERS, [[
      'Empty Capacity', '', 'CAFE', '',
      '', '', '', '', 'ec@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '0', '0', '0',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    expect(mockVenueCreate).not.toHaveBeenCalled();
    expect(mockStickerLocationCreateMany).not.toHaveBeenCalled();
    expect(res.venuesCreated).toBe(0);
    expect(res.partnersCreated).toBe(1);
  });

  it('counts the partner as created even when venue.count throws (audit #2)', async () => {
    setupHappyPartner();
    mockVenueCount.mockRejectedValueOnce(new Error('database is down'));

    const file = buildCsv(PARTNER_HEADERS, [[
      'Cafe Pirin', '', 'CAFE', '',
      '', '', '', '', 'cafe3@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80', '3', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    expect(res.partnersCreated).toBe(1);
    expect(res.partnersSkipped).toBe(0);
    expect(res.errors).toEqual([]);
    expect(res.warnings.some((w) => w.toLowerCase().includes('failed to auto-create venue'))).toBe(true);
    expect(res.venuesCreated).toBe(0);
  });

  it('does not propagate synthetic @import.boomcard.bg email to Venue.email (audit #9)', async () => {
    setupHappyPartner();
    // empty email → service generates a placeholder @import.boomcard.bg
    const file = buildCsv(PARTNER_HEADERS, [[
      'No Email Partner', '', 'CAFE', '',
      '', '', '', '', '',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80', '2', '1',
    ]]);

    await importPartnersFromSpreadsheet(file, [], 'admin-1');

    const venueArg = mockVenueCreate.mock.calls[0][0];
    expect(venueArg.data.email).toBeUndefined();
  });

  it('skips venue creation when address/city is missing', async () => {
    setupHappyPartner();
    const file = buildCsv(PARTNER_HEADERS, [[
      'Cafe Pirin', '', 'CAFE', '',
      '', '', '', '', 'cafe4@example.com',
      '', '', '', '', '',
      '', '', 'ACTIVE',
      '80', '3', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    expect(mockVenueCreate).not.toHaveBeenCalled();
    expect(res.venuesCreated).toBe(0);
    expect(res.warnings.some((w) => w.toLowerCase().includes('address or city is missing'))).toBe(true);
  });

  it('skips venue creation when the partner already has venues, with a warning', async () => {
    setupHappyPartner({ existingVenues: 2 });
    const file = buildCsv(PARTNER_HEADERS, [[
      'Cafe Pirin', '', 'CAFE', '',
      '', '', '', '', 'cafe5@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80', '3', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    expect(mockVenueCreate).not.toHaveBeenCalled();
    expect(res.warnings.some((w) => w.includes('already has 2 venue'))).toBe(true);
  });

  it('increments partnersUpdated (not partnersCreated) when partner already exists', async () => {
    setupHappyPartner();
    // Pretend the partner record already exists for this user.
    mockPartnerFindUnique.mockResolvedValue({ id: 'partner-1' });
    mockPartnerUpdate.mockResolvedValue({ id: 'partner-1' });
    // The venue path will then see existingVenues=0 and try to create one;
    // we don't care about the venue assertions here.
    mockStickerLocationCreateMany.mockResolvedValue({ count: 0 });

    const file = buildCsv(PARTNER_HEADERS, [[
      'Existing Partner', '', 'CAFE', '',
      '', '', '', '', 'existing@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '', '', '',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');
    expect(res.partnersCreated).toBe(0);
    expect(res.partnersUpdated).toBe(1);
    expect(res.partnersSkipped).toBe(0);
    expect(res.partners[0]).toMatchObject({ businessName: 'Existing Partner', created: false });
  });

  it('rolls back the venue when stickerLocation.createMany rejects inside the tx', async () => {
    setupHappyPartner();
    // Simulate the createMany failing mid-transaction. The real Prisma
    // interactive transaction would roll the venue.create back; the warning
    // path must record this without bumping venuesCreated.
    mockStickerLocationCreateMany.mockRejectedValueOnce(new Error('FK violation'));
    // Make the transaction wrapper actually propagate the rejection, matching
    // Prisma's behaviour: when the callback throws, $transaction rejects with
    // the same error and rolls back.
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      try {
        return await fn({
          venue: { count: mockVenueCount, create: mockVenueCreate },
          stickerLocation: { createMany: mockStickerLocationCreateMany },
        });
      } catch (e) {
        throw e;
      }
    });

    const file = buildCsv(PARTNER_HEADERS, [[
      'Rollback Cafe', '', 'CAFE', '',
      '', '', '', '', 'rb@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80', '3', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');

    expect(res.venuesCreated).toBe(0);
    expect(res.stickerLocationsCreated).toBe(0);
    expect(res.partnersCreated).toBe(1);
    expect(res.warnings.some((w) => w.toLowerCase().includes('failed to auto-create venue') && w.includes('FK violation'))).toBe(true);
  });

  it('returns the new venuesCreated / stickerLocationsCreated counters (audit #8)', async () => {
    setupHappyPartner();
    // We mock createMany to return a real count to exercise the accumulator.
    mockStickerLocationCreateMany.mockResolvedValue({ count: 4 });

    const file = buildCsv(PARTNER_HEADERS, [[
      'Cafe Pirin', '', 'CAFE', '',
      '', '', '', '', 'cafe6@example.com',
      '1 Main St', 'Sofia', '', '', '',
      '', '', 'ACTIVE',
      '80', '3', '1',
    ]]);

    const res = await importPartnersFromSpreadsheet(file, [], 'admin-1');
    expect(res.venuesCreated).toBe(1);
    expect(res.stickerLocationsCreated).toBe(4);
  });
});
