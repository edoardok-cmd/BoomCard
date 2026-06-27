/**
 * BC-ADMIN-SPEC-REAUDIT8-HELP-REPLY-NOTIFY-1
 *
 * Re-verification of INV-HELP-011 (MEDIUM): admin help-reply handler must fire
 * notifyPartnerRequestUpdate in-app bell when a non-creator admin replies to a
 * PARTNER-created ticket and the reply triggers a status change.
 *
 * Fix was delivered in BC-ADMIN-SPEC-REAUDIT7-HELP-REPLY-NOTIFY-1. This suite
 * re-derives the invariant independently under the REAUDIT8 task ID.
 *
 * Bell gate (adminHelp.routes.ts lines 1186-1196):
 *   !isCreator && newStatus && ticket.user.role === 'PARTNER'
 *
 * Status-change matrix (non-creator):
 *   NEW       → OPEN    (first support reply on untouched ticket)
 *   OPEN      → WAITING (support replied on active ticket)
 *   IN_REVIEW → WAITING
 *   RESOLVED  → WAITING
 *   WAITING   → (no change — already awaiting creator)
 *
 * Tests:
 * 1. Admin reply on PARTNER ticket (OPEN) with status change fires bell once (OPEN→WAITING).
 * 2. Admin reply on PARTNER ticket (WAITING) with no status change fires zero bells.
 * 3. Admin reply on USER-created ticket does not fire bell.
 * 4. Admin reply on PARTNER ticket (NEW) fires bell with fromStatus 'Нова', toStatus 'Отворена'.
 */

import express from 'express';
import request from 'supertest';

// ─── Shared mutable state ─────────────────────────────────────────────────────

let ticketRow: any = null;
const notifyPartnerCalls: any[] = [];

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findUnique: jest.fn(async () => (ticketRow ? JSON.parse(JSON.stringify(ticketRow)) : null)),
    update: jest.fn(async (args: any) => {
      if (ticketRow) Object.assign(ticketRow, args.data);
      return ticketRow;
    }),
  };
  const ticketReply = {
    findMany: jest.fn(async () => []),
    create: jest.fn(async (args: any) => ({
      id: `reply-${Date.now()}`,
      ...args.data,
      createdAt: new Date(),
      author: {
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@boomcard.bg',
      },
    })),
  };
  const client: any = { helpTicket, ticketReply };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Notification service mock ────────────────────────────────────────────────

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPartnerRequestUpdate: jest.fn(async (args: any) => {
      notifyPartnerCalls.push({ ...args });
    }),
  },
}));

// ─── Email service mock ───────────────────────────────────────────────────────

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: jest.fn(async () => ({ success: true })),
  },
}));

// ─── automationDispatcher mock ────────────────────────────────────────────────

jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));

// ─── ticketEmail.service mock ─────────────────────────────────────────────────

jest.mock('../../src/services/ticketEmail.service', () => ({
  buildTicketSubject: jest.fn((id: string, subj: string) => `[${id}] ${subj}`),
  buildTicketHeaders: jest.fn(() => ({
    messageId: '<mocked-msg-id@mail.boomcard.bg>',
    headers: { 'Message-ID': '<mocked-msg-id@mail.boomcard.bg>' },
  })),
  buildPlusReplyTo: jest.fn(() => 'support+ticket-1@boomcard.bg'),
  computeShortRef: jest.fn(() => 'abcd1234'),
  withCanonicalRequestStatus: jest.fn((s: string) => s),
  withCanonicalRequestType: jest.fn((t: string) => t),
  toRawStatusFilter: jest.fn((s: string) => s),
}));

// ─── helpTicketIntake.service mock ───────────────────────────────────────────

jest.mock('../../src/services/helpTicketIntake.service', () => ({
  persistShortRefWithCollisionRetry: jest.fn(async () => 'abcd1234'),
}));

// ─── ticketInbound.service mock ───────────────────────────────────────────────

jest.mock('../../src/services/ticketInbound.service', () => ({
  SUBJECT_REF_RE: /\[#[a-f0-9]{8}\]/i,
  ingestInboundEmail: jest.fn(async () => ({ ticketId: 'ticket-1', created: false })),
}));

// ─── Auth middleware bypass ───────────────────────────────────────────────────

const ADMIN_USER = {
  id: 'admin-1',
  email: 'admin@boomcard.bg',
  role: 'SUPER_ADMIN',
  permissions: ['help.write', 'help.read', 'help.read.all'],
  imp: false,
};

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = ADMIN_USER;
    next();
  },
  authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
  requirePermission: (_perm: any) => (_req: any, _res: any, next: any) => next(),
}));

// ─── Audit middleware mock ────────────────────────────────────────────────────

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(async () => undefined),
}));

// ─── Utility mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/lib/unsubscribeToken', () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'unsub-token-test'),
  buildUnsubscribeUrl: jest.fn((t: string) => `https://api.boomcard.bg/api/unsubscribe?token=${t}`),
  addUnsubscribeFooter: jest.fn((html: string) => html),
}));

jest.mock('../../src/lib/webPush', () => ({
  sendWebPushToUser: jest.fn(async () => undefined),
}));

