/**
 * §13 Audit-pass 8 — regression tests for the six gaps identified in the
 * third delegation-readiness audit:
 *
 *   Bug 1  — RISK_REVIEW gains cashback.read (required to see cashback entry
 *            state when investigating a flagged transaction)
 *
 *   Bug 2  — FINANCE gains subscriptions.read (required to view subscription
 *            plan/history when processing payouts and resolving invoice disputes)
 *
 *   Bug 3  — auto-reject writeAudit in POST /admins/critical-actions/:id/approve
 *            is now awaited inside try/catch instead of fire-and-forget, so a
 *            failed audit write surfaces rather than being silently dropped
 *
 *   Gap 1  — GET /control/security now accepts control.risk.read in addition
 *            to admins.audit.read, giving RISK_REVIEW access to security-relevant
 *            audit events (login failures, auth anomalies)
 *
 *   Gap 2  — GET /admins/pending-all now accepts admins.actions.read (OR
 *            admins.read); callers with only admins.actions.read receive an
 *            empty pendingRoleAssignments and pendingSuperAdmins, letting
 *            PARTNER_MANAGER see their pending critical-action requests via the
 *            unified dashboard endpoint
 *
 *   Gap 3  — UserAdminRole.expiresAt: time-bounded role assignments
 *              a) POST /admins/:id/approve accepts optional expiresAt body field
 *              b) resolveUserPermissions excludes expired roles
 *              c) authenticate() detects expired roles, stamps rolesUpdatedAt,
 *                 and returns 401 forcing re-login with a clean permission set
 *
 * All Prisma and external-service interactions are mocked.
 */

// ─── Prisma mock ──────────────────────────────────────────────────────────────

let mockRolesUpdatedAt: Date | null = null;
// Simulates the adminRoles returned from the expiry sub-select in authenticate().
// Set to an array with at least one element to simulate an expired role.
let mockExpiredAdminRoles: Array<{ expiresAt: Date }> = [];

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    partner: {
      findUnique: jest.fn(),
      update: jest.fn(async (args: any) => ({ id: args?.where?.id ?? 'p-1', ...args.data })),
    },
    criticalActionRequest: {
      findFirst:  jest.fn(async () => null),
      findUnique: jest.fn(),
      findMany:   jest.fn(async () => []),
      count:      jest.fn(async () => 0),
      create:     jest.fn(async (args: any) => ({ id: 'car-1', status: 'PENDING', ...args.data })),
      update:     jest.fn(async (args: any) => ({ id: args?.where?.id ?? 'car-1', ...args.data })),
    },
    pendingSuperAdminRequest: {
      findMany: jest.fn(async () => []),
    },
    user: {
      findFirst:  jest.fn(async () => null),
      findUnique: jest.fn(async () => ({
        rolesUpdatedAt: mockRolesUpdatedAt,
        adminRoles: mockExpiredAdminRoles,
      })),
      findMany: jest.fn(async () => []),
      count:    jest.fn(async () => 0),
      update:   jest.fn(async () => ({})),
      create:   jest.fn(async (args: any) => ({ id: 'new-user-1', ...args.data })),
    },
    userAdminRole: {
      upsert:     jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      findMany:   jest.fn(async () => []),
    },
    adminRole: {
      findUnique: jest.fn(async () => ({ id: 'role-1', key: 'SUPPORT' })),
    },
    auditLog: {
      findMany: jest.fn(async () => []),
      count:    jest.fn(async () => 0),
    },
    fraudRule: {
      findMany:   jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      create:     jest.fn(async (args: any) => ({ id: 'fr-1', ...args.data })),
      update:     jest.fn(async (args: any) => ({ id: args?.where?.id ?? 'fr-1', ...args.data })),
    },
    fraudRuleOverride: {
      findMany:  jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create:    jest.fn(async (args: any) => ({ id: 'fro-1', ...args.data })),
      delete:    jest.fn(async () => ({})),
    },
    helpTicket: {
      findMany:   jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
      count:      jest.fn(async () => 0),
      update:     jest.fn(async () => ({})),
    },
    ticketReply: {
      create:  jest.fn(async () => ({ id: 'tr-1' })),
      findMany: jest.fn(async () => []),
    },
    inboundBounce: { count: jest.fn(async () => 0) },
    rolePermission: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      upsert:     jest.fn(async () => ({})),
    },
    permission: {
      findUnique: jest.fn(),
      findMany:   jest.fn(async () => []),
      upsert:     jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops(client);
    }),
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit:      jest.fn(async () => undefined),
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
  stampEmailOutcome:   jest.fn(),
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
  parseVenueCountBucket:            jest.fn(),
  formatVenueCountBucket:           jest.fn(),
  VENUE_COUNT_BUCKET_DISPLAY_VALUES: {},
}));
jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => undefined) },
}));
jest.mock('../../src/services/ticketEmail.service', () => ({
  buildTicketSubject: jest.fn((_id: string, s: string) => `[#abc1234] ${s}`),
  buildTicketHeaders: jest.fn(() => ({ messageId: '<mid@test>', headers: {} })),
  computeShortRef:    jest.fn(() => '#abc1234'),
}));
jest.mock('../../src/services/adminAlerts.service', () => ({
  getAlerts:            jest.fn(async () => ({ alerts: [], counts: {} })),
  ACTIVE_SCAN_STATUSES: ['PENDING_REVIEW'],
}));
jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
}));

