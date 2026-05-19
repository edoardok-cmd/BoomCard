/**
 * Integration Tests: §11 Inbound Email + Admin Help Date/Assignee Filters
 *
 * BUG-1  Spoof-guard must include the assignee's email in the allowed set —
 *         an inbound from the assignee threads as a reply, not a new ticket.
 * BUG-2  Inbound reply on a RESOLVED ticket reopens it (status→OPEN, resolvedAt→null).
 * BUG-4  Inbound reply on an unassigned ticket triggers notifyAdminOps fallback.
 * GAP-1  GET /api/admin/help accepts `from`, `to` (ISO date range) and
 *         `assigneeId` query params and returns correct subsets.
 */

// ─── Hoist mocks before any import resolves the real modules ──────────────────

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn().mockResolvedValue(undefined),
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
import { notificationService } from '../../src/services/notification.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = 'TestPass999!';

async function hashPw() {
  return bcrypt.hash(PASSWORD, 10);
}

async function loginAs(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD, clientType: 'web' });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken as string;
}

// ─── Shared cleanup state ─────────────────────────────────────────────────────

const userIds: string[] = [];
const ticketIds: string[] = [];

afterAll(async () => {
  // Clean up in dependency order. Replies cascade-delete with tickets.
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function createUser(overrides: Partial<{
  email: string;
  role: string;
  firstName: string;
}> = {}) {
  const suffix = uid();
  const hash = await hashPw();
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `s11-user-${suffix}@boomcard.bg`,
      passwordHash: hash,
      firstName: overrides.firstName ?? 'Test',
      lastName: 'User',
      role: (overrides.role as any) ?? 'USER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });
  userIds.push(user.id);
  return user;
}

async function createTicketWithReply(opts: {
  userId: string;
  assigneeId?: string;
  status?: string;
  resolvedAt?: Date | null;
  externalEmail?: string;
}) {
  const ticket = await prisma.helpTicket.create({
    data: {
      subject: `Integration test ticket ${uid()}`,
      body: 'Test body',
      category: 'OTHER',
      status: (opts.status as any) ?? 'OPEN',
      priority: 'MEDIUM',
      userId: opts.userId,
      assigneeId: opts.assigneeId ?? null,
      source: 'EMAIL',
      externalEmail: opts.externalEmail ?? null,
      resolvedAt: opts.resolvedAt !== undefined ? opts.resolvedAt : null,
    },
  });
  ticketIds.push(ticket.id);

  // Create a TicketReply with a unique messageId so In-Reply-To resolves it.
  const msgId = `<test-${uid()}@boomcard.bg>`;
  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: ticket.id,
      authorId: null,
      body: 'Test reply',
      isAdmin: true,
      messageId: msgId,
      channel: 'EMAIL',
    },
  });

  return { ticket, reply, msgId };
}

// ─── Inbound webhook payload builder ─────────────────────────────────────────

function inboundPayload(overrides: {
  from: string;
  msgId?: string;
  inReplyTo?: string;
}) {
  return {
    from: overrides.from,
    to: 'support@boomcard.bg',
    subject: 'Re: test ticket',
    text: 'Integration test reply body',
    messageId: overrides.msgId ?? `<inbound-${uid()}@example.com>`,
    inReplyTo: overrides.inReplyTo,
  };
}

// ─── BUG-1: Assignee email in spoof-guard ────────────────────────────────────

describe('BUG-1 — assignee email passes spoof-guard', () => {
  it('threads the reply onto the original ticket (not a new ticket)', async () => {
    const owner = await createUser({ role: 'USER' });
    const assignee = await createUser({ role: 'ADMIN' });
    const { ticket, msgId } = await createTicketWithReply({
      userId: owner.id,
      assigneeId: assignee.id,
      externalEmail: owner.email,
    });

    // Count linked tickets before the request (spoof-branch creates a linked ticket).
    const linkedBefore = await prisma.helpTicket.count({
      where: { linkedTicketId: ticket.id },
    });

    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .send(inboundPayload({ from: assignee.email, inReplyTo: msgId }));

    expect(res.status).toBeLessThan(300);
    expect(res.body.ok).toBe(true);
    expect(res.body.created).toBe(false);
    expect(res.body.replyId).toBeTruthy();
    expect(res.body.ticketId).toBe(ticket.id);

    // No spoof-branch ticket should have been created.
    const linkedAfter = await prisma.helpTicket.count({
      where: { linkedTicketId: ticket.id },
    });
    expect(linkedAfter).toBe(linkedBefore);

    // The new reply should be on the original ticket.
    const newReply = await prisma.ticketReply.findUnique({
      where: { id: res.body.replyId },
    });
    expect(newReply).not.toBeNull();
    expect(newReply!.ticketId).toBe(ticket.id);
    expect(newReply!.externalFrom).toBe(assignee.email.toLowerCase());
  });
});

