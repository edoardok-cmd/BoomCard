/**
 * §13 RBAC Fixes — regression tests for the four issues identified in the
 * "Future Delegation Readiness" audit:
 *
 *   Fix 1a — FINANCE no longer has transactions.write (balance adjustments)
 *   Fix 1b — PARTNER_MANAGER no longer has partners.write (live-partner ops)
 *   Fix 1c — seedPermissions() is bidirectional (revokes removed grants)
 *   Fix 2   — control.rules.read activates GET /admin/settings/fraud-rules
 *             for RISK_REVIEW; write ops gated by control.rules.write (ADMIN has it;
 *             RISK_REVIEW does not — block enforced by requirePermission, not authorize)
 *   Fix 3   — PATCH /:id/discount-rate enforces CASHBACK_MATRIX_STEPS,
 *             partnerType cap, and requires partners.write; absent rate → 400
 *
 * All Prisma and external-service interactions are mocked — no DB required.
 */

// ─── Prisma mock (must be defined before any import that pulls in the module) ─
// Both `default` and named `prisma` export point to the SAME client object so
// that modules using either import shape hit the same jest.fn() instances.

jest.mock('../../src/lib/prisma', () => {
  const client = {
    partner: { findUnique: jest.fn(), update: jest.fn() },
    rolePermission: { deleteMany: jest.fn(async () => ({ count: 0 })), upsert: jest.fn(async () => ({})) },
    permission: { findUnique: jest.fn(), findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
    adminRole: { upsert: jest.fn(async () => ({ id: 'role-1' })) },
    // Needed by adminSettings.routes.ts fraud-rules handlers
    fraudRule: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'rule-1', ...args.data })),
      update: jest.fn(async (args: any) => ({ id: args?.where?.id })),
    },
    fraudRuleOverride: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'override-1', ...args.data })),
      delete: jest.fn(async () => ({})),
    },
    // Needed by resolveAdminName used in some settings handlers
    user: { findUnique: jest.fn(async () => null) },
    // Needed by adminAdmins critical-actions endpoint
    criticalActionRequest: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    // Needed by adminHelp endpoints
    helpTicket: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => ({})),
    },
    ticketReply: {
      create: jest.fn(async () => ({ id: 'reply-1' })),
      findMany: jest.fn(async () => []),
    },
    inboundBounce: {
      count: jest.fn(async () => 0),
    },
    // $transaction pass-through: calls the callback with the same client so
    // tx.helpTicket.update / tx.ticketReply.create hit the same mocked fns.
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(client)),
  };
  return { __esModule: true, default: client, prisma: client };
});

const writeAuditSpy: jest.Mock<Promise<void>, [any?]> = jest.fn(async (_arg?: any) => undefined);
jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: (arg?: any) => writeAuditSpy(arg),
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// Stub transitive dependencies of adminPartners.routes.ts
jest.mock('../../src/services/partnerActivation.service', () => ({
  issueActivationLink: jest.fn(),
  sendActivationEmail: jest.fn(),
  stampEmailOutcome: jest.fn(),
}));
jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendPartnerStatusChangeEmail: jest.fn(),
    sendEmail: jest.fn(async () => undefined),
  },
}));
jest.mock('../../src/services/partner.service', () => ({
  partnerService: { setPartnerStatus: jest.fn() },
}));
jest.mock('../../src/services/partnerSla.helper', () => ({
  computePartnerSla: jest.fn(),
}));
jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/partnerVenueCountBucket.helper', () => ({
  parseVenueCountBucket: jest.fn(),
  formatVenueCountBucket: jest.fn(),
  VENUE_COUNT_BUCKET_DISPLAY_VALUES: {},
}));

// Stubs for adminHelp.routes.ts transitive imports
jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => undefined) },
}));
jest.mock('../../src/services/ticketEmail.service', () => ({
  buildTicketSubject: jest.fn((_id: string, suffix: string) => `[#abc1234] ${suffix}`),
  buildTicketHeaders: jest.fn(() => ({ messageId: '<mid@test>', headers: {} })),
  buildPlusReplyTo: jest.fn(() => 'support+abc1234@boomcard.bg'),
  computeShortRef: jest.fn(() => '#abc1234'),
}));

// Stub for adminAlerts.routes.ts
jest.mock('../../src/services/adminAlerts.service', () => ({
  getAlerts: jest.fn(async () => ({ alerts: [], counts: {} })),
  ACTIVE_SCAN_STATUSES: ['PENDING_REVIEW'],
}));

// ─── Auth middleware mock (role + permission check controlled per-test) ───────
// authorize() actually enforces the role list so that SUPER_ADMIN-only guards on
// fraud-rules write ops are testable without spinning up a real JWT stack.

