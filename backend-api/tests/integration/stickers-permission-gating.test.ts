/**
 * Integration tests for QR/location write route permission gating (BC-REAUDIT-QR-PERM-1).
 *
 * SPEC §3.6 / §5.4: "Admin fully controls QR generation, deactivation, and replacement."
 * The intended permission model gates QR-lifecycle WRITES on the fine-grained `stickers.write` permission.
 *
 * Verifies that all six QR/location write routes require `stickers.write`:
 *   - POST /activate/:stickerId
 *   - POST /locations
 *   - POST /locations/bulk
 *   - POST /generate/bulk
 *   - POST /generate/:locationId
 *   - PUT /venue/:venueId/config
 *
 * Each route returns 403 Forbidden when an ADMIN (with proper role) lacks `stickers.write` permission.
 */

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    stickerLocation: { create: jest.fn(), createMany: jest.fn() },
    sticker: { create: jest.fn() },
    venueStickerConfig: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    stickerScan: { findMany: jest.fn(), count: jest.fn() },
  },
}));

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    activateSticker: jest.fn(),
    createStickerLocation: jest.fn(),
    createStickerLocationsBulk: jest.fn(),
    generateStickersBulk: jest.fn(),
    generateSticker: jest.fn(),
    updateVenueConfig: jest.fn(),
  },
}));

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {},
}));

jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

// Custom auth middleware mock that respects requirePermission checks.
// When a route has requirePermission('stickers.write'), we control whether
// req.user.permissions includes it for testing both allow and deny cases.
let mockUserPermissions: Set<string> = new Set();

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN' };
    next();
  },
  authorize: (...roles: string[]) => (_req: any, _res: any, next: any) => {
    // For testing, validate that roles were provided (ensures the middleware is called correctly)
    if (!roles || roles.length === 0) {
      throw new Error('authorize() must be called with at least one role');
    }
    next();
  },
  requirePermission: (permission: string) => (req: any, _res: any, next: any) => {
    // If the permission is missing from mockUserPermissions, return 403.
    if (!mockUserPermissions.has(permission)) {
      return _res.status(403).json({ success: false, error: `Missing permission: ${permission}` });
    }
    next();
  },
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';
import { stickerService } from '../../src/services/sticker.service';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