jest.mock('../../src/lib/socket', () => ({
  emitNotification: jest.fn(),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: helpRouter } = await import('../../src/routes/adminHelp.routes');
  app.use('/api/admin/help', helpRouter);
});

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  ticketRow = null;
  notifyPartnerCalls.length = 0;
  jest.clearAllMocks();

  const { prisma } = jest.requireMock('../../src/lib/prisma');
  prisma.helpTicket.findUnique.mockImplementation(async () => (ticketRow ? JSON.parse(JSON.stringify(ticketRow)) : null));
  prisma.helpTicket.update.mockImplementation(async (args: any) => {
    if (ticketRow) Object.assign(ticketRow, args.data);
    return ticketRow;
  });
  prisma.ticketReply.findMany.mockImplementation(async () => []);
  prisma.ticketReply.create.mockImplementation(async (args: any) => ({
    id: `reply-${Date.now()}`,
    ...args.data,
    createdAt: new Date(),
    author: {
      id: 'admin-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@boomcard.bg',
    },
  }));

  const { notificationService } = jest.requireMock('../../src/services/notification.service');
  notificationService.notifyPartnerRequestUpdate.mockImplementation(async (args: any) => {
    notifyPartnerCalls.push({ ...args });
  });

  const { buildTicketHeaders } = jest.requireMock('../../src/services/ticketEmail.service');
  buildTicketHeaders.mockImplementation(() => ({
    messageId: '<mocked-msg-id@mail.boomcard.bg>',
    headers: { 'Message-ID': '<mocked-msg-id@mail.boomcard.bg>' },
  }));
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    subject: 'Test Partner Ticket',
    status: 'OPEN',
    userId: 'partner-user-1',
    assigneeId: null,
    externalEmail: null,
    rootMessageId: null,
    source: 'WEB',
    requestType: 'SUPPORT',
    category: 'OTHER',
    user: {
      id: 'partner-user-1',
      email: 'partner@example.com',
      firstName: 'Partner',
      role: 'PARTNER',
    },
    assignee: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BC-ADMIN-SPEC-REAUDIT8-HELP-REPLY-NOTIFY: reply handler fires notifyPartnerRequestUpdate', () => {
  it('admin reply on PARTNER-created ticket with status change fires notifyPartnerRequestUpdate once (OPEN→WAITING)', async () => {
    ticketRow = makeTicket({ status: 'OPEN', userId: 'partner-user-1' });

    const res = await request(app)
      .post('/api/admin/help/ticket-1/reply')
      .set('Content-Type', 'application/json')
      .send({ body: 'Здравейте, ще разгледаме въпроса ви и ще се свържем с вас.' });

    expect(res.status).toBe(201);

    await new Promise((r) => setImmediate(r));

    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    expect(notificationService.notifyPartnerRequestUpdate).toHaveBeenCalledTimes(1);

    const call = notifyPartnerCalls[0];
    expect(call.partnerUserId).toBe('partner-user-1');
    expect(call.ticketId).toBe('ticket-1');
    expect(call.subject).toBe('Test Partner Ticket');
    expect(call.fromStatus).toBe('Отворена');
    expect(call.toStatus).toBe('Чака отговор');
  });

  it('admin reply on PARTNER ticket with no status change (WAITING) fires zero notifyPartnerRequestUpdate calls', async () => {
    ticketRow = makeTicket({ status: 'WAITING', userId: 'partner-user-1' });

    const res = await request(app)
      .post('/api/admin/help/ticket-1/reply')
      .set('Content-Type', 'application/json')
      .send({ body: 'Допълнение към предишния ни отговор за изчакване.' });

    expect(res.status).toBe(201);

    await new Promise((r) => setImmediate(r));

    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    expect(notificationService.notifyPartnerRequestUpdate).not.toHaveBeenCalled();
    expect(notifyPartnerCalls).toHaveLength(0);
  });

  it('admin reply on USER-created ticket does not fire notifyPartnerRequestUpdate', async () => {
    ticketRow = makeTicket({
      status: 'OPEN',
      userId: 'regular-user-1',
      user: {
        id: 'regular-user-1',
        email: 'user@example.com',
        firstName: 'Regular',
        role: 'USER',
      },
    });

    const res = await request(app)
      .post('/api/admin/help/ticket-1/reply')
      .set('Content-Type', 'application/json')
      .send({ body: 'Благодарим ви за запитването, ще ви отговорим скоро.' });

    expect(res.status).toBe(201);

    await new Promise((r) => setImmediate(r));

    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    expect(notificationService.notifyPartnerRequestUpdate).not.toHaveBeenCalled();
    expect(notifyPartnerCalls).toHaveLength(0);
  });

  it('admin reply on PARTNER-created ticket (NEW) fires notifyPartnerRequestUpdate with fromStatus Нова, toStatus Отворена', async () => {
    // NEW ticket: first support reply on an untouched ticket transitions NEW→OPEN.
    // The bell must fire because !isCreator && newStatus('OPEN') && role === 'PARTNER'.
    ticketRow = makeTicket({ status: 'NEW', userId: 'partner-user-1' });

    const res = await request(app)
      .post('/api/admin/help/ticket-1/reply')
      .set('Content-Type', 'application/json')
      .send({ body: 'Здравейте, получихме вашето запитване и го разглеждаме.' });

    expect(res.status).toBe(201);

    await new Promise((r) => setImmediate(r));

    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    expect(notificationService.notifyPartnerRequestUpdate).toHaveBeenCalledTimes(1);

    const call = notifyPartnerCalls[0];
    expect(call.partnerUserId).toBe('partner-user-1');
    expect(call.ticketId).toBe('ticket-1');
    expect(call.subject).toBe('Test Partner Ticket');
    expect(call.fromStatus).toBe('Нова');
    expect(call.toStatus).toBe('Отворена');
  });
});
