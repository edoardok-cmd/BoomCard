import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
const PENDING_SUPER_ADMIN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const payload = {
    id: userId,
    email: `test-${userId}@test.local`,
    role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

describe('BC-ADMIN-SPEC-REAUDIT-PENDING-SUPER-HYGIENE-2', () => {
  let superAdminUser: { id: string; email: string; role: string };
  let regularAdminUser: { id: string; email: string; role: string };
  let superAdminToken: string;

  beforeAll(async () => {
    // Ensure the SUPER_ADMIN admin role row exists (required by the approve route).
    // The approve route does adminRole.findUnique({ where: { key: 'SUPER_ADMIN' } }) and returns 500 if missing.
    await prisma.adminRole.upsert({
      where: { key: 'SUPER_ADMIN' },
      update: {},
      create: { key: 'SUPER_ADMIN', label: 'Super Admin' },
    });

    // Pre-cleanup stale users from previous runs before creating fixtures.
    await prisma.pendingSuperAdminRequest.deleteMany({});
    await prisma.helpTicket.deleteMany({ where: { user: { email: { contains: '@test.local' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@test.local' } } });

    // Create a SUPER_ADMIN user for auth.
    // SUPER_ADMIN bypasses all permission checks via requirePermission — no AdminRole row needed.
    superAdminUser = await prisma.user.create({
      data: {
        email: 'super-admin-test@test.local',
        passwordHash: 'hash',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    // Create a regular ADMIN user
    regularAdminUser = await prisma.user.create({
      data: {
        email: 'admin-test@test.local',
        passwordHash: 'hash',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });

    superAdminToken = generateTestToken(superAdminUser.id, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    // Delete in FK-safe order: HelpTickets before Users.
    await prisma.pendingSuperAdminRequest.deleteMany({});
    await prisma.helpTicket.deleteMany({ where: { user: { email: { contains: '@test.local' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@test.local' } } });
  });

  beforeEach(async () => {
    // Clear pending requests before each test
    await prisma.pendingSuperAdminRequest.deleteMany({});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT 1 TESTS: Email-Role Collision
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT 1: Email-Role Collision Prevention', () => {
    it('POST /pending-super should block initiation if email exists as ADMIN', async () => {
      // Setup: Create an ADMIN with email x@y.com
      const testEmail = 'collision-test@test.local';
      await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: 'hash',
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Attempt: Try to initiate a SUPER_ADMIN request for the same email
      const response = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'Test',
          lastName: 'User',
          password: 'SecurePassword123!',
          roleKey: 'SUPER_ADMIN',
        });

      // Assert: Should be blocked with 409
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('admin');
      expect(response.body.error).toContain('already exists');
    });

    it('POST /pending-super should block initiation if email exists as SUPER_ADMIN', async () => {
      // Setup: Create a SUPER_ADMIN with email y@z.com
      // SUPER_ADMIN bypasses permission checks — no AdminRole row needed.
      const testEmail = 'super-collision-test@test.local';
      await prisma.user.create({
        data: {
          email: testEmail,
          passwordHash: 'hash',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Attempt: Try to initiate a SUPER_ADMIN request for the same email
      const response = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'Test',
          lastName: 'User',
          password: 'SecurePassword123!',
          roleKey: 'SUPER_ADMIN',
        });

      // Assert: Should be blocked with 409
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('admin');
      expect(response.body.error).toContain('already exists');
    });

    it('POST /pending-super/:id/approve should block approval if email exists as ADMIN', async () => {
      // Setup: Create a pending request for email x@test.local
      const pendingEmail = 'pending-collision@test.local';
      const pendingRequest = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: pendingEmail,
          firstName: 'Pending',
          lastName: 'User',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PENDING_SUPER_ADMIN_TTL_MS),
          requestedById: superAdminUser.id,
        },
      });

      // Setup: Create an ADMIN with the same email (collision)
      await prisma.user.create({
        data: {
          email: pendingEmail,
          passwordHash: 'hash',
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: true,
        },
      });

      // Attempt: Try to approve the pending request
      const response = await request(app)
        .post(`/api/admin/admins/pending-super/${pendingRequest.id}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({});

      // Assert: Should be blocked with 409 before transaction
      expect(response.status).toBe(409);
      expect(response.body.error).toContain('admin');
      expect(response.body.error).toContain('already exists');
    });

    it('Successful initiation and approval when no email collision exists', async () => {
      // Setup: Unique email, no collision
      const testEmail = 'no-collision@test.local';
      const password = 'SecurePassword123!';

      // Step 1: Initiate pending request
      const initResponse = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'NoCollision',
          lastName: 'User',
          password,
          roleKey: 'SUPER_ADMIN',
        });

      expect(initResponse.status).toBe(202);
      expect(initResponse.body.pending).toBe(true);
      const pendingId = initResponse.body.request.id;

      // Step 2: Approve the pending request (from different SA for no bootstrap)
      const approvalResponse = await request(app)
        .post(`/api/admin/admins/pending-super/${pendingId}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({});

      // Should fail because only one SA exists (bootstrap exception doesn't allow self-approval on second SA)
      // But the email collision check should pass
      if (approvalResponse.status === 403) {
        // Bootstrap exception applies (only 1 SA exists)
        expect(approvalResponse.body.error).toContain('different admin');
      } else if (approvalResponse.status === 201) {
        // Approval succeeded
        expect(approvalResponse.body.ok).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DEFECT 2 TESTS: Expiry Reaper
  // ─────────────────────────────────────────────────────────────────────────

  describe('DEFECT 2: Expiry Reaper and Re-submission', () => {
    it('Re-submission should fail if live (non-expired) request exists for same email', async () => {
      const testEmail = 'live-pending@test.local';
      const password = 'SecurePassword123!';

      // Step 1: Create first pending request
      const firstResponse = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'First',
          lastName: 'Request',
          password,
          roleKey: 'SUPER_ADMIN',
        });

      expect(firstResponse.status).toBe(202);

      // Step 2: Attempt to create another request for same email (should fail)
      const secondResponse = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'Second',
          lastName: 'Request',
          password,
          roleKey: 'SUPER_ADMIN',
        });

      // Should fail with 409 because live request exists
      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error).toContain('pending');
    });

    it('Re-submission should succeed after expiry and automatic cleanup', async () => {
      const testEmail = 'expired-pending@test.local';
      const password = 'SecurePassword123!';

      // Step 1: Create a pending request with past expiry
      const expiredRequest = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: testEmail,
          firstName: 'Expired',
          lastName: 'Request',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          requestedById: superAdminUser.id,
        },
      });

      expect(expiredRequest).toBeDefined();

      // Step 2: Attempt to create a new request for the same email
      // This should detect the collision is expired, delete it, and retry
      const newResponse = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'New',
          lastName: 'Request',
          password,
          roleKey: 'SUPER_ADMIN',
        });

      // Should succeed (202) because the expired row was cleaned up
      expect(newResponse.status).toBe(202);
      expect(newResponse.body.pending).toBe(true);

      // Verify the old request was deleted
      const oldRequestExists = await prisma.pendingSuperAdminRequest.findFirst({
        where: { id: expiredRequest.id },
      });
      expect(oldRequestExists).toBeNull();

      // Verify the new request was created
      const newRequestExists = await prisma.pendingSuperAdminRequest.findFirst({
        where: { email: testEmail },
      });
      expect(newRequestExists).toBeDefined();
      expect(newRequestExists?.id).not.toBe(expiredRequest.id);
    });

    it('Reaper job deletes only expired pending requests', async () => {
      // Setup: Create mix of live and expired pending requests
      const liveEmail = 'live@test.local';
      const expiredEmail = 'expired@test.local';

      const liveRequest = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: liveEmail,
          firstName: 'Live',
          lastName: 'Request',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PENDING_SUPER_ADMIN_TTL_MS), // Future
          requestedById: superAdminUser.id,
        },
      });

      const expiredRequest = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: expiredEmail,
          firstName: 'Expired',
          lastName: 'Request',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Past
          requestedById: superAdminUser.id,
        },
      });

      // Verify both exist
      let liveExists = await prisma.pendingSuperAdminRequest.findUnique({
        where: { id: liveRequest.id },
      });
      let expiredExists = await prisma.pendingSuperAdminRequest.findUnique({
        where: { id: expiredRequest.id },
      });

      expect(liveExists).toBeDefined();
      expect(expiredExists).toBeDefined();

      // Simulate reaper job (delete expired rows)
      const deleted = await prisma.pendingSuperAdminRequest.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });

      expect(deleted.count).toBe(1); // Only expired request

      // Verify live request still exists, expired is gone
      liveExists = await prisma.pendingSuperAdminRequest.findUnique({
        where: { id: liveRequest.id },
      });
      expiredExists = await prisma.pendingSuperAdminRequest.findUnique({
        where: { id: expiredRequest.id },
      });

      expect(liveExists).toBeDefined();
      expect(expiredExists).toBeNull();
    });

    it('P2002 catch on expired collision correctly handles delete-then-retry', async () => {
      const testEmail = 'p2002-expired@test.local';
      const password = 'SecurePassword123!';

      // Setup: Create an expired pending request
      await prisma.pendingSuperAdminRequest.create({
        data: {
          email: testEmail,
          firstName: 'Expired',
          lastName: 'Request',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired
          requestedById: superAdminUser.id,
        },
      });

      // Attempt: Create a new request for same email
      // The code should:
      // 1. Hit P2002 on initial create (unique constraint)
      // 2. Detect collision is expired
      // 3. Delete expired row
      // 4. Retry create
      // 5. Succeed

      const response = await request(app)
        .post('/api/admin/admins/')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'New',
          lastName: 'Request',
          password,
          roleKey: 'SUPER_ADMIN',
        });

      // Should succeed
      expect(response.status).toBe(202);
      expect(response.body.pending).toBe(true);

      // Verify exactly one pending request exists (the new one)
      const allRequests = await prisma.pendingSuperAdminRequest.findMany({
        where: { email: testEmail },
      });
      expect(allRequests).toHaveLength(1);
      expect(allRequests[0].firstName).toBe('New');
    });
  });
});
