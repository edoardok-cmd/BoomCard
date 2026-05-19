/**
 * §11 ticket-gap regression tests — gaps fixed across two passes:
 *
 *   Gap 3 — support.reply automation was DRAFT with no fireAutomation call in
 *            adminHelp POST /:id/reply. Fix: import fireAutomation + call it
 *            when !isCreator; set automation to ACTIVE in initialize-defaults.
 *
 *   Gap 3b — support.reply fireAutomation fired alongside the direct rich email,
 *             producing two emails for users with marketingConsentEmail=true.
 *             Fix: pass skipEmail=true to fireAutomation so the automation only
 *             creates the in-app notification; the direct rich email handles delivery.
 *
 *   Gap 4 — ingestInboundEmail did not notify the ticket assignee when an
 *            inbound email reply arrived on an assigned ticket. Fix: after
 *            persisting the reply row, look up the assignee and email them.
 *
 *   Gap 4b — assignee notification used payload.messageId (the inbound's own
 *             Message-ID) as In-Reply-To, threading the notification off the
 *             customer's email instead of the ticket's existing system thread.
 *             Fix: query prior TicketReply.messageId rows and build the full
 *             ref chain (same approach as adminHelp.routes.ts reply handler).
 *
 * All Prisma and email-service interactions are mocked — no DB required.
 */

// ─── Shared spy state ─────────────────────────────────────────────────────────

const emailSendCalls: any[] = [];
const notificationCreateCalls: any[] = [];

// ─── Prisma mock ─────────────────────────────────────────────────────────────

let automationRows: any[] = [];
let ticketRow: any = null;
let ticketReplyRow: any = null;
let ticketReplyPriorMessages: any[] = [];  // used by threading ref-chain query
let userRows: Record<string, any> = {};
let unsubTokenRow: any = null;

jest.mock('../../src/lib/prisma', () => {
  const marketingAutomation = {
    findMany: jest.fn(async (args: any) => {
      const statusFilter = args?.where?.status;
      const triggerFilter = args?.where?.trigger;
      return automationRows.filter((row: any) => {
        if (statusFilter && row.status !== statusFilter) return false;
        if (triggerFilter && row.trigger !== triggerFilter) return false;
        return true;
      });
    }),
    update: jest.fn(async () => ({})),
  };
  const notification = {
    create: jest.fn(async (args: any) => {
      const row = { id: `notif-${Date.now()}`, ...args.data, createdAt: new Date() };
      notificationCreateCalls.push(row);
      return row;
    }),
  };
  const user = {
    findUnique: jest.fn(async (args: any) => {
      const id = args?.where?.id;
      if (!id) return null;
      return userRows[id] ?? null;
    }),
  };
  const helpTicket = {
    findUnique: jest.fn(async () => ticketRow),
    update: jest.fn(async (args: any) => {
      if (ticketRow) Object.assign(ticketRow, args.data);
      return ticketRow;
    }),
  };
  const ticketReply = {
    findMany: jest.fn(async (args: any) => {
      // Threading ref-chain query: where.messageId.not === null → prior system messages
      if (args?.where?.messageId?.not === null) return ticketReplyPriorMessages;
      // All other queries (e.g. spoof-check externalFrom) → empty
      return [];
    }),
    create: jest.fn(async (args: any) => {
      const row = { id: `reply-${Date.now()}`, ...args.data, createdAt: new Date() };
      ticketReplyRow = row;
      return row;
    }),
  };
  const unsubscribeToken = {
    findUnique: jest.fn(async () => unsubTokenRow),
    create: jest.fn(async (args: any) => {
      const row = { token: 'unsub-token-123', ...args.data };
      unsubTokenRow = row;
      return row;
    }),
  };
  const client: any = {
    marketingAutomation,
    notification,
    user,
    helpTicket,
    ticketReply,
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
  return {
    __esModule: true,
    emailService: { sendEmail },
    EmailService: jest.fn().mockImplementation(() => ({ sendEmail })),
  };
});

// ─── Push / socket / notification mocks ──────────────────────────────────────

jest.mock('../../src/lib/webPush', () => ({
  sendWebPushToUser: jest.fn(async () => undefined),
}));

jest.mock('../../src/lib/socket', () => ({
  emitNotification: jest.fn(),
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminOps: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
  auditMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
}));

// ─── Unsubscribe token mock ───────────────────────────────────────────────────

jest.mock('../../src/lib/unsubscribeToken', () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'test-unsub-token'),
  buildUnsubscribeUrl: jest.fn((t: string) => `https://api.boomcard.bg/api/unsubscribe?token=${t}`),
  addUnsubscribeFooter: jest.fn((html: string) => html + '<div>unsubscribe</div>'),
}));

