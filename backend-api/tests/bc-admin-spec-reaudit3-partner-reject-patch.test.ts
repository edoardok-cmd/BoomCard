/**
 * BC-ADMIN-SPEC-REAUDIT3-PARTNER-REJECT-PATCH Integration Test
 *
 * Spec §1.6 (Partner Application Status Lifecycle) & §5.1 (Pipeline Status)
 *
 * Test for BC-ADMIN-SPEC-REAUDIT3-PARTNER-REJECT-PATCH-1:
 * PATCH /:id/status must NOT allow setting requestStatus to REJECTED.
 * All rejections must go through POST /:id/reject which handles the full workflow:
 * 1. Sets partner.status to REJECTED
 * 2. Creates a PartnerStatusChange row
 * 3. Invalidates unconsumed activation links
 * 4. Creates an audit entry
 *
 * This test verifies that:
 * - PATCH /:id/status returns 400 when attempting to set REJECTED
 * - The error message directs users to POST /:id/reject
 * - POST /:id/reject properly completes all four steps
 */

import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { PartnerStatus, PartnerRequestStatus } from '@prisma/client';
import { issueActivationLink } from '../src/services/partnerActivation.service';
import { app } from '../src/server';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
    sendActivationEmail: jest.fn(async () => undefined),
  },
}));

/**
 * Generate a valid JWT token for a user
 */
function generateTestToken(userId: string, role: string): string {
  const jwt = require('jsonwebtoken');
  // Match the token structure expected by the auth middleware
  const payload = {
    id: userId,
    email: `${userId}@test.local`,
    role,
  };
  const secret = process.env.JWT_SECRET || 'test-secret-key';
  return jwt.sign(payload, secret, { expiresIn: '24h' });
}

