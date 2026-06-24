/**
 * Unit tests for the admin sticker-review route (spec §3.2 / §7.1).
 *
 * Verifies that the four new query params pin Prisma's `where` clause
 * correctly, since these are the load-bearing pieces wired up to alert
 * deep-links:
 *   - status=active  → status: { in: ACTIVE_SCAN_STATUSES }
 *   - reasons=A,B    → fraudReasons: { hasSome: ['A', 'B'] }
 *   - suspicious=true → triggers raw subquery + id: { in: ids }
 *   - bucket=HIGH_61_PLUS without status → no status filter
 *
 * Also covers the §5.4 admin sticker management routes:
 *   - PATCH /:stickerId/processing — advance PENDING → PROCESSING
 *   - PATCH /:stickerId/replace    — atomically replace a sticker
 */

const mockMarkStickerProcessing = jest.fn();
const mockReplaceSticker = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    stickerScan: { findMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
  },
  prisma: {
    stickerScan: { findMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

// Mock auth middleware: short-circuit to ADMIN; requirePermission always passes.
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  // F-005: new subscription gate added to stickers.routes; pass-through here since
  // this suite exercises admin routes (gate is USER-only) and mocks auth out.
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

// Mock heavy services pulled in transitively to keep the unit test cheap.
jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    getAdminStats: jest.fn(),
    markStickerProcessing: (...args: any[]) => mockMarkStickerProcessing(...args),
    replaceSticker: (...args: any[]) => mockReplaceSticker(...args),
  },
}));
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {},
}));
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

import express from 'express';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import stickersRouter from '../../src/routes/stickers.routes';

const m = prisma as unknown as {
  stickerScan: { findMany: jest.Mock; count: jest.Mock };
  $queryRaw: jest.Mock;
};

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

