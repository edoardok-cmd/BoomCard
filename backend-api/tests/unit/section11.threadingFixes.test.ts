/**
 * §11 threading-fix regression tests — five bugs fixed in this pass:
 *
 *   Bug 7  — reject endpoint called buildTicketHeaders({ticketId}) with no
 *             inReplyTo/references → rejection email started a new thread.
 *             Fix: query prior reply messageIds, build refChain, pass to
 *             buildTicketHeaders exactly as the admin-reply handler does.
 *
 *   Bug 8  — PATCH status-change notification had the same threading omission.
 *             Fix: identical refChain pattern added before the email send.
 *
 *   Bug 9  — autoCloseResolvedTickets notification email had the same omission.
 *             Fix: rootMessageId added to select; passed as inReplyTo/references.
 *             Function also exported so this test can call it directly.
 *
 *   Bug 10 — partnerHelp reply notification emails (assignee + support fallback)
 *             called buildTicketHeaders({ticketId}) with no threading.
 *             Fix: ticket.rootMessageId used as the single-element anchor chain.
 *
 *   Bug 11 — AdminHelpMinePage emptyMessage condition omitted requestTypeFilter,
 *             so filtering by requestType with no results showed the "Submit
 *             new ticket" CTA instead of the neutral "No matching results" text.
 *             Fix: !requestTypeFilter added to the guard condition.
 */

// ─── Shared spy state ─────────────────────────────────────────────────────────

const emailSendCalls: any[] = [];

// ─── Prisma mock ─────────────────────────────────────────────────────────────

// Mutable fixtures — reset before each test.
let helpTicketRows: any[] = [];
let ticketReplyRows: any[] = [];

jest.mock('../../src/lib/prisma', () => {
  const helpTicket = {
    findMany: jest.fn(async (args: any) => {
      return helpTicketRows.filter((t: any) => {
        if (args?.where?.status && t.status !== args.where.status) return false;
        // Enforce the OR date filter so a missing cutoff guard is caught by tests.
        // autoCloseResolvedTickets passes: OR [ {resolvedAt:{lte}}, {resolvedAt:null,updatedAt:{lte}} ]
        if (Array.isArray(args?.where?.OR)) {
          const passesDate = args.where.OR.some((clause: any) => {
            if (clause.resolvedAt?.lte) {
              return t.resolvedAt != null && new Date(t.resolvedAt) <= new Date(clause.resolvedAt.lte);
            }
            if (clause.resolvedAt === null && clause.updatedAt?.lte) {
              return t.resolvedAt == null && t.updatedAt != null && new Date(t.updatedAt) <= new Date(clause.updatedAt.lte);
            }
            return false;
          });
          if (!passesDate) return false;
        }
        return true;
      });
    }),
    updateMany: jest.fn(async () => ({ count: helpTicketRows.length })),
  };
  const ticketReply = {
    findMany: jest.fn(async (args: any) => {
      const ticketId = args?.where?.ticketId;
      return ticketReplyRows.filter((r: any) => {
        if (ticketId && r.ticketId !== ticketId) return false;
        // messageId: { not: null } filter
        if (args?.where?.messageId?.not === null && r.messageId === null) return false;
        return true;
      });
    }),
  };
  const client: any = { helpTicket, ticketReply };
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
  };
});

// ─── Minimal stubs for scheduler dependencies ─────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
  auditMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyAdminOps: jest.fn(async () => undefined),
    notifyAdminCashbackExpiryAnomaly: jest.fn(async () => undefined),
    notifyAdminSchedulerFailure: jest.fn(async () => undefined),
  },
}));

// Stub out all other scheduler imports that try to pull in heavy service trees.
jest.mock('../../src/jobs/paysera-renewal', () => ({ processPayseraRenewals: jest.fn() }));
jest.mock('../../src/jobs/pending-payment-reminders', () => ({
  processPendingPaymentReminders: jest.fn(),
  cleanupExpiredPendingPayments: jest.fn(),
}));
jest.mock('../../src/jobs/renewal-reminders', () => ({ runRenewalReminders: jest.fn() }));
jest.mock('../../src/jobs/user-risk-sweep', () => ({ runUserRiskSweep: jest.fn() }));
jest.mock('../../src/lib/automationDispatcher', () => ({ fireAutomation: jest.fn() }));
jest.mock('../../src/utils/payoutThreshold', () => ({ getPayoutThresholdBGN: jest.fn(async () => 50) }));
jest.mock('../../src/utils/systemSettings', () => ({ getSystemSettingInt: jest.fn(async () => 60) }));

// ─── Subject under test ───────────────────────────────────────────────────────

