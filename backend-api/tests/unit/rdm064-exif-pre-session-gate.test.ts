/**
 * INV-RDM-064 FRAUD: live-photo EXIF gate rejects a receipt photo whose EXIF
 * timestamp is before the session start time.
 *
 * Layer 1 — unit tests on checkLivePhoto directly (exifr mocked so the real
 *            implementation runs with injectable EXIF dates).
 * Layer 2 — route integration via supertest (POST /api/stickers/scan/:scanId/receipt).
 */

// ── exifr mock (Layer 1): lets real checkLivePhoto run with injected EXIF data
jest.mock('exifr', () => ({ parse: jest.fn() }));

// ── exifLivePhoto mock (Layer 2): checkLivePhoto is a controllable jest.fn.
// The mock factory is a function so the variable capture works correctly.
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
    $executeRaw: jest.fn(),
  },
  prisma: {
    stickerScan: { findFirst: (...args: any[]) => mockStickerScanFindFirst(...args) },
    $executeRaw: jest.fn(),
  },
}));

// ── Service mock ──────────────────────────────────────────────────────────────
const mockFindDuplicateReceipt = jest.fn();
const mockUploadReceipt = jest.fn();

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    getScansByVenue: jest.fn(),
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

// ── currencyDisplay mock ──────────────────────────────────────────────────────
jest.mock('../../src/utils/currencyDisplay', () => ({
  isCurrencyTransitionWindowOpen: jest.fn().mockResolvedValue(false),
  toDualCurrency: (amount: number) => ({ bgn: null, eur: +(amount / 1.95583).toFixed(2), windowOpen: false }),
}));

// ── Auth middleware: authenticated USER ───────────────────────────────────────
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

// ── Upload middleware: injects req.file ───────────────────────────────────────
jest.mock('../../src/middleware/upload.middleware', () => ({
  uploadSingle: (req: any, _res: any, next: any) => {
    req.file = { buffer: Buffer.from('fake-image'), originalname: 'receipt.jpg', mimetype: 'image/jpeg' };
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
  imageUploadService: { uploadImage: (...args: any[]) => mockUploadImage(...args) },
}));

// ── Imports (after jest.mock hoisting) ───────────────────────────────────────
import exifr from 'exifr';
import express from 'express';
import request from 'supertest';
import { checkLivePhoto, LivePhotoCheckResult } from '../../src/utils/exifLivePhoto';
import stickersRouter from '../../src/routes/stickers.routes';

// ── Route app ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// ── Shared fixture ────────────────────────────────────────────────────────────
// SESSION_START must be recent so EXIF dates we derive from it are also recent
// (within LIVE_PHOTO_MAX_AGE_MIN=30 min), avoiding the STALE gate firing before
// the PRE_SESSION gate under test.
const SESSION_START = new Date(Date.now() - 2 * 60_000); // 2 min ago

// Real checkLivePhoto pulled directly from the actual source module so Layer 1
// can exercise the real logic even though the module export is mocked for Layer 2.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkLivePhoto: realCheckLivePhoto } = jest.requireActual('../../src/utils/exifLivePhoto') as {
  checkLivePhoto: typeof checkLivePhoto;
};

