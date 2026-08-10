/**
 * BC-REDEMPTION-RDM-053-5: LEAK guard — cashbackAmount and cashbackPercent
 * must NOT appear in GET /venue/:venueId/scans responses.
 *
 * INV-RDM-053: GET /venue/:venueId/scans strips both cashbackAmount and
 * cashbackPercent (stickers.routes.ts L680)
 *
 * The service mock intentionally returns cashbackAmount: 15 and
 * cashbackPercent: 7.5 so the test would fail if the route forgot to
 * destructure them away.
 */

// ── Prisma mock ──────────────────────────────────────────────────────────────
const mockVenueFindUnique = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    venue: { findUnique: mockVenueFindUnique },
    stickerScan: { findFirst: jest.fn() },
    $executeRaw: jest.fn(),
  },
  prisma: {
    venue: { findUnique: mockVenueFindUnique },
    stickerScan: { findFirst: jest.fn() },
    $executeRaw: jest.fn(),
  },
}));

// ── Service mock ─────────────────────────────────────────────────────────────
// getScansByVenue returns a scan WITH cashbackAmount and cashbackPercent so
// the route's destructuring is what removes them — not an accidental absence
// from the service payload.
const mockGetScansByVenue = jest.fn();

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    getScansByVenue: (...args: any[]) => mockGetScansByVenue(...args),
    scanSticker: jest.fn(),
    uploadReceipt: jest.fn(),
    findDuplicateReceipt: jest.fn(),
    getAdminStats: jest.fn(),
    markStickerProcessing: jest.fn(),
    replaceSticker: jest.fn(),
    getStickersByVenue: jest.fn(),
    getVenueAnalytics: jest.fn(),
    getScansByUser: jest.fn(),
  },
}));

// ── Auth middleware: PARTNER user ────────────────────────────────────────────
const TEST_PARTNER_ID = 'test-partner-id';
const TEST_VENUE_ID = 'test-venue-id';

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_PARTNER_ID, role: 'PARTNER' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
  requireActiveAdmin: (_req: any, _res: any, next: any) => next(),
}));

// ── Upload + image mocks (required by router import, unused in GET paths) ────
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: jest.fn().mockResolvedValue({ url: 'https://s3/fake', key: 'fake-key' }),
  },
}));

// ── Imports (must come after jest.mock hoisting) ─────────────────────────────
import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// ── Scan payload that includes both internal cashback fields ─────────────────
// The route must strip cashbackAmount and cashbackPercent (§11.3 / Clash 10.6)
// before sending the response. billAmount and status are kept so we can verify
// the strip is selective (i.e. the route did not just return an empty object).
const SCAN_WITH_CASHBACK = {
  id: 'scan-id-1',
  venueId: TEST_VENUE_ID,
  status: 'PENDING',
  billAmount: 100,
  verifiedAmount: 95,
  cashbackAmount: 15,   // <-- must NOT appear in the HTTP response
  cashbackPercent: 7.5, // <-- must NOT appear in the HTTP response
  fraudScore: 0.1,
  fraudReasons: [],
  specRiskLevel: 'LOW',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  deviceFingerprint: null,
  deviceFingerprintRaw: null,
  ocrData: null,
  receiptImageHash: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('INV-RDM-053 LEAK: cashbackAmount and cashbackPercent stripped from GET /venue/:venueId/scans', () => {
  let responseData: Record<string, unknown>;

  beforeAll(async () => {
    // assertPartnerOwnsVenue: partner owns the venue
    mockVenueFindUnique.mockResolvedValue({ partner: { userId: TEST_PARTNER_ID } });
    // Service returns a scan that includes both internal cashback fields
    mockGetScansByVenue.mockResolvedValue([SCAN_WITH_CASHBACK]);

    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/scans`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    responseData = res.body.data[0] as Record<string, unknown>;
  });

  it('[LEAK] INV-RDM-053a: cashbackAmount absent from response items (stickers.routes.ts L680)', () => {
    expect(responseData.cashbackAmount).toBeUndefined();
  });

  it('[LEAK] INV-RDM-053b: cashbackPercent absent from response items (stickers.routes.ts L680)', () => {
    expect(responseData.cashbackPercent).toBeUndefined();
  });

  it('[LEAK] INV-RDM-053c: non-internal fields retained (selective strip, not blank object)', () => {
    // id and status survive the destructuring — confirms the route is not
    // returning an empty object as a side effect of over-eager stripping.
    expect(responseData.id).toBe('scan-id-1');
    expect(responseData.status).toBe('PENDING');
  });
});