import { autoCloseResolvedTickets } from '../../src/jobs/scheduler';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResolvedTicket(overrides: Partial<any> = {}) {
  return {
    id: `ticket-${Math.random().toString(36).slice(2, 8)}`,
    subject: 'Test ticket',
    status: 'RESOLVED',
    userId: 'user-1',
    rootMessageId: null,
    user: { email: 'user@example.com', firstName: 'Ada' },
    resolvedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
    updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  helpTicketRows = [];
  ticketReplyRows = [];
  emailSendCalls.length = 0;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 9 — autoCloseResolvedTickets email threading
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 9 — autoCloseResolvedTickets email threading', () => {
  it('sends auto-close email with In-Reply-To and References when ticket has rootMessageId', async () => {
    const root = '<root-abc@mail.boomcard.bg>';
    helpTicketRows.push(makeResolvedTicket({ rootMessageId: root }));

    await autoCloseResolvedTickets();

    expect(emailSendCalls).toHaveLength(1);
    const headers = emailSendCalls[0].headers;
    expect(headers['In-Reply-To']).toBe(root);
    expect(headers['References']).toContain(root);
  });

  it('sends auto-close email without In-Reply-To/References when ticket has no rootMessageId', async () => {
    helpTicketRows.push(makeResolvedTicket({ rootMessageId: null }));

    await autoCloseResolvedTickets();

    expect(emailSendCalls).toHaveLength(1);
    const headers = emailSendCalls[0].headers;
    // No rootMessageId → no threading headers (buildTicketHeaders skips In-Reply-To
    // when inReplyTo is null/undefined)
    expect(headers['In-Reply-To']).toBeUndefined();
    expect(headers['References']).toBeUndefined();
  });

  it('sends one email per closed ticket', async () => {
    helpTicketRows.push(
      makeResolvedTicket({ id: 't1', rootMessageId: '<r1@mail.boomcard.bg>' }),
      makeResolvedTicket({ id: 't2', rootMessageId: '<r2@mail.boomcard.bg>' }),
    );

    await autoCloseResolvedTickets();

    expect(emailSendCalls).toHaveLength(2);
    // Each email references its own ticket's rootMessageId
    const ids = emailSendCalls.map((e) => e.headers['In-Reply-To']);
    expect(ids).toContain('<r1@mail.boomcard.bg>');
    expect(ids).toContain('<r2@mail.boomcard.bg>');
  });

  it('skips email when ticket has no user email', async () => {
    helpTicketRows.push(makeResolvedTicket({
      rootMessageId: '<root@mail.boomcard.bg>',
      user: { email: null, firstName: 'Ghost' },
    }));

    await autoCloseResolvedTickets();

    expect(emailSendCalls).toHaveLength(0);
  });

  it('subject carries the ticket reference prefix', async () => {
    const ticketId = 'aaaabbbbccccdddd0000111122223333';
    helpTicketRows.push(makeResolvedTicket({ id: ticketId, rootMessageId: '<r@mail.boomcard.bg>' }));

    await autoCloseResolvedTickets();

    expect(emailSendCalls).toHaveLength(1);
    // buildTicketSubject uses first 8 hex chars of the ID (dashes stripped)
    expect(emailSendCalls[0].subject).toMatch(/\[#aaaabbbb\]/i);
  });

  it('does nothing when no RESOLVED tickets exist', async () => {
    // helpTicketRows is empty
    await autoCloseResolvedTickets();
    expect(emailSendCalls).toHaveLength(0);
  });

  it('updateMany sets resolvedAt: null when closing tickets', async () => {
    helpTicketRows.push(makeResolvedTicket({ rootMessageId: '<r@mail.boomcard.bg>' }));

    await autoCloseResolvedTickets();

    const { prisma } = jest.requireMock('../../src/lib/prisma');
    expect(prisma.helpTicket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedAt: null }) }),
    );
  });

  it('does not close a RESOLVED ticket that was resolved less than 7 days ago', async () => {
    helpTicketRows.push(makeResolvedTicket({
      rootMessageId: '<r@mail.boomcard.bg>',
      resolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // only 3 days ago
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    }));

    await autoCloseResolvedTickets();

    // Ticket is too recent — must not be closed or emailed.
    expect(emailSendCalls).toHaveLength(0);
    const { prisma } = jest.requireMock('../../src/lib/prisma');
    expect(prisma.helpTicket.updateMany).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 7 — adminHelp reject endpoint threading (static source assertion)
// Bug 8 — PATCH status-change email threading (static source assertion)
// ─────────────────────────────────────────────────────────────────────────────
// Route-level tests require a full Supertest setup. For a lighter-weight
// regression guard we assert that the critical threading code shapes exist in
// the source file: the refChain pattern and the parameterised buildTicketHeaders
// call. If someone reverts to the bare `buildTicketHeaders({ ticketId })` form
// at those call sites, the test will fail immediately.

describe('Bug 7 — reject endpoint source contains threading refChain', () => {
  let routeSource: string;
  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminHelp.routes.ts'),
      'utf8',
    );
  });

  it('reject endpoint queries prior messages for the refChain', () => {
    // The reject handler must contain the prior-message query keyed to req.params.id
    expect(routeSource).toMatch(/rejectPriorMsgs\s*=\s*await\s+prisma\.ticketReply\.findMany/);
  });

  it('reject endpoint builds a rejectRefChain array', () => {
    expect(routeSource).toContain('rejectRefChain');
  });

  it('reject endpoint passes inReplyTo: rejectRefChain.at(-1) to buildTicketHeaders', () => {
    expect(routeSource).toMatch(/inReplyTo:\s*rejectRefChain\.at\(-1\)/);
  });
});

