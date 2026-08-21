/**
 * Integration test: BC-ADMIN-SPEC-REAUDIT5-SUSPENDED-SA-GATE-1
 *
 * Spec violation: PATCH /api/admin/subscribers/:userId/status allows a non-Super-Admin
 * admin holding subscribers.write permission to clear a SUSPENDED user (password reset
 * abuse lockout) with no guard or audit record. Spec §11.4 / Clash 11.4 requires that
 * SUSPENDED be "pending Super Admin review" — only SUPER_ADMIN can lift it.
 *
 * Fix:
 * 1. Add a check: if user.status === SUSPENDED && req.user.role !== SUPER_ADMIN → 403
 * 2. On valid SUPER_ADMIN lift (SUSPENDED → ACTIVE), write an audit record
 * 3. Verify DELETED and ARCHIVED guards remain unchanged
 * 4. Verify ACTIVE <-> INACTIVE still works for standard admins
 *
 * Test coverage:
 * 1. Create a SUSPENDED subscriber (simulating 5+ password resets in 24h)
 * 2. Attempt lift as ADMIN (subscribers.write) → 403
 * 3. Attempt lift as SUPER_ADMIN → 200, audit record written
 * 4. Verify ACTIVE/INACTIVE transitions unaffected for standard admins
 * 5. Verify DELETED and ARCHIVED guards still work
 * 6. Verify no other route bypasses SUSPENDED (profile PATCH)
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { genTestPhone } from './helpers/test-utils';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

function generateTestToken(userId: string, role: string, permissions?: string[]): string {
  const jwt = require('jsonwebtoken');
  const payload: Record<string, unknown> = { userId, role, id: userId };
  if (permissions && permissions.length > 0) {
    payload.permissions = permissions;
  }
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '24h',
  });
}

describe('BC-ADMIN-SPEC-REAUDIT5-SUSPENDED-SA-GATE-1', () => {
  let app: any;
  let superAdminToken: string;
  let superAdminId: string;
  let adminToken: string;
  let adminId: string;
  let suspendedUserId: string;

  // BC-QA-045-FOLLOWUP-3: this file previously had NO fixture cleanup at
  // all beyond prisma.$disconnect() — every ACTIVE/SUSPENDED/etc. user it
  // creates (most load-bearingly, the SUPER_ADMIN `superAdmin` fixture)
  // leaked into the shared boomcard_test database. A leaked non-archived
  // SUPER_ADMIN is exactly the fixture class that defeats
  // sa-guard-races.test.ts DEFECT 3's "exactly 1 existing SUPER_ADMIN"
  // bootstrap precondition. Track every user this file creates (beforeAll
  // fixtures + each test's own inline fixtures) and delete them, and their
  // audit-log rows, at the file boundary.
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    // Create a SUPER_ADMIN
    const superAdmin = await prisma.user.create({
      data: {
        email: `sa-suspended-gate-${Date.now()}@test.local`,
        firstName: 'SA',
        lastName: 'SuspendedGate',
        phone: genTestPhone(),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash', // dummy hash for test purposes
      },
    });
    superAdminId = superAdmin.id;
    createdUserIds.push(superAdmin.id);
    superAdminToken = generateTestToken(superAdmin.id, 'SUPER_ADMIN');

    // Create a standard ADMIN with default subscribers.write permission
    // (all ADMIN roles get subscribers.write by default)
    const admin = await prisma.user.create({
      data: {
        email: `admin-suspended-gate-${Date.now()}@test.local`,
        firstName: 'Admin',
        lastName: 'SuspendedGate',
        phone: genTestPhone(),
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        passwordHash: 'dummy-hash', // dummy hash for test purposes
      },
    });
    adminId = admin.id;
    createdUserIds.push(admin.id);
    adminToken = generateTestToken(admin.id, 'ADMIN', ['subscribers.write']);

    // Create a SUSPENDED subscriber (simulating password reset abuse lockout)
    const suspendedUser = await prisma.user.create({
      data: {
        email: `suspended-subscriber-${Date.now()}@test.local`,
        firstName: 'Suspended',
        lastName: 'User',
        phone: genTestPhone(),
        role: 'USER',
        status: 'SUSPENDED',
        emailVerified: true,
        passwordHash: 'dummy-hash', // dummy hash for test purposes
      },
    });
    suspendedUserId = suspendedUser.id;
    createdUserIds.push(suspendedUser.id);
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      // AuditLog.actorUserId has no onDelete: Cascade, so clear rows this
      // file's fixtures wrote (as actor or as object) before deleting the
      // Users themselves.
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: createdUserIds } },
            { objectId: { in: createdUserIds } },
          ],
        },
      }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe('SUSPENDED state requires SUPER_ADMIN to lift', () => {
    it('should reject non-SA admin attempt to clear SUSPENDED status (403)', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${suspendedUserId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Super Admin/i);
    });

    it('should allow SUPER_ADMIN to clear SUSPENDED status (200)', async () => {
      const res = await request(app)
        .patch(`/api/admin/subscribers/${suspendedUserId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('ACTIVE');

      // Verify the user was actually updated
      const updated = await prisma.user.findUnique({ where: { id: suspendedUserId } });
      expect(updated?.status).toBe('ACTIVE');
    });

    it('should write an audit record when SUPER_ADMIN lifts SUSPENDED', async () => {
      // Create another SUSPENDED user for audit verification
      const testUser = await prisma.user.create({
        data: {
          email: `suspended-audit-${Date.now()}@test.local`,
          firstName: 'Suspended',
          lastName: 'Audit',
          phone: genTestPhone(),
          role: 'USER',
          status: 'SUSPENDED',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });
      createdUserIds.push(testUser.id);

      // Clear the audit log first
      await prisma.auditLog.deleteMany({
        where: { objectId: testUser.id },
      });

      // Lift SUSPENDED as SUPER_ADMIN
      const res = await request(app)
        .patch(`/api/admin/subscribers/${testUser.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);

      // Verify audit record was written
      const audit = await prisma.auditLog.findFirst({
        where: {
          objectId: testUser.id,
          action: 'subscriber.status.lift-suspension',
        },
      });

      expect(audit).toBeDefined();
      expect(audit?.action).toBe('subscriber.status.lift-suspension');
      expect(audit?.actorUserId).toBe(superAdminId);
      expect(audit?.before).toEqual({ status: 'SUSPENDED' });
      expect(audit?.after).toEqual({ status: 'ACTIVE' });
    });
  });

  describe('Other status transitions unaffected', () => {
    it('should allow admin to transition ACTIVE <-> INACTIVE', async () => {
      const normalUser = await prisma.user.create({
        data: {
          email: `normal-user-${Date.now()}@test.local`,
          firstName: 'Normal',
          lastName: 'User',
          phone: genTestPhone(),
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });
      createdUserIds.push(normalUser.id);

      // ACTIVE -> INACTIVE
      let res = await request(app)
        .patch(`/api/admin/subscribers/${normalUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INACTIVE');

      // INACTIVE -> ACTIVE
      res = await request(app)
        .patch(`/api/admin/subscribers/${normalUser.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('should enforce DELETED guard (cannot edit DELETED accounts)', async () => {
      const deletedUser = await prisma.user.create({
        data: {
          email: `deleted-user-${Date.now()}@test.local`,
          firstName: 'Deleted',
          lastName: 'User',
          phone: genTestPhone(),
          role: 'USER',
          status: 'DELETED',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });
      createdUserIds.push(deletedUser.id);

      const res = await request(app)
        .patch(`/api/admin/subscribers/${deletedUser.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/restore endpoint/i);
    });

    it('should enforce ARCHIVED guard (terminal state)', async () => {
      const archivedUser = await prisma.user.create({
        data: {
          email: `archived-user-${Date.now()}@test.local`,
          firstName: 'Archived',
          lastName: 'User',
          phone: genTestPhone(),
          role: 'USER',
          status: 'ARCHIVED',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });
      createdUserIds.push(archivedUser.id);

      const res = await request(app)
        .patch(`/api/admin/subscribers/${archivedUser.id}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/terminal/i);
    });
  });

  describe('No backdoors to clear SUSPENDED', () => {
    it('should not allow profile PATCH to bypass SUSPENDED status', async () => {
      const suspendedForProfileTest = await prisma.user.create({
        data: {
          email: `suspended-profile-test-${Date.now()}@test.local`,
          firstName: 'Suspended',
          lastName: 'ProfileTest',
          phone: genTestPhone(),
          role: 'USER',
          status: 'SUSPENDED',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });
      createdUserIds.push(suspendedForProfileTest.id);

      // Attempt to edit profile (should fail)
      const res = await request(app)
        .patch(`/api/admin/subscribers/${suspendedForProfileTest.id}/profile`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Hacked' });

      // Profile PATCH should work on SUSPENDED users (risk edits are allowed per spec)
      // but the user should remain SUSPENDED
      expect(res.status).toBe(200);

      // Verify user is still SUSPENDED
      const user = await prisma.user.findUnique({
        where: { id: suspendedForProfileTest.id },
      });
      expect(user?.status).toBe('SUSPENDED');
    });
  });
});
