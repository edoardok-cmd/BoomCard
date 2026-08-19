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
import { genTestPhone } from './helpers/test-utils';

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
        phone: genTestPhone(),
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
        phone: genTestPhone(),
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
    // createTestApp() (tests/setup.ts) returns the plain Express app, not a
    // listening server — supertest's persistent-server wrapper owns the
    // actual http.Server and closes it at the file boundary. app.close is
    // not a function; calling it here was a stale test-infra bug (BC-QA-042).
    // Clean up test users and their pending requests. This previously only
    // covered the initiator/approver fixtures — every OTHER fixed literal
    // email this file's individual tests create (newsa@test.local,
    // liveuser@test.local, lifecycle@test.local, and the User row that
    // 'should handle full lifecycle...' approves into existence) was left
    // behind, so the SECOND run of this file hits real uniqueness conflicts
    // (a stale User already owning 'lifecycle@test.local' 409s the create
    // step) rather than exercising the scenario under test (BC-QA-042).
    // BC-QA-042 review round 1 (MEDIUM): this list still only covered 5 of
    // the ~11 distinct @test.local emails the file's individual tests
    // create — expired@test.local, pendingall@test.local,
    // resubmit@test.local, liveblock@test.local, cancellive@test.local, and
    // cancelexpired@test.local were all missing, so a second run of this
    // file hits a real unhandled unique-constraint error (PendingSuperAdminRequest.email
    // is @unique) on whichever of those the previous run left behind.
    const testLocalEmails = [
      'initiator@test.local',
      'approver@test.local',
      'newsa@test.local',
      'liveuser@test.local',
      'expired@test.local',
      'pendingall@test.local',
      'resubmit@test.local',
      'liveblock@test.local',
      'cancellive@test.local',
      'cancelexpired@test.local',
      'lifecycle@test.local',
    ];
    await prisma.pendingSuperAdminRequest.deleteMany({
      where: {
        OR: [
          { requestedBy: { email: { in: testLocalEmails } } },
          { email: { in: testLocalEmails } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { email: { in: testLocalEmails } },
    });
    await prisma.$disconnect();
  });

  describe('FINDING 1: Use persisted expiresAt column (not recomputed TTL)', () => {
    it('should reject approval on expired request using persisted expiresAt (not createdAt + TTL)', async () => {
      // BC-QA-042: every `const request = await prisma.pendingSuperAdminRequest
      // .create(...)` in this file SHADOWED the top-level `import request from
      // 'supertest'`, so every subsequent `request(app)` call in the same
      // scope threw "TypeError: request is not a function" — renamed to
      // pendingReq throughout.
      // Create a request with expiresAt in the past
      const pendingReq = await prisma.pendingSuperAdminRequest.create({
        data: {
          email: 'newsa@test.local',
          firstName: 'New',
          lastName: 'Super',
          // POST /pending-super/:id/approve 422s before ever reaching the
          // expiry check (FINDING 1, under test here) if firstName,
          // lastName, or phone is missing — the test only set two of the
          // three (BC-QA-042).
          phone: genTestPhone(),
          passwordHash: 'hash',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          requestedById: initiatorId,
        },
      });

      // Attempt to approve the expired request
      const res = await request(app)
        .post(`/api/admin/admins/pending-super/${pendingReq.id}/approve`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({});

      // Should return 410 Gone because expiresAt is in the past
      expect(res.status).toBe(410);
      expect(res.body.error).toContain('expired');
    });

    it('should include expiresAt in GET /pending-super list', async () => {
      // Create a live request
      const pendingReq = await prisma.pendingSuperAdminRequest.create({
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
      const listedRequest = res.body.requests.find((r: any) => r.id === pendingReq.id);
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
      const pendingReq = await prisma.pendingSuperAdminRequest.create({
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
      const listedRequest = res.body.pendingSuperAdmins.find((r: any) => r.id === pendingReq.id);
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
          phone: genTestPhone(),
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
          phone: genTestPhone(),
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
      const pendingReq = await prisma.pendingSuperAdminRequest.create({
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
        .delete(`/api/admin/admins/pending-super/${pendingReq.id}`)
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
      const pendingReq = await prisma.pendingSuperAdminRequest.create({
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
        .delete(`/api/admin/admins/pending-super/${pendingReq.id}`)
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
          phone: genTestPhone(),
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
          phone: genTestPhone(),
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

// BC-QA-042: this was a placeholder (`Bearer_${userId}_${role}`) rather than
// a real signed JWT — authenticate() (src/middleware/auth.middleware.ts)
// calls jwt.verify() on it, so every request in this file 401'd before ever
// reaching the route/business logic under test.
function generateTestToken(userId: string, role: 'ADMIN' | 'SUPER_ADMIN'): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '24h',
  });
}
