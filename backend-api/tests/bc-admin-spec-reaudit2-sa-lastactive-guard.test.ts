/**
 * Regression tests for BC-ADMIN-SPEC-REAUDIT2-SA-LASTACTIVE-GUARD-1
 *
 * Verifies that the last-active-SA liveness guard in:
 *   - PATCH /:id/status
 *   - DELETE /:id/roles/:roleKey
 *
 * uses `status: 'ACTIVE'` (not `status: { not: 'ARCHIVED' }`) when counting
 * remaining Super Admins, and returns HTTP 409 (not 403) on violation.
 *
 * Key predicate difference:
 *   OLD (buggy):  status: { not: 'ARCHIVED' }  — counts INACTIVE SAs as "alive"
 *   NEW (correct): status: 'ACTIVE'             — only truly operational SAs count
 *
 * Guard trigger conditions:
 *   PATCH /:id/status — the guard fires before reaching the liveness check, so in
 *   sequential tests we can only verify the positive path (no false 409 when a
 *   second ACTIVE SA remains). The guard fires in a concurrent race that the
 *   Serializable transaction handles; see bc-admin-spec-reaudit-sa-guard-races.test.ts
 *   for that coverage.
 *
 *   DELETE /:id/roles/SUPER_ADMIN — the guard IS reachable sequentially via
 *   self-revoke (no self-revoke block exists for role deletion) and is the primary
 *   vehicle for testing the predicate difference.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';
import { AdminRoleKey } from '@prisma/client';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-SPEC-REAUDIT2-SA-LASTACTIVE-GUARD-1: ACTIVE-only liveness predicate', () => {
  let superAdminRoleId: string;
  const createdUserIds: string[] = [];

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
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  }): Promise<{ id: string; token: string }> {
    const status = opts.status ?? 'ACTIVE';
    const user = await prisma.user.create({
      data: {
        email: `lastactive-guard-${opts.suffix}@test.local`,
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
  // PATCH /:id/status — positive path: guard does NOT fire when another ACTIVE SA
  // remains after the operation.
  //
  // This also checks that an INACTIVE SA (SA_decoy) is NOT counted as an active
  // quorum member. Under the OLD predicate, SA_decoy would be counted; under the
  // NEW predicate it is not — but in both cases the guard should pass here because
  // SA_actor remains ACTIVE.
  // ---------------------------------------------------------------------------
  describe('PATCH /:id/status — no false 409 when another ACTIVE SA remains', () => {
    it('allows deactivating an ACTIVE SA when the actor remains ACTIVE (guard does not fire)', async () => {
      const suffix = `patch-pos-${Date.now()}`;

      // SA_actor: ACTIVE — will make the request and remain active after
      const saActor = await createSA({ suffix: `${suffix}-actor`, name: 'Actor' });
      // SA_target: ACTIVE — will be deactivated
      const saTarget = await createSA({ suffix: `${suffix}-target`, name: 'Target' });
      // SA_decoy: INACTIVE — should NOT count toward the liveness quorum
      await createSA({ suffix: `${suffix}-decoy`, name: 'Decoy', status: 'INACTIVE' });

      const res = await request(app)
        .patch(`/api/admin/admins/${saTarget.id}/status`)
        .set('Authorization', `Bearer ${saActor.token}`)
        .send({ status: 'INACTIVE', reason: 'regression-test: positive path' });

      // SA_actor (ACTIVE) is counted → guard passes → 200
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const after = await prisma.user.findUnique({ where: { id: saTarget.id }, select: { status: true } });
      expect(after?.status).toBe('INACTIVE');
    });

    it('allows archiving an ACTIVE SA when two other ACTIVE SAs remain', async () => {
      const suffix = `patch-pos2-${Date.now()}`;

      const saActor = await createSA({ suffix: `${suffix}-actor`, name: 'Actor2' });
      const saTarget = await createSA({ suffix: `${suffix}-target`, name: 'Target2' });
      const saBackup = await createSA({ suffix: `${suffix}-backup`, name: 'Backup2' });

      const res = await request(app)
        .patch(`/api/admin/admins/${saTarget.id}/status`)
        .set('Authorization', `Bearer ${saActor.token}`)
        .send({ status: 'ARCHIVED', reason: 'regression-test: archive positive path' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Backup SA must still exist (count excludes the ARCHIVED target)
      const afterBackup = await prisma.user.findUnique({ where: { id: saBackup.id }, select: { status: true } });
      expect(afterBackup?.status).toBe('ACTIVE');
    });

    it('returns 400 for self-demotion (distinct from the liveness guard — blocked at route line 1024 before guard)', async () => {
      const suffix = `patch-selfdemote-${Date.now()}`;
      const saActor = await createSA({ suffix: `${suffix}-self`, name: 'SelfDemote' });

      const res = await request(app)
        .patch(`/api/admin/admins/${saActor.id}/status`)
        .set('Authorization', `Bearer ${saActor.token}`)
        .send({ status: 'INACTIVE', reason: 'regression-test: self-demotion' });

      // Line 1024 fires BEFORE the liveness guard
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot change your own status/i);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /:id/roles/SUPER_ADMIN — liveness guard (self-revoke path)
  //
  // Self-revoke reaches the liveness guard (no self-revoke block for role deletion).
  // The predicate difference is directly observable here:
  //   OLD: count(NOT ARCHIVED, id ≠ target) counts INACTIVE SAs → guard passes (200)
  //   NEW: count(ACTIVE, id ≠ target) skips INACTIVE SAs  → guard blocks (409)
  // ---------------------------------------------------------------------------
  describe('DELETE /:id/roles/SUPER_ADMIN — INACTIVE SA must not count toward liveness', () => {
    it('returns 409 when the sole ACTIVE SA self-revokes (only INACTIVE SA remains)', async () => {
      const suffix = `role-neg-${Date.now()}`;

      // SA1: ACTIVE — the target and actor (self-revoke)
      const sa1 = await createSA({ suffix: `${suffix}-sa1`, name: 'SoleActive' });
      // SA2: INACTIVE — must NOT count under the new predicate
      await createSA({ suffix: `${suffix}-sa2`, name: 'InactiveDecoy', status: 'INACTIVE' });

      // Temporarily archive any pre-existing ACTIVE SUPER_ADMIN users in the test DB
      // (from other test suites) so the liveness count is not contaminated.
      const preExisting = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE', id: { notIn: createdUserIds } },
        select: { id: true },
      });
      const preExistingIds = preExisting.map((u) => u.id);
      if (preExistingIds.length > 0) {
        await prisma.user.updateMany({ where: { id: { in: preExistingIds } }, data: { status: 'ARCHIVED' } });
      }

      let res: { status: number; body: any };
      try {
        res = await request(app)
          .delete(`/api/admin/admins/${sa1.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
          .set('Authorization', `Bearer ${sa1.token}`);
      } finally {
        // Always restore pre-existing SAs regardless of test outcome
        if (preExistingIds.length > 0) {
          await prisma.user.updateMany({ where: { id: { in: preExistingIds } }, data: { status: 'ACTIVE' } });
        }
      }

      // NEW predicate: count(ACTIVE, id≠sa1) = 0 (sa2 is INACTIVE) → 409
      // OLD predicate: count(NOT ARCHIVED, id≠sa1) = 1 (sa2 is INACTIVE=not-archived) → 200 (BUG)
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Cannot revoke the role of the last active SUPER_ADMIN');

      // Invariant: SA1 role was NOT changed
      const sa1After = await prisma.user.findUnique({ where: { id: sa1.id }, select: { role: true } });
      expect(sa1After?.role).toBe('SUPER_ADMIN');
    });

    it('allows revoking SUPER_ADMIN from sole ACTIVE SA when another ACTIVE SA exists', async () => {
      const suffix = `role-pos-${Date.now()}`;

      // SA1: ACTIVE — self-revoke target/actor
      const sa1 = await createSA({ suffix: `${suffix}-sa1`, name: 'RevokeTarget' });
      // SA2: ACTIVE — remains after SA1 revokes (counted by guard → guard passes)
      await createSA({ suffix: `${suffix}-sa2`, name: 'RevokeBackup' });

      const res = await request(app)
        .delete(`/api/admin/admins/${sa1.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${sa1.token}`);

      // count(ACTIVE, id≠sa1) = 1 (sa2) → guard passes → 200
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('allows revoking SUPER_ADMIN from an INACTIVE SA when an ACTIVE SA remains', async () => {
      const suffix = `role-inactive-${Date.now()}`;

      // SA_actor: ACTIVE — makes the DELETE request
      const saActor = await createSA({ suffix: `${suffix}-actor`, name: 'RevokeActor' });
      // SA_target: INACTIVE — the one being revoked
      const saTarget = await createSA({ suffix: `${suffix}-target`, name: 'RevokeInactive', status: 'INACTIVE' });

      const res = await request(app)
        .delete(`/api/admin/admins/${saTarget.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
        .set('Authorization', `Bearer ${saActor.token}`);

      // count(ACTIVE, id≠saTarget) = 1 (saActor) → guard passes → 200
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const targetAfter = await prisma.user.findUnique({ where: { id: saTarget.id }, select: { role: true } });
      expect(targetAfter?.role).toBe('ADMIN');
    });
  });
});

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }
  return jwt.sign(
    { id: userId, email: `test-${userId}@test.local`, role },
    jwtSecret,
    { expiresIn: '15m' },
  );
}
