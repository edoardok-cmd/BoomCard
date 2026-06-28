/**
 * BC-REDEMPTION-RDM-003-1: IDOR guard on POST /api/stickers/scan/:scanId/receipt
 *
 * Verifies that a user cannot upload a receipt against another user's scan.
 * Both the route-level EXIF gate and the service-level uploadReceipt call use
 * `prisma.stickerScan.findFirst({ where: { id: scanId, userId } })`.  When the
 * scan belongs to a different user, findFirst returns null and the request is
 * rejected with HTTP 400 "Scan not found".
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
// uploadReceipt is the service-level IDOR guard.  We stub it to throw "Scan
// not found" when the (scanId, userId) pair is not found — mirroring what the
// real service does (sticker.service.ts:1441).
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

// ── subscriptionGate: stub out assertSubscriptionAllowsScanning dependency ───
jest.mock('../../src/services/subscriptionGate', () => ({
  findEligibleSubscription: jest.fn().mockResolvedValue({ id: 'sub-1' }),
  subscriptionAllowsEarning: jest.fn().mockReturnValue(true),
}));

// ── Auth middleware: user B is authenticated ─────────────────────────────────
// The scanId being requested belongs to user A; the token belongs to user B.
const USER_B_ID = 'user-b-id';

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: USER_B_ID, role: 'USER' };
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  requireActiveSubscription: (_req: any, _res: any, next: any) => next(),
}));

// ── Heavy middleware stubs ───────────────────────────────────────────────────
jest.mock('../../src/middleware/upload.middleware', () => ({
  // Inject a fake file buffer so the "Receipt image is required" gate passes.
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

// ── EXIF live-photo check: always pass so we reach the IDOR layer ────────────
jest.mock('../../src/utils/exifLivePhoto', () => ({
  checkLivePhoto: jest.fn().mockResolvedValue({ ok: true }),
}));

// ── imageUploadService: should never be reached in the IDOR case ─────────────
const mockUploadImage = jest.fn().mockResolvedValue({ url: 'https://s3/fake', key: 'fake-key' });
jest.mock('../../src/services/imageUpload.service', () => ({
  imageUploadService: {
    uploadImage: (...args: any[]) => mockUploadImage(...args),
  },
}));

// ── Crypto hash: deterministic for tests ────────────────────────────────────
// Not mocked — crypto is a native module and the SHA-256 call is cheap.

import express from 'express';
import request from 'supertest';
import stickersRouter from '../../src/routes/stickers.routes';

const app = express();
app.use(express.json());
app.use('/api/stickers', stickersRouter);

// Scan created by user A.
const USER_A_SCAN_ID = 'scan-owned-by-user-a';

describe('POST /api/stickers/scan/:scanId/receipt — IDOR guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no duplicate receipt.
    mockFindDuplicateReceipt.mockResolvedValue(null);
  });

  // ── Layer 1: route-level EXIF gate (findFirst with userId) ──────────────
  it('route-level EXIF gate queries findFirst with BOTH id AND userId, and rejects null with HTTP 400 "Scan not found"', async () => {
    // Simulate: scan belongs to user A, so findFirst for user B returns null.
    // The route MUST now reject immediately — before calling uploadReceipt.
    mockStickerScanFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/stickers/scan/${USER_A_SCAN_ID}/receipt`)
      .expect(400);

    // The route MUST have called findFirst with { id: scanId, userId: USER_B_ID }.
    expect(mockStickerScanFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: USER_A_SCAN_ID,
          userId: USER_B_ID,
        }),
      }),
    );

    // Route must return "Scan not found" before ever reaching the service.
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Scan not found');
    expect(mockUploadReceipt).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  // ── Route returns 400 before calling service when scan belongs to another user ──
  it('route returns 400 before calling service when scan belongs to another user', async () => {
    // Route-level findFirst returns null (cross-user scan lookup returns nothing).
    // The route now catches this early and never calls the service.
    mockStickerScanFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/stickers/scan/${USER_A_SCAN_ID}/receipt`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Scan not found');
    // uploadReceipt must not have been called — the route short-circuits at the EXIF gate.
    expect(mockUploadReceipt).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  // ── Positive control: same user succeeds (guard does not over-block) ─────
  it('allows receipt upload when the scan belongs to the authenticated user', async () => {
    // Route-level findFirst returns a valid scan owned by USER_B_ID.
    mockStickerScanFindFirst.mockResolvedValue({
      sessionStartedAt: new Date(Date.now() - 5_000),
      createdAt: new Date(Date.now() - 5_000),
    });

    // Service succeeds.
    mockUploadReceipt.mockResolvedValue({
      id: USER_A_SCAN_ID,
      status: 'PENDING',
      cashbackAmount: 0,
    });

    const res = await request(app)
      .post(`/api/stickers/scan/${USER_A_SCAN_ID}/receipt`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // Service was called with the correct userId so it could perform its own guard.
    expect(mockUploadReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: USER_A_SCAN_ID, userId: USER_B_ID }),
    );
  });

  // ── Service mock: verify service receives userId (enabling its own guard) ─
  it('passes userId to uploadReceipt so the service-level IDOR guard can enforce ownership', async () => {
    mockStickerScanFindFirst.mockResolvedValue({
      sessionStartedAt: null,
      createdAt: new Date(),
    });
    mockUploadReceipt.mockResolvedValue({
      id: USER_A_SCAN_ID,
      status: 'PENDING',
      cashbackAmount: 0,
    });

    await request(app)
      .post(`/api/stickers/scan/${USER_A_SCAN_ID}/receipt`)
      .expect(200);

    const callArg = mockUploadReceipt.mock.calls[0][0];
    expect(callArg.userId).toBe(USER_B_ID);
    expect(callArg.scanId).toBe(USER_A_SCAN_ID);
  });
});

// ── Service-level IDOR guard (real service, mocked prisma) ───────────────────
// Exercises the `prisma.stickerScan.findFirst({ where: { id, userId } })` guard
// inside the real uploadReceipt method — not stubbed away at the service boundary.
//
// Because the top-level jest.mock for sticker.service replaces the whole module,
// we use jest.requireActual to bypass the registry and load the real implementation,
// then wire it to a controlled prisma stub via the module registry override.
describe('stickerService.uploadReceipt — service-level findFirst IDOR guard', () => {
  it('throws "Scan not found" when findFirst returns null (cross-user lookup)', async () => {
    // Load the real (unmocked) stickerService singleton, bypassing the top-level
    // jest.mock that replaces the whole module for route-level tests above.
    const mod = jest.requireActual<typeof import('../../src/services/sticker.service')>(
      '../../src/services/sticker.service',
    );
    const realInstance = mod.stickerService;

    // Patch assertSubscriptionAllowsScanning on the prototype so it resolves
    // immediately without touching prisma.user or subscriptionGate. This keeps
    // the test focused solely on the findFirst IDOR guard.
    const proto = Object.getPrototypeOf(realInstance) as any;
    const originalAssert = proto.assertSubscriptionAllowsScanning;
    proto.assertSubscriptionAllowsScanning = jest.fn().mockResolvedValue(undefined);

    // The top-level prisma mock exposes `stickerScan: { findFirst: mockStickerScanFindFirst }`.
    // The real sticker.service module closes over the same mock object (Jest resolves
    // `../../src/lib/prisma` to the hoisted mock for all requires in this file).
    // Setting mockResolvedValueOnce(null) simulates a cross-user scan lookup returning null.
    mockStickerScanFindFirst.mockResolvedValueOnce(null);

    try {
      await expect(
        realInstance.uploadReceipt({
          scanId: 'scan-owned-by-user-a',
          userId: 'user-b-id',
          receiptImageUrl: 'https://s3/fake',
        }),
      ).rejects.toThrow('Scan not found');

      // findFirst MUST have been called with both id AND userId.
      expect(mockStickerScanFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'scan-owned-by-user-a',
            userId: 'user-b-id',
          }),
        }),
      );
    } finally {
      // Restore prototype method to avoid leaking into other tests.
      proto.assertSubscriptionAllowsScanning = originalAssert;
    }
  });
});
