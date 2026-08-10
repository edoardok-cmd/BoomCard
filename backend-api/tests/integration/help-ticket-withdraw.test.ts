/**
 * Integration Tests: Help Ticket Withdrawal (BC-ADMIN-REAUDIT2-TICKET-WITHDRAW-1)
 *
 * Spec §1.7: "Cancelled = Withdrawn or invalid"
 * Users and partners should be able to withdraw their own OPEN tickets,
 * transitioning them to CANCELLED status. This is distinct from the
 * admin-only cancel operation (which covers "invalid" tickets).
 *
 * TESTS:
 * 1. User withdraws their own OPEN ticket → status becomes CANCELLED
 * 2. User cannot withdraw already-CLOSED/REJECTED/CANCELLED ticket (400)
 * 3. User cannot withdraw other user's ticket (404)
 * 4. Partner withdraws their own OPEN ticket → status becomes CANCELLED
 * 5. Partner cannot withdraw already-terminal ticket (400)
 * 6. Partner cannot withdraw other partner's ticket (404)
 * 7. Withdrawal creates INTERNAL reply with [ОТТЕГЛЕНА от заявителя]
 * 8. Withdrawal triggers audit with action: ticket.withdraw
 * 9. Assignee is notified of withdrawal (email sent)
 * 10. Withdrawn ticket remains in history (not deleted)
 */

// ─── Hoist mocks before any import resolves the real modules ──────────────────

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPartnerApprovalEmail: jest.fn().mockResolvedValue(undefined),
    sendPartnerStatusChangeEmail: jest.fn().mockResolvedValue(undefined),
    sendPartnerContractChangeEmail: jest.fn().mockResolvedValue(undefined),
  },
  EmailService: jest.fn(),
}));

jest.mock('../../src/services/notification.service', () => ({
  __esModule: true,
  notificationService: {
    notifyAdminOps: jest.fn().mockResolvedValue(undefined),
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
    notifyUser: jest.fn().mockResolvedValue(undefined),
  },
  NotificationService: jest.fn(),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../../src/server';
import { prisma } from '../../src/lib/prisma';
import { emailService } from '../../src/services/email.service';
import { genTestPhone } from '../helpers/test-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

async function hashPw() {
  return bcrypt.hash(PASSWORD, 10);
}

async function createUser() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `user-${suffix}@example.com`,
      passwordHash: hash,
      firstName: 'User',
      lastName: 'Test',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });
  return user;
}

async function createPartner() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `partner-${suffix}@example.com`,
      passwordHash: hash,
      firstName: 'Partner',
      lastName: 'Test',
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      businessName: `Partner ${suffix}`,
      category: 'Restaurant',
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
  });
  return { user, partner };
}

