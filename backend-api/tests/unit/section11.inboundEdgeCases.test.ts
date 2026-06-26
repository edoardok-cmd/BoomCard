/**
 * §11 inbound-email edge-case tests — four paths not covered by section11.ticketGaps:
 *
 *   Gap 5 — Spoof guard: a sender not in the ticket's allowed set (owner email,
 *            externalEmail, prior externalFrom entries) must NOT inject into the
 *            original ticket. Instead a new linked ticket is created.
 *
 *   Gap 6 — Bounce / DSN handling: isBounce() detects Mailer-Daemon senders and
 *            delivery-failure subjects. Bounces are persisted to InboundBounce but
 *            never create a HelpTicket. When ≥3 unalerted bounces accumulate for
 *            the same ticket/sender, the assignee (or ops) is alerted.
 *
 *   Gap 7 — Out-of-office auto-reply: an inbound with Auto-Submitted: auto-replied
 *            is recorded as a metadata-only TicketReply (isAutoReply=true) but does
 *            NOT reopen the ticket, does NOT notify the assignee, does NOT fan out.
 *
 *   Gap 8 — New ticket from email (first-time inbound): creates HelpTicket with
 *            source=EMAIL, sends an auto-reply confirmation back to the sender,
 *            persists the auto-reply's Message-ID as a TicketReply anchor, and
 *            notifies admin ops. inferRequestType maps office@ → OTHER, else → SUPPORT.
 */

// ─── Shared spy state ─────────────────────────────────────────────────────────

const emailSendCalls: any[] = [];
const notifyOpsCalls: any[] = [];
const auditCalls: any[] = [];

// ─── Mutable mock state ───────────────────────────────────────────────────────

let helpTicketRow: any = null;     // returned by helpTicket.findUnique
let ticketReplyPriorMessages: any[] = [];  // prior system messageIds (threading ref-chain)
let ticketReplyExternalFrom: any[] = [];   // prior externalFrom rows (spoof guard)
let userRows: Record<string, any> = {};    // keyed by id
let bounceCountValue = 0;                  // returned by inboundBounce.count
let ticketCcRows: any[] = [];             // returned by ticketCC.findMany (recorded CC'd admins)

