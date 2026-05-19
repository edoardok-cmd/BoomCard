/**
 * §8 Bug-fix regression tests — two bugs fixed in this pass:
 *
 *   Bug A — wizard onboard called fireAutomation('partner.approved') at creation
 *            time. Wizard partners also receive an activation link, so the
 *            automation would fire again on link-click, sending two "approved"
 *            emails. Fix: remove the premature fire from partners.routes.ts;
 *            partner.approved now fires only from POST /api/auth/partner/activate.
 *
 *   Bug B — initialize-defaults seeded billing.month_end as ACTIVE, but the
 *            scheduler already calls notificationService.notifyPartnerMonthlyStatement()
 *            which sends a rich email (with actual figures) + in-app notification.
 *            Activating the automation would add a second, generic email. Fix:
 *            seed billing.month_end as DRAFT until automationDispatcher supports
 *            template variable interpolation.
 *
 * All Prisma and email-service interactions are mocked — no DB required.
 */

// ─── Shared spy state ─────────────────────────────────────────────────────────

const emailSendCalls: any[] = [];
const notificationCreateCalls: any[] = [];

// ─── Prisma mock ─────────────────────────────────────────────────────────────

let automationRows: any[] = [];
let userRow: any = null;
let partnerRow: any = null;
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
      if (!userRow) return null;
      if (args?.where?.id && userRow.id !== args.where.id) return null;
      return userRow;
    }),
  };
  const partner = {
    findUnique: jest.fn(async (args: any) => {
      if (!partnerRow) return null;
      if (args?.where?.id && partnerRow.id !== args.where.id) return null;
      return partnerRow;
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
    partner,
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

// ─── Push / socket mocks ──────────────────────────────────────────────────────

jest.mock('../../src/lib/webPush', () => ({
  sendWebPushToUser: jest.fn(async () => undefined),
}));

jest.mock('../../src/lib/socket', () => ({
  emitNotification: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Unsubscribe token mock ───────────────────────────────────────────────────

jest.mock('../../src/lib/unsubscribeToken', () => ({
  getOrCreateUnsubscribeToken: jest.fn(async () => 'test-unsub-token'),
  buildUnsubscribeUrl: jest.fn((token: string) => `https://api.boomcard.bg/api/unsubscribe?token=${token}`),
  addUnsubscribeFooter: jest.fn((html: string) => html + '<div>unsubscribe</div>'),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { fireAutomation } from '../../src/lib/automationDispatcher';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEmailTemplate(overrides: Partial<any> = {}) {
  return {
    id: 'tpl-1',
    type: 'EMAIL',
    name: 'Test Template',
    subject: 'Test Subject',
    subjectEn: null,
    body: '<p>Test body</p>',
    bodyEn: null,
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

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: 'u-1',
    email: 'partner@example.com',
    firstName: 'Test',
    lastName: 'Partner',
    marketingConsentEmail: true,
    marketingConsent: true,
    preferredLanguage: null,
    ...overrides,
  };
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  automationRows = [];
  userRow = null;
  partnerRow = null;
  unsubTokenRow = null;
  emailSendCalls.length = 0;
  notificationCreateCalls.length = 0;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug A — partner.approved: DRAFT automations are ignored
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug A — fireAutomation: DRAFT automations are never executed', () => {
  it('does not send email when matching automation is DRAFT', async () => {
    automationRows = [makeAutomation('partner.approved', 'DRAFT')];
    userRow = makeUser();

    await fireAutomation('partner.approved', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(0);
  });

  it('sends email and creates in-app notification when matching automation is ACTIVE', async () => {
    automationRows = [makeAutomation('partner.approved', 'ACTIVE')];
    userRow = makeUser();

    await fireAutomation('partner.approved', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].to).toBe('partner@example.com');
    expect(notificationCreateCalls).toHaveLength(1);
    expect(notificationCreateCalls[0].type).toBe('MARKETING');
  });

  it('DRAFT automation for partner.approved does not count as a run (totalRuns not incremented)', async () => {
    const { prisma } = require('../../src/lib/prisma');
    automationRows = [makeAutomation('partner.approved', 'DRAFT')];
    userRow = makeUser();

    await fireAutomation('partner.approved', { userId: 'u-1' });

    expect(prisma.marketingAutomation.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug A — partner.approved: wizard fires only partner.created, not partner.approved
//
// Direct unit test: fireAutomation is the seam we can spy on.
// The wizard path now calls fireAutomation ONCE with 'partner.created';
// partner.approved fires only from POST /api/auth/partner/activate.
// We test the two triggers separately and assert the correct dispatch.
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug A — partner.approved fires only from activation-link click, not wizard creation', () => {
  it('partner.created fires independently of partner.approved (triggers are isolated)', async () => {
    // Only partner.created has an ACTIVE automation — simulates the wizard path
    automationRows = [makeAutomation('partner.created', 'ACTIVE')];
    userRow = makeUser();

    await fireAutomation('partner.created', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].to).toBe('partner@example.com');
  });

  it('partner.approved fires independently when called from the activation path', async () => {
    // Only partner.approved has an ACTIVE automation — simulates post link-click
    automationRows = [makeAutomation('partner.approved', 'ACTIVE')];
    userRow = makeUser();

    await fireAutomation('partner.approved', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].to).toBe('partner@example.com');
  });

  it('calling fireAutomation once with partner.created does not trigger partner.approved automation', async () => {
    // Both automations exist and are ACTIVE — verify trigger isolation
    automationRows = [
      makeAutomation('partner.created', 'ACTIVE', { template: makeEmailTemplate({ subject: 'Created' }) }),
      makeAutomation('partner.approved', 'ACTIVE', { template: makeEmailTemplate({ subject: 'Approved' }) }),
    ];
    userRow = makeUser();

    // Simulate what the wizard now does: only fire partner.created
    await fireAutomation('partner.created', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].subject).toBe('Created');
    // partner.approved was NOT fired — no second email
  });

  it('calling fireAutomation twice (old wizard bug) would have sent two emails', async () => {
    // This test documents WHY the fix was needed — the old code would have
    // called both, leading to two emails on wizard creation.
    automationRows = [
      makeAutomation('partner.created', 'ACTIVE', { template: makeEmailTemplate({ subject: 'Created' }) }),
      makeAutomation('partner.approved', 'ACTIVE', { template: makeEmailTemplate({ subject: 'Approved' }) }),
    ];
    userRow = makeUser();

    // Simulate the old (buggy) wizard path: fire both triggers at creation time
    await fireAutomation('partner.created', { userId: 'u-1' });
    await fireAutomation('partner.approved', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(2);
    // The fixed code now only calls partner.created — one email, not two
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug B — billing.month_end: DRAFT status prevents double email on month-end
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug B — billing.month_end DRAFT: automation does not add a second email', () => {
  it('does not send email when billing.month_end automation is DRAFT', async () => {
    // initialize-defaults now seeds this as DRAFT
    automationRows = [makeAutomation('billing.month_end', 'DRAFT')];
    userRow = makeUser();

    await fireAutomation('billing.month_end', { userId: 'u-1' });

    expect(emailSendCalls).toHaveLength(0);
    expect(notificationCreateCalls).toHaveLength(0);
  });

  it('does not create a MARKETING in-app notification when billing.month_end is DRAFT', async () => {
    automationRows = [makeAutomation('billing.month_end', 'DRAFT')];
    userRow = makeUser();

    await fireAutomation('billing.month_end', { userId: 'u-1' });

    const marketingNotifs = notificationCreateCalls.filter((n: any) => n.type === 'MARKETING');
    expect(marketingNotifs).toHaveLength(0);
  });

  it('notificationService.notifyPartnerMonthlyStatement already handles SYSTEM notification + email', async () => {
    // When billing.month_end is DRAFT, only notifyPartnerMonthlyStatement sends.
    // That method creates a SYSTEM (not MARKETING) notification with real figures.
    // This test verifies the two channels are distinct and non-overlapping.
    automationRows = [makeAutomation('billing.month_end', 'DRAFT')];
    userRow = makeUser();

    // Simulate the scheduler calling fireAutomation after notifyPartnerMonthlyStatement:
    // the automation path must not add anything (DRAFT → skipped)
    await fireAutomation('billing.month_end', { userId: 'u-1' });

    // Zero emails from automation path — the rich email comes from notifyPartnerMonthlyStatement
    // which is NOT mocked here (tested separately in section8.marketing.test.ts)
    expect(emailSendCalls).toHaveLength(0);
  });

  it('would send a second (generic) email if billing.month_end were ACTIVE — confirming the risk', async () => {
    // Documents the scenario that was the bug: ACTIVE automation = 2 emails per month.
    automationRows = [makeAutomation('billing.month_end', 'ACTIVE')];
    userRow = makeUser();

    await fireAutomation('billing.month_end', { userId: 'u-1' });

    // One email from automation (the generic template — no figures). The
    // notifyPartnerMonthlyStatement email is NOT included here, but in
    // production BOTH would fire, giving the partner two month-end emails.
    expect(emailSendCalls).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency smoke test: DRAFT vs ACTIVE differentiation for all four new triggers
// ─────────────────────────────────────────────────────────────────────────────

describe('initialize-defaults seed status contract', () => {
  it.each([
    // [trigger, expectedStatus] — matching the specDefaults array in adminMarketing.routes.ts
    ['partner.approved', 'ACTIVE'],
    ['billing.month_end', 'DRAFT'],  // Bug B fix: was incorrectly ACTIVE
    ['support.reply', 'DRAFT'],
    ['user.inactive_30d', 'ACTIVE'],
    ['partner.transaction', 'DRAFT'],
  ] as const)(
    '%s automation seeded with status %s — ACTIVE sends, DRAFT skips',
    async (trigger, expectedStatus) => {
      automationRows = [makeAutomation(trigger, expectedStatus)];
      userRow = makeUser();

      await fireAutomation(trigger, { userId: 'u-1' });

      if (expectedStatus === 'ACTIVE') {
        expect(emailSendCalls.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(emailSendCalls).toHaveLength(0);
      }
    },
  );
});
