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

// ─── INV-RDM-081: dashboard subscription must not expose payment-provider ids ─

describe('[LEAK sweep] INV-RDM-081: GET /api/dashboard/me does not expose payment-provider ids', () => {
  const createdUserIds: string[] = [];
  let tokenWithSub: string;
  let tokenNoSub: string;

  beforeAll(async () => {
    // User A: has an active subscription (payseraOrderId + metadata populated by createTestSubscription)
    const dataA = await createTestUser();
    tokenWithSub = dataA.accessToken;
    createdUserIds.push(dataA.user.id);
    await prisma.user.update({ where: { id: dataA.user.id }, data: { status: 'ACTIVE' } });
    await createTestSubscription(dataA.user.id, 'BASIC');

    // User B: no subscription at all
    const dataB = await createTestUser();
    tokenNoSub = dataB.accessToken;
    createdUserIds.push(dataB.user.id);
    await prisma.user.update({ where: { id: dataB.user.id }, data: { status: 'ACTIVE' } });
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  it('[LEAK] INV-RDM-081: unauthenticated request returns 401', async () => {
    const res = await authRequest('').get('/api/dashboard/me');
    expect(res.status).toBe(401);
  });

  it('[LEAK] INV-RDM-081: subscription is null when user has no active subscription', async () => {
    const res = await authRequest(tokenNoSub).get('/api/dashboard/me');
    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeNull();
  });

  it('[LEAK] INV-RDM-081: subscription object omits stripeSubscriptionId, stripePriceId, stripeCustomerId, payseraOrderId, metadata (dashboard.routes.ts allowlist)', async () => {
    const res = await authRequest(tokenWithSub).get('/api/dashboard/me');
    expect(res.status).toBe(200);
    const sub = res.body.subscription;
    expect(sub).not.toBeNull();
    // Payment-provider ids must not reach the client (INV-RDM-081)
    expect(sub).not.toHaveProperty('stripeSubscriptionId');
    expect(sub).not.toHaveProperty('stripePriceId');
    expect(sub).not.toHaveProperty('stripeCustomerId');
    expect(sub).not.toHaveProperty('payseraOrderId');
    expect(sub).not.toHaveProperty('metadata');
    // Internal-only columns that also must not be exposed
    expect(sub).not.toHaveProperty('planId');
    expect(sub).not.toHaveProperty('retryAttempt');
    expect(sub).not.toHaveProperty('renewalRemindersSent');
    // Confirm allowed public fields are present
    expect(sub).toHaveProperty('id');
    expect(sub).toHaveProperty('plan');
    expect(sub).toHaveProperty('status');
    expect(sub).toHaveProperty('currentPeriodEnd');
  });
});

// ─── INV-RDM-082/083: GET /my-scans + POST /receipt EUR-only money fields ─────
//
// BC-QA-031: these two invariants used to require a `display: { bgn, eur }`
// envelope gated by the currency transition window. That feature was retired
// with the window itself, so the endpoints now emit plain EUR scalars converted
// from BGN storage by bgnToEur(), and the assertions below were rewritten to
// match. See the CUR retirement note in docs/specs/redemption-invariant-matrix.md.

describe('[LEAK sweep] INV-RDM-SCAN-CURRENCY: /my-scans + /receipt expose EUR-only money fields', () => {
  const createdUserIds: string[] = [];
  let accessToken: string;
  let venueId: string;

  // Capture the POST /receipt response in beforeAll so message/display tests
  // do not need a second scan (which would hit per-sticker cooldown).
  let receiptResponseBody: Record<string, any>;
  // INV-RDM-082: GET /my-scans response + the raw stored StickerScan row, so the
  // assertions can prove the wire values are the CONVERTED ones rather than the
  // raw BGN scalars (the LEAK property both rows state).
  let myScansResponseBody: Record<string, any>;
  let storedScan: { billAmount: number | null; verifiedAmount: number | null; cashbackAmount: number | null };
  let scanRowId: string;

  // The fixed currency-board conversion the routes apply. Mirrors
  // src/utils/currency.ts bgnToEur() — kept local so a mutation of the helper
  // cannot silently move both sides of the assertion together.
  const BGN_PER_EUR = 1.95583;
  const toEurExpected = (bgn: number) => Math.round((bgn / BGN_PER_EUR + Number.EPSILON) * 100) / 100;

  // Sofia coordinates — same as other sticker tests
  const venueLatitude = 42.6977;
  const venueLongitude = 23.3219;

  beforeAll(async () => {
    const testData = await createTestUser();
    const userId = testData.user.id;
    accessToken = testData.accessToken;
    createdUserIds.push(userId);

    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });
    await createTestSubscription(userId, 'PREMIUM_WEEKLY');

    const venueData = await createTestVenue(userId);
    venueId = venueData.venue.id;
    const stickerId = venueData.sticker.stickerId;

    // Set autoApproveThreshold well above billAmount (25.0) so the mock OCR
    // result (totalAmount=30.0, confidence=85) reliably triggers APPROVED status —
    // no conditional branches in the assertions below.
    await prisma.venueStickerConfig.update({
      where: { venueId },
      data: { autoApproveThreshold: 100 },
    });

    const card = await prisma.card.findFirst({ where: { userId } });
    const cardId = card!.id;

    // Create a scan
    const scanRes = await authRequest(accessToken)
      .post('/api/stickers/scan')
      .send({
        stickerId,
        cardId,
        billAmount: 25.0,
        latitude: venueLatitude,
        longitude: venueLongitude,
        payloadVenueId: venueId,
        payloadVersion: '1',
      });
    if (scanRes.status !== 200) {
      throw new Error(`Scan setup failed (${scanRes.status}): ${JSON.stringify(scanRes.body)}`);
    }
    scanRowId = scanRes.body.data.id as string;
    const scanId = scanRowId;

    // Upload a receipt — with autoApproveThreshold=100, this lands in APPROVED.
    const receiptRes = await authRequest(accessToken)
      .post(`/api/stickers/scan/${scanId}/receipt`)
      .attach('image', MINIMAL_JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' });
    if (receiptRes.status !== 200) {
      throw new Error(`Receipt upload failed (${receiptRes.status}): ${JSON.stringify(receiptRes.body)}`);
    }
    receiptResponseBody = receiptRes.body;

    // INV-RDM-082: capture GET /my-scans once, alongside the raw stored row, so
    // the assertions below can compare wire values against DB storage. Runs
    // AFTER the receipt upload so verifiedAmount/cashbackAmount are populated.
    const myScansRes = await authRequest(accessToken).get('/api/stickers/my-scans');
    if (myScansRes.status !== 200) {
      throw new Error(`GET /my-scans failed (${myScansRes.status}): ${JSON.stringify(myScansRes.body)}`);
    }
    myScansResponseBody = myScansRes.body;

    storedScan = (await prisma.stickerScan.findUnique({
      where: { id: scanId },
      select: { billAmount: true, verifiedAmount: true, cashbackAmount: true },
    })) as { billAmount: number | null; verifiedAmount: number | null; cashbackAmount: number | null };
    if (!storedScan) {
      throw new Error(`StickerScan ${scanId} not found for storage comparison`);
    }
  });

  afterAll(async () => {
    await cleanupTestVenue(venueId);
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  it('POST /receipt APPROVED response exposes plain numeric money fields', () => {
    // receiptResponseBody captured in beforeAll with autoApproveThreshold=100 → APPROVED.
    const data = receiptResponseBody.data;
    expect(typeof data.cashbackAmount).toBe('number');
    expect(typeof data.billAmount).toBe('number');
    // INV-RDM-083 names verifiedAmount too — it was previously unasserted.
    expect(typeof data.verifiedAmount).toBe('number');
  });

  it('POST /receipt APPROVED message references the cashback amount', () => {
    // autoApproveThreshold=100 guarantees APPROVED status — no conditional branch.
    expect(receiptResponseBody.message).toMatch(/Cashback approved/i);
  });

  // ─── INV-RDM-083: no raw BGN scalar survives on POST /receipt ──────────────

  it('POST /receipt money fields are the EUR-converted values, not the raw BGN scalars', () => {
    // The route reuses the same key names for the converted values, so "raw BGN
    // is never emitted alongside the EUR one" means: the value under each key
    // equals bgnToEur(stored), and does NOT equal the stored BGN figure.
    const data = receiptResponseBody.data;

    expect(data.billAmount).toBeCloseTo(toEurExpected(storedScan.billAmount ?? 0), 2);
    expect(data.verifiedAmount).toBeCloseTo(toEurExpected(storedScan.verifiedAmount ?? 0), 2);
    expect(data.cashbackAmount).toBeCloseTo(toEurExpected(storedScan.cashbackAmount ?? 0), 2);

    // billAmount is seeded at 25.00 BGN, so the converted value must differ from
    // storage — this is the assertion that actually fails if the conversion is
    // dropped and the raw scalar ships.
    expect(storedScan.billAmount).toBeCloseTo(25.0, 2);
    expect(data.billAmount).not.toBeCloseTo(storedScan.billAmount ?? 0, 2);
  });

  it('POST /receipt response carries no dual-currency envelope or BGN-suffixed sibling', () => {
    const data = receiptResponseBody.data;
    // The retired feature's shapes must not reappear.
    expect(data).not.toHaveProperty('display');
    expect(data).not.toHaveProperty('billAmountBgn');
    expect(data).not.toHaveProperty('cashbackAmountBgn');
    expect(data).not.toHaveProperty('verifiedAmountBgn');
    for (const key of ['billAmount', 'verifiedAmount', 'cashbackAmount']) {
      expect(typeof data[key]).toBe('number');
      expect(data[key]).not.toBeNull();
    }
    // The approval message quotes EUR, never a BGN/лв figure.
    expect(receiptResponseBody.message).toMatch(/EUR/);
    expect(receiptResponseBody.message).not.toMatch(/BGN|лв/i);
  });

  // ─── INV-RDM-082: GET /api/stickers/my-scans ──────────────────────────────
  //
  // This endpoint had NO test in this block at all — the row cited the block as
  // its verification while every case here hit POST /receipt instead.

  it('GET /my-scans returns the scan and exposes plain numeric money fields', () => {
    expect(myScansResponseBody.success).toBe(true);
    expect(Array.isArray(myScansResponseBody.data)).toBe(true);

    const row = myScansResponseBody.data.find((s: any) => s.id === scanRowId);
    expect(row).toBeDefined();
    expect(typeof row.cashbackAmount).toBe('number');
    expect(typeof row.billAmount).toBe('number');
    expect(typeof row.verifiedAmount).toBe('number');
  });

  it('GET /my-scans money fields are the EUR-converted values, not the raw BGN scalars', () => {
    const row = myScansResponseBody.data.find((s: any) => s.id === scanRowId);

    expect(row.billAmount).toBeCloseTo(toEurExpected(storedScan.billAmount ?? 0), 2);
    expect(row.verifiedAmount).toBeCloseTo(toEurExpected(storedScan.verifiedAmount ?? 0), 2);
    expect(row.cashbackAmount).toBeCloseTo(toEurExpected(storedScan.cashbackAmount ?? 0), 2);

    // 25.00 BGN stored → 12.78 EUR on the wire. Dropping the conversion ships
    // the raw BGN scalar and fails here.
    expect(row.billAmount).not.toBeCloseTo(storedScan.billAmount ?? 0, 2);
  });

  it('GET /my-scans carries no dual-currency envelope or BGN-suffixed sibling', () => {
    const row = myScansResponseBody.data.find((s: any) => s.id === scanRowId);

    expect(row).not.toHaveProperty('display');
    expect(row).not.toHaveProperty('billAmountBgn');
    expect(row).not.toHaveProperty('cashbackAmountBgn');
    expect(row).not.toHaveProperty('verifiedAmountBgn');
    expect(row).not.toHaveProperty('windowOpen');
    // Nothing anywhere in the row may be a { bgn, eur } pair.
    const asJson = JSON.stringify(row);
    expect(asJson).not.toMatch(/"bgn"\s*:/i);
    expect(asJson).not.toMatch(/"windowOpen"\s*:/);
  });
});