// ─── Auth middleware mock ─────────────────────────────────────────────────────

let mockUser: { id: string; role: string; permissions: string[]; iat?: number } | null = null;

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
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

function setMockUser(
  overrides: Partial<{ id: string; role: string; permissions: string[]; iat: number }> = {},
) {
  mockUser = {
    id: 'admin-1',
    role: 'ADMIN',
    permissions: [],
    iat: Math.floor(Date.now() / 1000) - 3600,
    ...overrides,
  };
}

// ─── Imports ─────────────────────────────────────────────────────────────────

import express from 'express';
import supertest from 'supertest';
import { ROLE_DEFAULT_ALLOWS } from '../../src/services/permission.service';
import { prisma } from '../../src/lib/prisma';

type AnyMock = jest.Mock;
const m = prisma as unknown as {
  partner:                { findUnique: AnyMock; update: AnyMock };
  criticalActionRequest:  { findFirst: AnyMock; findUnique: AnyMock; findMany: AnyMock; count: AnyMock; create: AnyMock; update: AnyMock };
  pendingSuperAdminRequest: { findMany: AnyMock };
  user:                   { findFirst: AnyMock; findUnique: AnyMock; findMany: AnyMock; count: AnyMock; update: AnyMock; create: AnyMock };
  userAdminRole:          { upsert: AnyMock; deleteMany: AnyMock; findMany: AnyMock };
  adminRole:              { findUnique: AnyMock };
  auditLog:               { findMany: AnyMock; count: AnyMock };
  fraudRule:              { findMany: AnyMock; findUnique: AnyMock; create: AnyMock; update: AnyMock };
  fraudRuleOverride:      { findMany: AnyMock; findFirst: AnyMock; create: AnyMock; delete: AnyMock };
  $transaction:           AnyMock;
};

function buildAdminsApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app.use('/admins', require('../../src/routes/adminAdmins.routes').default);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' }),
  );
  return supertest(app);
}

function buildControlApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  app.use('/control', require('../../src/routes/adminControl.routes').default);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? err.statusCode ?? 500).json({ error: err.message ?? 'Internal error' }),
  );
  return supertest(app);
}

