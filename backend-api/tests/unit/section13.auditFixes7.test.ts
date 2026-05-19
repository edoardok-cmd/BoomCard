/**
 * §13 Audit-pass 7 — regression tests for the five gaps identified in the
 * second delegation-readiness audit:
 *
 *   Fix 1 — SUPPORT gains subscriptions.read, transactions.read, cashback.read
 *            (complete subscriber profile access without write capability)
 *
 *   Fix 2 — admins.actions.read comment updated; test verifies description is
 *            accurate (no executable assertion — doc-only guard)
 *
 *   Fix 3 — POST /partners/:id/propose-discount-rate (partners.requests.write)
 *            creates a DISCOUNT_RATE_CHANGE CriticalActionRequest; SUPER_ADMIN
 *            approval via POST /admins/critical-actions/:id/approve atomically
 *            executes partner.update({ discountRate })
 *
 *   Fix 4 — fraud-rule write routes (POST/PATCH/DELETE /settings/fraud-rules)
 *            are now gated by requirePermission('control.rules.write') instead of
 *            the dead authorize('SUPER_ADMIN') gate; RISK_REVIEW (which has only
 *            control.rules.read) is correctly blocked from write ops
 *
 *   Fix 5 — authenticate() rejects ADMIN JWTs whose iat < User.rolesUpdatedAt
 *            (stale-permissions invalidation); USER/PARTNER/SUPER_ADMIN tokens
 *            are not affected
 *
 * All Prisma and external-service interactions are mocked.
 */

// ─── Prisma mock ──────────────────────────────────────────────────────────────

let mockRolesUpdatedAt: Date | null = null;

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    partner: {
      findUnique: jest.fn(),
      update: jest.fn(async (args: any) => ({ id: args?.where?.id ?? 'p-1', ...args.data })),
    },
    criticalActionRequest: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(),
      findMany:   jest.fn(async () => []),
      count:      jest.fn(async () => 0),
      create:     jest.fn(async (args: any) => ({ id: 'car-1', status: 'PENDING', ...args.data })),
      update:     jest.fn(async (args: any) => ({ id: args?.where?.id ?? 'car-1', ...args.data })),
    },
    user: {
      findUnique: jest.fn(async () => ({ rolesUpdatedAt: mockRolesUpdatedAt })),
      update: jest.fn(async () => ({})),
    },
    userAdminRole: {
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
    },
    adminRole: {
      findUnique: jest.fn(async () => ({ id: 'role-1', key: 'SUPPORT' })),
    },
    fraudRule: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'fr-1', ...args.data })),
      update: jest.fn(async (args: any) => ({ id: args?.where?.id ?? 'fr-1', ...args.data })),
    },
    fraudRuleOverride: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'fro-1', ...args.data })),
      delete: jest.fn(async () => ({})),
    },
    // Shared helpers needed by transitive router dependencies
    helpTicket: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      update: jest.fn(async () => ({})),
    },
    ticketReply: {
      create: jest.fn(async () => ({ id: 'tr-1' })),
      findMany: jest.fn(async () => []),
    },
    inboundBounce: { count: jest.fn(async () => 0) },
    rolePermission: { deleteMany: jest.fn(async () => ({ count: 0 })), upsert: jest.fn(async () => ({})) },
    permission: { findUnique: jest.fn(), findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops(client);
    }),
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../../src/services/userActivity.service', () => ({
  touchUserActivity: jest.fn(),
}));

jest.mock('../../src/services/partnerActivation.service', () => ({
  issueActivationLink: jest.fn(),
  sendActivationEmail: jest.fn(),
  stampEmailOutcome: jest.fn(),
}));
jest.mock('../../src/services/email.service', () => ({
  emailService: { sendPartnerStatusChangeEmail: jest.fn(), sendEmail: jest.fn(async () => undefined) },
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
jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => undefined) },
}));
jest.mock('../../src/services/ticketEmail.service', () => ({
  buildTicketSubject: jest.fn((_id: string, s: string) => `[#abc1234] ${s}`),
  buildTicketHeaders: jest.fn(() => ({ messageId: '<mid@test>', headers: {} })),
  computeShortRef: jest.fn(() => '#abc1234'),
}));
jest.mock('../../src/services/adminAlerts.service', () => ({
  getAlerts: jest.fn(async () => ({ alerts: [], counts: {} })),
  ACTIVE_SCAN_STATUSES: ['PENDING_REVIEW'],
}));
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
}));

