/**
 * Integration Tests: Admin Help New Status & Claim Permissions (BC-ADMIN-SPEC-REAUDIT3-HELP-NEWSTATUS-CLAIM-2)
 *
 * FINDING 1 — Canonical "New" status is unreachable:
 *   - All ticket creation paths write status OPEN, never NEW
 *   - Filter for NEW returns empty set
 *   - Fix (Option A): Freshly-created unassigned OPEN → canonical "New"
 *   - Implementation: OPEN + assigneeId=null → requestStatus="New"
 *
 * FINDING 2 — help.write-only admin cannot claim from shared queue:
 *   - Access gate blocked help.write-without-help.read.all from unassigned tickets
 *   - Fix: Allow self-claim of unassigned tickets for any help.write holder
 *   - Protects already-claimed reassignment: still SUPER_ADMIN-only
 *
 * TESTS:
 * Finding 1:
 *   1. Freshly created OPEN unassigned ticket → requestStatus="New"
 *   2. Assigned OPEN ticket → requestStatus="In Progress"
 *   3. Filter by "New" returns both NEW enum AND unassigned OPEN
 *   4. Filter by "New" does NOT return assigned OPEN
 *   5. Filter by "In Progress" does NOT return unassigned OPEN
 *
 * Finding 2:
 *   6. help.write-only admin CAN claim unassigned ticket they don't own
 *   7. help.write-only admin CANNOT reassign claimed ticket
 *   8. help.write-only admin CANNOT reassign to explicit target
 *   9. SUPER_ADMIN can still claim unassigned tickets
 *  10. SUPER_ADMIN can still reassign claimed tickets
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
import { seedPermissions } from '../../src/services/permission.service';
import { genTestPhone } from '../helpers/test-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

async function hashPw() {
  return bcrypt.hash(PASSWORD, 10);
}

async function createAdmin(role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
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
      phone: genTestPhone(),
    },
  });

  // Grant role to ADMIN users so they inherit permissions from the ADMIN role
  // (SUPER_ADMIN bypasses permission checks, so they don't need explicit role assignment)
  if (role === 'ADMIN') {
    const adminRole = await prisma.adminRole.findUnique({
      where: { key: 'ADMIN' },
    });
    if (adminRole) {
      await prisma.userAdminRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: adminRole.id,
          },
        },
        create: {
          userId: user.id,
          roleId: adminRole.id,
        },
        update: {},
      });
    }
  }

  return user;
}

async function createTicket(creatorId: string, assigneeId?: string | null) {
  return prisma.helpTicket.create({
    data: {
      subject: `Test Ticket ${uid()}`,
      body: 'Test body for new status and claim test',
      category: 'TECHNICAL',
      priority: 'MEDIUM',
      requestType: 'SUPPORT',
      status: 'OPEN',
      userId: creatorId,
      source: 'WEB',
      ...(assigneeId !== undefined ? { assigneeId } : {}),
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

beforeAll(async () => {
  // Seed permissions so ADMIN users can be granted help.write
  await seedPermissions();
});

afterAll(async () => {
  // Cleanup test data
  for (const ticketId of ticketIds) {
    await prisma.ticketReply.deleteMany({ where: { ticketId } });
    await prisma.helpTicket.delete({ where: { id: ticketId } }).catch(() => {});
  }
  for (const userId of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// ─── FINDING 1 Tests: New Status Mapping ──────────────────────────────────────

describe('Finding 1: Canonical New Status Mapping', () => {
  test('1. Freshly created unassigned OPEN ticket has requestStatus=New', async () => {
    const admin = await createAdmin('SUPER_ADMIN');
    userIds.push(admin.id);

    const ticket = await createTicket(admin.id);
    ticketIds.push(ticket.id);

    expect(ticket.status).toBe('OPEN');
    expect(ticket.assigneeId).toBeNull();

    const token = await login(admin.email, PASSWORD);
    const res = await request(app)
      .get(`/api/admin/help/${ticket.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toBeDefined();
    expect(res.body.ticket.requestStatus).toBe('New');
  });

  test('2. Assigned OPEN ticket has requestStatus=In Progress', async () => {
    const admin1 = await createAdmin('SUPER_ADMIN');
    const admin2 = await createAdmin('SUPER_ADMIN');
    userIds.push(admin1.id, admin2.id);

    const ticket = await createTicket(admin1.id, admin2.id);
    ticketIds.push(ticket.id);

    expect(ticket.status).toBe('OPEN');
    expect(ticket.assigneeId).toBe(admin2.id);

    const token = await login(admin1.email, PASSWORD);
    const res = await request(app)
      .get(`/api/admin/help/${ticket.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket.requestStatus).toBe('In Progress');
  });

  test('3. Filter by "New" returns both NEW enum and unassigned OPEN tickets', async () => {
    const admin = await createAdmin('SUPER_ADMIN');
    userIds.push(admin.id);

    // Create a NEW enum ticket (legacy)
    const legacyTicket = await prisma.helpTicket.create({
      data: {
        subject: `Legacy NEW ticket ${uid()}`,
        body: 'Test body',
        category: 'TECHNICAL',
        priority: 'MEDIUM',
        requestType: 'SUPPORT',
        status: 'NEW',
        userId: admin.id,
        source: 'WEB',
      },
    });
    ticketIds.push(legacyTicket.id);

    // Create an unassigned OPEN ticket (should map to "New")
    const openTicket = await createTicket(admin.id);
    ticketIds.push(openTicket.id);

    const token = await login(admin.email, PASSWORD);
    const res = await request(app)
      .get(`/api/admin/help?status=New`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toBeDefined();
    const foundIds = res.body.tickets.map((t: any) => t.id);
    expect(foundIds).toContain(legacyTicket.id);
    expect(foundIds).toContain(openTicket.id);
  });

  test('4. Filter by "New" does NOT return assigned OPEN tickets', async () => {
    const admin1 = await createAdmin('SUPER_ADMIN');
    const admin2 = await createAdmin('SUPER_ADMIN');
    userIds.push(admin1.id, admin2.id);

    // Create an assigned OPEN ticket (should NOT appear in New filter)
    const assignedTicket = await createTicket(admin1.id, admin2.id);
    ticketIds.push(assignedTicket.id);

    const token = await login(admin1.email, PASSWORD);
    const res = await request(app)
      .get(`/api/admin/help?status=New`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const foundIds = res.body.tickets.map((t: any) => t.id);
    expect(foundIds).not.toContain(assignedTicket.id);
  });

  test('5. Filter by "In Progress" does NOT return unassigned OPEN tickets', async () => {
    const admin = await createAdmin('SUPER_ADMIN');
    userIds.push(admin.id);

    // Create an unassigned OPEN ticket (should NOT appear in In Progress filter)
    const unassignedTicket = await createTicket(admin.id);
    ticketIds.push(unassignedTicket.id);

    const token = await login(admin.email, PASSWORD);
    const res = await request(app)
      .get(`/api/admin/help?status=In Progress`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const foundIds = res.body.tickets.map((t: any) => t.id);
    expect(foundIds).not.toContain(unassignedTicket.id);
  });
});

// ─── FINDING 2 Tests: Admin Claim Permissions ─────────────────────────────────

describe('Finding 2: Admin Claim Permissions (Unassigned Ticket Access)', () => {
  test('6. Admin CAN claim unassigned ticket they do not own', async () => {
    // Admin1 creates an unassigned ticket
    const admin1 = await createAdmin('ADMIN');
    // Admin2 tries to claim it (does not own it, not assigned to them)
    const admin2 = await createAdmin('ADMIN');
    userIds.push(admin1.id, admin2.id);

    const ticket = await createTicket(admin1.id);
    ticketIds.push(ticket.id);

    expect(ticket.assigneeId).toBeNull();

    // Admin2 claims the unassigned ticket
    const token2 = await login(admin2.email, PASSWORD);
    const res = await request(app)
      .post(`/api/admin/help/${ticket.id}/assign`)
      .set('Authorization', `Bearer ${token2}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the ticket is now assigned to admin2
    const updated = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(updated!.assigneeId).toBe(admin2.id);
    expect(updated!.status).toBe('IN_REVIEW');
  });

  test('7. Admin CANNOT steal a claimed ticket (non-SUPER_ADMIN)', async () => {
    const admin1 = await createAdmin('ADMIN');
    const admin2 = await createAdmin('ADMIN');
    const admin3 = await createAdmin('ADMIN');
    userIds.push(admin1.id, admin2.id, admin3.id);

    // Admin1 creates a ticket, admin2 claims it
    const ticket = await createTicket(admin1.id, admin2.id);
    ticketIds.push(ticket.id);

    // Admin3 tries to self-claim (steal) from admin2
    // This should fail because only SUPER_ADMIN can reassign claimed tickets
    const token3 = await login(admin3.email, PASSWORD);
    const res = await request(app)
      .post(`/api/admin/help/${ticket.id}/assign`)
      .set('Authorization', `Bearer ${token3}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('SUPER_ADMIN');

    // Ticket should remain assigned to admin2
    const updated = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(updated!.assigneeId).toBe(admin2.id);
  });

  test('8. Admin CANNOT reassign with explicit target (non-SUPER_ADMIN)', async () => {
    const admin1 = await createAdmin('ADMIN');
    const admin2 = await createAdmin('ADMIN');
    const admin3 = await createAdmin('ADMIN');
    userIds.push(admin1.id, admin2.id, admin3.id);

    const ticket = await createTicket(admin1.id);
    ticketIds.push(ticket.id);

    // Admin2 tries to assign to admin3 on an unassigned ticket
    // Even though it's unassigned, an explicit target requires SUPER_ADMIN
    const token2 = await login(admin2.email, PASSWORD);
    const res = await request(app)
      .post(`/api/admin/help/${ticket.id}/assign`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ assigneeId: admin3.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('SUPER_ADMIN');

    // Ticket should remain unassigned
    const updated = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(updated!.assigneeId).toBeNull();
  });

  test('9. SUPER_ADMIN can still claim unassigned tickets', async () => {
    const admin1 = await createAdmin('ADMIN');
    const superAdmin = await createAdmin('SUPER_ADMIN');
    userIds.push(admin1.id, superAdmin.id);

    const ticket = await createTicket(admin1.id);
    ticketIds.push(ticket.id);

    const token = await login(superAdmin.email, PASSWORD);
    const res = await request(app)
      .post(`/api/admin/help/${ticket.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    const updated = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(updated!.assigneeId).toBe(superAdmin.id);
  });

  test('10. SUPER_ADMIN can still reassign claimed tickets', async () => {
    const admin1 = await createAdmin('ADMIN');
    const admin2 = await createAdmin('ADMIN');
    const superAdmin = await createAdmin('SUPER_ADMIN');
    userIds.push(admin1.id, admin2.id, superAdmin.id);

    const ticket = await createTicket(admin1.id, admin2.id);
    ticketIds.push(ticket.id);

    const token = await login(superAdmin.email, PASSWORD);
    const res = await request(app)
      .post(`/api/admin/help/${ticket.id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeId: superAdmin.id });

    expect(res.status).toBe(200);
    const updated = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(updated!.assigneeId).toBe(superAdmin.id);
  });
});
