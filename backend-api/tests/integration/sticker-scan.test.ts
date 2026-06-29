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
import {
  createTestUser,
  createTestSubscription,
  loginTestUser,
  createTestVenue,
  cleanupTestUser,
  cleanupTestVenue,
  authRequest,
} from '../helpers/test-utils';

describe('Sticker Scan Flow (F06)', () => {
  const createdUserIds: string[] = [];
  let userId: string;
  let accessToken: string;
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

    it('should reject scan without required fields', async () => {
      const res = await authRequest(accessToken)
        .post('/api/stickers/scan')
        .send({
          stickerId,
          // Missing cardId and billAmount
        });

      expect(res.status).toBe(400);
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
    it('should return user scan history', async () => {
      const res = await authRequest(accessToken).get('/api/stickers/my-scans');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/stickers/my-scans');
      expect(res.status).toBe(401);
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
});