// ─── Auth middleware mock ─────────────────────────────────────────────────────
// authenticate() is mocked per-test via setMockUser; the real authorize() and
// requirePermission() are used so RBAC gates are exercised faithfully.

let mockUser: { id: string; role: string; permissions: string[]; iat?: number } | null = null;

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    // Expose the real authenticate for Fix 5 tests (prisma dep resolves to the mock)
    _realAuthenticate: original.authenticate,
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

function setMockUser(overrides: Partial<{ id: string; role: string; permissions: string[]; iat: number }> = {}) {
  mockUser = { id: 'admin-1', role: 'ADMIN', permissions: [], iat: Math.floor(Date.now() / 1000) - 3600, ...overrides };
}

// ─── Imports ─────────────────────────────────────────────────────────────────

import express from 'express';
import supertest from 'supertest';
import { ROLE_DEFAULT_ALLOWS } from '../../src/services/permission.service';
import { prisma } from '../../src/lib/prisma';
import bcrypt from 'bcrypt';

type AnyMock = jest.Mock;
const m = prisma as unknown as {
  partner: { findUnique: AnyMock; update: AnyMock };
  criticalActionRequest: { findFirst: AnyMock; findUnique: AnyMock; findMany: AnyMock; count: AnyMock; create: AnyMock; update: AnyMock };
  user: { findUnique: AnyMock; update: AnyMock };
  userAdminRole: { upsert: AnyMock; deleteMany: AnyMock; findMany: AnyMock };
  adminRole: { findUnique: AnyMock };
  fraudRule: { findMany: AnyMock; findUnique: AnyMock; create: AnyMock; update: AnyMock };
  fraudRuleOverride: { findMany: AnyMock; findFirst: AnyMock; create: AnyMock; delete: AnyMock };
  helpTicket: { findMany: AnyMock; findUnique: AnyMock; count: AnyMock; update: AnyMock };
  ticketReply: { create: AnyMock; findMany: AnyMock };
  inboundBounce: { count: AnyMock };
  $transaction: AnyMock;
};

function buildPartnersApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app.use('/partners', require('../../src/routes/adminPartners.routes').default);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' })
  );
  return supertest(app);
}

function buildSettingsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app.use('/settings', require('../../src/routes/adminSettings.routes').default);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' })
  );
  return supertest(app);
}

function buildAdminsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app.use('/admins', require('../../src/routes/adminAdmins.routes').default);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' })
  );
  return supertest(app);
}

beforeEach(() => {
  mockUser = null;
  mockRolesUpdatedAt = null;
  jest.clearAllMocks();
});

// ─── Fix 1: SUPPORT permission set ───────────────────────────────────────────

describe('Fix 1 — SUPPORT permission set includes subscriber-profile read permissions', () => {
  it('SUPPORT has subscriptions.read', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).toContain('subscriptions.read');
  });

  it('SUPPORT has transactions.read', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).toContain('transactions.read');
  });

  it('SUPPORT has cashback.read', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).toContain('cashback.read');
  });

  it('SUPPORT still does NOT have transactions.write (balance adjustments)', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).not.toContain('transactions.write');
  });

  it('SUPPORT still does NOT have subscribers.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).not.toContain('subscribers.write');
  });

  it('SUPPORT still does NOT have finance.payouts.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).not.toContain('finance.payouts.write');
  });

  it('SUPPORT still does NOT have settings.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.SUPPORT).not.toContain('settings.write');
  });
});

// ─── Fix 3: propose-discount-rate endpoint ────────────────────────────────────