let mockUser: { id: string; role: string; permissions: string[] } | null = null;

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    authenticate: (_req: any, _res: any, next: any) => {
      if (mockUser) (_req as any).user = mockUser;
      next();
    },
    authorize: (...roles: string[]) => (req: any, res: any, next: any) => {
      const user = (req as any).user as typeof mockUser;
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      if (!roles.includes(user.role)) return res.status(403).json({ error: 'Not authorized' });
      next();
    },
    requirePermission: (keyOrKeys: string | string[]) => (req: any, res: any, next: any) => {
      const user = (req as any).user as typeof mockUser;
      if (!user) return res.status(401).json({ error: 'Not authenticated' });
      if (user.role === 'SUPER_ADMIN') return next();
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      const hasAny = keys.some((k: string) => user.permissions.includes(k));
      if (!hasAny) return res.status(403).json({ error: 'Insufficient permissions' });
      next();
    },
  };
});

function setMockUser(overrides: Partial<{ id: string; role: string; permissions: string[] }> = {}) {
  mockUser = { id: 'admin-1', role: 'ADMIN', permissions: [], ...overrides };
}

// ─── Imports ─────────────────────────────────────────────────────────────────

import express from 'express';
import supertest from 'supertest';
import { ROLE_DEFAULT_ALLOWS, PERMISSION_CATALOG } from '../../src/services/permission.service';
import { CASHBACK_MATRIX_STEPS } from '../../src/constants/receipt.constants';
import { prisma } from '../../src/lib/prisma';

type AnyMock = jest.Mock;
const m = prisma as unknown as {
  partner: { findUnique: AnyMock; update: AnyMock };
  rolePermission: { deleteMany: AnyMock; upsert: AnyMock };
  permission: { findUnique: AnyMock; findMany: AnyMock; upsert: AnyMock };
  adminRole: { upsert: AnyMock };
  fraudRule: { findMany: AnyMock; findUnique: AnyMock; create: AnyMock; update: AnyMock };
  fraudRuleOverride: { findMany: AnyMock; findFirst: AnyMock; create: AnyMock; delete: AnyMock };
  user: { findUnique: AnyMock };
  criticalActionRequest: { findMany: AnyMock; count: AnyMock };
  helpTicket: { findMany: AnyMock; findUnique: AnyMock; count: AnyMock; update: AnyMock };
  ticketReply: { create: AnyMock; findMany: AnyMock };
  inboundBounce: { count: AnyMock };
  $transaction: AnyMock;
};

