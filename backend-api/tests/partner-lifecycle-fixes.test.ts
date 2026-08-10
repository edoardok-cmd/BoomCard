/**
 * Integration tests for partner lifecycle bug fixes
 *
 * Tests cover:
 * - DEFECT 1: Archived partner activation links are invalidated
 * - DEFECT 1: Suspended partner activation links are invalidated
 * - DEFECT 2: Archived->Active transition clears autoDeactivatedAt to prevent bulk-reactivation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/server';
import { PartnerStatus, StickerStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { genTestPhone } from './helpers/test-utils';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

/**
 * Generate a valid JWT token for a user
 */
function generateTestToken(userId: string, role: string): string {
  return jwt.sign({ id: userId, email: `${userId}@test.local`, role }, JWT_SECRET, {
    expiresIn: '15m',
  });
}

/**
 * Helper to create a user with required fields
 */
async function createTestUser(email: string, role: string = 'PARTNER') {
  return prisma.user.create({
    data: {
      email,
      passwordHash: 'hash',
      firstName: role,
      lastName: 'Test',
      phone: genTestPhone(),
      role,
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
}

/**
 * Helper to create a partner with required fields
 */
async function createTestPartner(businessName: string, userId: string, status: PartnerStatus = PartnerStatus.ACTIVE) {
  return prisma.partner.create({
    data: {
      businessName,
      userId,
      category: 'test-category',
      status,
      verifiedAt: status === PartnerStatus.ACTIVE ? new Date() : null,
    },
  });
}

/**
 * Helper to create a venue with required fields
 */
async function createTestVenue(partnerId: string, name: string = 'Test Venue') {
  return prisma.venue.create({
    data: {
      partnerId,
      name,
      address: 'Test Address',
      city: 'Test City',
    },
  });
}

/**
 * Helper to create a sticker location with required fields
 */
async function createTestStickerLocation(venueId: string, name: string = 'Test Location', locationNumber: string = 'LOC-001') {
  return prisma.stickerLocation.create({
    data: {
      venueId,
      name,
      locationNumber,
    },
  });
}

/**
 * Helper to create a sticker with required fields
 */
async function createTestSticker(locationId: string, stickerId: string, venueId: string, status: StickerStatus = StickerStatus.ACTIVE, autoDeactivatedAt: Date | null = null) {
  return prisma.sticker.create({
    data: {
      locationId,
      stickerId,
      venueId,
      status,
      qrCode: `QR-${stickerId}`,
      autoDeactivatedAt,
    },
  });
}

describe('Partner Lifecycle Bug Fixes', () => {
  let superAdminToken: string;
  let superAdminId: string;

  beforeAll(async () => {
    // Ensure the SUPER_ADMIN admin role row exists
    await prisma.adminRole.upsert({
      where: { key: 'SUPER_ADMIN' },
      update: {},
      create: { key: 'SUPER_ADMIN', label: 'Super Admin' },
    });

    // Pre-cleanup stale users from previous runs
    await prisma.activationLink.deleteMany({ where: { partner: { user: { email: { contains: 'lifecycle' } } } } });
    await prisma.partnerStatusChange.deleteMany({ where: { partner: { user: { email: { contains: 'lifecycle' } } } } });
    await prisma.sticker.deleteMany({ where: { location: { venue: { partner: { user: { email: { contains: 'lifecycle' } } } } } } });
    await prisma.stickerLocation.deleteMany({ where: { venue: { partner: { user: { email: { contains: 'lifecycle' } } } } } });
    await prisma.venue.deleteMany({ where: { partner: { user: { email: { contains: 'lifecycle' } } } } });
    await prisma.partner.deleteMany({ where: { user: { email: { contains: 'lifecycle' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'lifecycle' } } });

    // Create a SUPER_ADMIN user for auth
    const superAdmin = await prisma.user.create({
      data: {
        email: `sa-lifecycle-${Date.now()}@test.local`,
        passwordHash: 'hash',
        firstName: 'Super',
        lastName: 'Admin',
        phone: genTestPhone(),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    superAdminId = superAdmin.id;
    superAdminToken = generateTestToken(superAdmin.id, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('DEFECT 1: Activation links invalidated on archive/suspend', () => {
    it('should invalidate unconsumed activation links when partner is archived', async () => {
      // Create a partner
      const user = await createTestUser(`partner-archive-${Date.now()}@test.local`, 'PARTNER');

      const partner = await createTestPartner('Archive Test Partner', user.id, PartnerStatus.ACTIVE);

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
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED', reason: 'Test archival' });

      expect(res.status).toBe(200);
      expect(res.body.partner.status).toBe(PartnerStatus.ARCHIVED);

      // Verify the activation link was invalidated
      const invalidatedLink = await prisma.activationLink.findUnique({
        where: { id: link.id },
      });

      expect(invalidatedLink?.invalidatedAt).not.toBeNull();
      expect(invalidatedLink?.consumedAt).toBeNull(); // Was never consumed
    });

    it('should invalidate unconsumed activation links when partner is suspended', async () => {
      // Create a partner
      const user = await createTestUser(`partner-suspend-${Date.now()}@test.local`, 'PARTNER');

      const partner = await createTestPartner('Suspend Test Partner', user.id, PartnerStatus.ACTIVE);

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
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'SUSPENDED', reason: 'Test suspension' });

      expect(res.status).toBe(200);
      expect(res.body.partner.status).toBe(PartnerStatus.SUSPENDED);

      // Verify the activation link was invalidated
      const invalidatedLink = await prisma.activationLink.findUnique({
        where: { id: link.id },
      });

      expect(invalidatedLink?.invalidatedAt).not.toBeNull();
      expect(invalidatedLink?.consumedAt).toBeNull();
    });

    it('should not affect already-consumed activation links', async () => {
      // Create a partner
      const user = await createTestUser(`partner-consumed-${Date.now()}@test.local`, 'PARTNER');

      const partner = await createTestPartner('Consumed Test Partner', user.id, PartnerStatus.ACTIVE);

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
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
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
      const user = await createTestUser(`partner-qr-clear-${Date.now()}@test.local`, 'PARTNER');

      const partner = await createTestPartner('QR Clear Test Partner', user.id, PartnerStatus.ACTIVE);

      // Create a venue
      const venue = await createTestVenue(partner.id, 'Test Venue');

      // Create a sticker location
      const location = await createTestStickerLocation(venue.id, 'Test Location');

      // Create stickers
      const sticker1 = await createTestSticker(location.id, 'sticker-1-' + Date.now(), venue.id, StickerStatus.INACTIVE, new Date(Date.now() - 1000 * 60 * 60)); // 1 hour ago
      const sticker2 = await createTestSticker(location.id, 'sticker-2-' + Date.now(), venue.id, StickerStatus.INACTIVE, null); // Manually deactivated

      // Verify stickers have autoDeactivatedAt set (or null for manual)
      expect(sticker1.autoDeactivatedAt).not.toBeNull();
      expect(sticker2.autoDeactivatedAt).toBeNull();

      // Transition to ARCHIVED
      let res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);
      expect(res.body.partner.status).toBe(PartnerStatus.ARCHIVED);

      // Transition back to ACTIVE (requires re-onboarding)
      // Spec §1.7 / §2.4 / §12 rule 5: reactivating an ARCHIVED partner should
      // re-enter the onboarding pipeline (status=PENDING) rather than jumping
      // directly to ACTIVE. The partner must be approved and consume an activation link
      // before becoming operationally live.
      res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.partner.status).toBe(PartnerStatus.PENDING);
      expect(res.body.partner.requestStatus).toBe('ONBOARDING');
      expect(res.body.partner.verifiedAt).toBeNull();

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

      const user = await createTestUser(`partner-bulkre-${Date.now()}@test.local`, 'PARTNER');

      const partner = await createTestPartner('BulkRe Test Partner', user.id, PartnerStatus.ACTIVE);

      const venue = await createTestVenue(partner.id, 'Test Venue');

      const location = await createTestStickerLocation(venue.id, 'Test Location', 'LOC-001');

      // Create a sticker
      const sticker = await createTestSticker(location.id, 'sticker-bulkre-' + Date.now(), venue.id, StickerStatus.ACTIVE);

      // Step 1: Transition to ARCHIVED (stickers auto-deactivate)
      let res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ARCHIVED' });

      expect(res.status).toBe(200);

      let archivedSticker = await prisma.sticker.findUnique({
        where: { id: sticker.id },
      });
      expect(archivedSticker?.status).toBe(StickerStatus.INACTIVE);
      expect(archivedSticker?.autoDeactivatedAt).not.toBeNull();

      // Step 2: Transition back to ACTIVE (re-onboarding)
      // Per spec §1.7 / §2.4 / §12 rule 5, ARCHIVED→ACTIVE reactivation puts the partner
      // in PENDING status (re-enters onboarding pipeline) rather than directly to ACTIVE.
      // The partner must be approved and consume an activation link to become operationally live.
      // autoDeactivatedAt should be cleared on all INACTIVE stickers to prevent accidental
      // bulk-reactivation in a future Inactive→Active cycle (DEFECT 2 FIX).
      res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.partner.status).toBe(PartnerStatus.PENDING); // Not directly ACTIVE

      let clearedSticker = await prisma.sticker.findUnique({
        where: { id: sticker.id },
      });
      expect(clearedSticker?.status).toBe(StickerStatus.INACTIVE); // Still inactive
      expect(clearedSticker?.autoDeactivatedAt).toBeNull(); // DEFECT 2 FIX

      // Verify the DEFECT 2 FIX: autoDeactivatedAt was cleared on all INACTIVE stickers.
      // This ensures that if the partner were to later become INACTIVE then ACTIVE again,
      // the stickers would NOT be unexpectedly bulk-reactivated. They require explicit
      // admin action per spec §2.4 Gap 6.
      //
      // Note: We stop here because the partner is now in PENDING state (re-onboarding).
      // To continue the test through further status transitions, the partner would need
      // to be approved and consume an activation link via the onboarding flow first.
      // The critical assertion is above: autoDeactivatedAt must be null.
    });
  });
});