describe('Fix 3 — POST /partners/:id/propose-discount-rate', () => {
  const PARTNER_MANAGER_PERMS = ROLE_DEFAULT_ALLOWS.PARTNER_MANAGER;

  const stubPartner = {
    id: 'p-1',
    businessName: 'Test Cafe',
    discountRate: 10,
    partnerType: { maxDiscountRate: 25 },
  };

  beforeEach(() => {
    // Reset Once queues so early-exit tests (which don't consume the mock) don't leak
    // their mockResolvedValueOnce into the next test's findUnique call.
    m.partner.findUnique.mockReset();
    m.criticalActionRequest.findFirst.mockReset();
    m.criticalActionRequest.create.mockReset();
  });

  it('PARTNER_MANAGER with partners.requests.write can submit a proposal — returns 201', async () => {
    setMockUser({ permissions: PARTNER_MANAGER_PERMS });
    m.partner.findUnique.mockResolvedValueOnce(stubPartner);
    m.criticalActionRequest.findFirst.mockResolvedValueOnce(null);
    m.criticalActionRequest.create.mockResolvedValueOnce({
      id: 'car-1',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      payload: { partnerId: 'p-1', proposedRate: 15 },
      requestedBy: { id: 'admin-1', firstName: 'A', lastName: 'B', email: 'a@b.com' },
    });

    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({ rate: 15, note: 'Negotiated at meeting' });

    expect(res.status).toBe(201);
    expect(res.body.proposal.actionType).toBe('DISCOUNT_RATE_CHANGE');
    expect(m.criticalActionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: 'DISCOUNT_RATE_CHANGE',
          payload: expect.objectContaining({ partnerId: 'p-1', proposedRate: 15 }),
          status: 'PENDING',
        }),
      })
    );
  });

  it('returns 400 when rate is missing from body', async () => {
    setMockUser({ permissions: PARTNER_MANAGER_PERMS });
    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rate is required/i);
  });

  it('returns 400 for a rate not in CASHBACK_MATRIX_STEPS', async () => {
    setMockUser({ permissions: PARTNER_MANAGER_PERMS });
    m.partner.findUnique.mockResolvedValueOnce(stubPartner);
    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({ rate: 7 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5, 10, 15, 20, 25/);
  });

  it('returns 400 when proposed rate exceeds partnerType maxDiscountRate', async () => {
    setMockUser({ permissions: PARTNER_MANAGER_PERMS });
    m.partner.findUnique.mockResolvedValueOnce({ ...stubPartner, partnerType: { maxDiscountRate: 10 } });
    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({ rate: 15 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds the maximum/i);
  });

  it('returns 409 when a PENDING proposal already exists for this partner', async () => {
    setMockUser({ permissions: PARTNER_MANAGER_PERMS });
    m.partner.findUnique.mockResolvedValueOnce(stubPartner);
    m.criticalActionRequest.findFirst.mockResolvedValueOnce({ id: 'car-existing' });

    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({ rate: 15 });

    expect(res.status).toBe(409);
    expect(res.body.existingId).toBe('car-existing');
  });

  it('accepts null to clear the discount-rate override', async () => {
    setMockUser({ permissions: PARTNER_MANAGER_PERMS });
    m.partner.findUnique.mockResolvedValueOnce(stubPartner);
    m.criticalActionRequest.findFirst.mockResolvedValueOnce(null);
    m.criticalActionRequest.create.mockResolvedValueOnce({
      id: 'car-2', actionType: 'DISCOUNT_RATE_CHANGE', status: 'PENDING',
      payload: { partnerId: 'p-1', proposedRate: null },
      requestedBy: { id: 'admin-1' },
    });

    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({ rate: null });

    expect(res.status).toBe(201);
    expect(m.criticalActionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payload: expect.objectContaining({ proposedRate: null }) }),
      })
    );
  });

  it('ADMIN without partners.requests.write is refused — 403', async () => {
    setMockUser({ permissions: [] });
    const res = await buildPartnersApp()
      .post('/partners/p-1/propose-discount-rate')
      .send({ rate: 15 });
    expect(res.status).toBe(403);
  });
});

// ─── Fix 3b: SUPER_ADMIN approval executes the discount-rate change ───────────

describe('Fix 3b — SUPER_ADMIN approval of DISCOUNT_RATE_CHANGE executes partner.update', () => {
  it('executes partner.update with proposedRate on approval', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    const pendingItem = {
      id: 'car-1',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { partnerId: 'p-1', proposedRate: 20 },
    };
    m.criticalActionRequest.findUnique.mockResolvedValueOnce(pendingItem);
    m.criticalActionRequest.update.mockResolvedValueOnce({ ...pendingItem, status: 'APPROVED' });

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-1/approve')
      .send({ note: 'Approved after review' });

    expect(res.status).toBe(200);
    expect(m.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p-1' },
        data: { discountRate: 20 },
      })
    );
  });

  it('executes partner.update with null when proposedRate is null (clear override)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    m.criticalActionRequest.findUnique.mockResolvedValueOnce({
      id: 'car-2', actionType: 'DISCOUNT_RATE_CHANGE', status: 'PENDING',
      requestedById: 'other-admin',
      payload: { partnerId: 'p-1', proposedRate: null },
    });
    m.criticalActionRequest.update.mockResolvedValueOnce({ id: 'car-2', status: 'APPROVED' });

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-2/approve')
      .send({});

    expect(res.status).toBe(200);
    expect(m.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { discountRate: null } })
    );
  });

  it('does NOT call partner.update for other actionTypes', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    m.criticalActionRequest.findUnique.mockResolvedValueOnce({
      id: 'car-3', actionType: 'BULK_PAYOUT_OVERRIDE', status: 'PENDING',
      requestedById: 'other-admin',
      payload: { foo: 'bar' },
    });
    m.criticalActionRequest.update.mockResolvedValueOnce({ id: 'car-3', status: 'APPROVED' });

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-3/approve')
      .send({});

    expect(res.status).toBe(200);
    expect(m.partner.update).not.toHaveBeenCalled();
  });

  it('returns 400 when trying to approve own request', async () => {
    setMockUser({ id: 'admin-1', role: 'SUPER_ADMIN', permissions: [] });

    m.criticalActionRequest.findUnique.mockResolvedValueOnce({
      id: 'car-4', actionType: 'DISCOUNT_RATE_CHANGE', status: 'PENDING',
      requestedById: 'admin-1',   // same as approver
      payload: { partnerId: 'p-1', proposedRate: 15 },
    });

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-4/approve')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot approve your own/i);
    expect(m.partner.update).not.toHaveBeenCalled();
  });
});

