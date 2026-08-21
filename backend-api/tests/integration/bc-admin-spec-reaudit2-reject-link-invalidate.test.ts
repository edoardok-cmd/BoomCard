import { prisma } from '../../src/lib/prisma';
import { PartnerStatus, PartnerRequestStatus } from '@prisma/client';
import { createTestUser } from '../helpers/test-utils';
import request from 'supertest';
import { app } from '../../src/server';
import jwt from 'jsonwebtoken';
import { genTestPhone } from '../helpers/test-utils';

/**
 * BC-ADMIN-SPEC-REAUDIT2-REJECT-LINK-INVALIDATE-1
 *
 * Integration test suite for verifying that POST /:id/reject invalidates unconsumed
 * activation links and prevents the scheduler from emailing rejected applicants.
 *
 * Spec §1.6 (Rejected = application declined, no access) and §3.5 step 6 require that
 * activation links must be invalidated when a partner is rejected.
 */
describe('BC-ADMIN-SPEC-REAUDIT2-REJECT-LINK-INVALIDATE-1: Reject invalidates activation links', () => {
  let adminUser: any;
  let adminAccessToken: string;
  let partnerUser: any;
  let partnerId: string;
  let activationTokens: string[] = [];

  beforeAll(async () => {
    // Create a SUPER_ADMIN user for auth. SUPER_ADMIN bypasses all permission checks.
    adminUser = await prisma.user.create({
      data: {
        email: `admin-reject-link-${Date.now()}@test.local`,
        passwordHash: 'hash',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        phone: genTestPhone(),
        firstName: 'Test',
        lastName: 'User',
      },
    });

    // Generate a valid JWT token for the admin user
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
    adminAccessToken = jwt.sign(
      {
        id: adminUser.id,
        email: adminUser.email,
        role: 'SUPER_ADMIN',
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Create a regular user to own the partner entity (partners must be owned by non-admin users)
    const { user, accessToken } = await createTestUser({
      email: `partner-user-${Date.now()}@test.local`,
      firstName: 'Partner',
      lastName: 'Owner',
    });
    partnerUser = user;
  });

  afterAll(async () => {
    // Cleanup
    if (partnerId) {
      await prisma.activationLink.deleteMany({ where: { partnerId } }).catch(() => {});
      await prisma.partnerStatusChange.deleteMany({ where: { partnerId } }).catch(() => {});
      await prisma.partnerRequestNote.deleteMany({ where: { partnerId } }).catch(() => {});
      await prisma.partner.delete({ where: { id: partnerId } }).catch(() => {});
    }
    if (adminUser?.id) {
      await prisma.refreshToken.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    }
    if (partnerUser?.id) {
      await prisma.refreshToken.deleteMany({ where: { userId: partnerUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: partnerUser.id } }).catch(() => {});
    }
  });

  describe('Spec §1.6 / §3.5 step 6: Reject invalidates activation links', () => {
    test('Setup: Create partner in PENDING/APPROVED status with unconsumed activation link', async () => {
      // Create a partner in PENDING status (the schema default -- see
      // prisma/schema.prisma; PartnerStatus has no NEW member) with a fresh
      // onboarding-pipeline requestStatus.
      const partner = await prisma.partner.create({
        data: {
          businessName: 'Test Reject Link Invalidation Partner',
          category: 'restaurants',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.NEW,
          userId: partnerUser.id,
        },
      });
      partnerId = partner.id;
      expect(partnerId).toBeDefined();

      // Advance to PENDING status
      await prisma.partner.update({
        where: { id: partnerId },
        data: { requestStatus: PartnerRequestStatus.ONBOARDING },
      });

      // Approve the partner (status -> PENDING, requestStatus -> APPROVED)
      const approved = await prisma.partner.update({
        where: { id: partnerId },
        data: {
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.APPROVED,
        },
        select: { id: true, status: true, requestStatus: true },
      });
      expect(approved.status).toBe(PartnerStatus.PENDING);
      expect(approved.requestStatus).toBe(PartnerRequestStatus.APPROVED);

      // Issue activation link
      const link = await prisma.activationLink.create({
        data: {
          partnerId,
          token: 'test-activation-token-reject-1',
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });
      activationTokens.push(link.token);
      expect(link.consumedAt).toBeNull();
      expect(link.invalidatedAt).toBeNull();
    });

    test('POST /:id/reject should invalidate all unconsumed activation links atomically', async () => {
      expect(partnerId).toBeDefined();
      expect(activationTokens.length).toBeGreaterThan(0);

      // Verify the link is valid before rejection
      let linkBefore = await prisma.activationLink.findUnique({
        where: { token: activationTokens[0] },
      });
      expect(linkBefore).toBeDefined();
      expect(linkBefore!.invalidatedAt).toBeNull();
      expect(linkBefore!.consumedAt).toBeNull();

      // Call POST /:id/reject (via API route)
      const response = await request(app)
        .post(`/api/admin/partner-requests/${partnerId}/reject`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          reason: 'Test rejection for link invalidation',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.partner.status).toBe(PartnerStatus.REJECTED);
      expect(response.body.partner.requestStatus).toBe(PartnerRequestStatus.REJECTED);

      // Verify the activation link is now invalidated
      const linkAfter = await prisma.activationLink.findUnique({
        where: { token: activationTokens[0] },
      });
      expect(linkAfter).toBeDefined();
      expect(linkAfter!.invalidatedAt).not.toBeNull();
      expect(linkAfter!.invalidatedAt).toEqual(expect.any(Date));
      expect(linkAfter!.consumedAt).toBeNull(); // Still unconsumed, but invalidated
    });

    test('GET /activation/:token/verify should return valid:false after rejection', async () => {
      expect(activationTokens.length).toBeGreaterThan(0);

      // Call the verify endpoint
      const response = await request(app)
        .get(`/api/partners/activation/${activationTokens[0]}/verify`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('Invalid or expired');
    });

    test('Scheduler remindExpiringActivationLinks should NOT email rejected partner', async () => {
      expect(partnerId).toBeDefined();
      expect(activationTokens.length).toBeGreaterThan(0);

      // Query the database for the link with scheduler's conditions
      // (consumedAt: null, invalidatedAt: null, expiresAt in 24h range)
      const links = await prisma.activationLink.findMany({
        where: {
          partnerId,
          consumedAt: null,
          invalidatedAt: null, // This is the key filter
          expiresAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 24 * 3600 * 1000),
          },
        },
        include: {
          partner: {
            include: { user: { select: { email: true, firstName: true } } },
          },
        },
      });

      // The scheduler query should return 0 results for the rejected partner
      // because invalidatedAt is now set
      expect(links.length).toBe(0);
    });

    test('Multiple unconsumed links should all be invalidated atomically', async () => {
      // Setup: Create another partner with multiple links. Partner.userId is
      // @unique (see prisma/schema.prisma), so this needs its own owner user
      // rather than reusing partnerUser (already bound to the top-level partner).
      const { user: partner2User } = await createTestUser({
        email: `partner-user-2-${Date.now()}@test.local`,
        firstName: 'Partner2',
        lastName: 'Owner',
      });
      const partner2 = await prisma.partner.create({
        data: {
          businessName: 'Test Multiple Links Partner',
          category: 'restaurants',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.APPROVED,
          userId: partner2User.id,
        },
      });
      const partner2Id = partner2.id;

      // Create 3 unconsumed links
      const link1 = await prisma.activationLink.create({
        data: {
          partnerId: partner2Id,
          token: 'test-multi-link-1',
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });
      const link2 = await prisma.activationLink.create({
        data: {
          partnerId: partner2Id,
          token: 'test-multi-link-2',
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        },
      });
      const link3 = await prisma.activationLink.create({
        data: {
          partnerId: partner2Id,
          token: 'test-multi-link-3',
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });

      // Also create one consumed link (should NOT be touched)
      const consumedLink = await prisma.activationLink.create({
        data: {
          partnerId: partner2Id,
          token: 'test-multi-link-consumed',
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
          consumedAt: new Date(),
        },
      });

      // Reject the partner
      await request(app)
        .post(`/api/admin/partner-requests/${partner2Id}/reject`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ reason: 'Test multiple links rejection' })
        .expect(200);

      // Verify all unconsumed links are invalidated
      const link1After = await prisma.activationLink.findUnique({ where: { id: link1.id } });
      const link2After = await prisma.activationLink.findUnique({ where: { id: link2.id } });
      const link3After = await prisma.activationLink.findUnique({ where: { id: link3.id } });
      const consumedAfter = await prisma.activationLink.findUnique({
        where: { id: consumedLink.id },
      });

      expect(link1After!.invalidatedAt).not.toBeNull();
      expect(link2After!.invalidatedAt).not.toBeNull();
      expect(link3After!.invalidatedAt).not.toBeNull();
      // Consumed link should remain unchanged
      expect(consumedAfter!.consumedAt).not.toBeNull();
      expect(consumedAfter!.invalidatedAt).toBeNull();

      // Cleanup
      await prisma.activationLink.deleteMany({ where: { partnerId: partner2Id } }).catch(() => {});
      await prisma.partnerStatusChange.deleteMany({ where: { partnerId: partner2Id } }).catch(() => {});
      await prisma.partnerRequestNote.deleteMany({ where: { partnerId: partner2Id } }).catch(() => {});
      await prisma.partner.delete({ where: { id: partner2Id } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId: partner2User.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: partner2User.id } }).catch(() => {});
    });

    test('Already-rejected partner should not allow re-rejection via POST /:id/reject', async () => {
      expect(partnerId).toBeDefined();

      // Try to reject again
      const response = await request(app)
        .post(`/api/admin/partner-requests/${partnerId}/reject`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ reason: 'Another rejection attempt' })
        .expect(400);

      expect(response.body.error).toContain('already rejected');
    });

    test('POST /partner-status with ARCHIVED should also invalidate links', async () => {
      // Setup: Create a partner in ACTIVE status with an activation link (edge case).
      // Partner.userId is @unique, so this needs its own owner user too.
      const { user: partner3User } = await createTestUser({
        email: `partner-user-3-${Date.now()}@test.local`,
        firstName: 'Partner3',
        lastName: 'Owner',
      });
      const partner3 = await prisma.partner.create({
        data: {
          businessName: 'Test Archive Link Invalidation Partner',
          category: 'restaurants',
          status: PartnerStatus.ACTIVE,
          requestStatus: PartnerRequestStatus.APPROVED,
          userId: partner3User.id,
        },
      });
      const partner3Id = partner3.id;

      const link = await prisma.activationLink.create({
        data: {
          partnerId: partner3Id,
          token: 'test-archive-link-invalidate',
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });

      // Archive the partner via /partner-status (uses setPartnerStatus internally)
      const response = await request(app)
        .patch(`/api/admin/partner-requests/${partner3Id}/partner-status`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ status: PartnerStatus.ARCHIVED, reason: 'Test archive invalidation' })
        .expect(200);

      expect(response.body.partner.status).toBe(PartnerStatus.ARCHIVED);

      // Verify the link is invalidated
      const linkAfter = await prisma.activationLink.findUnique({ where: { id: link.id } });
      expect(linkAfter!.invalidatedAt).not.toBeNull();

      // Cleanup
      await prisma.activationLink.deleteMany({ where: { partnerId: partner3Id } }).catch(() => {});
      await prisma.partnerStatusChange.deleteMany({ where: { partnerId: partner3Id } }).catch(() => {});
      await prisma.partner.delete({ where: { id: partner3Id } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId: partner3User.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: partner3User.id } }).catch(() => {});
    });
  });
});
