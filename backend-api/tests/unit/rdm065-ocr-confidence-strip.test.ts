/**
 * INV-RDM-065 FRAUD: OCR confidence field is stripped from client-supplied
 * ocrData — server-side is authoritative.
 *
 * Route: POST /api/stickers/scan/:scanId/receipt
 * Code:  src/routes/stickers.routes.ts lines 304-307
 *
 * The route destructures `confidence` out of the parsed ocrData JSON before
 * passing the remainder to stickerService.uploadReceipt.  No existing test
 * covers this path; these tests pin it so a future edit cannot silently pass
 * client-controlled confidence to the fraud-scoring service.
 */

// ── exifLivePhoto mock: checkLivePhoto always passes ─────────────────────────
const mockCheckLivePhoto = jest.fn();

jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: (...args: any[]) => mockCheckLivePhoto(...args),
  readExifOriginalDate: jest.fn(),
}));

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockStickerScanFindFirst = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    stickerScan: { findFirst: (...args: any[]) => mockStickerScanFindFirst(...args) },
    venue: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
  },
  prisma: {
    stickerScan: { findFirst: (...args: any[]) => mockStickerScanFindFirst(...args) },
    venue: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
  },
}));

// ── Service mocks ─────────────────────────────────────────────────────────────
const mockUploadReceipt = jest.fn();
const mockFindDuplicateReceipt = jest.fn();

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    getScansByVenue: jest.fn(),
    getScansByUser: jest.fn(),
    scanSticker: jest.fn(),
    uploadReceipt: (...args: any[]) => mockUploadReceipt(...args),
    findDuplicateReceipt: (...args: any[]) => mockFindDuplicateReceipt(...args),
    getAdminStats: jest.fn(),
    markStickerProcessing: jest.fn(),
    replaceSticker: jest.fn(),
    reactivateInactiveSticker: jest.fn(),
    updateVenueConfig: jest.fn(),
    getOrCreateVenueConfig: jest.fn(),
    getVenueAnalytics: jest.fn(),
  },
}));


// ── Auth middleware: authenticated USER bypasses all guards ───────────────────
const TEST_USER_ID = 'test-user-id';
const TEST_SCAN_ID = 'test-scan-id';

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, role: 'USER' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
  requireActiveAdmin: (_req: any, _res: any, next: any) => next(),
}));

// ── Upload middleware: injects req.file (always valid) ────────────────────────
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (req: any, _res: any, next: any) => {
    req.file = {
      buffer: Buffer.from('fake-image'),
      originalname: 'receipt.jpg',
      mimetype: 'image/jpeg',
    };
    next();
  },
  validateMagicBytes: (_req: any, _res: any, next: any) => next(),
}));

// ── subscriptionGate mock ─────────────────────────────────────────────────────
jest.mock('../../src/services/subscriptionGate', () => ({
  findEligibleSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
  subscriptionAllowsEarning: jest.fn().mockReturnValue(true),
}));

// ── imageUpload mock ──────────────────────────────────────────────────────────
const mockUploadImage = jest.fn();

jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: (...args: any[]) => mockUploadImage(...args),
  },
}));

// ── cashbackLifecycle service mock (constants used by router) ─────────────────
jest.mock('../../src/services/cashbackLifecycle.service', () => ({
  VOID_REASON_CATEGORIES: [],
}));

// ── adminAlerts service mock (constants used by router) ──────────────────────
jest.mock('../../src/services/adminAlerts.service', () => ({
  ACTIVE_SCAN_STATUSES: [],
  SUSPICIOUS_EXACT_CODES: [],
  SUSPICIOUS_PREFIX_CODES: [],
}));

// ── Imports (after jest.mock hoisting) ───────────────────────────────────────
import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

// ── Minimal express app ───────────────────────────────────────────────────────
// express.urlencoded is needed because the upload middleware mock bypasses
// multer (which would normally parse multipart bodies into req.body).  Tests
// send ocrData as an application/x-www-form-urlencoded field so that
// express.urlencoded populates req.body — matching what the real multer does
// for non-file form fields.
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/stickers', stickersRouter);

// ── Shared fixture helpers ────────────────────────────────────────────────────
const SESSION_START = new Date(Date.now() - 2 * 60_000); // 2 min ago

/** Minimal scan object returned by uploadReceipt */
const MINIMAL_SCAN = { id: 'scan-1', status: 'PENDING', cashbackAmount: 0 };

// ── Test suite ────────────────────────────────────────────────────────────────

