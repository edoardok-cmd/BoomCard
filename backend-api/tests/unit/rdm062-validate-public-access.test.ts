/**
 * INV-RDM-062 (VIS, LOW): GET /api/stickers/validate/:stickerId is public — no auth required.
 *
 * Strategy: mock `authenticate` so that it actively returns 401 when invoked.
 * The route does NOT call authenticate, so valid/invalid sticker requests pass
 * straight through to the service layer and return 200 or 404 respectively.
 * Any accidental insertion of `authenticate` in the route would make both cases
 * fail with 401, which is the desired canary.
 */

// --- Mocks (must be declared before any import) ---

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    stickerLocation: { create: jest.fn(), createMany: jest.fn() },
    sticker: { create: jest.fn(), findUnique: jest.fn() },
    venueStickerConfig: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    stickerScan: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    validateStickerById: jest.fn(),
    activateSticker: jest.fn(),
    createStickerLocation: jest.fn(),
    createStickerLocationsBulk: jest.fn(),
    generateStickersBulk: jest.fn(),
    generateSticker: jest.fn(),
    updateVenueConfig: jest.fn(),
    getStickersByVenue: jest.fn(),
  },
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {},
}));

jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

/**
 * authenticate is mocked to REJECT with 401.
 * If the validate route were ever wired to call authenticate, the test
 * assertions below (expecting 200 / 404) would fail, catching the regression.
 *
 * All other middleware exports are no-ops so that the rest of the router
 * (which uses requireActiveAdmin, authorize, etc.) can still be registered
 * without crashing.
 */
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: jest.fn((_req: any, res: any, _next: any) =>
    res.status(401).json({ error: 'Unauthorized' }),
  ),
  optionalAuthenticate: (_req: any, _res: any, next: any) => next(),
  authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
  requireActiveAdmin: (_req: any, _res: any, next: any) => next(),
  requirePermission: (_permission: string) => (_req: any, _res: any, next: any) => next(),
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

// --- Imports ---

import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';
import { stickerService } from '../../src/services/sticker.service';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// ---------------------------------------------------------------------------

describe('INV-RDM-062 — GET /api/stickers/validate/:stickerId is public (no auth required)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with { success: true } for a valid sticker, without an Authorization header', async () => {
    (stickerService.validateStickerById as jest.Mock).mockResolvedValueOnce({
      valid: true,
      venueId: 'v1',
      venueName: 'Test Venue',
    });

    const res = await request(app)
      .get('/api/stickers/validate/STICKER-001');
      // No .set('Authorization', ...) — intentionally unauthenticated

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.venueId).toBe('v1');
    expect(res.body.venueName).toBe('Test Venue');
    expect(stickerService.validateStickerById).toHaveBeenCalledWith('STICKER-001');
  });

  it('returns 404 with { success: false } for an unknown sticker, without an Authorization header', async () => {
    (stickerService.validateStickerById as jest.Mock).mockResolvedValueOnce({
      valid: false,
      message: 'Sticker not found',
    });

    const res = await request(app)
      .get('/api/stickers/validate/UNKNOWN-999');
      // No .set('Authorization', ...) — intentionally unauthenticated

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Sticker not found');
    expect(stickerService.validateStickerById).toHaveBeenCalledWith('UNKNOWN-999');
  });

  it('does not invoke the authenticate middleware (canary: authenticate returns 401 when called)', async () => {
    const { authenticate } = require('../../src/middleware/auth.middleware');

    (stickerService.validateStickerById as jest.Mock).mockResolvedValueOnce({
      valid: true,
      venueId: 'v1',
      venueName: 'Test Venue',
    });

    const res = await request(app)
      .get('/api/stickers/validate/STICKER-001');

    // authenticate is wired to return 401 — if it had been called the status would be 401
    expect(res.status).not.toBe(401);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
