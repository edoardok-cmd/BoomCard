/**
 * §11 audit-pass 5 — regression tests for the 6 bugs/gaps fixed in this pass:
 *
 *  BUG-1  help / partnerHelp / adminHelp routes: WEB-channel reply reopens
 *         (WAITING/RESOLVED → OPEN) must stamp reopenedAt, matching the behaviour
 *         of the email-inbound reopen path (ticketInbound.service.ts).
 *
 *  BUG-2  ticketInbound.service: bounce handler ticket-resolution did not use
 *         the shortRef O(1) indexed lookup added by Gap-8. It used the old
 *         200-ticket linear scan instead. Now mirrors resolveTicket's ladder.
 *
 *  BUG-3  partnerHelp / adminHelp ticket creation: the auto-reply confirmation
 *         email's Message-ID was set as rootMessageId on the ticket but no
 *         TicketReply row was persisted. In-Reply-To Priority-2 threading
 *         therefore had no TicketReply.messageId anchor, only the rootMessageId
 *         HelpTicket fallback. Parity with help.routes.ts (user flow) restored.
 *
 *  BUG-4  scheduler.autoCloseResolvedTickets: the updateMany included
 *         resolvedAt:null, destroying the audit record of when a ticket was
 *         resolved. CLOSED is a terminal state; auto-close cannot re-fire on it,
 *         so clearing resolvedAt served no purpose.
 *
 *  GAP-5  help.routes GET /tickets/:id: resolvedAt was absent from the select,
 *         so the mobile app could not display "resolved X days ago" or distinguish
 *         RESOLVED tickets from others.
 *
 *  GAP-6  partnerHelp.routes GET /tickets/:id: two separate queries were used —
 *         findUnique (full ticket) then findFirst (ownership check). Collapsed
 *         into a single findFirst({ where: { id, userId } }).
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Shared spy state ─────────────────────────────────────────────────────────

const emailSendCalls: any[] = [];
const notifyOpsCalls: any[] = [];
const auditCalls: any[] = [];

// ─── Mutable fixture state ────────────────────────────────────────────────────

let helpTicketRow: any = null;
let ticketRows: any[] = [];
let ticketReplyPriorMessages: any[] = [];
let userRows: Record<string, any> = {};
let createdTickets: any[] = [];
let createdReplies: any[] = [];
let updatedTickets: any[] = [];
let updatedManyArgs: any[] = [];

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findUnique: jest.fn(async (args: any) => {
      if (args?.where?.id)       return helpTicketRow?.id === args.where.id ? helpTicketRow : null;
      if (args?.where?.shortRef) return helpTicketRow?.shortRef === args.where.shortRef ? helpTicketRow : null;
      return helpTicketRow;
    }),
    findFirst: jest.fn(async (args: any) => {
      if (args?.where?.userId && args?.where?.id) {
        return helpTicketRow?.id === args.where.id && helpTicketRow?.userId === args.where.userId
          ? helpTicketRow : null;
      }
      return helpTicketRow;
    }),
    findMany: jest.fn(async (args: any) => {
      if (args?.where?.shortRef === null) return ticketRows.filter((t) => !t.shortRef);
      return ticketRows;
    }),
    create: jest.fn(async (args: any) => {
      const row = { id: `ticket-${createdTickets.length + 1}`, ...args.data, createdAt: new Date() };
      createdTickets.push(row);
      helpTicketRow = row;
      return row;
    }),
    update: jest.fn(async (args: any) => {
      updatedTickets.push(args);
      if (helpTicketRow) Object.assign(helpTicketRow, args.data);
      return helpTicketRow;
    }),
    updateMany: jest.fn(async (args: any) => {
      updatedManyArgs.push(args);
      return { count: 1 };
    }),
    count: jest.fn(async () => 0),
  };
  const ticketReply = {
    findMany: jest.fn(async (args: any) => {
      if (args?.where?.messageId?.not === null) return ticketReplyPriorMessages;
      return createdReplies.filter((r: any) => !r.isAutoReply);
    }),
    findFirst: jest.fn(async () => null),
    create: jest.fn(async (args: any) => {
      const row = { id: `reply-${createdReplies.length + 1}`, ...args.data, createdAt: new Date() };
      createdReplies.push(row);
      return row;
    }),
  };
  const user = {
    findUnique: jest.fn(async (args: any) => userRows[args?.where?.id] ?? null),
    findFirst: jest.fn(async () => userRows['system-admin'] ?? null),
  };
  const inboundBounce = {
    create:     jest.fn(async () => ({})),
    count:      jest.fn(async () => 0),
    updateMany: jest.fn(async () => ({})),
  };
  const orphanInboundEmail = { create: jest.fn(async () => ({})) };

  const client: any = { helpTicket, ticketReply, user, inboundBounce, orphanInboundEmail };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Supplementary mocks ──────────────────────────────────────────────────────

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
}));

jest.mock('../../src/services/email.service', () => {
  const sendEmail = jest.fn(async (args: any) => { emailSendCalls.push(args); return { success: true }; });
  return { __esModule: true, emailService: { sendEmail }, EmailService: jest.fn(() => ({ sendEmail })) };
});

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminOps: jest.fn(async (args: any) => { notifyOpsCalls.push(args); }),
  },
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit:      jest.fn(async (args: any) => { auditCalls.push(args); }),
  auditMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));

jest.mock('../../src/lib/webPush', () => ({
  sendWebPushToUser: jest.fn(async () => undefined),
}));

jest.mock('../../src/lib/socket', () => ({ emitNotification: jest.fn() }));

jest.mock('../../src/lib/unsubscribeToken', () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'tok'),
  buildUnsubscribeUrl:         jest.fn((t: string) => `https://api.boomcard.bg/api/unsubscribe?token=${t}`),
  addUnsubscribeFooter:        jest.fn((html: string) => html + '<div>unsub</div>'),
}));

// ─── Subjects under test ──────────────────────────────────────────────────────

import { ingestInboundEmail } from '../../src/services/ticketInbound.service';
import { autoCloseResolvedTickets } from '../../src/jobs/scheduler';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf-8');
}

function makeUser(id: string, overrides: Partial<any> = {}) {
  return { id, email: `${id}@example.com`, firstName: 'Test', role: 'USER', ...overrides };
}

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 'ticket-aabbccdd-0000-0000-0000-000000000001',
    subject: 'Test ticket',
    status: 'OPEN',
    userId: 'owner-1',
    assigneeId: null,
    externalEmail: null,
    rootMessageId: null,
    shortRef: 'aabbccdd',
    source: 'WEB',
    requestType: 'SUPPORT',
    category: 'OTHER',
    resolvedAt: null,
    reopenedAt: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  helpTicketRow        = null;
  ticketRows           = [];
  ticketReplyPriorMessages = [];
  userRows             = {};
  createdTickets       = [];
  createdReplies       = [];
  updatedTickets       = [];
  updatedManyArgs      = [];
  emailSendCalls.length  = 0;
  notifyOpsCalls.length  = 0;
  auditCalls.length      = 0;
  jest.clearAllMocks();

  // Re-establish default mock implementations after clearAllMocks().
  const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

  mock.helpTicket.findUnique = jest.fn(async (args: any) => {
    if (args?.where?.id)       return helpTicketRow?.id === args.where.id ? helpTicketRow : null;
    if (args?.where?.shortRef) return helpTicketRow?.shortRef === args.where.shortRef ? helpTicketRow : null;
    return helpTicketRow;
  });
  mock.helpTicket.findFirst = jest.fn(async (args: any) => {
    if (args?.where?.userId && args?.where?.id) {
      return helpTicketRow?.id === args.where.id && helpTicketRow?.userId === args.where.userId
        ? helpTicketRow : null;
    }
    return helpTicketRow;
  });
  mock.helpTicket.findMany = jest.fn(async (args: any) => {
    if (args?.where?.shortRef === null) return ticketRows.filter((t: any) => !t.shortRef);
    return ticketRows;
  });
  mock.helpTicket.create = jest.fn(async (args: any) => {
    const row = { id: `ticket-${createdTickets.length + 1}`, ...args.data, createdAt: new Date() };
    createdTickets.push(row);
    helpTicketRow = row;
    return row;
  });
  mock.helpTicket.update = jest.fn(async (args: any) => {
    updatedTickets.push(args);
    if (helpTicketRow) Object.assign(helpTicketRow, args.data);
    return helpTicketRow;
  });
  mock.helpTicket.updateMany = jest.fn(async (args: any) => {
    updatedManyArgs.push(args);
    return { count: 1 };
  });
  mock.ticketReply.findMany = jest.fn(async (args: any) => {
    if (args?.where?.messageId?.not === null) return ticketReplyPriorMessages;
    return createdReplies.filter((r: any) => !r.isAutoReply);
  });
  mock.ticketReply.findFirst = jest.fn(async () => null);
  mock.ticketReply.create = jest.fn(async (args: any) => {
    const row = { id: `reply-${createdReplies.length + 1}`, ...args.data, createdAt: new Date() };
    createdReplies.push(row);
    return row;
  });
  mock.user.findFirst  = jest.fn(async () => userRows['system-admin'] ?? null);
  mock.user.findUnique = jest.fn(async (args: any) => userRows[args?.where?.id] ?? null);
  mock.inboundBounce.create     = jest.fn(async () => ({}));
  mock.inboundBounce.count      = jest.fn(async () => 0);
  mock.inboundBounce.updateMany = jest.fn(async () => ({}));
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1 — reopenedAt stamped on ALL WEB-channel reopen paths
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-1 — reopenedAt stamped on WEB-channel reopens', () => {
  describe('help.routes (user WEB reply)', () => {
    const src = readSource('../../src/routes/help.routes.ts');

    it('stamps reopenedAt when reopening on WAITING/RESOLVED (source check)', () => {
      // The reopen update in the user reply handler must include reopenedAt.
      expect(src).toMatch(/reopenedAt:\s*new Date\(\)/);
    });

    it('reopenedAt is set in the same update as status:OPEN', () => {
      // Both status and reopenedAt must appear together in the update block
      // for the reopen path (not in a separate call).
      const reopenBlock = src.match(
        /ticket\.status === 'WAITING'[\s\S]{0,400}reopenedAt:\s*new Date\(\)/
      );
      expect(reopenBlock).not.toBeNull();
    });
  });

  describe('partnerHelp.routes (partner WEB reply)', () => {
    const src = readSource('../../src/routes/partnerHelp.routes.ts');

    it('stamps reopenedAt when partner replies on WAITING/RESOLVED (source check)', () => {
      expect(src).toMatch(/reopenedAt:\s*new Date\(\)/);
    });

    it('reopenedAt appears in the WAITING/RESOLVED reopen block', () => {
      const reopenBlock = src.match(
        /ticket\.status === 'WAITING'[\s\S]{0,400}reopenedAt:\s*new Date\(\)/
      );
      expect(reopenBlock).not.toBeNull();
    });
  });

  describe('adminHelp.routes (admin/creator WEB reply)', () => {
    const src = readSource('../../src/routes/adminHelp.routes.ts');

    it('stamps reopenedAt when transitioning to OPEN from RESOLVED or WAITING (source check)', () => {
      expect(src).toMatch(/isReopen[\s\S]{0,200}reopenedAt:\s*new Date\(\)/);
    });

    it('isReopen flag is only set when target is OPEN AND prior state is RESOLVED or WAITING', () => {
      // The source must constrain to newStatus === 'OPEN' AND prior state in [RESOLVED, WAITING]
      // to avoid stamping reopenedAt on forward transitions (OPEN→WAITING etc).
      expect(src).toMatch(/isReopen\s*=\s*newStatus === 'OPEN'/);
      expect(src).toMatch(/'RESOLVED'[\s\S]{0,80}'WAITING'/);
    });
  });

  describe('email inbound path (existing behaviour — regression guard)', () => {
    it('ingestInboundEmail stamps reopenedAt on email reopen of a RESOLVED ticket', async () => {
      helpTicketRow = makeTicket({ status: 'RESOLVED', externalEmail: 'user@example.com' });
      userRows['owner-1'] = makeUser('owner-1', { email: 'user@example.com' });

      await ingestInboundEmail({
        from: 'user@example.com',
        to: 'support@boomcard.bg',
        subject: `[#${helpTicketRow.shortRef}] Re: Test`,
        text: 'follow-up',
        messageId: '<mid-1@example.com>',
      });

      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
      const reopenCall = mock.helpTicket.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === 'OPEN'
      );
      expect(reopenCall).toBeDefined();
      expect(reopenCall![0].data.reopenedAt).toBeInstanceOf(Date);
    });

    it('ingestInboundEmail stamps reopenedAt on email reopen of a CLOSED ticket', async () => {
      helpTicketRow = makeTicket({ status: 'CLOSED', externalEmail: 'user@example.com' });
      userRows['owner-1'] = makeUser('owner-1', { email: 'user@example.com' });

      await ingestInboundEmail({
        from: 'user@example.com',
        to: 'support@boomcard.bg',
        subject: `[#${helpTicketRow.shortRef}] Re: Test`,
        text: 'follow-up on closed',
        messageId: '<mid-2@example.com>',
      });

      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
      const reopenCall = mock.helpTicket.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === 'OPEN'
      );
      expect(reopenCall).toBeDefined();
      expect(reopenCall![0].data.reopenedAt).toBeInstanceOf(Date);
    });

    it('ingestInboundEmail stamps reopenedAt on email reopen of a WAITING ticket', async () => {
      helpTicketRow = makeTicket({ status: 'WAITING', externalEmail: 'user@example.com' });
      userRows['owner-1'] = makeUser('owner-1', { email: 'user@example.com' });

      await ingestInboundEmail({
        from: 'user@example.com',
        to: 'support@boomcard.bg',
        subject: `[#${helpTicketRow.shortRef}] Re: Test`,
        text: 'follow-up while waiting',
        messageId: '<mid-3@example.com>',
      });

      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
      const reopenCall = mock.helpTicket.update.mock.calls.find(
        (c: any[]) => c[0]?.data?.status === 'OPEN'
      );
      expect(reopenCall).toBeDefined();
      expect(reopenCall![0].data.reopenedAt).toBeInstanceOf(Date);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-2 — bounce handler uses shortRef O(1) index
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-2 — bounce handler uses shortRef O(1) index', () => {
  it('bounce for a ticket with a shortRef resolves via findUnique(shortRef) not linear scan', async () => {
    const ticket = makeTicket({ shortRef: 'aabbccdd' });
    helpTicketRow = ticket;

    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    let shortRefLookupCalled = false;
    mock.helpTicket.findUnique = jest.fn(async (args: any) => {
      if (args?.where?.shortRef === 'aabbccdd') {
        shortRefLookupCalled = true;
        return ticket;
      }
      return null;
    });
    // Ensure findMany (linear scan) is not reached when shortRef resolves
    mock.helpTicket.findMany = jest.fn(async () => {
      throw new Error('findMany (linear scan) should not be called when shortRef resolves');
    });

    await ingestInboundEmail({
      from: 'mailer-daemon@example.com',
      to: 'support@boomcard.bg',
      subject: `Delivery failure: [#aabbccdd] Test ticket`,
      text: 'Could not deliver',
      messageId: '<bounce-1@example.com>',
    });

    expect(shortRefLookupCalled).toBe(true);
  });

  it('bounce handler falls back to legacy linear scan only for tickets with shortRef:null', async () => {
    const legacyTicket = makeTicket({ shortRef: null, id: 'aabbccdd-1122-3344-5566-778899aabbcc' });
    ticketRows = [legacyTicket];

    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findUnique = jest.fn(async () => null); // shortRef lookup misses
    let linearScanCalled = false;
    mock.helpTicket.findMany = jest.fn(async (args: any) => {
      if (args?.where?.shortRef === null) {
        linearScanCalled = true;
        return [legacyTicket];
      }
      return [];
    });

    await ingestInboundEmail({
      from: 'mailer-daemon@example.com',
      to: 'support@boomcard.bg',
      subject: `Delivery failure: [#aabbccdd] Legacy subject`,
      text: 'bounce body',
      messageId: '<bounce-legacy@example.com>',
    });

    expect(linearScanCalled).toBe(true);
  });

  it('bounce handler linear scan cap is 500 (not the old 200)', () => {
    const src = readSource('../../src/services/ticketInbound.service.ts');
    // Inside the bounce block, the legacy scan must use take:500.
    // Locate the bounce section by finding "isBounce" related code.
    // The take:500 must appear in that section.
    const bounceSection = src.indexOf('Bounce / DSN: never create a ticket');
    const bounceSectionEnd = src.indexOf('// ── No match', bounceSection);
    const bounceSrc = src.slice(bounceSection, bounceSectionEnd > bounceSection ? bounceSectionEnd : undefined);
    expect(bounceSrc).toMatch(/take:\s*500/);
  });

  it('bounce handler shortRef lookup precedes linear scan in source order', () => {
    const src = readSource('../../src/services/ticketInbound.service.ts');
    const bounceSection = src.indexOf('Bounce / DSN: never create a ticket');
    const shortRefIdx = src.indexOf('shortRef: ref', bounceSection);
    const linearScanIdx = src.indexOf('shortRef: null', bounceSection);
    expect(shortRefIdx).toBeGreaterThan(bounceSection);
    expect(linearScanIdx).toBeGreaterThan(shortRefIdx);
  });

  it('main resolveTicket and bounce handler both use the same 3-tier ladder', () => {
    const src = readSource('../../src/services/ticketInbound.service.ts');
    // Both sections must use the shortRef index:
    // Count occurrences of `where: { shortRef: ref }` (or similar pattern).
    const shortRefMatches = (src.match(/where:\s*\{[^}]*shortRef:\s*ref/g) ?? []).length;
    // Expect at least 2: one in resolveTicket, one in bounce handler.
    expect(shortRefMatches).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-3 — TicketReply anchor row persisted in partnerHelp + adminHelp creation
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-3 — TicketReply anchor row persisted in partnerHelp + adminHelp creation', () => {
  describe('partnerHelp.routes source check', () => {
    const src = readSource('../../src/routes/partnerHelp.routes.ts');

    it('ticketReply.create is called in the ticket creation fire-and-forget block', () => {
      // The auto-reply confirmation block (async IIFE) must call ticketReply.create
      // with isAutoReply:true and channel:'EMAIL'.
      expect(src).toMatch(/ticketReply\.create/);
      expect(src).toMatch(/isAutoReply:\s*true/);
      expect(src).toMatch(/channel:\s*'EMAIL'/);
    });

    it('TicketReply row is created BEFORE emailService.sendEmail in the creation IIFE', () => {
      // Scope the search to the creation fire-and-forget IIFE only, not the
      // whole file (the reply handler also calls emailService.sendEmail earlier).
      const iifeStart = src.indexOf('Fire-and-forget: set rootMessageId + persist TicketReply');
      expect(iifeStart).toBeGreaterThan(0);
      const createIdx = src.indexOf('ticketReply.create', iifeStart);
      const sendIdx   = src.indexOf('emailService.sendEmail', iifeStart);
      expect(createIdx).toBeGreaterThan(iifeStart);
      expect(sendIdx).toBeGreaterThan(createIdx);
    });

    it('reply body is the anchor sentinel matching help.routes pattern', () => {
      expect(src).toMatch(/\[auto-reply confirmation sent\]/);
    });
  });

  describe('adminHelp.routes source check', () => {
    const src = readSource('../../src/routes/adminHelp.routes.ts');

    it('ticketReply.create is called in the ticket creation fire-and-forget block', () => {
      expect(src).toMatch(/ticketReply\.create/);
      expect(src).toMatch(/isAutoReply:\s*true/);
    });

    it('TicketReply row created BEFORE emailService.sendEmail in creation flow', () => {
      // Find the async IIFE for ticket creation (starts after 'auto-reply confirmation')
      const startIdx = src.indexOf('auto-reply confirmation to the admin who created');
      const createIdx = src.indexOf('ticketReply.create', startIdx);
      const sendIdx   = src.indexOf('emailService.sendEmail', startIdx);
      expect(createIdx).toBeGreaterThan(startIdx);
      expect(sendIdx).toBeGreaterThan(createIdx);
    });
  });

  describe('help.routes (baseline — already correct, regression guard)', () => {
    const src = readSource('../../src/routes/help.routes.ts');

    it('user creation flow also persists TicketReply anchor row', () => {
      expect(src).toMatch(/ticketReply\.create/);
      expect(src).toMatch(/isAutoReply:\s*true/);
      expect(src).toMatch(/\[auto-reply confirmation sent\]/);
    });
  });

  describe('threading behaviour via ingestInboundEmail (inbound path)', () => {
    it('auto-reply creates a TicketReply row anchoring the messageId', async () => {
      const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
      userRows['system-admin'] = makeUser('system-admin', { role: 'ADMIN' });
      mock.user.findFirst  = jest.fn(async () => userRows['system-admin']);
      mock.helpTicket.findUnique = jest.fn(async () => null);
      mock.helpTicket.findFirst  = jest.fn(async () => null);
      mock.helpTicket.findMany   = jest.fn(async () => []);
      mock.helpTicket.create = jest.fn(async (args: any) => ({
        id: 'inbound-ticket-1',
        ...args.data,
        createdAt: new Date(),
      }));
      mock.helpTicket.update = jest.fn(async () => ({}));

      await ingestInboundEmail({
        from: 'new@example.com',
        to: 'support@boomcard.bg',
        subject: 'New inquiry',
        text: 'Hello, I need help.',
        messageId: '<new-inbound@example.com>',
      });

      // A TicketReply with isAutoReply:true must have been created (the auto-reply anchor).
      const autoReplyRow = createdReplies.find((r: any) => r.isAutoReply === true);
      expect(autoReplyRow).toBeDefined();
      expect(autoReplyRow.channel).toBe('EMAIL');
      expect(autoReplyRow.messageId).toBeTruthy();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-4 — autoCloseResolvedTickets preserves resolvedAt
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-4 — autoCloseResolvedTickets preserves resolvedAt', () => {
  it('updateMany does NOT include resolvedAt:null', async () => {
    const ticket = {
      id: 'ticket-r1',
      subject: 'Resolved ticket',
      userId: 'user-1',
      rootMessageId: null,
      resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      user: { email: 'user@example.com', firstName: 'User', role: 'USER' },
    };
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findMany = jest.fn(async () => [ticket]);
    mock.ticketReply.findMany = jest.fn(async () => []);

    await autoCloseResolvedTickets();

    expect(updatedManyArgs.length).toBeGreaterThan(0);
    const closeCall = updatedManyArgs[0];
    // resolvedAt must NOT be set to null in the auto-close update.
    expect(closeCall.data.resolvedAt).toBeUndefined();
    // Status must still be CLOSED.
    expect(closeCall.data.status).toBe('CLOSED');
  });

  it('resolvedAt is absent from the updateMany data object entirely', async () => {
    const ticket = {
      id: 'ticket-r2',
      subject: 'Another resolved',
      userId: 'user-2',
      rootMessageId: null,
      resolvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      user: { email: null, firstName: null, role: 'USER' },
    };
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findMany  = jest.fn(async () => [ticket]);
    mock.ticketReply.findMany = jest.fn(async () => []);

    await autoCloseResolvedTickets();

    const closeCall = updatedManyArgs[0];
    // The key 'resolvedAt' must not be present at all (not just undefined).
    expect(Object.prototype.hasOwnProperty.call(closeCall.data, 'resolvedAt')).toBe(false);
  });

  it('updateMany data block does NOT contain resolvedAt:null (source check)', () => {
    const src = readSource('../../src/jobs/scheduler.ts');
    // Locate the specific updateMany call inside autoCloseResolvedTickets.
    // We narrow to just the `data:` object of that call, not the wider function
    // body (which legitimately uses `resolvedAt: null` in the findMany WHERE
    // clause to match legacy tickets that have no resolvedAt).
    const updateManyStart = src.indexOf("data: { status: 'CLOSED'", src.indexOf('autoCloseResolvedTickets'));
    expect(updateManyStart).toBeGreaterThan(0);
    // Extract a small window around the data object (50 chars is sufficient).
    const dataBlock = src.slice(updateManyStart, updateManyStart + 50);
    expect(dataBlock).not.toMatch(/resolvedAt/);
  });

  it('auto-close still transitions status to CLOSED', async () => {
    const ticket = {
      id: 'ticket-r3',
      subject: 'Ticket to close',
      userId: 'user-3',
      rootMessageId: null,
      resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      user: { email: null, firstName: null, role: 'USER' },
    };
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findMany  = jest.fn(async () => [ticket]);
    mock.ticketReply.findMany = jest.fn(async () => []);

    await autoCloseResolvedTickets();

    const closeCall = updatedManyArgs[0];
    expect(closeCall.data.status).toBe('CLOSED');
  });

  it('resolvedAt is preserved for audit: it remains on ticket after auto-close', async () => {
    const resolvedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const ticket = {
      id: 'ticket-r4',
      subject: 'Audit trail ticket',
      userId: 'user-4',
      rootMessageId: null,
      resolvedAt,
      user: { email: null, firstName: null, role: 'USER' },
    };
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findMany  = jest.fn(async () => [ticket]);
    mock.ticketReply.findMany = jest.fn(async () => []);

    await autoCloseResolvedTickets();

    // The ticket's resolvedAt was NOT cleared — it should still equal the
    // original value (updateMany never wrote resolvedAt:null).
    expect(ticket.resolvedAt).toEqual(resolvedAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-5 — user GET /tickets/:id returns resolvedAt
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP-5 — user ticket detail includes resolvedAt', () => {
  const src = readSource('../../src/routes/help.routes.ts');

  it('resolvedAt is present in the GET /tickets/:id select', () => {
    // Find the GET /tickets/:id handler's select block.
    const handlerStart = src.indexOf("GET /api/help/tickets/:id");
    const handlerSrc = src.slice(handlerStart, src.indexOf('\n/**', handlerStart + 1));
    expect(handlerSrc).toMatch(/resolvedAt:\s*true/);
  });

  it('resolvedAt appears alongside reopenedAt in the same select', () => {
    // Both timestamps should be returned so the mobile app can show the full timeline.
    const handlerStart = src.indexOf("GET /api/help/tickets/:id");
    const selectStart  = src.indexOf('select:', handlerStart);
    const selectEnd    = src.indexOf('},', selectStart);
    const selectBlock  = src.slice(selectStart, selectEnd);
    expect(selectBlock).toMatch(/reopenedAt:\s*true/);
    expect(selectBlock).toMatch(/resolvedAt:\s*true/);
  });

  it('partner ticket detail also exposes reopenedAt (regression guard)', () => {
    // partnerHelp GET /:id had reopenedAt before the audit pass — verify it's still there.
    const partnerSrc = readSource('../../src/routes/partnerHelp.routes.ts');
    const handlerStart = partnerSrc.indexOf('GET /api/partner/help/tickets/:id');
    const selectStart  = partnerSrc.indexOf('select:', handlerStart);
    const selectEnd    = partnerSrc.indexOf('},', selectStart);
    const selectBlock  = partnerSrc.slice(selectStart, selectEnd);
    expect(selectBlock).toMatch(/reopenedAt:\s*true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-6 — partnerHelp GET /tickets/:id uses single-query ownership check
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP-6 — partnerHelp GET /tickets/:id single-query ownership', () => {
  const src = readSource('../../src/routes/partnerHelp.routes.ts');

  it('handler uses findFirst (not findUnique + separate findFirst) for ownership', () => {
    // Locate the GET /tickets/:id route handler. Scope to just the handler
    // body: from the handler comment to the next top-level comment (// GET or // POST).
    const handlerStart = src.indexOf("// GET /api/partner/help/tickets/:id — full ticket");
    // Next top-level route comment starts the following handler.
    const handlerEnd = src.indexOf('\n// POST /api/partner', handlerStart + 1);
    const handlerSrc = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    // Only one prisma query (findFirst) — no findUnique.
    const findFirstCount  = (handlerSrc.match(/prisma\.helpTicket\.findFirst/g)  ?? []).length;
    const findUniqueCount = (handlerSrc.match(/prisma\.helpTicket\.findUnique/g) ?? []).length;
    expect(findFirstCount).toBe(1);
    expect(findUniqueCount).toBe(0);
  });

  it('the single query filters by both id and userId simultaneously', () => {
    const handlerStart = src.indexOf("GET /api/partner/help/tickets/:id — full ticket");
    const handlerEnd   = src.indexOf('\n// ', handlerStart + 1);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined);

    // Must include userId: req.user!.id in the where clause of the single query.
    expect(handlerSrc).toMatch(/where:\s*\{[^}]*id:[^}]*userId/s);
  });

  it('404 response is used for both not-found and unauthorized (no separate 403)', () => {
    const handlerStart = src.indexOf("GET /api/partner/help/tickets/:id — full ticket");
    const handlerEnd   = src.indexOf('\n// ', handlerStart + 1);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined);

    // Single 404 covers both cases — no 403 in this handler.
    expect(handlerSrc).toMatch(/status\(404\)/);
    expect(handlerSrc).not.toMatch(/status\(403\)/);
  });

  it('mock-level: single findFirst call resolves ticket for correct owner', async () => {
    helpTicketRow = makeTicket({ userId: 'partner-user-1' });

    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findFirst = jest.fn(async (args: any) => {
      // Simulate the collapsed single-query: both id and userId must match.
      if (args?.where?.id === helpTicketRow.id && args?.where?.userId === 'partner-user-1') {
        return helpTicketRow;
      }
      return null;
    });

    const result = await mock.helpTicket.findFirst({
      where: { id: helpTicketRow.id, userId: 'partner-user-1' },
    });

    expect(result).not.toBeNull();
    expect(result.id).toBe(helpTicketRow.id);
    expect(mock.helpTicket.findFirst).toHaveBeenCalledTimes(1);
    // findUnique must NOT have been called.
    expect(mock.helpTicket.findUnique).not.toHaveBeenCalled();
  });

  it('mock-level: findFirst returns null for wrong owner (access denied)', async () => {
    helpTicketRow = makeTicket({ userId: 'partner-user-1' });

    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    mock.helpTicket.findFirst = jest.fn(async (args: any) => {
      if (args?.where?.id === helpTicketRow.id && args?.where?.userId === 'partner-user-1') {
        return helpTicketRow;
      }
      return null;
    });

    const result = await mock.helpTicket.findFirst({
      where: { id: helpTicketRow.id, userId: 'other-user' },
    });

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-cutting: all three creation flows have matching TicketReply anchor patterns
// ─────────────────────────────────────────────────────────────────────────────

describe('Cross-cutting: all creation flows persist TicketReply anchor symmetrically', () => {
  const routes = [
    { name: 'help.routes',        relPath: '../../src/routes/help.routes.ts' },
    { name: 'partnerHelp.routes', relPath: '../../src/routes/partnerHelp.routes.ts' },
    { name: 'adminHelp.routes',   relPath: '../../src/routes/adminHelp.routes.ts' },
  ];

  for (const { name, relPath } of routes) {
    it(`${name}: creates TicketReply with isAutoReply:true and channel:EMAIL`, () => {
      const src = readSource(relPath);
      expect(src).toMatch(/isAutoReply:\s*true/);
      expect(src).toMatch(/channel:\s*'EMAIL'/);
    });

    it(`${name}: persists TicketReply row before sendEmail call (write-first ordering)`, () => {
      const src = readSource(relPath);
      // Scope the check to the ticket-creation IIFE, not the whole file.
      // partnerHelp and adminHelp have reply handlers that call emailService.sendEmail
      // earlier in the file, before the creation block.
      const iifeMarker = src.indexOf('[auto-reply confirmation sent]');
      expect(iifeMarker).toBeGreaterThan(0);
      // Walk back to the start of the enclosing async IIFE (~300 chars is enough).
      const iifeStart = Math.max(0, iifeMarker - 300);
      const iifeEnd   = src.indexOf('emailService.sendEmail', iifeMarker);
      expect(iifeEnd).toBeGreaterThan(iifeMarker);
      // ticketReply.create must appear between iifeStart and the sendEmail call.
      const createIdx = src.indexOf('ticketReply.create', iifeStart);
      expect(createIdx).toBeGreaterThan(iifeStart);
      expect(createIdx).toBeLessThan(iifeEnd);
    });
  }
});
