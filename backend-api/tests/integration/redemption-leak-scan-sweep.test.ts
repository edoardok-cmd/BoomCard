/**
 * Integration Tests: INV-RDM-049 — scan responses must not expose fraudScore
 *
 * Invariant matrix reference: docs/specs/redemption-invariant-matrix.md L76
 * Implementation reference:   src/routes/stickers.routes.ts L209 (scan), L322 (receipt)
 *
 * The routes strip fraudScore (and several other internal fields) before
 * sending the response.  These tests verify that the stripping is in effect
 * for every client-visible response shape, so a future refactor cannot
 * accidentally re-introduce the leak.
 */

// Mock the OCR service to prevent Tesseract.js from attempting to decode the
// fake JPEG buffer in tests.  The WASM Tesseract engine calls abort() on an
// undecodeable image, which surfaces in Jest as an uncaught RuntimeError that
// fails the test even though the HTTP response has already been sent.
jest.mock('../../src/services/ocr.service', () => ({
  recognizeReceiptImage: jest.fn().mockResolvedValue({
    merchantName: 'Test Venue',
    totalAmount: 30.0,
    receiptDate: null,
    items: [],
    rawText: '',
    confidence: 85,
    currency: 'BGN',
  }),
}));

// Mock the imageUpload service BEFORE any module that imports it is loaded.
// The receipt endpoint calls imageUploadService.uploadImage(), which talks to
// Cloudflare R2.  In the test environment the R2 credentials are set to 'test'
// so real uploads fail; stub the whole service to return a canned URL instead.
jest.mock('../../src/services/imageUpload.service', () => ({
  ImageUploadService: jest.fn(),
  imageUploadService: {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://test-r2.example.com/sticker-receipts/test.jpg',
      key: 'sticker-receipts/test.jpg',
      size: 1024,
    }),
  },
}));

import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import {
  createTestUser,
  createTestVenue,
  createTestSubscription,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';

// A minimal JPEG buffer: JFIF APP0 marker followed by zero-bytes padding.
// checkLivePhoto() only rejects when EXIF DateTimeOriginal is present AND
// out of range — a buffer with no EXIF passes straight through.
// validateMagicBytes checks the 0xFF 0xD8 SOI marker; the full JFIF header
// satisfies that check.
const MINIMAL_JPEG = Buffer.concat([
  Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, // APP0 marker
    0x00, 0x10, // APP0 length = 16 bytes
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // version 1.1
    0x00,       // aspect ratio units = 0 (no units)
    0x00, 0x01, // X density = 1
    0x00, 0x01, // Y density = 1
    0x00, 0x00, // thumbnail size = 0×0
  ]),
  Buffer.alloc(30), // padding to reach 50 bytes total
]);

describe('[LEAK sweep] INV-RDM-049: scan responses do not expose fraudScore', () => {
  const createdUserIds: string[] = [];
  let accessToken: string;
  let cardId: string;
  let venueId: string;
  let stickerId: string;

  // Shared scan created in beforeAll — used by both tests to avoid cooldown issues
  // from a second HTTP scan in the receipt test.
  let scanResponseData: Record<string, unknown>;
  let scanId: string;

  // Sofia coordinates — same as sticker-scan.test.ts
  const venueLatitude = 42.6977;
  const venueLongitude = 23.3219;

  beforeAll(async () => {
    // Create user, promote to ACTIVE, attach subscription and venue+sticker
    const testData = await createTestUser();
    const userId = testData.user.id;
    accessToken = testData.accessToken;
    createdUserIds.push(userId);

    // auth.middleware.ts blocks PENDING_VERIFICATION — promote to ACTIVE
    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

    // Subscription required for requireActiveSubscription middleware
    await createTestSubscription(userId, 'PREMIUM_WEEKLY');

    // Venue + sticker
    const venueData = await createTestVenue(userId);
    venueId = venueData.venue.id;
    stickerId = venueData.sticker.stickerId;

    // Card (auto-created at registration)
    const card = await prisma.card.findFirst({ where: { userId } });
    cardId = card!.id;

    // Create the scan once in setup — both LEAK tests share this response so
    // the receipt test never triggers a per-sticker cooldown from a second scan.
    const scanRes = await authRequest(accessToken)
      .post('/api/stickers/scan')
      .send({
        stickerId,
        cardId,
        billAmount: 30.0,
        latitude: venueLatitude,
        longitude: venueLongitude,
        payloadVenueId: venueId,
        payloadVersion: '1',
      });
    if (scanRes.status !== 200) {
      throw new Error(`Scan setup failed (${scanRes.status}): ${JSON.stringify(scanRes.body)}`);
    }
    scanResponseData = scanRes.body.data as Record<string, unknown>;
    scanId = scanRes.body.data.id as string;
  });

  afterAll(async () => {
    await cleanupTestVenue(venueId);
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── POST /api/stickers/scan ──────────────────────────────────────────────

  describe('POST /api/stickers/scan', () => {
    it('[LEAK] INV-RDM-049: fraudScore absent from scan response (stickers.routes.ts L209)', () => {
      // scanResponseData captured in beforeAll — no second HTTP call needed.
      // Core invariant: internal fraud-scoring field must never reach the client.
      expect(scanResponseData).not.toHaveProperty('fraudScore');
    });
  });

  // ─── POST /api/stickers/scan/:scanId/receipt ──────────────────────────────

  describe('POST /api/stickers/scan/:scanId/receipt', () => {
    it('[LEAK] INV-RDM-049: fraudScore absent from receipt upload response (stickers.routes.ts L322)', async () => {
      // Use the scanId seeded in beforeAll so we are guaranteed a PENDING scan
      // with no cooldown race from a second HTTP scan call.
      const receiptRes = await authRequest(accessToken)
        .post(`/api/stickers/scan/${scanId}/receipt`)
        .attach('image', MINIMAL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' });

      // Expect 200 — setup is clean (fresh scan, mocked S3, no EXIF in buffer)
      expect(receiptRes.status).toBe(200);
      // Core invariant: internal fraud-scoring field must never reach the client
      expect(receiptRes.body.data).not.toHaveProperty('fraudScore');
    });
  });
});