beforeEach(() => {
  mockUser                = null;
  mockRolesUpdatedAt      = null;
  mockExpiredAdminRoles   = [];
  jest.clearAllMocks();
  // jest.clearAllMocks() clears call history but NOT queued mockResolvedValueOnce
  // values. A supertest transport hiccup under load can return 401 before a request
  // reaches the router, leaving the criticalActionRequest.findUnique value that test
  // queued unconsumed; it then resolves the next test's findUnique and shifts every
  // subsequent payload by one (the requestId one-test offset). mockReset() drains the
  // stranded once-queue so the suite is deterministic regardless of a dropped request.
  m.criticalActionRequest.findUnique.mockReset();
  m.partner.findUnique.mockReset();
  // findMany/count carry the same risk: the Gap-2 / Gap-2-follow-up tests queue
  // criticalActionRequest.findMany.mockResolvedValueOnce (and count.*Once), and a
  // transport-stranded request leaves that once-value to resolve the next test's
  // call — shifting the response payload by one (toHaveLength(0) on a should-be-
  // populated array, or a stale `where` shape). Drain those once-queues too. They
  // have default impls in the mock factory, so re-seat the defaults after reset.
  m.criticalActionRequest.findMany.mockReset();
  m.criticalActionRequest.findMany.mockImplementation(async () => []);
  m.criticalActionRequest.count.mockReset();
  m.criticalActionRequest.count.mockImplementation(async () => 0);
  // Restore default findUnique behaviour after each test resets it.
  m.user.findUnique.mockImplementation(async () => ({
    rolesUpdatedAt: mockRolesUpdatedAt,
    adminRoles:     mockExpiredAdminRoles,
  }));
});

// ─── Bug 1: RISK_REVIEW gains cashback.read ───────────────────────────────────

describe('Bug 1 fix — RISK_REVIEW permission set includes cashback.read', () => {
  it('RISK_REVIEW has cashback.read', () => {
    expect(ROLE_DEFAULT_ALLOWS.RISK_REVIEW).toContain('cashback.read');
  });

  it('RISK_REVIEW still has all required control permissions', () => {
    const perms = ROLE_DEFAULT_ALLOWS.RISK_REVIEW;
    expect(perms).toContain('control.risk.read');
    expect(perms).toContain('control.risk.write');
    expect(perms).toContain('control.disputes.read');
    expect(perms).toContain('control.disputes.write');
    expect(perms).toContain('control.rules.read');
  });

  it('RISK_REVIEW still does NOT have cashback.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.RISK_REVIEW).not.toContain('cashback.write');
  });

  it('RISK_REVIEW still does NOT have control.rules.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.RISK_REVIEW).not.toContain('control.rules.write');
  });
});

// ─── Bug 2: FINANCE gains subscriptions.read ─────────────────────────────────

describe('Bug 2 fix — FINANCE permission set includes subscriptions.read', () => {
  it('FINANCE has subscriptions.read', () => {
    expect(ROLE_DEFAULT_ALLOWS.FINANCE).toContain('subscriptions.read');
  });

  it('FINANCE still has all required finance permissions', () => {
    const perms = ROLE_DEFAULT_ALLOWS.FINANCE;
    expect(perms).toContain('finance.payouts.read');
    expect(perms).toContain('finance.payouts.write');
    expect(perms).toContain('finance.invoices.read');
    expect(perms).toContain('finance.invoices.write');
    expect(perms).toContain('finance.periods.read');
    expect(perms).toContain('finance.periods.write');
    expect(perms).toContain('finance.reports.read');
  });

  it('FINANCE still does NOT have subscriptions.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.FINANCE).not.toContain('subscriptions.write');
  });

  it('FINANCE still does NOT have transactions.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.FINANCE).not.toContain('transactions.write');
  });

  it('FINANCE still does NOT have settings.write', () => {
    expect(ROLE_DEFAULT_ALLOWS.FINANCE).not.toContain('settings.write');
  });
});

// ─── Bug 3: auto-reject writeAudit is awaited ────────────────────────────────

