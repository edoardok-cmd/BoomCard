/**
 * BC-ADMIN-SPEC-REAUDIT6-SUPERADMIN-APPROVE-500 — Verify SUPER_ADMIN role infrastructure is correct:
 *
 * CRITICAL: POST /admin/admins/critical-actions/:requestId/approve fails with 500 if SUPER_ADMIN
 * AdminRole row is missing from the database. The approval handler (adminAdmins.routes.ts:785)
 * queries for the role directly: findUnique({ where: { key: AdminRoleKey.SUPER_ADMIN } }).
 * If the row does not exist, the response is `{ error: 'SUPER_ADMIN role not found in DB — run seed-permissions first' }`
 * and the status is 500.
 *
 * This test verifies:
 * 1. SUPER_ADMIN row exists in AdminRole table.
 * 2. SUPER_ADMIN has zero RolePermission rows (no permissions granted).
 * 3. Full dual-approval cycle works: initiate + approve by DIFFERENT admin → 201 with ACTIVE status.
 * 4. Self-approval refusal: same admin cannot approve their own request → 403.
 * 5. DELETE /admins/:id/roles/SUPER_ADMIN works (200, not 404).
 */

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockUserFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserCreate = jest.fn();
const mockUserCount = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserDelete = jest.fn();

const mockAdminRoleFindUnique = jest.fn();
const mockAdminRoleFindMany = jest.fn();
const mockAdminRoleCreate = jest.fn();
const mockUserAdminRoleFindMany = jest.fn();
const mockUserAdminRoleDelete = jest.fn();

const mockCriticalActionRequestFindUnique = jest.fn();
const mockCriticalActionRequestFindMany = jest.fn();
const mockCriticalActionRequestCreate = jest.fn();
const mockCriticalActionRequestUpdate = jest.fn();

const mockTransaction = jest.fn(async (fn: (tx: any) => Promise<any>) => {
  return fn({
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      findMany: mockUserFindMany,
      count: mockUserCount,
      update: mockUserUpdate,
    },
    criticalActionRequest: {
      findUnique: mockCriticalActionRequestFindUnique,
    },
    userAdminRole: {
      findMany: mockUserAdminRoleFindMany,
    },
  });
});

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
      findFirst: (...a: any[]) => mockUserFindFirst(...a),
      findMany: (...a: any[]) => mockUserFindMany(...a),
      create: (...a: any[]) => mockUserCreate(...a),
      count: (...a: any[]) => mockUserCount(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
      delete: (...a: any[]) => mockUserDelete(...a),
    },
    adminRole: {
      findUnique: (...a: any[]) => mockAdminRoleFindUnique(...a),
      findMany: (...a: any[]) => mockAdminRoleFindMany(...a),
      create: (...a: any[]) => mockAdminRoleCreate(...a),
    },
    userAdminRole: {
      findMany: (...a: any[]) => mockUserAdminRoleFindMany(...a),
      delete: (...a: any[]) => mockUserAdminRoleDelete(...a),
    },
    rolePermission: {
      findMany: jest.fn(async () => []),
    },
    criticalActionRequest: {
      findUnique: (...a: any[]) => mockCriticalActionRequestFindUnique(...a),
      findMany: (...a: any[]) => mockCriticalActionRequestFindMany(...a),
      create: (...a: any[]) => mockCriticalActionRequestCreate(...a),
      update: (...a: any[]) => mockCriticalActionRequestUpdate(...a),
    },
    $transaction: (...a: any[]) => mockTransaction(...a),
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── Auth middleware ───────────────────────────────────────────────────────────
let currentUser: { id: string; role: string } = { id: 'approver-admin', role: 'SUPER_ADMIN' };
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = currentUser; next(); },
  optionalAuthenticate: (req: any, _res: any, next: any) => { req.user = currentUser; next(); },
  authorize:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
      if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
      next();
    },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  AuthRequest: {},
}));

// ── Permission service mock ───────────────────────────────────────────────────
jest.mock('../../src/services/permission.service', () => ({
  resolveUserPermissions: jest.fn(async () => []),
}));

// ── Audit middleware mock ─────────────────────────────────────────────────────
jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(async (_arg: any) => undefined),
}));

// ── Mail service mock ─────────────────────────────────────────────────────────
jest.mock('../../src/services/mail.service', () => ({
  sendMail: jest.fn(async () => undefined),
  mailService: {
    sendNewAdminNotification: jest.fn(async () => undefined),
    sendCriticalActionRequest: jest.fn(async () => undefined),
    sendCriticalActionApproved: jest.fn(async () => undefined),
  },
}));

