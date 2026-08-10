/**
 * Integration tests for BC-ADMIN-SPEC-REAUDIT-SA-GUARD-RACES-1
 *
 * Tests cover three TOCTOU (time-of-check, time-of-use) race conditions that can
 * leave zero active Super-Admins or bypass 2-of-N dual-approval requirement:
 *
 * DEFECT 1 (last-active-SA guard race in PATCH /status):
 *   Two concurrent archive requests can both see 2 active SAs, both think archiving
 *   one leaves 1 active, both updates commit, leaving 0 active SAs.
 *   Fix: Wrap guard + write in Serializable transaction.
 *
 * DEFECT 2 (role-revoke guard race in DELETE /roles/:roleKey):
 *   Same TOCTOU pattern — two concurrent revoke requests can both see >0 other
 *   non-archived SAs, both think revoking leaves ≥1, both commit, leaving 0 non-archived.
 *   Fix: Wrap SUPER_ADMIN revoke guard + delete in Serializable transaction with retry.
 *
 * DEFECT 3 (bootstrap quorum race in POST /pending-super/:id/approve):
 *   If only 1 SA exists and two self-approve requests fire concurrently, one can
 *   slip through and violate 2-of-N rule.
 *   Fix: Wrap bootstrap quorum check + user.create in Serializable transaction.
 *
 * Tests use Promise.all to fire concurrent mutations and assert:
 * - Exactly one succeeds (409 or success, not both success)
 * - Invariant holds after both requests complete (≥1 non-archived SUPER_ADMIN remains)
 *
 * Test Setup:
 *   - Token generation: generateTestToken() creates valid JWTs signed with JWT_SECRET
 *   - Auth middleware: authenticate() verifies JWTs with jwt.verify() in the normal path
 *   - No mocking: tests run against the real auth middleware stack
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { AdminRoleKey, UserStatus } from '@prisma/client';
import { genTestPhone } from './helpers/test-utils';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-SPEC-REAUDIT-SA-GUARD-RACES-1: TOCTOU Race Prevention', () => {
  let app: any;
  let superAdminRoleId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Lookup SUPER_ADMIN role
    const superAdminRole = await prisma.adminRole.findUnique({
      where: { key: AdminRoleKey.SUPER_ADMIN },
    });
    if (!superAdminRole) {
      throw new Error('SUPER_ADMIN role not found — run seed-permissions first');
    }
    superAdminRoleId = superAdminRole.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('DEFECT 1: PATCH /status last-active-SA guard race', () => {
    it('should prevent leaving zero active SAs when two concurrent archive requests race', async () => {
      // Setup: create 3 ACTIVE SUPER_ADMINs
      const [sa1, sa2, sa3] = await Promise.all([
        prisma.user.create({
          data: {
            email: `race-defect1-sa1-${Date.now()}@test.local`,
            firstName: 'Race1SA1',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect1-sa2-${Date.now()}@test.local`,
            firstName: 'Race1SA2',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect1-sa3-${Date.now()}@test.local`,
            firstName: 'Race1SA3',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
      ]);

      // sa3 is the archiver (will archive sa1 and sa2 concurrently)
      const sa3Token = generateTestToken(sa3.id, 'SUPER_ADMIN');

      // Fire two concurrent archive requests (sa1 and sa2, both by sa3)
      // Both will see 3 ACTIVE SAs initially.
      // Without Serializable isolation, both might think:
      //   "I'm archiving one, leaving 2 others active" → both succeed
      //   Result: 0 active SAs (BUG)
      // With Serializable isolation, one succeeds, one gets 409 or serialization conflict.
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/admin/admins/${sa1.id}/status`)
          .set('Authorization', `Bearer ${sa3Token}`)
          .send({ status: 'ARCHIVED', reason: 'Test race condition 1' }),
        request(app)
          .patch(`/api/admin/admins/${sa2.id}/status`)
          .set('Authorization', `Bearer ${sa3Token}`)
          .send({ status: 'ARCHIVED', reason: 'Test race condition 1' }),
      ]);

      // Exactly one should succeed (status 200), one should get 409
      const results = [res1.status, res2.status].sort();
      expect(results).toEqual([200, 409]);

      // Invariant: at least 1 ACTIVE SUPER_ADMIN remains (sa3 or one of sa1/sa2 if the archive was rejected)
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      expect(activeSuperAdmins).toBeGreaterThanOrEqual(1);

      // Verify: exactly one was archived
      const [sa1After, sa2After] = await Promise.all([
        prisma.user.findUnique({ where: { id: sa1.id }, select: { status: true } }),
        prisma.user.findUnique({ where: { id: sa2.id }, select: { status: true } }),
      ]);
      const archivedCount = [sa1After, sa2After].filter((u) => u?.status === 'ARCHIVED').length;
      expect(archivedCount).toBe(1);
    });
  });

  describe('DEFECT 2: DELETE /roles/:roleKey revoke guard race', () => {
    it('should prevent leaving zero active SAs when two concurrent revoke requests race', async () => {
      // Setup: create 3 ACTIVE SUPER_ADMINs with SUPER_ADMIN role
      const [sa1, sa2, sa3] = await Promise.all([
        prisma.user.create({
          data: {
            email: `race-defect2-sa1-${Date.now()}@test.local`,
            firstName: 'Race2SA1',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect2-sa2-${Date.now()}@test.local`,
            firstName: 'Race2SA2',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
        prisma.user.create({
          data: {
            email: `race-defect2-sa3-${Date.now()}@test.local`,
            firstName: 'Race2SA3',
            lastName: 'Test',
            phone: genTestPhone(),
            passwordHash: 'hashed_password',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            emailVerified: true,
            adminRoles: { create: { roleId: superAdminRoleId } },
          },
        }),
      ]);

      // sa3 is the revoker (will revoke sa1's and sa2's SUPER_ADMIN roles concurrently)
      const sa3Token = generateTestToken(sa3.id, 'SUPER_ADMIN');

      // Fire two concurrent revoke requests (sa1's and sa2's SUPER_ADMIN roles, both by sa3)
      // Both will see 3 ACTIVE SUPER_ADMINs initially.
      // Without Serializable isolation:
      //   remainingActiveSupers (excluding sa1) = 2 → succeed
      //   remainingActiveSupers (excluding sa2) = 2 → succeed
      //   Result: 0 active SUPER_ADMINs (BUG)
      // With Serializable isolation, one succeeds, one gets 409.
      const [res1, res2] = await Promise.all([
        request(app)
          .delete(`/api/admin/admins/${sa1.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
          .set('Authorization', `Bearer ${sa3Token}`),
        request(app)
          .delete(`/api/admin/admins/${sa2.id}/roles/${AdminRoleKey.SUPER_ADMIN}`)
          .set('Authorization', `Bearer ${sa3Token}`),
      ]);

      // Exactly one should succeed (status 200), one should get 409
      const results = [res1.status, res2.status].sort();
      expect(results).toEqual([200, 409]);

      // Invariant: at least 1 ACTIVE SUPER_ADMIN remains
      const activeSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      expect(activeSuperAdmins).toBeGreaterThanOrEqual(1);

      // Verify: exactly one had SUPER_ADMIN role revoked
      const [sa1After, sa2After] = await Promise.all([
        prisma.user.findUnique({
          where: { id: sa1.id },
          select: { role: true, adminRoles: { select: { role: { select: { key: true } } } } },
        }),
        prisma.user.findUnique({
          where: { id: sa2.id },
          select: { role: true, adminRoles: { select: { role: { select: { key: true } } } } },
        }),
      ]);

      // Count how many were downgraded from SUPER_ADMIN to ADMIN (role change) or had role revoked
      const downgradedCount = [sa1After, sa2After].filter(
        (u) => u?.role === 'ADMIN' || !u?.adminRoles.some((ar) => ar.role.key === AdminRoleKey.SUPER_ADMIN),
      ).length;
      expect(downgradedCount).toBe(1);
    });
  });

  describe('DEFECT 3: POST /pending-super/:id/approve bootstrap quorum race', () => {
    it('should prevent bypassing 2-of-N when two concurrent self-approvals race with only 1 existing SA', async () => {
      // Setup: create exactly 1 ACTIVE SUPER_ADMIN
      // Use a stable test ID suffix to avoid timestamp collision issues at millisecond boundaries
      const testId = `defect3-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const existingSA = await prisma.user.create({
        data: {
          email: `race-existing-sa-${testId}@test.local`,
          firstName: 'ExistingSA',
          lastName: 'Test',
          phone: genTestPhone(),
          passwordHash: 'hashed_password',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          adminRoles: { create: { roleId: superAdminRoleId } },
        },
      });
      const existingSAToken = generateTestToken(existingSA.id, 'SUPER_ADMIN');

      // Create two pending SUPER_ADMIN requests from the sole existing SA
      const [pending1, pending2] = await Promise.all([
        prisma.pendingSuperAdminRequest.create({
          data: {
            email: `race-new-sa1-${testId}@test.local`,
            firstName: 'NewSA1',
            lastName: 'Test',
            phone: null,
            passwordHash: 'dummy',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            requestedBy: { connect: { id: existingSA.id } },
          },
        }),
        prisma.pendingSuperAdminRequest.create({
          data: {
            email: `race-new-sa2-${testId}@test.local`,
            firstName: 'NewSA2',
            lastName: 'Test',
            phone: null,
            passwordHash: 'dummy',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
            requestedBy: { connect: { id: existingSA.id } },
          },
        }),
      ]);

      // Fire two concurrent self-approvals (existingSA approves both pending requests)
      // Both will see existingSuperAdminCount = 1 initially.
      // Spec §3.9: "if only one Super Admin EXISTS" → bootstrap exception allows self-approval.
      // Without Serializable isolation:
      //   Both might think: "1 existing SA (myself) → I can self-approve" → both succeed
      //   Result: 3 total SAs (violated 2-of-N: 2nd SA created without 2nd human approval)
      // With Serializable isolation, one succeeds (quorum still 1), second gets rejection:
      //   After first succeeds, existingSuperAdminCount becomes 2, so 2nd fails with 403.
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/admin/admins/pending-super/${pending1.id}/approve`)
          .set('Authorization', `Bearer ${existingSAToken}`),
        request(app)
          .post(`/api/admin/admins/pending-super/${pending2.id}/approve`)
          .set('Authorization', `Bearer ${existingSAToken}`),
      ]);

      // Expected outcome:
      // - One succeeds (201 Created)
      // - One either gets 403 (self-approval now forbidden) or 409 (serialization conflict)
      // The 409 (not 403) is the more likely outcome under Serializable isolation + concurrent race
      const results = [res1.status, res2.status];
      const hasSuccess = results.includes(201);
      const hasBlockOrConflict = results.includes(403) || results.includes(409);

      expect(hasSuccess).toBe(true);
      expect(hasBlockOrConflict).toBe(true);
      expect(results[0] !== results[1]).toBe(true); // They should differ

      // Invariant: exactly one of the pending requests resulted in a created SUPER_ADMIN
      const createdSuperAdmins = await prisma.user.count({
        where: {
          email: {
            in: [
              `race-new-sa1-${testId}@test.local`,
              `race-new-sa2-${testId}@test.local`,
            ],
          },
          role: 'SUPER_ADMIN',
        },
      });

      // Should be 0 or 1 (not 2, which would violate 2-of-N)
      expect(createdSuperAdmins).toBeLessThanOrEqual(1);

      // Verify total SUPER_ADMIN count: original (1) + at most 1 new = at most 2
      // But actually, if the race was properly prevented, we should have:
      // - existingSA (1)
      // - One newly created SA (1)
      // - One rejected/not-created (0)
      // = 2 total (this is correct: 2-of-N rule preserved)
      const totalSuperAdmins = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      expect(totalSuperAdmins).toBeLessThanOrEqual(2);
      expect(totalSuperAdmins).toBeGreaterThanOrEqual(1);
    });
  });
});

/**
 * Generate a valid JWT token for integration tests.
 *
 * This creates a real JWT signed with JWT_SECRET, allowing the auth middleware to
 * verify it in the normal path without mocking. The token carries minimal claims
 * required for the auth middleware to accept it:
 *   - id: user ID (required)
 *   - email: user email (required for some middleware checks)
 *   - role: 'ADMIN' or 'SUPER_ADMIN' (required for authorization gates)
 *
 * The token is NOT tied to an actual database User row on creation; the
 * middleware will verify the JWT and accept req.user = decoded. The caller
 * is responsible for ensuring the database User exists (if needed by the route).
 *
 * Tokens expire in 15 minutes (matching JWT_EXPIRES_IN in auth.service.ts);
 * extend expiresIn if tests need tokens to persist longer.
 */
function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET env var is not set — tests cannot generate valid tokens');
  }

  const payload = {
    id: userId,
    email: `test-${userId}@test.local`,
    role,
  };

  const token = jwt.sign(payload, jwtSecret, {
    expiresIn: '15m',
  });

  return token;
}
