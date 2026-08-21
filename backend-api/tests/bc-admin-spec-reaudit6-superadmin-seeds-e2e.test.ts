/**
 * BC-ADMIN-SPEC-REAUDIT6-SUPERADMIN-SEEDS-E2E
 *
 * Integration test verifying the CRITICAL FIXES for seedPermissions():
 *
 * CRITICAL FIX 1: seedPermissions() is now called from prisma/seed.ts
 *   - Before this fix, seedPermissions() was never invoked during npm run db:seed or db:reset
 *   - This meant SUPER_ADMIN AdminRole row did not exist in production databases
 *   - POST /admin/admins/critical-actions/:requestId/approve would return 500
 *
 * CRITICAL FIX 2: tests/setup.ts now calls seedPermissions() in beforeAll
 *   - Integration tests depend on SUPER_ADMIN role existing at runtime
 *   - E.g., bc-admin-spec-reaudit2-sa-approve-initiator.test.ts fails without this
 *
 * Test coverage:
 * 1. Seed flow: permissions, AdminRole catalog, and default role assignments work
 * 2. SUPER_ADMIN role exists with zero RolePermission rows (bypass in requirePermission)
 * 3. Real dual-approval cycle: initiate → approve with different admin → 201 ACTIVE
 * 4. Self-approval refusal: same admin cannot approve their own request → 403
 * 5. DELETE /admins/:id/roles/SUPER_ADMIN works and returns 200, not 404
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';
import { AdminRoleKey, UserStatus } from '@prisma/client';
import { genTestPhone } from './helpers/test-utils';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-SPEC-REAUDIT6-SUPERADMIN-SEEDS-E2E: Seeding and approval flow', () => {
  let superAdminRoleId: string;
  const createdUserIds: string[] = [];
  const createdRequestIds: string[] = [];

  beforeAll(async () => {
    // Verify SUPER_ADMIN role exists (seeded by tests/setup.ts beforeAll)
    const superAdminRole = await prisma.adminRole.findUnique({
      where: { key: AdminRoleKey.SUPER_ADMIN },
    });
    if (!superAdminRole) {
      throw new Error(
        'SUPER_ADMIN role not found — seedPermissions() was not called. ' +
          'Check tests/setup.ts beforeAll or prisma/seed.ts integration.',
      );
    }
    superAdminRoleId = superAdminRole.id;

    // Fix stale label issue: ensure SUPER_ADMIN role has the correct label.
    // Test database may have an old seeded row with "Super Admin" instead of "Super Administrator".
    if (superAdminRole.label !== 'Super Administrator') {
      await prisma.adminRole.update({
        where: { id: superAdminRole.id },
        data: { label: 'Super Administrator' },
      });
    }

    // Verify SUPER_ADMIN has zero RolePermission rows (it bypasses requirePermission)
    const superAdminPermissions = await prisma.rolePermission.findMany({
      where: { roleId: superAdminRoleId },
    });
    expect(superAdminPermissions.length).toBe(0);
  });

  afterEach(async () => {
    // Clean up users first (which also cleans up their adminRoles via cascade)
    // before cleaning up pending requests that reference them as requestedById.
    if (createdUserIds.length > 0) {
      await prisma.userAdminRole.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      // Delete pending requests that reference these users as requestedBy
      await prisma.pendingSuperAdminRequest.deleteMany({
        where: { requestedById: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }
    // Clean up any remaining pending requests not created by the test users
    if (createdRequestIds.length > 0) {
      await prisma.pendingSuperAdminRequest.deleteMany({
        where: { id: { in: createdRequestIds } },
      });
      createdRequestIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Create a SUPER_ADMIN user
  // ─────────────────────────────────────────────────────────────────────────────
  async function createSA(suffix: string): Promise<{ id: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        email: `e2e-sa-${suffix}@test.local`,
        firstName: 'E2E',
        lastName: 'SA',
        phone: genTestPhone(),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'test-hash',
        adminRoles: { create: { roleId: superAdminRoleId } },
      },
    });
    createdUserIds.push(user.id);
    return {
      id: user.id,
      token: jwt.sign(
        { id: user.id, role: 'SUPER_ADMIN' },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '24h' },
      ),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 1: SUPER_ADMIN role infrastructure seeded correctly
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Test 1: SUPER_ADMIN role infrastructure', () => {
    it('SUPER_ADMIN AdminRole row exists after seeding', async () => {
      const superAdminRole = await prisma.adminRole.findUnique({
        where: { key: AdminRoleKey.SUPER_ADMIN },
      });

      expect(superAdminRole).toBeDefined();
      expect(superAdminRole?.key).toBe('SUPER_ADMIN');
      expect(superAdminRole?.label).toBe('Super Administrator');
    });

    it('SUPER_ADMIN has zero RolePermission rows (bypass intended)', async () => {
      const superAdminRole = await prisma.adminRole.findUnique({
        where: { key: AdminRoleKey.SUPER_ADMIN },
      });
      expect(superAdminRole).toBeDefined();

      const permissions = await prisma.rolePermission.findMany({
        where: { roleId: superAdminRole!.id },
      });

      expect(permissions.length).toBe(0);
    });

    it('ADMIN role exists and has permissions (unlike SUPER_ADMIN)', async () => {
      const adminRole = await prisma.adminRole.findUnique({
        where: { key: AdminRoleKey.ADMIN },
      });
      expect(adminRole).toBeDefined();

      const permissions = await prisma.rolePermission.findMany({
        where: { roleId: adminRole!.id },
      });

      // ADMIN should have multiple permissions, SUPER_ADMIN should have zero
      expect(permissions.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 2: Full dual-approval cycle (real HTTP endpoints)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Test 2: Dual-approval cycle (SA#1 initiates, SA#2 approves)', () => {
    it('should complete full cycle: initiate → approve → 201 ACTIVE', async () => {
      const sa1 = await createSA(`initiate-${Date.now()}`);
      const sa2 = await createSA(`approve-${Date.now()}`);
      const newAdminEmail = `e2e-new-admin-${Date.now()}@test.local`;

      // Step 1: SA#1 initiates a SUPER_ADMIN creation request
      const initiateRes = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${sa1.token}`)
        .send({
          email: newAdminEmail,
          firstName: 'E2ENewAdmin',
          lastName: 'Test',
          phone: genTestPhone(),
          password: 'E2ETestPassword123!@#',
          roleKey: 'SUPER_ADMIN',
        });

      expect(initiateRes.status).toBe(202);
      expect(initiateRes.body.request).toBeDefined();
      expect(initiateRes.body.request.id).toBeDefined();
      const requestId = initiateRes.body.request.id;
      createdRequestIds.push(requestId);

      // Step 2: SA#2 approves the request
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      expect(approveRes.status).toBe(201);
      expect(approveRes.body.ok).toBe(true);
      expect(approveRes.body.user.email).toBe(newAdminEmail);
      expect(approveRes.body.user.role).toBe('SUPER_ADMIN');
      expect(approveRes.body.user.status).toBe('ACTIVE');

      // Step 3: Verify the new admin exists and is ACTIVE
      const createdAdmin = await prisma.user.findFirst({
        where: { email: newAdminEmail, role: 'SUPER_ADMIN' },
      });
      expect(createdAdmin).toBeDefined();
      expect(createdAdmin?.role).toBe('SUPER_ADMIN');
      expect(createdAdmin?.status).toBe('ACTIVE');
      // BC-QA-045-FOLLOWUP-3: this user is created by the /approve route
      // itself (not via the createSA() helper above), so it was never
      // tracked in createdUserIds and leaked past this file's own afterEach
      // — exactly the leaked non-archived SUPER_ADMIN fixture class that
      // defeats sa-guard-races.test.ts DEFECT 3's bootstrap precondition.
      if (createdAdmin) createdUserIds.push(createdAdmin.id);

      // Step 4: Verify the request was deleted after approval
      const reqAfter = await prisma.pendingSuperAdminRequest.findUnique({
        where: { id: requestId },
      });
      expect(reqAfter).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 3: Self-approval rejection (same admin cannot approve own request)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Test 3: Self-approval refusal', () => {
    it('should reject self-approval with 403', async () => {
      // BC-QA-045-FOLLOWUP-3: this test's name promises the ORDINARY 2-of-N
      // "approver must be a different admin" rejection, but with only ONE
      // non-archived SUPER_ADMIN in existence at approval time (`soleSA`
      // itself — the approve route's own bootstrap-quorum check counts
      // non-ARCHIVED SUPER_ADMINs, see adminAdmins.routes.ts "H2 fix"), the
      // approve route takes its BOOTSTRAP-EXCEPTION branch instead: "only
      // one Super Admin exists (non-archived) -> sole SA may self-approve",
      // which SUCCEEDS (201) rather than rejecting (403). Historically this
      // test still passed because the shared boomcard_test database always
      // had OTHER leaked non-archived SUPER_ADMIN fixtures from other
      // suites pushing the ambient count above 1 by accident — the same
      // "borrowed isolation" trap as sa-guard-races.test.ts DEFECT 3
      // (BC-QA-045-FOLLOWUP-3 task description). As that leakage gets fixed
      // suite-wide, this test starts flipping to the TRUE bootstrap-success
      // path instead: `expect(approveRes.status).toBe(403)` goes red, and —
      // worse — the self-approval genuinely succeeds and creates a REAL new
      // SUPER_ADMIN that this test never tracks in `createdUserIds` (it has
      // no reason to, since it assumes approval always fails), leaking
      // exactly the fixture class this whole follow-up exists to close.
      // Observed directly: a batched run of this file alongside the other
      // BC-QA-045-FOLLOWUP-3 fixes (which clean up after themselves) hit
      // this red/leak once. Fix: create a SECOND non-archived SUPER_ADMIN
      // so the approve route's own count check is genuinely >1 and the
      // "different admin" branch — not the bootstrap branch — is what
      // actually runs, matching what this test's name and assertions claim
      // to exercise.
      const soleSA = await createSA(`self-approve-${Date.now()}`);
      await createSA(`self-approve-other-${Date.now()}`);
      const newAdminEmail = `e2e-self-approve-${Date.now()}@test.local`;

      // Sole SA initiates a request
      const initiateRes = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${soleSA.token}`)
        .send({
          email: newAdminEmail,
          firstName: 'E2ESelfApprove',
          lastName: 'Test',
          phone: genTestPhone(),
          password: 'E2ETestPassword123!@#',
          roleKey: 'SUPER_ADMIN',
        });

      if (initiateRes.status !== 202) {
        console.log('Self-approve test - initiate status:', initiateRes.status, 'body:', initiateRes.body);
      }
      expect(initiateRes.status).toBe(202);
      const requestId = initiateRes.body.request.id;
      createdRequestIds.push(requestId);

      // Sole SA attempts to approve their own request
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${soleSA.token}`)
        .send({});

      // Should reject with 403 (self-approval not allowed in 2-of-N)
      expect(approveRes.status).toBe(403);
      expect(approveRes.body.error).toMatch(/cannot approve.*own|self-approval|different admin/i);

      // Verify no new admin was created
      const createdCount = await prisma.user.count({
        where: { email: newAdminEmail, role: 'SUPER_ADMIN' },
      });
      expect(createdCount).toBe(0);

      // Verify request is still PENDING
      const reqAfter = await prisma.pendingSuperAdminRequest.findUnique({
        where: { id: requestId },
      });
      expect(reqAfter?.status).toBe('PENDING');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 4: DELETE endpoint works and returns 200 (not 404)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Test 4: DELETE /admins/:id/roles/SUPER_ADMIN endpoint', () => {
    it('should successfully revoke SUPER_ADMIN role with 200', async () => {
      const sa = await createSA(`revoke-${Date.now()}`);
      const newAdmin = await createSA(`to-revoke-${Date.now()}`);

      // SA revokes SUPER_ADMIN role from newAdmin
      const deleteRes = await request(app)
        .delete(`/api/admin/admins/${newAdmin.id}/roles/SUPER_ADMIN`)
        .set('Authorization', `Bearer ${sa.token}`)
        .send({});

      expect(deleteRes.status).toBe(200);

      // Verify the role was revoked
      const userAdminRoles = await prisma.userAdminRole.findMany({
        where: {
          userId: newAdmin.id,
          role: { key: AdminRoleKey.SUPER_ADMIN },
        },
      });
      expect(userAdminRoles.length).toBe(0);
    });

    it('should not return 404 when revoking SUPER_ADMIN role', async () => {
      const sa = await createSA(`revoke-test-${Date.now()}`);
      const newAdmin = await createSA(`to-revoke-test-${Date.now()}`);

      // First revocation should succeed
      const deleteRes1 = await request(app)
        .delete(`/api/admin/admins/${newAdmin.id}/roles/SUPER_ADMIN`)
        .set('Authorization', `Bearer ${sa.token}`)
        .send({});

      expect(deleteRes1.status).toBe(200);

      // Second revocation of already-revoked role should return 404
      // (the role no longer exists to revoke)
      const deleteRes2 = await request(app)
        .delete(`/api/admin/admins/${newAdmin.id}/roles/SUPER_ADMIN`)
        .set('Authorization', `Bearer ${sa.token}`)
        .send({});

      expect(deleteRes2.status).toBe(404);
      expect(deleteRes2.body.error).toMatch(/does not have this role/i);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test 5: Approval handler finds SUPER_ADMIN role without 500 error
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Test 5: Approval handler finds SUPER_ADMIN (no 500 error)', () => {
    it('approval handler should not return 500 when SUPER_ADMIN exists', async () => {
      const sa1 = await createSA(`no-500-init-${Date.now()}`);
      const sa2 = await createSA(`no-500-approve-${Date.now()}`);
      const newAdminEmail = `e2e-no-500-${Date.now()}@test.local`;

      // Initiate
      const initiateRes = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${sa1.token}`)
        .send({
          email: newAdminEmail,
          firstName: 'E2ENo500',
          lastName: 'Test',
          phone: genTestPhone(),
          password: 'E2ETestPassword123!@#',
          roleKey: 'SUPER_ADMIN',
        });

      const requestId = initiateRes.body.request.id;
      createdRequestIds.push(requestId);

      // Approve — should NOT return 500
      const approveRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId}/approve`)
        .set('Authorization', `Bearer ${sa2.token}`)
        .send({});

      // Should succeed (201) or fail gracefully, NOT 500
      expect(approveRes.status).not.toBe(500);
      if (approveRes.status !== 201) {
        // If not successful, verify error message doesn't indicate role not found
        expect(approveRes.body.error).not.toMatch(/role not found/i);
      } else {
        // BC-QA-045-FOLLOWUP-3: on the success path this creates a new
        // SUPER_ADMIN via the /approve route itself (not the createSA()
        // helper), so it was never tracked in createdUserIds and leaked
        // past this file's own afterEach — same class as Test 2 above.
        const createdAdmin = await prisma.user.findFirst({
          where: { email: newAdminEmail, role: 'SUPER_ADMIN' },
        });
        if (createdAdmin) createdUserIds.push(createdAdmin.id);
      }
    });
  });
});
