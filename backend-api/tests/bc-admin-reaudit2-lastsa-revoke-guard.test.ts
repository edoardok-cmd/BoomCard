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
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();

    // BC-QA-042: every user this file creates originally used a FIXED
    // literal email with no afterAll cleanup at all — the second run of
    // this file (locally or in CI) hit a unique-constraint violation in
    // beforeAll itself, which then leaves every test's token undefined and
    // every request 401ing regardless of the guard logic under test. Suffix
    // every email so reruns don't collide, and actually clean them up below.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
        email: `active-sa-${suffix}@test.local`,
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
    createdUserIds.push(activeSA.id);
    activeSuperAdminToken = generateTestToken(activeSA.id, 'SUPER_ADMIN');

    // Create an INACTIVE SUPER_ADMIN (holds the role but is inactive)
    const inactiveSA = await prisma.user.create({
      data: {
        email: `inactive-sa-${suffix}@test.local`,
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
    createdUserIds.push(inactiveSA.id);
  });

  afterAll(async () => {
    // createTestApp() (tests/setup.ts) returns the plain Express app, not a
    // listening server — supertest's persistent-server wrapper owns the
    // actual http.Server and closes it at the file boundary. app.close is
    // not a function; calling it here was a stale test-infra bug (BC-QA-042).
    // Clean up every user this file created (see the beforeAll note above —
    // BC-QA-042 — this file had NO cleanup at all previously).
    if (createdUserIds.length) {
      await prisma.userAdminRole.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
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
      // The previous test only revoked the role from inactiveSuperAdminId —
      // activeSuperAdminId (from beforeAll) is STILL an ACTIVE SUPER_ADMIN at
      // this point, so without deactivating it here there are actually TWO
      // active SUPER_ADMINs once newActiveSA below is created, and the guard
      // correctly (but not usefully for this test) allows the revoke — this
      // test's "sole ACTIVE admin" premise wasn't actually isolated
      // (BC-QA-042). Deactivate the beforeAll fixture so newActiveSA is
      // genuinely the only ACTIVE SUPER_ADMIN.
      await prisma.user.update({
        where: { id: activeSuperAdminId },
        data: { status: 'INACTIVE' },
      });

      // Create another ACTIVE SA to have a clean slate for this test
      const newActiveSA = await prisma.user.create({
        data: {
          email: `sole-active-sa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
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
      createdUserIds.push(newActiveSA.id);
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
      //
      // The guard counts ALL ACTIVE role:'SUPER_ADMIN' users, not just the
      // three this test creates — newActiveSA from the previous test is
      // still an untouched ACTIVE SUPER_ADMIN at this point (it was only
      // used to prove the guard BLOCKS a revoke, so it necessarily still
      // holds the role) and would otherwise silently supply an extra
      // "remaining active" count here, defeating this test's own isolation
      // (BC-QA-042). Deactivate any pre-existing ACTIVE SUPER_ADMINs first so
      // active1/active2 below are genuinely the only two.
      await prisma.user.updateMany({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      });

      const active1 = await prisma.user.create({
        data: {
          email: `mixed-active-1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
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
          email: `mixed-active-2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
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
          email: `mixed-inactive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
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

      createdUserIds.push(active1.id, active2.id, inactive.id);
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

      // Revoke the INACTIVE target's role — should succeed regardless
      // (they're not counted as ACTIVE), but must be performed BY an active
      // actor: auth.middleware.ts re-derives req.user.aro=true from the
      // LIVE status whenever the AUTHENTICATED CALLER is INACTIVE, and
      // requirePermission() blocks ALL write operations for aro=true
      // sessions. Authenticating as `inactive` itself (the original form of
      // this test) exercises that read-only guard rather than the
      // remaining-active-count guard under test here — use active2 (still
      // SUPER_ADMIN + ACTIVE — its own revoke attempt above was correctly
      // blocked) as the actor instead (BC-QA-042).
      const revokeInactive = await request(app)
        .delete(`/api/admin/admins/${inactive.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${active2Token}`);

      // Should succeed (remainingActiveSupers = 1: active2)
      expect(revokeInactive.status).toBe(200);
    });
  });
});

// BC-QA-042: this was a placeholder (`Bearer_${userId}_${role}`) rather than
// a real signed JWT — authenticate() (src/middleware/auth.middleware.ts)
// calls jwt.verify() on it, so every request in this file 401'd before ever
// reaching the route/business logic under test, regardless of what that
// logic actually does.
function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
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