describe('BC-ADMIN-SPEC-REAUDIT3: PATCH /:id/status rejects REJECTED', () => {
  let adminToken: string;
  let adminUser: any;

  beforeAll(async () => {
    // Create test admin
    adminUser = await prisma.user.create({
      data: {
        email: `admin-reject-patch-${Date.now()}@test.local`,
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash',
      },
    });
    adminToken = generateTestToken(adminUser.id, 'ADMIN');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('PATCH /:id/status rejects requestStatus=REJECTED with 400', async () => {
    // Create a partner in PENDING status
    const partnerUser = await prisma.user.create({
      data: {
        email: `partner-patch-reject-${Date.now()}@test.local`,
        firstName: 'Test',
        lastName: 'Partner',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash',
      },
    });

    const partner = await prisma.partner.create({
      data: {
        businessName: 'Test Business',
        userId: partnerUser.id,
        email: `${partnerUser.id}@partner.test`,
        category: 'restaurants',
        status: 'PENDING',
        requestStatus: PartnerRequestStatus.NEW,
      },
    });

    // Attempt to set REJECTED via PATCH
    const res = await request(app)
      .patch(`/api/admin/partner-requests/${partner.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestStatus: 'REJECTED' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot set requestStatus to REJECTED via PATCH');
    expect(res.body.error).toContain('POST /:id/reject');
  });

  it('PATCH /:id/status rejects requestStatus=OTKAZANA (Bulgarian) with 400', async () => {
    // Create a partner in PENDING status
    const partnerUser = await prisma.user.create({
      data: {
        email: `partner-otkazana-${Date.now()}@test.local`,
        firstName: 'Test',
        lastName: 'Partner',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash',
      },
    });

    const partner = await prisma.partner.create({
      data: {
        businessName: 'Test Business',
        userId: partnerUser.id,
        email: `${partnerUser.id}@partner.test`,
        category: 'restaurants',
        status: 'PENDING',
        requestStatus: PartnerRequestStatus.NEW,
      },
    });

    // Attempt with Bulgarian database-mapped name
    const res = await request(app)
      .patch(`/api/admin/partners/${partner.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestStatus: 'OTKAZANA' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot set requestStatus to REJECTED via PATCH');
  });

  it('POST /:id/reject completes full rejection workflow', async () => {
    // Create a partner in ONBOARDING status
    const partnerUser = await prisma.user.create({
      data: {
        email: `partner-onboarding-reject-${Date.now()}@test.local`,
        firstName: 'Onboarding',
        lastName: 'Partner',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash',
      },
    });

    const partner = await prisma.partner.create({
      data: {
        businessName: 'Onboarding Business',
        userId: partnerUser.id,
        email: `${partnerUser.id}@partner.test`,
        category: 'restaurants',
        status: 'PENDING',
        requestStatus: PartnerRequestStatus.ONBOARDING,
      },
    });

    // Issue an activation link
    const activationLink = await issueActivationLink({
      partnerId: partner.id,
      adminId: adminUser.id,
      reason: 'initial',
    });

    // Call POST /:id/reject
    const rejectRes = await request(app)
      .post(`/api/admin/partner-requests/${partner.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Does not meet onboarding requirements' });

    if (rejectRes.status !== 200) {
      console.log('Reject response:', rejectRes.status, rejectRes.body);
    }
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);
    expect(rejectRes.body.partner.status).toBe(PartnerStatus.REJECTED);

    // Verify partner.status is REJECTED
    const updatedPartner = await prisma.partner.findUnique({
      where: { id: partner.id },
    });
    expect(updatedPartner?.status).toBe(PartnerStatus.REJECTED);
    expect(updatedPartner?.requestStatus).toBe(PartnerRequestStatus.REJECTED);

    // Verify PartnerStatusChange row exists
    const statusChange = await prisma.partnerStatusChange.findFirst({
      where: {
        partnerId: partner.id,
        fromStatus: PartnerStatus.PENDING,
        toStatus: PartnerStatus.REJECTED,
      },
    });
    expect(statusChange).toBeTruthy();
    expect(statusChange?.reason).toContain('Does not meet onboarding requirements');

    // Verify activation link is invalidated
    const invalidatedLink = await prisma.activationLink.findUnique({
      where: { id: activationLink.linkId },
    });
    expect(invalidatedLink?.invalidatedAt).toBeTruthy();
    expect(invalidatedLink?.consumedAt).toBeNull();

    // Verify audit entry exists
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: 'partner.reject',
        objectId: partner.id,
        objectType: 'Partner',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntry).toBeTruthy();
    expect(auditEntry?.before).toContain(PartnerStatus.PENDING);
    expect(auditEntry?.after).toContain(PartnerStatus.REJECTED);
  });

  it('PATCH /:id/status still allows valid transitions', async () => {
    // Create a partner in NEW status
    const partnerUser = await prisma.user.create({
      data: {
        email: `partner-valid-transitions-${Date.now()}@test.local`,
        firstName: 'Valid',
        lastName: 'Partner',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash',
      },
    });

    const partner = await prisma.partner.create({
      data: {
        businessName: 'Valid Business',
        userId: partnerUser.id,
        email: `${partnerUser.id}@partner.test`,
        category: 'restaurants',
        status: 'PENDING',
        requestStatus: PartnerRequestStatus.NEW,
      },
    });

    // NEW → COMMUNICATION
    let res = await request(app)
      .patch(`/api/admin/partners/${partner.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestStatus: 'COMMUNICATION' });
    expect(res.status).toBe(200);
    expect(res.body.partner.requestStatus).toBe(PartnerRequestStatus.COMMUNICATION);

    // COMMUNICATION → NEGOTIATION
    res = await request(app)
      .patch(`/api/admin/partners/${partner.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestStatus: 'NEGOTIATION' });
    expect(res.status).toBe(200);
    expect(res.body.partner.requestStatus).toBe(PartnerRequestStatus.NEGOTIATION);

    // NEGOTIATION → ONBOARDING
    res = await request(app)
      .patch(`/api/admin/partners/${partner.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestStatus: 'ONBOARDING' });
    expect(res.status).toBe(200);
    expect(res.body.partner.requestStatus).toBe(PartnerRequestStatus.ONBOARDING);

    // ONBOARDING → REJECTED (should fail)
    res = await request(app)
      .patch(`/api/admin/partners/${partner.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestStatus: 'REJECTED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot set requestStatus to REJECTED via PATCH');
  });
});
