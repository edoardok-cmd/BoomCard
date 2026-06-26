/**
 * Integration tests for BC-ADMIN-SPEC-REAUDIT3-IMP-STOP-REVAL-1
 *
 * Tests verify that stopImpersonate() re-checks admin rolesUpdatedAt against
 * the impersonation token's iat, matching the behavior of the refresh and
 * per-request middleware guards.
 *
 * Covers:
 * - stopImpersonate() fetches admin.rolesUpdatedAt
 * - stopImpersonate() compares rolesUpdatedAt against token.iat
 * - Returns 401 when admin's role is revoked (rolesUpdatedAt bumped) after token issuance
 * - Succeeds normally when rolesUpdatedAt is before or equal to token.iat
 */

import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/lib/prisma';
import jwt from 'jsonwebtoken';

jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (_opts: any) => Promise.resolve(),
  },
}));

describe('BC-ADMIN-SPEC-REAUDIT3-IMP-STOP-REVAL-1: stopImpersonate() rolesUpdatedAt Guard', () => {
  let JWT_SECRET: string;

  beforeAll(async () => {
    JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  });


  /**
   * Helper: Generate a valid JWT impersonation token
   */
  function generateImpersonationToken(
    userId: string,
    superAdminId: string,
    issuedAt?: number, // Explicitly set iat for testing staleness
  ): string {
    const iat = issuedAt ?? Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        id: userId,
        email: `user-${userId}@test.local`,
        role: 'USER',
        imp: true, // impersonation flag
        impBy: superAdminId,
        impByRole: 'SUPER_ADMIN',
        iat,
      },
      JWT_SECRET,
      { expiresIn: '15m' },
    );
    return token;
  }

  describe('stopImpersonate() rolesUpdatedAt guard', () => {
    it('should allow stop-impersonate when admin rolesUpdatedAt is null', async () => {
      // Arrange: Create a fresh SUPER_ADMIN with no rolesUpdatedAt
      const admin = await prisma.user.create({
        data: {
          email: `sa-null-roles-${Date.now()}@test.local`,
          firstName: 'Null',
          lastName: 'Roles',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
          // rolesUpdatedAt defaults to null
        },
      });

      // Create a regular user to impersonate
      const impTarget = await prisma.user.create({
        data: {
          email: `target-null-roles-${Date.now()}@test.local`,
          firstName: 'Target',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });

      // Generate token with now as iat
      const now = Math.floor(Date.now() / 1000);
      const token = generateImpersonationToken(impTarget.id, admin.id, now);

      // Act: Call stop-impersonate
      const res = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Assert: Should succeed (200 OK) because rolesUpdatedAt is null
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(admin.id);
      expect(res.body.data).toHaveProperty('accessToken');

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [admin.id, impTarget.id] } },
      });
    });

    it('should allow stop-impersonate when admin rolesUpdatedAt is before token iat', async () => {
      // Arrange: Create admin with rolesUpdatedAt set to the past
      const admin = await prisma.user.create({
        data: {
          email: `sa-old-roles-${Date.now()}@test.local`,
          firstName: 'Old',
          lastName: 'Roles',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
          rolesUpdatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        },
      });

      const impTarget = await prisma.user.create({
        data: {
          email: `target-old-roles-${Date.now()}@test.local`,
          firstName: 'Target',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });

      // Generate token with now as iat (later than rolesUpdatedAt)
      const now = Math.floor(Date.now() / 1000);
      const token = generateImpersonationToken(impTarget.id, admin.id, now);

      // Act: Call stop-impersonate
      const res = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Assert: Should succeed because rolesUpdatedAt is in the past
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(admin.id);

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [admin.id, impTarget.id] } },
      });
    });

    it('should reject stop-impersonate (401) when admin rolesUpdatedAt is after token iat', async () => {
      // Arrange: Create admin with rolesUpdatedAt set to the future
      const nowMs = Date.now();
      const futureRolesUpdateMs = nowMs + 60 * 60 * 1000; // 1 hour in the future

      const admin = await prisma.user.create({
        data: {
          email: `sa-future-roles-${Date.now()}@test.local`,
          firstName: 'Future',
          lastName: 'Roles',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
          rolesUpdatedAt: new Date(futureRolesUpdateMs),
        },
      });

      const impTarget = await prisma.user.create({
        data: {
          email: `target-future-roles-${Date.now()}@test.local`,
          firstName: 'Target',
          lastName: 'User',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });

      // Generate token with past iat (before rolesUpdatedAt)
      const pastIat = Math.floor((nowMs - 60 * 60 * 1000) / 1000); // 1 hour ago
      const token = generateImpersonationToken(impTarget.id, admin.id, pastIat);

      // Act: Call stop-impersonate
      const res = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Assert: Should fail with 401 because rolesUpdatedAt is after token iat
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('admin privileges have changed');

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [admin.id, impTarget.id] } },
      });
    });

    it('should reject stop-impersonate when admin role is revoked (rolesUpdatedAt bumped)', async () => {
      // Arrange: Create SUPER_ADMIN and generate a valid token
      const admin = await prisma.user.create({
        data: {
          email: `sa-revoke-test-${Date.now()}@test.local`,
          firstName: 'Revoke',
          lastName: 'Test',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });

      const impTarget = await prisma.user.create({
        data: {
          email: `target-revoke-test-${Date.now()}@test.local`,
          firstName: 'Target',
          lastName: 'Revoke',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });

      // Generate token when admin is still SUPER_ADMIN
      const now = Math.floor(Date.now() / 1000);
      const token = generateImpersonationToken(impTarget.id, admin.id, now);

      // Simulate role revocation: bump rolesUpdatedAt and downgrade to ADMIN
      await prisma.user.update({
        where: { id: admin.id },
        data: {
          role: 'ADMIN',
          rolesUpdatedAt: new Date(Date.now() + 1000), // 1 second in the future
        },
      });

      // Act: Try to stop impersonation
      const res = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Assert: Should be rejected with 401
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('admin privileges have changed');

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [admin.id, impTarget.id] } },
      });
    });

    it('should accept stop-impersonate when admin is still ACTIVE and no role revocation', async () => {
      // Arrange: Create ADMIN with recent but past rolesUpdatedAt
      const admin = await prisma.user.create({
        data: {
          email: `sa-active-test-${Date.now()}@test.local`,
          firstName: 'Active',
          lastName: 'Test',
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
          rolesUpdatedAt: new Date(Date.now() - 1000), // 1 second ago
        },
      });

      const impTarget = await prisma.user.create({
        data: {
          email: `target-active-test-${Date.now()}@test.local`,
          firstName: 'Target',
          lastName: 'Active',
          role: 'USER',
          status: 'ACTIVE',
          emailVerified: true,
          passwordHash: 'dummy-hash',
        },
      });

      // Generate token now (after rolesUpdatedAt)
      const now = Math.floor(Date.now() / 1000);
      const token = generateImpersonationToken(impTarget.id, admin.id, now);

      // Act: Call stop-impersonate
      const res = await request(app)
        .post('/api/auth/stop-impersonate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // Assert: Should succeed because rolesUpdatedAt is in the past
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(admin.id);
      expect(res.body.data).toHaveProperty('accessToken');

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [admin.id, impTarget.id] } },
      });
    });
  });
});
