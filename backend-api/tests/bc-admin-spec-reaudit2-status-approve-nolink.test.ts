/**
 * Integration test: BC-ADMIN-SPEC-REAUDIT2-STATUS-APPROVE-NOLINK-2
 *
 * Spec violation: PATCH /:id/status can move ONBOARDING → APPROVED without generating
 * the spec-mandated activation link (§1.6, §3.5 step 3).
 *
 * Fix: Remove APPROVED from the ONBOARDING transition list in VALID_PIPELINE_TRANSITIONS
 * so approval can only happen via the link-issuing POST /:id/approve endpoint.
 *
 * Test coverage:
 * 1. Advance a partner to ONBOARDING via PATCH /:id/status
 * 2. Attempt PATCH /:id/status { requestStatus: APPROVED }
 * 3. Assert the transition is now blocked with status 400
 * 4. Assert the error message indicates the transition is invalid
 * 5. Verify that POST /:id/approve still works (can issue the activation link)
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { PartnerRequestStatus } from '@prisma/client';
import { genTestPhone } from './helpers/test-utils';

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
  // authenticate() (src/middleware/auth.middleware.ts) does `req.user = decoded`
  // verbatim and every route reads `req.user!.id` — a payload keyed `userId`
  // leaves req.user.id undefined. That's harmless for routes whose only use of
  // the actor id is a detached (fire-and-forget) writeAudit() call, but it 400s
  // any route that uses it SYNCHRONOUSLY in a required DB write (e.g. POST
  // /:id/reject's authorId) with a confusing Prisma "relation is missing" error
  // (BC-QA-042).
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '24h',
  });
}

describe('BC-ADMIN-SPEC-REAUDIT2-STATUS-APPROVE-NOLINK-2', () => {
  let app: any;
  let superAdminToken: string;
  let superAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create a SUPER_ADMIN for test operations
    const superAdmin = await prisma.user.create({
      data: {
        email: `sa-status-approve-${Date.now()}@test.local`,
        firstName: 'SA',
        lastName: 'StatusApprove',
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
    // createTestApp() (tests/setup.ts) returns the plain Express app, not a
    // listening server — supertest's persistent-server wrapper owns the
    // actual http.Server and closes it at the file boundary. app.close is
    // not a function; calling it here was a stale test-infra bug (BC-QA-042).
    //
    // BC-QA-042 task-r1 (HIGH): this file's beforeAll creates an ACTIVE
    // role:'SUPER_ADMIN' fixture (sa-status-approve-*) but this afterAll
    // never deleted it — the exact same class of bug fixed in
    // sa-guard-races.test.ts's afterAll. Left behind, that stray ACTIVE
    // SUPER_ADMIN silently supplies an extra "remaining active" count to
    // any later file in the same jest process that asserts a "sole ACTIVE
    // admin" guard scenario (bc-admin-reaudit2-lastsa-revoke-guard.test.ts).
    if (superAdminId) {
      await prisma.userAdminRole.deleteMany({ where: { userId: superAdminId } });
      // This fixture SUPER_ADMIN exercises POST /:id/reject in one of the
      // tests below, which creates a PartnerRequestNote row with a
      // non-nullable, non-cascading `authorId` FK — deleting the User
      // straight away 500s the whole file's afterAll with a
      // ForeignKeyConstraintViolation (PartnerRequestNote_authorId_fkey),
      // which aborts jest's suite teardown and, observed in the full
      // touched-file batch, can leave the fixture behind anyway. Also clear
      // the (nullable, but still real FK) AuditLog/PartnerStatusChange
      // actor references this admin's actions wrote.
      await prisma.partnerRequestNote.deleteMany({ where: { authorId: superAdminId } });
      await prisma.partnerStatusChange.deleteMany({ where: { changedById: superAdminId } });
      await prisma.auditLog.deleteMany({ where: { actorUserId: superAdminId } });
      await prisma.user.deleteMany({ where: { id: superAdminId } });
    }
    await prisma.$disconnect();
  });

  describe('PATCH /:id/status cannot transition ONBOARDING → APPROVED', () => {
    it('should allow advancing a new partner to ONBOARDING via PATCH /status', async () => {
      // Create a partner user
      const user = await prisma.user.create({
        data: {
          email: `partner-status-approve-${Date.now()}@test.local`,
          firstName: 'Status',
          lastName: 'Approve',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Create a partner in PENDING status
      const partner = await prisma.partner.create({
        data: {
          businessName: 'Status Approve Test Partner',
          userId: user.id,
          email: `${user.id}@partner.test`,
          status: 'PENDING',
          category: 'Restaurant',
          requestStatus: PartnerRequestStatus.NEW,
        },
      });

      // Advance from NEW to COMMUNICATION
      let res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ requestStatus: 'COMMUNICATION' });
      expect(res.status).toBe(200);
      expect(res.body.partner.requestStatus).toBe('COMMUNICATION');

      // Advance from COMMUNICATION to NEGOTIATION
      res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ requestStatus: 'NEGOTIATION' });
      expect(res.status).toBe(200);
      expect(res.body.partner.requestStatus).toBe('NEGOTIATION');

      // Advance from NEGOTIATION to ONBOARDING
      res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ requestStatus: 'ONBOARDING' });
      expect(res.status).toBe(200);
      expect(res.body.partner.requestStatus).toBe('ONBOARDING');
    });

    it('should block PATCH /status from transitioning ONBOARDING → APPROVED', async () => {
      // Create a partner user
      const user = await prisma.user.create({
        data: {
          email: `partner-status-approve-block-${Date.now()}@test.local`,
          firstName: 'StatusBlock',
          lastName: 'Test',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Create a partner already in ONBOARDING status
      const partner = await prisma.partner.create({
        data: {
          businessName: 'Status Block Test Partner',
          userId: user.id,
          email: `${user.id}@partner.test`,
          status: 'PENDING',
          category: 'Restaurant',
          requestStatus: PartnerRequestStatus.ONBOARDING,
        },
      });

      // Attempt to transition from ONBOARDING to APPROVED via PATCH /status
      const res = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ requestStatus: 'APPROVED' });

      // Should get a 400 error indicating invalid transition
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot transition');
      expect(res.body.error).toContain('ONBOARDING');
      expect(res.body.error).toContain('APPROVED');
      expect(res.body.allowedTransitions).toBeDefined();
      expect(res.body.allowedTransitions).not.toContain('APPROVED');
    });

    it('should allow POST /approve to transition ONBOARDING → APPROVED (link-issuing)', async () => {
      // Create a partner user
      const user = await prisma.user.create({
        data: {
          email: `partner-approve-link-${Date.now()}@test.local`,
          firstName: 'Approve',
          lastName: 'Link',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Create a partner in ONBOARDING status
      const partner = await prisma.partner.create({
        data: {
          businessName: 'Approve Link Test Partner',
          userId: user.id,
          email: `${user.id}@partner.test`,
          status: 'PENDING',
          category: 'Restaurant',
          requestStatus: PartnerRequestStatus.ONBOARDING,
        },
      });

      // Approve via POST /:id/approve — should succeed and issue link
      const res = await request(app)
        .post(`/api/admin/partner-requests/${partner.id}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.partner.requestStatus).toBe('APPROVED');
      expect(res.body.activationLink).toBeDefined();
      expect(res.body.activationLink.issued).toBe(true);
      expect(res.body.activationLink.expiresAt).toBeDefined();

      // Verify that an activation link was created in the database
      const links = await prisma.activationLink.findMany({
        where: { partnerId: partner.id },
      });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].consumedAt).toBeNull(); // Not yet consumed
    });

    it('should still allow ONBOARDING → REJECTED transition via PATCH /status', async () => {
      // Create a partner user
      const user = await prisma.user.create({
        data: {
          email: `partner-onboarding-reject-${Date.now()}@test.local`,
          firstName: 'Onboarding',
          lastName: 'Reject',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'PARTNER',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Create a partner in ONBOARDING status
      const partner = await prisma.partner.create({
        data: {
          businessName: 'Onboarding Reject Test Partner',
          userId: user.id,
          email: `${user.id}@partner.test`,
          status: 'PENDING',
          category: 'Restaurant',
          requestStatus: PartnerRequestStatus.ONBOARDING,
        },
      });

      // PATCH /:id/status explicitly 400s requestStatus:'REJECTED' and
      // directs callers to POST /:id/reject instead ("it handles the full
      // rejection workflow including status flip, audit trail, and link
      // invalidation") — the test's premise of rejecting via PATCH is stale
      // relative to that now-dedicated endpoint (BC-QA-042). Assert the
      // documented redirect, then verify the real reject path.
      const patchRes = await request(app)
        .patch(`/api/admin/partner-requests/${partner.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ requestStatus: 'REJECTED' });
      expect(patchRes.status).toBe(400);
      expect(patchRes.body.error).toContain('POST /:id/reject');

      const res = await request(app)
        .post(`/api/admin/partner-requests/${partner.id}/reject`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Does not meet onboarding criteria' });

      expect(res.status).toBe(200);
      expect(res.body.partner.requestStatus).toBe('REJECTED');
    });
  });
});
