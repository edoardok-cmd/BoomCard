/**
 * BC-REDEMPTION-RDM-054-5: LEAK guard — fraudScore/fraudReasons/ipAddress/
 * userAgent/deviceFingerprint/ocrData must NOT appear in
 * GET /api/stickers/venue/:venueId/scans response for PARTNER callers.
 *
 * INV-RDM-054: GET /api/stickers/venue/:venueId/scans strips
 *   fraudScore, fraudReasons, ipAddress, userAgent, deviceFingerprint, ocrData
 *   (plus specRiskLevel, deviceFingerprintRaw, receiptImageHash, cashbackAmount,
 *   cashbackPercent) from the partner-facing response (stickers.routes.ts L680).
 *
 * The service mock returns a scan WITH all the forbidden fields so the test would
 * fail if the route forgot to destructure them away.
 */

// ── Prisma mock ──────────────────────────────────────────────────────────────
// assertPartnerOwnsVenue calls prisma.venue.findUnique to confirm ownership.
const mockVenueFindUnique = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    venue: { findUnique: mockVenueFindUnique },
  },
  prisma: {
    venue: { findUnique: mockVenueFindUnique },
  },
}));

// ── Service mock ─────────────────────────────────────────────────────────────
// getScansByVenue returns a scan WITH all the internal/PII fields so that
// stripping is what removes them — not an accidental absence from the service.
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
    reactivateInactiveSticker: jest.fn(),
    updateVenueConfig: jest.fn(),
    getOrCreateVenueConfig: jest.fn(),
    getVenueAnalytics: jest.fn(),
  },
}));

// ── currencyDisplay mock ─────────────────────────────────────────────────────
jest.mock('../../src/utils/currencyDisplay', () => ({
  isCurrencyTransitionWindowOpen: jest.fn().mockResolvedValue(false),
  toDualCurrency: (amount: number) => ({ bgn: null, eur: +(amount / 1.95583).toFixed(2), windowOpen: false }),
}));

// ── Auth middleware: authenticated PARTNER ────────────────────────────────────
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

// ── Upload / image mocks (needed by other routes on the same router) ─────────
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/subscriptionGate', () => ({
  findEligibleSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
  subscriptionAllowsEarning: jest.fn().mockReturnValue(true),
}));

jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: { uploadImage: jest.fn() },
}));

// ── Imports (must come after jest.mock hoisting) ─────────────────────────────
import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// Scan returned by the service — includes all internal/PII fields so the
// route's destructuring stripping is the only thing that removes them.
const SCAN_WITH_INTERNAL_FIELDS = {
  id: 'scan-id-1',
  venueId: TEST_VENUE_ID,
  status: 'PENDING',
  billAmount: 200,
  verifiedAmount: 200,
  fraudScore: 0.85,                  // must NOT appear in partner response
  fraudReasons: ['DUPLICATE_IP'],    // must NOT appear in partner response
  specRiskLevel: 'HIGH',             // must NOT appear in partner response
  ipAddress: '192.168.1.1',          // must NOT appear in partner response
  userAgent: 'Mozilla/5.0',          // must NOT appear in partner response
  deviceFingerprint: 'fp-abc123',    // must NOT appear in partner response
  deviceFingerprintRaw: '{"raw":1}', // must NOT appear in partner response
  ocrData: { text: 'receipt text' }, // must NOT appear in partner response
  receiptImageHash: 'sha256-abc',    // must NOT appear in partner response
  cashbackAmount: 10,                // must NOT appear in partner response
  cashbackPercent: 5,                // must NOT appear in partner response
  createdAt: '2026-06-29T00:00:00Z',
};

describe('INV-RDM-054 LEAK: fraud/PII fields stripped from venue scans response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Venue is owned by the test partner — ownership gate passes.
    mockVenueFindUnique.mockResolvedValue({ partner: { userId: TEST_PARTNER_ID } });
    mockGetScansByVenue.mockResolvedValue([SCAN_WITH_INTERNAL_FIELDS]);
  });

  it('[LEAK] INV-RDM-054a: GET /venue/:id/scans does not include fraudScore for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/scans`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data[0].fraudScore).toBeUndefined();
    // status must still be present — confirms selective strip, not empty response.
    expect(res.body.data[0].status).toBe('PENDING');
  });

  it('[LEAK] INV-RDM-054b: GET /venue/:id/scans does not include fraudReasons for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/scans`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data[0].fraudReasons).toBeUndefined();
    expect(res.body.data[0].status).toBe('PENDING');
  });

  it('[LEAK] INV-RDM-054c: GET /venue/:id/scans does not include ipAddress for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/scans`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data[0].ipAddress).toBeUndefined();
    expect(res.body.data[0].status).toBe('PENDING');
  });

  it('[LEAK] INV-RDM-054d: GET /venue/:id/scans does not include userAgent for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/scans`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data[0].userAgent).toBeUndefined();
    expect(res.body.data[0].status).toBe('PENDING');
  });

  it('[LEAK] INV-RDM-054e: GET /venue/:id/scans does not include any remaining internal fields for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/scans`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const scan = res.body.data[0];
    // All 11 forbidden fields must be absent — the fixture supplies all of them
    // so a destructuring regression on any one would flip this test.
    expect(scan.specRiskLevel).toBeUndefined();
    expect(scan.deviceFingerprint).toBeUndefined();
    expect(scan.deviceFingerprintRaw).toBeUndefined();
    expect(scan.ocrData).toBeUndefined();
    expect(scan.receiptImageHash).toBeUndefined();
    expect(scan.cashbackAmount).toBeUndefined();
    expect(scan.cashbackPercent).toBeUndefined();
    // status must still be present — confirms selective strip, not empty response.
    expect(scan.status).toBe('PENDING');
  });
});
