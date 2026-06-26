/**
 * Integration Tests: Admin Help PATCH Cancel Backdoor Fix (BC-ADMIN-SPEC-REAUDIT3-HELP-CANCEL-BACKDOOR-1)
 *
 * Defect: The PATCH /:id endpoint allowed bypassing the accountability gate on ticket cancellation.
 * - The dedicated POST /:id/cancel endpoint correctly requires "assignee or SUPER_ADMIN"
 * - But PATCH /:id only blocked target status === 'REJECTED', not 'CANCELLED'
 * - This allowed any admin with help.write to cancel tickets without the assignee gate
 *
 * Fix: PATCH /:id now rejects target status === 'CANCELLED' with a 400 error,
 * directing callers to use POST /:id/cancel instead.
 *
 * TESTS:
 * 1. SUPER_ADMIN cannot PATCH status to CANCELLED (400) — must use POST /cancel
 * 2. Ticket remains OPEN after failed PATCH cancel attempt
 * 3. Error message directs caller to use POST /:id/cancel
 * 4. SUPER_ADMIN CAN still cancel via POST /:id/cancel (regression)
 * 5. Assigned admin CAN cancel via POST /:id/cancel (regression)
 * 6. PATCH with priority change still works (not blocked)
 * 7. PATCH to OPEN/IN_REVIEW/WAITING/RESOLVED still works
 * 8. PATCH to REJECTED still correctly rejected
 */

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
  },
  EmailService: jest.fn(),
}));

jest.mock('../../src/services/notification.service', () => ({
  __esModule: true,
  notificationService: {
    notifyAdminOps: jest.fn().mockResolvedValue(undefined),
    notifyPartnerRequestUpdate: jest.fn().mockResolvedValue(undefined),
  },
  NotificationService: jest.fn(),
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  __esModule: true,
  fireAutomation: jest.fn().mockResolvedValue(undefined),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

async function hashPw() {
  return bcrypt.hash(PASSWORD, 10);
}

async function createAdmin(role: 'ADMIN' | 'SUPER_ADMIN' = 'SUPER_ADMIN') {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Test',
      lastName: 'Admin',
      role,
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  return user;
}

async function createAdminTicket(creatorId: string, status: string = 'OPEN') {
  return prisma.helpTicket.create({
    data: {
      subject: `Test Ticket ${uid()}`,
      body: 'Test body for PATCH cancel backdoor test',
      category: 'TECHNICAL',
      priority: 'MEDIUM',
      requestType: 'SUPPORT',
      status: status as any,
      userId: creatorId,
      source: 'WEB',
    },
  });
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password, clientType: 'web' });
  return res.body.token || res.body.data?.accessToken;
}

// ─── Shared cleanup state ─────────────────────────────────────────────────────

const userIds: string[] = [];
const ticketIds: string[] = [];

afterAll(async () => {
  if (ticketIds.length) {
    await prisma.helpTicket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Admin Help PATCH Cancel Backdoor Fix (BC-ADMIN-SPEC-REAUDIT3-HELP-CANCEL-BACKDOOR-1)', () => {
  describe('PATCH /:id rejects target status CANCELLED (accountability gate)', () => {
    it('SUPER_ADMIN cannot PATCH status to CANCELLED (400) — must use POST /cancel', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      // Attempt to bypass the cancel accountability gate by using PATCH
      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.toLowerCase()).toContain('cancel');

      // Verify ticket is still OPEN
      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('OPEN');
    });

    it('Ticket remains OPEN after failed PATCH cancel attempt', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('OPEN');
    });

    it('Error message directs caller to use POST /:id/cancel', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(400);
      // Error message should mention the alternative (cancel endpoint)
      expect(res.body.error.toLowerCase()).toMatch(/cancel/i);
    });
  });

  describe('Regression: POST /:id/cancel still works correctly', () => {
    it('SUPER_ADMIN can cancel via POST /:id/cancel', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .post(`/api/admin/help/${ticket.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Test cancellation by SUPER_ADMIN' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('CANCELLED');
    });

    it('Assigned admin can cancel via POST /:id/cancel', async () => {
      const creator = await createAdmin('SUPER_ADMIN');
      const assignee = await createAdmin('SUPER_ADMIN');
      userIds.push(creator.id, assignee.id);

      const ticket = await createAdminTicket(creator.id, 'OPEN');
      ticketIds.push(ticket.id);

      // Assign ticket to the assignee
      await prisma.helpTicket.update({
        where: { id: ticket.id },
        data: { assigneeId: assignee.id },
      });

      const token = await login(assignee.email, PASSWORD);

      const res = await request(app)
        .post(`/api/admin/help/${ticket.id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'Test cancellation by assignee' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('CANCELLED');
    });

  });

  describe('PATCH /:id still works for other operations', () => {
    it('PATCH priority change still works', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ priority: 'HIGH' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.priority).toBe('HIGH');
    });

    it('PATCH to OPEN status still works', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'WAITING');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'OPEN' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('OPEN');
    });

    it('PATCH to IN_REVIEW status still works', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'IN_REVIEW' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('IN_REVIEW');
    });

    it('PATCH to WAITING status still works', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'WAITING' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('WAITING');
    });

    it('PATCH to RESOLVED status still works', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'RESOLVED' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updated = await prisma.helpTicket.findUnique({
        where: { id: ticket.id },
      });
      expect(updated?.status).toBe('RESOLVED');
    });
  });

  describe('PATCH /:id still rejects target REJECTED', () => {
    it('PATCH to REJECTED returns 400 with helpful error', async () => {
      const admin = await createAdmin('SUPER_ADMIN');
      userIds.push(admin.id);

      const ticket = await createAdminTicket(admin.id, 'OPEN');
      ticketIds.push(ticket.id);

      const token = await login(admin.email, PASSWORD);

      const res = await request(app)
        .patch(`/api/admin/help/${ticket.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'REJECTED' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.toLowerCase()).toContain('reject');
    });
  });
});