// ─── BUG-2: RESOLVED ticket reopen on inbound reply ─────────────────────────

describe('BUG-2 — inbound reply reopens a RESOLVED ticket', () => {
  it('sets status=OPEN and clears resolvedAt', async () => {
    const owner = await createUser({ role: 'USER' });
    const { ticket, msgId } = await createTicketWithReply({
      userId: owner.id,
      status: 'RESOLVED',
      resolvedAt: new Date(),
      externalEmail: owner.email,
    });

    // Confirm the ticket is RESOLVED before the inbound arrives.
    const before = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(before!.status).toBe('RESOLVED');
    expect(before!.resolvedAt).not.toBeNull();

    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .send(inboundPayload({ from: owner.email, inReplyTo: msgId }));

    expect(res.status).toBeLessThan(300);
    expect(res.body.ok).toBe(true);
    expect(res.body.created).toBe(false);
    expect(res.body.replyId).toBeTruthy();

    // Ticket must be OPEN again with resolvedAt cleared.
    const after = await prisma.helpTicket.findUnique({ where: { id: ticket.id } });
    expect(after!.status).toBe('OPEN');
    expect(after!.resolvedAt).toBeNull();
    expect(after!.reopenedAt).not.toBeNull();
  });
});

// ─── BUG-4: Unassigned ticket → ops notification fallback ────────────────────

describe('BUG-4 — unassigned ticket triggers ops notification fallback', () => {
  it('calls notifyAdminOps when the ticket has no assignee', async () => {
    const owner = await createUser({ role: 'USER' });
    const { ticket, msgId } = await createTicketWithReply({
      userId: owner.id,
      // No assigneeId — the unassigned path.
      externalEmail: owner.email,
    });

    const res = await request(app)
      .post('/api/email/inbound')
      .set('Content-Type', 'application/json')
      .send(inboundPayload({ from: owner.email, inReplyTo: msgId }));

    expect(res.status).toBeLessThan(300);
    expect(res.body.created).toBe(false);
    expect(res.body.replyId).toBeTruthy();

    // notifyAdminOps must have been called at least once with the
    // unassigned-reply opsType for this specific ticket.
    const calls = (notificationService.notifyAdminOps as jest.Mock).mock.calls;
    const unassignedCall = calls.find(
      ([params]: [{ opsType: string }]) =>
        params.opsType?.includes(`help_ticket_inbound_unassigned_${ticket.id}`)
    );
    expect(unassignedCall).toBeDefined();
  });
});

// ─── GAP-1: GET /api/admin/help filters ──────────────────────────────────────

