/**
 * §11 audit-pass 6 — regression tests for 3 bugs/gaps fixed in this pass:
 *
 *  BUG-1  adminHelp.routes PATCH /:id: when an admin manually transitions a
 *         ticket from WAITING or RESOLVED to OPEN, reopenedAt was never stamped.
 *         All other reopen paths (WEB reply handlers, email inbound) stamp it —
 *         PATCH was the only outlier. Now parity is restored.
 *
 *  BUG-2  partnerHelp.routes GET /tickets/:id: resolvedAt was absent from the
 *         select, even though reopenedAt was added in pass 5 and all other
 *         ticket-detail endpoints (help.routes, adminHelp.routes) surface it.
 *
 *  GAP-3  scheduler.autoCloseResolvedTickets: take:200 batch silently truncates
 *         when more than 200 RESOLVED tickets age past the 7-day threshold.
 *         A logger.warn is now emitted so operations can detect backlog build-up.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Shared spy state ─────────────────────────────────────────────────────────

const loggerWarnCalls: any[] = [];

// ─── Mutable fixture state ────────────────────────────────────────────────────

let ticketFindManyResult: any[] = [];
let updatedManyArgs: any[] = [];

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findMany:   jest.fn(async () => ticketFindManyResult),
    updateMany: jest.fn(async (args: any) => { updatedManyArgs.push(args); return { count: ticketFindManyResult.length }; }),
    findUnique: jest.fn(async () => null),
    findFirst:  jest.fn(async () => null),
    update:     jest.fn(async () => ({})),
    create:     jest.fn(async () => ({})),
    count:      jest.fn(async () => 0),
  };
  const ticketReply = {
    findMany: jest.fn(async () => []),
    create:   jest.fn(async () => ({})),
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

jest.mock('../../src/lib/webPush',           () => ({ sendWebPushToUser: jest.fn(async () => undefined) }));
jest.mock('../../src/lib/socket',             () => ({ emitNotification: jest.fn() }));
jest.mock('../../src/lib/unsubscribeToken',   () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'tok'),
  buildUnsubscribeUrl:         jest.fn((t: string) => `https://api.boomcard.bg/api/unsubscribe?token=${t}`),
  addUnsubscribeFooter:        jest.fn((html: string) => html + '<div>unsub</div>'),
}));

// ─── Subject under test ────────────────────────────────────────────────────────

import { autoCloseResolvedTickets } from '../../src/jobs/scheduler';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, relPath), 'utf-8');
}

function makeResolvedTicket(id: string): any {
  return {
    id,
    subject: `Resolved ticket ${id}`,
    userId: `user-${id}`,
    rootMessageId: null,
    resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    user: { email: null, firstName: null, role: 'USER' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  ticketFindManyResult = [];
  updatedManyArgs      = [];
  loggerWarnCalls.length = 0;
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
// BUG-1 — adminHelp PATCH /:id stamps reopenedAt on WAITING/RESOLVED → OPEN
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-1 — adminHelp PATCH stamps reopenedAt on manual OPEN transitions', () => {
  const src = readSource('../../src/routes/adminHelp.routes.ts');

  it('data object type includes reopenedAt field', () => {
    // The data declaration must carry reopenedAt in its type annotation so
    // TypeScript accepts the assignment.
    expect(src).toMatch(/data:\s*\{[^}]*reopenedAt\?:\s*Date/);
  });

  it('reopenedAt is stamped when new status is OPEN and prior status is RESOLVED', () => {
    // The PATCH handler must gate the reopenedAt stamp on status==='OPEN' and
    // ticket.status in [RESOLVED, WAITING], then assign data.reopenedAt = new Date().
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    expect(patchStart).toBeGreaterThan(0);
    const patchEnd = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // The if-condition must reference status === 'OPEN' AND RESOLVED.
    expect(patchSrc).toMatch(/status === 'OPEN'[\s\S]{0,100}RESOLVED/);
    // The assignment must appear nearby.
    expect(patchSrc).toMatch(/data\.reopenedAt\s*=\s*new Date\(\)/);
  });

  it('reopenedAt is stamped when new status is OPEN and prior status is WAITING', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // The condition must cover WAITING — not only RESOLVED.
    expect(patchSrc).toMatch(/status === 'OPEN'[\s\S]{0,100}WAITING/);
    expect(patchSrc).toMatch(/data\.reopenedAt\s*=\s*new Date\(\)/);
  });

  it('reopenedAt stamp is gated on status === OPEN (forward transitions are safe)', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // Verify the guard: `if (status === 'OPEN' && ...)` — the assignment must be
    // inside a block that requires status to equal 'OPEN'.
    // Find the position of data.reopenedAt = new Date() and check that
    // `status === 'OPEN'` appears within 200 chars before it.
    const assignIdx = patchSrc.indexOf("data.reopenedAt = new Date()");
    expect(assignIdx).toBeGreaterThan(0);
    const window = patchSrc.slice(Math.max(0, assignIdx - 200), assignIdx);
    expect(window).toMatch(/status === 'OPEN'/);
  });

  it('reopenedAt stamp is inside the same status-change block as resolvedAt handling', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // Both resolvedAt and reopenedAt must be handled inside the
    // `if (status && Object.values(TicketStatus).includes...)` block.
    const statusBlockStart = patchSrc.indexOf("data.status = status as TicketStatus");
    const statusBlockEnd   = patchSrc.indexOf("if (priority &&", statusBlockStart);
    const statusBlock      = patchSrc.slice(statusBlockStart, statusBlockEnd > statusBlockStart ? statusBlockEnd : patchSrc.length);

    expect(statusBlock).toMatch(/resolvedAt/);
    // Assignment style: data.reopenedAt = new Date()
    expect(statusBlock).toMatch(/data\.reopenedAt\s*=\s*new Date\(\)/);
  });

  it('parity: all WEB-channel reopen paths now stamp reopenedAt (cross-file check)', () => {
    // Every route that transitions a ticket to OPEN from WAITING/RESOLVED must
    // include reopenedAt: new Date(). Verify all three route files.
    const files = [
      '../../src/routes/help.routes.ts',
      '../../src/routes/partnerHelp.routes.ts',
      '../../src/routes/adminHelp.routes.ts',
    ];
    for (const f of files) {
      const s = readSource(f);
      expect(s).toMatch(/reopenedAt:\s*new Date\(\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-2 — partnerHelp GET /tickets/:id now surfaces resolvedAt
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-2 — partnerHelp GET /tickets/:id exposes resolvedAt', () => {
  const src = readSource('../../src/routes/partnerHelp.routes.ts');

  it('resolvedAt: true is present in the GET /tickets/:id select', () => {
    const handlerStart = src.indexOf('// GET /api/partner/help/tickets/:id — full ticket');
    expect(handlerStart).toBeGreaterThan(0);
    const handlerEnd = src.indexOf('\n// POST /api/partner', handlerStart + 1);
    const handlerSrc = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);
    expect(handlerSrc).toMatch(/resolvedAt:\s*true/);
  });

  it('resolvedAt and reopenedAt appear together in the partner ticket detail select', () => {
    const handlerStart = src.indexOf('// GET /api/partner/help/tickets/:id — full ticket');
    const handlerEnd   = src.indexOf('\n// POST /api/partner', handlerStart + 1);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    // Both timestamps must be present so the partner dashboard can render the full timeline.
    expect(handlerSrc).toMatch(/reopenedAt:\s*true/);
    expect(handlerSrc).toMatch(/resolvedAt:\s*true/);
  });

  it('consistency: all three ticket-detail endpoints surface both reopenedAt and resolvedAt', () => {
    // help.routes.ts GET /tickets/:id
    const helpSrc    = readSource('../../src/routes/help.routes.ts');
    const helpStart  = helpSrc.indexOf('GET /api/help/tickets/:id');
    const helpBlock  = helpSrc.slice(helpStart, helpStart + 600);
    expect(helpBlock).toMatch(/reopenedAt:\s*true/);
    expect(helpBlock).toMatch(/resolvedAt:\s*true/);

    // adminHelp.routes.ts GET /:id
    const adminSrc   = readSource('../../src/routes/adminHelp.routes.ts');
    const adminStart = adminSrc.indexOf('// GET /api/admin/help/:id — full ticket');
    const adminBlock = adminSrc.slice(adminStart, adminStart + 800);
    expect(adminBlock).toMatch(/reopenedAt:\s*true/);
    expect(adminBlock).toMatch(/resolvedAt:\s*true/);

    // partnerHelp.routes.ts GET /tickets/:id (the one we just fixed)
    const partnerStart = src.indexOf('// GET /api/partner/help/tickets/:id — full ticket');
    const partnerEnd   = src.indexOf('\n// POST /api/partner', partnerStart + 1);
    const partnerBlock = src.slice(partnerStart, partnerEnd > partnerStart ? partnerEnd : src.length);
    expect(partnerBlock).toMatch(/reopenedAt:\s*true/);
    expect(partnerBlock).toMatch(/resolvedAt:\s*true/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-3 — autoCloseResolvedTickets emits a warn when batch limit is hit
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP-3 — autoCloseResolvedTickets warns when batch limit is reached', () => {
  it('no warning emitted when fewer than 200 tickets are closed', async () => {
    ticketFindManyResult = Array.from({ length: 5 }, (_, i) => makeResolvedTicket(`t-${i}`));

    await autoCloseResolvedTickets();

    const batchWarn = loggerWarnCalls.find((args) =>
      args.some((a: any) => typeof a === 'string' && a.includes('batch limit'))
    );
    expect(batchWarn).toBeUndefined();
  });

  it('no warning emitted for exactly 199 tickets', async () => {
    ticketFindManyResult = Array.from({ length: 199 }, (_, i) => makeResolvedTicket(`t-${i}`));

    await autoCloseResolvedTickets();

    const batchWarn = loggerWarnCalls.find((args) =>
      args.some((a: any) => typeof a === 'string' && a.includes('batch limit'))
    );
    expect(batchWarn).toBeUndefined();
  });

  it('warning IS emitted when exactly 200 tickets are processed (limit hit)', async () => {
    ticketFindManyResult = Array.from({ length: 200 }, (_, i) => makeResolvedTicket(`t-${i}`));

    await autoCloseResolvedTickets();

    const batchWarn = loggerWarnCalls.find((args) =>
      args.some((a: any) => typeof a === 'string' && a.includes('batch limit'))
    );
    expect(batchWarn).toBeDefined();
  });

  it('warning message mentions carry-over to the next nightly run', async () => {
    ticketFindManyResult = Array.from({ length: 200 }, (_, i) => makeResolvedTicket(`t-${i}`));

    await autoCloseResolvedTickets();

    const warnMsg = loggerWarnCalls
      .flatMap((args) => args)
      .filter((a: any) => typeof a === 'string')
      .join(' ');
    expect(warnMsg).toMatch(/carry over|next.*run|additional/i);
  });

  it('batch still closes all 200 tickets even when warning is emitted', async () => {
    ticketFindManyResult = Array.from({ length: 200 }, (_, i) => makeResolvedTicket(`t-${i}`));

    await autoCloseResolvedTickets();

    expect(updatedManyArgs.length).toBeGreaterThan(0);
    expect(updatedManyArgs[0].data.status).toBe('CLOSED');
  });

  it('source: logger.warn call is present inside autoCloseResolvedTickets', () => {
    const src          = readSource('../../src/jobs/scheduler.ts');
    const fnStart      = src.indexOf('export async function autoCloseResolvedTickets');
    const fnEnd        = src.indexOf('\nexport function registerScheduledJobs', fnStart);
    const fnSrc        = src.slice(fnStart, fnEnd > fnStart ? fnEnd : src.length);
    // The function must call logger.warn when tickets.length === 200.
    expect(fnSrc).toMatch(/tickets\.length === 200/);
    expect(fnSrc).toMatch(/logger\.warn/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-4 — adminHelp PATCH /:id preserves resolvedAt when patching to CLOSED
// ─────────────────────────────────────────────────────────────────────────────
// When an admin manually patches a RESOLVED ticket to CLOSED, resolvedAt must
// NOT be cleared. CLOSED is terminal; preserving resolvedAt keeps the audit
// record of when the ticket was resolved (vs. when it was closed, captured
// by updatedAt). This parallels the autoCloseResolvedTickets scheduler fix
// (BUG-4 in auditFixes5) that prevents the same erasure in the bulk job.

describe('GAP-4 — adminHelp PATCH /:id preserves resolvedAt on RESOLVED → CLOSED', () => {
  const src = readSource('../../src/routes/adminHelp.routes.ts');

  it('else-if condition excludes CLOSED: status !== RESOLVED && status !== CLOSED', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // The resolvedAt-clearing else-if must gate on both conditions:
    //   status !== 'RESOLVED' AND status !== 'CLOSED'
    expect(patchSrc).toMatch(/status !== 'RESOLVED'[\s\S]{0,30}status !== 'CLOSED'/);
  });

  it('resolvedAt is NOT cleared when target status is CLOSED (source check)', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // The resolvedAt-clearing else-if condition must reference 'CLOSED' to exclude it.
    // Use the full status-change block to avoid a fragile window-size assumption.
    const statusBlockStart = patchSrc.indexOf("data.status = status as TicketStatus");
    const statusBlockEnd   = patchSrc.indexOf("if (priority &&", statusBlockStart);
    const statusBlock      = patchSrc.slice(statusBlockStart, statusBlockEnd > statusBlockStart ? statusBlockEnd : patchSrc.length);

    // Confirm the else-if condition mentions 'CLOSED' AND the null assignment follows.
    // Use two separate assertions to avoid a window-size dependency on comment length.
    expect(statusBlock).toMatch(/status !== 'CLOSED'/);
    expect(statusBlock).toMatch(/data\.resolvedAt = null/);
  });

  it('resolvedAt IS still cleared when target status is OPEN (re-open path)', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // OPEN is not RESOLVED and not CLOSED — so the else-if should still fire and
    // clear resolvedAt. Verify the condition does NOT exclude OPEN.
    expect(patchSrc).not.toMatch(/status !== 'RESOLVED'[\s\S]{0,50}status !== 'OPEN'/);
  });

  it('resolvedAt IS still set when target status is RESOLVED (forward path)', () => {
    const patchStart = src.indexOf("PATCH /api/admin/help/:id — update status");
    const patchEnd   = src.indexOf('\n// POST /api/admin/help/:id/reply', patchStart);
    const patchSrc   = src.slice(patchStart, patchEnd > patchStart ? patchEnd : src.length);

    // The first branch (status === 'RESOLVED' && ticket.status !== 'RESOLVED') must still exist.
    expect(patchSrc).toMatch(/status === 'RESOLVED'[\s\S]{0,50}ticket\.status !== 'RESOLVED'/);
    expect(patchSrc).toMatch(/data\.resolvedAt = new Date\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP-5 — partnerHelp GET /tickets/:id/replies collapses to single-query ownership
// ─────────────────────────────────────────────────────────────────────────────
// The /replies endpoint previously used findUnique (no userId filter) followed
// by a separate ownership check, returning 404 vs 403 depending on existence.
// That differential allowed any partner to enumerate ticket IDs of other partners.
// Fixed to findFirst({ where: { id, userId } }) with a single unified 404.

describe('GAP-5 — partnerHelp GET /tickets/:id/replies single-query ownership', () => {
  const src = readSource('../../src/routes/partnerHelp.routes.ts');

  it('replies handler uses findFirst not findUnique + separate check', () => {
    const handlerStart = src.indexOf('// GET /api/partner/help/tickets/:id/replies');
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    const findFirstCount  = (handlerSrc.match(/prisma\.helpTicket\.findFirst/g)  ?? []).length;
    const findUniqueCount = (handlerSrc.match(/prisma\.helpTicket\.findUnique/g) ?? []).length;
    expect(findFirstCount).toBe(1);
    expect(findUniqueCount).toBe(0);
  });

  it('the replies query filters by both id and userId simultaneously', () => {
    const handlerStart = src.indexOf('// GET /api/partner/help/tickets/:id/replies');
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    expect(handlerSrc).toMatch(/where:\s*\{[^}]*id:[^}]*userId/s);
  });

  it('replies handler returns 404 for both not-found and unauthorized (no 403)', () => {
    const handlerStart = src.indexOf('// GET /api/partner/help/tickets/:id/replies');
    const handlerEnd   = src.indexOf('\nexport default', handlerStart);
    const handlerSrc   = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : src.length);

    expect(handlerSrc).toMatch(/status\(404\)/);
    expect(handlerSrc).not.toMatch(/status\(403\)/);
  });

  it('parity: both ticket-detail routes in partnerHelp use the same ownership pattern', () => {
    // GET /tickets/:id was fixed in pass 5 (GAP-6 of auditFixes5).
    // GET /tickets/:id/replies is fixed in this pass.
    // Both must now use findFirst with userId filter and a single 404.
    const detailStart  = src.indexOf('// GET /api/partner/help/tickets/:id — full ticket');
    const detailEnd    = src.indexOf('\n// POST /api/partner', detailStart + 1);
    const detailSrc    = src.slice(detailStart, detailEnd > detailStart ? detailEnd : src.length);

    const repliesStart = src.indexOf('// GET /api/partner/help/tickets/:id/replies');
    const repliesEnd   = src.indexOf('\nexport default', repliesStart);
    const repliesSrc   = src.slice(repliesStart, repliesEnd > repliesStart ? repliesEnd : src.length);

    // Both handlers must use findFirst (not findUnique).
    expect(detailSrc).toMatch(/prisma\.helpTicket\.findFirst/);
    expect(repliesSrc).toMatch(/prisma\.helpTicket\.findFirst/);

    // Neither should contain a standalone 403.
    expect(detailSrc).not.toMatch(/status\(403\)/);
    expect(repliesSrc).not.toMatch(/status\(403\)/);
  });
});