describe('Bug 8 — PATCH status-change email source contains threading refChain', () => {
  let routeSource: string;
  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminHelp.routes.ts'),
      'utf8',
    );
  });

  it('PATCH handler queries prior messages for the refChain', () => {
    expect(routeSource).toMatch(/patchPriorMsgs\s*=\s*await\s+prisma\.ticketReply\.findMany/);
  });

  it('PATCH handler builds a patchRefChain array', () => {
    expect(routeSource).toContain('patchRefChain');
  });

  it('PATCH handler passes inReplyTo: patchRefChain.at(-1) to buildTicketHeaders', () => {
    expect(routeSource).toMatch(/inReplyTo:\s*patchRefChain\.at\(-1\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 10 — partnerHelp reply notification threading (static source assertion)
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 10 — partnerHelp reply notification source contains threading headers', () => {
  let routeSource: string;
  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    routeSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/partnerHelp.routes.ts'),
      'utf8',
    );
  });

  it('reply handler builds partnerReplyHeaders with rootMessageId', () => {
    expect(routeSource).toContain('partnerReplyHeaders');
  });

  it('reply handler uses full refChain for inReplyTo (Bug 5 fix — no longer rootMessageId-only)', () => {
    // Bug 5 fix: replaced the rootMessageId-only shortcut with a full
    // RFC 5322 refChain (rootMessageId + all prior TicketReply.messageId rows).
    expect(routeSource).toMatch(/partnerRefChain/);
    expect(routeSource).toMatch(/inReplyTo:\s*partnerRefChain\.at\(-1\)/);
  });

  it('reply handler passes full refChain array as references (Bug 5 fix)', () => {
    expect(routeSource).toMatch(/references:\s*partnerRefChain/);
  });

  it('both notification emails pass the shared partnerReplyHeaders variable', () => {
    // The fix computes `partnerReplyHeaders` once and reuses it for both email sends
    // (assignee + support fallback). Exactly 2 occurrences of `headers: partnerReplyHeaders`
    // must appear — one per sendEmail call — so neither send starts a fresh thread.
    const usageCount = (routeSource.match(/headers:\s*partnerReplyHeaders/g) ?? []).length;
    expect(usageCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug (§9 audit) — adminSettings PUT /system must reject "" for mandatory keys
// ─────────────────────────────────────────────────────────────────────────────

describe('§9 audit — adminSettings REQUIRED_KEYS rejects empty string for mandatory email keys', () => {
  let settingsSource: string;
  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    settingsSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/adminSettings.routes.ts'),
      'utf8',
    );
  });

  it('defines REQUIRED_KEYS containing from_email, office_email, support_email', () => {
    expect(settingsSource).toMatch(/REQUIRED_KEYS\s*=\s*new Set\(\[/);
    expect(settingsSource).toContain("'from_email'");
    expect(settingsSource).toContain("'office_email'");
    expect(settingsSource).toContain("'support_email'");
  });

  it('rejects empty string for REQUIRED_KEYS before the clearable split', () => {
    expect(settingsSource).toMatch(/REQUIRED_KEYS\.has\(key\)\s*&&\s*value\s*===\s*''/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug (§9 audit) — partnerHelp unassigned reply alert uses office_email not support
// ─────────────────────────────────────────────────────────────────────────────

describe('§9 audit — partnerHelp unassigned reply alert uses office_email', () => {
  let partnerHelpSource: string;
  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    partnerHelpSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/routes/partnerHelp.routes.ts'),
      'utf8',
    );
  });

  it('imports getSystemSettingStr', () => {
    expect(partnerHelpSource).toMatch(/import.*getSystemSettingStr.*from.*systemSettings/);
  });

  it('resolves office_email dynamically for the unassigned reply alert (no hardcoded support@boomcard.bg in unassigned branch)', () => {
    // The unassigned branch must use getSystemSettingStr('office_email', ...) rather than
    // a hardcoded support@boomcard.bg address.
    expect(partnerHelpSource).toMatch(/getSystemSettingStr\(\s*'office_email'/);
    // Confirm no lone hard-coded support address remains in the unassigned branch.
    // We check by ensuring the support@ literal only appears in comments or old patterns,
    // not as a bare `to:` argument — crude but catches regressions.
    const bareToSupport = partnerHelpSource.match(/to:\s*'support@boomcard\.bg'/g);
    expect(bareToSupport).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 11 — AdminHelpMinePage requestTypeFilter missing from emptyMessage guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 11 — AdminHelpMinePage emptyMessage guard includes requestTypeFilter', () => {
  it('emptyMessage condition checks all five active filters including requestTypeFilter', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../partner-dashboard/src/pages/admin/AdminHelpMinePage.tsx'),
      'utf8',
    );

    // The guard must include requestTypeFilter so a requestType-only filter
    // shows "No matching results" rather than the "Submit new ticket" CTA.
    expect(source).toMatch(
      /!search\s*&&\s*!statusFilter\s*&&\s*!priorityFilter\s*&&\s*!categoryFilter\s*&&\s*!requestTypeFilter/,
    );
  });
});