// Build a mini Express app wiring only the adminPartners router at /partners
function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminPartners.routes').default;
  app.use('/partners', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

// Build a mini Express app wiring only the adminSettings router at /settings
function buildSettingsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminSettings.routes').default;
  app.use('/settings', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

// Build a mini Express app wiring only the adminHelp router at /help
function buildHelpApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminHelp.routes').default;
  app.use('/help', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

// Build a mini Express app wiring only the adminAdmins router at /admins
function buildAdminsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminAdmins.routes').default;
  app.use('/admins', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

// Build a mini Express app wiring only the adminAlerts router at /alerts
function buildAlertsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminAlerts.routes').default;
  app.use('/alerts', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' });
  });
  return supertest(app);
}

// ─── §13 Fix 1 — Role default permission matrix ──────────────────────────────

describe('§13 Fix 1 — Role default permission matrix', () => {
  it('FINANCE does NOT include transactions.write (balance adjustments)', () => {
    expect(ROLE_DEFAULT_ALLOWS['FINANCE']).not.toContain('transactions.write');
  });

  it('FINANCE does NOT include partners.write', () => {
    expect(ROLE_DEFAULT_ALLOWS['FINANCE']).not.toContain('partners.write');
  });

  it('FINANCE includes the expected read/finance keys', () => {
    const fin = ROLE_DEFAULT_ALLOWS['FINANCE']!;
    expect(fin).toContain('transactions.read');
    expect(fin).toContain('finance.payouts.read');
    expect(fin).toContain('finance.payouts.write');
    expect(fin).toContain('finance.reports.read');
  });

  it('PARTNER_MANAGER does NOT include partners.write (live-partner status ops)', () => {
    expect(ROLE_DEFAULT_ALLOWS['PARTNER_MANAGER']).not.toContain('partners.write');
  });

  it('PARTNER_MANAGER does NOT include transactions.write', () => {
    expect(ROLE_DEFAULT_ALLOWS['PARTNER_MANAGER']).not.toContain('transactions.write');
  });

  it('PARTNER_MANAGER retains onboarding and request permissions', () => {
    const pm = ROLE_DEFAULT_ALLOWS['PARTNER_MANAGER']!;
    expect(pm).toContain('partners.requests.read');
    expect(pm).toContain('partners.requests.write');
    expect(pm).toContain('partners.onboarding.read');
    expect(pm).toContain('partners.onboarding.write');
  });

  it('RISK_REVIEW has control.rules.read (fraud rule visibility)', () => {
    expect(ROLE_DEFAULT_ALLOWS['RISK_REVIEW']).toContain('control.rules.read');
  });

  it('RISK_REVIEW does NOT have control.rules.write (cannot change thresholds)', () => {
    expect(ROLE_DEFAULT_ALLOWS['RISK_REVIEW']).not.toContain('control.rules.write');
  });

  it('SUPPORT has no finance, settings, or cashback.write permissions', () => {
    const sup = ROLE_DEFAULT_ALLOWS['SUPPORT']!;
    const forbidden = ['finance.payouts.write', 'settings.write', 'cashback.write', 'transactions.write', 'admins.write'];
    for (const key of forbidden) {
      expect(sup).not.toContain(key);
    }
  });

  it('all permission keys in every role default actually exist in the catalog', () => {
    const catalogKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
    for (const [role, keys] of Object.entries(ROLE_DEFAULT_ALLOWS)) {
      if (role === 'ADMIN') continue; // ADMIN is dynamically derived from the full catalog
      for (const key of keys) {
        expect(catalogKeys.has(key)).toBe(true);
      }
    }
  });
});

// ─── §13 Fix 1c — seedPermissions bidirectionality ───────────────────────────

describe('§13 Fix 1c — seedPermissions revokes removed grants', () => {
  // Require after mocks to get the freshly mocked version
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { seedPermissions } = require('../../src/services/permission.service');

  beforeEach(() => {
    jest.clearAllMocks();
    // permission.findMany returns key-scoped IDs matching what seedPermissions maps to allowedPermIds.
    // Using perm-${key} makes the notIn content verifiable without a real DB.
    m.permission.findMany.mockImplementation(async (args: any) => {
      const keys: string[] = args?.where?.key?.in ?? [];
      return keys.map((k: string) => ({ id: `perm-${k}` }));
    });
    m.permission.findUnique.mockImplementation(async (args: any) => {
      if (!args?.where?.key) return null;
      return { id: `perm-${args.where.key}`, key: args.where.key, label: args.where.key, category: 'x' };
    });
    // Return a role ID derived from the role key so each deleteMany call can be
    // correlated back to its role and its expected allow-list.
    m.adminRole.upsert.mockImplementation(async (args: any) => ({ id: `role-${args?.where?.key ?? 'x'}` }));
    m.rolePermission.upsert.mockResolvedValue({});
    m.permission.upsert.mockResolvedValue({});
    m.rolePermission.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('calls rolePermission.deleteMany once per role to revoke stale grants', async () => {
    await seedPermissions();
    const roleCount = Object.keys(ROLE_DEFAULT_ALLOWS).length;
    expect(m.rolePermission.deleteMany).toHaveBeenCalledTimes(roleCount);
  });

  it('each deleteMany call carries a notIn constraint scoped to that role', async () => {
    await seedPermissions();
    const calls: any[] = m.rolePermission.deleteMany.mock.calls;
    for (const call of calls) {
      const args = call[0] as any;
      expect(args.where).toHaveProperty('roleId');
      expect(args.where.permissionId).toHaveProperty('notIn');
      expect(Array.isArray(args.where.permissionId.notIn)).toBe(true);
    }
  });

  it('each deleteMany notIn contains exactly the permission IDs for that role allow-list', async () => {
    await seedPermissions();
    const calls: any[] = m.rolePermission.deleteMany.mock.calls;
    for (const [roleKey, allowedKeys] of Object.entries(ROLE_DEFAULT_ALLOWS)) {
      const call = calls.find((c: any) => c[0].where.roleId === `role-${roleKey}`);
      expect(call).toBeDefined();
      const expectedIds = allowedKeys.map((k: string) => `perm-${k}`);
      expect(new Set(call[0].where.permissionId.notIn)).toEqual(new Set(expectedIds));
    }
  });
});

// ─── §13 Fix 2 — control.rules.* permission gates ────────────────────────────

describe('§13 Fix 2 — fraud-rules permission gates (catalog checks)', () => {
  it('RISK_REVIEW has control.rules.read', () => {
    expect(ROLE_DEFAULT_ALLOWS['RISK_REVIEW']).toContain('control.rules.read');
  });

  it('RISK_REVIEW does NOT have settings.read (cannot view all system settings)', () => {
    expect(ROLE_DEFAULT_ALLOWS['RISK_REVIEW']).not.toContain('settings.read');
  });

  it('RISK_REVIEW does NOT have control.rules.write (cannot change thresholds)', () => {
    expect(ROLE_DEFAULT_ALLOWS['RISK_REVIEW']).not.toContain('control.rules.write');
  });

  it('ADMIN has both settings.read and control.rules.read', () => {
    const admin = ROLE_DEFAULT_ALLOWS['ADMIN']!;
    expect(admin).toContain('settings.read');
    expect(admin).toContain('control.rules.read');
  });

  it('control.rules.read is in the PERMISSION_CATALOG', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain('control.rules.read');
  });

  it('control.rules.write is in the PERMISSION_CATALOG', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain('control.rules.write');
  });

  it('control.rules.read/write are in the control category', () => {
    const readPerm = PERMISSION_CATALOG.find((p) => p.key === 'control.rules.read');
    const writePerm = PERMISSION_CATALOG.find((p) => p.key === 'control.rules.write');
    expect(readPerm?.category).toBe('control');
    expect(writePerm?.category).toBe('control');
  });
});

describe('§13 Fix 2 — fraud-rules HTTP permission gates', () => {
  let api: ReturnType<typeof buildSettingsApp>;

  beforeAll(() => {
    api = buildSettingsApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks clears call history but NOT unconsumed mockResolvedValueOnce queues.
    // mockReset + explicit return value ensures stale Once values from a prior test can
    // never bleed into a subsequent test that relies on the factory default.
    m.fraudRule.findMany.mockReset();
    m.fraudRule.findMany.mockResolvedValue([]);
    m.fraudRule.findUnique.mockReset();
    m.fraudRule.findUnique.mockResolvedValue(null);
    m.fraudRuleOverride.findMany.mockReset();
    m.fraudRuleOverride.findMany.mockResolvedValue([]);
  });

  // ── GET /fraud-rules (requirePermission OR: settings.read | control.rules.read) ─

  it('GET /fraud-rules — 200 for ADMIN with control.rules.read (RISK_REVIEW permission profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.read'] });
    const res = await api.get('/settings/fraud-rules');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /fraud-rules — 200 for ADMIN with settings.read (full-ADMIN permission profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['settings.read'] });
    const res = await api.get('/settings/fraud-rules');
    expect(res.status).toBe(200);
  });

  it('GET /fraud-rules — 403 when ADMIN holds neither settings.read nor control.rules.read', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['partners.read'] });
    const res = await api.get('/settings/fraud-rules');
    expect(res.status).toBe(403);
  });

  it('GET /fraud-rules — 200 for SUPER_ADMIN (bypasses requirePermission)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.get('/settings/fraud-rules');
    expect(res.status).toBe(200);
  });

  // ── POST/PATCH/DELETE /fraud-rules (requirePermission('control.rules.write')) ──
  // Write ops use requirePermission('control.rules.write') — not a hard SUPER_ADMIN gate.
  // RISK_REVIEW (control.rules.read only) is blocked; full ADMIN includes the write key.

  it('POST /fraud-rules — 201 for ADMIN with control.rules.write', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.write'] });
    const res = await api.post('/settings/fraud-rules').send({ tier: 'SYSTEM' });
    expect(res.status).toBe(201);
  });

  it('POST /fraud-rules — 403 when ADMIN lacks control.rules.write', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.read'] });
    const res = await api.post('/settings/fraud-rules').send({ tier: 'SYSTEM' });
    expect(res.status).toBe(403);
  });

  it('POST /fraud-rules — SUPER_ADMIN bypasses requirePermission (no tier → 400 from handler)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.post('/settings/fraud-rules').send({});
    expect(res.status).toBe(400);
  });

  it('PATCH /fraud-rules/:id — 200 for ADMIN with control.rules.write', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.write'] });
    m.fraudRule.findUnique.mockResolvedValueOnce({ id: 'rule-1', isActive: true });
    const res = await api.patch('/settings/fraud-rules/rule-1').send({ notes: 'test' });
    expect(res.status).toBe(200);
  });

  it('DELETE /fraud-rules/:id — 200 for ADMIN with control.rules.write', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.write'] });
    m.fraudRule.findUnique.mockResolvedValueOnce({ id: 'rule-1', isActive: true });
    const res = await api.delete('/settings/fraud-rules/rule-1');
    expect(res.status).toBe(200);
  });

  it('GET /fraud-rules/:id/overrides — 403 for ADMIN with control.rules.read (override list is SUPER_ADMIN-only)', async () => {
    // Override list is intentionally more restrictive than the rule list itself:
    // it exposes which specific users/partners have exceptions, which is more sensitive.
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.read', 'settings.read'] });
    const res = await api.get('/settings/fraud-rules/rule-1/overrides');
    expect(res.status).toBe(403);
  });

  it('GET /fraud-rules/:id/overrides — 200 for SUPER_ADMIN with correct response shape', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    m.fraudRule.findUnique.mockResolvedValueOnce({ id: 'rule-1', tier: 'SYSTEM', isActive: true });
    m.fraudRuleOverride.findMany.mockResolvedValueOnce([]);
    const res = await api.get('/settings/fraud-rules/rule-1/overrides');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  // ── POST /fraud-rules/:id/overrides (authorize('SUPER_ADMIN') hard gate) ─────

  it('POST /fraud-rules/:id/overrides — 403 for ADMIN role (SUPER_ADMIN-only write gate)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['settings.write', 'control.rules.write'] });
    const res = await api.post('/settings/fraud-rules/rule-1/overrides').send({
      targetType: 'user',
      targetId: 'user-1',
      override: { maxAmount: 100 },
    });
    expect(res.status).toBe(403);
  });

  it('POST /fraud-rules/:id/overrides — SUPER_ADMIN passes auth layer (400 from body validation)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    // Empty body → handler validation fires, confirming auth was passed
    const res = await api.post('/settings/fraud-rules/rule-1/overrides').send({});
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(400);
  });

  // ── DELETE /fraud-rules/:id/overrides/:overId (authorize('SUPER_ADMIN') hard gate) ─

  it('DELETE /fraud-rules/:id/overrides/:overId — 403 for ADMIN role (SUPER_ADMIN-only write gate)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['settings.write', 'control.rules.write'] });
    const res = await api.delete('/settings/fraud-rules/rule-1/overrides/override-1');
    expect(res.status).toBe(403);
  });

  it('DELETE /fraud-rules/:id/overrides/:overId — SUPER_ADMIN passes auth layer (404 when override absent)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    // findFirst returns null (default) → 404, confirming auth was passed
    const res = await api.delete('/settings/fraud-rules/rule-1/overrides/override-1');
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
  });
});