describe('GAP-1 — GET /api/admin/help date range and assigneeId filters', () => {
  let superAdminToken: string;
  let superAdmin: Awaited<ReturnType<typeof createUser>>;
  let assignee: Awaited<ReturnType<typeof createUser>>;
  let ticketOld: { id: string };
  let ticketNew: { id: string };
  let ticketAssigned: { id: string };
  let ticketUnassigned: { id: string };

  const ONE_HOUR = 60 * 60 * 1000;

  beforeAll(async () => {
    superAdmin = await createUser({ role: 'SUPER_ADMIN' });
    assignee = await createUser({ role: 'ADMIN' });
    superAdminToken = await loginAs(superAdmin.email);

    // Ticket created 3 hours ago (old).
    const oldDate = new Date(Date.now() - 3 * ONE_HOUR);
    const tOld = await prisma.helpTicket.create({
      data: {
        subject: `GAP-1 old ticket ${uid()}`,
        body: 'old',
        category: 'OTHER',
        status: 'OPEN',
        priority: 'MEDIUM',
        userId: superAdmin.id,
        createdAt: oldDate,
      },
    });
    ticketOld = tOld;
    ticketIds.push(tOld.id);

    // Ticket created ~now (new).
    const tNew = await prisma.helpTicket.create({
      data: {
        subject: `GAP-1 new ticket ${uid()}`,
        body: 'new',
        category: 'OTHER',
        status: 'OPEN',
        priority: 'MEDIUM',
        userId: superAdmin.id,
      },
    });
    ticketNew = tNew;
    ticketIds.push(tNew.id);

    // Assigned ticket.
    const tAssigned = await prisma.helpTicket.create({
      data: {
        subject: `GAP-1 assigned ticket ${uid()}`,
        body: 'assigned',
        category: 'OTHER',
        status: 'OPEN',
        priority: 'MEDIUM',
        userId: superAdmin.id,
        assigneeId: assignee.id,
      },
    });
    ticketAssigned = tAssigned;
    ticketIds.push(tAssigned.id);

    // Unassigned ticket.
    const tUnassigned = await prisma.helpTicket.create({
      data: {
        subject: `GAP-1 unassigned ticket ${uid()}`,
        body: 'unassigned',
        category: 'OTHER',
        status: 'OPEN',
        priority: 'MEDIUM',
        userId: superAdmin.id,
        assigneeId: null,
      },
    });
    ticketUnassigned = tUnassigned;
    ticketIds.push(tUnassigned.id);
  });

  it('`from` filter excludes tickets created before the cutoff', async () => {
    // Use a cutoff between the old and new tickets (2 hours ago).
    const cutoff = new Date(Date.now() - 2 * ONE_HOUR).toISOString();
    const res = await request(app)
      .get(`/api/admin/help?from=${cutoff}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.tickets as { id: string }[]).map((t) => t.id);
    expect(ids).not.toContain(ticketOld.id);
    expect(ids).toContain(ticketNew.id);
  });

  it('`to` filter excludes tickets created after the cutoff', async () => {
    // Use a cutoff between the old and new tickets (2 hours ago).
    const cutoff = new Date(Date.now() - 2 * ONE_HOUR).toISOString();
    const res = await request(app)
      .get(`/api/admin/help?to=${cutoff}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.tickets as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(ticketOld.id);
    expect(ids).not.toContain(ticketNew.id);
  });

  it('`from`+`to` together form an exclusive window', async () => {
    // Window: last 2 hours only (includes new, excludes old).
    const from = new Date(Date.now() - 2 * ONE_HOUR).toISOString();
    const to = new Date(Date.now() + ONE_HOUR).toISOString();
    const res = await request(app)
      .get(`/api/admin/help?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.tickets as { id: string }[]).map((t) => t.id);
    expect(ids).not.toContain(ticketOld.id);
    expect(ids).toContain(ticketNew.id);
  });

  it('`assigneeId` filter returns only tickets assigned to that admin', async () => {
    const res = await request(app)
      .get(`/api/admin/help?assigneeId=${assignee.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.tickets as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(ticketAssigned.id);
    expect(ids).not.toContain(ticketUnassigned.id);
    // All returned tickets must have assigneeId = assignee.id.
    const tickets = res.body.tickets as { assignee: { id: string } | null }[];
    tickets.forEach((t) => {
      expect(t.assignee?.id).toBe(assignee.id);
    });
  });

  it('`assigneeId=unassigned` returns only tickets with no assignee', async () => {
    const res = await request(app)
      .get('/api/admin/help?assigneeId=unassigned')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    const tickets = res.body.tickets as { id: string; assignee: unknown }[];
    expect(tickets.some((t) => t.id === ticketUnassigned.id)).toBe(true);
    expect(tickets.some((t) => t.id === ticketAssigned.id)).toBe(false);
    tickets.forEach((t) => {
      expect(t.assignee).toBeNull();
    });
  });

  it('returns 403 when called by a plain ADMIN (route requires SUPER_ADMIN)', async () => {
    const plainAdmin = await createUser({ role: 'ADMIN' });
    const plainToken = await loginAs(plainAdmin.email);

    const res = await request(app)
      .get('/api/admin/help')
      .set('Authorization', `Bearer ${plainToken}`);

    expect(res.status).toBe(403);
  });
});
