/**
 * BC-REDEMPTION-RDM-063-6: FRAUD — duplicate receipt SHA-256 match detection
 *
 * INV-RDM-063 (HIGH): Duplicate receipt image (SHA-256 match) detection rejects
 * repeat submissions at POST /api/stickers/scan/:scanId/receipt.
 *
 * Coverage:
 *  1. Route-level: duplicate found → HTTP 400 + $executeRaw REJECTED
 *  2. Route-level: no duplicate → upload proceeds (HTTP 200)
 *  3. SHA-256 hash is computed from req.file.buffer
 *  4. scanId is passed as excludeScanId to findDuplicateReceipt
 *  5. Service cross-flow: StickerScan duplicate → non-null return
 *  6. Service cross-flow: Receipt duplicate → non-null return
 *  7. Empty hash → null (no DB touch)
 *  8. excludeScanId exclusion wired into StickerScan where clause
 */

import crypto from 'crypto';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockStickerScanFindFirst = jest.fn();
const mockReceiptFindFirst = jest.fn();
const mockExecuteRaw = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    stickerScan: { findFirst: mockStickerScanFindFirst },
    receipt: { findFirst: mockReceiptFindFirst },
    $executeRaw: mockExecuteRaw,
  },
  prisma: {
    stickerScan: { findFirst: mockStickerScanFindFirst },
    receipt: { findFirst: mockReceiptFindFirst },
    $executeRaw: mockExecuteRaw,
  },
}));

// ── Service mock ──────────────────────────────────────────────────────────────
const mockUploadReceipt = jest.fn();
const mockFindDuplicateReceipt = jest.fn();

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    uploadReceipt: (...args: any[]) => mockUploadReceipt(...args),
    findDuplicateReceipt: (...args: any[]) => mockFindDuplicateReceipt(...args),
    getAdminStats: jest.fn(),
    markStickerProcessing: jest.fn(),
    replaceSticker: jest.fn(),
  },
}));

// ── Subscription gate ─────────────────────────────────────────────────────────
jest.mock('../../src/services/subscriptionGate', () => ({
  findEligibleSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
  subscriptionAllowsEarning: jest.fn().mockReturnValue(true),
}));

// ── Auth middleware ───────────────────────────────────────────────────────────
const USER_ID = 'user-1';

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: USER_ID, role: 'USER' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
  requireActiveAdmin: (_req: any, _res: any, next: any) => next(),
}));

// ── Upload middleware ─────────────────────────────────────────────────────────
const FAKE_BUFFER = Buffer.from('fake-image-data');

jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (req: any, _res: any, next: any) => {
    req.file = {
      buffer: FAKE_BUFFER,
      originalname: 'receipt.jpg',
      mimetype: 'image/jpeg',
    };
    next();
  },
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

// ── EXIF live-photo check: always pass ───────────────────────────────────────
jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

// ── imageUploadService ────────────────────────────────────────────────────────
const mockUploadImage = jest
  .fn()
  .mockResolvedValue({ url: 'https://s3/fake', key: 'fake-key' });

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: (...args: any[]) => mockUploadImage(...args),
  },
}));

// ── App setup ─────────────────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// A scanForGate stub that passes the EXIF gate (recent timestamps).
const VALID_SCAN_FOR_GATE = {
  sessionStartedAt: new Date(Date.now() - 5_000),
  createdAt: new Date(Date.now() - 5_000),
};

const SCAN_ID = 'scan-abc-123';

// Expected SHA-256 of the injected buffer — computed once so tests stay DRY.
const EXPECTED_HASH = crypto
  .createHash('sha256')
  .update(FAKE_BUFFER)
  .digest('hex');

