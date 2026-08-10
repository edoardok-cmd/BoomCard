/**
 * BC-REDEMPTION-RDM-052-5: LEAK guard — gpsVerificationEnabled/gpsRadiusMeters/
 * ocrVerificationEnabled must NOT appear in GET /api/stickers/venue/:venueId/config
 * response for PARTNER callers.
 *
 * INV-RDM-052: GET /api/stickers/venue/:venueId/config strips
 *   gpsVerificationEnabled, gpsRadiusMeters, ocrVerificationEnabled
 *   from the partner-facing response (stickers.routes.ts L765–771).
 *
 * The service mock returns a config WITH all three fields so the test would
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
// getOrCreateVenueConfig returns a config WITH the internal fields so that
// stripping is what removes them — not an accidental absence from the service.
const mockGetOrCreateVenueConfig = jest.fn();

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    getOrCreateVenueConfig: (...args: any[]) => mockGetOrCreateVenueConfig(...args),
    scanSticker: jest.fn(),
    uploadReceipt: jest.fn(),
    findDuplicateReceipt: jest.fn(),
    getAdminStats: jest.fn(),
    markStickerProcessing: jest.fn(),
    replaceSticker: jest.fn(),
    reactivateInactiveSticker: jest.fn(),
    updateVenueConfig: jest.fn(),
  },
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

// Config returned by the service — includes all internal fields so the route's
// destructuring stripping is the only thing that removes them.
const CONFIG_WITH_INTERNAL_FIELDS = {
  id: 'config-id-1',
  venueId: TEST_VENUE_ID,
  cashbackPercent: 5,
  premiumBonus: 2,
  platinumBonus: 5,
  minBillAmount: 10,
  maxCashbackPerScan: 50,
  maxScansPerDay: 5,
  maxScansPerMonth: 30,
  gpsVerificationEnabled: true,   // must NOT appear in partner response
  gpsRadiusMeters: 100,           // must NOT appear in partner response
  ocrVerificationEnabled: true,   // must NOT appear in partner response
  autoApproveThreshold: 30,
  isActive: true,
};

describe('INV-RDM-052 LEAK: gps/ocr verification fields stripped from partner config response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Venue is owned by the test partner — ownership gate passes.
    mockVenueFindUnique.mockResolvedValue({ partner: { userId: TEST_PARTNER_ID } });
    mockGetOrCreateVenueConfig.mockResolvedValue(CONFIG_WITH_INTERNAL_FIELDS);
  });

  it('[LEAK] INV-RDM-052a: GET /venue/:id/config does not include gpsVerificationEnabled for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.gpsVerificationEnabled).toBeUndefined();
    // maxScansPerDay must still be present — confirms selective strip, not empty response.
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[LEAK] INV-RDM-052b: GET /venue/:id/config does not include gpsRadiusMeters for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.gpsRadiusMeters).toBeUndefined();
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[LEAK] INV-RDM-052c: GET /venue/:id/config does not include ocrVerificationEnabled for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.ocrVerificationEnabled).toBeUndefined();
    expect(res.body.data.maxScansPerDay).toBe(5);
  });
});
