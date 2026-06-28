/**
 * Integration tests for BC-REAUDIT-SUPER-EXPIRY-1 — three LOW expiry handling fixes.
 *
 * Tests cover:
 * - FINDING 1: expiresAt column is read (not recomputed from createdAt + TTL)
 * - FINDING 2: Duplicate guard scoped to live rows (expired ones don't block re-submission)
 * - FINDING 3: DELETE /pending-super/:id suppresses email when request expired
 */

import request from 'supertest';
import { createTestApp } from './setup';
import { prisma } from '../src/lib/prisma';
import { AuthRequest } from '../src/middleware/auth.middleware';

// Mock email service to track calls
let emailSendCalls: Array<{ to: string; subject: string }> = [];
jest.mock('../src/services/email.service', () => ({
  emailService: {
    sendEmail: (opts: { to: string; subject: string; html?: string; text?: string }) => {
      emailSendCalls.push({ to: opts.to, subject: opts.subject });
      return Promise.resolve();
    },
  },
}));

describe('BC-REAUDIT-SUPER-EXPIRY-1: Pending Super Admin Expiry Handling', () => {
  let app: any;
  let superAdminToken: string;
  let initiatorId: string;
  let approverId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Pre-cleanup: remove stale test users from previous runs.
    await prisma.pendingSuperAdminRequest.deleteMany({
      where: { requestedBy: { email: { in: ['initiator@test.local', 'approver@test.local'] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['initiator@test.local', 'approver@test.local'] } },
    });

    // Create two SUPER_ADMINs
    const initiator = await prisma.user.create({
      data: {
        email: 'initiator@test.local',
        firstName: 'Initiator',
        lastName: 'SA',
        phone: '+359000000000',
        passwordHash: 'hashed_password',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    initiatorId = initiator.id;
    superAdminToken = generateTestToken(initiator.id, 'SUPER_ADMIN');

    const approver = await prisma.user.create({
      data: {
        email: 'approver@test.local',
        firstName: 'Approver',
        lastName: 'SA',
        phone: '+359000000001',
        passwordHash: 'hashed_password',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    approverId = approver.id;
  });

  afterEach(() => {
    emailSendCalls = [];
  });

  afterAll(async () => {
    await app.close();
    // Clean up test users and their pending requests.
    await prisma.pendingSuperAdminRequest.deleteMany({
      where: { requestedBy: { email: { in: ['initiator@test.local', 'approver@test.local'] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['initiator@test.local', 'approver@test.local'] } },
    });
    await prisma.$disconnect();
  });

  describe('FINDING 1: Use persisted expiresAt column (not recomputed TTL)', () => {
    it('should reject approval on expired request using persisted expiresAt (not createdAt + TTL)', async () => {
      // Create a request with expiresAt in the past
      const request = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'newsa@test.local',
          firstName: 'New',
          lastName: 'Super',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          requestedById: initiatorId,
        },
      });

      // Attempt to approve the expired request
      const res = await request(app)
        .post(`/api/admin/admins/pending-super/${request.id}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({});

      // Should return 410 Gone because expiresAt is in the past
      expect(res.status).toBe(410);
      expect(res.body.error).toContain('expired');
    });

    it('should include expiresAt in GET /pending-super list', async () => {
      // Create a live request
      const request = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'liveuser@test.local',
          firstName: 'Live',
          lastName: 'User',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // Expires in 72h
          requestedById: initiatorId,
        },
      });

      const res = await request(app)
        .get('/api/admin/admins/pending-super')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const listedRequest = res.body.requests.find((r: any) => r.id === request.id);
      expect(listedRequest).toBeDefined();
      expect(listedRequest.expiresAt).toBeDefined(); // Should have expiresAt in response
    });

    it('should exclude expired requests from GET /pending-super list using expiresAt', async () => {
      // Create an expired request
      await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'expired@test.local',
          firstName: 'Expired',
          lastName: 'Request',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          requestedById: initiatorId,
        },
      });

      const res = await request(app)
        .get('/api/admin/admins/pending-super')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      // Expired request should not appear in list
      const expiredInList = res.body.requests.some((r: any) => r.email === 'expired@test.local');
      expect(expiredInList).toBe(false);
    });

    it('should include live requests in GET /pending-all using persisted expiresAt', async () => {
      // Create a live request
      const request = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'pendingall@test.local',
          firstName: 'Pending',
          lastName: 'All',
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // Expires in 72h
          requestedById: initiatorId,
        },
      });

      const res = await request(app)
        .get('/api/admin/admins/pending-all')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const listedRequest = res.body.pendingSuperAdmins.find((r: any) => r.id === request.id);
      expect(listedRequest).toBeDefined();
    });
  });

  describe('FINDING 2: Duplicate guard scoped to live rows only', () => {
    it('should allow re-submission of email after original request expires', async () => {
      const testEmail = 'resubmit@test.local';

      // Create an expired request
      await prisma.pendingSuperAdminRequest.create({
        data: {
          email: testEmail,
          firstName: 'First',
          lastName: 'Attempt',
          passwordHash: 'hash1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          requestedById: initiatorId,
        },
      });

      // Attempt to create a new request for the same email
      // With FINDING 2 fix, this should succeed (expired request doesn't block)
      const res = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'Second',
          lastName: 'Attempt',
          phone: '+359000000010',
          password: 'TestPassword123!',
          roleKey: 'SUPER_ADMIN',
        });

      expect(res.status).toBe(202);
      expect(res.body.pending).toBe(true);
    });

    it('should block re-submission if live request exists', async () => {
      const testEmail = 'liveblock@test.local';

      // Create a live request
      await prisma.pendingSuperAdminRequest.create({
        data: {
          email: testEmail,
          firstName: 'Live',
          lastName: 'Block',
          passwordHash: 'hash1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // Expires in 72h
          requestedById: initiatorId,
        },
      });

      // Attempt to create a new request for the same email
      // This should fail because a live request exists
      const res = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          email: testEmail,
          firstName: 'Second',
          lastName: 'Attempt',
          phone: '+359000000010',
          password: 'TestPassword123!',
          roleKey: 'SUPER_ADMIN',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });
  });

  describe('FINDING 3: Suppress email on delete if request already expired', () => {
    it('should send email when cancelling a live request', async () => {
      emailSendCalls = [];

      // Create a live request
      const request = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'cancellive@test.local',
          firstName: 'Cancel',
          lastName: 'Live',
          passwordHash: 'hash1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // Expires in 72h
          requestedById: initiatorId,
        },
      });

      // Delete (cancel) the request as the initiator
      const appToken = generateTestToken(initiatorId, 'SUPER_ADMIN');
      const res = await request(app)
        .delete(`/api/admin/admins/pending-super/${request.id}`)
        .set('Authorization', `Bearer ${appToken}`);

      expect(res.status).toBe(200);
      // Email should have been sent (one for approval notification in prior test + one for this)
      expect(emailSendCalls.length).toBeGreaterThan(0);
      const cancelEmail = emailSendCalls.find((e) => e.to === 'initiator@test.local');
      expect(cancelEmail).toBeDefined();
    });

    it('should NOT send email when cancelling an expired request', async () => {
      emailSendCalls = [];

      // Create an expired request
      const request = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'cancelexpired@test.local',
          firstName: 'Cancel',
          lastName: 'Expired',
          passwordHash: 'hash1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          requestedById: initiatorId,
        },
      });

      // Delete (cancel) the request as the initiator
      const appToken = generateTestToken(initiatorId, 'SUPER_ADMIN');
      const countBefore = emailSendCalls.length;
      const res = await request(app)
        .delete(`/api/admin/admins/pending-super/${request.id}`)
        .set('Authorization', `Bearer ${appToken}`);

      expect(res.status).toBe(200);
      // No new email should have been sent for expired request
      expect(emailSendCalls.length).toBe(countBefore);
    });
  });

  describe('Integration: Combined scenarios', () => {
    it('should handle full lifecycle: create -> expire -> re-submit -> approve', async () => {
      const testEmail = 'lifecycle@test.local';
      const initiatorApp = generateTestToken(initiatorId, 'SUPER_ADMIN');
      const approverApp = generateTestToken(approverId, 'SUPER_ADMIN');

      // Step 1: Create request
      const createRes = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${initiatorApp}`)
        .send({
          email: testEmail,
          firstName: 'Life',
          lastName: 'Cycle',
          phone: '+359000000011',
          password: 'TestPassword123!',
          roleKey: 'SUPER_ADMIN',
        });
      expect(createRes.status).toBe(202);
      const requestId1 = createRes.body.request.id;

      // Step 2: Expire the request
      await prisma.pendingSuperAdminRequest.update({
        where: { id: requestId1 },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      // Step 3: Verify approval fails with 410
      const approveExpiredRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId1}/approve`)
        .set('Authorization', `Bearer ${approverApp}`)
        .send({});
      expect(approveExpiredRes.status).toBe(410);

      // Step 4: Re-submit (should succeed because first request is expired)
      const resubmitRes = await request(app)
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${initiatorApp}`)
        .send({
          email: testEmail,
          firstName: 'Life',
          lastName: 'Cycle',
          phone: '+359000000011',
          password: 'TestPassword123!',
          roleKey: 'SUPER_ADMIN',
        });
      expect(resubmitRes.status).toBe(202);
      const requestId2 = resubmitRes.body.request.id;
      expect(requestId2).not.toBe(requestId1); // Different request

      // Step 5: Approve the new request (should succeed)
      const approveNewRes = await request(app)
        .post(`/api/admin/admins/pending-super/${requestId2}/approve`)
        .set('Authorization', `Bearer ${approverApp}`)
        .send({});
      expect(approveNewRes.status).toBe(201);
    });
  });
});

function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  // In real tests, generate a proper JWT — this is a placeholder
  // The actual test setup should provide a token generation utility
  return `Bearer_${userId}_${role}`;
}
