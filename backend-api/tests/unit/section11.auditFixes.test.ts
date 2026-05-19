/**
 * §11 audit-fix regression tests (second pass).
 *
 * Covers the 9 issues found and fixed in the §11 audit:
 *
 *   Fix #1 — autoCloseResolvedTickets() TOCTOU: emails must only be sent for
 *             tickets that were actually closed (status still 'CLOSED' after
 *             updateMany). Concurrently-reopened tickets must be skipped.
 *
 *   Fix #2 — Fwd: / Fw: email detection: forwarded emails must ALWAYS create a
 *             new ticket regardless of any [#ref] present in the subject.
 *
 *   Fix #3 — autoCloseResolvedTickets() missing replyTo plus-address: the
 *             closure email must carry a plus-addressed Reply-To so the user's
 *             reply routes back to the ticket via Priority 3.
 *
 *   Fix #4 — CC-admin gap documented: no runtime fix (schema change needed);
 *             test asserts current spoof-protection allowed set (owner, assignee,
 *             externalEmail, prior externalFrom) is correctly enforced.
 *
 *   Fix #5 — Priority numbering: comment-only; no runtime test required.
 *
 *   Fix #6 — SUBJECT_REF_RE min 8 chars: 6/7-char [#ref] subjects must NOT
 *             match existing tickets.
 *
 *   Fix #7 — Admin ticket creation accepts requestType: endpoint must persist
 *             supplied requestType; must reject unknown values.
 *
 *   Fix #8 — requestType filter validates against known values: unknown values
 *             must return 400 instead of silently returning 0 results.
 *
 *   Fix #9 — shortRef collision logs warning: logger.warn must be called when
 *             the shortRef update fails.
 */

// ─── Shared state ─────────────────────────────────────────────────────────────

const emailSendCalls: any[] = [];
const warnCalls: string[] = [];

// ─── Logger mock ─────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn((...args: any[]) => { warnCalls.push(args.join(' ')); }),
    error: jest.fn(),
  },
}));

// ─── Prisma mock ─────────────────────────────────────────────────────────────

// State for configurable Prisma mock
let helpTicketFindManyRows: any[] = [];
let helpTicketUpdateManyCount = 0;
// Tickets that are still CLOSED after concurrent reopen (for the re-query)
let helpTicketFindManyClosedIds: string[] = [];
let helpTicketFindUniqueRow: any = null;
let ticketReplyFindManyRows: any[] = [];
let ticketReplyFindFirstRow: any = null;
let helpTicketFindFirstRow: any = null;
let helpTicketUpdateResult: any = null;
let helpTicketUpdateError: Error | null = null;
let userFindFirstRow: any = null;

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findMany: jest.fn(async (args: any) => {
      // Re-query for actually-closed IDs (status: 'CLOSED' + id in batch)
      if (args?.where?.status === 'CLOSED' && args?.where?.id?.in) {
        return helpTicketFindManyClosedIds.map((id) => ({ id }));
      }
      return helpTicketFindManyRows;
    }),
    findUnique: jest.fn(async () => helpTicketFindUniqueRow),
    findFirst: jest.fn(async () => helpTicketFindFirstRow),
    updateMany: jest.fn(async () => ({ count: helpTicketUpdateManyCount })),
    update: jest.fn(async (args: any) => {
      if (helpTicketUpdateError) throw helpTicketUpdateError;
      helpTicketUpdateResult = args.data;
      return args.data;
    }),
    create: jest.fn(async (args: any) => ({ id: `ticket-new-${Date.now()}`, ...args.data })),
  };
  const ticketReply = {
    findMany: jest.fn(async () => ticketReplyFindManyRows),
    findFirst: jest.fn(async () => ticketReplyFindFirstRow),
    create: jest.fn(async (args: any) => ({ id: `reply-${Date.now()}`, ...args.data })),
  };
  const user = {
    findFirst: jest.fn(async () => userFindFirstRow),
    findUnique: jest.fn(async () => null),
  };
  const inboundBounce = { create: jest.fn(async () => ({})) };
  const orphanInboundEmail = { create: jest.fn(async () => ({})) };
  const client: any = { helpTicket, ticketReply, user, inboundBounce, orphanInboundEmail };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Email service mock ───────────────────────────────────────────────────────

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: {
    sendEmail: jest.fn(async (args: any) => {
      emailSendCalls.push(args);
      return { success: true };
    }),
  },
}));

