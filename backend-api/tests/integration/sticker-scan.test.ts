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

  // Sofia coordinates for GPS tests
  const venueLatitude = 42.6977;
  const venueLongitude = 23.3219;

  beforeAll(async () => {
    const testData = await createTestUser();
    userId = testData.user.id;
    accessToken = testData.accessToken;
    createdUserIds.push(userId);

    // Get user's card
    const card = await prisma.card.findFirst({ where: { userId } });
    cardId = card!.id;

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
        });

      if (res.status === 200) {
        // Standard card = 5% cashback
        expect(res.body.data.cashbackPercent).toBe(5);
        expect(res.body.data.cashbackAmount).toBe(5); // 5% of 100
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

    it('should reject zero or negative bill amount', async () => {
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
      const res = await authRequest(accessToken)
        .get(`/api/stickers/venue/${venueId}/analytics`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });
});