// ─── §13 Fix 3 — PATCH /:id/discount-rate endpoint ──────────────────────────

describe('§13 Fix 3 — PATCH /partners/:id/discount-rate', () => {
  const PARTNER_ID = 'partner-uuid-1';
  const ADMIN_USER_ID = 'admin-uuid-1';
  let api: ReturnType<typeof buildApp>;

  beforeAll(() => {
    api = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // mockReset on partner mocks ensures mockResolvedValue set by a prior test doesn't
    // persist into a subsequent test — clearAllMocks only clears call history, not
    // base implementations. Each test that reaches the DB sets these explicitly.
    m.partner.findUnique.mockReset();
    m.partner.update.mockReset();
    // Use mockClear not mockReset on writeAuditSpy — reset strips the async impl and
    // the route calls writeAudit().catch(...), which would throw on a bare jest.fn().
    writeAuditSpy.mockClear();
  });

  const basePartner = {
    id: PARTNER_ID,
    discountRate: 10,
    partnerType: { maxDiscountRate: 20 },
  };

  it('403 when caller lacks partners.write', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: [] });
    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 10 });
    expect(res.status).toBe(403);
  });

  it('400 when rate is absent from the request body (prevents silent null-clear)', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('404 when partner does not exist', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    m.partner.findUnique.mockResolvedValue(null);
    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 10 });
    expect(res.status).toBe(404);
  });

  it('400 when rate is not in CASHBACK_MATRIX_STEPS', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    m.partner.findUnique.mockResolvedValue(basePartner);
    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 7 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must be one of/i);
  });

  it('400 when rate exceeds partnerType.maxDiscountRate', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    m.partner.findUnique.mockResolvedValue({ ...basePartner, partnerType: { maxDiscountRate: 15 } });
    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds the maximum/i);
  });

  it('200 with valid rate in CASHBACK_MATRIX_STEPS at or below type cap', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    m.partner.findUnique.mockResolvedValue(basePartner);
    m.partner.update.mockResolvedValue({ id: PARTNER_ID, discountRate: 15 });

    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 15 });
    expect(res.status).toBe(200);
    expect(res.body.partner.discountRate).toBe(15);

    const updateArgs = m.partner.update.mock.calls[0][0] as any;
    expect(updateArgs.data.discountRate).toBe(15);
  });

  it('200 with rate=null clears the override (sets discountRate to null)', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    m.partner.findUnique.mockResolvedValue(basePartner);
    m.partner.update.mockResolvedValue({ id: PARTNER_ID, discountRate: null });

    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: null });
    expect(res.status).toBe(200);

    const updateArgs = m.partner.update.mock.calls[0][0] as any;
    expect(updateArgs.data.discountRate).toBeNull();
  });

  it('writes an audit log with before/after discountRate on success', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'ADMIN', permissions: ['partners.write'] });
    m.partner.findUnique.mockResolvedValue(basePartner);
    m.partner.update.mockResolvedValue({ id: PARTNER_ID, discountRate: 15 });

    await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 15 });

    // writeAudit is fire-and-forget — flush the microtask queue
    await new Promise((r) => setTimeout(r, 0));

    expect(writeAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'partner.discount-rate.update',
        objectType: 'Partner',
        objectId: PARTNER_ID,
        before: { discountRate: 10 },
        after: { discountRate: 15 },
      })
    );
  });

  it('SUPER_ADMIN bypasses requirePermission and succeeds', async () => {
    setMockUser({ id: ADMIN_USER_ID, role: 'SUPER_ADMIN', permissions: [] });
    m.partner.findUnique.mockResolvedValue(basePartner);
    m.partner.update.mockResolvedValue({ id: PARTNER_ID, discountRate: 15 });

    const res = await api.patch(`/partners/${PARTNER_ID}/discount-rate`).send({ rate: 15 });
    expect(res.status).toBe(200);
  });

  it('CASHBACK_MATRIX_STEPS contains exactly [5, 10, 15, 20, 25]', () => {
    expect([...CASHBACK_MATRIX_STEPS]).toEqual([5, 10, 15, 20, 25]);
  });
});

