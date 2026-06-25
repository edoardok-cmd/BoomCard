/**
 * §9 admin-settings regression tests — two fixes from this audit pass:
 *
 *   Fix 1 — PUT /api/admin/settings/system null-value guard: a non-string value
 *            (null, number, boolean) arriving in the settings object now returns
 *            400 instead of silently coercing to "null"/"0" and misleading
 *            downstream validators (e.g. EMAIL_RE.test(null) would match "null").
 *
 *   Fix 2 — POST /api/partner/help/ticket confirmation email: the office contact
 *            address was hardcoded to "office@boomcard.bg". Now reads from
 *            getSystemSettingStr('office_email', 'office@boomcard.bg') so admins
 *            can change it in the system-settings UI without a code deployment.
 *
 * All Prisma and external-service interactions are mocked — no DB required.
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    user: { findUnique: jest.fn(async () => ({ firstName: 'Test', lastName: 'Admin', email: 'admin@test.com' })) },
    systemSetting: {
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    systemSettingHistory: {
      create: jest.fn(async () => ({})),
    },
    helpTicket: {
      create: jest.fn(async (args: any) => ({
        id: 'ticket-abc12345',
        subject: args.data?.subject ?? 'Test',
        category: args.data?.category ?? 'OTHER',
        priority: args.data?.priority ?? 'MEDIUM',
        status: 'OPEN',
        requestType: args.data?.requestType ?? 'SUPPORT',
        createdAt: new Date(),
      })),
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    ticketReply: {
      create: jest.fn(async (args: any) => ({ id: 'reply-1', ...args.data, createdAt: new Date() })),
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Auth middleware mock ─────────────────────────────────────────────────────

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    authenticate: (_req: any, _res: any, next: any) => {
      (_req as any).user = {
        id: 'admin-1',
        role: 'SUPER_ADMIN',
        email: 'partner@example.com',
        permissions: [],
      };
      next();
    },
    authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
    requirePermission: (_key: any) => (_req: any, _res: any, next: any) => next(),
  };
});

// ─── Audit middleware mock ────────────────────────────────────────────────────

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// ─── Utility mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/utils/payoutThreshold', () => ({
  invalidatePayoutThresholdCache: jest.fn(),
  getPayoutThresholdBGNSync: jest.fn(() => 50),
}));

jest.mock('../../src/utils/systemSettings', () => ({
  invalidateSystemSettingCache: jest.fn(),
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
}));

jest.mock('../../src/utils/currencyDisplay', () => ({
  CURRENCY_TRANSITION_WINDOW_SETTING: 'currency_transition_window_open',
  isCurrencyTransitionWindowOpen: jest.fn(async () => true),
  invalidateCurrencyDisplayCache: jest.fn(),
  bgnToEur: jest.fn((amount: number) => amount / 1.95583),
  toDualCurrency: jest.fn((amount: number, windowOpen: boolean) => ({
    bgn: windowOpen ? amount : null,
    eur: amount / 1.95583,
    windowOpen,
  })),
  buildDualCurrencyMap: jest.fn(async (amounts: any) => amounts),
}));

// ─── Email service mock ───────────────────────────────────────────────────────

const emailSendCalls: any[] = [];

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: jest.fn(async (args: any) => {
      emailSendCalls.push(args);
      return { success: true };
    }),
  },
}));

// ─── Notification service mock ────────────────────────────────────────────────

jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => undefined) },
}));

// ─── Logger mock ─────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import express from 'express';
import supertest from 'supertest';

function buildSettingsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminSettings.routes').default;
  app.use('/', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

function buildPartnerHelpApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/partnerHelp.routes').default;
  app.use('/', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  emailSendCalls.length = 0;
  jest.clearAllMocks();
  // Restore default systemSettings behaviour after each test clears mocks.
  const { getSystemSettingStr } = jest.requireMock('../../src/utils/systemSettings');
  (getSystemSettingStr as jest.Mock).mockImplementation(
    async (_key: string, fallback: string) => fallback,
  );
  const { user, helpTicket } = jest.requireMock('../../src/lib/prisma').prisma;
  (user.findUnique as jest.Mock).mockResolvedValue({
    firstName: 'Test',
    lastName: 'Admin',
    email: 'admin@test.com',
  });
  (helpTicket.create as jest.Mock).mockImplementation(async (args: any) => ({
    id: 'ticket-abc12345',
    subject: args.data?.subject ?? 'Test',
    category: args.data?.category ?? 'OTHER',
    priority: args.data?.priority ?? 'MEDIUM',
    status: 'OPEN',
    requestType: args.data?.requestType ?? 'SUPPORT',
    createdAt: new Date(),
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1 — PUT /system null-value guard
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 1 — PUT /system null-value guard', () => {
  it('returns 400 with descriptive error when a value is null', async () => {
    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { support_email: null } });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/support_email.*value must be a string/i);
  });

  it('returns 400 with descriptive error when a value is a number', async () => {
    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { maintenance_mode: 42 } });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/maintenance_mode.*value must be a string/i);
  });

  it('returns 400 with descriptive error when a value is a boolean', async () => {
    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { maintenance_mode: true } });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/maintenance_mode.*value must be a string/i);
  });

  it('accepts valid string values and returns 200', async () => {
    const { $transaction, systemSetting } = jest.requireMock('../../src/lib/prisma').prisma;
    ($transaction as jest.Mock).mockResolvedValue([]);
    (systemSetting.findMany as jest.Mock).mockResolvedValue([]);

    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { maintenance_mode: 'false' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2 — POST /ticket office_email from systemSettings
// ─────────────────────────────────────────────────────────────────────────────

describe('Fix 2 — POST /ticket confirmation email uses dynamic office_email', () => {
  const validTicketBody = {
    subject: 'Test subject here',
    body: 'This is a valid test body with enough characters to pass validation.',
    category: 'CASHBACK',
  };

  it('embeds the configured office_email in the confirmation email body', async () => {
    const { getSystemSettingStr } = jest.requireMock('../../src/utils/systemSettings');
    (getSystemSettingStr as jest.Mock).mockResolvedValue('support@mybrand.com');

    await buildPartnerHelpApp().post('/ticket').send(validTicketBody);
    // Wait for fire-and-forget IIFE to complete
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].html).toContain('support@mybrand.com');
    expect(emailSendCalls[0].text).toContain('support@mybrand.com');
  });

  it('falls back to office@boomcard.bg when systemSettings returns the default', async () => {
    // getSystemSettingStr already returns the fallback by default (set in beforeEach)
    await buildPartnerHelpApp().post('/ticket').send(validTicketBody);
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(1);
    expect(emailSendCalls[0].html).toContain('office@boomcard.bg');
    expect(emailSendCalls[0].text).toContain('office@boomcard.bg');
  });

  it('does not hardcode office@boomcard.bg when a different email is configured', async () => {
    const { getSystemSettingStr } = jest.requireMock('../../src/utils/systemSettings');
    (getSystemSettingStr as jest.Mock).mockResolvedValue('help@otherdomain.com');

    await buildPartnerHelpApp().post('/ticket').send(validTicketBody);
    await new Promise((r) => setImmediate(r));

    expect(emailSendCalls).toHaveLength(1);
    // Must NOT contain the old hardcoded address
    expect(emailSendCalls[0].html).not.toContain('office@boomcard.bg');
    expect(emailSendCalls[0].html).toContain('help@otherdomain.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-012 — PUT /system with currency_transition_window_open validation
//
// Unit tests for FIX-012 currency display mode validation.
// The GET /currency-display-mode endpoint and window-flag behaviour are verified
// in the integration tests (bc-admin-audit-fix-012.integration.test.ts) which test
// against the live DB and cache system, not mocks.
// ─────────────────────────────────────────────────────────────────────────────

describe('FIX-012 — currency_transition_window_open validation in PUT /system', () => {
  it('accepts currency_transition_window_open="true"', async () => {
    const { $transaction, systemSetting } = jest.requireMock('../../src/lib/prisma').prisma;
    ($transaction as jest.Mock).mockResolvedValue([]);
    (systemSetting.findMany as jest.Mock).mockResolvedValue([]);

    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { currency_transition_window_open: 'true' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts currency_transition_window_open="false"', async () => {
    const { $transaction, systemSetting } = jest.requireMock('../../src/lib/prisma').prisma;
    ($transaction as jest.Mock).mockResolvedValue([]);
    (systemSetting.findMany as jest.Mock).mockResolvedValue([]);

    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { currency_transition_window_open: 'false' } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects currency_transition_window_open with invalid value', async () => {
    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { currency_transition_window_open: 'invalid' } });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/currency_transition_window_open.*must be/i);
  });

  it('rejects currency_transition_window_open as non-string', async () => {
    const res = await buildSettingsApp()
      .put('/system')
      .send({ settings: { currency_transition_window_open: true } });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/value must be a string/i);
  });
});