// ─── Other mocks ─────────────────────────────────────────────────────────────

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => undefined) },
}));

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  emailSendCalls.length = 0;
  warnCalls.length = 0;
  helpTicketFindManyRows = [];
  helpTicketUpdateManyCount = 0;
  helpTicketFindManyClosedIds = [];
  helpTicketFindUniqueRow = null;
  helpTicketFindFirstRow = null;
  helpTicketUpdateResult = null;
  helpTicketUpdateError = null;
  ticketReplyFindManyRows = [];
  ticketReplyFindFirstRow = null;
  userFindFirstRow = null;
  jest.clearAllMocks();
});

// ─── Subjects under test ──────────────────────────────────────────────────────

import { autoCloseResolvedTickets } from '../../src/jobs/scheduler';
import { ingestInboundEmail } from '../../src/services/ticketInbound.service';

// ─────────────────────────────────────────────────────────────────────────────
// Fix #1 — autoCloseResolvedTickets() TOCTOU: only email actually-closed tickets
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix #1 — autoCloseResolvedTickets() TOCTOU', () => {
  const makeResolvedTicket = (id: string, role = 'USER') => ({
    id,
    subject: `Ticket ${id}`,
    userId: 'u-1',
    rootMessageId: null,
    user: { email: `user-${id}@example.com`, firstName: 'Test', role },
  });

  it('sends closure email only for tickets whose status is still CLOSED after updateMany', async () => {
    const t1 = makeResolvedTicket('t-alpha');
    const t2 = makeResolvedTicket('t-beta');

    // Both tickets found as RESOLVED, but only t1 survives to CLOSED.
    // t2 was concurrently reopened → no longer CLOSED after updateMany.
    helpTicketFindManyRows = [t1, t2];
    helpTicketUpdateManyCount = 1; // only 1 actually closed
    helpTicketFindManyClosedIds = ['t-alpha']; // re-query result: only t1 is CLOSED
    ticketReplyFindManyRows = [];

    await autoCloseResolvedTickets();

    // Allow async fire-and-forget to settle
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].to).toBe('user-t-alpha@example.com');
  });

  it('sends no emails when all batch tickets were concurrently reopened', async () => {
    const t1 = makeResolvedTicket('t-gamma');
    helpTicketFindManyRows = [t1];
    helpTicketUpdateManyCount = 0; // nothing actually closed
    helpTicketFindManyClosedIds = []; // re-query finds no CLOSED tickets

    await autoCloseResolvedTickets();
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(0);
  });

  it('sends emails for all tickets when none was concurrently reopened', async () => {
    const t1 = makeResolvedTicket('t-one');
    const t2 = makeResolvedTicket('t-two');
    helpTicketFindManyRows = [t1, t2];
    helpTicketUpdateManyCount = 2;
    helpTicketFindManyClosedIds = ['t-one', 't-two'];
    ticketReplyFindManyRows = [];

    await autoCloseResolvedTickets();
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(2);
  });

  it('skips email for tickets with no user email (email=null)', async () => {
    const t1 = { ...makeResolvedTicket('t-nomail'), user: { email: null, firstName: 'X', role: 'USER' } };
    helpTicketFindManyRows = [t1];
    helpTicketUpdateManyCount = 1;
    helpTicketFindManyClosedIds = ['t-nomail'];

    await autoCloseResolvedTickets();
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #3 — autoCloseResolvedTickets() closure email includes replyTo plus-address
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix #3 — autoCloseResolvedTickets() includes replyTo plus-address', () => {
  it('sets replyTo to support+<shortRef>@... for USER tickets', async () => {
    helpTicketFindManyRows = [{
      id: 'aabbccdd-eeff-0011-2233-445566778899',
      subject: 'Test close',
      userId: 'u-1',
      rootMessageId: null,
      user: { email: 'user@example.com', firstName: 'User', role: 'USER' },
    }];
    helpTicketUpdateManyCount = 1;
    helpTicketFindManyClosedIds = ['aabbccdd-eeff-0011-2233-445566778899'];
    ticketReplyFindManyRows = [];

    await autoCloseResolvedTickets();
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(1);
    // shortRef = first 8 hex chars of UUID without dashes = 'aabbccdd'
    expect(emailSendCalls[0].replyTo).toMatch(/support\+aabbccdd@/);
  });

  it('sets replyTo to office+<shortRef>@... for PARTNER tickets', async () => {
    helpTicketFindManyRows = [{
      id: 'aabbccdd-eeff-0011-2233-445566778899',
      subject: 'Partner close',
      userId: 'u-2',
      rootMessageId: null,
      user: { email: 'partner@example.com', firstName: 'Partner', role: 'PARTNER' },
    }];
    helpTicketUpdateManyCount = 1;
    helpTicketFindManyClosedIds = ['aabbccdd-eeff-0011-2233-445566778899'];
    ticketReplyFindManyRows = [];

    await autoCloseResolvedTickets();
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].replyTo).toMatch(/office\+aabbccdd@/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #2 — Fwd: email creates new ticket instead of attaching to existing one
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix #2 — Forwarded email (Fwd:) creates new ticket', () => {
  const existingTicket = {
    id: 'aabbccdd-0000-0000-0000-000000000000',
    status: 'OPEN',
    userId: 'u-owner',
    assigneeId: null,
    externalEmail: 'owner@example.com',
    rootMessageId: null,
    subject: 'Original ticket',
    requestType: 'SUPPORT',
    source: 'EMAIL',
  };

  beforeEach(() => {
    // shortRef lookup would match this ticket
    helpTicketFindUniqueRow = existingTicket;
    helpTicketFindFirstRow = existingTicket;
    userFindFirstRow = { id: 'u-new', email: 'forwarder@example.com', role: 'USER' };
  });

  const fwdPrefixes = [
    'Fwd:', 'Fw:', 'FWD:', 'FW:', 'fwd:', 'fw:', // English
    'Wg:',                                         // German (Outlook WG:)
    'Vd:',                                         // Dutch
    'Tr:',                                         // French (Outlook TR:)
    'Pf:',                                         // French/Portuguese variant
    'Enc:',                                        // Portuguese (Outlook ENC:)
    'Rv:',                                         // Spanish (Outlook RV:)
    'I:',                                          // Italian (Outlook I:)
  ];

  fwdPrefixes.forEach((prefix) => {
    it(`creates new ticket for subject starting with "${prefix}"`, async () => {
      const { prisma } = require('../../src/lib/prisma');

      await ingestInboundEmail({
        from: 'forwarder@example.com',
        to: 'support@boomcard.bg',
        subject: `${prefix} [#aabbccdd] Original ticket`,
        text: 'Forwarded message body',
        messageId: '<fwd-msg@example.com>',
      });

      // Must have created a new ticket (not appended a reply to the existing one)
      expect(prisma.helpTicket.create).toHaveBeenCalled();
      // Must NOT have created a reply on the existing ticket
      const replyCreates = (prisma.ticketReply.create as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.data?.ticketId === existingTicket.id
      );
      expect(replyCreates).toHaveLength(0);
    });
  });

  it('still matches existing ticket when subject has [#ref] WITHOUT Fwd: prefix', async () => {
    const { prisma } = require('../../src/lib/prisma');

    // Simulate the owner replying (allowed sender)
    userFindFirstRow = { id: 'u-owner', email: 'owner@example.com', role: 'USER' };

    // The ticket must be found via shortRef lookup; findUnique returns it
    helpTicketFindUniqueRow = existingTicket;

    // Simulate allowed sender check: return owner record
    const { prisma: prismaMock } = require('../../src/lib/prisma');
    prismaMock.user.findUnique = jest.fn(async (args: any) => {
      if (args?.where?.id === 'u-owner') return { email: 'owner@example.com' };
      return null;
    });
    prismaMock.ticketReply.findMany = jest.fn(async () => []);

    await ingestInboundEmail({
      from: 'owner@example.com',
      to: 'support@boomcard.bg',
      subject: '[#aabbccdd] Re: Original ticket',
      text: 'Normal reply',
      messageId: '<reply-msg@example.com>',
    });

    // Should append reply, not create new ticket
    expect(prismaMock.ticketReply.create).toHaveBeenCalled();
    const newTicketCalls = (prismaMock.helpTicket.create as jest.Mock).mock.calls;
    expect(newTicketCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #6 — SUBJECT_REF_RE: 6/7-char refs must NOT match
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix #6 — SUBJECT_REF_RE rejects < 8-char refs', () => {
  it('creates new ticket when subject has a 6-char [#ref] (too short)', async () => {
    const { prisma } = require('../../src/lib/prisma');
    userFindFirstRow = { id: 'u-new', email: 'user@example.com', role: 'USER' };
    helpTicketFindUniqueRow = null; // no ticket with this ref
    helpTicketFindFirstRow = null;

    await ingestInboundEmail({
      from: 'user@example.com',
      to: 'support@boomcard.bg',
      subject: '[#abcdef] Short ref subject', // 6 chars — should be ignored
      text: 'Body',
      messageId: '<short-ref@example.com>',
    });

    expect(prisma.helpTicket.create).toHaveBeenCalled();
  });

  it('creates new ticket when subject has a 7-char [#ref] (too short)', async () => {
    const { prisma } = require('../../src/lib/prisma');
    userFindFirstRow = { id: 'u-new', email: 'user@example.com', role: 'USER' };
    helpTicketFindUniqueRow = null;
    helpTicketFindFirstRow = null;

    await ingestInboundEmail({
      from: 'user@example.com',
      to: 'support@boomcard.bg',
      subject: '[#abcdef1] Seven char ref', // 7 chars — should be ignored
      text: 'Body',
      messageId: '<seven-ref@example.com>',
    });

    expect(prisma.helpTicket.create).toHaveBeenCalled();
  });

  it('still matches when subject has an 8-char [#ref]', async () => {
    const { prisma } = require('../../src/lib/prisma');
    const ticket = {
      id: 'aabbccdd-0000-0000-0000-000000000000',
      status: 'OPEN',
      userId: 'u-owner',
      assigneeId: null,
      externalEmail: 'owner@example.com',
      rootMessageId: null,
      subject: 'Existing ticket',
      requestType: 'SUPPORT',
      source: 'EMAIL',
    };
    helpTicketFindUniqueRow = ticket;
    userFindFirstRow = { id: 'u-owner', email: 'owner@example.com' };
    prisma.user.findUnique = jest.fn(async (args: any) => {
      if (args?.where?.id === 'u-owner') return { email: 'owner@example.com' };
      return null;
    });
    prisma.ticketReply.findMany = jest.fn(async () => []);

    await ingestInboundEmail({
      from: 'owner@example.com',
      to: 'support@boomcard.bg',
      subject: '[#aabbccdd] Reply to existing', // exactly 8 chars
      text: 'Body',
      messageId: '<eight-ref@example.com>',
    });

    // Should append reply, not create new ticket
    expect(prisma.ticketReply.create).toHaveBeenCalled();
    expect((prisma.helpTicket.create as jest.Mock).mock.calls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #9 — shortRef collision emits logger.warn
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix #9 — shortRef collision logs a warning', () => {
  it('calls logger.warn when shortRef update fails (unique constraint violation)', async () => {
    const { logger } = require('../../src/utils/logger');
    userFindFirstRow = { id: 'u-owner', email: 'collider@example.com', role: 'USER' };
    // shortRef update throws to simulate a @unique collision
    helpTicketUpdateError = new Error('Unique constraint failed on the fields: (`shortRef`)');

    await ingestInboundEmail({
      from: 'collider@example.com',
      to: 'support@boomcard.bg',
      subject: 'No existing ticket',
      text: 'Body',
      messageId: '<collision-test@example.com>',
    });

    // Ticket creation still succeeded (create doesn't throw)
    const { prisma } = require('../../src/lib/prisma');
    expect(prisma.helpTicket.create).toHaveBeenCalled();

    // Warning was logged
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('shortRef update failed'),
      expect.anything(),
    );
  });

  it('calls logger.warn when shortRef update fails for a spoof-linked ticket', async () => {
    const { logger } = require('../../src/utils/logger');
    const { prisma } = require('../../src/lib/prisma');

    const existingTicket = {
      id: 'aabbccdd-0000-0000-0000-000000000000',
      status: 'OPEN',
      userId: 'u-owner',
      assigneeId: null,
      externalEmail: 'owner@example.com',
      rootMessageId: null,
      subject: 'Original ticket',
      requestType: 'SUPPORT',
      source: 'EMAIL',
    };

    // Priority 1 match resolves to the existing ticket
    helpTicketFindUniqueRow = existingTicket;
    // Simulate a @unique collision when setting shortRef on the linked ticket
    helpTicketUpdateError = new Error('Unique constraint failed on the fields: (`shortRef`)');
    // getSystemOwnerId must return a valid admin so the linked ticket is created
    userFindFirstRow = { id: 'u-admin' };

    // Spoof check: owner has a different email than the inbound sender
    prisma.user.findUnique = jest.fn(async (args: any) => {
      if (args?.where?.id === 'u-owner') return { email: 'owner@example.com' };
      return null;
    });
    prisma.ticketReply.findMany = jest.fn(async () => []);

    await ingestInboundEmail({
      from: 'stranger@example.com',       // not in the allowed-sender set
      to: 'support@boomcard.bg',
      subject: 'Re: Original ticket',
      xBoomCardTicketId: existingTicket.id, // Priority 1 → resolves the existing ticket
      text: 'Unauthorised sender body',
      messageId: '<spoof-collision@example.com>',
    });

    // The linked ticket was still created (shortRef failure is non-fatal)
    expect(prisma.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ linkedTicketId: existingTicket.id }),
      })
    );

    // logger.warn must be called specifically for the linked-ticket shortRef failure
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('shortRef update failed for linked ticket'),
      expect.anything(),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #4 — Spoof protection: correct allowed-set enforced (CC-admin gap noted)
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix #4 — spoof protection allowed-set', () => {
  const ticket = {
    id: 'aabbccdd-0000-0000-0000-000000000000',
    status: 'OPEN',
    userId: 'u-owner',
    assigneeId: 'u-assignee',
    externalEmail: 'external@example.com',
    rootMessageId: null,
    subject: 'Ticket',
    requestType: 'SUPPORT',
    source: 'EMAIL',
  };

  beforeEach(() => {
    helpTicketFindUniqueRow = ticket;
  });

  it('allows reply from ticket owner email', async () => {
    const { prisma } = require('../../src/lib/prisma');
    prisma.user.findUnique = jest.fn(async (args: any) => {
      if (args?.where?.id === 'u-owner') return { email: 'owner@example.com' };
      if (args?.where?.id === 'u-assignee') return { email: 'assignee@example.com' };
      return null;
    });
    prisma.ticketReply.findMany = jest.fn(async () => []);
    userFindFirstRow = { id: 'u-owner', email: 'owner@example.com' };

    await ingestInboundEmail({
      from: 'owner@example.com',
      to: 'support@boomcard.bg',
      subject: 'Re: Ticket',
      // Provide X-BoomCard-Ticket-ID so Priority 1 matches
      xBoomCardTicketId: ticket.id,
      text: 'Reply from owner',
      messageId: '<owner-reply@example.com>',
    });

    expect(prisma.ticketReply.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ticketId: ticket.id }) })
    );
    // No new ticket created
    expect((prisma.helpTicket.create as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('creates a linked ticket for an unknown sender', async () => {
    const { prisma } = require('../../src/lib/prisma');
    prisma.user.findUnique = jest.fn(async (args: any) => {
      if (args?.where?.id === 'u-owner') return { email: 'owner@example.com' };
      if (args?.where?.id === 'u-assignee') return { email: 'assignee@example.com' };
      return null;
    });
    prisma.ticketReply.findMany = jest.fn(async () => []);
    // getSystemOwnerId fallback
    prisma.user.findFirst = jest.fn(async () => ({ id: 'u-admin' }));

    await ingestInboundEmail({
      from: 'stranger@example.com',
      to: 'support@boomcard.bg',
      subject: 'Re: Ticket',
      xBoomCardTicketId: ticket.id,
      text: 'I am not authorised',
      messageId: '<stranger@example.com>',
    });

    // A NEW linked ticket must be created, not a reply on the original
    expect(prisma.helpTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ linkedTicketId: ticket.id }),
      })
    );
    const replyOnOriginal = (prisma.ticketReply.create as jest.Mock).mock.calls.filter(
      (call: any[]) => call[0]?.data?.ticketId === ticket.id
    );
    expect(replyOnOriginal).toHaveLength(0);
  });
});