// ─── §13 Audit Fix A — SUPPORT must not have control.disputes.write ───────────
// Approving a dispute triggers wallet credit; §13 says Support cannot do payments.

describe('§13 Audit Fix A — SUPPORT lacks control.disputes.write', () => {
  it('SUPPORT does NOT include control.disputes.write', () => {
    expect(ROLE_DEFAULT_ALLOWS['SUPPORT']).not.toContain('control.disputes.write');
  });

  it('SUPPORT retains control.disputes.read (can still view disputes)', () => {
    expect(ROLE_DEFAULT_ALLOWS['SUPPORT']).toContain('control.disputes.read');
  });

  it('RISK_REVIEW retains control.disputes.write (making decisions is their mandate)', () => {
    expect(ROLE_DEFAULT_ALLOWS['RISK_REVIEW']).toContain('control.disputes.write');
  });
});

// ─── §13 Audit Fix B — SUPPORT can view all help tickets via help.read.all ────
// §13 says Support handles "помощни заявки" — they need full ticket visibility.

describe('§13 Audit Fix B — help.read.all in catalog and SUPPORT defaults', () => {
  it('help.read.all is in the PERMISSION_CATALOG', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain('help.read.all');
  });

  it('help.read.all is in the help category', () => {
    const perm = PERMISSION_CATALOG.find((p) => p.key === 'help.read.all');
    expect(perm?.category).toBe('help');
  });

  it('SUPPORT includes help.read.all', () => {
    expect(ROLE_DEFAULT_ALLOWS['SUPPORT']).toContain('help.read.all');
  });

  it('ADMIN inherits help.read.all from the full catalog', () => {
    expect(ROLE_DEFAULT_ALLOWS['ADMIN']).toContain('help.read.all');
  });
});

