/**
 * BC-REDEMPTION-SWPFIX-ARO-CLASS-SWEEP
 *
 * Class-sweep regression gate: all 4 scan mutation routes must block an
 * INACTIVE (aro=true) admin with HTTP 403 via the real requireActiveAdmin
 * middleware.
 *
 * Routes under test:
 *   POST /api/stickers/admin/approve/:scanId
 *   POST /api/stickers/admin/reject/:scanId
 *   POST /api/stickers/admin/bulk-approve
 *   POST /api/stickers/admin/bulk-reject
 *
 * Failure mode caught: if requireActiveAdmin is removed from any route the
 * handler runs instead, does not return 403, and the test assertion fails.
 */

// ── Prisma mock — must be first; auth.middleware and stickers.routes both import it ──
jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: { venue: { findUnique: jest.fn() } },
  prisma: { venue: { findUnique: jest.fn() } },
}));

// ── Auth-middleware transitive dependencies (needed when jest.requireActual loads it) ──
jest.mock('../../src/services/userActivity.service', () => ({
  touchUserActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/subscriptionGate', () => ({
  findEligibleSubscription: jest.fn(),
  subscriptionAllowsEarning: jest.fn(),
}));

// ── Auth middleware: use the REAL requireActiveAdmin; replace only authenticate ──
// Spreading jest.requireActual preserves requireActiveAdmin, requirePermission,
// and any other exports we did not explicitly override.
jest.mock('../../src/middleware/auth.middleware', () => {
  const real = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...real,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: 'aro-admin-1', email: 'aro@test.local', role: 'ADMIN', aro: true };
      next();
    },
    authorize: () => (_req: any, _res: any, next: any) => next(),
    requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
  };
});

// ── Sticker router service dependencies ──────────────────────────────────────
jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    approveScan: jest.fn(),
    rejectScan: jest.fn(),
    bulkApprove: jest.fn(),
    bulkReject: jest.fn(),
  },
}));
jest.mock('../../src/services/cashbackLifecycle.service', () => ({
  VOID_REASON_CATEGORIES: ['DUPLICATE', 'FRAUD', 'SYSTEM_ERROR', 'ADMIN_CORRECTION', 'PARTNER_DISPUTE', 'OTHER'],
}));
jest.mock('../../src/services/adminAlerts.service', () => ({
  ACTIVE_SCAN_STATUSES: ['PENDING', 'VALIDATING', 'MANUAL_REVIEW'],
  SUSPICIOUS_EXACT_CODES: [],
  SUSPICIOUS_PREFIX_CODES: [],
}));
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: { uploadImage: jest.fn() },
}));
jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Imports (after all jest.mock calls) ─────────────────────────────────────
import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';
import bookingsRouter from '../../src/routes/bookings.routes';
import { errorHandler } from '../../src/middleware/error.middleware';

// ── Test app (stickers) ───────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);
app.use(errorHandler);

// ── Test app (bookings) ───────────────────────────────────────────────────────
const bookingsApp = express();
bookingsApp.use(express.json());
bookingsApp.use('/api/bookings', bookingsRouter);
bookingsApp.use(errorHandler);

// ── Suite ─────────────────────────────────────────────────────────────────────
type RouteCase = { label: string; method: 'post' | 'patch' | 'put' | 'delete'; path: string };

const MUTATION_ROUTES: RouteCase[] = [
  { label: 'approve',      method: 'post', path: '/api/stickers/admin/approve/scan-1'  },
  { label: 'reject',       method: 'post', path: '/api/stickers/admin/reject/scan-1'   },
  { label: 'bulk-approve', method: 'post', path: '/api/stickers/admin/bulk-approve'    },
  { label: 'bulk-reject',  method: 'post', path: '/api/stickers/admin/bulk-reject'     },
];

describe('BC-REDEMPTION-SWPFIX-ARO-CLASS-SWEEP — requireActiveAdmin gates scan mutation routes', () => {
  test.each(MUTATION_ROUTES)(
    'POST $path ($label) → 403 for aro=true (inactive) admin',
    async ({ method, path }) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/inactive/i);
    },
  );
});

// ── INV-RDM-067 block ────────────────────────────────────────────────────────
const QR_WRITE_ROUTES: RouteCase[] = [
  { label: 'POST /locations',                  method: 'post',  path: '/api/stickers/locations'                   },
  { label: 'POST /locations/bulk',             method: 'post',  path: '/api/stickers/locations/bulk'              },
  { label: 'POST /generate/bulk',              method: 'post',  path: '/api/stickers/generate/bulk'               },
  { label: 'POST /generate/:locationId',       method: 'post',  path: '/api/stickers/generate/loc-1'              },
  { label: 'POST /activate/:stickerId',        method: 'post',  path: '/api/stickers/activate/stk-1'              },
  { label: 'POST /:stickerId/reactivate',      method: 'post',  path: '/api/stickers/stk-1/reactivate'            },
  { label: 'PATCH /:stickerId/processing',     method: 'patch', path: '/api/stickers/stk-1/processing'            },
  { label: 'PATCH /:stickerId/replace',        method: 'patch', path: '/api/stickers/stk-1/replace'               },
  { label: 'PUT /venue/:venueId/config',       method: 'put',   path: '/api/stickers/venue/venue-1/config'        },
];

describe('BC-REDEMPTION-SWPFIX-ARO-CLASS-SWEEP — requirePermission gates QR-management write routes (INV-RDM-067)', () => {
  test.each(QR_WRITE_ROUTES)(
    '$method $path ($label) → 403 for aro=true (inactive) admin',
    async ({ method, path }) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/inactive/i);
    },
  );
});

// ── INV-RDM-068 block ────────────────────────────────────────────────────────
const BOOKINGS_WRITE_ROUTES: RouteCase[] = [
  { label: 'PATCH /:id',  method: 'patch',  path: '/api/bookings/00000000-0000-0000-0000-000000000001' },
  { label: 'DELETE /:id', method: 'delete', path: '/api/bookings/00000000-0000-0000-0000-000000000001' },
];

describe('BC-REDEMPTION-SWPFIX-ARO-CLASS-SWEEP — requireActiveAdmin gates bookings admin-bypass paths (INV-RDM-068)', () => {
  test.each(BOOKINGS_WRITE_ROUTES)(
    '$method $path ($label) → 403 for aro=true (inactive) admin',
    async ({ method, path }) => {
      const res = await request(bookingsApp)[method](path).send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/inactive/i);
    },
  );

  it('GET /api/bookings/ → 403 for aro=true (inactive) admin (admin-list-all blocked by inline aro gate)', async () => {
    const res = await request(bookingsApp).get('/api/bookings/');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/inactive/i);
  });
});
