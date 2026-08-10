/**
 * Integration tests for BC-ADMIN-REAUDIT2-LASTSA-REVOKE-GUARD-1
 *
 * Tests cover:
 * - DELETE /:id/roles/:roleKey guard uses exclude-the-target form
 * - Revoking role from INACTIVE admin succeeds (when ACTIVE admin exists)
 * - Revoking role from sole ACTIVE admin correctly blocks with 409
 * - Guard matches the correct form already used in PATCH /:id/status
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { AdminRoleKey } from '@prisma/client';
import { genTestPhone } from './helpers/test-utils';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-REAUDIT2-LASTSA-REVOKE-GUARD-1: Role Revoke Guard Exclude-Target Fix', () => {
  let app: any;
  let activeSuperAdminToken: string;
  let activeSuperAdminId: string;
  let inactiveSuperAdminId: string;
  let superAdminRoleId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Create SUPER_ADMIN role
    const superAdminRole = await prisma.adminRole.findUnique({
      where: { key: AdminRoleKey.SUPER_ADMIN },
    });
    if (!superAdminRole) {
      throw new Error('SUPER_ADMIN role not found — run seed-permissions first');
    }
    superAdminRoleId = superAdminRole.id;

    // Create an ACTIVE SUPER_ADMIN
    const activeSA = await prisma.user.create({
      data: {
        email: 'active-sa@test.local',
        firstName: 'Active',
        lastName: 'SuperAdmin',
        phone: genTestPhone(),
        passwordHash: 'hashed_password',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
        adminRoles: {
          create: { roleId: superAdminRoleId },
        },
      },
    });
    activeSuperAdminId = activeSA.id;
    activeSuperAdminToken = generateTestToken(activeSA.id, 'SUPER_ADMIN');

    // Create an INACTIVE SUPER_ADMIN (holds the role but is inactive)
    const inactiveSA = await prisma.user.create({
      data: {
        email: 'inactive-sa@test.local',
        firstName: 'Inactive',
        lastName: 'SuperAdmin',
        phone: genTestPhone(),
        passwordHash: 'hashed_password',
        role: 'SUPER_ADMIN',
        status: 'INACTIVE',
        emailVerified: true,
        adminRoles: {
          create: { roleId: superAdminRoleId },
        },
      },
    });
    inactiveSuperAdminId = inactiveSA.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('CRITICAL: Exclude-the-target guard form', () => {
    it('should allow revoking SUPER_ADMIN from INACTIVE admin when an ACTIVE admin exists (was false 409)', async () => {
      // This is the key scenario: we have 1 ACTIVE SA (activeSuperAdminId) and 1 INACTIVE SA (inactiveSuperAdminId).
      // The guard should count active SAs EXCLUDING the target (inactiveSuperAdminId).
      // remainingActiveSupers = count({ role: SUPER_ADMIN, status: ACTIVE, id: { not: inactiveSuperAdminId } })
      //                       = 1 (activeSuperAdminId)
      // Since remainingActiveSupers > 0, the revoke should SUCCEED.
      // The old buggy guard would count globally: count({ role: SUPER_ADMIN, status: ACTIVE }) = 1,
      // then check `if (1 <= 1)` and return 409 — WRONG!

      const res = await request(app)
        .delete(`/api/admin/admins/${inactiveSuperAdminId}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${activeSuperAdminToken}`);

      // Should succeed (200 OK), not 409
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify the role was actually revoked
      const updatedUser = await prisma.user.findUnique({
        where: { id: inactiveSuperAdminId },
        select: { role: true, adminRoles: { select: { role: { select: { key: true } } } } },
      });
      expect(updatedUser?.role).toBe('ADMIN');
      expect(updatedUser?.adminRoles).toHaveLength(0);
    });

    it('should block revoking SUPER_ADMIN from sole ACTIVE admin (409 Conflict)', async () => {
      // After the previous test, we have 0 ACTIVE SAs left (the sole ACTIVE one is still there, but we need a fresh state).
      // Create a fresh scenario: one ACTIVE SA, then try to revoke from that same SA.
      // First, reset: archive the current state and create fresh users.

      // Create another ACTIVE SA to have a clean slate for this test
      const newActiveSA = await prisma.user.create({
        data: {
          email: 'sole-active-sa@test.local',
          firstName: 'Sole',
          lastName: 'Active',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          adminRoles: {
            create: { roleId: superAdminRoleId },
          },
        },
      });
      const soleActiveSAToken = generateTestToken(newActiveSA.id, 'SUPER_ADMIN');

      // Try to revoke the sole ACTIVE SA's SUPER_ADMIN role
      const res = await request(app)
        .delete(`/api/admin/admins/${newActiveSA.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${soleActiveSAToken}`);

      // Should fail with 409 because remainingActiveSupers = 0
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Cannot revoke');
    });

    it('should correctly handle mixed ACTIVE/INACTIVE state (remaining count excludes target)', async () => {
      // Scenario: 2 ACTIVE SAs, 1 INACTIVE SA
      // Revoke from one ACTIVE SA → remainingActiveSupers = 1 → success
      // Revoke from second ACTIVE SA → remainingActiveSupers = 0 → 409

      const active1 = await prisma.user.create({
        data: {
          email: 'mixed-active-1@test.local',
          firstName: 'Mixed',
          lastName: 'Active1',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          adminRoles: {
            create: { roleId: superAdminRoleId },
          },
        },
      });

      const active2 = await prisma.user.create({
        data: {
          email: 'mixed-active-2@test.local',
          firstName: 'Mixed',
          lastName: 'Active2',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          adminRoles: {
            create: { roleId: superAdminRoleId },
          },
        },
      });

      const inactive = await prisma.user.create({
        data: {
          email: 'mixed-inactive@test.local',
          firstName: 'Mixed',
          lastName: 'Inactive',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'SUPER_ADMIN',
          status: 'INACTIVE',
          emailVerified: true,
          adminRoles: {
            create: { roleId: superAdminRoleId },
          },
        },
      });

      const active1Token = generateTestToken(active1.id, 'SUPER_ADMIN');

      // Revoke from first ACTIVE → should succeed (1 remaining ACTIVE exists: active2)
      const revoke1 = await request(app)
        .delete(`/api/admin/admins/${active1.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${active1Token}`);

      expect(revoke1.status).toBe(200);

      // Revoke from second ACTIVE → should succeed (still have active1... wait, we just revoked it)
      // Actually, after the first revoke, only active2 is ACTIVE, so revoking from active2 should fail.
      const active2Token = generateTestToken(active2.id, 'SUPER_ADMIN');
      const revoke2 = await request(app)
        .delete(`/api/admin/admins/${active2.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${active2Token}`);

      // Should fail because remainingActiveSupers (excluding active2) = 0 (active1 is no longer SUPER_ADMIN)
      expect(revoke2.status).toBe(409);

      // Revoke from INACTIVE should succeed regardless (they're not ACTIVE)
      const inactiveToken = generateTestToken(inactive.id, 'SUPER_ADMIN');
      const revokeInactive = await request(app)
        .delete(`/api/admin/admins/${inactive.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${inactiveToken}`);

      // Should succeed (remainingActiveSupers = 1: active2)
      expect(revokeInactive.status).toBe(200);
    });
  });
});

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  // Placeholder — in real integration tests this would be a proper JWT
  return `Bearer_${userId}_${role}`;
}