describe('§13 Audit Fix B — GET /help/ accessible with help.read.all', () => {
  let api: ReturnType<typeof buildHelpApp>;

  beforeAll(() => { api = buildHelpApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    m.helpTicket.findMany.mockResolvedValue([]);
    m.helpTicket.count.mockResolvedValue(0);
  });

  it('200 for ADMIN with help.read.all (SUPPORT permission profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['help.read.all'] });
    const res = await api.get('/help/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tickets');
  });

  it('403 for ADMIN without help.read.all (e.g. PARTNER_MANAGER profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['dashboard.read', 'partners.read'] });
    const res = await api.get('/help/');
    expect(res.status).toBe(403);
  });

  it('200 for SUPER_ADMIN (bypasses requirePermission)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.get('/help/');
    expect(res.status).toBe(200);
  });
});

// ─── §13 Audit Fix B — POST /help/:id/assign privilege gates ─────────────────
// Explicit assigneeId / unassign (null) must be SUPER_ADMIN-only.
// SUPPORT (help.read.all) may only self-assign — hasFullAccess() must NOT be used
// for this gate because it returns true for SUPPORT.

describe('§13 Audit Fix B — POST /help/:id/assign privilege gates', () => {
  let api: ReturnType<typeof buildHelpApp>;

  // A minimal ticket that satisfies every field the assign handler reads.
  const baseTicket = {
    id: 'ticket-1',
    userId: 'creator-id',
    assigneeId: null,
    status: 'OPEN',
  };

  beforeAll(() => { api = buildHelpApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    m.helpTicket.findUnique.mockReset();
    m.helpTicket.update.mockReset();
    m.user.findUnique.mockReset();
    // Default: ticket exists, update succeeds
    m.helpTicket.findUnique.mockResolvedValue(baseTicket);
    m.helpTicket.update.mockResolvedValue({});
    m.user.findUnique.mockResolvedValue({ id: 'other-admin', role: 'ADMIN' });
  });

  it('403 for ADMIN with help.read.all when providing explicit assigneeId', async () => {
    // SUPPORT profile: has help.read.all (and help.write to pass requirePermission)
    // but user.role is ADMIN, not SUPER_ADMIN — must be blocked.
    setMockUser({ id: 'support-id', role: 'ADMIN', permissions: ['help.read.all', 'help.write'] });
    const res = await api.post('/help/ticket-1/assign').send({ assigneeId: 'other-admin-id' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SUPER_ADMIN/i);
  });

  it('403 for ADMIN with help.read.all when unassigning (assigneeId: null)', async () => {
    setMockUser({ id: 'support-id', role: 'ADMIN', permissions: ['help.read.all', 'help.write'] });
    const res = await api.post('/help/ticket-1/assign').send({ assigneeId: null });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SUPER_ADMIN/i);
  });

  it('200 for SUPER_ADMIN with explicit assigneeId (passes role gate)', async () => {
    setMockUser({ id: 'super-id', role: 'SUPER_ADMIN', permissions: [] });
    // Ticket: creator is someone else, current assignee is null — no creator-self-assign guard fires
    m.helpTicket.findUnique.mockResolvedValue({ ...baseTicket, userId: 'creator-id', assigneeId: null });
    m.user.findUnique.mockResolvedValue({ id: 'other-admin', role: 'ADMIN' });
    const res = await api.post('/help/ticket-1/assign').send({ assigneeId: 'other-admin' });
    expect(res.status).toBe(200);
  });

  it('200 for ADMIN without help.read.all on self-assign (no assigneeId in body)', async () => {
    // Any authenticated admin with help.write can self-assign a ticket they can access.
    setMockUser({ id: 'admin-1', role: 'ADMIN', permissions: ['help.write'] });
    // Ticket is owned by this admin so they can access it
    m.helpTicket.findUnique.mockResolvedValue({ ...baseTicket, userId: 'admin-1', assigneeId: null });
    const res = await api.post('/help/ticket-1/assign').send({});
    expect(res.status).toBe(200);
  });

  it('200 for ADMIN with help.read.all self-assigning a third-party ticket (hasFullAccess bypasses the ownership gate)', async () => {
    // SUPPORT can pick up any ticket via self-assign — the ownership gate at line 386
    // uses hasFullAccess() so it must pass for a caller with help.read.all even when
    // they are neither the creator nor the existing assignee.
    setMockUser({ id: 'support-id', role: 'ADMIN', permissions: ['help.read.all', 'help.write'] });
    m.helpTicket.findUnique.mockResolvedValue({ ...baseTicket, userId: 'someone-else', assigneeId: null });
    const res = await api.post('/help/ticket-1/assign').send({});
    expect(res.status).toBe(200);
  });
});

