/**
 * §5 QR auth + receipt template fixes (2026-05-19)
 *
 * Three groups:
 *   A. §5.4 Critical — PARTNER role must receive 403 on all 6 QR/location write
 *      endpoints (spec: admin-only management).
 *   B. §5.4 IDOR — PARTNER role must receive 403 when reading a venue they do
 *      not own via GET /stickers/venue/:venueId endpoints.
 *   C. §5.5 — merchantNameVariations is used in the merchant similarity check:
 *      a match via a variation should score as well as the canonical name.
 */

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockVenueFindUnique = jest.fn();
const mockStickerFindMany = jest.fn();
const mockStickerScanFindMany = jest.fn();
const mockVenueStickerConfigFindFirst = jest.fn();
const mockVenueReceiptTemplateFindMany = jest.fn();
const mockVenueFraudConfigUpsert = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    venue: { findUnique: (...a: any[]) => mockVenueFindUnique(...a) },
    sticker: { findMany: (...a: any[]) => mockStickerFindMany(...a) },
    stickerScan: { findMany: (...a: any[]) => mockStickerScanFindMany(...a) },
    venueStickerConfig: { findFirst: (...a: any[]) => mockVenueStickerConfigFindFirst(...a) },
    venueReceiptTemplate: { findMany: (...a: any[]) => mockVenueReceiptTemplateFindMany(...a) },
    venueFraudConfig: { upsert: (...a: any[]) => mockVenueFraudConfigUpsert(...a) },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── Auth middleware: role injected per-test ───────────────────────────────────
let currentUser: { id: string; role: string } = { id: 'admin-1', role: 'ADMIN' };

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = currentUser;
    next();
  },
  authorize:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  // F-005: new subscription gate added to stickers.routes; this suite mocks auth
  // out entirely (it tests routing/handler logic, not subscription gating), so a
  // pass-through keeps the route stack intact.
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
  AuthRequest: {},
}));

jest.mock('../../src/middleware/partnerStatus.middleware', () => ({
  requireActivePartnerForWrites: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    createStickerLocation: jest.fn(async () => ({ id: 'loc-1' })),
    createStickerLocationsBulk: jest.fn(async () => []),
    generateSticker: jest.fn(async () => ({ id: 'sticker-1' })),
    generateStickersBulk: jest.fn(async () => []),
    activateSticker: jest.fn(async () => ({ id: 'sticker-1' })),
    getStickersByVenue: jest.fn(async () => []),
    getScansByVenue: jest.fn(async () => []),
    getVenueAnalytics: jest.fn(async () => ({})),
    getOrCreateVenueConfig: jest.fn(async () => ({})),
    updateVenueConfig: jest.fn(async () => ({})),
  },
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {},
}));

jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/adminAlerts.service', () => ({
  ACTIVE_SCAN_STATUSES: [],
  SUSPICIOUS_EXACT_CODES: [],
  SUSPICIOUS_PREFIX_CODES: [],
}));

jest.mock('../../src/utils/validation', () => ({
  validateAmount: jest.fn(),
  validateGPSCoordinates: jest.fn(),
  ValidationError: class ValidationError extends Error {},
}));

jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: jest.fn(async () => false),
}));

