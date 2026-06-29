/**
 * BC-REDEMPTION-RDM-050-5: LEAK guard — fraudReasons must NOT appear in
 * POST /scan or POST /scan/:scanId/receipt responses.
 *
 * INV-RDM-050a: POST /scan strips fraudReasons (stickers.routes.ts L209)
 * INV-RDM-050b: POST /scan/:scanId/receipt strips fraudReasons (stickers.routes.ts L322)
 *
 * The service mocks intentionally return fraudReasons: ['GPS_FAR_FROM_VENUE'] so
 * the test would fail if the route forgot to destructure it away.
 */

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
// Both scanSticker and uploadReceipt return an object WITH fraudReasons: ['GPS_FAR_FROM_VENUE']
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

// ── Shared scan payload that includes fraudReasons ───────────────────────────
// The route must strip fraudReasons (and other internal fields) before sending
// the response. cashbackAmount is kept so we can verify the stripping is
// selective (i.e. the route didn't just return an empty object).
const SCAN_WITH_FRAUD_REASONS = {
  id: 'scan-id-1',
  status: 'PENDING',
  cashbackAmount: 10,
  cashbackPercent: 5,
  fraudScore: 0.8,
  fraudReasons: ['GPS_FAR_FROM_VENUE'],   // <-- must NOT appear in the HTTP response
  specRiskLevel: 'HIGH',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  deviceFingerprint: null,
  deviceFingerprintRaw: null,
  ocrData: null,
  receiptImageHash: null,
};

const TEST_SCAN_ID = 'scan-id-1';

describe('INV-RDM-050 LEAK: fraudReasons stripped from sticker scan responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no duplicate receipt
    mockFindDuplicateReceipt.mockResolvedValue(null);
  });

  it('[LEAK] INV-RDM-050a: POST /scan response does not include fraudReasons', async () => {
    mockScanSticker.mockResolvedValue(SCAN_WITH_FRAUD_REASONS);

    const res = await request(app)
      .post('/api/stickers/scan')
      .send({ stickerId: 's-id', billAmount: 200 })
      .expect(200);

    expect(res.body.success).toBe(true);
    // fraudReasons must be absent (stripped by the route's destructuring)
    expect(res.body.data.fraudReasons).toBeUndefined();
    // cashbackAmount must still be present (selective strip, not a blank response)
    expect(res.body.data.cashbackAmount).toBeDefined();
    expect(res.body.data.cashbackAmount).toBe(10);
  });

  it('[LEAK] INV-RDM-050b: POST /scan/:scanId/receipt response does not include fraudReasons', async () => {
    // Route-level EXIF gate needs a valid scan
    mockStickerScanFindFirst.mockResolvedValue({
      sessionStartedAt: new Date(Date.now() - 5_000),
      createdAt: new Date(Date.now() - 5_000),
    });

    mockUploadReceipt.mockResolvedValue(SCAN_WITH_FRAUD_REASONS);

    const res = await request(app)
      .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
      .attach('receipt', Buffer.from('fake-image-data'), 'receipt.jpg')
      .expect(200);

    expect(res.body.success).toBe(true);
    // fraudReasons must be absent (stripped by the route's destructuring)
    expect(res.body.data.fraudReasons).toBeUndefined();
    // cashbackAmount must still be present (selective strip, not a blank response)
    expect(res.body.data.cashbackAmount).toBeDefined();
    expect(res.body.data.cashbackAmount).toBe(10);
  });
});