// ─── Subjects under test ──────────────────────────────────────────────────────

import { fireAutomation } from '../../src/lib/automationDispatcher';
import { ingestInboundEmail } from '../../src/services/ticketInbound.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEmailTemplate(overrides: Partial<any> = {}) {
  return {
    id: 'tpl-support-reply',
    type: 'EMAIL',
    name: 'Support Reply Notification',
    subject: 'Нов отговор по вашето запитване — BoomCard',
    subjectEn: 'New reply to your inquiry — BoomCard',
    body: '<p>Нашият екип отговори на вашето запитване.</p>',
    bodyEn: '<p>Our team has replied to your inquiry.</p>',
    ...overrides,
  };
}

function makeAutomation(trigger: string, status: 'ACTIVE' | 'DRAFT', overrides: Partial<any> = {}) {
  return {
    id: `auto-${trigger}`,
    trigger,
    name: `${trigger} automation`,
    status,
    totalRuns: 0,
    template: makeEmailTemplate(),
    ...overrides,
  };
}

function makeUser(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    email: `user-${id}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    marketingConsentEmail: true,
    marketingConsent: true,
    preferredLanguage: null,
    role: 'USER',
    ...overrides,
  };
}

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-1',
    subject: 'Test Ticket',
    status: 'OPEN',
    userId: 'owner-1',
    assigneeId: null,
    externalEmail: null,
    rootMessageId: null,
    source: 'WEB',
    requestType: 'SUPPORT',
    category: 'OTHER',
    ...overrides,
  };
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  automationRows = [];
  ticketRow = null;
  ticketReplyRow = null;
  ticketReplyPriorMessages = [];
  userRows = {};
  unsubTokenRow = null;
  emailSendCalls.length = 0;
  notificationCreateCalls.length = 0;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3 — support.reply automation dispatches correctly when ACTIVE
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 3 — support.reply automation (fireAutomation)', () => {
  it('sends email + creates in-app notification when automation is ACTIVE and user has consent', async () => {
    const user = makeUser('u-1', { marketingConsentEmail: true });
    userRows['u-1'] = user;
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await fireAutomation('support.reply', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].to).toBe(user.email);
    expect(emailSendCalls[0].subject).toContain('Нов отговор');

    expect(notificationCreateCalls).toHaveLength(1);
    expect(notificationCreateCalls[0].userId).toBe('u-1');
    expect(notificationCreateCalls[0].type).toBe('MARKETING');
  });

  it('skips email but still creates in-app notification when user has opted out of email marketing', async () => {
    const user = makeUser('u-2', { marketingConsentEmail: false });
    userRows['u-2'] = user;
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await fireAutomation('support.reply', { userId: 'u-2' });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(1);
    expect(notificationCreateCalls[0].userId).toBe('u-2');
  });

  it('does nothing when automation is DRAFT', async () => {
    userRows['u-3'] = makeUser('u-3');
    automationRows.push(makeAutomation('support.reply', 'DRAFT'));

    await fireAutomation('support.reply', { userId: 'u-3' });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(0);
  });

  it('does nothing when no ACTIVE support.reply automation exists', async () => {
    userRows['u-4'] = makeUser('u-4');
    // No automation rows

    await fireAutomation('support.reply', { userId: 'u-4' });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(0);
  });

  it('uses English template when user preferredLanguage is en', async () => {
    const user = makeUser('u-5', { preferredLanguage: 'en', marketingConsentEmail: true });
    userRows['u-5'] = user;
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await fireAutomation('support.reply', { userId: 'u-5' });

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].subject).toContain('New reply to your inquiry');
  });

  it('warns and returns early when called with no recipient context', async () => {
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await expect(fireAutomation('support.reply', {})).resolves.toBeUndefined();

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(0);
  });

  // Gap 3b — skipEmail=true suppresses the template email but still fires the
  // in-app notification. This prevents a double-email for users with
  // marketingConsentEmail=true when adminHelp reply already sends a rich email.
  it('skipEmail=true: skips template email but still creates in-app notification', async () => {
    const user = makeUser('u-skip', { marketingConsentEmail: true });
    userRows['u-skip'] = user;
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await fireAutomation('support.reply', { userId: 'u-skip', skipEmail: true });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(1);
    expect(notificationCreateCalls[0].userId).toBe('u-skip');
  });

  it('skipEmail=true also suppresses email when consent is false (belt-and-suspenders)', async () => {
    const user = makeUser('u-skip2', { marketingConsentEmail: false });
    userRows['u-skip2'] = user;
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await fireAutomation('support.reply', { userId: 'u-skip2', skipEmail: true });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(1);
  });

  it('skipEmail=false (explicit) behaves the same as omitting it — email sent when consent=true', async () => {
    const user = makeUser('u-noskip', { marketingConsentEmail: true });
    userRows['u-noskip'] = user;
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));

    await fireAutomation('support.reply', { userId: 'u-noskip', skipEmail: false });

    expect(emailSendCalls).toHaveLength(1);
    expect(notificationCreateCalls).toHaveLength(1);
  });

  // Edge case: recipientEmail-only (no userId). With skipEmail=true both channels
  // are dead — email is suppressed and in-app notification can't fire without a
  // userId (schema constraint). A warn log should be emitted; nothing should crash.
  it('skipEmail=true + recipientEmail-only: no email, no notification (userId required for notification)', async () => {
    automationRows.push(makeAutomation('support.reply', 'ACTIVE'));
    const { logger } = jest.requireMock('../../src/utils/logger');

    await fireAutomation('support.reply', { recipientEmail: 'anon@example.com', skipEmail: true });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(0);
    // Dispatcher must warn that the notification channel is also dead
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipEmail=true but no userId resolved'),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 4 — ingestInboundEmail notifies assignee on reply
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 4 — ingestInboundEmail assignee notification', () => {
  const basePayload = {
    from: 'external@example.com',
    to: 'support@boomcard.bg',
    subject: '[#abcd1234] Re: Test Ticket',
    text: 'Here is my reply',
    messageId: '<msg-123@external.com>',
    xBoomCardTicketId: 'ticket-1',
  };

  it('emails the assignee when an inbound reply arrives on an assigned ticket', async () => {
    const owner = makeUser('owner-1');
    const assignee = makeUser('assignee-1', { email: 'assignee@example.com', firstName: 'Admin' });
    userRows['owner-1'] = owner;
    userRows['assignee-1'] = assignee;

    ticketRow = makeTicket({
      assigneeId: 'assignee-1',
      userId: 'owner-1',
      externalEmail: 'external@example.com',
    });

    await ingestInboundEmail(basePayload);

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'assignee@example.com');
    expect(assigneeEmails).toHaveLength(1);
    expect(assigneeEmails[0].subject).toContain('Нов отговор от заявител');
    expect(assigneeEmails[0].subject).toContain('Test Ticket');
  });

  it('does NOT email the assignee when the ticket is unassigned', async () => {
    const owner = makeUser('owner-2');
    userRows['owner-2'] = owner;

    ticketRow = makeTicket({
      assigneeId: null,
      userId: 'owner-2',
      externalEmail: 'external@example.com',
    });

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    const assigneeEmails = emailSendCalls.filter((e) => e.subject?.includes('Нов отговор от заявител'));
    expect(assigneeEmails).toHaveLength(0);
  });

  it('does NOT email the assignee when the ticket is self-assigned (assigneeId === userId)', async () => {
    const selfAssigned = makeUser('self-1', { email: 'self@example.com' });
    userRows['self-1'] = selfAssigned;

    ticketRow = makeTicket({
      assigneeId: 'self-1',
      userId: 'self-1',
      externalEmail: 'external@example.com',
    });

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'self@example.com' && e.subject?.includes('Нов отговор от заявител'));
    expect(assigneeEmails).toHaveLength(0);
  });

  it('does NOT notify the assignee for auto-reply emails', async () => {
    const assignee = makeUser('assignee-2', { email: 'assignee2@example.com' });
    userRows['assignee-2'] = assignee;

    ticketRow = makeTicket({
      assigneeId: 'assignee-2',
      userId: 'owner-3',
      externalEmail: 'external@example.com',
    });

    await ingestInboundEmail({
      ...basePayload,
      from: 'external@example.com',
      autoSubmitted: 'auto-replied',
    });

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'assignee2@example.com');
    expect(assigneeEmails).toHaveLength(0);
  });

  it('reopens a CLOSED ticket and still notifies the assignee', async () => {
    const assignee = makeUser('assignee-3', { email: 'assignee3@example.com', firstName: 'Bob' });
    userRows['assignee-3'] = assignee;

    ticketRow = makeTicket({
      status: 'CLOSED',
      assigneeId: 'assignee-3',
      userId: 'owner-4',
      externalEmail: 'external@example.com',
    });

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    // Ticket should have been reopened
    const { helpTicket } = jest.requireMock('../../src/lib/prisma').prisma;
    expect(helpTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN' }),
      })
    );

    // Assignee should still be notified
    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'assignee3@example.com');
    expect(assigneeEmails).toHaveLength(1);
  });

  // Gap 4b — threading: assignee notification must use the ticket's existing
  // ref chain (rootMessageId + prior reply messageIds), not the inbound's own
  // messageId. Using the inbound's messageId would make the notification appear
  // as a child of the customer's email in mail clients, not in the ticket thread.
  it('assignee notification uses ticket ref chain for threading, not inbound messageId', async () => {
    const assignee = makeUser('assignee-thread', { email: 'assignee-thread@example.com', firstName: 'Agent' });
    userRows['assignee-thread'] = assignee;

    ticketRow = makeTicket({
      assigneeId: 'assignee-thread',
      userId: 'owner-thread',
      externalEmail: 'external@example.com',
      rootMessageId: '<root-msg@mail.boomcard.bg>',
    });

    // Simulate one prior system reply that already has a messageId
    ticketReplyPriorMessages = [
      { messageId: '<ticket-abc-prior@mail.boomcard.bg>' },
    ];

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'assignee-thread@example.com');
    expect(assigneeEmails).toHaveLength(1);

    const headers = assigneeEmails[0].headers;
    // Must thread off the LAST system-sent message, not the inbound's messageId
    expect(headers['In-Reply-To']).toBe('<ticket-abc-prior@mail.boomcard.bg>');
    // References chain must contain both the root and the prior reply
    expect(headers['References']).toContain('<root-msg@mail.boomcard.bg>');
    expect(headers['References']).toContain('<ticket-abc-prior@mail.boomcard.bg>');
    // Must NOT contain the inbound's own messageId in In-Reply-To
    expect(headers['In-Reply-To']).not.toBe(basePayload.messageId);
  });

  it('assignee notification falls back to rootMessageId when no prior replies exist', async () => {
    const assignee = makeUser('assignee-root', { email: 'assignee-root@example.com', firstName: 'Root' });
    userRows['assignee-root'] = assignee;

    ticketRow = makeTicket({
      assigneeId: 'assignee-root',
      userId: 'owner-root',
      externalEmail: 'external@example.com',
      rootMessageId: '<root-only@mail.boomcard.bg>',
    });
    // ticketReplyPriorMessages = [] — no prior system replies

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'assignee-root@example.com');
    expect(assigneeEmails).toHaveLength(1);

    const headers = assigneeEmails[0].headers;
    expect(headers['In-Reply-To']).toBe('<root-only@mail.boomcard.bg>');
    expect(headers['References']).toContain('<root-only@mail.boomcard.bg>');
    expect(headers['In-Reply-To']).not.toBe(basePayload.messageId);
  });

  it('assignee notification has no In-Reply-To when ticket has no rootMessageId and no prior replies', async () => {
    const assignee = makeUser('assignee-noroot', { email: 'assignee-noroot@example.com', firstName: 'NoRoot' });
    userRows['assignee-noroot'] = assignee;

    ticketRow = makeTicket({
      assigneeId: 'assignee-noroot',
      userId: 'owner-noroot',
      externalEmail: 'external@example.com',
      rootMessageId: null,  // no root yet
    });
    // ticketReplyPriorMessages = [] — no prior system replies

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'assignee-noroot@example.com');
    expect(assigneeEmails).toHaveLength(1);

    const headers = assigneeEmails[0].headers;
    // No prior chain — In-Reply-To should be absent, not set to inbound's messageId
    expect(headers['In-Reply-To']).toBeUndefined();
    expect(headers['References']).toBeUndefined();
  });

  // Defensive test: the mock bypasses Prisma's { not: null } filter, so if a row
  // with messageId=null slips through (e.g. DB inconsistency), the runtime
  // .filter(!!id) in the service must still exclude it from the ref chain.
  it('refChain runtime filter drops null messageId rows even if the DB query returns them', async () => {
    const assignee = makeUser('assignee-nullmid', { email: 'nullmid@example.com', firstName: 'Guard' });
    userRows['assignee-nullmid'] = assignee;

    ticketRow = makeTicket({
      assigneeId: 'assignee-nullmid',
      userId: 'owner-nullmid',
      externalEmail: 'external@example.com',
      rootMessageId: '<root-guard@mail.boomcard.bg>',
    });

    // One null-messageId row + one valid row — the null must be filtered out
    ticketReplyPriorMessages = [
      { messageId: null },
      { messageId: '<valid-mid@mail.boomcard.bg>' },
    ];

    await ingestInboundEmail({ ...basePayload, from: 'external@example.com' });

    const assigneeEmails = emailSendCalls.filter((e) => e.to === 'nullmid@example.com');
    expect(assigneeEmails).toHaveLength(1);

    const headers = assigneeEmails[0].headers;
    // Last valid entry in the chain is the non-null reply
    expect(headers['In-Reply-To']).toBe('<valid-mid@mail.boomcard.bg>');
    // References must not contain the literal string "null" (stringified null would look like that)
    expect(headers['References']).not.toMatch(/\bnull\b/);
    expect(headers['References']).toContain('<root-guard@mail.boomcard.bg>');
    expect(headers['References']).toContain('<valid-mid@mail.boomcard.bg>');
  });

  it('handles missing ticket gracefully (no crash) when resolveTicket returns null', async () => {
    // ticketRow is null — the X-BoomCard-Ticket-ID lookup returns null.
    // The fallback-create path needs user.findFirst (system admin lookup) and
    // helpTicket.findFirst (subject-prefix match) — add them to the mock.
    ticketRow = null;

    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.user.findFirst = jest.fn(async () => makeUser('system-admin'));
    // helpTicket.findFirst used by subject-prefix match in resolveTicket
    mock.helpTicket.findFirst = jest.fn(async () => null);
    // helpTicket.create for the new ticket in the no-match branch
    mock.helpTicket.create = jest.fn(async (args: any) => ({
      id: 'new-ticket-1',
      ...args.data,
      createdAt: new Date(),
    }));

    const result = await ingestInboundEmail({
      ...basePayload,
      // Remove xBoomCardTicketId to hit the fallback path;
      // strip [#] prefix from subject so subject-prefix match also fails → new ticket
      xBoomCardTicketId: undefined,
      subject: 'No reference subject',
    });

    expect(result).toBeDefined();
    // A new ticket should have been created
    expect(mock.helpTicket.create).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// initialize-defaults: support.reply should be ACTIVE by default
// ─────────────────────────────────────────────────────────────────────────────

describe('initialize-defaults: support.reply status', () => {
  it('support.reply specDefault has status ACTIVE (not DRAFT)', async () => {
    // This verifies the spec intent inline without requiring a full HTTP mock.
    // We import the raw source and check the constant via a regex — cheaper
    // than spinning up an Express server for this assertion.
    const fs = await import('fs');
    const path = await import('path');
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminMarketing.routes.ts'),
      'utf8'
    );

    // Find the support.reply block and confirm it has status: 'ACTIVE'
    const supportReplyBlock = routeSource.match(
      /trigger:\s*['"]support\.reply['"][\s\S]{0,300}?status:\s*['"](\w+)['"]/
    );
    expect(supportReplyBlock).not.toBeNull();
    expect(supportReplyBlock![1]).toBe('ACTIVE');
  });

  it('initialize-defaults idempotency: updates templateId when template is re-seeded', async () => {
    // Verify the fix from the §8 audit: if templateId on the existing automation
    // differs from what syncTpl returns, the loop must update it.
    const fs = await import('fs');
    const path = await import('path');
    const routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminMarketing.routes.ts'),
      'utf8'
    );

    // The idempotency fix branch must be present
    expect(routeSource).toContain("existing.templateId !== def.templateId");
    expect(routeSource).toContain("action: 'updated'");
  });
});