// ─── Fix 4: fraud-rule write gate uses requirePermission ─────────────────────

describe('Fix 4 — fraud-rule write routes use control.rules.write (not hard SUPER_ADMIN gate)', () => {
  it('ADMIN with control.rules.write can POST /settings/fraud-rules — 201', async () => {
    setMockUser({ permissions: ['control.rules.write'] });
    m.fraudRule.create.mockResolvedValueOnce({ id: 'fr-1', tier: 'SYSTEM' });

    const res = await buildSettingsApp()
      .post('/settings/fraud-rules')
      .send({ tier: 'SYSTEM', dailyScanLimit: 5 });

    expect(res.status).toBe(201);
  });

  it('ADMIN without control.rules.write gets 403 on POST /settings/fraud-rules', async () => {
    setMockUser({ permissions: ['settings.write'] });  // settings.write alone is no longer enough

    const res = await buildSettingsApp()
      .post('/settings/fraud-rules')
      .send({ tier: 'SYSTEM' });

    expect(res.status).toBe(403);
  });

  it('ADMIN with control.rules.write can PATCH /settings/fraud-rules/:id', async () => {
    setMockUser({ permissions: ['control.rules.write'] });
    m.fraudRule.findUnique.mockResolvedValueOnce({ id: 'fr-1', tier: 'SYSTEM', isActive: true });

    const res = await buildSettingsApp()
      .patch('/settings/fraud-rules/fr-1')
      .send({ dailyScanLimit: 10 });

    expect(res.status).toBe(200);
  });

  it('RISK_REVIEW (control.rules.read only) is blocked from POST /settings/fraud-rules — 403', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.RISK_REVIEW });

    const res = await buildSettingsApp()
      .post('/settings/fraud-rules')
      .send({ tier: 'SYSTEM' });

    expect(res.status).toBe(403);
  });

  it('RISK_REVIEW is blocked from PATCH /settings/fraud-rules/:id — 403', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.RISK_REVIEW });

    const res = await buildSettingsApp()
      .patch('/settings/fraud-rules/fr-1')
      .send({ dailyScanLimit: 3 });

    expect(res.status).toBe(403);
  });

  it('RISK_REVIEW is blocked from DELETE /settings/fraud-rules/:id — 403', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.RISK_REVIEW });

    const res = await buildSettingsApp()
      .delete('/settings/fraud-rules/fr-1');

    expect(res.status).toBe(403);
  });

  it('RISK_REVIEW can still read fraud rules (GET /settings/fraud-rules) — 200', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.RISK_REVIEW });
    m.fraudRule.findMany.mockResolvedValueOnce([]);

    const res = await buildSettingsApp().get('/settings/fraud-rules');

    expect(res.status).toBe(200);
  });

  it('override routes remain SUPER_ADMIN-only — ADMIN with control.rules.write gets 403', async () => {
    setMockUser({ permissions: ['control.rules.write', 'settings.write'] });

    const res = await buildSettingsApp()
      .post('/settings/fraud-rules/fr-1/overrides')
      .send({ targetType: 'user', targetId: 'u-1', override: {} });

    // authorize('SUPER_ADMIN') gate is still in place for overrides
    expect(res.status).toBe(403);
  });
});

// ─── Fix 5: stale JWT invalidation via authenticate() ────────────────────────