describe('GET /api/stickers/admin/pending-review query params', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    m.stickerScan.findMany.mockResolvedValue([]);
    m.stickerScan.count.mockResolvedValue(0);
    m.$queryRaw.mockResolvedValue([]);
  });

  it('status=active maps to IN (PENDING, VALIDATING, MANUAL_REVIEW)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?status=active').expect(200);
    expect(m.stickerScan.findMany).toHaveBeenCalledTimes(1);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: expect.arrayContaining(['PENDING', 'VALIDATING', 'MANUAL_REVIEW']) });
  });

  it('reasons=FRAUD_CHECK_ERROR maps to fraudReasons: { hasSome }', async () => {
    await request(app).get('/api/stickers/admin/pending-review?reasons=FRAUD_CHECK_ERROR&status=active').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.fraudReasons).toEqual({ hasSome: ['FRAUD_CHECK_ERROR'] });
  });

  it('reasons=A,B,C splits CSV into multiple codes', async () => {
    await request(app).get('/api/stickers/admin/pending-review?reasons=A,B,C').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.fraudReasons).toEqual({ hasSome: ['A', 'B', 'C'] });
  });

  it('suspicious=true triggers raw subquery and constrains where.id', async () => {
    m.$queryRaw.mockResolvedValueOnce([{ id: 'scan-1' }, { id: 'scan-2' }]);
    await request(app).get('/api/stickers/admin/pending-review?suspicious=true&status=active').expect(200);
    expect(m.$queryRaw).toHaveBeenCalledTimes(1);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: ['scan-1', 'scan-2'] });
  });

  it('suspicious=true with zero matches yields id:{ in: [] } (no rows)', async () => {
    m.$queryRaw.mockResolvedValueOnce([]);
    await request(app).get('/api/stickers/admin/pending-review?suspicious=true').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ in: [] });
  });

  it('bucket=HIGH_61_PLUS without status defaults to no status filter (spec §7.1 alert deep-link)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?bucket=HIGH_61_PLUS').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.fraudScore).toEqual({ gte: 61 });
  });

  it('omitted status without bucket defaults to MANUAL_REVIEW (legacy)', async () => {
    await request(app).get('/api/stickers/admin/pending-review').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('MANUAL_REVIEW');
  });

  it('status=all bypasses every status filter', async () => {
    await request(app).get('/api/stickers/admin/pending-review?status=all').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it('dateFromHours=24 adds createdAt: { gte } and is forwarded to the suspicious raw query', async () => {
    const before = Date.now();
    await request(app)
      .get('/api/stickers/admin/pending-review?suspicious=true&dateFromHours=24')
      .expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt?.gte).toBeInstanceOf(Date);
    const elapsed = before - (where.createdAt.gte as Date).getTime();
    // Allow ~1 minute of skew for test runtime
    expect(elapsed).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60_000);
    // Raw query was called (suspicious=true) and the dateFrom variant fires.
    expect(m.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('dateFromHours rejects non-positive values silently (no createdAt clause)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=-5').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
  });

  it('dateFromHours clamps to 720h (30-day cap)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=99999').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt?.gte).toBeInstanceOf(Date);
    const elapsed = Date.now() - (where.createdAt.gte as Date).getTime();
    // 720h * 60min * 60s * 1000ms = 2_592_000_000
    expect(elapsed).toBeGreaterThanOrEqual(720 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(720 * 60 * 60 * 1000 + 60_000);
  });

  it('suspicious=true without dateFromHours falls back to the unbounded raw form (still LIMITed)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?suspicious=true').expect(200);
    expect(m.$queryRaw).toHaveBeenCalledTimes(1);
    // Probe selects LIMIT+1 rows (5001) so we can distinguish "exactly LIMIT
    // matches" from "truncated" — see SUSPICIOUS_PROBE_LIMIT in the route.
    const callArgs = m.$queryRaw.mock.calls[0];
    const values = callArgs.slice(1);
    expect(values).toContain(5001);
  });

  it('suspicious=true with dateFromHours uses the time-bounded raw form', async () => {
    await request(app)
      .get('/api/stickers/admin/pending-review?suspicious=true&dateFromHours=24')
      .expect(200);
    const callArgs = m.$queryRaw.mock.calls[0];
    const values = callArgs.slice(1);
    // dateFrom variant: values include a Date AND the LIMIT+1 probe value.
    const hasDate = values.some((v: unknown) => v instanceof Date);
    expect(hasDate).toBe(true);
    expect(values).toContain(5001);
  });

  // dateFromHours edge cases (B-B3, I-B1).
  it('dateFromHours=abc is silently dropped (no createdAt clause)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=abc').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
  });

  it('dateFromHours=24abc is silently dropped (Number() rejects, not parseInt-truncated)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=24abc').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
  });

  it('dateFromHours= (empty) does not produce a clause', async () => {
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
  });

  it('dateFromHours=0 is rejected (no createdAt clause)', async () => {
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=0').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
  });

  it('dateFromHours=24.7 floors to 24 hours (truncation acceptable)', async () => {
    const before = Date.now();
    await request(app).get('/api/stickers/admin/pending-review?dateFromHours=24.7').expect(200);
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.createdAt?.gte).toBeInstanceOf(Date);
    const elapsed = before - (where.createdAt.gte as Date).getTime();
    // floor(24.7) = 24h, with ~1min skew tolerance.
    expect(elapsed).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60_000);
  });

  // Truncation signal (S-B1). Probe LIMIT is SUSPICIOUS_ID_LIMIT + 1 (5001),
  // so the boundary is unambiguous: exactly 5000 rows = full set, 5001+ rows
  // = truncated. The visible id list is sliced to SUSPICIOUS_ID_LIMIT in the
  // truncated case.
  it('suspicious=true with rows < SUSPICIOUS_ID_LIMIT reports meta.truncated=false', async () => {
    m.$queryRaw.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_, i) => ({ id: `scan-${i}` })),
    );
    const res = await request(app)
      .get('/api/stickers/admin/pending-review?suspicious=true')
      .expect(200);
    expect(res.body.meta.truncated).toBe(false);
  });

  it('suspicious=true with rows == SUSPICIOUS_ID_LIMIT exactly reports meta.truncated=false (boundary)', async () => {
    m.$queryRaw.mockResolvedValueOnce(
      Array.from({ length: 5000 }, (_, i) => ({ id: `scan-${i}` })),
    );
    const res = await request(app)
      .get('/api/stickers/admin/pending-review?suspicious=true')
      .expect(200);
    expect(res.body.meta.truncated).toBe(false);
    // The id list passed to Prisma is the full probe result (no slicing needed
    // when not truncated).
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.id.in).toHaveLength(5000);
  });

  it('suspicious=true with rows > SUSPICIOUS_ID_LIMIT (probe returns LIMIT+1) reports meta.truncated=true and slices ids', async () => {
    m.$queryRaw.mockResolvedValueOnce(
      Array.from({ length: 5001 }, (_, i) => ({ id: `scan-${i}` })),
    );
    const res = await request(app)
      .get('/api/stickers/admin/pending-review?suspicious=true')
      .expect(200);
    expect(res.body.meta.truncated).toBe(true);
    // Visible id set sliced down to SUSPICIOUS_ID_LIMIT.
    const where = m.stickerScan.findMany.mock.calls[0][0].where;
    expect(where.id.in).toHaveLength(5000);
  });

  it('suspicious=false (or omitted) reports meta.truncated=false regardless of row count', async () => {
    const res = await request(app).get('/api/stickers/admin/pending-review').expect(200);
    expect(res.body.meta.truncated).toBe(false);
  });

  // Server-echoed window (B-B2). Frontend chip reads this so it never claims
  // a window the server didn't actually apply.
  it('omitted dateFromHours yields meta.appliedDateFromHours = undefined', async () => {
    const res = await request(app).get('/api/stickers/admin/pending-review').expect(200);
    expect(res.body.meta.appliedDateFromHours).toBeUndefined();
  });

  it('valid dateFromHours echoes the parsed value back as meta.appliedDateFromHours', async () => {
    const res = await request(app)
      .get('/api/stickers/admin/pending-review?dateFromHours=24')
      .expect(200);
    expect(res.body.meta.appliedDateFromHours).toBe(24);
  });

  it('out-of-range dateFromHours echoes the post-clamp value (720h) so the chip never lies', async () => {
    const res = await request(app)
      .get('/api/stickers/admin/pending-review?dateFromHours=99999')
      .expect(200);
    expect(res.body.meta.appliedDateFromHours).toBe(720);
  });

  it('rejected dateFromHours (non-positive / NaN) yields appliedDateFromHours = undefined', async () => {
    const res = await request(app)
      .get('/api/stickers/admin/pending-review?dateFromHours=abc')
      .expect(200);
    expect(res.body.meta.appliedDateFromHours).toBeUndefined();
  });
});

