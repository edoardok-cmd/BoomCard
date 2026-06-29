/**
 * Unit tests for GET /api/receipts/admin/pending-review — dateFromHours clamping.
 *
 * Mirrors the eight edge-case tests from stickersAdminRoute.test.ts so the
 * clamping logic on this route has the same mechanical coverage.
 */

const mockGetPendingReviews = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {},
  prisma: {},
}));

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/partnerStatus.middleware', () => ({
  requireActivePartnerForWrites: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/services/receipt.service', () => ({
  receiptService: {
    getPendingReviews: (...args: any[]) => mockGetPendingReviews(...args),
  },
}));

jest.mock('../../src/services/fraudDetection.service', () => ({
  fraudDetectionService: {},
}));
jest.mock('../../src/services/receiptAnalytics.service', () => ({
  receiptAnalyticsService: {},
}));
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {},
}));
jest.mock('../../src/services/receiptTemplate.service', () => ({
  receiptTemplateService: {},
}));
jest.mock('../../src/services/email.service', () => ({
  emailService: {},
}));
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: () => (_req: any, _res: any, next: any) => next(),
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../../src/middleware/error.middleware', () => ({
  asyncHandler: (fn: any) => fn,
}));

import express from 'express';
import request from 'supertest';
import receiptsRouter from '../../src/routes/receipts.enhanced.routes';

const app = express();
app.use(express.json());
app.use('/api/receipts', receiptsRouter);

describe('GET /api/receipts/admin/pending-review — dateFromHours clamping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPendingReviews.mockResolvedValue([]);
  });

  it('dateFromHours=24 passes a Date ~24h ago to getPendingReviews', async () => {
    const before = Date.now();
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=24').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeInstanceOf(Date);
    const elapsed = before - (dateFrom as Date).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60_000);
  });

  it('dateFromHours=-5 is silently dropped (no dateFrom argument)', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=-5').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });

  it('dateFromHours=99999 clamps to 720h (30-day cap)', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=99999').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeInstanceOf(Date);
    const elapsed = Date.now() - (dateFrom as Date).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(720 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(720 * 60 * 60 * 1000 + 60_000);
  });

  it('dateFromHours=abc is silently dropped (NaN)', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=abc').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });

  it('dateFromHours=24abc is silently dropped (Number() not parseInt)', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=24abc').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });

  it('dateFromHours= (empty string) does not produce a dateFrom', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });

  it('dateFromHours=0 is rejected (zero is not positive)', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=0').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });

  it('dateFromHours=24.7 floors to 24h (Math.floor truncation)', async () => {
    const before = Date.now();
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=24.7').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeInstanceOf(Date);
    const elapsed = before - (dateFrom as Date).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 60_000);
  });

  it('dateFromHours=1 (minimum) clamps to exactly 1h (not further reduced)', async () => {
    const before = Date.now();
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=1').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeInstanceOf(Date);
    const elapsed = before - (dateFrom as Date).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(1 * 60 * 60 * 1000 - 60_000);
    expect(elapsed).toBeLessThanOrEqual(1 * 60 * 60 * 1000 + 60_000);
  });

  it('dateFromHours=0.5 is silently dropped (floors to 0, treated as absent)', async () => {
    await request(app).get('/api/receipts/admin/pending-review?dateFromHours=0.5').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });

  it('omitting dateFromHours passes undefined — no time filter applied', async () => {
    await request(app).get('/api/receipts/admin/pending-review').expect(200);
    const [, dateFrom] = mockGetPendingReviews.mock.calls[0];
    expect(dateFrom).toBeUndefined();
  });
});
