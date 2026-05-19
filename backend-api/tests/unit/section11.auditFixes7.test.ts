/**
 * §11 audit-pass 7 — regression tests for 10 bugs/gaps fixed in this pass:
 *
 *  BUG-1  schema.prisma HelpTicket.status default was NEW (legacy-only) instead of
 *         OPEN. Any caller that omits an explicit status would silently create a NEW
 *         ticket that never appears in the admin queue. Default is now OPEN.
 *
 *  BUG-2  adminHelp POST /:id/reply / PATCH /:id status-change: the ticket-status and
 *         reply-notification emails hardcoded a /admin/help/mine link, which is
 *         inaccessible to USER and PARTNER ticket creators. A ticketCreatorUrl() helper
 *         now returns a role-appropriate URL (or null for anonymous/USER creators).
 *
 *  BUG-3  adminHelp POST /:id/reply: the TicketReply row was created with
 *         channel: 'EMAIL' even though the reply was authored in the admin web UI.
 *         Fixed to channel: 'WEB'. The auto-reply confirmation row (created at ticket
 *         submission time) correctly keeps channel: 'EMAIL'.
 *
 *  BUG-4  scheduler.autoCloseResolvedTickets: the updateMany WHERE clause lacked a
 *         `status: 'RESOLVED'` guard, so a ticket reopened between the findMany and
 *         the updateMany could be incorrectly re-closed. Guard added.
 *
 *  BUG-5  scheduler.autoCloseResolvedTickets: the function used a single take:200
 *         query; any backlog >200 tickets was silently truncated. Replaced with a
 *         paginated loop (BATCH_SIZE=200, MAX_ITERATIONS=50).
 *
 *  BUG-6  partnerHelp POST /tickets/:id/reply and help POST /tickets/:id/reply:
 *         TicketReply rows were created without persisting messageId or inReplyTo,
 *         breaking Priority-2 In-Reply-To threading for future inbound email replies.
 *         buildTicketHeaders() now runs before prisma.ticketReply.create() and the
 *         messageId is stored on the row (matching the adminHelp reply handler).
 *
 *  BUG-7  help POST /tickets/:id/reply: fireAutomation('support.reply', ...) was
 *         called when a user replied on their own ticket. That automation is meant
 *         only for admin→user replies. Call removed entirely from user reply handler.
 *
 *  GAP-8  ticketInbound.service spoof-guard: when an unrecognised sender replies to
 *         a ticket, the linked "shadow" ticket was created with the original ticket's
 *         userId as owner. It should be owned by a system admin (getSystemOwnerId()).
 *
 *  GAP-9  help.routes and partnerHelp.routes ticket creation: DISPUTE-type tickets
 *         did not auto-create a linked Dispute record. Now a fire-and-forget
 *         prisma.dispute.create() call runs when requestType === 'DISPUTE'.
 *
 *  GAP-10 TicketReply.channel: the 'INTERNAL' value (system-generated notes like
 *         rejection reason) was undocumented in both the Prisma schema comment and
 *         the TypeScript interface in adminHelp.service.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Mutable fixture state ────────────────────────────────────────────────────

let ticketFindManyResult: any[] = [];
let updatedManyArgs: any[] = [];
let loggerWarnCalls: any[] = [];

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findMany:   jest.fn(async () => ticketFindManyResult),
    updateMany: jest.fn(async (args: any) => {
      updatedManyArgs.push(args);
      return { count: ticketFindManyResult.length };
    }),
    findUnique: jest.fn(async () => null),
    findFirst:  jest.fn(async () => null),
    update:     jest.fn(async () => ({})),
    create:     jest.fn(async () => ({})),
    count:      jest.fn(async () => 0),
  };
  const ticketReply = {
    findMany:  jest.fn(async () => []),
    create:    jest.fn(async () => ({})),
    findFirst: jest.fn(async () => null),
  };
  const user = {
    findUnique: jest.fn(async () => null),
    findFirst:  jest.fn(async () => null),
  };
  const client: any = { helpTicket, ticketReply, user };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/services/email.service', () => ({
  __esModule: true,
  emailService: { sendEmail: jest.fn(async () => ({ success: true })) },
  EmailService: jest.fn(() => ({ sendEmail: jest.fn(async () => ({ success: true })) })),
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => {}) },
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit:      jest.fn(async () => {}),
  auditMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info:  jest.fn(),
    error: jest.fn(),
    warn:  jest.fn((...args: any[]) => { loggerWarnCalls.push(args); }),
  },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));

jest.mock('../../src/lib/webPush',          () => ({ sendWebPushToUser: jest.fn(async () => undefined) }));
jest.mock('../../src/lib/socket',            () => ({ emitNotification: jest.fn() }));
jest.mock('../../src/lib/unsubscribeToken',  () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'tok'),
  buildUnsubscribeUrl:         jest.fn((t: string) => `https://api.boomcard.bg/api/unsubscribe?token=${t}`),
  addUnsubscribeFooter:        jest.fn((html: string) => html + '<div>unsub</div>'),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { autoCloseResolvedTickets } from '../../src/jobs/scheduler';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf-8');
}

function makeResolvedTicket(id: string): any {
  return {
    id,
    subject:    `Resolved ticket ${id}`,
    userId:     `user-${id}`,
    rootMessageId: null,
    resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    user: { email: null, firstName: null, role: 'USER' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  ticketFindManyResult = [];
  updatedManyArgs      = [];
  loggerWarnCalls      = [];
  jest.clearAllMocks();

  const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
  mock.helpTicket.findMany   = jest.fn(async () => ticketFindManyResult);
  mock.helpTicket.updateMany = jest.fn(async (args: any) => {
    updatedManyArgs.push(args);
    return { count: ticketFindManyResult.length };
  });
  mock.helpTicket.findUnique = jest.fn(async () => null);
  mock.helpTicket.findFirst  = jest.fn(async () => null);
  mock.helpTicket.update     = jest.fn(async () => ({}));
  mock.helpTicket.create     = jest.fn(async () => ({}));
  mock.helpTicket.count      = jest.fn(async () => 0);
  mock.ticketReply.findMany  = jest.fn(async () => []);
  mock.ticketReply.create    = jest.fn(async () => ({}));
  mock.ticketReply.findFirst = jest.fn(async () => null);

  const { logger } = jest.requireMock('../../src/utils/logger');
  logger.warn = jest.fn((...args: any[]) => { loggerWarnCalls.push(args); });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1 — schema.prisma HelpTicket.status default is OPEN, not NEW
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-1 — schema.prisma HelpTicket.status default is OPEN', () => {
  const schemaSrc = readSource('../../prisma/schema.prisma');

  it('HelpTicket has status TicketStatus @default(OPEN)', () => {
    expect(schemaSrc).toMatch(/status\s+TicketStatus\s+@default\(OPEN\)/);
  });

  it('NEW is NOT the default — no @default(NEW) on TicketStatus field', () => {
    // Verify the schema does not fall back to NEW anywhere in the HelpTicket model.
    // Find the HelpTicket model block and check within it.
    const modelStart = schemaSrc.indexOf('model HelpTicket {');
    const modelEnd   = schemaSrc.indexOf('\n}', modelStart) + 2;
    const modelSrc   = schemaSrc.slice(modelStart, modelEnd);
    expect(modelSrc).not.toMatch(/@default\(NEW\)/);
  });

  it('no route explicitly creates a ticket with status NEW', () => {
    const files = [
      '../../src/routes/help.routes.ts',
      '../../src/routes/partnerHelp.routes.ts',
      '../../src/routes/adminHelp.routes.ts',
    ];
    for (const f of files) {
      const src = readSource(f);
      expect(src).not.toMatch(/status:\s*['"]NEW['"]/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-2 — ticketCreatorUrl() helper provides role-aware portal links
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-2 — ticketCreatorUrl() helper in adminHelp.routes', () => {
  const src = readSource('../../src/routes/adminHelp.routes.ts');

  it('ticketCreatorUrl function is defined', () => {
    expect(src).toMatch(/function ticketCreatorUrl/);
  });

  it('ADMIN role returns /admin/help/mine link', () => {
    const fnStart = src.indexOf('function ticketCreatorUrl');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    const fnSrc   = src.slice(fnStart, fnEnd);
    expect(fnSrc).toMatch(/ADMIN[\s\S]{0,80}\/admin\/help\/mine/);
  });

  it('SUPER_ADMIN role returns /admin/help/mine link', () => {
    const fnStart = src.indexOf('function ticketCreatorUrl');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    const fnSrc   = src.slice(fnStart, fnEnd);
    expect(fnSrc).toMatch(/SUPER_ADMIN[\s\S]{0,80}\/admin\/help\/mine/);
  });

  it('PARTNER role returns /partners/help link', () => {
    const fnStart = src.indexOf('function ticketCreatorUrl');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    const fnSrc   = src.slice(fnStart, fnEnd);
    expect(fnSrc).toMatch(/PARTNER[\s\S]{0,80}\/partners\/help/);
  });

  it('function returns null for non-admin non-partner creators (USER role)', () => {
    const fnStart = src.indexOf('function ticketCreatorUrl');
    const fnEnd   = src.indexOf('\n}', fnStart) + 2;
    const fnSrc   = src.slice(fnStart, fnEnd);
    expect(fnSrc).toMatch(/return null/);
  });

  it('ticketCreatorUrl is called in the reply notification email path', () => {
    const replyStart = src.indexOf('// POST /api/admin/help/:id/reply');
    expect(replyStart).toBeGreaterThan(0);
    const replyEnd = src.indexOf('\n// PATCH', replyStart);
    const replySrc = src.slice(replyStart, replyEnd > replyStart ? replyEnd : src.length);
    expect(replySrc).toMatch(/ticketCreatorUrl/);
  });

  it('ticketCreatorUrl is called in the status-change notification email path', () => {
    const patchStart = src.indexOf('// PATCH /api/admin/help/:id');
    expect(patchStart).toBeGreaterThan(0);
    const patchEnd = src.indexOf('\n// GET /api/admin/help/', patchStart);
    const patchSrc = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);
    expect(patchSrc).toMatch(/ticketCreatorUrl/);
  });

  it('reply handler and patch handler email bodies use ticketCreatorUrl, not a hardcoded link', () => {
    // Verify the two handlers that previously hardcoded /admin/help/mine now call
    // ticketCreatorUrl and use its result (footerLink variable or equivalent).
    const replyStart = src.indexOf('// POST /api/admin/help/:id/reply');
    const replyEnd   = src.indexOf('\n// PATCH', replyStart);
    const replySrc   = src.slice(replyStart, replyEnd > replyStart ? replyEnd : src.length);

    // The PATCH handler marker in the route file.
    const patchStart = src.indexOf('// PATCH /api/admin/help/:id');
    const patchEnd   = src.indexOf('\n// GET /api/admin/help/', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // Both handlers must use ticketCreatorUrl rather than embedding the path directly.
    expect(replySrc).toMatch(/ticketCreatorUrl/);
    expect(patchSrc).toMatch(/ticketCreatorUrl/);

    // Verify the footer link is conditional (portalUrl could be null for USER creators).
    expect(replySrc).toMatch(/footerLink/);
    expect(patchSrc).toMatch(/footerLink/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-3 — admin web reply stored with channel 'WEB', not 'EMAIL'
// ─────────────────────────────────────────────────────────────────────────────

describe("BUG-3 — adminHelp POST /:id/reply uses channel: 'WEB'", () => {
  const src = readSource('../../src/routes/adminHelp.routes.ts');

  it("reply handler creates TicketReply with channel: 'WEB'", () => {
    const replyStart = src.indexOf('// POST /api/admin/help/:id/reply');
    expect(replyStart).toBeGreaterThan(0);
    const replyEnd = src.indexOf('\n// PATCH', replyStart);
    const replySrc = src.slice(replyStart, replyEnd > replyStart ? replyEnd : src.length);
    expect(replySrc).toMatch(/channel:\s*'WEB'/);
    expect(replySrc).not.toMatch(/channel:\s*'EMAIL'/);
  });

  it("auto-reply confirmation row (ticket creation) correctly retains channel: 'EMAIL'", () => {
    // The auto-reply row persisted during admin ticket creation must remain EMAIL
    // because it represents an outbound email sent to the admin who created the ticket.
    // Marker: "// POST /api/admin/help — G8:"
    const createStart = src.indexOf('// POST /api/admin/help — G8');
    expect(createStart).toBeGreaterThan(0);
    const replyHandlerStart = src.indexOf('// POST /api/admin/help/:id/reply', createStart);
    const createSrc = src.slice(createStart, replyHandlerStart > createStart ? replyHandlerStart : src.length);
    expect(createSrc).toMatch(/channel:\s*'EMAIL'/);
    expect(createSrc).toMatch(/isAutoReply:\s*true/);
  });

  it("parity: all three web reply handlers use channel: 'WEB'", () => {
    const files = [
      '../../src/routes/adminHelp.routes.ts',
      '../../src/routes/partnerHelp.routes.ts',
      '../../src/routes/help.routes.ts',
    ];
    for (const f of files) {
      const s = readSource(f);
      // Each file must contain at least one channel: 'WEB' in a ticketReply.create block.
      expect(s).toMatch(/channel:\s*'WEB'/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-4 — autoCloseResolvedTickets guards against TOCTOU via status: 'RESOLVED'
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-4 — autoCloseResolvedTickets re-checks status in updateMany WHERE', () => {
  it("updateMany WHERE clause includes status: 'RESOLVED'", async () => {
    ticketFindManyResult = [makeResolvedTicket('t-1'), makeResolvedTicket('t-2')];

    await autoCloseResolvedTickets();

    expect(updatedManyArgs.length).toBeGreaterThan(0);
    const whereClause = updatedManyArgs[0].where;
    expect(whereClause).toHaveProperty('status', 'RESOLVED');
  });

  it('a ticket whose status changed to OPEN between findMany and updateMany is excluded', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');
    ticketFindManyResult = [makeResolvedTicket('t-reopen')];

    // Simulate: updateMany returns count:0 (no rows matched the RESOLVED guard).
    mock.helpTicket.updateMany = jest.fn(async (args: any) => {
      updatedManyArgs.push(args);
      return { count: 0 };
    });

    await autoCloseResolvedTickets();

    // The WHERE clause must still include the status guard even when no rows are updated.
    expect(updatedManyArgs[0].where.status).toBe('RESOLVED');
  });

  it("source: updateMany call inside autoCloseResolvedTickets includes status: 'RESOLVED'", () => {
    const src      = readSource('../../src/jobs/scheduler.ts');
    const fnStart  = src.indexOf('export async function autoCloseResolvedTickets');
    const fnEnd    = src.indexOf('\nexport function registerScheduledJobs', fnStart);
    const fnSrc    = src.slice(fnStart, fnEnd > fnStart ? fnEnd : src.length);

    // Find the updateMany call and verify the WHERE has the status re-check.
    expect(fnSrc).toMatch(/updateMany[\s\S]{0,200}status:\s*['"]RESOLVED['"]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-5 — autoCloseResolvedTickets uses paginated loop, not a single batch
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-5 — autoCloseResolvedTickets processes backlog with paginated loop', () => {
  it('source: BATCH_SIZE constant is defined inside autoCloseResolvedTickets', () => {
    const src      = readSource('../../src/jobs/scheduler.ts');
    const fnStart  = src.indexOf('export async function autoCloseResolvedTickets');
    const fnEnd    = src.indexOf('\nexport function registerScheduledJobs', fnStart);
    const fnSrc    = src.slice(fnStart, fnEnd > fnStart ? fnEnd : src.length);
    expect(fnSrc).toMatch(/BATCH_SIZE\s*=\s*200/);
  });

  it('source: MAX_ITERATIONS cap is defined', () => {
    const src      = readSource('../../src/jobs/scheduler.ts');
    const fnStart  = src.indexOf('export async function autoCloseResolvedTickets');
    const fnEnd    = src.indexOf('\nexport function registerScheduledJobs', fnStart);
    const fnSrc    = src.slice(fnStart, fnEnd > fnStart ? fnEnd : src.length);
    expect(fnSrc).toMatch(/MAX_ITERATIONS/);
  });

  it('source: loop breaks when tickets.length < BATCH_SIZE', () => {
    const src      = readSource('../../src/jobs/scheduler.ts');
    const fnStart  = src.indexOf('export async function autoCloseResolvedTickets');
    const fnEnd    = src.indexOf('\nexport function registerScheduledJobs', fnStart);
    const fnSrc    = src.slice(fnStart, fnEnd > fnStart ? fnEnd : src.length);
    expect(fnSrc).toMatch(/tickets\.length\s*<\s*BATCH_SIZE[\s\S]{0,20}break/);
  });

  it('source: warning is emitted when iteration cap is reached', () => {
    const src      = readSource('../../src/jobs/scheduler.ts');
    const fnStart  = src.indexOf('export async function autoCloseResolvedTickets');
    const fnEnd    = src.indexOf('\nexport function registerScheduledJobs', fnStart);
    const fnSrc    = src.slice(fnStart, fnEnd > fnStart ? fnEnd : src.length);
    expect(fnSrc).toMatch(/iterations\s*>=\s*MAX_ITERATIONS/);
    expect(fnSrc).toMatch(/logger\.warn/);
  });

  it('behavioral: multiple iterations are executed when each batch is full', async () => {
    const { prisma: mock } = jest.requireMock('../../src/lib/prisma');

    // First call returns a full batch; second call returns an empty batch (done).
    const fullBatch  = Array.from({ length: 200 }, (_, i) => makeResolvedTicket(`t-${i}`));
    const emptyBatch: any[] = [];
    let callCount = 0;

    mock.helpTicket.findMany = jest.fn(async () => {
      return callCount++ === 0 ? fullBatch : emptyBatch;
    });
    mock.helpTicket.updateMany = jest.fn(async (args: any) => {
      updatedManyArgs.push(args);
      return { count: fullBatch.length };
    });

    ticketFindManyResult = fullBatch;

    await autoCloseResolvedTickets();

    // findMany should be called at least twice: once for the full batch, once to detect empty.
    expect(callCount).toBeGreaterThanOrEqual(2);
    // updateMany should be called for the first batch.
    expect(updatedManyArgs.length).toBeGreaterThanOrEqual(1);
    expect(updatedManyArgs[0].data.status).toBe('CLOSED');
  });

  it('behavioral: single partial batch still closes all tickets', async () => {
    ticketFindManyResult = Array.from({ length: 5 }, (_, i) => makeResolvedTicket(`t-${i}`));

    await autoCloseResolvedTickets();

    expect(updatedManyArgs.length).toBeGreaterThan(0);
    expect(updatedManyArgs[0].data.status).toBe('CLOSED');
    expect(updatedManyArgs[0].where.id.in).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-6 — partnerHelp and help reply handlers persist messageId before create
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-6 — web reply handlers build threading before ticketReply.create', () => {
  it('partnerHelp: buildTicketHeaders call appears before ticketReply.create', () => {
    const src = readSource('../../src/routes/partnerHelp.routes.ts');

    // Find the partner reply handler block.
    const handlerStart = src.indexOf('// POST /api/partner/help/tickets/:id/reply');
    expect(handlerStart).toBeGreaterThan(0);
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    const headersBuildIdx  = handlerSrc.indexOf('buildTicketHeaders(');
    const replyCreateIdx   = handlerSrc.indexOf('prisma.ticketReply.create(');
    expect(headersBuildIdx).toBeGreaterThan(0);
    expect(replyCreateIdx).toBeGreaterThan(0);
    expect(headersBuildIdx).toBeLessThan(replyCreateIdx);
  });

  it('partnerHelp: messageId from threading is stored on the TicketReply row', () => {
    const src = readSource('../../src/routes/partnerHelp.routes.ts');

    const handlerStart = src.indexOf('// POST /api/partner/help/tickets/:id/reply');
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    // The create data object must reference the threading variable's messageId.
    expect(handlerSrc).toMatch(/messageId:\s*\w+Threading\.messageId/);
  });

  it('help.routes: buildTicketHeaders call appears before ticketReply.create in user reply', () => {
    const src = readSource('../../src/routes/help.routes.ts');

    const handlerStart = src.indexOf("POST /api/help/tickets/:id/reply");
    expect(handlerStart).toBeGreaterThan(0);
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    const headersBuildIdx  = handlerSrc.indexOf('buildTicketHeaders(');
    const replyCreateIdx   = handlerSrc.indexOf('prisma.ticketReply.create(');
    expect(headersBuildIdx).toBeGreaterThan(0);
    expect(replyCreateIdx).toBeGreaterThan(0);
    expect(headersBuildIdx).toBeLessThan(replyCreateIdx);
  });

  it('help.routes: messageId from threading is stored on the TicketReply row', () => {
    const src = readSource('../../src/routes/help.routes.ts');

    const handlerStart = src.indexOf("POST /api/help/tickets/:id/reply");
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    // Variable may be named `threading` or `xThreading` — match either form.
    expect(handlerSrc).toMatch(/messageId:\s*\w*[Tt]hreading\.messageId/);
  });

  it('parity: all three reply handlers persist messageId before creating the TicketReply row', () => {
    const files = [
      { path: '../../src/routes/adminHelp.routes.ts',   handlerMarker: '// POST /api/admin/help/:id/reply' },
      { path: '../../src/routes/partnerHelp.routes.ts', handlerMarker: '// POST /api/partner/help/tickets/:id/reply' },
      { path: '../../src/routes/help.routes.ts',        handlerMarker: 'POST /api/help/tickets/:id/reply' },
    ];

    for (const { path: filePath, handlerMarker } of files) {
      const src = readSource(filePath);
      const start = src.indexOf(handlerMarker);
      expect(start).toBeGreaterThan(0);
      const end     = src.indexOf('\nexport default', start);
      const handler = src.slice(start, end > start ? end : src.length);

      const buildIdx  = handler.indexOf('buildTicketHeaders(');
      const createIdx = handler.indexOf('prisma.ticketReply.create(');
      expect(buildIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(-1);
      expect(buildIdx).toBeLessThan(createIdx);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-7 — user reply handler does NOT call fireAutomation
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-7 — help.routes user reply handler does not fire support.reply automation', () => {
  const src = readSource('../../src/routes/help.routes.ts');

  it('fireAutomation is not imported in help.routes.ts', () => {
    const importSection = src.slice(0, src.indexOf('router.post'));
    expect(importSection).not.toMatch(/fireAutomation/);
  });

  it('fireAutomation is not called anywhere in help.routes.ts', () => {
    expect(src).not.toMatch(/fireAutomation/);
  });

  it('support.reply automation is not triggered from the user reply handler', () => {
    const handlerStart = src.indexOf("POST /api/help/tickets/:id/reply");
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);
    expect(handlerSrc).not.toMatch(/support\.reply/);
    expect(handlerSrc).not.toMatch(/fireAutomation/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-8 — spoof-guard linked ticket owned by system admin, not original owner
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP-8 — ticketInbound spoof-guard uses getSystemOwnerId, not t.userId', () => {
  const src = readSource('../../src/services/ticketInbound.service.ts');

  it('getSystemOwnerId() is called in the spoof-guard path', () => {
    // The spoof-guard block is in resolveTicket or the ingest handler.
    // Find the section that creates a linked ticket after spoof detection.
    expect(src).toMatch(/getSystemOwnerId/);
  });

  it("spoof-guard stores linkedOwnerId (getSystemOwnerId result) as linked ticket's userId", () => {
    // The userId for the linked ticket must be the system owner, not t.userId.
    // The variable is declared at the start of the spoof-guard block and used in
    // prisma.helpTicket.create further down — allow sufficient window.
    expect(src).toMatch(/linkedOwnerId[\s\S]{0,700}userId:\s*linkedOwnerId/);
  });

  it("spoof-guard does NOT use t.userId as the linked ticket's userId", () => {
    // Find the spoof-guard linked-ticket create block.
    const spoofIdx = src.indexOf('linkedOwnerId');
    expect(spoofIdx).toBeGreaterThan(0);

    const spoofWindow = src.slice(spoofIdx, spoofIdx + 600);
    // The linked ticket creation must NOT set userId to t.userId.
    expect(spoofWindow).not.toMatch(/userId:\s*t\.userId/);
  });

  it('early return when no system admin is available (null-check guard)', () => {
    // The null-check must be present to prevent creating a ticket with undefined owner.
    const linkedOwnerIdx = src.indexOf('linkedOwnerId');
    const window = src.slice(linkedOwnerIdx, linkedOwnerIdx + 300);
    expect(window).toMatch(/if\s*\(!linkedOwnerId\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-9 — DISPUTE ticket auto-creates linked Dispute record
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP-9 — DISPUTE ticket creation auto-links a Dispute record', () => {
  it('help.routes: prisma.dispute.create is called when requestType=DISPUTE', () => {
    const src = readSource('../../src/routes/help.routes.ts');
    // Find the ticket creation handler.
    const createStart = src.indexOf("POST /api/help/ticket");
    expect(createStart).toBeGreaterThan(0);
    const createEnd   = src.indexOf('\nrouter.get', createStart);
    const createSrc   = src.slice(createStart, createEnd > createStart ? createEnd : src.length);

    expect(createSrc).toMatch(/requestType === 'DISPUTE'/);
    expect(createSrc).toMatch(/prisma\.dispute\.create/);
  });

  it('help.routes: linked Dispute is created with userId and ticketId', () => {
    const src = readSource('../../src/routes/help.routes.ts');
    const createStart = src.indexOf("POST /api/help/ticket");
    const createEnd   = src.indexOf('\nrouter.get', createStart);
    const createSrc   = src.slice(createStart, createEnd > createStart ? createEnd : src.length);

    // Find the dispute.create data block.
    const disputeIdx = createSrc.indexOf('prisma.dispute.create');
    const disputeWindow = createSrc.slice(disputeIdx, disputeIdx + 300);
    expect(disputeWindow).toMatch(/userId/);
    expect(disputeWindow).toMatch(/ticketId/);
  });

  it('help.routes: DISPUTE auto-link is fire-and-forget (.catch on the promise)', () => {
    const src = readSource('../../src/routes/help.routes.ts');
    const createStart = src.indexOf("POST /api/help/ticket");
    const createEnd   = src.indexOf('\nrouter.get', createStart);
    const createSrc   = src.slice(createStart, createEnd > createStart ? createEnd : src.length);

    // Must use .catch() so a Dispute create failure does not fail the ticket creation.
    const disputeIdx  = createSrc.indexOf('prisma.dispute.create');
    const catchWindow = createSrc.slice(disputeIdx, disputeIdx + 400);
    expect(catchWindow).toMatch(/\.catch\(/);
  });

  it('partnerHelp.routes: prisma.dispute.create is called when requestType=DISPUTE', () => {
    const src = readSource('../../src/routes/partnerHelp.routes.ts');
    // Find the partner ticket creation handler.
    const createStart = src.indexOf("// POST /api/partner/help/ticket");
    expect(createStart).toBeGreaterThan(0);
    const createEnd   = src.indexOf('\n// GET /api/partner/help', createStart);
    const createSrc   = src.slice(createStart, createEnd > createStart ? createEnd : src.length);

    expect(createSrc).toMatch(/requestType === 'DISPUTE'/);
    expect(createSrc).toMatch(/prisma\.dispute\.create/);
  });

  it('partnerHelp.routes: linked Dispute is created with userId and ticketId', () => {
    const src = readSource('../../src/routes/partnerHelp.routes.ts');
    const createStart = src.indexOf("// POST /api/partner/help/ticket");
    const createEnd   = src.indexOf('\n// GET /api/partner/help', createStart);
    const createSrc   = src.slice(createStart, createEnd > createStart ? createEnd : src.length);

    const disputeIdx = createSrc.indexOf('prisma.dispute.create');
    const disputeWindow = createSrc.slice(disputeIdx, disputeIdx + 300);
    expect(disputeWindow).toMatch(/userId/);
    expect(disputeWindow).toMatch(/ticketId/);
  });

  it('DisputeSubjectType is imported in both route files that create Disputes', () => {
    const helpSrc    = readSource('../../src/routes/help.routes.ts');
    const partnerSrc = readSource('../../src/routes/partnerHelp.routes.ts');
    expect(helpSrc).toMatch(/DisputeSubjectType/);
    expect(partnerSrc).toMatch(/DisputeSubjectType/);
  });

  it("default subjectType is RECEIPT when auto-creating the Dispute", () => {
    const helpSrc    = readSource('../../src/routes/help.routes.ts');
    const partnerSrc = readSource('../../src/routes/partnerHelp.routes.ts');
    expect(helpSrc).toMatch(/DisputeSubjectType\.RECEIPT/);
    expect(partnerSrc).toMatch(/DisputeSubjectType\.RECEIPT/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-10 — INTERNAL channel documented in schema and TS type
// ─────────────────────────────────────────────────────────────────────────────

describe("GAP-10 — 'INTERNAL' channel is documented in schema comment and TS type", () => {
  it("schema.prisma channel field comment mentions 'INTERNAL'", () => {
    const schemaSrc  = readSource('../../prisma/schema.prisma');
    const modelStart = schemaSrc.indexOf('model TicketReply {');
    const modelEnd   = schemaSrc.indexOf('\n}', modelStart) + 2;
    const modelSrc   = schemaSrc.slice(modelStart, modelEnd);
    expect(modelSrc).toMatch(/INTERNAL/);
  });

  it("schema.prisma INTERNAL comment explains it is a system-generated note", () => {
    const schemaSrc  = readSource('../../prisma/schema.prisma');
    const modelStart = schemaSrc.indexOf('model TicketReply {');
    const modelEnd   = schemaSrc.indexOf('\n}', modelStart) + 2;
    const modelSrc   = schemaSrc.slice(modelStart, modelEnd);
    // The comment must say what INTERNAL means, not just list the value.
    expect(modelSrc).toMatch(/INTERNAL[\s\S]{0,80}system/i);
  });

  it("adminHelp.service.ts TicketReply channel type includes 'INTERNAL'", () => {
    const src = readSource('../../../partner-dashboard/src/services/adminHelp.service.ts');
    const replyStart = src.indexOf('export interface TicketReply');
    expect(replyStart).toBeGreaterThan(0);
    const replyEnd = src.indexOf('\n}', replyStart) + 2;
    const replyBlock = src.slice(replyStart, replyEnd);
    expect(replyBlock).toMatch(/'INTERNAL'/);
  });

  it("adminHelp.service.ts TicketReply channel type includes 'WEB' and 'EMAIL'", () => {
    const src = readSource('../../../partner-dashboard/src/services/adminHelp.service.ts');
    const replyStart = src.indexOf('export interface TicketReply');
    const replyEnd   = src.indexOf('\n}', replyStart) + 2;
    const replyBlock = src.slice(replyStart, replyEnd);
    expect(replyBlock).toMatch(/'WEB'/);
    expect(replyBlock).toMatch(/'EMAIL'/);
  });

  it('adminHelp.service.ts TicketReply.author is nullable (system notes have null author)', () => {
    const src = readSource('../../../partner-dashboard/src/services/adminHelp.service.ts');
    const replyStart = src.indexOf('export interface TicketReply');
    const replyEnd   = src.indexOf('\n}', replyStart) + 2;
    const replyBlock = src.slice(replyStart, replyEnd);
    // author must accept null to handle INTERNAL / auto-reply rows.
    expect(replyBlock).toMatch(/author:\s*TicketUser\s*\|\s*null/);
  });
});
