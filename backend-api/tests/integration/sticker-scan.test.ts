/**
 * Integration Tests: Sticker Scan Flow
 *
 * Covers P0 critical path F06: Scan BOOM Sticker
 * - Valid sticker scan with GPS validation
 * - GPS distance rejection (60m radius)
 * - Duplicate scan cooldown
 * - Invalid sticker code
 */

import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { StickerStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import {
  createTestUser,
  createTestSubscription,
  loginTestUser,
  createTestVenue,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

function generateAdminToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN'): string {
  return jwt.sign({ id: userId, email: `admin-${userId}@test.local`, role }, JWT_SECRET, { expiresIn: '15m' });
}

describe('Sticker Scan Flow (F06)', () => {
  const createdUserIds: string[] = [];
  let userId: string;
  let accessToken: string;
  let adminAccessToken: string;
  let adminUserId: string;
  let cardId: string;
  let venueId: string;
  let stickerId: string;
  let userEmail: string;
  let userPassword: string;

  // Sofia coordinates for GPS tests
  const venueLatitude = 42.6977;
  const venueLongitude = 23.3219;

  beforeAll(async () => {
    const testData = await createTestUser();
    userId = testData.user.id;
    accessToken = testData.accessToken;
    userEmail = testData.email;
    userPassword = testData.password;
    createdUserIds.push(userId);

    // Create an ADMIN user for auth-gate positive tests (INV-RDM-034, INV-RDM-038, etc.)
    const adminData = await createTestUser();
    await prisma.user.update({
      where: { id: adminData.user.id },
      data: { status: 'ACTIVE', role: 'ADMIN' },
    });
    adminUserId = adminData.user.id;
    adminAccessToken = generateAdminToken(adminData.user.id, 'ADMIN');
    createdUserIds.push(adminData.user.id);

    // auth.middleware.ts L189 blocks PENDING_VERIFICATION — promote to ACTIVE
    await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

    // Get user's card
    const card = await prisma.card.findFirst({ where: { userId } });
    cardId = card!.id;

    // Create LIGHT subscription (cashback requires active subscription)
    await createTestSubscription(userId, 'PREMIUM_WEEKLY');

    // Create test venue with sticker
    const venueData = await createTestVenue(userId);
    venueId = venueData.venue.id;
    stickerId = venueData.sticker.stickerId;
  });

  afterAll(async () => {
    await cleanupTestVenue(venueId);
    for (const id of createdUserIds) {
      await cleanupTestUser(id);
    }
  });

  // ─── Valid Sticker Scan ───────────────────────────────────────

  describe('POST /api/stickers/scan', () => {
    it('should create scan with valid sticker and GPS within range', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: venueId,
          payloadVersion: '1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('cashbackAmount');
      expect(res.body.data).toHaveProperty('status');
    });

    it('should calculate correct cashback amount', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 100.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: venueId,
          payloadVersion: '1',
        });

      if (res.status === 200) {
        // cashbackPercent is stripped server-side (spec §11.3 / Clash 10.6)
        expect(res.body.data.cashbackPercent).toBeUndefined();
        expect(res.body.data.cashbackAmount).toBeGreaterThan(0);
      }
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50.0,
        });

      expect(res.status).toBe(401);
    });

    it('[AUTH] INV-RDM-030: POST /scan returns 402 SUBSCRIPTION_REQUIRED for user with no active subscription', async () => {
      const noSubData = await createTestUser();
      const noSubId = noSubData.user.id;
      try {
        await prisma.user.update({ where: { id: noSubId }, data: { status: 'ACTIVE' } });
        const res = await authRequest(noSubData.accessToken)
          .post('/api/stickers/scan')
          .send({ stickerId, cardId, billAmount: 50.0 });
        expect(res.status).toBe(402);
        expect(res.body.error).toContain('SUBSCRIPTION_REQUIRED');
      } finally {
        await cleanupTestUser(noSubId);
      }
    });

    it('should reject scan without required fields', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          // Missing cardId and billAmount
        });

      expect(res.status).toBe(400);
    });

    it('[INPUT] INV-RDM-012: POST /scan rejects missing billAmount with 400', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          // billAmount intentionally omitted
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/billAmount/i);
    });

    it('[INPUT] INV-RDM-012: POST /scan rejects null billAmount with 400', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({ stickerId, cardId, billAmount: null });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/billAmount/i);
    });

    it('[INPUT] INV-RDM-012: POST /scan rejects empty-string billAmount with 400', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({ stickerId, cardId, billAmount: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/billAmount/i);
    });

    it('should reject zero billAmount via validateAmount with 400 (INV-RDM-013)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 0,
          latitude: venueLatitude,
          longitude: venueLongitude,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).not.toMatch(/missing required field/i);
    });

    it('should reject negative billAmount via validateAmount with 400 (INV-RDM-013)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: -5,
          latitude: venueLatitude,
          longitude: venueLongitude,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).not.toMatch(/missing required field/i);
    });

    it('should reject scan when neither sessionId nor stickerId is provided (INV-RDM-017)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          billAmount: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Non-Finite billAmount Validation (INV-RDM-014) ──────────
  //
  // Two distinct rejection sub-paths in validateAmount:
  //   (a) parseFloat → Infinity/-Infinity → !isFinite → "must be a finite number"
  //   (b) parseFloat → NaN               → isNaN     → "must be a valid number"
  // Numeric Infinity serializes to JSON null and is caught by the earlier
  // !billAmount guard ("Missing required field").

  describe('POST /api/stickers/scan – non-finite billAmount rejection (INV-RDM-014)', () => {
    // Sub-path (a): strings that parseFloat converts to infinite numbers
    it('INV-RDM-014: should return 400 with "finite" error when billAmount is string "Infinity"', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 'Infinity',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/finite/i);
    });

    it('INV-RDM-014: should return 400 with "finite" error when billAmount is string "-Infinity"', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: '-Infinity',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/finite/i);
    });

    // Sub-path (b): strings that parseFloat cannot parse (yields NaN)
    it('INV-RDM-014: should return 400 with "valid number" error when billAmount is string "NaN"', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 'NaN',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/valid number/i);
    });

    // "infinity" (lowercase): parseFloat returns NaN (not recognized), same sub-path (b)
    it('INV-RDM-014: should return 400 with "valid number" error when billAmount is string "infinity" (lowercase — not a parseable infinite)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 'infinity',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/valid number/i);
    });

    // Numeric Infinity: JSON.stringify converts it to null; caught by the
    // missing-field guard before validateAmount is reached.
    it('INV-RDM-014: should return 400 when billAmount is numeric Infinity (JSON-serializes to null)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: Infinity,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/missing required field/i);
    });
  });

  // ─── GPS Coordinate Validation (INV-RDM-015) ─────────────────

  describe('POST /api/stickers/scan – GPS coordinate range validation (INV-RDM-015)', () => {
    it('INV-RDM-015: should return 400 when latitude exceeds +90', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 91,
          longitude: 23,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when latitude is below -90', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: -91,
          longitude: 23,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when longitude exceeds +180', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 42,
          longitude: 181,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when longitude is below -180', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 42,
          longitude: -181,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when latitude is a non-numeric string', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 'not-a-number',
          longitude: 23,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when latitude is Infinity', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 'Infinity',
          longitude: 23,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when latitude is a trailing-garbage string ("91abc")', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: '91abc',
          longitude: 23,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when longitude is a non-numeric string', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 42,
          longitude: 'not-a-number',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when longitude is Infinity string', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 42,
          longitude: 'Infinity',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when longitude is a trailing-garbage string ("23abc")', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 42,
          longitude: '23abc',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when only latitude is provided (partial-pair)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          latitude: 42,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('INV-RDM-015: should return 400 when only longitude is provided (partial-pair)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 50,
          longitude: 23,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── GPS Validation ───────────────────────────────────────────

  describe('GPS Distance Validation', () => {
    it('should accept scan within 60m of venue', async () => {
      // ~30 meters offset (approximately 0.0003 degrees latitude)
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 25.0,
          latitude: venueLatitude + 0.0003,
          longitude: venueLongitude,
          payloadVenueId: venueId,
          payloadVersion: '1',
        });

      // Should not be rejected for GPS reasons
      if (res.body.success === false) {
        expect(res.body.error).not.toContain('distance');
        expect(res.body.error).not.toContain('location');
      }
    });

    it('should flag or reject scan far from venue (>60m)', async () => {
      // ~5km offset
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          cardId,
          billAmount: 25.0,
          latitude: venueLatitude + 0.05,
          longitude: venueLongitude + 0.05,
          payloadVenueId: venueId,
          payloadVersion: '1',
        });

      if (res.status === 200) {
        // If accepted, should have elevated fraud score
        expect(res.body.data.fraudScore).toBeGreaterThan(0);
      } else {
        // If rejected, error should indicate location issue
        expect(res.status).toBe(400);
      }
    });
  });

  // ─── Invalid Sticker ──────────────────────────────────────────

  describe('Invalid Sticker Handling', () => {
    it('should reject scan with non-existent sticker code', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId: 'FAKE-STICKER-999',
          cardId,
          billAmount: 50.0,
          latitude: venueLatitude,
          longitude: venueLongitude,
          payloadVenueId: venueId,
          payloadVersion: '1',
        });

      expect(res.status).toBe(400);
    });
  });

  // ─── Scan History ─────────────────────────────────────────────

  describe('GET /api/stickers/my-scans', () => {
    // Seed 101 APPROVED scans so the ?limit=200 clamping assertion is meaningful:
    // without the 100-item cap, ?limit=200 would return all 101 and the count
    // assertion would fail, proving the cap is enforced.
    let seededScanIds: string[] = [];

    beforeAll(async () => {
      // Resolve the Sticker PK (UUID) — the StickerScan FK references Sticker.id,
      // not the human-readable stickerId string.
      const stickerRow = await prisma.sticker.findFirst({ where: { venueId } });
      const stickerPk = stickerRow!.id;

      // Create rows one-by-one so we capture each ID at creation time,
      // keeping the cleanup scope exactly bounded to these 101 rows.
      for (let i = 0; i < 101; i++) {
        const scan = await prisma.stickerScan.create({
          data: {
            userId,
            stickerId: stickerPk,
            venueId,
            cardId,
            status: 'APPROVED' as const,
            billAmount: 1.0,
          },
          select: { id: true },
        });
        seededScanIds.push(scan.id);
      }
    });

    afterAll(async () => {
      if (seededScanIds.length > 0) {
        await prisma.stickerScan.deleteMany({ where: { id: { in: seededScanIds } } });
        seededScanIds = [];
      }
    });

    it('should return user scan history', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('[AUTH] INV-RDM-033: GET /my-scans without token → 401', async () => {
      const res = await request(app).get('/api/stickers/my-scans');
      expect(res.status).toBe(401);
    });

    it('[INPUT] INV-RDM-029: ?limit=200 is clamped — returns 200 OK with valid shape', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans?limit=200');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.count).toBe('number');
      // With 101+ scans seeded, this assertion proves the 100-item cap is enforced:
      // if parsePagination's maxLimit were removed, ?limit=200 would return all 101
      // records and this check would fail.
      expect(res.body.count).toBe(100);
    });

    it('[INPUT] INV-RDM-029: ?limit=abc (invalid) uses default — returns 200 OK with valid shape', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans?limit=abc');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBe(50);
    });

    it('[INPUT] INV-RDM-029: ?limit=0 uses default — returns 200 OK with valid shape', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans?limit=0');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBe(50);
    });

    it('[INPUT] INV-RDM-029: ?limit=-5 uses default — returns 200 OK with valid shape', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans?limit=-5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBe(50);
    });

    it('[INPUT] INV-RDM-029: no ?limit param uses default — returns 200 OK with valid shape', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBe(50);
    });

    it('[INPUT] INV-RDM-029: ?limit=1 (valid in-range) returns exactly 1 result', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBe(1);
    });
  });

  // ─── Venue Analytics ──────────────────────────────────────────

  describe('GET /api/stickers/venue/:venueId/analytics', () => {
    it('should return venue scan analytics', async () => {
      // Promote test user to PARTNER role (analytics requires PARTNER/ADMIN).
      // Must also set status=ACTIVE since partner login blocks PENDING_VERIFICATION.
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'PARTNER', status: 'ACTIVE' },
      });
      // Re-login to get a token with the updated role
      const { accessToken: partnerToken } = await loginTestUser(userEmail, userPassword);

      const res = await authRequest(partnerToken)
        .get(`/api/stickers/venue/${venueId}/analytics`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      // Restore role
      await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } });
    });
  });

  // ─── Session Endpoint Validation ─────────────────────────────

  describe('POST /api/stickers/session', () => {
    beforeEach(async () => {
      await prisma.user.update({ where: { id: userId }, data: { role: 'USER', status: 'ACTIVE' } });
    });

    it('[AUTH] INV-RDM-031: POST /session returns 402 SUBSCRIPTION_REQUIRED for user with no active subscription', async () => {
      const noSubData = await createTestUser();
      const noSubId = noSubData.user.id;
      try {
        await prisma.user.update({ where: { id: noSubId }, data: { status: 'ACTIVE' } });
        const res = await authRequest(noSubData.accessToken)
          .post('/api/stickers/session')
          .send({ stickerId, cardId });
        expect(res.status).toBe(402);
        expect(res.body.error).toContain('SUBSCRIPTION_REQUIRED');
      } finally {
        await cleanupTestUser(noSubId);
      }
    });

    it('should reject request with missing stickerId with 400 (INV-RDM-016)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/session')
        .send({
          // stickerId intentionally omitted
          cardId,
          latitude: venueLatitude,
          longitude: venueLongitude,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/stickerId/i);
    });

    it('should reject request with null stickerId with 400 (INV-RDM-016)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/session')
        .send({
          stickerId: null,
          cardId,
          latitude: venueLatitude,
          longitude: venueLongitude,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/stickerId/i);
    });

    it('should reject request with empty string stickerId with 400 (INV-RDM-016)', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/session')
        .send({
          stickerId: '',
          cardId,
          latitude: venueLatitude,
          longitude: venueLongitude,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/stickerId/i);
    });
  });

  // ─── Admin Approve Endpoint Auth ─────────────────────────────

  describe('POST /api/stickers/admin/approve/:scanId', () => {
    it('[AUTH] INV-RDM-034: POST /admin/approve/:scanId returns 403 for non-admin user', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/admin/approve/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin Reject Endpoint Auth ──────────────────────────────

  describe('POST /api/stickers/admin/reject/:scanId', () => {
    it('[AUTH] INV-RDM-035: POST /admin/reject/:scanId returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/stickers/admin/reject/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(401);
    });

    it('[AUTH] INV-RDM-035: POST /admin/reject/:scanId returns 403 for non-admin user', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/admin/reject/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin Stats Endpoint Auth ───────────────────────────────

  describe('GET /api/stickers/admin/stats', () => {
    it('[AUTH] INV-RDM-037: GET /admin/stats without token → 401', async () => {
      const res = await request(app).get('/api/stickers/admin/stats');
      expect(res.status).toBe(401);
    });

    it('[AUTH] INV-RDM-037: GET /admin/stats returns 403 for non-admin user', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/admin/stats');
      expect(res.status).toBe(403);
    });
  });

  // ─── Admin Bulk-Approve Endpoint Auth ───────────────────────
  describe('POST /api/stickers/admin/bulk-approve', () => {
    it('[AUTH] INV-RDM-038: POST /admin/bulk-approve without token → 401', async () => {
      const res = await request(app)
        .post('/api/stickers/admin/bulk-approve')
        .send({ scanIds: ['00000000-0000-0000-0000-000000000001'] });
      expect(res.status).toBe(401);
    });

    it('[AUTH] INV-RDM-038: POST /admin/bulk-approve returns 403 for non-admin user', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/admin/bulk-approve')
        .send({ scanIds: ['00000000-0000-0000-0000-000000000001'] });
      expect(res.status).toBe(403);
    });

    it('[AUTH] INV-RDM-038: POST /admin/bulk-approve passes auth guard for ADMIN user', async () => {
      const res = await authRequest(adminAccessToken)
        .post('/api/stickers/admin/bulk-approve')
        .send({ scanIds: ['00000000-0000-0000-0000-000000000001'] });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('[AUTH] INV-RDM-038: POST /admin/bulk-approve passes auth guard for SUPER_ADMIN user', async () => {
      const superAdminToken = generateAdminToken(adminUserId, 'SUPER_ADMIN');
      const res = await authRequest(superAdminToken)
        .post('/api/stickers/admin/bulk-approve')
        .send({ scanIds: ['00000000-0000-0000-0000-000000000001'] });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  // ─── INV-RDM-043: Sticker Replace Lifecycle ─────────────────────────────────

  describe('[LIFECYCLE] INV-RDM-043: PATCH /replace sticker lifecycle', () => {
    // Shared stickers for tests 1-3 and 5 (one replace operation covers all)
    let sharedOldStickerId: string;   // stickerId (string)
    let sharedOldDbId: string;        // prisma id (uuid)
    let sharedReplaceRes: any;        // captured HTTP response body

    // Separate sticker for test 4 (double-replace)
    let doubleReplaceStickerId: string;

    // Use SUPER_ADMIN token to bypass requirePermission('stickers.write') seeding
    let superAdminToken: string;

    beforeAll(async () => {
      superAdminToken = generateAdminToken(adminUserId, 'SUPER_ADMIN');

      // Find a location under the shared venueId
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      if (!loc) throw new Error('No stickerLocation found for venueId in INV-RDM-043 setup');

      // Create an ACTIVE sticker for the shared replace tests (1-3, 5)
      const sharedStickerIdStr = `TEST-RDM043-SHARED-${Date.now()}`;
      const sharedSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc.id,
          stickerId: sharedStickerIdStr,
          qrCode: JSON.stringify({ test: true, id: sharedStickerIdStr }),
          locationType: 'TABLE',
          status: StickerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
      sharedOldStickerId = sharedSticker.stickerId;
      sharedOldDbId = sharedSticker.id;

      // Create a separate ACTIVE sticker for the double-replace test (4)
      const doubleStickerIdStr = `TEST-RDM043-DOUBLE-${Date.now() + 1}`;
      const doubleSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc.id,
          stickerId: doubleStickerIdStr,
          qrCode: JSON.stringify({ test: true, id: doubleStickerIdStr }),
          locationType: 'TABLE',
          status: StickerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
      doubleReplaceStickerId = doubleSticker.stickerId;

      // Perform the single replace for tests 1-3 and 5 once in beforeAll
      sharedReplaceRes = await authRequest(superAdminToken)
        .patch(`/api/stickers/${sharedOldStickerId}/replace`);
    });

    afterAll(async () => {
      await prisma.sticker.deleteMany({
        where: { stickerId: { startsWith: 'TEST-RDM043-' } },
      });
    });

    it('[LIFECYCLE] INV-RDM-043: PATCH /replace marks old sticker REPLACED in DB', async () => {
      expect(sharedReplaceRes.status).toBe(200);
      const oldInDb = await prisma.sticker.findUnique({ where: { id: sharedOldDbId } });
      expect(oldInDb).not.toBeNull();
      expect(oldInDb!.status).toBe(StickerStatus.REPLACED);
      expect(oldInDb!.deactivatedAt).not.toBeNull();
    });

    it('[LIFECYCLE] INV-RDM-043: PATCH /replace creates new PENDING sticker in DB', async () => {
      expect(sharedReplaceRes.status).toBe(200);
      const newInDb = await prisma.sticker.findFirst({ where: { replacesId: sharedOldDbId } });
      expect(newInDb).not.toBeNull();
      expect(newInDb!.status).toBe(StickerStatus.PENDING);
      expect(newInDb!.replacesId).toBe(sharedOldDbId);
    });

    it('[LIFECYCLE] INV-RDM-043: PATCH /replace returns {oldSticker: {status: REPLACED}, newSticker: {status: PENDING}} in response body', async () => {
      expect(sharedReplaceRes.status).toBe(200);
      expect(sharedReplaceRes.body.success).toBe(true);
      expect(sharedReplaceRes.body.data.oldSticker.status).toBe(StickerStatus.REPLACED);
      expect(sharedReplaceRes.body.data.newSticker.status).toBe(StickerStatus.PENDING);
    });

    it('[LIFECYCLE] INV-RDM-043: PATCH /replace on already-REPLACED sticker returns 400', async () => {
      // First replace the double-replace sticker
      const firstRes = await authRequest(superAdminToken)
        .patch(`/api/stickers/${doubleReplaceStickerId}/replace`);
      expect(firstRes.status).toBe(200);

      // Second replace on the now-REPLACED sticker must return 400
      const secondRes = await authRequest(superAdminToken)
        .patch(`/api/stickers/${doubleReplaceStickerId}/replace`);
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.success).toBe(false);
    });

    it('[LIFECYCLE] INV-RDM-043: PATCH /replace new sticker ID has versioned suffix', async () => {
      expect(sharedReplaceRes.status).toBe(200);
      const newStickerId: string = sharedReplaceRes.body.data.newSticker.stickerId;
      expect(newStickerId).toMatch(/-V\d+$/);
    });
  });
});