// ── §5.4 admin sticker management routes ─────────────────────────────────────

describe('PATCH /api/stickers/:stickerId/processing — §5.4 admin sticker management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 and sticker data on success', async () => {
    const sticker = { id: 'db-1', stickerId: 'ACME-001', status: 'PROCESSING' };
    mockMarkStickerProcessing.mockResolvedValueOnce(sticker);

    const res = await request(app)
      .patch('/api/stickers/ACME-001/processing')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ stickerId: 'ACME-001', status: 'PROCESSING' });
    expect(mockMarkStickerProcessing).toHaveBeenCalledWith('ACME-001', 'admin-1');
  });

  it('passes actorUserId from req.user to the service', async () => {
    mockMarkStickerProcessing.mockResolvedValueOnce({ id: 'db-1', stickerId: 'ACME-001', status: 'PROCESSING' });

    await request(app).patch('/api/stickers/ACME-001/processing').send({});

    expect(mockMarkStickerProcessing).toHaveBeenCalledWith('ACME-001', 'admin-1');
  });

  it('returns 404 when service throws "not found"', async () => {
    mockMarkStickerProcessing.mockRejectedValueOnce(new Error('Sticker ACME-001 not found'));

    const res = await request(app)
      .patch('/api/stickers/ACME-001/processing')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when service throws a non-not-found error', async () => {
    mockMarkStickerProcessing.mockRejectedValueOnce(
      new Error('Sticker ACME-001 must be in PENDING state to mark as processing (current: ACTIVE)')
    );

    const res = await request(app)
      .patch('/api/stickers/ACME-001/processing')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/PENDING/);
  });
});

describe('PATCH /api/stickers/:stickerId/replace — §5.4 admin sticker management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with old and new sticker data on success', async () => {
    const oldSticker = { id: 'db-1', stickerId: 'ACME-001', status: 'REPLACED' };
    const newSticker = { id: 'db-2', stickerId: 'ACME-001-V2', status: 'PENDING' };
    mockReplaceSticker.mockResolvedValueOnce({ oldSticker, newSticker });

    const res = await request(app)
      .patch('/api/stickers/ACME-001/replace')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.oldSticker).toMatchObject({ stickerId: 'ACME-001', status: 'REPLACED' });
    expect(res.body.data.newSticker).toMatchObject({ stickerId: 'ACME-001-V2', status: 'PENDING' });
  });

  it('passes actorUserId from req.user to the service', async () => {
    mockReplaceSticker.mockResolvedValueOnce({
      oldSticker: { id: 'db-1', stickerId: 'ACME-001', status: 'REPLACED' },
      newSticker: { id: 'db-2', stickerId: 'ACME-001-V2', status: 'PENDING' },
    });

    await request(app).patch('/api/stickers/ACME-001/replace').send({});

    expect(mockReplaceSticker).toHaveBeenCalledWith('ACME-001', 'admin-1');
  });

  it('returns 404 when service throws "not found"', async () => {
    mockReplaceSticker.mockRejectedValueOnce(new Error('Sticker ACME-999 not found'));

    const res = await request(app)
      .patch('/api/stickers/ACME-999/replace')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when sticker is already replaced', async () => {
    mockReplaceSticker.mockRejectedValueOnce(new Error('Sticker ACME-001 is already replaced'));

    const res = await request(app)
      .patch('/api/stickers/ACME-001/replace')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already replaced/i);
  });

  it('returns 400 when concurrent replacement is in progress', async () => {
    mockReplaceSticker.mockRejectedValueOnce(
      new Error('Cannot replace ACME-001: concurrent replacement in progress (ACME-001-V2 was just claimed). Please retry.')
    );

    const res = await request(app)
      .patch('/api/stickers/ACME-001/replace')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/concurrent/i);
  });
});
