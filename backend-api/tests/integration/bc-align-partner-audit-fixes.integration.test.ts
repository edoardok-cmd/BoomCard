/**
 * BC-ALIGN-PARTNER Audit Round 1 Fixes — Integration Tests
 *
 * Tests for the three MEDIUM-severity fixes from audit round 1:
 * 1. Pending changes approval field validation (only allow description, descriptionBg, amenities, openingHours)
 * 2. Password policy validation before transaction (fail fast without consuming token)
 * 3. Differentiated error messages for activation links (issued vs not issued)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { ActivationLinkReason, PartnerStatus, UserStatus } from '@prisma/client';
import { activationLinkService } from '../../src/services/activationLink.service';
import { genTestPhone } from '../helpers/test-utils';

describe('BC-ALIGN-PARTNER: Audit Round 1 Fixes', () => {
  let adminToken: string;
  let adminUser: any;
  let testPartner: any;
  let testUser: any;

  beforeAll(async () => {
    // Create test admin
    const adminEmail = `admin-${Date.now()}@boomcard.bg`;
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash('AdminPass123!', 12),
        role: 'ADMIN',
        status: UserStatus.ACTIVE,
        firstName: 'Test',
        lastName: 'Admin',
        phone: genTestPhone(),
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    // Login admin and get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'AdminPass123!', clientType: 'web' });
    adminToken = loginRes.body.data?.token || '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create a test partner for each test
    const partnerEmail = `partner-${Date.now()}@boomcard.bg`;
    testUser = await prisma.user.create({
      data: {
        email: partnerEmail,
        passwordHash: await bcrypt.hash('PartnerPass123!', 12),
        role: 'PARTNER',
        status: UserStatus.ACTIVE,
        firstName: 'Test',
        lastName: 'Partner',
        phone: genTestPhone(),
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    testPartner = await prisma.partner.create({
      data: {
        userId: testUser.id,
        businessName: 'Test Partner Business',
        status: PartnerStatus.ACTIVE,
        verifiedAt: new Date(),
      },
    });
  });

  describe('Fix 1: Pending Changes Approval Field Validation', () => {
    it('should approve ONLY whitelisted fields (description, descriptionBg, amenities, openingHours)', async () => {
      // Arrange: Set pendingChanges with allowed fields
      const pendingData = {
        description: 'Updated description',
        descriptionBg: 'Обновено описание',
        amenities: ['parking', 'wifi'],
        openingHours: '09:00-18:00',
      };

      await prisma.partner.update({
        where: { id: testPartner.id },
        data: {
          pendingChanges: pendingData as any,
          pendingChangesAt: new Date(),
        },
      });

      // Act: Approve the pending changes
      const res = await request(app)
        .post(`/api/partners/${testPartner.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert: Changes should be applied
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the changes were applied
      const updated = await prisma.partner.findUnique({
        where: { id: testPartner.id },
      });
      expect(updated?.description).toBe('Updated description');
      expect(updated?.descriptionBg).toBe('Обновено описание');
      expect(updated?.amenities).toEqual(['parking', 'wifi']);
      expect(updated?.openingHours).toBe('09:00-18:00');
      expect(updated?.pendingChanges).toBeNull();
    });

    it('should filter out disallowed fields (businessName, email, phone, features, etc.)', async () => {
      // Arrange: Set pendingChanges with mixed allowed + disallowed fields
      // This simulates a scenario where pendingChanges was somehow polluted
      // with disallowed fields (e.g., via a direct DB update or an old bug)
      const pendingData = {
        description: 'Safe description',
        businessName: 'HACKED Business Name', // Should be FILTERED OUT
        email: 'hacked@example.com', // Should be FILTERED OUT
        phone: '+1234567890', // Should be FILTERED OUT
        features: { admin: 'managed' }, // Should be FILTERED OUT
        address: 'Hacked address', // Should be FILTERED OUT
      };

      await prisma.partner.update({
        where: { id: testPartner.id },
        data: {
          pendingChanges: pendingData as any,
          pendingChangesAt: new Date(),
        },
      });

      // Act: Approve the pending changes
      const res = await request(app)
        .post(`/api/partners/${testPartner.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert: Only allowed field should be applied, disallowed fields should be filtered
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await prisma.partner.findUnique({
        where: { id: testPartner.id },
      });
      expect(updated?.description).toBe('Safe description');
      expect(updated?.businessName).not.toBe('HACKED Business Name'); // Should NOT change
      expect(updated?.businessName).toBe('Test Partner Business'); // Should remain original
      expect(updated?.pendingChanges).toBeNull();
    });

    it('should return 400 when there are no pending changes to approve', async () => {
      // Arrange: Partner has no pending changes
      await prisma.partner.update({
        where: { id: testPartner.id },
        data: { pendingChanges: null, pendingChangesAt: null },
      });

      // Act
      const res = await request(app)
        .post(`/api/partners/${testPartner.id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No pending changes');
    });
  });

  describe('Fix 2: Password Policy Validation Before Transaction', () => {
    it('should reject weak password BEFORE consuming the token', async () => {
      // Arrange: Create an activation link
      const link = await activationLinkService.issue({
        partnerId: testPartner.id,
        createdById: adminUser.id,
        reason: 'INITIAL' as ActivationLinkReason,
      });

      // Act: Try to consume with a weak password
      const consumePromise = activationLinkService.consume(link.token, {
        password: 'short', // Too short, fails policy
      });

      // Assert: Should throw AUTH_PASSWORD_POLICY error
      await expect(consumePromise).rejects.toMatchObject({
        code: 'AUTH_PASSWORD_POLICY',
      });

      // Verify the token was NOT consumed
      const linkAfter = await prisma.activationLink.findUnique({
        where: { token: link.token },
      });
      expect(linkAfter?.consumedAt).toBeNull();
      expect(linkAfter?.invalidatedAt).toBeNull();
    });

    it('should accept valid password and consume the token', async () => {
      // Arrange: Create an activation link
      const link = await activationLinkService.issue({
        partnerId: testPartner.id,
        createdById: adminUser.id,
        reason: 'INITIAL' as ActivationLinkReason,
      });

      // Act: Consume with a valid password
      const result = await activationLinkService.consume(link.token, {
        password: 'ValidPass123!',
      });

      // Assert: Token should be consumed and user password updated
      expect(result).toBeDefined();
      expect(result.partner.verifiedAt).toBeDefined();

      const linkAfter = await prisma.activationLink.findUnique({
        where: { token: link.token },
      });
      expect(linkAfter?.consumedAt).not.toBeNull();
    });

    it('should fail on various weak password patterns (before transaction)', async () => {
      const weakPasswords = [
        'abc', // Too short
        '12345678', // No uppercase
        'ABCDEFGH', // No lowercase
        'Abcdefgh', // No digit
        'Abcd1234', // No special char
      ];

      for (const weakPassword of weakPasswords) {
        // Arrange: Create a fresh activation link for each test
        const link = await activationLinkService.issue({
          partnerId: testPartner.id,
          createdById: adminUser.id,
          reason: 'RESEND' as ActivationLinkReason,
        });

        // Act & Assert: Should reject before transaction
        await expect(
          activationLinkService.consume(link.token, { password: weakPassword })
        ).rejects.toMatchObject({
          code: 'AUTH_PASSWORD_POLICY',
        });

        // Verify token not consumed
        const linkAfter = await prisma.activationLink.findUnique({
          where: { token: link.token },
        });
        expect(linkAfter?.consumedAt).toBeNull(
          `Token should not be consumed for weak password: ${weakPassword}`
        );
      }
    });
  });

  describe('Fix 3: Differentiated Login Error Messages for Activation Links', () => {
    it('should return "link sent" error when unconsumed activation link exists', async () => {
      // Arrange: Create a partner with no verifiedAt and an unconsumed link
      const pendingPartnerEmail = `pending-${Date.now()}@boomcard.bg`;
      const pendingUser = await prisma.user.create({
        data: {
          email: pendingPartnerEmail,
          passwordHash: await bcrypt.hash('PartnerPass123!', 12),
          role: 'PARTNER',
          status: UserStatus.ACTIVE,
          firstName: 'Pending',
          lastName: 'Partner',
          phone: genTestPhone(),
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      const pendingPartner = await prisma.partner.create({
        data: {
          userId: pendingUser.id,
          businessName: 'Pending Partner',
          status: PartnerStatus.PENDING,
          verifiedAt: null, // Not verified
        },
      });

      // Create an unconsumed activation link
      await activationLinkService.issue({
        partnerId: pendingPartner.id,
        createdById: adminUser.id,
        reason: 'INITIAL' as ActivationLinkReason,
      });

      // Act: Try to login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: pendingPartnerEmail,
          password: 'PartnerPass123!',
          clientType: 'web',
        });

      // Assert: Should get "link sent" error message
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Активационния линк е изпратен');
    });

    it('should return "awaiting activation" error when NO unconsumed link exists', async () => {
      // Arrange: Create a partner with no verifiedAt and NO activation link
      const nolinkPartnerEmail = `nolink-${Date.now()}@boomcard.bg`;
      const nolinkUser = await prisma.user.create({
        data: {
          email: nolinkPartnerEmail,
          passwordHash: await bcrypt.hash('PartnerPass123!', 12),
          role: 'PARTNER',
          status: UserStatus.ACTIVE,
          firstName: 'NoLink',
          lastName: 'Partner',
          phone: genTestPhone(),
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      await prisma.partner.create({
        data: {
          userId: nolinkUser.id,
          businessName: 'NoLink Partner',
          status: PartnerStatus.PENDING,
          verifiedAt: null, // Not verified
          // No activation link issued
        },
      });

      // Act: Try to login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: nolinkPartnerEmail,
          password: 'PartnerPass123!',
          clientType: 'web',
        });

      // Assert: Should get generic "awaiting activation" error
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('очаква активиране');
    });

    it('should return "link sent" error when link is expired but unconsumed', async () => {
      // Arrange: Create a partner with an expired but unconsumed link
      const expiredLinkEmail = `expiredlink-${Date.now()}@boomcard.bg`;
      const expiredLinkUser = await prisma.user.create({
        data: {
          email: expiredLinkEmail,
          passwordHash: await bcrypt.hash('PartnerPass123!', 12),
          role: 'PARTNER',
          status: UserStatus.ACTIVE,
          firstName: 'ExpiredLink',
          lastName: 'Partner',
          phone: genTestPhone(),
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      const expiredLinkPartner = await prisma.partner.create({
        data: {
          userId: expiredLinkUser.id,
          businessName: 'ExpiredLink Partner',
          status: PartnerStatus.PENDING,
          verifiedAt: null,
        },
      });

      // Create an expired but unconsumed link
      const pastDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      await prisma.activationLink.create({
        data: {
          partnerId: expiredLinkPartner.id,
          token: 'expired-token-' + Date.now(),
          expiresAt: pastDate,
          reason: 'INITIAL' as ActivationLinkReason,
          createdById: adminUser.id,
        },
      });

      // Act: Try to login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: expiredLinkEmail,
          password: 'PartnerPass123!',
          clientType: 'web',
        });

      // Assert: Should still get "link sent" message (unconsumed link exists, even if expired)
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Активационния линк е изпратен');
    });

    it('should return "awaiting activation" when link was consumed (verifiedAt=null but no unconsumed link)', async () => {
      // This is a rare edge case: partner has verifiedAt=null but all links are consumed
      // In practice, consumeActivationToken sets verifiedAt, so this shouldn't happen
      // But we test the fallback logic
      const consumedLinkEmail = `consumedlink-${Date.now()}@boomcard.bg`;
      const consumedLinkUser = await prisma.user.create({
        data: {
          email: consumedLinkEmail,
          passwordHash: await bcrypt.hash('PartnerPass123!', 12),
          role: 'PARTNER',
          status: UserStatus.ACTIVE,
          firstName: 'ConsumedLink',
          lastName: 'Partner',
          phone: genTestPhone(),
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      const consumedLinkPartner = await prisma.partner.create({
        data: {
          userId: consumedLinkUser.id,
          businessName: 'ConsumedLink Partner',
          status: PartnerStatus.PENDING,
          verifiedAt: null, // Edge case: verifiedAt is null
        },
      });

      // Create a consumed link (verifiedAt=null but link is consumed)
      await prisma.activationLink.create({
        data: {
          partnerId: consumedLinkPartner.id,
          token: 'consumed-token-' + Date.now(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          reason: 'INITIAL' as ActivationLinkReason,
          createdById: adminUser.id,
          consumedAt: new Date(Date.now() - 1000), // Already consumed
        },
      });

      // Act: Try to login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: consumedLinkEmail,
          password: 'PartnerPass123!',
          clientType: 'web',
        });

      // Assert: Should get "awaiting activation" (no UNCONSUMED link)
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('очаква активиране');
    });
  });
});