describe('Bug 3 fix — auto-reject writeAudit in approve handler uses await, not fire-and-forget', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs   = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path') as typeof import('path');
  const src  = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/adminAdmins.routes.ts'),
    'utf8',
  );

  it('auto-reject block contains await writeAudit (not a standalone writeAudit call)', () => {
    // The auto-reject path must use `await writeAudit` so the audit record is
    // committed before returning 422.  A bare `writeAudit(...)` call (without
    // await) is fire-and-forget — the audit entry may be silently lost if the
    // write fails after the response has already been sent.
    expect(src).toMatch(/auto-reject[\s\S]{0,400}await writeAudit/);
  });

  it('auto-reject block wraps writeAudit in try/catch (audit failure does not surface as 500)', () => {
    expect(src).toMatch(/auto-reject[\s\S]{0,600}try\s*\{[\s\S]{0,400}await writeAudit/);
  });

  it('runtime: writeAudit is awaited — mock can observe the call before 422 is returned', async () => {
    // If writeAudit were fire-and-forget, a slow mock might not have been called
    // by the time the response arrives.  With await, the call is guaranteed to
    // precede the response.
    setMockUser({ role: 'SUPER_ADMIN', permissions: [] });
    m.criticalActionRequest.findUnique.mockResolvedValueOnce({
      id: 'car-await-test',
      actionType: 'DISCOUNT_RATE_CHANGE',
      status: 'PENDING',
      requestedById: 'other-admin',
      payload: { proposedRate: 15 }, // missing partnerId — triggers auto-reject
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeAudit: mockWriteAudit } = require('../../src/middleware/audit.middleware') as {
      writeAudit: jest.Mock;
    };

    const res = await buildAdminsApp()
      .post('/admins/critical-actions/car-await-test/approve')
      .send({});

    expect(res.status).toBe(422);
    // writeAudit MUST have been called before the 422 response arrives
    const autoRejectCall = mockWriteAudit.mock.calls.find(
      (args: any[]) => args[0]?.action === 'admin.critical-action.auto-reject',
    );
    expect(autoRejectCall).toBeDefined();
  });
});

// ─── Gap 1: /control/security accessible to RISK_REVIEW via control.risk.read ─

describe('Gap 1 fix — GET /control/security accepts control.risk.read in addition to admins.audit.read', () => {
  it('ADMIN with admins.audit.read can access /control/security — 200', async () => {
    setMockUser({ permissions: ['admins.audit.read'] });
    m.auditLog.findMany.mockResolvedValueOnce([]);
    m.auditLog.count.mockResolvedValueOnce(0);

    const res = await buildControlApp().get('/control/security');

    expect(res.status).toBe(200);
  });

  it('RISK_REVIEW with control.risk.read can access /control/security — 200', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.RISK_REVIEW });
    m.auditLog.findMany.mockResolvedValueOnce([]);
    m.auditLog.count.mockResolvedValueOnce(0);

    const res = await buildControlApp().get('/control/security');

    expect(res.status).toBe(200);
  });

  it('ADMIN without either permission is refused — 403', async () => {
    setMockUser({ permissions: ['partners.read'] });

    const res = await buildControlApp().get('/control/security');

    expect(res.status).toBe(403);
  });

  it('SUPPORT (help.read + subscribers.read — no control perms) is refused — 403', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.SUPPORT });

    const res = await buildControlApp().get('/control/security');

    expect(res.status).toBe(403);
  });

  it('FINANCE is refused — 403 (finance perms do not grant security audit access)', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.FINANCE });

    const res = await buildControlApp().get('/control/security');

    expect(res.status).toBe(403);
  });
});

// ─── Gap 2: /admins/pending-all accessible to PARTNER_MANAGER ────────────────