async function createAdmin() {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: `admin-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'Test',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      phone: genTestPhone(),
    },
  });
  return user;
}

async function login(email: string, password: string) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password, clientType: 'web' });
  if (res.status !== 200) {
    throw new Error(`Failed to login: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function createUserTicket(userId: string) {
  return prisma.helpTicket.create({
    data: {
      subject: `Test Ticket ${uid()}`,
      body: 'Test body for withdraw',
      category: 'OTHER',
      userId,
      status: 'OPEN',
      requestType: 'SUPPORT',
    },
  });
}

async function createPartnerTicket(userId: string) {
  return prisma.helpTicket.create({
    data: {
      subject: `Test Ticket ${uid()}`,
      body: 'Test body for withdraw',
      category: 'OTHER',
      userId,
      status: 'OPEN',
      requestType: 'SUPPORT',
    },
  });
}

// ─── Shared cleanup state ─────────────────────────────────────────────────────

const userIds: string[] = [];
const partnerIds: string[] = [];
const ticketIds: string[] = [];

afterAll(async () => {
  // Clean up in dependency order. Replies cascade-delete with tickets.
  if (ticketIds.length) {
    await prisma.helpTicket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  if (partnerIds.length) {
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/help/tickets/:id/cancel (User Withdrawal)', () => {
  it('withdraws own OPEN ticket → status becomes CANCELLED', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await prisma.helpTicket.findUnique({
      where: { id: ticket.id },
    });
    expect(updated?.status).toBe('CANCELLED');
  });

  it('creates INTERNAL reply with withdrawal marker', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId: ticket.id },
    });
    expect(replies.length).toBeGreaterThan(0);
    const withdrawalReply = replies.find(
      (r) => r.channel === 'INTERNAL' && r.body.includes('[ОТТЕГЛЕНА от заявителя]')
    );
    expect(withdrawalReply).toBeDefined();
    expect(withdrawalReply?.isAdmin).toBe(false);
  });

  it('cannot withdraw already-CLOSED ticket (400)', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { status: 'CLOSED' },
    });
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('крайно състояние');
  });

  it('cannot withdraw already-REJECTED ticket (400)', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { status: 'REJECTED' },
    });
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('cannot withdraw already-CANCELLED ticket (400)', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { status: 'CANCELLED' },
    });
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('cannot withdraw other user\'s ticket (404)', async () => {
    const user1 = await createUser();
    const user2 = await createUser();
    userIds.push(user1.id, user2.id);
    const ticket = await createUserTicket(user1.id);
    ticketIds.push(ticket.id);
    const token = await login(user2.email, PASSWORD);

    const res = await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it('notifies assignee of withdrawal', async () => {
    const user = await createUser();
    const admin = await createAdmin();
    userIds.push(user.id, admin.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { assigneeId: admin.id },
    });
    const token = await login(user.email, PASSWORD);

    (emailService.sendEmail as jest.Mock).mockClear();

    await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(emailService.sendEmail).toHaveBeenCalled();
    const call = (emailService.sendEmail as jest.Mock).mock.calls[0];
    expect(call[0].to).toBe(admin.email);
    expect(call[0].subject).toContain('оттеглена');
  });

  it('remains in history (not deleted)', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const found = await prisma.helpTicket.findUnique({
      where: { id: ticket.id },
    });
    expect(found).not.toBeNull();
    expect(found?.status).toBe('CANCELLED');
  });

  it('triggers audit trail with action ticket.withdraw (user)', async () => {
    const user = await createUser();
    userIds.push(user.id);
    const ticket = await createUserTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    const originalStatus = ticket.status;

    await request(app)
      .post(`/api/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const audit = await prisma.auditLog.findFirst({
      where: {
        objectId: ticket.id,
        action: 'ticket.withdraw',
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.action).toBe('ticket.withdraw');
    expect(audit?.before?.status).toBe(originalStatus);
    expect(audit?.after?.status).toBe('CANCELLED');
  });
});

describe('POST /api/partner/help/tickets/:id/cancel (Partner Withdrawal)', () => {
  it('withdraws own OPEN ticket → status becomes CANCELLED', async () => {
    const { user, partner } = await createPartner();
    userIds.push(user.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const updated = await prisma.helpTicket.findUnique({
      where: { id: ticket.id },
    });
    expect(updated?.status).toBe('CANCELLED');
  });

  it('creates INTERNAL reply with withdrawal marker', async () => {
    const { user, partner } = await createPartner();
    userIds.push(user.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const replies = await prisma.ticketReply.findMany({
      where: { ticketId: ticket.id },
    });
    expect(replies.length).toBeGreaterThan(0);
    const withdrawalReply = replies.find(
      (r) => r.channel === 'INTERNAL' && r.body.includes('[ОТТЕГЛЕНА от заявителя]')
    );
    expect(withdrawalReply).toBeDefined();
  });

  it('cannot withdraw already-CLOSED ticket (400)', async () => {
    const { user, partner } = await createPartner();
    userIds.push(user.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { status: 'CLOSED' },
    });
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('cannot withdraw already-REJECTED ticket (400)', async () => {
    const { user, partner } = await createPartner();
    userIds.push(user.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { status: 'REJECTED' },
    });
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('cannot withdraw already-CANCELLED ticket (400)', async () => {
    const { user, partner } = await createPartner();
    userIds.push(user.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { status: 'CANCELLED' },
    });
    const token = await login(user.email, PASSWORD);

    const res = await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('cannot withdraw other partner\'s ticket (404)', async () => {
    const { user: partner1 } = await createPartner();
    const { user: partner2 } = await createPartner();
    userIds.push(partner1.id, partner2.id);
    const ticket = await createPartnerTicket(partner1.id);
    ticketIds.push(ticket.id);
    const token = await login(partner2.email, PASSWORD);

    const res = await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it('notifies assignee of withdrawal', async () => {
    const { user, partner } = await createPartner();
    const admin = await createAdmin();
    userIds.push(user.id, admin.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    await prisma.helpTicket.update({
      where: { id: ticket.id },
      data: { assigneeId: admin.id },
    });
    const token = await login(user.email, PASSWORD);

    (emailService.sendEmail as jest.Mock).mockClear();

    await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(emailService.sendEmail).toHaveBeenCalled();
    const call = (emailService.sendEmail as jest.Mock).mock.calls[0];
    expect(call[0].to).toBe(admin.email);
  });

  it('triggers audit trail with action ticket.withdraw (partner)', async () => {
    const { user, partner } = await createPartner();
    userIds.push(user.id);
    partnerIds.push(partner.id);
    const ticket = await createPartnerTicket(user.id);
    ticketIds.push(ticket.id);
    const token = await login(user.email, PASSWORD);

    const originalStatus = ticket.status;

    await request(app)
      .post(`/api/partner/help/tickets/${ticket.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const audit = await prisma.auditLog.findFirst({
      where: {
        objectId: ticket.id,
        action: 'ticket.withdraw',
      },
    });
    expect(audit).toBeDefined();
    expect(audit?.action).toBe('ticket.withdraw');
    expect(audit?.before?.status).toBe(originalStatus);
    expect(audit?.after?.status).toBe('CANCELLED');
  });
});
