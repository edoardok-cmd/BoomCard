/**
 * BC-QA-045-FOLLOWUP-2 (Item 1) — Integration test
 *
 * Bug: the ONBOARDING_INACTIVE statusReason marker set by PATCH
 * /:id/status when a partner enters ONBOARDING (adminPartners.routes.ts)
 * was left in place by POST /:id/approve, which stamps
 * onboardingCompletedAt but never cleared statusReason. That left the
 * marker stale for the whole PENDING window between approval and
 * activation-link consumption: if the partner later went INACTIVE (e.g.
 * post-activation, via /:id/partner-status), derivePartnerInactiveSubType
 * (partner.service.ts) would misclassify them as ONBOARDING_INACTIVE
 * instead of GENERIC_INACTIVE, because it was never cleared by approval.
 *
 * Fix: POST /:id/approve now clears statusReason to null.
 *
 * This test exercises the real HTTP flow: PATCH .../status → ONBOARDING
 * (stamps the marker) → POST .../approve (must clear it) → simulate
 * activation-link consumption (status PENDING → ACTIVE, as
 * activationLink.service.ts:consume would do) → PATCH
 * .../partner-status → INACTIVE (post-onboarding admin transition) →
 * assert derivePartnerInactiveSubType classifies the partner as
 * GENERIC_INACTIVE, not ONBOARDING_INACTIVE.
 */

import request from 'supertest';
import { createTestApp } from '../setup';
import { prisma } from '../../src/lib/prisma';
import { PartnerRequestStatus, PartnerStatus } from '@prisma/client';
import { derivePartnerInactiveSubType } from '../../src/services/partner.service';
import { genTestPhone } from '../helpers/test-utils';

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
    sendActivationEmail: jest.fn(async () => undefined),
    sendPartnerStatusChangeEmail: jest.fn(async () => undefined),
  },
}));

function generateTestToken(userId: string, role: string): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '24h',
  });
}

describe('BC-QA-045-FOLLOWUP-2 Item 1 — approve clears ONBOARDING_INACTIVE marker', () => {
  let app: any;
  let superAdminToken: string;
  let superAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const superAdmin = await prisma.user.create({
      data: {
        email: `sa-onb-inactive-marker-${Date.now()}@test.local`,
        firstName: 'SA',
        lastName: 'OnbInactiveMarker',
        phone: genTestPhone(),
        passwordHash: 'hashed_password',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    superAdminId = superAdmin.id;
    superAdminToken = generateTestToken(superAdmin.id, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    if (superAdminId) {
      await prisma.userAdminRole.deleteMany({ where: { userId: superAdminId } });
      await prisma.partnerRequestNote.deleteMany({ where: { authorId: superAdminId } });
      await prisma.partnerStatusChange.deleteMany({ where: { changedById: superAdminId } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: superAdminId } });
      await prisma.user.deleteMany({ where: { id: superAdminId } });
    }
    await prisma.$disconnect();
  });

  it('clears statusReason on approve, so a subsequent INACTIVE derives GENERIC_INACTIVE (not stale ONBOARDING_INACTIVE)', async () => {
    const user = await prisma.user.create({
      data: {
        email: `partner-onb-inactive-marker-${Date.now()}@test.local`,
        firstName: 'Onb',
        lastName: 'InactiveMarker',
        phone: genTestPhone(),
        passwordHash: 'hashed_password',
        role: 'PARTNER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    const partner = await prisma.partner.create({
      data: {
        businessName: 'Onboarding Inactive Marker Test Partner',
        userId: user.id,
        email: `${user.id}@partner.test`,
        status: 'PENDING',
        category: 'Restaurant',
        requestStatus: PartnerRequestStatus.NEW,
      },
    });

    // Advance NEW → COMMUNICATION → NEGOTIATION → ONBOARDING via PATCH
    // /:id/status (VALID_PIPELINE_TRANSITIONS does not allow NEW → ONBOARDING
    // directly). The final hop stamps the ONBOARDING_INACTIVE marker on
    // statusReason.
    for (const requestStatus of ['COMMUNICATION', 'NEGOTIATION', 'ONBOARDING']) {
      const stepRes = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ requestStatus });
      expect(stepRes.status).toBe(200);
    }

    const afterOnboarding = await prisma.partner.findUnique({ where: { id: partner.id } });
    expect(afterOnboarding?.statusReason).toBe('ONBOARDING_INACTIVE');
    // Sanity: while PENDING + ONBOARDING, the derived sub-type is (correctly)
    // ONBOARDING_INACTIVE — the bug is only about what happens AFTER approval.
    expect(
      derivePartnerInactiveSubType({
        status: afterOnboarding!.status,
        statusReason: afterOnboarding!.statusReason,
        requestStatus: afterOnboarding!.requestStatus,
      }),
    ).toBe('ONBOARDING_INACTIVE');

    // Approve — must clear the marker.
    const approveRes = await request(app)
      .post(`/api/admin/partner-requests/${partner.id}/approve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.partner.requestStatus).toBe('APPROVED');

    const afterApprove = await prisma.partner.findUnique({ where: { id: partner.id } });
    expect(afterApprove?.statusReason).toBeNull();
    expect(afterApprove?.status).toBe('PENDING'); // approve does not flip status itself

    // Simulate activation-link consumption (activationLink.service.ts:consume
    // is what normally flips PENDING → ACTIVE; not exercised here since this
    // test is scoped to the statusReason-clearing fix, not the activation
    // flow).
    await prisma.partner.update({
      where: { id: partner.id },
      data: { status: PartnerStatus.ACTIVE, verifiedAt: new Date() },
    });

    // Admin later moves the now-active partner to INACTIVE.
    const inactiveRes = await request(app)
      .patch(`/api/admin/partner-requests/${partner.id}/partner-status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'INACTIVE', reason: 'temporary hold' });
    expect(inactiveRes.status).toBe(200);

    const afterInactive = await prisma.partner.findUnique({ where: { id: partner.id } });
    expect(afterInactive?.status).toBe('INACTIVE');
    // The bug: without the fix, statusReason would still read
    // 'ONBOARDING_INACTIVE' (setPartnerStatus only clears statusReason on
    // transitions TO ACTIVE/ARCHIVED, and going PENDING→ACTIVE here was done
    // directly, not through setPartnerStatus, so a stale marker would
    // survive untouched into this INACTIVE row).
    expect(afterInactive?.statusReason).not.toBe('ONBOARDING_INACTIVE');

    expect(
      derivePartnerInactiveSubType({
        status: afterInactive!.status,
        statusReason: afterInactive!.statusReason,
        requestStatus: afterInactive!.requestStatus,
      }),
    ).toBe('GENERIC_INACTIVE');
  });
});