describe('INV-RDM-064 FRAUD: live-photo EXIF gate rejects pre-session receipts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RECEIPT_LIVE_PHOTO_ENFORCEMENT;
  });

  // ── Layer 1: unit tests exercising the real checkLivePhoto ─────────────────
  // exifr.parse is mocked above; realCheckLivePhoto calls readExifOriginalDate
  // which calls exifr.parse — so injecting the parse return value drives the
  // full code path without touching real JPEG bytes or timezones.

  describe('Layer 1 — checkLivePhoto unit (real implementation, exifr mocked)', () => {
    it('[FRAUD] PRE_SESSION reject: EXIF 10 min before session start returns { ok: false, reason: PRE_SESSION }', async () => {
      const exifDate = new Date(SESSION_START.getTime() - 10 * 60_000);
      // exifr.parse returns raw strings; resolveExifLocalToUtc parses them.
      // Supplying an explicit OffsetTimeOriginal bypasses the Intl timezone path.
      const exifLocalStr = formatExifLocal(exifDate, '+00:00');
      (exifr.parse as jest.Mock).mockResolvedValue({
        DateTimeOriginal: exifLocalStr,
        OffsetTimeOriginal: '+00:00',
      });

      const result = await realCheckLivePhoto(Buffer.from('x'), SESSION_START);

      expect(result.ok).toBe(false);
      expect((result as Extract<LivePhotoCheckResult, { ok: false }>).reason).toBe('PRE_SESSION');
    });

    it('[FRAUD] PRE_SESSION accept (within 60s slack): EXIF 30 s before session start returns { ok: true }', async () => {
      const exifDate = new Date(SESSION_START.getTime() - 30_000);
      const exifLocalStr = formatExifLocal(exifDate, '+00:00');
      (exifr.parse as jest.Mock).mockResolvedValue({
        DateTimeOriginal: exifLocalStr,
        OffsetTimeOriginal: '+00:00',
      });

      const result = await realCheckLivePhoto(Buffer.from('x'), SESSION_START);

      expect(result.ok).toBe(true);
    });

    it('[FRAUD] PRE_SESSION accept (after session start): EXIF 5 min after session start returns { ok: true }', async () => {
      const exifDate = new Date(SESSION_START.getTime() + 5 * 60_000);
      const exifLocalStr = formatExifLocal(exifDate, '+00:00');
      (exifr.parse as jest.Mock).mockResolvedValue({
        DateTimeOriginal: exifLocalStr,
        OffsetTimeOriginal: '+00:00',
      });

      const result = await realCheckLivePhoto(Buffer.from('x'), SESSION_START);

      expect(result.ok).toBe(true);
    });

    it('[FRAUD] EXIF absent: exifr returns null → { ok: true }', async () => {
      (exifr.parse as jest.Mock).mockResolvedValue(null);

      const result = await realCheckLivePhoto(Buffer.from('x'), SESSION_START);

      expect(result.ok).toBe(true);
    });

    it('[FRAUD] Enforcement env bypass: RECEIPT_LIVE_PHOTO_ENFORCEMENT=off → { ok: true } even with pre-session EXIF', async () => {
      process.env.RECEIPT_LIVE_PHOTO_ENFORCEMENT = 'off';
      const exifDate = new Date(SESSION_START.getTime() - 10 * 60_000);
      const exifLocalStr = formatExifLocal(exifDate, '+00:00');
      (exifr.parse as jest.Mock).mockResolvedValue({
        DateTimeOriginal: exifLocalStr,
        OffsetTimeOriginal: '+00:00',
      });

      const result = await realCheckLivePhoto(Buffer.from('x'), SESSION_START);

      expect(result.ok).toBe(true);
      expect(exifr.parse as jest.Mock).not.toHaveBeenCalled();
    });

    it('[FRAUD] STALE-before-PRE_SESSION: EXIF 35 min old and pre-session returns { ok: false, reason: STALE }', async () => {
      // STALE gate (ageMin > 30) fires before PRE_SESSION gate — an image 35 min
      // old and pre-session is rejected as STALE, not PRE_SESSION. Both reject;
      // the audit trail records STALE.
      const exifDate = new Date(Date.now() - 35 * 60_000);
      // SESSION_START is 2 min ago; exifDate is 35 min ago → exifDate < SESSION_START - 60s too.
      const exifLocalStr = formatExifLocal(exifDate, '+00:00');
      (exifr.parse as jest.Mock).mockResolvedValue({
        DateTimeOriginal: exifLocalStr,
        OffsetTimeOriginal: '+00:00',
      });

      const result = await realCheckLivePhoto(Buffer.from('x'), SESSION_START);

      expect(result.ok).toBe(false);
      expect((result as Extract<LivePhotoCheckResult, { ok: false }>).reason).toBe('STALE');
    });
  });

  // ── Layer 2: route integration tests ─────────────────────────────────────

  describe('Layer 2 — POST /api/stickers/scan/:scanId/receipt route', () => {
    beforeEach(() => {
      mockStickerScanFindFirst.mockResolvedValue({
        sessionStartedAt: SESSION_START,
        createdAt: new Date(SESSION_START.getTime() - 5 * 60_000),
      });
    });

    it('[FRAUD] PRE_SESSION → 400: gate returns { ok: false } → route responds 400 with error message', async () => {
      const PRE_SESSION_MESSAGE = 'Receipt photo was taken before the QR scan. Please take a new photo at the venue.';
      mockCheckLivePhoto.mockResolvedValue({
        ok: false,
        reason: 'PRE_SESSION',
        message: PRE_SESSION_MESSAGE,
      });

      const res = await request(app)
        .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe(PRE_SESSION_MESSAGE);
      expect(mockCheckLivePhoto).toHaveBeenCalledWith(expect.any(Buffer), SESSION_START);
    });

    it('[FRAUD] EXIF pass → proceeds past gate: gate returns { ok: true } → route does not block at EXIF layer', async () => {
      mockCheckLivePhoto.mockResolvedValue({ ok: true });
      mockFindDuplicateReceipt.mockResolvedValue(null);
      mockUploadImage.mockResolvedValue({ url: 'https://s3.example.com/receipt.jpg', key: 'receipt-key' });
      mockUploadReceipt.mockResolvedValue({
        id: TEST_SCAN_ID,
        status: 'PENDING',
        cashbackAmount: 0,
      });

      const res = await request(app)
        .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body).not.toMatchObject({ error: expect.stringContaining('before the QR scan') });
      expect(mockCheckLivePhoto).toHaveBeenCalledWith(expect.any(Buffer), SESSION_START);
    });

    it('[FRAUD] sessionStartedAt fallback: null sessionStartedAt uses createdAt as session start', async () => {
      // Exercises the `sessionStartedAt ?? createdAt` branch in stickers.routes.ts:255.
      // A regression that drops the createdAt leg would call checkLivePhoto with null
      // instead of SESSION_START, and this test would catch it.
      mockStickerScanFindFirst.mockResolvedValue({
        sessionStartedAt: null,
        createdAt: SESSION_START,
      });
      mockCheckLivePhoto.mockResolvedValue({ ok: true });
      mockFindDuplicateReceipt.mockResolvedValue(null);
      mockUploadImage.mockResolvedValue({ url: 'https://s3.example.com/receipt.jpg', key: 'receipt-key' });
      mockUploadReceipt.mockResolvedValue({ id: TEST_SCAN_ID, status: 'PENDING', cashbackAmount: 0 });

      await request(app)
        .post(`/api/stickers/scan/${TEST_SCAN_ID}/receipt`)
        .expect(200);

      expect(mockCheckLivePhoto).toHaveBeenCalledWith(expect.any(Buffer), SESSION_START);
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format a UTC Date as the EXIF DateTimeOriginal raw string ("YYYY:MM:DD HH:MM:SS")
 * treating the Date's UTC values as local-time, paired with the given offset string.
 * Using offset '+00:00' means "UTC local-time" — resolveExifLocalToUtc then
 * subtracts 0 minutes, yielding back the original UTC timestamp exactly.
 */
function formatExifLocal(d: Date, _offset: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}