// ─── §13 Audit Fix B — POST /help/:id/reject privilege gates ─────────────────
// Rejection of a ticket the caller is not assigned to must be SUPER_ADMIN-only.
// SUPPORT (help.read.all) is blocked from rejecting unassigned tickets —
// hasFullAccess() must NOT be used for this gate.

describe('§13 Audit Fix B — POST /help/:id/reject privilege gates', () => {
  let api: ReturnType<typeof buildHelpApp>;

  const validReason = 'Причина с поне десет символа';

  // Ticket where the current test user is NOT the assignee
  const unassignedTicket = {
    id: 'ticket-1',
    userId: 'creator-id',
    assigneeId: 'other-admin-id', // != support-id / admin-1
    rootMessageId: null,
    status: 'OPEN',
    user: { email: 'creator@test.com', firstName: 'Creator', role: 'USER' },
  };

  beforeAll(() => { api = buildHelpApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    m.helpTicket.findUnique.mockReset();
    m.helpTicket.update.mockReset();
    m.$transaction.mockReset();
    m.ticketReply.create.mockReset();
    m.ticketReply.findMany.mockReset();
    m.helpTicket.findUnique.mockResolvedValue(unassignedTicket);
    m.helpTicket.update.mockResolvedValue({});
    m.ticketReply.create.mockResolvedValue({ id: 'reply-1' });
    m.ticketReply.findMany.mockResolvedValue([]);
    // $transaction calls the callback with the prisma mock so tx.* hits the right fns
    m.$transaction.mockImplementation(async (fn: (tx: typeof m) => Promise<unknown>) => fn(m));
  });

  it('403 for ADMIN with help.read.all rejecting a ticket they are not the assignee of', async () => {
    // SUPPORT profile: help.read.all gives hasFullAccess()=true but role is ADMIN
    setMockUser({ id: 'support-id', role: 'ADMIN', permissions: ['help.read.all', 'help.write'] });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SUPER_ADMIN/i);
  });

  it('403 for ADMIN with help.write but no help.read.all rejecting a non-assigned ticket', async () => {
    setMockUser({ id: 'admin-1', role: 'ADMIN', permissions: ['help.write'] });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(403);
  });

  it('200 for SUPER_ADMIN rejecting any ticket regardless of assignee', async () => {
    setMockUser({ id: 'super-id', role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(200);
  });

  it('200 for ADMIN who IS the assignee (assignee-owns-rejection policy)', async () => {
    setMockUser({ id: 'assignee-id', role: 'ADMIN', permissions: ['help.write'] });
    m.helpTicket.findUnique.mockResolvedValue({ ...unassignedTicket, assigneeId: 'assignee-id' });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(200);
  });

  it('200 for ADMIN with help.read.all who IS the assignee (assignee gate dominates role)', async () => {
    // SUPPORT (help.read.all) who happens to be the assignee must be allowed to reject —
    // the guard is "not SUPER_ADMIN AND not assignee", so being the assignee bypasses the
    // role check regardless of whether the caller has help.read.all.
    setMockUser({ id: 'support-id', role: 'ADMIN', permissions: ['help.read.all', 'help.write'] });
    m.helpTicket.findUnique.mockResolvedValue({ ...unassignedTicket, assigneeId: 'support-id' });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(200);
  });

  it('400 when ticket is already in a terminal state (CLOSED)', async () => {
    setMockUser({ id: 'super-id', role: 'SUPER_ADMIN', permissions: [] });
    m.helpTicket.findUnique.mockResolvedValue({ ...unassignedTicket, status: 'CLOSED' });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/крайно състояние/i);
  });

  it('400 when ticket is already REJECTED (idempotent terminal guard)', async () => {
    setMockUser({ id: 'super-id', role: 'SUPER_ADMIN', permissions: [] });
    m.helpTicket.findUnique.mockResolvedValue({ ...unassignedTicket, status: 'REJECTED' });
    const res = await api.post('/help/ticket-1/reject').send({ reason: validReason });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/крайно състояние/i);
  });

  it('400 when reason is shorter than 10 characters', async () => {
    setMockUser({ id: 'super-id', role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.post('/help/ticket-1/reject').send({ reason: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/минимум 10/i);
  });
});

// ─── §13 Audit Fix C — partners.receipts.* removed from catalog ──────────────
// These permissions protected no routes; removing them keeps the catalog accurate.

describe('§13 Audit Fix C — partners.receipts.* removed from catalog', () => {
  it('partners.receipts.read is NOT in the PERMISSION_CATALOG', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).not.toContain('partners.receipts.read');
  });

  it('partners.receipts.write is NOT in the PERMISSION_CATALOG', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).not.toContain('partners.receipts.write');
  });

  it('PARTNER_MANAGER does NOT include partners.receipts.read', () => {
    expect(ROLE_DEFAULT_ALLOWS['PARTNER_MANAGER']).not.toContain('partners.receipts.read');
  });
});