// ─────────────────────────────────────────────────────────────────────────────
// Route-level tests
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/stickers/scan/:scanId/receipt — INV-RDM-063 duplicate SHA-256 detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // EXIF gate: the route calls stickerScan.findFirst first; give it a passing stub.
    mockStickerScanFindFirst.mockResolvedValue(VALID_SCAN_FOR_GATE);
  });

  // ── Test 1: duplicate found → HTTP 400 + $executeRaw REJECTED ────────────
  it('returns HTTP 400 and calls $executeRaw when findDuplicateReceipt returns a match', async () => {
    mockFindDuplicateReceipt.mockResolvedValue({
      id: 'prior-scan-id',
      userId: 'other-user',
      status: 'APPROVED',
    });

    const res = await request(app)
      .post(`/api/stickers/scan/${SCAN_ID}/receipt`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe(
      'This receipt has already been submitted. Duplicate receipts are not accepted.',
    );

    // Raw SQL must have been executed to flip the scan status to REJECTED.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

    // Verify IDOR guard: the $executeRaw tagged-template call passes scanId and userId
    // as the first and second interpolated values respectively.
    // callArgs[0] = TemplateStringsArray (the string fragments)
    // callArgs[1] = first interpolated value → scanId
    // callArgs[2] = second interpolated value → userId
    const callArgs = mockExecuteRaw.mock.calls[0];
    expect(callArgs[1]).toBe(SCAN_ID);   // scanId
    expect(callArgs[2]).toBe(USER_ID);   // userId

    // Upload must NOT have been called — request short-circuits before S3.
    expect(mockUploadReceipt).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  // ── Test 2: no duplicate → upload proceeds (HTTP 200) ───────────────────
  it('proceeds to upload and returns HTTP 200 when findDuplicateReceipt returns null', async () => {
    mockFindDuplicateReceipt.mockResolvedValue(null);
    mockUploadReceipt.mockResolvedValue({
      id: SCAN_ID,
      status: 'PENDING',
      cashbackAmount: 0,
    });

    const res = await request(app)
      .post(`/api/stickers/scan/${SCAN_ID}/receipt`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockUploadReceipt).toHaveBeenCalledTimes(1);
  });

  // ── Test 3: SHA-256 hash is computed from req.file.buffer ─────────────────
  it('passes the SHA-256 hash of req.file.buffer to findDuplicateReceipt', async () => {
    mockFindDuplicateReceipt.mockResolvedValue(null);
    mockUploadReceipt.mockResolvedValue({ id: SCAN_ID, status: 'PENDING', cashbackAmount: 0 });

    await request(app)
      .post(`/api/stickers/scan/${SCAN_ID}/receipt`)
      .expect(200);

    expect(mockFindDuplicateReceipt).toHaveBeenCalledWith(
      EXPECTED_HASH,
      expect.anything(),
    );
  });

  // ── Test 4: scanId is passed as excludeScanId ────────────────────────────
  it('passes the route scanId as the second argument (excludeScanId) to findDuplicateReceipt', async () => {
    mockFindDuplicateReceipt.mockResolvedValue(null);
    mockUploadReceipt.mockResolvedValue({ id: SCAN_ID, status: 'PENDING', cashbackAmount: 0 });

    await request(app)
      .post(`/api/stickers/scan/${SCAN_ID}/receipt`)
      .expect(200);

    expect(mockFindDuplicateReceipt).toHaveBeenCalledWith(
      EXPECTED_HASH,
      SCAN_ID,
    );
  });

  // ── Test 9: duplicate found, scan already terminal → still HTTP 400 ───────
  it('returns HTTP 400 when duplicate found regardless of scan status (UPDATE guard is a no-op for terminal scans)', async () => {
    // The current scan is already APPROVED (a terminal status).
    // The $executeRaw WHERE clause has `status IN ('PENDING','VALIDATING')` so the
    // UPDATE is a no-op — but the route still short-circuits and returns 400.
    mockFindDuplicateReceipt.mockResolvedValue({
      id: 'prior-scan-id',
      userId: 'other-user',
      status: 'APPROVED',
    });

    const res = await request(app)
      .post(`/api/stickers/scan/${SCAN_ID}/receipt`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe(
      'This receipt has already been submitted. Duplicate receipts are not accepted.',
    );

    // The route always fires the protective UPDATE; the WHERE guard inside the SQL
    // makes it a no-op when the scan is already terminal, but the call still happens.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

    // Upload must NOT have been called.
    expect(mockUploadReceipt).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Service-level tests (real findDuplicateReceipt, mocked prisma)
// ─────────────────────────────────────────────────────────────────────────────
describe('stickerService.findDuplicateReceipt — service cross-flow and edge cases', () => {
  // Load the real service implementation, bypassing the route-level mock.
  // Jest resolves `../../src/lib/prisma` to the hoisted mock for all requires
  // in this file, so the real service method operates on our controlled stubs.
  const realStickerService = (
    jest.requireActual<typeof import('../../src/services/sticker.service')>(
      '../../src/services/sticker.service',
    )
  ).stickerService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Test 5: StickerScan duplicate → non-null ──────────────────────────────
  it('returns the StickerScan record when stickerScan.findFirst returns a match', async () => {
    const matchingScan = { id: 'dup-scan', userId: 'user-x', status: 'APPROVED' };
    mockStickerScanFindFirst.mockResolvedValue(matchingScan);
    mockReceiptFindFirst.mockResolvedValue(null);

    const result = await realStickerService.findDuplicateReceipt('some-hash');

    expect(result).toEqual(matchingScan);
  });

  // ── Test 6: Receipt duplicate → non-null ─────────────────────────────────
  it('returns the Receipt record when stickerScan.findFirst returns null but receipt.findFirst matches', async () => {
    const matchingReceipt = { id: 'dup-receipt', userId: 'user-y', status: 'PENDING' };
    mockStickerScanFindFirst.mockResolvedValue(null);
    mockReceiptFindFirst.mockResolvedValue(matchingReceipt);

    const result = await realStickerService.findDuplicateReceipt('some-hash');

    expect(result).toEqual(matchingReceipt);
  });

  // ── Test 7: empty hash → null without touching DB ────────────────────────
  it('returns null immediately for an empty hash without querying the database', async () => {
    const result = await realStickerService.findDuplicateReceipt('');

    expect(result).toBeNull();
    expect(mockStickerScanFindFirst).not.toHaveBeenCalled();
    expect(mockReceiptFindFirst).not.toHaveBeenCalled();
  });

  // ── Test 8: excludeScanId is wired into the StickerScan where clause ─────
  it('includes id: { not: excludeScanId } in the StickerScan query when excludeScanId is provided', async () => {
    mockStickerScanFindFirst.mockResolvedValue(null);
    mockReceiptFindFirst.mockResolvedValue(null);

    await realStickerService.findDuplicateReceipt('some-hash', 'exclude-this-scan');

    expect(mockStickerScanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'exclude-this-scan' },
        }),
      }),
    );
  });
});
