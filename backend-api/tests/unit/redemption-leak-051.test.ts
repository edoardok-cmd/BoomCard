/**
 * BC-REDEMPTION-RDM-051-5: LEAK guard — cashbackPercent/premiumBonus/platinumBonus/
 * maxCashbackPerScan/autoApproveThreshold must NOT appear in
 * GET /api/stickers/venue/:venueId/config response for PARTNER callers.
 *
 * INV-RDM-051a: GET /venue/:venueId/config strips cashbackPercent (stickers.routes.ts L768)
 * INV-RDM-051b: GET /venue/:venueId/config strips premiumBonus (stickers.routes.ts L768)
 * INV-RDM-051c: GET /venue/:venueId/config strips platinumBonus (stickers.routes.ts L768)
 * INV-RDM-051d: GET /venue/:venueId/config strips maxCashbackPerScan (stickers.routes.ts L769)
 * INV-RDM-051e: GET /venue/:venueId/config strips autoApproveThreshold (stickers.routes.ts L769)
 *
 * The service mock returns a config WITH all five @internal fields so the test
 * would fail if the route forgot to destructure them away.
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
// getOrCreateVenueConfig returns a config WITH the @internal fields so that
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

// ── currencyDisplay mock ─────────────────────────────────────────────────────
jest.mock('../../src/utils/currencyDisplay', () => ({
  isCurrencyTransitionWindowOpen: jest.fn().mockResolvedValue(false),
  toDualCurrency: (amount: number, _windowOpen?: boolean) => ({ bgn: null, eur: +(amount / 1.95583).toFixed(2), windowOpen: false }),
}));

// ── Auth middleware — role-aware so authorize regressions are detectable ──────
const TEST_PARTNER_ID = 'test-partner-id';
const TEST_VENUE_ID = 'test-venue-id';
// mutable so tests can swap role/userId per case
let mockUserRole = 'PARTNER';
let mockUserId = TEST_PARTNER_ID;

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: mockUserId, role: mockUserRole };
    next();
  },
  // Role-aware so a regression in the route's authorize() call list is caught.
  authorize: (...allowedRoles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    next();
  },
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

// Config returned by the service — includes all @internal fields so the route's
// destructuring stripping is the only thing that removes them.
const CONFIG_WITH_INTERNAL_FIELDS = {
  id: 'config-id-1',
  venueId: TEST_VENUE_ID,
  cashbackPercent: 5,         // @internal — must NOT appear in partner response
  premiumBonus: 2,            // @internal — must NOT appear in partner response
  platinumBonus: 5,           // @internal — must NOT appear in partner response
  maxCashbackPerScan: 50,     // @internal — must NOT appear in partner response
  autoApproveThreshold: 30,   // @internal — must NOT appear in partner response
  // Also stripped (INV-RDM-052) — included here to protect the single destructure block
  gpsVerificationEnabled: true,
  gpsRadiusMeters: 100,
  ocrVerificationEnabled: true,
  minBillAmount: 10,
  maxScansPerDay: 5,
  maxScansPerMonth: 30,
  isActive: true,
};

describe('INV-RDM-051 LEAK: internal cashback/threshold fields stripped from partner config response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default PARTNER role between tests.
    mockUserRole = 'PARTNER';
    mockUserId = TEST_PARTNER_ID;
    // Venue is owned by the test partner — ownership gate passes.
    mockVenueFindUnique.mockResolvedValue({ partner: { userId: TEST_PARTNER_ID } });
    mockGetOrCreateVenueConfig.mockResolvedValue(CONFIG_WITH_INTERNAL_FIELDS);
  });

  it('[LEAK] INV-RDM-051a: GET /venue/:id/config does not include cashbackPercent for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.cashbackPercent).toBeUndefined();
    // maxScansPerDay must still be present — confirms selective strip, not empty response.
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[LEAK] INV-RDM-051b: GET /venue/:id/config does not include premiumBonus for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.premiumBonus).toBeUndefined();
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[LEAK] INV-RDM-051c: GET /venue/:id/config does not include platinumBonus for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.platinumBonus).toBeUndefined();
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[LEAK] INV-RDM-051d: GET /venue/:id/config does not include maxCashbackPerScan for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.maxCashbackPerScan).toBeUndefined();
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[LEAK] INV-RDM-051e: GET /venue/:id/config does not include autoApproveThreshold for PARTNER', async () => {
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.autoApproveThreshold).toBeUndefined();
    expect(res.body.data.maxScansPerDay).toBe(5);
  });

  it('[AUTH] authorize gate rejects USER role (not in PARTNER/ADMIN/SUPER_ADMIN list)', async () => {
    mockUserRole = 'USER';
    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(403);

    expect(res.body.success).toBe(false);
    // Service must NOT be reached — auth gate fires first.
    expect(mockGetOrCreateVenueConfig).not.toHaveBeenCalled();
  });

  it('[XSCOPE] assertPartnerOwnsVenue returns 403 when venue belongs to a different partner', async () => {
    // Venue is owned by a different partner — ownership gate must block.
    mockVenueFindUnique.mockResolvedValue({ partner: { userId: 'other-partner-id' } });

    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/do not have access/i);
    // Service must NOT be called — stripping logic never reached.
    expect(mockGetOrCreateVenueConfig).not.toHaveBeenCalled();
  });

  it('[ADMIN-PASSTHROUGH] ADMIN role receives full config including all internal fields', async () => {
    // Admin callers get rawConfig directly (stickers.routes.ts L762: isAdmin ? rawConfig : ...)
    // — verifies the isAdmin branch is not accidentally inverted.
    mockUserRole = 'ADMIN';
    mockUserId = 'test-admin-id';

    const res = await request(app)
      .get(`/api/stickers/venue/${TEST_VENUE_ID}/config`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.cashbackPercent).toBe(5);
    expect(res.body.data.premiumBonus).toBe(2);
    expect(res.body.data.platinumBonus).toBe(5);
    expect(res.body.data.maxCashbackPerScan).toBe(50);
    expect(res.body.data.autoApproveThreshold).toBe(30);
    // Safe fields also present.
    expect(res.body.data.isActive).toBe(true);
  });
});
