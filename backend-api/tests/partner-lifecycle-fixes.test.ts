/**
 * Integration tests for partner lifecycle bug fixes
 *
 * Tests cover:
 * - DEFECT 1: Archived partner activation links are invalidated
 * - DEFECT 1: Suspended partner activation links are invalidated
 * - DEFECT 2: Archived->Active transition clears autoDeactivatedAt to prevent bulk-reactivation
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { PartnerStatus, StickerStatus } from '@prisma/client';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

/**
 * Generate a valid JWT token for a user
 */
function generateTestToken(userId: string, role: string): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId, role }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '24h',
  });
}

describe('Partner Lifecycle Bug Fixes', () => {
  let app: any;
  let superAdminToken: string;
  let superAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create a SUPER_ADMIN for test operations
    const superAdmin = await prisma.user.create({
      data: {
        email: `sa-lifecycle-${Date.now()}@test.local`,
        firstName: 'SA',
        lastName: 'Lifecycle',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    superAdminId = superAdmin.id;
    superAdminToken = generateTestToken(superAdmin.id, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('DEFECT 1: Activation links invalidated on archive/suspend', () => {
    it('should invalidate unconsumed activation links when partner is archived', async () => {
      // Create a partner
      const user = await prisma.user.create({
        data: {
          email: `partner-archive-${Date.now()}@test.local`,
          firstName: 'Archive',
          lastName: 'Test',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const partner = await prisma.partner.create({
        data: {
          businessName: 'Archive Test Partner',
          userId: user.id,
          status: PartnerStatus.ACTIVE,
          verifiedAt: new Date(),
        },
      });

      // Issue an activation link (e.g., for password reset/resend)
      const link = await prisma.activationLink.create({
        data: {
          partnerId: partner.id,
          token: 'test-token-archive-' + Date.now(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdById: superAdminId,
        },
      });

      expect(link.invalidatedAt).toBeNull();

      // Transition partner to ARCHIVED via the service
      const res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED', reason: 'Test archival' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PartnerStatus.ARCHIVED);

      // Verify the activation link was invalidated
      const invalidatedLink = await prisma.activationLink.findUnique({
        where: { id: link.id },
      });

      expect(invalidatedLink?.invalidatedAt).not.toBeNull();
      expect(invalidatedLink?.consumedAt).toBeNull(); // Was never consumed
    });

    it('should invalidate unconsumed activation links when partner is suspended', async () => {
      // Create a partner
      const user = await prisma.user.create({
        data: {
          email: `partner-suspend-${Date.now()}@test.local`,
          firstName: 'Suspend',
          lastName: 'Test',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const partner = await prisma.partner.create({
        data: {
          businessName: 'Suspend Test Partner',
          userId: user.id,
          status: PartnerStatus.ACTIVE,
          verifiedAt: new Date(),
        },
      });

      // Issue an activation link
      const link = await prisma.activationLink.create({
        data: {
          partnerId: partner.id,
          token: 'test-token-suspend-' + Date.now(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdById: superAdminId,
        },
      });

      expect(link.invalidatedAt).toBeNull();

      // Transition partner to SUSPENDED
      const res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'SUSPENDED', reason: 'Test suspension' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PartnerStatus.SUSPENDED);

      // Verify the activation link was invalidated
      const invalidatedLink = await prisma.activationLink.findUnique({
        where: { id: link.id },
      });

      expect(invalidatedLink?.invalidatedAt).not.toBeNull();
      expect(invalidatedLink?.consumedAt).toBeNull();
    });

    it('should not affect already-consumed activation links', async () => {
      // Create a partner
      const user = await prisma.user.create({
        data: {
          email: `partner-consumed-${Date.now()}@test.local`,
          firstName: 'Consumed',
          lastName: 'Test',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const partner = await prisma.partner.create({
        data: {
          businessName: 'Consumed Test Partner',
          userId: user.id,
          status: PartnerStatus.ACTIVE,
          verifiedAt: new Date(),
        },
      });

      // Create a consumed link (already used)
      const link = await prisma.activationLink.create({
        data: {
          partnerId: partner.id,
          token: 'test-token-consumed-' + Date.now(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdById: superAdminId,
          consumedAt: new Date(),
        },
      });

      const originalConsumedAt = link.consumedAt;

      // Transition partner to ARCHIVED
      const res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);

      // Verify the consumed link was NOT modified
      const unchangedLink = await prisma.activationLink.findUnique({
        where: { id: link.id },
      });

      expect(unchangedLink?.consumedAt).toEqual(originalConsumedAt);
      expect(unchangedLink?.invalidatedAt).toBeNull(); // Should remain null for consumed links
    });
  });

  describe('DEFECT 2: Archived->Active clears autoDeactivatedAt', () => {
    it('should clear autoDeactivatedAt when transitioning from Archived to Active', async () => {
      // Create a partner with venues and stickers
      const user = await prisma.user.create({
        data: {
          email: `partner-qr-clear-${Date.now()}@test.local`,
          firstName: 'QR',
          lastName: 'Clear',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const partner = await prisma.partner.create({
        data: {
          businessName: 'QR Clear Test Partner',
          userId: user.id,
          status: PartnerStatus.ACTIVE,
          verifiedAt: new Date(),
        },
      });

      // Create a venue
      const venue = await prisma.venue.create({
        data: {
          partnerId: partner.id,
          name: 'Test Venue',
        },
      });

      // Create a sticker location
      const location = await prisma.stickerLocation.create({
        data: {
          venueId: venue.id,
        },
      });

      // Create stickers
      const sticker1 = await prisma.sticker.create({
        data: {
          locationId: location.id,
          stickerId: 'sticker-1-' + Date.now(),
          status: StickerStatus.INACTIVE,
          autoDeactivatedAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        },
      });

      const sticker2 = await prisma.sticker.create({
        data: {
          locationId: location.id,
          stickerId: 'sticker-2-' + Date.now(),
          status: StickerStatus.INACTIVE,
          autoDeactivatedAt: null, // Manually deactivated
        },
      });

      // Verify stickers have autoDeactivatedAt set (or null for manual)
      expect(sticker1.autoDeactivatedAt).not.toBeNull();
      expect(sticker2.autoDeactivatedAt).toBeNull();

      // Transition to ARCHIVED
      let res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PartnerStatus.ARCHIVED);

      // Transition back to ACTIVE (requires re-onboarding)
      res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(PartnerStatus.ACTIVE);

      // Verify autoDeactivatedAt was cleared on all INACTIVE stickers
      const updatedSticker1 = await prisma.sticker.findUnique({
        where: { id: sticker1.id },
      });

      const updatedSticker2 = await prisma.sticker.findUnique({
        where: { id: sticker2.id },
      });

      expect(updatedSticker1?.autoDeactivatedAt).toBeNull();
      expect(updatedSticker2?.autoDeactivatedAt).toBeNull();
      expect(updatedSticker1?.status).toBe(StickerStatus.INACTIVE);
      expect(updatedSticker2?.status).toBe(StickerStatus.INACTIVE);
    });

    it('should prevent bulk-reactivation of archived-phase stickers on next Inactive->Active cycle', async () => {
      // Scenario: Partner → ARCHIVED → ACTIVE → INACTIVE → ACTIVE
      // Stickers should NOT be bulk-reactivated in the final step
      // because they were deactivated during the ARCHIVED phase

      const user = await prisma.user.create({
        data: {
          email: `partner-bulkre-${Date.now()}@test.local`,
          firstName: 'BulkRe',
          lastName: 'Test',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      const partner = await prisma.partner.create({
        data: {
          businessName: 'BulkRe Test Partner',
          userId: user.id,
          status: PartnerStatus.ACTIVE,
          verifiedAt: new Date(),
        },
      });

      const venue = await prisma.venue.create({
        data: {
          partnerId: partner.id,
          name: 'Test Venue',
        },
      });

      const location = await prisma.stickerLocation.create({
        data: {
          venueId: venue.id,
        },
      });

      // Create a sticker
      const sticker = await prisma.sticker.create({
        data: {
          locationId: location.id,
          stickerId: 'sticker-bulkre-' + Date.now(),
          status: StickerStatus.ACTIVE,
        },
      });

      // Step 1: Transition to ARCHIVED (stickers auto-deactivate)
      let res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);

      let archivedSticker = await prisma.sticker.findUnique({
        where: { id: sticker.id },
      });
      expect(archivedSticker?.status).toBe(StickerStatus.INACTIVE);
      expect(archivedSticker?.autoDeactivatedAt).not.toBeNull();

      // Step 2: Transition back to ACTIVE (re-onboarding)
      // autoDeactivatedAt should be cleared
      res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);

      let clearedSticker = await prisma.sticker.findUnique({
        where: { id: sticker.id },
      });
      expect(clearedSticker?.status).toBe(StickerStatus.INACTIVE); // Still inactive
      expect(clearedSticker?.autoDeactivatedAt).toBeNull(); // DEFECT 2 FIX

      // Step 3: Transition to INACTIVE (voluntary pause or admin suspension)
      res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'INACTIVE' });

      expect(res.status).toBe(200);

      // Step 4: Transition back to ACTIVE
      // The sticker should NOT be bulk-reactivated because autoDeactivatedAt was cleared
      res = await request(app)
        .patch(`/api/admin/partners/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);

      const finalSticker = await prisma.sticker.findUnique({
        where: { id: sticker.id },
      });

      // Sticker should remain INACTIVE because autoDeactivatedAt was null
      // (bulk-reactivation only targets stickers with autoDeactivatedAt IS NOT NULL)
      expect(finalSticker?.status).toBe(StickerStatus.INACTIVE);
      expect(finalSticker?.autoDeactivatedAt).toBeNull();
    });
  });
});