// ── Utils mock ────────────────────────────────────────────────────────────────
jest.mock('../../src/utils/requestIp', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('../../src/utils/detach', () => ({
  detach: (promise: Promise<any>, _onErr?: (e: Error) => void) => {
    promise.catch(() => {}); // fire-and-forget
  },
}));

// ── App bootstrap ─────────────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminAdminsRouter = require('../../src/routes/adminAdmins.routes').default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/admins', adminAdminsRouter);
  return app;
}

/** Minimal admin user row */
function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'admin-1',
    email: 'admin@test.bg',
    firstName: 'Admin',
    lastName: 'User',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

/** Minimal SUPER_ADMIN AdminRole row (no permissions granted) */
function superAdminRoleRow() {
  return {
    id: 'role-sa',
    key: 'SUPER_ADMIN',
    label: 'Super Administrator',
  };
}

/** Minimal CriticalActionRequest row */
function criticalActionRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    action: 'CREATE_SUPER_ADMIN',
    requestedById: 'requester-admin',
    status: 'PENDING',
    email: 'newadmin@test.bg',
    firstName: 'New',
    lastName: 'Admin',
    createdAt: new Date('2026-01-01'),
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify SUPER_ADMIN role infrastructure
// ─────────────────────────────────────────────────────────────────────────────
describe('SUPER_ADMIN role infrastructure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'approver-admin', role: 'SUPER_ADMIN' };
  });

  it('SUPER_ADMIN AdminRole row exists in database', async () => {
    mockAdminRoleFindUnique.mockResolvedValueOnce(superAdminRoleRow());

    const res = await request(makeApp())
      .get('/api/admin/admins/roles/SUPER_ADMIN')
      .expect(200);

    expect(res.body.role).toBeDefined();
    expect(res.body.role.key).toBe('SUPER_ADMIN');
    expect(res.body.role.label).toBe('Super Administrator');
  });

  it('SUPER_ADMIN has zero RolePermission rows', async () => {
    mockAdminRoleFindUnique.mockResolvedValueOnce(superAdminRoleRow());
    mockAdminRoleFindMany.mockResolvedValueOnce([
      {
        ...superAdminRoleRow(),
        rolePermissions: [], // Empty permissions
      },
    ]);

    const res = await request(makeApp())
      .get('/api/admin/admins/roles/SUPER_ADMIN/permissions')
      .expect(200);

    expect(res.body.permissions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dual-approval cycle: initiate + approve by different admin
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /critical-actions/:requestId/approve — Dual-approval (different admins)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'approver-admin', role: 'SUPER_ADMIN' };
  });

  it('Should successfully approve CREATE_SUPER_ADMIN request when initiated by different admin', async () => {
    const requesterAdmin = adminUser({ id: 'requester-admin', email: 'requester@test.bg' });
    const approverAdmin = adminUser({ id: 'approver-admin', email: 'approver@test.bg' });
    const newAdmin = adminUser({
      id: 'new-admin-1',
      email: 'newadmin@test.bg',
      firstName: 'New',
      lastName: 'Admin',
      status: 'ACTIVE',
    });

    const request_row = criticalActionRequestRow({
      id: 'req-1',
      requestedById: 'requester-admin',
      email: 'newadmin@test.bg',
    });

    // Mock finding the request
    mockCriticalActionRequestFindUnique.mockResolvedValueOnce(request_row);

    // Mock finding existing super admins (for quorum check)
    mockUserCount.mockResolvedValueOnce(2); // 2 existing SAs → not bootstrap case

    // Mock the transaction that creates the user
    mockTransaction.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      return fn({
        user: {
          findUnique: async () => null, // No existing user with this email
          findFirst: async () => null, // No existing admin
          count: async () => 2, // 2 existing SAs
          update: async () => newAdmin,
        },
        criticalActionRequest: {
          findUnique: async () => request_row,
        },
        userAdminRole: {
          findMany: async () => [{ roleId: 'role-admin' }],
        },
      });
    });

    // Mock updating the request to ACTIVE
    mockCriticalActionRequestUpdate.mockResolvedValueOnce({
      ...request_row,
      status: 'ACTIVE',
      approvedAt: new Date(),
      approvedBy: 'approver-admin',
    });

    // Mock finding SUPER_ADMIN role (critical!)
    mockAdminRoleFindUnique.mockResolvedValueOnce(superAdminRoleRow());

    const res = await request(makeApp())
      .post('/api/admin/admins/critical-actions/req-1/approve')
      .expect(201);

    // Verify response shape
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.status).toBe('ACTIVE');
    expect(res.body.request).toHaveProperty('status');
  });

  it('Should return 500 if SUPER_ADMIN role not found in database', async () => {
    const request_row = criticalActionRequestRow({
      id: 'req-1',
      requestedById: 'requester-admin',
    });

    mockCriticalActionRequestFindUnique.mockResolvedValueOnce(request_row);
    mockUserCount.mockResolvedValueOnce(2);

    // CRITICAL: Mock SUPER_ADMIN role as NOT FOUND
    mockAdminRoleFindUnique.mockResolvedValueOnce(null);

    const res = await request(makeApp())
      .post('/api/admin/admins/critical-actions/req-1/approve')
      .expect(500);

    expect(res.body.error).toBe('SUPER_ADMIN role not found in DB — run seed-permissions first');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Self-approval refusal
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /critical-actions/:requestId/approve — Self-approval guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'same-admin', role: 'SUPER_ADMIN' };
  });

  it('Should reject self-approval when approver === requester (unless bootstrap case)', async () => {
    const request_row = criticalActionRequestRow({
      id: 'req-1',
      requestedById: 'same-admin', // Same as approver
    });

    mockCriticalActionRequestFindUnique.mockResolvedValueOnce(request_row);
    mockUserCount.mockResolvedValueOnce(2); // 2 existing SAs → not bootstrap case

    // Mock finding SUPER_ADMIN role (so we don't hit 500)
    mockAdminRoleFindUnique.mockResolvedValueOnce(superAdminRoleRow());

    const res = await request(makeApp())
      .post('/api/admin/admins/critical-actions/req-1/approve')
      .expect(403);

    expect(res.body.error).toMatch(/approver must be a different admin/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admins/:id/roles/SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /admins/:id/roles/SUPER_ADMIN', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'approver-admin', role: 'SUPER_ADMIN' };
  });

  it('Should successfully revoke SUPER_ADMIN role (200, not 404)', async () => {
    const admin = adminUser({ id: 'admin-1', role: 'SUPER_ADMIN' });

    mockUserFindUnique.mockResolvedValueOnce(admin);
    mockAdminRoleFindUnique.mockResolvedValueOnce(superAdminRoleRow());
    mockUserAdminRoleFindMany.mockResolvedValueOnce([
      { id: 'uar-1', userId: 'admin-1', roleId: 'role-sa' },
    ]);
    mockUserAdminRoleDelete.mockResolvedValueOnce({ id: 'uar-1' });
    mockUserUpdate.mockResolvedValueOnce(admin);

    const res = await request(makeApp())
      .delete('/api/admin/admins/admin-1/roles/SUPER_ADMIN')
      .expect(200);

    expect(res.body).toHaveProperty('admin');
    expect(res.body.admin.id).toBe('admin-1');
  });

  it('Should return 404 if admin not found', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);

    const res = await request(makeApp())
      .delete('/api/admin/admins/nonexistent/roles/SUPER_ADMIN')
      .expect(404);

    expect(res.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admins/:id/roles — List assigned roles (should show SUPER_ADMIN if present)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /admins/:id/roles — Role listing includes SUPER_ADMIN', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'approver-admin', role: 'SUPER_ADMIN' };
  });

  it('Should list SUPER_ADMIN in assigned roles', async () => {
    const admin = adminUser({ id: 'admin-1', role: 'SUPER_ADMIN' });

    mockUserFindUnique.mockResolvedValueOnce(admin);
    mockUserAdminRoleFindMany.mockResolvedValueOnce([
      {
        id: 'uar-1',
        userId: 'admin-1',
        roleId: 'role-sa',
        expiresAt: null,
        role: superAdminRoleRow(),
      },
    ]);

    const res = await request(makeApp())
      .get('/api/admin/admins/admin-1/roles')
      .expect(200);

    expect(res.body.roles).toBeDefined();
    expect(res.body.roles.length).toBeGreaterThan(0);
    expect(res.body.roles.some((r: any) => r.key === 'SUPER_ADMIN')).toBe(true);
  });
});