describe('Gap 2 fix — GET /admins/pending-all accepts admins.actions.read (PARTNER_MANAGER)', () => {
  const PM_PERMS = ROLE_DEFAULT_ALLOWS.PARTNER_MANAGER;

  beforeEach(() => {
    m.user.findMany.mockResolvedValue([]);
    m.pendingSuperAdminRequest.findMany.mockResolvedValue([]);
    m.criticalActionRequest.findMany.mockResolvedValue([]);
  });

  it('ADMIN with admins.read gets full response including pendingRoleAssignments', async () => {
    setMockUser({ permissions: ['admins.read'] });
    const stubPending = [{ id: 'u-1', email: 'a@b.com', firstName: 'A', lastName: 'B', status: 'ACTIVE', createdAt: new Date().toISOString() }];
    m.user.findMany.mockResolvedValueOnce(stubPending);
    m.pendingSuperAdminRequest.findMany.mockResolvedValueOnce([{ id: 'psr-1', email: 'sup@b.com', firstName: 'S', lastName: 'A', createdAt: new Date().toISOString(), requestedBy: { id: 'a-1', firstName: 'X', lastName: 'Y', email: 'x@y.com' } }]);
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);

    const res = await buildAdminsApp().get('/admins/pending-all');

    expect(res.status).toBe(200);
    expect(res.body.pendingRoleAssignments).toHaveLength(1);
    expect(res.body.pendingSuperAdmins).toHaveLength(1);
    expect(res.body.total).toBe(2);
  });

  it('PARTNER_MANAGER with admins.actions.read gets 200 with empty role-assignment sections', async () => {
    setMockUser({ permissions: PM_PERMS });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([
      { id: 'car-pm-1', actionType: 'DISCOUNT_RATE_CHANGE', payload: {}, note: null, createdAt: new Date().toISOString(), requestedBy: { id: 'admin-1', firstName: 'A', lastName: 'B', email: 'a@b.com' } },
    ]);

    const res = await buildAdminsApp().get('/admins/pending-all');

    expect(res.status).toBe(200);
    // Role-assignment data must be empty — PARTNER_MANAGER must not see other admins
    expect(res.body.pendingRoleAssignments).toHaveLength(0);
    expect(res.body.pendingSuperAdmins).toHaveLength(0);
    // Critical-action data must be populated
    expect(res.body.pendingCriticalActions).toHaveLength(1);
    expect(res.body.pendingCriticalActions[0].id).toBe('car-pm-1');
    expect(res.body.total).toBe(1);
  });

  it('PARTNER_MANAGER total reflects only pendingCriticalActions length', async () => {
    setMockUser({ permissions: PM_PERMS });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([
      { id: 'car-a', actionType: 'DISCOUNT_RATE_CHANGE', payload: {}, note: null, createdAt: new Date().toISOString(), requestedBy: { id: 'admin-1', firstName: 'A', lastName: 'B', email: 'a@b.com' } },
      { id: 'car-b', actionType: 'DISCOUNT_RATE_CHANGE', payload: {}, note: null, createdAt: new Date().toISOString(), requestedBy: { id: 'admin-1', firstName: 'A', lastName: 'B', email: 'a@b.com' } },
    ]);

    const res = await buildAdminsApp().get('/admins/pending-all');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('admin without admins.read or admins.actions.read is refused — 403', async () => {
    setMockUser({ permissions: ['partners.read'] });

    const res = await buildAdminsApp().get('/admins/pending-all');

    expect(res.status).toBe(403);
  });

  it('SUPPORT (no admins perms) is refused — 403', async () => {
    setMockUser({ permissions: ROLE_DEFAULT_ALLOWS.SUPPORT });

    const res = await buildAdminsApp().get('/admins/pending-all');

    expect(res.status).toBe(403);
  });

  it('PARTNER_MANAGER does NOT trigger user.findMany (avoids exposing admin user list)', async () => {
    setMockUser({ permissions: PM_PERMS });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);

    await buildAdminsApp().get('/admins/pending-all');

    expect(m.user.findMany).not.toHaveBeenCalled();
  });

  it('PARTNER_MANAGER does NOT trigger pendingSuperAdminRequest.findMany', async () => {
    setMockUser({ permissions: PM_PERMS });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);

    await buildAdminsApp().get('/admins/pending-all');

    expect(m.pendingSuperAdminRequest.findMany).not.toHaveBeenCalled();
  });
});

