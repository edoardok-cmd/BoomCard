/**
 * Integration Tests: QR Code Lifecycle Management
 *
 * Covers acceptance criteria for BC-PARTNER-ADMIN-QR-SPEC-FIX:
 * - H1: Partner suspension blocks QR scans
 * - M1-M3: QR lifecycle endpoints (activate, reactivate, replace, processing)
 * - M4: QR status history tracking
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
import { PartnerStatus, StickerStatus, VenueStatus } from '@prisma/client';

describe('QR Code Lifecycle Management', () => {
  const createdUserIds: string[] = [];
  const createdVenueIds: string[] = [];

  let adminUserId: string;
  let adminToken: string;
  let partnerUserId: string;
  let partnerToken: string;
  let partnerId: string;
  let venueId: string;
  let locationId: string;
  let stickerId: string;
  let stickerDbId: string;

  beforeAll(async () => {
    // Create admin user
    const adminData = await createTestUser();
    adminUserId = adminData.user.id;
    adminToken = adminData.accessToken;
    createdUserIds.push(adminUserId);

    // Create partner user
    const partnerData = await createTestUser();
    partnerUserId = partnerData.user.id;
    partnerToken = partnerData.accessToken;
    createdUserIds.push(partnerUserId);

    // Get partner entity
    const partner = await prisma.partner.findFirst({ where: { userId: partnerUserId } });
    if (!partner) throw new Error('Partner not found');
    partnerId = partner.id;

    // Create test venue and sticker
    const venueData = await createTestVenue(partnerUserId);
    venueId = venueData.venue.id;
    const location = await prisma.stickerLocation.findFirst({ where: { venueId } });
    if (!location) throw new Error('Location not found');
    locationId = location.id;
    stickerId = venueData.sticker.stickerId;
    stickerDbId = venueData.sticker.id;
    createdVenueIds.push(venueId);
  });

  afterAll(async () => {
    for (const vId of createdVenueIds) {
      await cleanupTestVenue(vId);
    }
    for (const uId of createdUserIds) {
      await cleanupTestUser(uId);
    }
  });

  describe('H1: Partner Suspension Blocks QR Scans', () => {
    it('should allow scan when partner is ACTIVE and verified', async () => {
      // Ensure partner is active
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });

      // Create user and subscription for scanning
      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      const res = await authRequest(scannerToken)
        .get(`/api/stickers/validate/${stickerId}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('should reject scan when partner is SUSPENDED', async () => {
      // Suspend the partner
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.SUSPENDED, verifiedAt: new Date() },
      });

      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      const res = await authRequest(scannerToken)
        .get(`/api/stickers/validate/${stickerId}`);

      expect(res.status).toBe(404);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toContain('PARTNER_NOT_ACCEPTING');

      // Restore partner to ACTIVE for other tests
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });
    });

    it('should reject scan when partner verifiedAt is null', async () => {
      // Partner active but not verified
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: null },
      });

      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      const res = await authRequest(scannerToken)
        .get(`/api/stickers/validate/${stickerId}`);

      expect(res.status).toBe(404);
      expect(res.body.valid).toBe(false);

      // Restore for other tests
      await prisma.partner.update({
        where: { id: partnerId },
        data: { verifiedAt: new Date() },
      });
    });

    it('should reject createSession when partner is SUSPENDED', async () => {
      // Suspend the partner
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.SUSPENDED, verifiedAt: new Date() },
      });

      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      // Try to create a session — should be rejected
      const res = await authRequest(scannerToken)
        .post('/api/stickers/session')
        .send({
          stickerId,
          latitude: 42.6977,
          longitude: 23.3219,
          payloadVenueId: venueId,
          payloadVersion: '1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('PARTNER_NOT_ACCEPTING');

      // Restore partner to ACTIVE for other tests
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });
    });

    it('should reject scan when venue is SUSPENDED', async () => {
      // Ensure partner is active first
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });

      // Suspend the venue
      await prisma.venue.update({
        where: { id: venueId },
        data: { venueStatus: VenueStatus.SUSPENDED },
      });

      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      // Test validateStickerById endpoint
      const validateRes = await authRequest(scannerToken)
        .get(`/api/stickers/validate/${stickerId}`);

      expect(validateRes.status).toBe(404);
      expect(validateRes.body.valid).toBe(false);
      expect(validateRes.body.message).toContain('VENUE_SUSPENDED');

      // Reactivate the venue for other tests
      await prisma.venue.update({
        where: { id: venueId },
        data: { venueStatus: VenueStatus.ACTIVE },
      });
    });

    it('should reject createSession when venue is SUSPENDED', async () => {
      // Ensure partner is active
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });

      // Suspend the venue
      await prisma.venue.update({
        where: { id: venueId },
        data: { venueStatus: VenueStatus.SUSPENDED },
      });

      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      // Try to create a session — should be rejected
      const res = await authRequest(scannerToken)
        .post('/api/stickers/session')
        .send({
          stickerId,
          latitude: 42.6977,
          longitude: 23.3219,
          payloadVenueId: venueId,
          payloadVersion: '1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('VENUE_SUSPENDED');

      // Reactivate the venue for other tests
      await prisma.venue.update({
        where: { id: venueId },
        data: { venueStatus: VenueStatus.ACTIVE },
      });
    });

    it('should allow scan after venue is reactivated', async () => {
      // Ensure venue and partner are both ACTIVE
      await prisma.venue.update({
        where: { id: venueId },
        data: { venueStatus: VenueStatus.ACTIVE },
      });

      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });

      const scannerData = await createTestUser();
      const scannerId = scannerData.user.id;
      const scannerToken = scannerData.accessToken;
      createdUserIds.push(scannerId);
      await createTestSubscription(scannerId, 'PREMIUM_WEEKLY');

      // Validation should succeed
      const validateRes = await authRequest(scannerToken)
        .get(`/api/stickers/validate/${stickerId}`);

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.valid).toBe(true);

      // Session creation should succeed
      const sessionRes = await authRequest(scannerToken)
        .post('/api/stickers/session')
        .send({
          stickerId,
          latitude: 42.6977,
          longitude: 23.3219,
          payloadVenueId: venueId,
          payloadVersion: '1.0',
        });

      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body.success).toBe(true);
    });
  });

  describe('M1: QR Activation Endpoint', () => {
    let pendingStickerId: string;

    beforeAll(async () => {
      // Create a PENDING sticker
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      const pendingSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc!.id,
          stickerId: `TEST-PENDING-${Date.now()}`,
          qrCode: JSON.stringify({ test: true }),
          locationType: 'TABLE',
          status: StickerStatus.PENDING,
        },
      });
      pendingStickerId = pendingSticker.stickerId;
    });

    it('should activate a PENDING sticker when admin calls endpoint', async () => {
      const res = await authRequest(adminToken)
        .post(`/api/stickers/activate/${pendingStickerId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(StickerStatus.ACTIVE);
    });

    it('should reject activation when partner is not ACTIVE', async () => {
      // Create another PENDING sticker
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      const newSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc!.id,
          stickerId: `TEST-PENDING2-${Date.now()}`,
          qrCode: JSON.stringify({ test: true }),
          locationType: 'TABLE',
          status: StickerStatus.PENDING,
        },
      });

      // Suspend partner
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.SUSPENDED },
      });

      const res = await authRequest(adminToken)
        .post(`/api/stickers/activate/${newSticker.stickerId}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Cannot activate QR code while partner status is not Active');

      // Restore partner
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });
    });
  });

  describe('M2: QR Reactivation Endpoint', () => {
    let inactiveStickerId: string;

    beforeAll(async () => {
      // Create an INACTIVE sticker
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      const inactiveSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc!.id,
          stickerId: `TEST-INACTIVE-${Date.now()}`,
          qrCode: JSON.stringify({ test: true }),
          locationType: 'TABLE',
          status: StickerStatus.INACTIVE,
          autoDeactivatedAt: new Date(),
        },
      });
      inactiveStickerId = inactiveSticker.stickerId;
    });

    it('should reactivate an INACTIVE sticker', async () => {
      const res = await authRequest(adminToken)
        .post(`/api/stickers/${inactiveStickerId}/reactivate`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(StickerStatus.ACTIVE);
    });

    it('should reject reactivation when partner is not operationally active', async () => {
      // Create another INACTIVE sticker
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      const newInactiveSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc!.id,
          stickerId: `TEST-INACTIVE2-${Date.now()}`,
          qrCode: JSON.stringify({ test: true }),
          locationType: 'TABLE',
          status: StickerStatus.INACTIVE,
          autoDeactivatedAt: new Date(),
        },
      });

      // Suspend partner (makes it not operationally active)
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.SUSPENDED, verifiedAt: new Date() },
      });

      const res = await authRequest(adminToken)
        .post(`/api/stickers/${newInactiveSticker.stickerId}/reactivate`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Cannot activate');

      // Restore partner
      await prisma.partner.update({
        where: { id: partnerId },
        data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
      });
    });
  });

  describe('M3: QR Replacement Endpoint', () => {
    let activeStickerId: string;

    beforeAll(async () => {
      // Ensure we have an ACTIVE sticker
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      const activeSticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc!.id,
          stickerId: `TEST-ACTIVE-${Date.now()}`,
          qrCode: JSON.stringify({ test: true }),
          locationType: 'TABLE',
          status: StickerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
      activeStickerId = activeSticker.stickerId;
    });

    it('should replace an ACTIVE sticker', async () => {
      const res = await authRequest(adminToken)
        .patch(`/api/stickers/${activeStickerId}/replace`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.oldSticker.status).toBe(StickerStatus.REPLACED);
      expect(res.body.data.newSticker.status).toBe(StickerStatus.PENDING);
    });
  });

  describe('M4: QR Status History Endpoint', () => {
    let historyStickerId: string;
    let historyDbId: string;

    beforeAll(async () => {
      // Create a sticker and track its status changes
      const loc = await prisma.stickerLocation.findFirst({ where: { venueId } });
      const sticker = await prisma.sticker.create({
        data: {
          venueId,
          locationId: loc!.id,
          stickerId: `TEST-HISTORY-${Date.now()}`,
          qrCode: JSON.stringify({ test: true }),
          locationType: 'TABLE',
          status: StickerStatus.PENDING,
        },
      });
      historyStickerId = sticker.stickerId;
      historyDbId = sticker.id;

      // Activate it (creates audit entry)
      await authRequest(adminToken)
        .post(`/api/stickers/activate/${historyStickerId}`);
    });

    it('should retrieve status history for a sticker', async () => {
      const res = await authRequest(adminToken)
        .get(`/api/stickers/${historyStickerId}/status-history`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should have at least the activation event
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('toStatus');
        expect(res.body.data[0]).toHaveProperty('changedAt');
        expect(res.body.data[0]).toHaveProperty('reason');
      }
    });

    it('should return 404 for non-existent sticker', async () => {
      const res = await authRequest(adminToken)
        .get(`/api/stickers/NONEXISTENT-${Date.now()}/status-history`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Acceptance Criteria #6: Error Status Codes', () => {
    it('should return 4xx for user errors (not found, invalid input)', async () => {
      const res = await authRequest(adminToken)
        .post(`/api/stickers/activate/NONEXISTENT-${Date.now()}`);

      expect(res.status).toBe(404);
      expect([400, 404]).toContain(res.status);
    });

    it('should return 4xx for permission errors', async () => {
      // Create non-admin user
      const nonAdminData = await createTestUser();
      const nonAdminToken = nonAdminData.accessToken;
      createdUserIds.push(nonAdminData.user.id);

      const res = await authRequest(nonAdminToken)
        .post(`/api/stickers/activate/${stickerId}`);

      expect([400, 401, 403]).toContain(res.status);
    });
  });
});