describe('INV-RDM-065 FRAUD: OCR confidence field stripped from client-supplied ocrData', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // EXIF gate always passes
    mockCheckLivePhoto.mockResolvedValue({ ok: true });

    // prisma.stickerScan.findFirst: called once for the EXIF gate (returns the
    // scan row so the gate can read sessionStartedAt).  findDuplicateReceipt is
    // mocked separately at the service level — no second DB call needed here.
    mockStickerScanFindFirst.mockResolvedValue({
      sessionStartedAt: SESSION_START,
      createdAt: new Date(),
    });

    // No duplicate receipt
    mockFindDuplicateReceipt.mockResolvedValue(null);

    // S3 upload succeeds
    mockUploadImage.mockResolvedValue({ url: 'https://cdn.example.com/r.jpg', key: 'r.jpg' });

    // uploadReceipt returns a minimal scan
    mockUploadReceipt.mockResolvedValue(MINIMAL_SCAN);
  });

  // ── Helper: POST the receipt endpoint with optional ocrData field ──────────
  // We send ocrData as an application/x-www-form-urlencoded field.  The real
  // route receives it this way via multer (which passes non-file fields through
  // to req.body); here express.urlencoded() plays that role since uploadSingle
  // is mocked and only injects req.file.
  function postReceipt(ocrDataValue?: string) {
    const req = request(app)
      .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
      .type('form');
    if (ocrDataValue !== undefined) {
      return req.send({ ocrData: ocrDataValue });
    }
    return req.send({});
  }

  it('[FRAUD] confidence stripped: uploadReceipt is NOT called with a confidence property', async () => {
    const ocrPayload = JSON.stringify({ confidence: 95 });

    const res = await postReceipt(ocrPayload);

    // Route should succeed (200)
    expect(res.status).toBe(200);
    expect(mockUploadReceipt).toHaveBeenCalledTimes(1);

    const callArgs = mockUploadReceipt.mock.calls[0][0];
    expect(callArgs.ocrData).toBeDefined();
    expect(callArgs.ocrData).not.toHaveProperty('confidence');
  });

  it('[FRAUD] other ocrData fields preserved after confidence is stripped', async () => {
    const ocrPayload = JSON.stringify({
      merchantName: 'Lidl',
      totalAmount: 42.5,
      rawText: 'some raw text',
      receiptDate: '2026-06-29',
      confidence: 95,
    });

    const res = await postReceipt(ocrPayload);

    expect(res.status).toBe(200);
    expect(mockUploadReceipt).toHaveBeenCalledTimes(1);

    const callArgs = mockUploadReceipt.mock.calls[0][0];
    expect(callArgs.ocrData).not.toHaveProperty('confidence');
    expect(callArgs.ocrData).toMatchObject({
      merchantName: 'Lidl',
      totalAmount: 42.5,
      rawText: 'some raw text',
      receiptDate: '2026-06-29',
    });
  });

  it('[FRAUD] absent ocrData → uploadReceipt called with ocrData: undefined', async () => {
    // Post WITHOUT calling .field('ocrData', ...)
    const res = await postReceipt(/* no ocrData */);

    expect(res.status).toBe(200);
    expect(mockUploadReceipt).toHaveBeenCalledTimes(1);

    const callArgs = mockUploadReceipt.mock.calls[0][0];
    expect(callArgs.ocrData).toBeUndefined();
  });

  it('[FRAUD] confidence: 0 still stripped (cannot bias fraud score to zero)', async () => {
    const ocrPayload = JSON.stringify({ merchantName: 'BILLA', confidence: 0 });

    const res = await postReceipt(ocrPayload);

    expect(res.status).toBe(200);
    expect(mockUploadReceipt).toHaveBeenCalledTimes(1);

    const callArgs = mockUploadReceipt.mock.calls[0][0];
    expect(callArgs.ocrData).not.toHaveProperty('confidence');
    // Other fields are still present
    expect(callArgs.ocrData).toMatchObject({ merchantName: 'BILLA' });
  });

  it('[FRAUD] ocrData="null" → 400 (TypeError in catch, no confidence reaches scorer)', async () => {
    // JSON.parse("null") → JS null; destructuring { confidence: _dropped, ...rest }
    // from null throws TypeError, which the route's try/catch turns into a 400.
    const res = await postReceipt('null');

    expect(res.status).toBe(400);
    expect(mockUploadReceipt).not.toHaveBeenCalled();
  });

  it('[FRAUD] malformed ocrData JSON → 400 (SyntaxError in catch)', async () => {
    // JSON.parse("{bad json") throws SyntaxError → catch → 400.
    const res = await postReceipt('{bad json');

    expect(res.status).toBe(400);
    expect(mockUploadReceipt).not.toHaveBeenCalled();
  });

  it('[FRAUD] confidence as string still stripped', async () => {
    // Destructuring drops confidence regardless of its runtime type.
    const ocrPayload = JSON.stringify({ merchantName: 'Fantastico', confidence: 'high' });

    const res = await postReceipt(ocrPayload);

    expect(res.status).toBe(200);
    expect(mockUploadReceipt).toHaveBeenCalledTimes(1);

    const callArgs = mockUploadReceipt.mock.calls[0][0];
    expect(callArgs.ocrData).not.toHaveProperty('confidence');
    expect(callArgs.ocrData).toMatchObject({ merchantName: 'Fantastico' });
  });
});