// ─── Prisma mock ─────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findUnique: jest.fn(async (args: any) => {
      // If an id is in args.where.id return the fixture
      return helpTicketRow;
    }),
    create: jest.fn(async (args: any) => ({
      id: `ticket-${Math.random().toString(36).slice(2, 8)}`,
      ...args.data,
      createdAt: new Date(),
    })),
    update: jest.fn(async (args: any) => {
      if (helpTicketRow) Object.assign(helpTicketRow, args.data);
      return helpTicketRow;
    }),
    findMany: jest.fn(async () => []),  // short-ref scan fallback
    findFirst: jest.fn(async () => null),  // used by resolveTicket priority-2 rootMessageId fallback
  };

  const ticketReply = {
    findMany: jest.fn(async (args: any) => {
      // Threading ref-chain: where.messageId.not === null
      if (args?.where?.messageId?.not === null) return ticketReplyPriorMessages;
      // Spoof-guard externalFrom query: where.externalFrom.not === null
      if (args?.where?.externalFrom?.not === null) return ticketReplyExternalFrom;
      // In-Reply-To resolution (priority-2 matching): where.messageId.in
      if (args?.where?.messageId?.in) return [];
      return [];
    }),
    create: jest.fn(async (args: any) => ({
      id: `reply-${Math.random().toString(36).slice(2, 8)}`,
      ...args.data,
      createdAt: new Date(),
    })),
  };

  const user = {
    findUnique: jest.fn(async (args: any) => {
      const id = args?.where?.id;
      return id ? (userRows[id] ?? null) : null;
    }),
    findFirst: jest.fn(async (args: any) => {
      // getSystemOwnerId: find oldest admin
      if (args?.where?.role?.in) {
        const admins = Object.values(userRows).filter(
          (u: any) => args.where.role.in.includes(u.role)
        );
        return admins[0] ?? null;
      }
      // findFirst by email (owner lookup on new ticket)
      const email = args?.where?.email;
      if (email) {
        return Object.values(userRows).find((u: any) => u.email === email) ?? null;
      }
      return null;
    }),
    // resolveAdminCcEmails: where.email.in (list) + role.in (ADMIN/SUPER_ADMIN)
    findMany: jest.fn(async (args: any) => {
      const emails: string[] | undefined = args?.where?.email?.in;
      const roles: string[] | undefined = args?.where?.role?.in;
      if (!emails) return [];
      return Object.values(userRows).filter(
        (u: any) =>
          emails.map((e) => e.toLowerCase()).includes((u.email || '').toLowerCase()) &&
          (!roles || roles.includes(u.role))
      );
    }),
  };

  const ticketCC = {
    findMany: jest.fn(async (_args: any) => ticketCcRows),
    createMany: jest.fn(async (args: any) => {
      const rows = args?.data ?? [];
      for (const r of rows) {
        if (!ticketCcRows.some((c) => c.ticketId === r.ticketId && c.email === r.email)) {
          ticketCcRows.push(r);
        }
      }
      return { count: rows.length };
    }),
  };

  const inboundBounce = {
    create: jest.fn(async (args: any) => ({
      id: `bounce-${Math.random().toString(36).slice(2, 8)}`,
      ...args.data,
    })),
    count: jest.fn(async () => bounceCountValue),
    updateMany: jest.fn(async () => ({ count: 0 })),
  };

  const orphanInboundEmail = {
    create: jest.fn(async () => ({})),
  };

  const unsubscribeToken = {
    create: jest.fn(async (args: any) => ({ token: 'test-token', ...args.data })),
  };

  const client: any = {
    helpTicket,
    ticketReply,
    user,
    ticketCC,
    inboundBounce,
    orphanInboundEmail,
    unsubscribeToken,
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Email service mock ───────────────────────────────────────────────────────

jest.mock('../../src/services/email.service', () => {
  const sendEmail = jest.fn(async (args: any) => {
    emailSendCalls.push(args);
    return { success: true };
  });
  return { __esModule: true, emailService: { sendEmail } };
});

// ─── Notification / logger / audit mocks ─────────────────────────────────────

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminOps: jest.fn(async (args: any) => {
      notifyOpsCalls.push(args);
    }),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async (args: any) => {
    auditCalls.push(args);
  }),
  auditMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
}));

// ─── Unsubscribe token stub ───────────────────────────────────────────────────