import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// ─────────────────────────────────────────────────────────────────────────────
// GROUP A — §5.4 Critical: PARTNER blocked on all 6 write endpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('§5.4 Critical — write endpoints reject PARTNER role', () => {
  beforeEach(() => {
    currentUser = { id: 'partner-user-1', role: 'PARTNER' };
    jest.clearAllMocks();
  });

  it('POST /locations → 403', async () => {
    const res = await request(app)
      .post('/api/stickers/locations')
      .send({ venueId: 'v1', name: 'Table 1', locationType: 'TABLE', locationNumber: 1 });
    expect(res.status).toBe(403);
  });

  it('POST /locations/bulk → 403', async () => {
    const res = await request(app)
      .post('/api/stickers/locations/bulk')
      .send({ locations: [{ venueId: 'v1', name: 'T1', locationType: 'TABLE', locationNumber: 1 }] });
    expect(res.status).toBe(403);
  });

  it('POST /generate/:locationId → 403', async () => {
    const res = await request(app).post('/api/stickers/generate/loc-1');
    expect(res.status).toBe(403);
  });

  it('POST /generate/bulk → 403', async () => {
    const res = await request(app)
      .post('/api/stickers/generate/bulk')
      .send({ locationIds: ['loc-1'] });
    expect(res.status).toBe(403);
  });

  it('POST /activate/:stickerId → 403', async () => {
    const res = await request(app).post('/api/stickers/activate/sticker-1');
    expect(res.status).toBe(403);
  });

  it('PUT /venue/:venueId/config → 403', async () => {
    const res = await request(app)
      .put('/api/stickers/venue/v1/config')
      .send({ someConfig: true });
    expect(res.status).toBe(403);
  });

  it('ADMIN can still POST /locations → not 403', async () => {
    currentUser = { id: 'admin-1', role: 'ADMIN' };
    const res = await request(app)
      .post('/api/stickers/locations')
      .send({ venueId: 'v1', name: 'Table 1', locationType: 'TABLE', locationNumber: 1 });
    expect(res.status).not.toBe(403);
  });

  it('ADMIN can still PUT /venue/:venueId/config → not 403', async () => {
    currentUser = { id: 'admin-1', role: 'ADMIN' };
    const res = await request(app)
      .put('/api/stickers/venue/v1/config')
      .send({ someConfig: true });
    expect(res.status).not.toBe(403);
  });

  it('ADMIN POST /generate/bulk calls generateStickersBulk, not generateSticker', async () => {
    // Regression guard: /generate/bulk must be registered BEFORE /generate/:locationId
    // so Express does not swallow "bulk" as a locationId parameter.
    currentUser = { id: 'admin-1', role: 'ADMIN' };
    const { stickerService } = require('../../src/services/sticker.service');
    const res = await request(app)
      .post('/api/stickers/generate/bulk')
      .send({ locationIds: ['loc-1', 'loc-2'] });
    expect(res.status).not.toBe(403);
    expect(stickerService.generateStickersBulk).toHaveBeenCalled();
    expect(stickerService.generateSticker).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP B — §5.4 IDOR: PARTNER blocked from reading another partner's venue
// ─────────────────────────────────────────────────────────────────────────────

describe('§5.4 IDOR — GET venue endpoints enforce partner ownership', () => {
  beforeEach(() => {
    currentUser = { id: 'partner-user-1', role: 'PARTNER' };
    jest.clearAllMocks();
  });

  const venueOwnedByOther = {
    partner: { userId: 'other-partner-user' },
  };
  const venueOwnedBySelf = {
    partner: { userId: 'partner-user-1' },
  };

  it('GET /venue/:venueId → 403 when venue belongs to another partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedByOther);
    const res = await request(app).get('/api/stickers/venue/v-other');
    expect(res.status).toBe(403);
  });

  it('GET /venue/:venueId/scans → 403 when venue belongs to another partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedByOther);
    const res = await request(app).get('/api/stickers/venue/v-other/scans');
    expect(res.status).toBe(403);
  });

  it('GET /venue/:venueId/analytics → 403 when venue belongs to another partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedByOther);
    const res = await request(app).get('/api/stickers/venue/v-other/analytics');
    expect(res.status).toBe(403);
  });

  it('GET /venue/:venueId/config → 403 when venue belongs to another partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedByOther);
    const res = await request(app).get('/api/stickers/venue/v-other/config');
    expect(res.status).toBe(403);
  });

  it('GET /venue/:venueId → 200 when venue belongs to the authenticated partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedBySelf);
    const res = await request(app).get('/api/stickers/venue/v-mine');
    expect(res.status).toBe(200);
  });

  it('GET /venue/:venueId/scans → 200 when venue belongs to the authenticated partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedBySelf);
    const res = await request(app).get('/api/stickers/venue/v-mine/scans');
    expect(res.status).toBe(200);
  });

  it('GET /venue/:venueId/analytics → 200 when venue belongs to the authenticated partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedBySelf);
    const res = await request(app).get('/api/stickers/venue/v-mine/analytics');
    expect(res.status).toBe(200);
  });

  it('GET /venue/:venueId/config → 200 when venue belongs to the authenticated partner', async () => {
    mockVenueFindUnique.mockResolvedValue(venueOwnedBySelf);
    const res = await request(app).get('/api/stickers/venue/v-mine/config');
    expect(res.status).toBe(200);
  });

  it('GET /venue/:venueId → 403 when venue does not exist (defensive: no existence leak)', async () => {
    mockVenueFindUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/stickers/venue/v-nonexistent');
    expect(res.status).toBe(403);
  });

  it('ADMIN bypasses ownership check for GET /venue/:venueId', async () => {
    currentUser = { id: 'admin-1', role: 'ADMIN' };
    // No mockVenueFindUnique setup needed — the helper skips non-PARTNER roles.
    mockVenueFindUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/stickers/venue/v-any');
    expect(res.status).toBe(200);
    // assertPartnerOwnsVenue should not have queried the DB for admin.
    expect(mockVenueFindUnique).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP C — §5.5: merchantNameVariations used in template comparison
// ─────────────────────────────────────────────────────────────────────────────

import { receiptTemplateService } from '../../src/services/receiptTemplate.service';
import { fraudDetectionService } from '../../src/services/fraudDetection.service';

// Minimal TemplateConfig that makes the merchant score deterministic.
const cfg = {
  templateVisualWeight:      0,   // ignore visual for these tests
  templateMerchantWeight:    1,   // merchant score is the whole score
  templateKeywordWeight:     0,
  templateMinSimilarity:     0.8,
  templateFraudPoints:       10,
  templateMerchantThreshold: 0.7,
};

// DHASH_HEX_LENGTH = 60 chars (DHASH_BITS=240 / 4). Visual weight = 0 so the
// actual hash content is irrelevant; only the length check matters.
const DUMMY_HASH = '0'.repeat(60);

describe('§5.5 — merchantNameVariations used in similarity scoring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches via a variation when canonical name does not match', async () => {
    mockVenueReceiptTemplateFindMany.mockResolvedValue([
      {
        id: 't1',
        perceptualHash:         DUMMY_HASH,
        merchantName:           'Кафе Централ',
        merchantNameVariations: ['KAFE CENTRAL', 'cafe central'],
        expectedKeywords:       [],
      },
    ]);

    const result = await receiptTemplateService.compareAgainstTemplates({
      venueId:        'v1',
      perceptualHash: DUMMY_HASH,
      merchantName:   'cafe central', // matches variation, not canonical
      ocrRawText:     '',
      config:         cfg,
    });

    expect(result.matches).toBe(true);
    expect(result.reason).toBe('TEMPLATE_MATCH_OK');
  });

  it('does not match when name differs from canonical and all variations', async () => {
    mockVenueReceiptTemplateFindMany.mockResolvedValue([
      {
        id: 't1',
        perceptualHash:         DUMMY_HASH,
        merchantName:           'Кафе Централ',
        merchantNameVariations: ['KAFE CENTRAL'],
        expectedKeywords:       [],
      },
    ]);

    const result = await receiptTemplateService.compareAgainstTemplates({
      venueId:        'v1',
      perceptualHash: DUMMY_HASH,
      merchantName:   'Пицария Рома', // completely different
      ocrRawText:     '',
      config:         cfg,
    });

    expect(result.matches).toBe(false);
    expect(result.reason).toBe('TEMPLATE_MISMATCH');
  });

  it('still matches via canonical name when no variations present', async () => {
    mockVenueReceiptTemplateFindMany.mockResolvedValue([
      {
        id: 't1',
        perceptualHash:         DUMMY_HASH,
        merchantName:           'Cafe Central',
        merchantNameVariations: [],
        expectedKeywords:       [],
      },
    ]);

    const result = await receiptTemplateService.compareAgainstTemplates({
      venueId:        'v1',
      perceptualHash: DUMMY_HASH,
      merchantName:   'cafe central',
      ocrRawText:     '',
      config:         cfg,
    });

    expect(result.matches).toBe(true);
  });

  it('takes the best score across canonical and all variations', async () => {
    mockVenueReceiptTemplateFindMany.mockResolvedValue([
      {
        id: 't1',
        perceptualHash:         DUMMY_HASH,
        merchantName:           'ABC Corp',
        merchantNameVariations: ['XYZ Corp', 'BoomShop'],
        expectedKeywords:       [],
      },
    ]);

    // 'boomshop' matches variation 'BoomShop' exactly.
    const result = await receiptTemplateService.compareAgainstTemplates({
      venueId:        'v1',
      perceptualHash: DUMMY_HASH,
      merchantName:   'boomshop',
      ocrRawText:     '',
      config:         cfg,
    });

    expect(result.matches).toBe(true);
    expect(result.bestSimilarity).toBeGreaterThanOrEqual(cfg.templateMinSimilarity);
  });

  it('merchantName="" is treated as absent — gets 0.5 neutral, threshold NOT applied', async () => {
    // If '' were truthy, the threshold path would run:
    //   merchantSimilarity('', 'Cafe Central') → Jaccard({} ∩ {cafe,central}) = 0
    //   0 < threshold 0.99 → merchantScore = 0 → overall 0 < minSimilarity 0.4 → matches=false  (WRONG)
    // Correct path: '' is falsy → rawMerchantScore = 0.5 (neutral fallback)
    //   merchantScore = 0.5 → overall 0.5 ≥ minSimilarity 0.4 → matches=true  (RIGHT)
    const emptyCfg = { ...cfg, templateMinSimilarity: 0.4, templateMerchantThreshold: 0.99 };

    mockVenueReceiptTemplateFindMany.mockResolvedValue([
      {
        id: 't1',
        perceptualHash:         DUMMY_HASH,
        merchantName:           'Cafe Central',
        merchantNameVariations: [],
        expectedKeywords:       [],
      },
    ]);

    const result = await receiptTemplateService.compareAgainstTemplates({
      venueId:        'v1',
      perceptualHash: DUMMY_HASH,
      merchantName:   '',
      ocrRawText:     '',
      config:         emptyCfg,
    });

    // 0.5 (neutral) ≥ 0.4 (minSimilarity) → matches=true confirms threshold was not applied.
    expect(result.matches).toBe(true);
    expect(result.bestSimilarity).toBeCloseTo(0.5);
  });

  it('templateMerchantThreshold floors merchant score to 0 when below threshold', async () => {
    // Use a strict threshold so a partial merchant match is floored to 0.
    // With merchantWeight=1 and visualWeight=0, only the merchant dimension contributes.
    // A score of 0 → overall 0 < minSimilarity 0.8 → TEMPLATE_MISMATCH.
    const strictCfg = { ...cfg, templateMerchantThreshold: 0.99 };

    mockVenueReceiptTemplateFindMany.mockResolvedValue([
      {
        id: 't1',
        perceptualHash:         DUMMY_HASH,
        merchantName:           'Cafe Central BG',     // has an extra token
        merchantNameVariations: [],
        expectedKeywords:       [],
      },
    ]);

    // 'cafe central' vs 'Cafe Central BG' → Jaccard({cafe,central} ∩ {cafe,central,bg}) = 2/3 ≈ 0.67
    // 0.67 < threshold 0.99 → rawMerchantScore floored to 0 → overall 0 → TEMPLATE_MISMATCH
    const result = await receiptTemplateService.compareAgainstTemplates({
      venueId:        'v1',
      perceptualHash: DUMMY_HASH,
      merchantName:   'cafe central',
      ocrRawText:     '',
      config:         strictCfg,
    });

    expect(result.matches).toBe(false);
    expect(result.reason).toBe('TEMPLATE_MISMATCH');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP D — §5.5: fraudDetectionService.updateVenueConfig weight validation
// ─────────────────────────────────────────────────────────────────────────────

describe('§5.5 — fraudDetectionService.updateVenueConfig weight/threshold validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Happy-path upsert succeeds (returns minimal object)
    mockVenueFraudConfigUpsert.mockResolvedValue({ venueId: 'v1' });
  });

  // ── Weight individual range ──────────────────────────────────────────────

  it('rejects templateVisualWeight < 0', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   -0.1,
        templateMerchantWeight: 0.6,
        templateKeywordWeight:  0.5,
      })
    ).rejects.toThrow('templateVisualWeight must be a number between 0 and 1');
  });

  it('rejects templateMerchantWeight > 1', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   0.3,
        templateMerchantWeight: 1.5,
        templateKeywordWeight:  0.2,
      })
    ).rejects.toThrow('templateMerchantWeight must be a number between 0 and 1');
  });

  it('rejects non-numeric templateKeywordWeight', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   0.5,
        templateMerchantWeight: 0.3,
        templateKeywordWeight:  'high' as any,
      })
    ).rejects.toThrow('templateKeywordWeight must be a number between 0 and 1');
  });

  // ── All-three-weights sum check ──────────────────────────────────────────

  it('rejects three weights that do not sum to 1.0', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   0.6,
        templateMerchantWeight: 0.3,
        templateKeywordWeight:  0.3,  // sum = 1.2
      })
    ).rejects.toThrow('must sum to 1.0');
  });

  it('accepts three weights that sum to exactly 1.0', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   0.5,
        templateMerchantWeight: 0.3,
        templateKeywordWeight:  0.2,
      })
    ).resolves.toBeDefined();
  });

  it('accepts three weights within the 0.001 tolerance', async () => {
    // floating-point: code sums 0.7 + 0.2 + 0.1 = 0.9999999... (not exactly 1) — must not reject
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   0.7,
        templateMerchantWeight: 0.2,
        templateKeywordWeight:  0.1,
      })
    ).resolves.toBeDefined();
  });

  it('rejects partial weight update (one of three)', async () => {
    // A single-weight update would break the sum-to-1 invariant in the DB.
    await expect(
      fraudDetectionService.updateVenueConfig('v1', { templateVisualWeight: 0.8 })
    ).rejects.toThrow('must all be updated together');
  });

  it('rejects partial weight update (two of three)', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', {
        templateVisualWeight:   0.6,
        templateMerchantWeight: 0.4,
      })
    ).rejects.toThrow('must all be updated together');
  });

  // ── Threshold fields ──────────────────────────────────────────────────────

  it('rejects templateMinSimilarity > 1', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', { templateMinSimilarity: 1.1 })
    ).rejects.toThrow('templateMinSimilarity must be a number between 0 and 1');
  });

  it('rejects templateMerchantThreshold < 0', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', { templateMerchantThreshold: -0.5 })
    ).rejects.toThrow('templateMerchantThreshold must be a number between 0 and 1');
  });

  it('accepts templateMerchantThreshold = 0 (disable threshold)', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', { templateMerchantThreshold: 0 })
    ).resolves.toBeDefined();
  });

  // ── Fraud points ──────────────────────────────────────────────────────────

  it('rejects negative templateFraudPoints', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', { templateFraudPoints: -5 })
    ).rejects.toThrow('templateFraudPoints must be a non-negative number');
  });

  it('accepts templateFraudPoints = 0', async () => {
    await expect(
      fraudDetectionService.updateVenueConfig('v1', { templateFraudPoints: 0 })
    ).resolves.toBeDefined();
  });
});
