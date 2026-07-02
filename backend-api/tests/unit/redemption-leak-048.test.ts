/**
 * BC-REDEMPTION-RDM-048-5: LEAK guard — cashbackPercent must NOT appear in
 * POST /scan or POST /scan/:scanId/receipt responses.
 *
 * INV-RDM-048a: POST /scan strips cashbackPercent (stickers.routes.ts L209)
 * INV-RDM-048b: POST /scan/:scanId/receipt strips cashbackPercent (stickers.routes.ts L322)
 *
 * The service mocks intentionally return cashbackPercent: 5 so the test would
 * fail if the route forgot to destructure it away.
 */

// ── systemSettings mock: short-circuit the module-level TTL cache ────────────
// Without this, the _strCache Map in systemSettings.ts survives jest.clearAllMocks()
// between tests, meaning the second receipt-path test uses a cached value and
// never actually calls prisma.systemSetting.findUnique.
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn().mockResolvedValue('true'),
  getSystemSettingInt: jest.fn().mockResolvedValue(0),
  getSystemSettingFloat: jest.fn().mockResolvedValue(0),
  invalidateSystemSettingCache: jest.fn(),
}));

// ── Prisma mock ─────────────────────────────────────────────────────────────
const mockStickerScanFindFirst = jest.fn();
const mockExecuteRaw = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    stickerScan: { findFirst: mockStickerScanFindFirst },
    $executeRaw: mockExecuteRaw,
  },
  prisma: {
    stickerScan: { findFirst: mockStickerScanFindFirst },
    $executeRaw: mockExecuteRaw,
  },
}));

// ── Service mock ─────────────────────────────────────────────────────────────
// Both scanSticker and uploadReceipt return an object WITH cashbackPercent: 5
// so the route's destructuring stripping is what removes it — not an accidental
// absence from the service payload.
const mockScanSticker = jest.fn();
const mockUploadReceipt = jest.fn();
const mockFindDuplicateReceipt = jest.fn();

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    scanSticker: (...args: any[]) => mockScanSticker(...args),
    uploadReceipt: (...args: any[]) => mockUploadReceipt(...args),
    findDuplicateReceipt: (...args: any[]) => mockFindDuplicateReceipt(...args),
    getAdminStats: jest.fn(),
    markStickerProcessing: jest.fn(),
    replaceSticker: jest.fn(),
  },
}));

// ── subscriptionGate mock ────────────────────────────────────────────────────
jest.mock('../../src/services/subscriptionGate', () => ({
  findEligibleSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
  subscriptionAllowsEarning: jest.fn().mockReturnValue(true),
}));

// ── Auth middleware: authenticated user ──────────────────────────────────────
const TEST_USER_ID = 'test-user-id';

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

// ── Upload middleware: inject fake file so the "required" gate passes ────────
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (req: any, _res: any, next: any) => {
    req.file = {
      buffer: Buffer.from('fake-image-data'),
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

// ── imageUploadService mock ──────────────────────────────────────────────────
const mockUploadImage = jest.fn().mockResolvedValue({ url: 'https://s3/fake', key: 'fake-key' });
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: (...args: any[]) => mockUploadImage(...args),
  },
}));

// ── Imports (must come after jest.mock hoisting) ─────────────────────────────
import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// ── Shared scan payload that includes cashbackPercent ────────────────────────
// The route must strip cashbackPercent (and other internal fields) before sending
// the response. cashbackAmount is kept so we can verify the stripping is
// selective (i.e. the route didn't just return an empty object).
const SCAN_WITH_CASHBACK_PERCENT = {
  id: 'scan-id-1',
  status: 'PENDING',
  cashbackAmount: 10,
  cashbackPercent: 5,   // <-- must NOT appear in the HTTP response
  fraudScore: 0.1,      // also stripped, but not the focus of this invariant
  fraudReasons: [],
  specRiskLevel: 'LOW',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  deviceFingerprint: null,
  deviceFingerprintRaw: null,
  ocrData: null,
  receiptImageHash: null,
};

const TEST_SCAN_ID = 'scan-id-1';

describe('INV-RDM-048 LEAK: cashbackPercent stripped from sticker scan responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no duplicate receipt
    mockFindDuplicateReceipt.mockResolvedValue(null);
  });

  it('[LEAK] INV-RDM-048a: POST /scan response does not include cashbackPercent', async () => {
    mockScanSticker.mockResolvedValue(SCAN_WITH_CASHBACK_PERCENT);

    const res = await request(app)
      .post('/api/stickers/scan')
      .send({ stickerId: 's-id', billAmount: 200 })
      .expect(200);

    expect(res.body.success).toBe(true);
    // cashbackPercent must be absent (stripped by the route's destructuring)
    expect(res.body.data.cashbackPercent).toBeUndefined();
    // cashbackAmount must still be present (selective strip, not a blank response)
    expect(res.body.data.cashbackAmount).toBeDefined();
    expect(res.body.data.cashbackAmount).toBe(10);
  });

  it('[LEAK] INV-RDM-048b: POST /scan/:scanId/receipt response does not include cashbackPercent', async () => {
    // Route-level EXIF gate needs a valid scan
    mockStickerScanFindFirst.mockResolvedValue({
      sessionStartedAt: new Date(Date.now() - 5_000),
      createdAt: new Date(Date.now() - 5_000),
    });

    mockUploadReceipt.mockResolvedValue(SCAN_WITH_CASHBACK_PERCENT);

    const res = await request(app)
      .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
      .attach('receipt', Buffer.from('fake-image-data'), 'receipt.jpg')
      .expect(200);

    expect(res.body.success).toBe(true);
    // cashbackPercent must be absent at the top level (stripped by the route's destructuring)
    expect(res.body.data.cashbackPercent).toBeUndefined();
    // cashbackPercent must also be absent from the display sub-object (built from toDualCurrency)
    expect(res.body.data.display?.cashbackPercent).toBeUndefined();
    // cashbackAmount must still be present (selective strip, not a blank response)
    expect(res.body.data.cashbackAmount).toBeDefined();
    expect(res.body.data.cashbackAmount).toBe(10);
  });

  it('[LEAK] INV-RDM-048c: POST /scan/:scanId/receipt duplicate path returns 400 with no scan fields', async () => {
    // Arrange: scan exists (EXIF gate passes), but a duplicate receipt is detected
    mockStickerScanFindFirst.mockResolvedValue({
      sessionStartedAt: new Date(Date.now() - 5_000),
      createdAt: new Date(Date.now() - 5_000),
    });
    mockFindDuplicateReceipt.mockResolvedValue({ id: 'existing-scan-id' });
    mockExecuteRaw.mockResolvedValue(undefined);

    const res = await request(app)
      .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
      .attach('receipt', Buffer.from('fake-image-data'), 'receipt.jpg')
      .expect(400);

    expect(res.body.success).toBe(false);
    // The 400 error JSON must not contain any scan fields
    expect(res.body.cashbackPercent).toBeUndefined();
    expect(res.body.data).toBeUndefined();
  });
});