jest.mock('../../src/lib/unsubscribeToken', () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'unsub-token'),
  buildUnsubscribeUrl: jest.fn((t: string) => `https://api.boomcard.bg/api/unsubscribe?token=${t}`),
  addUnsubscribeFooter: jest.fn((html: string) => html + '<div>unsubscribe</div>'),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { ingestInboundEmail, recordTicketCcs } from '../../src/services/ticketInbound.service';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeUser(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    email: `user-${id}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    role: 'USER',
    ...overrides,
  };
}

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-base-1',
    subject: 'Test Ticket',
    status: 'OPEN',
    userId: 'owner-1',
    assigneeId: null,
    externalEmail: 'owner@example.com',
    rootMessageId: null,
    source: 'WEB',
    ...overrides,
  };
}

// Base payload for an inbound reply to an existing ticket
const baseReplyPayload = {
  from: 'owner@example.com',
  to: 'support@boomcard.bg',
  subject: '[#ticket1] Re: Test Ticket',
  text: 'Here is my reply',
  messageId: '<reply-msg@external.com>',
  xBoomCardTicketId: 'ticket-base-1',
};

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  helpTicketRow = null;
  ticketReplyPriorMessages = [];
  ticketReplyExternalFrom = [];
  userRows = {};
  bounceCountValue = 0;
  ticketCcRows = [];
  emailSendCalls.length = 0;
  notifyOpsCalls.length = 0;
  auditCalls.length = 0;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 5 — Spoof guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 5 — spoof guard: unknown sender creates linked ticket', () => {
  const TICKET_ID = 'ticket-spoof-1';

  beforeEach(() => {
    userRows['owner-sp'] = makeUser('owner-sp', { email: 'owner@example.com' });
    // Gap 8 fix: spoof-guard now uses getSystemOwnerId() (findFirst by ADMIN/SUPER_ADMIN role).
    // Add a system admin so the guard can assign ownership and proceed to create the linked ticket.
    userRows['sys-admin'] = makeUser('sys-admin', { email: 'admin@boomcard.bg', role: 'SUPER_ADMIN' });
    helpTicketRow = makeTicket({
      id: TICKET_ID,
      userId: 'owner-sp',
      externalEmail: 'owner@example.com',
    });
  });

  it('creates a new linked ticket when sender is not owner or externalEmail', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    // helpTicket.create returns a fixture for the linked ticket
    mock.helpTicket.create.mockResolvedValueOnce({
      id: 'linked-ticket-spoof',
      linkedTicketId: TICKET_ID,
      subject: 'Re: Test Ticket',
      source: 'EMAIL',
      externalEmail: 'spoofer@attacker.com',
      status: 'NEW',
      userId: 'owner-sp',
      createdAt: new Date(),
    });

    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      from: 'spoofer@attacker.com',
    });

    // A NEW ticket is created, not an injection into the original
    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          linkedTicketId: TICKET_ID,
          source: 'EMAIL',
          externalEmail: 'spoofer@attacker.com',
        }),
      })
    );
    expect(result.created).toBe(true);
    expect(result.ticketId).toBe('linked-ticket-spoof');
  });

  it('does NOT add a TicketReply to the original ticket when spoofed', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.create.mockResolvedValueOnce({
      id: 'linked-ticket-2',
      linkedTicketId: TICKET_ID,
      subject: 'Re: Test Ticket',
      source: 'EMAIL',
      externalEmail: 'imposter@attacker.com',
      status: 'NEW',
      userId: 'owner-sp',
      createdAt: new Date(),
    });

    await ingestInboundEmail({
      ...baseReplyPayload,
      from: 'imposter@attacker.com',
    });

    // ticketReply.create may only be called for the auto-reply anchor of the NEW ticket,
    // never with ticketId === original ticket id
    const replyCreates = mock.ticketReply.create.mock.calls;
    const injectedIntoOriginal = replyCreates.some(
      ([args]: [any]) => args?.data?.ticketId === TICKET_ID && !args?.data?.isAutoReply
    );
    expect(injectedIntoOriginal).toBe(false);
  });

  it('writes a TICKET_INBOUND_SPOOF_BLOCKED audit entry', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.create.mockResolvedValueOnce({
      id: 'linked-audit',
      linkedTicketId: TICKET_ID,
      subject: 'Re: Test Ticket',
      source: 'EMAIL',
      externalEmail: 'audit-spoofer@attacker.com',
      status: 'NEW',
      userId: 'owner-sp',
      createdAt: new Date(),
    });

    await ingestInboundEmail({
      ...baseReplyPayload,
      from: 'audit-spoofer@attacker.com',
    });

    const spoofAudit = auditCalls.find((a) => a.action === 'TICKET_INBOUND_SPOOF_BLOCKED');
    expect(spoofAudit).toBeDefined();
    expect(spoofAudit.objectId).toBe(TICKET_ID);
  });

  it('sender matching externalFrom of a prior reply is accepted (not spoofed)', async () => {
    // A 3rd party who was CC-ed and replied previously is in the allowed set
    ticketReplyExternalFrom = [{ externalFrom: 'thirdparty@example.com' }];

    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      from: 'thirdparty@example.com',
    });

    // Should thread onto the ORIGINAL ticket as a normal reply
    expect(mock.helpTicket.create).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.ticketId).toBe(TICKET_ID);
  });

  it('sender matching owner email (case-insensitive) is accepted', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      from: 'OWNER@EXAMPLE.COM',  // uppercase variant of owner@example.com
    });

    expect(mock.helpTicket.create).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.ticketId).toBe(TICKET_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 6 — Bounce / DSN handling
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 6 — bounce / DSN handling', () => {
  it('returns empty result and no ticket for Mailer-Daemon sender', async () => {
    const result = await ingestInboundEmail({
      from: 'mailer-daemon@example.com',
      to: 'support@boomcard.bg',
      subject: 'Failure Notice',
      text: '',
      messageId: '<bounce-1@example.com>',
    });

    expect(result.created).toBe(false);
    expect(result.ticketId).toBe('');
  });

  it('returns empty result for delivery failure in subject', async () => {
    const result = await ingestInboundEmail({
      from: 'postmaster@mailserver.net',
      to: 'support@boomcard.bg',
      subject: 'Delivery failure: Re: Test Ticket',
      text: '',
      messageId: '<bounce-2@example.com>',
    });

    expect(result.created).toBe(false);
    expect(result.ticketId).toBe('');
  });

  it('returns empty result for "undeliverable" in subject', async () => {
    const result = await ingestInboundEmail({
      from: 'noreply@exchange.example.com',
      to: 'support@boomcard.bg',
      subject: 'Undeliverable: Test Ticket',
      text: '',
      messageId: '<bounce-3@example.com>',
    });

    expect(result.created).toBe(false);
    expect(result.ticketId).toBe('');
  });

  it('persists an InboundBounce row for each detected bounce', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'mailer-daemon@mx.example.com',
      to: 'support@boomcard.bg',
      subject: 'Delivery status notification',
      text: '',
      messageId: '<bounce-persist@example.com>',
    });

    expect(mock.inboundBounce.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromEmail: 'mailer-daemon@mx.example.com',
        }),
      })
    );
  });

  it('does NOT create a HelpTicket or TicketReply for a bounce', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'postmaster@bouncer.example.com',
      to: 'support@boomcard.bg',
      subject: 'Delivery failure notice',
      text: '',
      messageId: '<bounce-no-ticket@example.com>',
    });

    expect(mock.helpTicket.create).not.toHaveBeenCalled();
    expect(mock.ticketReply.create).not.toHaveBeenCalled();
    expect(emailSendCalls).toHaveLength(0);
  });

  it('does NOT send alert when bounce count is below 3', async () => {
    bounceCountValue = 2;  // below threshold

    await ingestInboundEmail({
      from: 'mailer-daemon@example.com',
      to: 'support@boomcard.bg',
      subject: 'Delivery failure',
      text: '',
      messageId: '<bounce-low@example.com>',
    });

    expect(emailSendCalls).toHaveLength(0);
    expect(notifyOpsCalls).toHaveLength(0);
  });

  it('alerts assignee when bounce count reaches 3 and ticket resolved', async () => {
    // Must be 32 hex chars so the bounce-path resolveTicket does a findUnique lookup
    const TICKET_ID = 'aabb1122ccdd3344aabb1122ccdd3344';
    bounceCountValue = 3;

    userRows['assignee-b'] = makeUser('assignee-b', {
      email: 'assignee-bounce@example.com',
      firstName: 'Agent',
      role: 'ADMIN',
    });
    helpTicketRow = makeTicket({
      id: TICKET_ID,
      subject: 'Bounce Ticket',
      assigneeId: 'assignee-b',
      assignee: { email: 'assignee-bounce@example.com', firstName: 'Agent' },
    });
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'mailer-daemon@mx.example.com',
      to: 'support@boomcard.bg',
      // Full 32-char hex ID in brackets so SUBJECT_REF_RE matches and resolveTicket uses findUnique
      subject: `Delivery failure: [#${TICKET_ID}] Bounce Ticket`,
      text: '',
      messageId: '<bounce-threshold@example.com>',
    });

    // Should mark bounces as alerted
    expect(mock.inboundBounce.updateMany).toHaveBeenCalled();
    // Should alert the assignee by email (not ops)
    const alertEmails = emailSendCalls.filter((e) =>
      e.to === 'assignee-bounce@example.com' && e.subject?.includes('Bounce Alert')
    );
    expect(alertEmails).toHaveLength(1);
    // Should NOT also call ops (assignee takes priority)
    const opsBounceNotifs = notifyOpsCalls.filter((n) =>
      n.title?.includes('bounce') || n.title?.includes('Bounce')
    );
    expect(opsBounceNotifs).toHaveLength(0);
  });

  it('falls back to ops notification when 3 bounces but no ticket resolved', async () => {
    bounceCountValue = 3;
    // Subject has no [#...] reference → no ticket resolved

    await ingestInboundEmail({
      from: 'mailer-daemon@example.com',
      to: 'support@boomcard.bg',
      subject: 'Delivery failure: Some random subject',
      text: '',
      messageId: '<bounce-ops@example.com>',
    });

    expect(emailSendCalls).toHaveLength(0);
    const opsBounceNotifs = notifyOpsCalls.filter(
      (n) => n.title?.includes('bounce') || n.title?.includes('Bounce')
    );
    expect(opsBounceNotifs).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 7 — Out-of-office auto-reply handling
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 7 — out-of-office auto-reply (isAutoReply=true note)', () => {
  beforeEach(() => {
    userRows['owner-ooo'] = makeUser('owner-ooo', { email: 'owner@example.com' });
    helpTicketRow = makeTicket({
      id: 'ticket-ooo-1',
      userId: 'owner-ooo',
      externalEmail: 'owner@example.com',
      status: 'RESOLVED',
    });
  });

  it('creates a TicketReply with isAutoReply=true for Auto-Submitted: auto-replied', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: 'ticket-ooo-1',
      autoSubmitted: 'auto-replied',
    });

    const replyCreates = mock.ticketReply.create.mock.calls;
    const autoReplyNote = replyCreates.find(
      ([args]: [any]) => args?.data?.isAutoReply === true
    );
    expect(autoReplyNote).toBeDefined();
  });

  it('does NOT reopen a RESOLVED ticket on auto-reply', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: 'ticket-ooo-1',
      autoSubmitted: 'auto-replied',
    });

    // helpTicket.update should NOT have been called to change status to OPEN
    const reopenCalls = mock.helpTicket.update.mock.calls.filter(
      ([args]: [any]) => args?.data?.status === 'OPEN'
    );
    expect(reopenCalls).toHaveLength(0);
  });

  it('does NOT send any email for auto-reply', async () => {
    await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: 'ticket-ooo-1',
      autoSubmitted: 'auto-replied',
    });

    expect(emailSendCalls).toHaveLength(0);
  });

  it('returns created=false and the original ticketId for auto-reply', async () => {
    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: 'ticket-ooo-1',
      autoSubmitted: 'auto-replied',
    });

    expect(result.created).toBe(false);
    expect(result.ticketId).toBe('ticket-ooo-1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 8 — New ticket from email (first-time inbound)
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 8 — new ticket creation from raw email (source=EMAIL)', () => {
  const ADMIN_ID = 'admin-system';

  beforeEach(() => {
    // System admin for getSystemOwnerId fallback
    userRows[ADMIN_ID] = makeUser(ADMIN_ID, { email: 'admin@boomcard.bg', role: 'ADMIN' });
    // helpTicketRow stays null → no ticket resolved → new ticket created
    helpTicketRow = null;
  });

  it('creates a ticket with source=EMAIL and externalEmail set to sender', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'newcustomer@example.com',
      to: 'support@boomcard.bg',
      subject: 'Need help with my card',
      text: 'Hello, I need assistance.',
      messageId: '<new-ticket-msg@example.com>',
    });

    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'EMAIL',
          externalEmail: 'newcustomer@example.com',
          rootMessageId: '<new-ticket-msg@example.com>',
        }),
      })
    );
  });

  it('sends an auto-reply confirmation email to the sender', async () => {
    await ingestInboundEmail({
      from: 'sender@example.com',
      to: 'support@boomcard.bg',
      subject: 'My question',
      text: 'I have a question.',
      messageId: '<autoreply-msg@example.com>',
    });

    const autoReplies = emailSendCalls.filter((e) => e.to === 'sender@example.com');
    expect(autoReplies).toHaveLength(1);
    // Auto-reply carries a [#...] ticket reference in its subject (format tested by §9 in threadingFixes)
    expect(autoReplies[0].subject).toMatch(/\[#[\w-]+\]/);
  });

  it('persists the auto-reply as a TicketReply with isAutoReply=true', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'anchor@example.com',
      to: 'support@boomcard.bg',
      subject: 'Test anchor',
      text: 'Testing anchor.',
      messageId: '<anchor-msg@example.com>',
    });

    const autoReplyAnchor = mock.ticketReply.create.mock.calls.find(
      ([args]: [any]) => args?.data?.isAutoReply === true && args?.data?.isAdmin === true
    );
    expect(autoReplyAnchor).toBeDefined();
  });

  it('notifies admin ops after creating the ticket', async () => {
    await ingestInboundEmail({
      from: 'ops-notify@example.com',
      to: 'support@boomcard.bg',
      subject: 'Ops test',
      text: 'Testing ops notification.',
      messageId: '<ops-msg@example.com>',
    });

    expect(notifyOpsCalls).toHaveLength(1);
    expect(notifyOpsCalls[0].severity).toBe('info');
  });

  it('returns created=true', async () => {
    const result = await ingestInboundEmail({
      from: 'first-time@example.com',
      to: 'support@boomcard.bg',
      subject: 'First email',
      text: 'First contact.',
      messageId: '<first-time-msg@example.com>',
    });

    expect(result.created).toBe(true);
    expect(result.ticketId).toBeTruthy();
  });

  it('infers requestType=SUPPORT when destination is office@ address (role-based routing, not address-based)', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'partner@biz.com',
      to: 'office@boomcard.bg',
      subject: 'Partner inquiry',
      text: 'We want to partner.',
      messageId: '<office-msg@example.com>',
    });

    // Implementation deliberately returns SUPPORT for all inbound addresses —
    // the user/partner distinction is determined by the ticket owner's role, not by
    // destination mailbox. Admin can reclassify after reading (§11.6).
    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestType: 'SUPPORT' }),
      })
    );
  });

  it('infers requestType=SUPPORT when destination is support@ address', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'subscriber@example.com',
      to: 'support@boomcard.bg',
      subject: 'Support request',
      text: 'I need support.',
      messageId: '<support-msg@example.com>',
    });

    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestType: 'SUPPORT' }),
      })
    );
  });

  it('uses a known user as owner when sender email matches a User record', async () => {
    userRows['known-user'] = makeUser('known-user', { email: 'known@example.com', role: 'USER' });
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      from: 'known@example.com',
      to: 'support@boomcard.bg',
      subject: 'Known user ticket',
      text: 'From a known user.',
      messageId: '<known-msg@example.com>',
    });

    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'known-user' }),
      })
    );
  });

  it('falls back to oldest admin as owner when sender is unknown', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    // userRows has only the admin (no matching user email)

    await ingestInboundEmail({
      from: 'unknown-external@stranger.com',
      to: 'support@boomcard.bg',
      subject: 'Unknown sender',
      text: 'From an unknown.',
      messageId: '<unknown-msg@example.com>',
    });

    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: ADMIN_ID }),
      })
    );
  });

  it('writes a TICKET_INBOUND_CREATED audit entry', async () => {
    await ingestInboundEmail({
      from: 'audit-check@example.com',
      to: 'support@boomcard.bg',
      subject: 'Audit check',
      text: 'Testing audit.',
      messageId: '<audit-check-msg@example.com>',
    });

    const createdAudit = auditCalls.find((a) => a.action === 'TICKET_INBOUND_CREATED');
    expect(createdAudit).toBeDefined();
    expect(createdAudit.objectType).toBe('HelpTicket');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BC-REAUDIT-TICKET-CC-1 — CC'd-admin spoof-allowlist (TicketCC)
// ─────────────────────────────────────────────────────────────────────────────

describe("BC-REAUDIT-TICKET-CC-1 — CC'd admins thread into the original ticket", () => {
  const TICKET_ID = 'ticket-cc-1';

  beforeEach(() => {
    userRows['owner-cc'] = makeUser('owner-cc', { email: 'owner@example.com' });
    // System admin so the spoof guard can assign a linked-ticket owner if needed.
    userRows['sys-admin'] = makeUser('sys-admin', {
      email: 'admin@boomcard.bg',
      role: 'SUPER_ADMIN',
    });
    helpTicketRow = makeTicket({
      id: TICKET_ID,
      userId: 'owner-cc',
      externalEmail: 'owner@example.com',
    });
  });

  it('records only CC addresses that resolve to an ADMIN account, ignoring non-admin CCs', async () => {
    // Two CCs: one is an admin User, one is a random non-admin address.
    userRows['cc-admin'] = makeUser('cc-admin', {
      email: 'cc-admin@boomcard.bg',
      role: 'ADMIN',
    });
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: TICKET_ID,
      from: 'owner@example.com', // legitimate sender so we reach the matched-ticket reply path
      cc: ['Admin Person <cc-admin@boomcard.bg>', 'random-bystander@example.com'],
    });

    // Only the admin CC is persisted (non-admin filtered out at the call site).
    expect(mock.ticketCC.createMany).toHaveBeenCalledTimes(1);
    const submitted = mock.ticketCC.createMany.mock.calls[0][0].data;
    expect(submitted).toEqual([{ ticketId: TICKET_ID, email: 'cc-admin@boomcard.bg' }]);
    expect(mock.ticketCC.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it('does NOT record any CC when none of the CCs are admins', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: TICKET_ID,
      from: 'owner@example.com',
      cc: ['someone@example.com', 'another@example.com'],
    });

    expect(mock.ticketCC.createMany).not.toHaveBeenCalled();
  });

  it('accepts a reply from an address already recorded as a CC (threads into the original ticket)', async () => {
    // A CC'd admin was recorded on a prior inbound.
    ticketCcRows = [{ ticketId: TICKET_ID, email: 'cc-admin@boomcard.bg' }];
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: TICKET_ID,
      from: 'cc-admin@boomcard.bg', // not owner/assignee/externalEmail — only allowed via TicketCC
    });

    // Threaded onto the ORIGINAL ticket as a normal reply — NOT shunted to a linked ticket.
    expect(mock.helpTicket.create).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.ticketId).toBe(TICKET_ID);
    // A real reply was attached to the original ticket.
    const replyOnOriginal = mock.ticketReply.create.mock.calls.some(
      ([args]: [any]) => args?.data?.ticketId === TICKET_ID && !args?.data?.isAutoReply
    );
    expect(replyOnOriginal).toBe(true);
  });

  it('CC match is case-insensitive', async () => {
    ticketCcRows = [{ ticketId: TICKET_ID, email: 'cc-admin@boomcard.bg' }];
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: TICKET_ID,
      from: 'CC-Admin@BoomCard.BG', // uppercase variant
    });

    expect(mock.helpTicket.create).not.toHaveBeenCalled();
    expect(result.ticketId).toBe(TICKET_ID);
    expect(result.created).toBe(false);
  });

  it('an unknown, non-CC sender is still rejected to a linked ticket', async () => {
    // No CC rows; sender is neither owner, assignee, externalEmail, nor a recorded CC.
    ticketCcRows = [];
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.create.mockResolvedValueOnce({
      id: 'linked-noncc',
      linkedTicketId: TICKET_ID,
      subject: 'Re: Test Ticket',
      source: 'EMAIL',
      externalEmail: 'stranger@attacker.com',
      status: 'OPEN',
      userId: 'sys-admin',
      createdAt: new Date(),
    });

    const result = await ingestInboundEmail({
      ...baseReplyPayload,
      xBoomCardTicketId: TICKET_ID,
      from: 'stranger@attacker.com',
    });

    // Spoof guard fires → new linked ticket, NOT a reply on the original.
    expect(mock.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ linkedTicketId: TICKET_ID }),
      })
    );
    expect(result.ticketId).toBe('linked-noncc');
    expect(result.created).toBe(true);
    const injectedIntoOriginal = mock.ticketReply.create.mock.calls.some(
      ([args]: [any]) => args?.data?.ticketId === TICKET_ID && !args?.data?.isAutoReply
    );
    expect(injectedIntoOriginal).toBe(false);
  });

  describe('recordTicketCcs helper (normalize / dedupe / idempotency)', () => {
    it('normalizes, de-dupes and persists with skipDuplicates', async () => {
      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

      const count = await recordTicketCcs(TICKET_ID, [
        'Foo Bar <Foo@Example.com>',
        '  foo@example.com  ', // duplicate after normalize
        'bar@example.com',
      ]);

      expect(count).toBe(2); // foo + bar (deduped)
      const submitted = mock.ticketCC.createMany.mock.calls[0][0].data;
      expect(submitted).toEqual([
        { ticketId: TICKET_ID, email: 'foo@example.com' },
        { ticketId: TICKET_ID, email: 'bar@example.com' },
      ]);
    });

    it('drops syntactically invalid addresses', async () => {
      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

      const count = await recordTicketCcs(TICKET_ID, ['not-an-email', '@nope', 'ok@valid.com']);

      expect(count).toBe(1);
      expect(mock.ticketCC.createMany.mock.calls[0][0].data).toEqual([
        { ticketId: TICKET_ID, email: 'ok@valid.com' },
      ]);
    });

    it('is a no-op on empty input (no DB write)', async () => {
      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

      expect(await recordTicketCcs(TICKET_ID, [])).toBe(0);
      expect(mock.ticketCC.createMany).not.toHaveBeenCalled();
    });
  });
});