// ─── Gap 3a: POST /admins/:id/approve accepts optional expiresAt ──────────────

describe('Gap 3a fix — POST /admins/:id/approve accepts optional expiresAt body field', () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 days

  beforeEach(() => {
    m.user.findUnique.mockImplementation(async (args: any) => {
      // The approve route calls findUnique for the target user (no select for adminRoles),
      // while authenticate calls it with adminRoles in the select.
      // Return a plain user object for the route's lookup.
      if (args?.select?.adminRoles === undefined) {
        return { id: 'target-1', role: 'ADMIN', status: 'ACTIVE' };
      }
      return { rolesUpdatedAt: mockRolesUpdatedAt, adminRoles: mockExpiredAdminRoles };
    });
    m.userAdminRole.findMany.mockResolvedValue([]);
    m.adminRole.findUnique.mockResolvedValue({ id: 'role-1', key: 'SUPPORT' });
  });

  it('returns 200 when expiresAt is omitted (permanent assignment)', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });

    const res = await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT' });

    expect(res.status).toBe(200);
    expect(m.userAdminRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ expiresAt: null }),
        update: expect.objectContaining({ expiresAt: null }),
      }),
    );
  });

  it('returns 200 and stores expiresAt when a future date is provided', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });

    const res = await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT', expiresAt: futureDate });

    expect(res.status).toBe(200);
    expect(m.userAdminRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ expiresAt: expect.any(Date) }),
        update: expect.objectContaining({ expiresAt: expect.any(Date) }),
      }),
    );
  });

  it('returns 400 for a malformed expiresAt string', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });

    const res = await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT', expiresAt: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ISO 8601/i);
  });

  it('returns 400 when expiresAt is in the past', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });
    const pastDate = new Date(Date.now() - 1000).toISOString();

    const res = await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT', expiresAt: pastDate });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future/i);
  });

  it('audit log after field includes expiresAt when set', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeAudit: mockWriteAudit } = require('../../src/middleware/audit.middleware') as {
      writeAudit: jest.Mock;
    };
    mockWriteAudit.mockClear();

    await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT', expiresAt: futureDate });

    const approveCall = mockWriteAudit.mock.calls.find(
      (args: any[]) => args[0]?.action === 'admin.approve',
    );
    expect(approveCall).toBeDefined();
    expect(approveCall![0].after).toMatchObject({
      addedRole: 'SUPPORT',
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO string
    });
  });

  it('audit log after.expiresAt is null when expiresAt is not provided', async () => {
    setMockUser({ role: 'ADMIN', permissions: ['admins.write'] });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeAudit: mockWriteAudit } = require('../../src/middleware/audit.middleware') as {
      writeAudit: jest.Mock;
    };
    mockWriteAudit.mockClear();

    await buildAdminsApp()
      .post('/admins/target-1/approve')
      .send({ roleKey: 'SUPPORT' });

    const approveCall = mockWriteAudit.mock.calls.find(
      (args: any[]) => args[0]?.action === 'admin.approve',
    );
    expect(approveCall).toBeDefined();
    expect(approveCall![0].after.expiresAt).toBeNull();
  });
});

// ─── Gap 3b: resolveUserPermissions excludes expired roles ────────────────────

describe('Gap 3b fix — resolveUserPermissions excludes expired UserAdminRole rows', () => {
  it('source: resolveUserPermissions WHERE clause excludes rows where expiresAt <= now', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs   = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path');
    const src  = fs.readFileSync(
      path.resolve(__dirname, '../../src/services/permission.service.ts'),
      'utf8',
    );
    // The query must filter to only non-expired rows using an OR: null OR gt:now
    expect(src).toMatch(/expiresAt.*null/);
    expect(src).toMatch(/expiresAt.*gt.*now/);
  });
});