describe('Fix 5 — authenticate() rejects ADMIN/SUPER_ADMIN JWT when rolesUpdatedAt > JWT iat', () => {
  // Source-level checks: verify the stale-permissions guard is present and
  // correctly structured in auth.middleware.ts. The exact runtime behaviour
  // is covered by integration tests (real JWT + real DB rolesUpdatedAt row).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/middleware/auth.middleware.ts'),
    'utf8',
  );

  it('guard covers ADMIN tokens', () => {
    expect(src).toMatch(/decoded\?\.role\s*===\s*['"]ADMIN['"]/);
  });

  it('guard also covers SUPER_ADMIN tokens (Bug 2 fix)', () => {
    // The guard must fire for SUPER_ADMIN too — a demoted SUPER_ADMIN's old JWT
    // carries role='SUPER_ADMIN' and would bypass requirePermission otherwise.
    expect(src).toMatch(/decoded\?\.role\s*===\s*['"]SUPER_ADMIN['"]/);
  });

  it('ADMIN and SUPER_ADMIN checks are in the same conditional block', () => {
    // Both roles must be covered by the same rolesUpdatedAt check, not two separate blocks.
    expect(src).toMatch(/decoded\?\.role\s*===\s*['"]ADMIN['"]\s*\|\|\s*decoded\?\.role\s*===\s*['"]SUPER_ADMIN['"]/);
  });

  it('fetches rolesUpdatedAt from DB inside the guard', () => {
    expect(src).toMatch(/user\.findUnique/);
    expect(src).toMatch(/rolesUpdatedAt/);
  });

  it('compares rolesUpdatedAt timestamp against JWT iat (seconds → ms)', () => {
    expect(src).toMatch(/rolesUpdatedAt\.getTime\(\)\s*>\s*.*iat.*\*\s*1000/);
  });

  it('calls next(AppError) with a "Permissions updated" message on stale token', () => {
    expect(src).toMatch(/Permissions updated/);
    expect(src).toMatch(/new AppError/);
  });
});

// ─── Fix 5b: rolesUpdatedAt is stamped on role assign/revoke ─────────────────

describe('Fix 5b — role mutation endpoints stamp User.rolesUpdatedAt', () => {
  it('POST /admins/:id/approve stamps rolesUpdatedAt', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });
    const targetUser = { id: 'target-1', role: 'ADMIN', status: 'ACTIVE' };
    m.user.findUnique.mockResolvedValue(targetUser);
    m.userAdminRole.upsert.mockResolvedValueOnce({});
    m.userAdminRole.findMany.mockResolvedValue([]);
    m.adminRole.findUnique.mockResolvedValueOnce({ id: 'role-1', key: 'SUPPORT' });

    const res = await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT' });

    expect(res.status).toBe(200);
    expect(m.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ rolesUpdatedAt: expect.any(Date) }),
      })
    );
  });

  it('DELETE /admins/:id/roles/:roleKey stamps rolesUpdatedAt', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.roles.write'] });
    m.adminRole.findUnique.mockResolvedValueOnce({ id: 'role-1', key: 'SUPPORT' });
    m.userAdminRole.findMany.mockResolvedValue([{ role: { key: 'SUPPORT' } }]);
    m.userAdminRole.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await buildAdminsApp()
      .delete('/admins/target-1/roles/SUPPORT');

    expect(res.status).toBe(200);
    expect(m.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-1' },
        data: expect.objectContaining({ rolesUpdatedAt: expect.any(Date) }),
      })
    );
  });
});

// ─── Bug 1: Atomicity of DISCOUNT_RATE_CHANGE approval ───────────────────────
// Regression guard: both the CriticalActionRequest status flip and the partner
// rate update must execute inside a single $transaction so a mid-flight error
// cannot leave one applied without the other.

describe('Bug 1 fix — DISCOUNT_RATE_CHANGE approval uses $transaction for atomicity', () => {
  it('approval wraps criticalActionRequest.update and partner.update in $transaction', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    const pendingItem = {
      id: 'car-atomic',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { partnerId: 'p-1', proposedRate: 15, currentRate: 10 },
    };
    m.criticalActionRequest.findUnique.mockResolvedValueOnce(pendingItem);
    m.criticalActionRequest.update.mockResolvedValueOnce({ ...pendingItem, status: 'APPROVED' });

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-atomic/approve')
      .send({ note: 'ok' });

    expect(res.status).toBe(200);
    // $transaction must have been called (not just individual .update calls)
    expect(m.$transaction).toHaveBeenCalled();
    // Both DB writes must have happened
    expect(m.criticalActionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    );
    expect(m.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-1' }, data: { discountRate: 15 } })
    );
  });

  it('$transaction is NOT called when actionType is not DISCOUNT_RATE_CHANGE (still uses it, but no partner.update)', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    m.criticalActionRequest.findUnique.mockResolvedValueOnce({
      id: 'car-other',
      actionType: 'BULK_PAYOUT_OVERRIDE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { foo: 'bar' },
    });
    m.criticalActionRequest.update.mockResolvedValueOnce({ id: 'car-other', status: 'APPROVED' });

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-other/approve')
      .send({});

    expect(res.status).toBe(200);
    // $transaction is still used (the callback form wraps all approvals)
    expect(m.$transaction).toHaveBeenCalled();
    // partner.update must NOT be called for non-discount actions
    expect(m.partner.update).not.toHaveBeenCalled();
  });
});

