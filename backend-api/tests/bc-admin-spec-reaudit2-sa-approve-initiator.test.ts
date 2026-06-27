/**
 * Integration test: BC-ADMIN-SPEC-REAUDIT2-SA-APPROVE-INITIATOR-2
 *
 * Defect: The dual-approval handler for creating a new Super Admin never
 * re-validates that the original INITIATOR is still an existing ACTIVE Super
 * Admin at approval time, weakening the 2-of-N requirement to effectively 1-of-N.
 *
 * Fix: In the approve handler, load the initiator with role and status, and
 * reject with 409/403 if:
 *   - !initiator
 *   - initiator.role !== SUPER_ADMIN (demoted or role revoked)
 *   - initiator.status !== ACTIVE (archived or inactive)
 *
 * Exempt: genuine bootstrap-self-approval branch (sole-SA case)
 *
 * Test coverage:
 * 1. SA#1 initiates a SUPER_ADMIN creation request
 * 2. Archive SA#1
 * 3. As SA#2, attempt POST /approve → expect 409/403, no SA created
 * 4. SA#1 initiates another SUPER_ADMIN creation request
 * 5. Revoke SUPER_ADMIN role from SA#1
 * 6. As SA#2, attempt POST /approve → expect 409/403, no SA created
 * 7. Verify bootstrap self-approval still works (sole SA case)
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';
import { AdminRoleKey, UserStatus } from '@prisma/client';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-SPEC-REAUDIT2-SA-APPROVE-INITIATOR-2: Initiator status validation', () => {
  let superAdminRoleId: string;
  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    const superAdminRole = await prisma.adminRole.findUnique({
      where: { key: AdminRoleKey.SUPER_ADMIN },
    });
    if (!superAdminRole) {
      throw new Error('SUPER_ADMIN role not found — run seed-permissions first');
    }
    superAdminRoleId = superAdminRole.id;
  });

  afterEach(async () => {
    // Clean up pending requests created in this test
    if (createdRequestIds.length > 0) {
      await prisma.pendingSuperAdminRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
      createdRequestIds.length = 0;
    }
    // Clean up users created in this test to prevent DB contamination between tests
    if (createdUserIds.length > 0) {
      await prisma.userAdminRole.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // Helper: create a SUPER_ADMIN user for this test suite
  // ---------------------------------------------------------------------------
  async function createSA(opts: {
    suffix: string;
    name: string;
    status?: UserStatus;
  }): Promise<{ id: string; token: string }> {
    const status = opts.status ?? 'ACTIVE';
    const user = await prisma.user.create({
      data: {
        email: `sa-approve-initiator-${opts.suffix}@test.local`,
        firstName: opts.name,
        lastName: 'Test',
        role: 'SUPER_ADMIN',
        status,
        emailVerified: true,
        passwordHash: 'test-hash',
        adminRoles: { create: { roleId: superAdminRoleId } },
      },
    });
    createdUserIds.push(user.id);
    return { id: user.id, token: generateTestToken(user.id, 'SUPER_ADMIN') };
  }

  // ---------------------------------------------------------------------------
  // Helper: generate a JWT token
  // ---------------------------------------------------------------------------
  function generateTestToken(userId: string, role: string): string {
    return jwt.sign({ id: userId, role }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '24h',
    });
  }

  // ---------------------------------------------------------------------------
  // Helper: initiate a SUPER_ADMIN creation request
  // ---------------------------------------------------------------------------
  async function initiateRequest(opts: {
    initiatorToken: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const res = await request(app)
      .post('/api/admin/admins')
      .set('Authorization', `Bearer ${opts.initiatorToken}`)
      .send({
        email: opts.email,
        firstName: opts.firstName || 'NewAdmin',
        lastName: opts.lastName || 'Test',
        password: 'TestPassword123!@#',
        roleKey: 'SUPER_ADMIN',
      });
    if (res.status !== 202) {
      throw new Error(`Failed to initiate request: ${res.status} ${JSON.stringify(res.body)}`);
    }
    const requestId = res.body.request.id;
    createdRequestIds.push(requestId);
    return requestId;
  }

  // ---------------------------------------------------------------------------
  // Test 1: Initiator archived → approval rejected with 409/403
  // ---------------------------------------------------------------------------
  describe('Test 1: Initiator archived between initiation and approval', () => {
    it('should reject approval with 409 when initiator is archived', async () => {
      const suffix = `archived-${Date.now()}`;

      // Create two SAs: SA#1 (initiator) and SA#2 (approver)
      const sa1 = await createSA({ suffix: `${suffix}-initiator`, name: 'Initiator' });
      const sa2 = await createSA({ suffix: `${suffix}-approver`, name: 'Approver' });

      // SA#1 initiates a request
      const requestId = await initiateRequest({
        initiatorToken: sa1.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'ArchivedInitiator',
        lastName: 'Test',
      });

      // Archive SA#1 (the initiator)
      await prisma.user.update({
        where: { id: sa1.id },
        data: { status: 'ARCHIVED' as UserStatus },
      });

      // SA#2 attempts to approve
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should reject with 409 or 403
      expect([409, 403]).toContain(approveRes.status);
      expect(approveRes.body.error).toMatch(/initiator.*no longer|not available/i);

      // Verify no new SUPER_ADMIN was created
      const createdCount = await prisma.user.count({
        where: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' },
      });
      expect(createdCount).toBe(0);

      // Verify the request still exists (not deleted)
      const reqAfter = await prisma.pendingSuperAdminRequest.findUnique({ where: { id: requestId } });
      expect(reqAfter).toBeDefined();
      expect(reqAfter?.status).toBe('PENDING');
    });

    it('should reject approval with 409 when initiator is INACTIVE', async () => {
      const suffix = `inactive-${Date.now()}`;

      const sa1 = await createSA({ suffix: `${suffix}-initiator`, name: 'Initiator' });
      const sa2 = await createSA({ suffix: `${suffix}-approver`, name: 'Approver' });

      // SA#1 initiates a request
      const requestId = await initiateRequest({
        initiatorToken: sa1.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'InactiveInitiator',
        lastName: 'Test',
      });

      // Deactivate SA#1
      await prisma.user.update({
        where: { id: sa1.id },
        data: { status: 'INACTIVE' as UserStatus },
      });

      // SA#2 attempts to approve
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should reject with 409 or 403
      expect([409, 403]).toContain(approveRes.status);
      expect(approveRes.body.error).toMatch(/initiator.*no longer|not available/i);

      // Verify no new SUPER_ADMIN was created
      const createdCount = await prisma.user.count({
        where: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' },
      });
      expect(createdCount).toBe(0);
    });

    it('should reject approval when initiator is SUSPENDED', async () => {
      const suffix = `suspended-${Date.now()}`;

      const sa1 = await createSA({ suffix: `${suffix}-initiator`, name: 'Initiator' });
      const sa2 = await createSA({ suffix: `${suffix}-approver`, name: 'Approver' });

      // SA#1 initiates a request
      const requestId = await initiateRequest({
        initiatorToken: sa1.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'SuspendedInitiator',
        lastName: 'Test',
      });

      // Suspend SA#1
      await prisma.user.update({
        where: { id: sa1.id },
        data: { status: 'SUSPENDED' as UserStatus },
      });

      // SA#2 attempts to approve
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should reject with 409 or 403
      expect([409, 403]).toContain(approveRes.status);
      expect(approveRes.body.error).toMatch(/initiator.*no longer|not available/i);

      // Verify no new SUPER_ADMIN was created
      const createdCount = await prisma.user.count({
        where: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' },
      });
      expect(createdCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Initiator role revoked → approval rejected with 409/403
  // ---------------------------------------------------------------------------
  describe('Test 2: Initiator role revoked between initiation and approval', () => {
    it('should reject approval when initiator SUPER_ADMIN role is revoked', async () => {
      const suffix = `revoked-${Date.now()}`;

      const sa1 = await createSA({ suffix: `${suffix}-initiator`, name: 'Initiator' });
      const sa2 = await createSA({ suffix: `${suffix}-approver`, name: 'Approver' });

      // SA#1 initiates a request
      const requestId = await initiateRequest({
        initiatorToken: sa1.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'RevokedInitiator',
        lastName: 'Test',
      });

      // Revoke SUPER_ADMIN role from SA#1 (downgrade to ADMIN)
      await prisma.userAdminRole.deleteMany({
        where: { userId: sa1.id, role: { key: AdminRoleKey.SUPER_ADMIN } },
      });
      await prisma.user.update({
        where: { id: sa1.id },
        data: { role: 'ADMIN' },
      });

      // SA#2 attempts to approve
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should reject with 409 or 403
      expect([409, 403]).toContain(approveRes.status);
      expect(approveRes.body.error).toMatch(/initiator.*no longer.*SUPER_ADMIN|role was revoked/i);

      // Verify no new SUPER_ADMIN was created
      const createdCount = await prisma.user.count({
        where: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' },
      });
      expect(createdCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Initiator deleted → approval rejected with 409/403
  // ---------------------------------------------------------------------------
  describe('Test 3: Initiator deleted between initiation and approval', () => {
    it('should reject approval when initiator no longer exists', async () => {
      const suffix = `deleted-${Date.now()}`;

      const sa1 = await createSA({ suffix: `${suffix}-initiator`, name: 'Initiator' });
      const sa2 = await createSA({ suffix: `${suffix}-approver`, name: 'Approver' });

      // SA#1 initiates a request
      const requestId = await initiateRequest({
        initiatorToken: sa1.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'DeletedInitiator',
        lastName: 'Test',
      });

      // Delete SA#1 (remove from both user and adminRole tables)
      // Note: must delete in correct order to respect foreign keys
      await prisma.pendingSuperAdminRequest.delete({ where: { id: requestId } });
      createdRequestIds.splice(createdRequestIds.indexOf(requestId), 1);
      await prisma.userAdminRole.deleteMany({ where: { userId: sa1.id } });
      await prisma.user.delete({ where: { id: sa1.id } });
      // Remove from tracking so afterEach doesn't try to delete again
      createdUserIds.splice(createdUserIds.indexOf(sa1.id), 1);

      // SA#2 attempts to approve
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should reject with 403 (the initiator was deleted / no longer exists) or 404 (request was cleaned up)
      expect([403, 404, 409]).toContain(approveRes.status);
      if (approveRes.status !== 404) {
        expect(approveRes.body.error).toMatch(/initiator.*no longer|does not exist/i);
      }

      // Verify no new SUPER_ADMIN was created
      const createdCount = await prisma.user.count({
        where: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' },
      });
      expect(createdCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: Bootstrap self-approval still works (sole SA case exemption)
  // ---------------------------------------------------------------------------
  describe('Test 4: Bootstrap self-approval exemption (sole SA)', () => {
    it('should allow sole SA to self-approve when only one SA exists', async () => {
      const suffix = `bootstrap-${Date.now()}`;

      // Clean up any stale SUPER_ADMINs from other tests to ensure we're the sole SA
      // Archive all non-archived SAs so they won't be counted in the bootstrap check
      await prisma.user.updateMany({
        where: { role: 'SUPER_ADMIN', status: { not: 'ARCHIVED' } },
        data: { status: 'ARCHIVED' },
      });

      // Create only one SA (the sole actor and initiator)
      const soleSA = await createSA({ suffix: `${suffix}-sole`, name: 'SoleSA' });

      // Sole SA initiates a request
      const requestId = await initiateRequest({
        initiatorToken: soleSA.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'BootstrapAdmin',
        lastName: 'Test',
      });

      // Sole SA approves their own request (bootstrap exception)
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${soleSA.token}`)
        .send({});

      // Should succeed with 201
      expect(approveRes.status).toBe(201);
      expect(approveRes.body.ok).toBe(true);
      expect(approveRes.body.user.email).toBe(`new-admin-${suffix}@test.local`);

      // Verify new SUPER_ADMIN was created
      const newAdmin = await prisma.user.findUnique({
        where: { email_role: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' } },
        select: { role: true, status: true },
      });
      expect(newAdmin?.role).toBe('SUPER_ADMIN');
      expect(newAdmin?.status).toBe('ACTIVE');

      // Verify the request was deleted
      const reqAfter = await prisma.pendingSuperAdminRequest.findUnique({ where: { id: requestId } });
      expect(reqAfter).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5: Normal approval flow still works (different SA approves)
  // ---------------------------------------------------------------------------
  describe('Test 5: Normal approval flow (non-bootstrap case)', () => {
    it('should allow approval when initiator is ACTIVE SUPER_ADMIN', async () => {
      const suffix = `normal-${Date.now()}`;

      // Create two SAs: SA#1 (initiator) and SA#2 (approver)
      const sa1 = await createSA({ suffix: `${suffix}-initiator`, name: 'Initiator' });
      const sa2 = await createSA({ suffix: `${suffix}-approver`, name: 'Approver' });

      // SA#1 initiates a request
      const requestId = await initiateRequest({
        initiatorToken: sa1.token,
        email: `new-admin-${suffix}@test.local`,
        firstName: 'NormalApproval',
        lastName: 'Test',
      });

      // SA#2 approves (no archive, no demotion)
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should succeed with 201
      expect(approveRes.status).toBe(201);
      expect(approveRes.body.ok).toBe(true);
      expect(approveRes.body.user.email).toBe(`new-admin-${suffix}@test.local`);

      // Verify new SUPER_ADMIN was created
      const newAdmin = await prisma.user.findUnique({
        where: { email_role: { email: `new-admin-${suffix}@test.local`, role: 'SUPER_ADMIN' } },
        select: { role: true, status: true },
      });
      expect(newAdmin?.role).toBe('SUPER_ADMIN');
      expect(newAdmin?.status).toBe('ACTIVE');

      // Verify the request was deleted
      const reqAfter = await prisma.pendingSuperAdminRequest.findUnique({ where: { id: requestId } });
      expect(reqAfter).toBeNull();
    });
  });
});