// ─── §13 Audit Fix D — PARTNER_MANAGER can view critical-action queue ─────────
// §13 says PARTNER_MANAGER can access "Partner changes queue" (pending approvals).
// admins.actions.read gates GET /critical-actions without exposing admin listings.

describe('§13 Audit Fix D — admins.actions.read in catalog and PARTNER_MANAGER defaults', () => {
  it('admins.actions.read is in the PERMISSION_CATALOG', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain('admins.actions.read');
  });

  it('admins.actions.read is in the admins category', () => {
    const perm = PERMISSION_CATALOG.find((p) => p.key === 'admins.actions.read');
    expect(perm?.category).toBe('admins');
  });

  it('PARTNER_MANAGER includes admins.actions.read', () => {
    expect(ROLE_DEFAULT_ALLOWS['PARTNER_MANAGER']).toContain('admins.actions.read');
  });

  it('PARTNER_MANAGER does NOT include admins.read (cannot see admin user listing)', () => {
    expect(ROLE_DEFAULT_ALLOWS['PARTNER_MANAGER']).not.toContain('admins.read');
  });
});

describe('§13 Audit Fix D — GET /admins/critical-actions accepts admins.actions.read', () => {
  let api: ReturnType<typeof buildAdminsApp>;

  beforeAll(() => { api = buildAdminsApp(); });

  beforeEach(() => {
    jest.clearAllMocks();
    m.criticalActionRequest.findMany.mockResolvedValue([]);
    m.criticalActionRequest.count.mockResolvedValue(0);
  });

  it('200 for ADMIN with admins.actions.read (PARTNER_MANAGER permission profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.actions.read'] });
    const res = await api.get('/admins/critical-actions');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
  });

  it('200 for ADMIN with admins.read (full admin management profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.read'] });
    const res = await api.get('/admins/critical-actions');
    expect(res.status).toBe(200);
  });

  it('403 for ADMIN with neither admins.read nor admins.actions.read', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['dashboard.read', 'partners.read'] });
    const res = await api.get('/admins/critical-actions');
    expect(res.status).toBe(403);
  });

  it('200 for SUPER_ADMIN (bypasses requirePermission)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.get('/admins/critical-actions');
    expect(res.status).toBe(200);
  });
});

// ─── §13 Audit Fix E — Alerts gated on control.risk.read, not dashboard.read ──
// dashboard.read is held by every delegated role including PARTNER_MANAGER;
// alerts expose fraud-queue counts and must be restricted to risk-aware roles.

describe('§13 Audit Fix E — GET /alerts/ requires control.risk.read', () => {
  let api: ReturnType<typeof buildAlertsApp>;

  beforeAll(() => { api = buildAlertsApp(); });

  beforeEach(() => { jest.clearAllMocks(); });

  it('200 for ADMIN with control.risk.read (RISK_REVIEW permission profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['control.risk.read'] });
    const res = await api.get('/alerts/');
    expect(res.status).toBe(200);
  });

  it('403 for ADMIN with only dashboard.read (PARTNER_MANAGER / SUPPORT profile)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['dashboard.read'] });
    const res = await api.get('/alerts/');
    expect(res.status).toBe(403);
  });

  it('403 for ADMIN with dashboard.read + partners.read but not control.risk.read', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['dashboard.read', 'partners.read', 'help.read.all'] });
    const res = await api.get('/alerts/');
    expect(res.status).toBe(403);
  });

  it('200 for SUPER_ADMIN (bypasses requirePermission)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    const res = await api.get('/alerts/');
    expect(res.status).toBe(200);
  });
});
