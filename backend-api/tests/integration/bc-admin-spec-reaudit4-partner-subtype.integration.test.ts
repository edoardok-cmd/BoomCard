/**
 * BC-ADMIN-SPEC-REAUDIT4-PARTNER-SUBTYPE-LABEL-1 Integration Tests
 *
 * Verifies that the inactiveSubType field in the GET /api/admin/partner-requests
 * endpoint correctly reflects the spec §1.6 / §3.5 application status lifecycle:
 *
 * - NEW / COMMUNICATION / NEGOTIATION: NO account yet → inactiveSubType = null
 * - ONBOARDING: Partner account created in Inactive state → inactiveSubType = ONBOARDING_INACTIVE
 * - APPROVED: Pre-approved, activation link sent → inactiveSubType = ONBOARDING_INACTIVE
 * - ACTIVE: No onboarding sub-type → inactiveSubType = null (or other sub-types like VOLUNTARY_PAUSE)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { PartnerStatus, PartnerRequestStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

interface AdminTestContext {
  adminToken: string;
  adminUser: any;
}

const ctx: AdminTestContext = {
  adminToken: '',
  adminUser: null,
};

beforeAll(async () => {
  // Create a test admin user
  const adminEmail = `admin-subtype-test-${Date.now()}@boomcard.bg`;
  const adminPassword = 'AdminPass123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  ctx.adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      firstName: 'Admin',
      lastName: 'SubtypeTest',
    },
  });

  // Login to get admin token
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: adminEmail, password: adminPassword, clientType: 'web' });

  expect(loginRes.status).toBe(200);
  ctx.adminToken = loginRes.body.data.accessToken;
});

afterAll(async () => {
  // Cleanup
  if (ctx.adminUser) {
    await prisma.user.deleteMany({ where: { id: ctx.adminUser.id } });
  }
  await prisma.$disconnect();
});

describe('BC-ADMIN-SPEC-REAUDIT4: inactiveSubType field correctness', () => {
  describe('§1.6 Application Status Lifecycle — inactiveSubType derivation', () => {
    let newPartner: any;
    let communicationPartner: any;
    let negotiationPartner: any;
    let onboardingPartner: any;
    let approvedPartner: any;

    beforeEach(async () => {
      // Create test partners at each application status stage
      const timestamp = Date.now();

      // NEW application (no partner account yet)
      const newUser = await prisma.user.create({
        data: {
          email: `new-app-${timestamp}@boomcard.bg`,
          passwordHash: await bcrypt.hash('test123', 12),
          role: 'PARTNER',
          status: 'ACTIVE',
          firstName: 'New',
          lastName: 'App',
        },
      });

      newPartner = await prisma.partner.create({
        data: {
          userId: newUser.id,
          businessName: 'New Application Partner',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.NEW,
        },
      });

      // COMMUNICATION application (no partner account yet)
      const commUser = await prisma.user.create({
        data: {
          email: `comm-app-${timestamp}@boomcard.bg`,
          passwordHash: await bcrypt.hash('test123', 12),
          role: 'PARTNER',
          status: 'ACTIVE',
          firstName: 'Comm',
          lastName: 'App',
        },
      });

      communicationPartner = await prisma.partner.create({
        data: {
          userId: commUser.id,
          businessName: 'Communication Application Partner',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.COMMUNICATION,
        },
      });

      // NEGOTIATION application (no partner account yet)
      const negUser = await prisma.user.create({
        data: {
          email: `neg-app-${timestamp}@boomcard.bg`,
          passwordHash: await bcrypt.hash('test123', 12),
          role: 'PARTNER',
          status: 'ACTIVE',
          firstName: 'Neg',
          lastName: 'App',
        },
      });

      negotiationPartner = await prisma.partner.create({
        data: {
          userId: negUser.id,
          businessName: 'Negotiation Application Partner',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.NEGOTIATION,
        },
      });

      // ONBOARDING application (partner account created in Inactive state)
      const onboardingUser = await prisma.user.create({
        data: {
          email: `onboarding-app-${timestamp}@boomcard.bg`,
          passwordHash: await bcrypt.hash('test123', 12),
          role: 'PARTNER',
          status: 'ACTIVE',
          firstName: 'Onboarding',
          lastName: 'App',
        },
      });

      onboardingPartner = await prisma.partner.create({
        data: {
          userId: onboardingUser.id,
          businessName: 'Onboarding Application Partner',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.ONBOARDING,
        },
      });

      // APPROVED application (activation link sent, still read-only)
      const approvedUser = await prisma.user.create({
        data: {
          email: `approved-app-${timestamp}@boomcard.bg`,
          passwordHash: await bcrypt.hash('test123', 12),
          role: 'PARTNER',
          status: 'ACTIVE',
          firstName: 'Approved',
          lastName: 'App',
        },
      });

      approvedPartner = await prisma.partner.create({
        data: {
          userId: approvedUser.id,
          businessName: 'Approved Application Partner',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.APPROVED,
        },
      });
    });

    it('NEW application should have inactiveSubType = null (no account yet)', async () => {
      const res = await request(app)
        .get('/api/admin/partner-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);
      const newAppPartner = res.body.partners.find(
        (p: any) => p.id === newPartner.id
      );

      expect(newAppPartner).toBeDefined();
      expect(newAppPartner.inactiveSubType).toBeNull();
    });

    it('COMMUNICATION application should have inactiveSubType = null (no account yet)', async () => {
      const res = await request(app)
        .get('/api/admin/partner-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);
      const commAppPartner = res.body.partners.find(
        (p: any) => p.id === communicationPartner.id
      );

      expect(commAppPartner).toBeDefined();
      expect(commAppPartner.inactiveSubType).toBeNull();
    });

    it('NEGOTIATION application should have inactiveSubType = null (no account yet)', async () => {
      const res = await request(app)
        .get('/api/admin/partner-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);
      const negAppPartner = res.body.partners.find(
        (p: any) => p.id === negotiationPartner.id
      );

      expect(negAppPartner).toBeDefined();
      expect(negAppPartner.inactiveSubType).toBeNull();
    });

    it('ONBOARDING application should have inactiveSubType = ONBOARDING_INACTIVE', async () => {
      const res = await request(app)
        .get('/api/admin/partner-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);
      const onboardingAppPartner = res.body.partners.find(
        (p: any) => p.id === onboardingPartner.id
      );

      expect(onboardingAppPartner).toBeDefined();
      expect(onboardingAppPartner.inactiveSubType).toBe('ONBOARDING_INACTIVE');
    });

    it('APPROVED application should have inactiveSubType = ONBOARDING_INACTIVE', async () => {
      const res = await request(app)
        .get('/api/admin/partner-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);
      const approvedAppPartner = res.body.partners.find(
        (p: any) => p.id === approvedPartner.id
      );

      expect(approvedAppPartner).toBeDefined();
      expect(approvedAppPartner.inactiveSubType).toBe('ONBOARDING_INACTIVE');
    });

    it('spec §1.6 compliance: Only ONBOARDING/APPROVED show read-only label, earlier stages show null', async () => {
      const res = await request(app)
        .get('/api/admin/partner-requests')
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);

      const partners = {
        new: res.body.partners.find((p: any) => p.id === newPartner.id),
        communication: res.body.partners.find((p: any) => p.id === communicationPartner.id),
        negotiation: res.body.partners.find((p: any) => p.id === negotiationPartner.id),
        onboarding: res.body.partners.find((p: any) => p.id === onboardingPartner.id),
        approved: res.body.partners.find((p: any) => p.id === approvedPartner.id),
      };

      // Verify all partners are found
      expect(partners.new).toBeDefined();
      expect(partners.communication).toBeDefined();
      expect(partners.negotiation).toBeDefined();
      expect(partners.onboarding).toBeDefined();
      expect(partners.approved).toBeDefined();

      // Verify the spec §1.6 rule: no account for NEW/COMMUNICATION/NEGOTIATION
      expect(partners.new.inactiveSubType).toBeNull();
      expect(partners.communication.inactiveSubType).toBeNull();
      expect(partners.negotiation.inactiveSubType).toBeNull();

      // Verify the spec §1.6 rule: read-only access for ONBOARDING/APPROVED
      expect(partners.onboarding.inactiveSubType).toBe('ONBOARDING_INACTIVE');
      expect(partners.approved.inactiveSubType).toBe('ONBOARDING_INACTIVE');
    });
  });

  describe('GET /api/admin/partner-requests/:id — single partner detail', () => {
    let onboardingPartner: any;

    beforeEach(async () => {
      const timestamp = Date.now();
      const user = await prisma.user.create({
        data: {
          email: `onboarding-detail-${timestamp}@boomcard.bg`,
          passwordHash: await bcrypt.hash('test123', 12),
          role: 'PARTNER',
          status: 'ACTIVE',
          firstName: 'Onboarding',
          lastName: 'Detail',
        },
      });

      onboardingPartner = await prisma.partner.create({
        data: {
          userId: user.id,
          businessName: 'Onboarding Detail Partner',
          status: PartnerStatus.PENDING,
          requestStatus: PartnerRequestStatus.ONBOARDING,
        },
      });
    });

    it('inactiveSubType included in single partner detail endpoint', async () => {
      const res = await request(app)
        .get(`/api/admin/partner-requests/${onboardingPartner.id}`)
        .set('Authorization', `Bearer ${ctx.adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.partner.inactiveSubType).toBe('ONBOARDING_INACTIVE');
      expect(res.body.partner.status).toBe(PartnerStatus.PENDING);
      expect(res.body.partner.requestStatus).toBe(PartnerRequestStatus.ONBOARDING);
    });
  });
});
