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
 *             partnerType cap, and requires partners.write
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

// ─── Auth middleware mock (permission check controlled per-test) ─────────────

let mockUser: { id: string; role: string; permissions: string[] } | null = null;

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    authenticate: (_req: any, _res: any, next: any) => {
      if (mockUser) (_req as any).user = mockUser;
      next();
    },
    authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
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
};

// Build a mini Express app wiring only the adminPartners router at /partners
function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../../src/routes/adminPartners.routes').default;
  app.use('/partners', router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
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
      return keys.map((_k: string, i: number) => ({ id: `perm-${i}` }));
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
    writeAuditSpy.mockReset();
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

// ─── §13 Fix 2 — control.rules.* permission gates ───────────────────────────

describe('§13 Fix 2 — fraud-rules permission gates (static catalog checks)', () => {
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