describe('QR/location write routes — requirePermission stickers.write gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear permissions (default deny)
    mockUserPermissions.clear();
  });

  /**
   * Test 1: POST /activate/:stickerId requires stickers.write
   */
  describe('POST /api/stickers/activate/:stickerId', () => {
    it('returns 403 when stickers.write permission is missing', async () => {
      mockUserPermissions.clear(); // No permissions

      const res = await request(app)
        .post('/api/stickers/activate/STICKER-001')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Missing permission/i);
    });

    it('succeeds (200/201) when stickers.write permission is present', async () => {
      mockUserPermissions.add('stickers.write');
      (stickerService.activateSticker as jest.Mock).mockResolvedValueOnce({
        id: 'sticker-1',
        stickerId: 'STICKER-001',
        status: 'ACTIVE',
      });

      const res = await request(app)
        .post('/api/stickers/activate/STICKER-001')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(stickerService.activateSticker).toHaveBeenCalledWith('STICKER-001');
    });
  });

  /**
   * Test 2: POST /locations requires stickers.write
   */
  describe('POST /api/stickers/locations', () => {
    it('returns 403 when stickers.write permission is missing', async () => {
      mockUserPermissions.clear();

      const res = await request(app)
        .post('/api/stickers/locations')
        .send({
          venueId: 'venue-1',
          name: 'Main Counter',
          locationType: 'COUNTER',
          locationNumber: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Missing permission/i);
    });

    it('succeeds when stickers.write permission is present', async () => {
      mockUserPermissions.add('stickers.write');
      (stickerService.createStickerLocation as jest.Mock).mockResolvedValueOnce({
        id: 'location-1',
        venueId: 'venue-1',
        name: 'Main Counter',
      });

      const res = await request(app)
        .post('/api/stickers/locations')
        .send({
          venueId: 'venue-1',
          name: 'Main Counter',
          locationType: 'COUNTER',
          locationNumber: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  /**
   * Test 3: POST /locations/bulk requires stickers.write
   */
  describe('POST /api/stickers/locations/bulk', () => {
    it('returns 403 when stickers.write permission is missing', async () => {
      mockUserPermissions.clear();

      const res = await request(app)
        .post('/api/stickers/locations/bulk')
        .send({
          locations: [
            { venueId: 'venue-1', name: 'Counter 1', locationType: 'COUNTER', locationNumber: 1 },
            { venueId: 'venue-1', name: 'Counter 2', locationType: 'COUNTER', locationNumber: 2 },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Missing permission/i);
    });

    it('succeeds when stickers.write permission is present', async () => {
      mockUserPermissions.add('stickers.write');
      (stickerService.createStickerLocationsBulk as jest.Mock).mockResolvedValueOnce([
        { id: 'loc-1', name: 'Counter 1' },
        { id: 'loc-2', name: 'Counter 2' },
      ]);

      const res = await request(app)
        .post('/api/stickers/locations/bulk')
        .send({
          locations: [
            { venueId: 'venue-1', name: 'Counter 1', locationType: 'COUNTER', locationNumber: 1 },
            { venueId: 'venue-1', name: 'Counter 2', locationType: 'COUNTER', locationNumber: 2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  /**
   * Test 4: POST /generate/bulk requires stickers.write
   */
  describe('POST /api/stickers/generate/bulk', () => {
    it('returns 403 when stickers.write permission is missing', async () => {
      mockUserPermissions.clear();

      const res = await request(app)
        .post('/api/stickers/generate/bulk')
        .send({
          locationIds: ['loc-1', 'loc-2'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Missing permission/i);
    });

    it('succeeds when stickers.write permission is present', async () => {
      mockUserPermissions.add('stickers.write');
      (stickerService.generateStickersBulk as jest.Mock).mockResolvedValueOnce([
        { id: 'sticker-1', stickerId: 'STICKER-001' },
        { id: 'sticker-2', stickerId: 'STICKER-002' },
      ]);

      const res = await request(app)
        .post('/api/stickers/generate/bulk')
        .send({
          locationIds: ['loc-1', 'loc-2'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  /**
   * Test 5: POST /generate/:locationId requires stickers.write
   */
  describe('POST /api/stickers/generate/:locationId', () => {
    it('returns 403 when stickers.write permission is missing', async () => {
      mockUserPermissions.clear();

      const res = await request(app)
        .post('/api/stickers/generate/loc-1')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Missing permission/i);
    });

    it('succeeds when stickers.write permission is present', async () => {
      mockUserPermissions.add('stickers.write');
      (stickerService.generateSticker as jest.Mock).mockResolvedValueOnce({
        id: 'sticker-1',
        stickerId: 'STICKER-001',
        locationId: 'loc-1',
      });

      const res = await request(app)
        .post('/api/stickers/generate/loc-1')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  /**
   * Test 6: PUT /venue/:venueId/config requires stickers.write
   */
  describe('PUT /api/stickers/venue/:venueId/config', () => {
    it('returns 403 when stickers.write permission is missing', async () => {
      mockUserPermissions.clear();

      const res = await request(app)
        .put('/api/stickers/venue/venue-1/config')
        .send({
          cashbackPercent: 2.5,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Missing permission/i);
    });

    it('succeeds when stickers.write permission is present', async () => {
      mockUserPermissions.add('stickers.write');
      (stickerService.updateVenueConfig as jest.Mock).mockResolvedValueOnce({
        id: 'config-1',
        venueId: 'venue-1',
        cashbackPercent: 2.5,
      });

      const res = await request(app)
        .put('/api/stickers/venue/venue-1/config')
        .send({
          cashbackPercent: 2.5,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  /**
   * Acceptance Criteria Validation:
   * Verify that an ADMIN without stickers.write gets 403 on all six routes.
   */
  describe('Acceptance Criteria: ADMIN without stickers.write receives 403 on all QR write routes', () => {
    beforeEach(() => {
      mockUserPermissions.clear(); // ADMIN but no stickers.write
    });

    it('all six routes return 403 when stickers.write is absent', async () => {
      const testCases = [
        { method: 'post', path: '/api/stickers/activate/STICKER-001', body: {} },
        {
          method: 'post',
          path: '/api/stickers/locations',
          body: { venueId: 'v1', name: 'L1', locationType: 'COUNTER', locationNumber: 1 },
        },
        {
          method: 'post',
          path: '/api/stickers/locations/bulk',
          body: { locations: [{ venueId: 'v1', name: 'L1', locationType: 'COUNTER', locationNumber: 1 }] },
        },
        { method: 'post', path: '/api/stickers/generate/bulk', body: { locationIds: ['loc-1'] } },
        { method: 'post', path: '/api/stickers/generate/loc-1', body: {} },
        { method: 'put', path: '/api/stickers/venue/venue-1/config', body: { cashbackPercent: 2.5 } },
      ];

      for (const testCase of testCases) {
        const req = request(app)[testCase.method as 'post' | 'put'](testCase.path);
        const res = await req.send(testCase.body);
        expect(res.status).toBe(403, `${testCase.method.toUpperCase()} ${testCase.path} should return 403`);
        expect(res.body.error).toMatch(/Missing permission/i);
      }
    });
  });

  /**
   * Read routes should be unaffected (no requirePermission gate added).
   */
  describe('Read routes remain unchanged (no requirePermission gate)', () => {
    it('GET /venue/:venueId (read) does not check stickers.write', async () => {
      mockUserPermissions.clear(); // No permissions at all (ADMIN with no stickers.write)

      // Mock the service to return sample stickers
      const prismaSticker = require('../../src/lib/prisma').default;
      prismaSticker.sticker.findMany = jest.fn().mockResolvedValueOnce([
        { id: 'sticker-1', stickerId: 'STICKER-001', status: 'ACTIVE', venueId: 'venue-1' },
      ]);

      const res = await request(app)
        .get('/api/stickers/venue/venue-1')
        .send();

      // If requirePermission('stickers.write') were present, this would return 403.
      // Since the read route intentionally LACKS requirePermission, we expect
      // 200 (or a service-layer error, not an auth error).
      // The route requires 'authorize' but NOT 'requirePermission', so 403 should not be
      // "Missing permission: stickers.write".
      expect(res.status).not.toBe(403);
      // Verify it's not a permission error by checking the error message (if any)
      if (res.status === 403) {
        expect(res.body.error).not.toMatch(/stickers\.write/);
      }
    });
  });
});