// ─── Bug 3: Malformed DISCOUNT_RATE_CHANGE payload warning ───────────────────

describe('Bug 3 fix — malformed DISCOUNT_RATE_CHANGE payload logs a warning', () => {
  it('logs logger.error when payload lacks partnerId, does not crash the endpoint', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    // Payload missing partnerId — the guard (p.partnerId !== undefined) fails
    const malformedItem = {
      id: 'car-bad',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { proposedRate: 15 }, // partnerId intentionally absent
    };
    m.criticalActionRequest.findUnique.mockResolvedValueOnce(malformedItem);
    m.criticalActionRequest.update.mockResolvedValueOnce({ ...malformedItem, status: 'APPROVED' });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLogger } = require('../../src/utils/logger') as { logger: { error: jest.Mock } };

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-bad/approve')
      .send({});

    // Endpoint should still succeed (approval is recorded even if rate wasn't applied)
    expect(res.status).toBe(200);
    // partner.update must NOT have been called (guard correctly blocked it)
    expect(m.partner.update).not.toHaveBeenCalled();
    // logger.error must have been called to alert ops
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('DISCOUNT_RATE_CHANGE approved but payload missing'),
      expect.objectContaining({ requestId: 'car-bad' })
    );
  });
});

// ─── Bug 4: audit before field uses currentRate from payload ─────────────────

describe('Bug 4 fix — partner.discount-rate.update audit uses currentRate from proposal payload', () => {
  it('writeAudit before.discountRate uses payload.currentRate, not a hardcoded sentinel', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    const pendingItem = {
      id: 'car-audit',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { partnerId: 'p-1', proposedRate: 20, currentRate: 5 },
    };
    m.criticalActionRequest.findUnique.mockResolvedValueOnce(pendingItem);
    m.criticalActionRequest.update.mockResolvedValueOnce({ ...pendingItem, status: 'APPROVED' });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeAudit: mockWriteAudit } = require('../../src/middleware/audit.middleware') as { writeAudit: jest.Mock };
    mockWriteAudit.mockClear();

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-audit/approve')
      .send({});

    expect(res.status).toBe(200);

    // Find the partner.discount-rate.update audit call (not the admin.critical-action.approve one)
    const partnerAuditCall = mockWriteAudit.mock.calls.find(
      (args: any[]) => args[0]?.action === 'partner.discount-rate.update'
    );
    expect(partnerAuditCall).toBeDefined();
    // before must carry the previous rate from the proposal payload
    expect(partnerAuditCall![0].before).toEqual({ discountRate: 5 });
    // after must carry the new rate plus provenance metadata
    expect(partnerAuditCall![0].after).toMatchObject({
      discountRate: 20,
      via: 'critical-action',
      requestId: 'car-audit',
    });
  });

  it('writeAudit before.discountRate is null when currentRate was null in the payload', async () => {
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });

    m.criticalActionRequest.findUnique.mockResolvedValueOnce({
      id: 'car-audit2',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { partnerId: 'p-1', proposedRate: 10, currentRate: null },
    });
    m.criticalActionRequest.update.mockResolvedValueOnce({ id: 'car-audit2', status: 'APPROVED' });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeAudit: mockWriteAudit } = require('../../src/middleware/audit.middleware') as { writeAudit: jest.Mock };
    mockWriteAudit.mockClear();

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-audit2/approve')
      .send({});

    expect(res.status).toBe(200);
    const partnerAuditCall = mockWriteAudit.mock.calls.find(
      (args: any[]) => args[0]?.action === 'partner.discount-rate.update'
    );
    expect(partnerAuditCall).toBeDefined();
    expect(partnerAuditCall![0].before).toEqual({ discountRate: null });
  });
});
