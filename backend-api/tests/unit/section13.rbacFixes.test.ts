/**
 * §13 RBAC Fixes — regression tests for the four issues identified in the
 * "Future Delegation Readiness" audit:
 *
 *   Fix 1a — FINANCE no longer has transactions.write (balance adjustments)
 *   Fix 1b — PARTNER_MANAGER no longer has partners.write (live-partner ops)
 *   Fix 1c — seedPermissions() is bidirectional (revokes removed grants)
 *   Fix 2   — control.rules.read activates GET /admin/settings/fraud-rules
 *             for RISK_REVIEW; write ops remain SUPER_ADMIN-only
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
  emailService: { sendPartnerStatusChangeEmail: jest.fn() },
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
    // permission.findMany returns IDs for the keys in the allow-list
    m.permission.findMany.mockImplementation(async (args: any) => {
      const keys: string[] = args?.where?.key?.in ?? [];
      return keys.map((k: string) => ({ id: `perm-${k}` }));
    });
    m.permission.findUnique.mockImplementation(async (args: any) => {
      if (!args?.where?.key) return null;
      return { id: `perm-${args.where.key}`, key: args.where.key, label: args.where.key, category: 'x' };
    });
    m.adminRole.upsert.mockResolvedValue({ id: 'role-1' });
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
    m.fraudRule.findMany.mockResolvedValue([]);
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

  // ── POST /fraud-rules (authorize('SUPER_ADMIN') hard gate before requirePermission) ─

  it('POST /fraud-rules — 403 for ADMIN role even when holding control.rules.write and settings.write', async () => {
    // authorize('SUPER_ADMIN') must fire before requirePermission and return 403
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.write', 'settings.write'] });
    const res = await api.post('/settings/fraud-rules').send({ tier: 'SYSTEM' });
    expect(res.status).toBe(403);
  });

  it('POST /fraud-rules — SUPER_ADMIN is not blocked at the auth layer (passes authorize + requirePermission)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    // Missing tier → 400 from handler validation, NOT 403 from auth
    const res = await api.post('/settings/fraud-rules').send({});
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(400);
  });

  it('PATCH /fraud-rules/:id — 403 for ADMIN role (SUPER_ADMIN-only write gate)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['settings.write', 'control.rules.write'] });
    const res = await api.patch('/settings/fraud-rules/rule-1').send({ notes: 'test' });
    expect(res.status).toBe(403);
  });

  it('DELETE /fraud-rules/:id — 403 for ADMIN role (SUPER_ADMIN-only write gate)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['settings.write', 'control.rules.write'] });
    const res = await api.delete('/settings/fraud-rules/rule-1');
    expect(res.status).toBe(403);
  });

  it('GET /fraud-rules/:id/overrides — 403 for ADMIN with control.rules.read (override list is SUPER_ADMIN-only)', async () => {
    // Override list is intentionally more restrictive than the rule list itself:
    // it exposes which specific users/partners have exceptions, which is more sensitive.
    setMockUser({ role: 'ADMIN', permissions: ['control.rules.read', 'settings.read'] });
    const res = await api.get('/settings/fraud-rules/rule-1/overrides');
    expect(res.status).toBe(403);
  });

  it('GET /fraud-rules/:id/overrides — 200 for SUPER_ADMIN', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    m.fraudRule.findUnique.mockResolvedValueOnce({ id: 'rule-1', tier: 'SYSTEM', isActive: true });
    m.fraudRuleOverride.findMany.mockResolvedValueOnce([]);
    const res = await api.get('/settings/fraud-rules/rule-1/overrides');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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
    // Use mockClear not mockReset — reset strips the async implementation and
    // the route calls writeAudit().catch(...), which would throw on undefined.
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
        objectType: 'partner',
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