// ─── Gap 3c: authenticate() detects expired roles and forces re-login ─────────

describe('Gap 3c fix — authenticate() blocks ADMIN JWT when a role assignment has expired', () => {
  const JWT_SECRET = 'test-expired-role-jwt';
  let jwtLib: any;
  let realAuthenticate: (req: any, res: any, next: any) => Promise<void>;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    jwtLib = require('jsonwebtoken');
    realAuthenticate = (require('../../src/middleware/auth.middleware') as any)._realAuthenticate;
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => {
    // Bind findUnique to the closure-controlled variables so each test can
    // independently set mockRolesUpdatedAt and mockExpiredAdminRoles.
    m.user.findUnique.mockImplementation(async () => ({
      rolesUpdatedAt: mockRolesUpdatedAt,
      adminRoles:     mockExpiredAdminRoles,
    }));
  });

  it('blocks ADMIN JWT when an expired role row is found', async () => {
    const token = jwtLib.sign(
      { id: 'admin-exp-1', role: 'ADMIN', email: 'a@exp.com' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    mockExpiredAdminRoles = [{ expiresAt: new Date(Date.now() - 5000) }];
    const next = jest.fn();

    await realAuthenticate({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      message: expect.stringMatching(/Role assignment expired/i),
    });
  });

  it('stamps rolesUpdatedAt on the User row when an expired role is detected', async () => {
    const token = jwtLib.sign(
      { id: 'admin-exp-2', role: 'ADMIN', email: 'b@exp.com' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    mockExpiredAdminRoles = [{ expiresAt: new Date(Date.now() - 1000) }];
    const next = jest.fn();

    await realAuthenticate({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    expect(m.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-exp-2' },
        data:  expect.objectContaining({ rolesUpdatedAt: expect.any(Date) }),
      }),
    );
  });

  it('passes ADMIN JWT through when no expired role rows are found', async () => {
    const token = jwtLib.sign(
      { id: 'admin-exp-3', role: 'ADMIN', email: 'c@exp.com' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    mockRolesUpdatedAt    = null;
    mockExpiredAdminRoles = []; // no expired roles
    const next = jest.fn();

    await realAuthenticate({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    expect(next).toHaveBeenCalledWith(); // no error argument
  });

  it('blocks SUPER_ADMIN JWT when an expired role row is found', async () => {
    const token = jwtLib.sign(
      { id: 'sa-exp-1', role: 'SUPER_ADMIN', email: 'sa@exp.com' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    mockExpiredAdminRoles = [{ expiresAt: new Date(Date.now() - 1000) }];
    const next = jest.fn();

    await realAuthenticate({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      message: expect.stringMatching(/Role assignment expired/i),
    });
  });

  it('does NOT block USER JWT even when expired role rows are present (guard is ADMIN-only)', async () => {
    const token = jwtLib.sign(
      { id: 'user-exp-1', role: 'USER', email: 'u@exp.com' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    mockExpiredAdminRoles = [{ expiresAt: new Date(Date.now() - 1000) }];
    const next = jest.fn();

    await realAuthenticate({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    expect(next).toHaveBeenCalledWith(); // no error
  });

  it('rolesUpdatedAt stale-JWT check (Fix 5) still fires before expired-role check', async () => {
    // Stale JWT takes priority so we do not perform the (more expensive)
    // expired-role join when rolesUpdatedAt already blocks the request.
    const token = jwtLib.sign(
      { id: 'admin-both', role: 'ADMIN', email: 'd@exp.com' },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    mockRolesUpdatedAt    = new Date(Date.now() + 5000); // rolesUpdatedAt is AFTER iat
    mockExpiredAdminRoles = [{ expiresAt: new Date(Date.now() - 1000) }];
    const next = jest.fn();

    await realAuthenticate({ headers: { authorization: `Bearer ${token}` } }, {}, next);

    // Error must be the stale-JWT message, not the expired-role message
    expect(next.mock.calls[0][0]).toMatchObject({
      message: expect.stringMatching(/Permissions updated/i),
    });
  });
});

// ─── Gap 2 follow-up: requestedById scoping for admins.actions.read callers ───

describe('Gap 2 follow-up — pendingCriticalActions scoped to own requests for PARTNER_MANAGER', () => {
  const PM_PERMS = ROLE_DEFAULT_ALLOWS.PARTNER_MANAGER;

  beforeEach(() => {
    m.user.findMany.mockResolvedValue([]);
    m.pendingSuperAdminRequest.findMany.mockResolvedValue([]);
  });

  it('PARTNER_MANAGER: criticalActionRequest.findMany is called with requestedById filter', async () => {
    setMockUser({ id: 'pm-user-1', permissions: PM_PERMS });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);

    await buildAdminsApp().get('/admins/pending-all');

    const call = m.criticalActionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ requestedById: 'pm-user-1' });
  });

  it('ADMIN with admins.read: criticalActionRequest.findMany has no requestedById filter', async () => {
    setMockUser({ id: 'admin-full', permissions: ['admins.read'] });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);

    await buildAdminsApp().get('/admins/pending-all');

    const call = m.criticalActionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty('requestedById');
  });

  it('SUPER_ADMIN: criticalActionRequest.findMany has no requestedById filter', async () => {
    setMockUser({ role: 'SUPER_ADMIN', id: 'sa-1', permissions: [] });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);

    await buildAdminsApp().get('/admins/pending-all');

    const call = m.criticalActionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty('requestedById');
  });

  it('PARTNER_MANAGER only receives their own pending actions in response body', async () => {
    setMockUser({ id: 'pm-user-2', permissions: PM_PERMS });
    const ownAction = { id: 'car-own', actionType: 'DISCOUNT_RATE_CHANGE', payload: {}, note: null, createdAt: new Date().toISOString(), requestedBy: { id: 'pm-user-2', firstName: 'P', lastName: 'M', email: 'pm@test.com' } };
    m.criticalActionRequest.findMany.mockResolvedValueOnce([ownAction]);

    const res = await buildAdminsApp().get('/admins/pending-all');

    expect(res.status).toBe(200);
    expect(res.body.pendingCriticalActions).toHaveLength(1);
    expect(res.body.pendingCriticalActions[0].id).toBe('car-own');
    expect(res.body.total).toBe(1);
  });
});

describe('Gap 2 follow-up — GET /admins/critical-actions scoped for PARTNER_MANAGER', () => {
  const PM_PERMS = ROLE_DEFAULT_ALLOWS.PARTNER_MANAGER;

  it('PARTNER_MANAGER: findMany is called with requestedById filter', async () => {
    setMockUser({ id: 'pm-ca-1', permissions: PM_PERMS });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);
    m.criticalActionRequest.count.mockResolvedValueOnce(0);

    await buildAdminsApp().get('/admins/critical-actions');

    const call = m.criticalActionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ requestedById: 'pm-ca-1' });
  });

  it('ADMIN with admins.read: findMany has no requestedById filter', async () => {
    setMockUser({ id: 'admin-ca-1', permissions: ['admins.read'] });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);
    m.criticalActionRequest.count.mockResolvedValueOnce(0);

    await buildAdminsApp().get('/admins/critical-actions');

    const call = m.criticalActionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty('requestedById');
  });

  it('SUPER_ADMIN: findMany has no requestedById filter', async () => {
    setMockUser({ role: 'SUPER_ADMIN', id: 'sa-ca-1', permissions: [] });
    m.criticalActionRequest.findMany.mockResolvedValueOnce([]);
    m.criticalActionRequest.count.mockResolvedValueOnce(0);

    await buildAdminsApp().get('/admins/critical-actions');

    const call = m.criticalActionRequest.findMany.mock.calls[0]?.[0];
    expect(call?.where).not.toHaveProperty('requestedById');
  });
});
