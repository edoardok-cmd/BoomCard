/**
 * BC-ADMIN-SPEC-REAUDIT9-SUPERADMIN-NULL-FIELDS-1
 *
 * Verifies that POST /api/admin/admins enforces firstName, lastName, and phone as
 * required fields at initiation time (both SUPER_ADMIN pending-request path and
 * regular ADMIN creation path).
 *
 * Root cause: the User table has firstName/lastName/phone as NOT NULL (added by
 * migration 20260602200000), but the route previously accepted them as optional
 * (string | undefined) and passed null to prisma.user.create → DB NOT NULL violation → 500.
 *
 * Fix: validation guard inserted after email/password/roleKey check; Prisma schema
 * updated to String (non-nullable) to align with DB reality.
 *
 * Tests:
 * 1. POST /admins without firstName → 400 "firstName and lastName are required"
 * 2. POST /admins without lastName  → 400 "firstName and lastName are required"
 * 3. POST /admins without phone     → 400 "phone is required"
 * 4. POST /admins with all fields + roleKey=SUPER_ADMIN → 202 (pending request created)
 * 5. POST /admins with all fields + roleKey=ADMIN       → 201 (admin created)
 */

import express from 'express';
import request from 'supertest';

// ─── Prisma mock — must be hoisted before any import that touches prisma ───────

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  adminRole: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  pendingSuperAdminRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  adminUserRole: {
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ─── Auth / audit middleware bypass ──────────────────────────────────────────

const CALLER = {
  id: 'sa-caller-001',
  email: 'super@boomcard.bg',
  role: 'SUPER_ADMIN',
  permissions: ['admins.write', 'admins.read'],
  imp: false,
};

jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = CALLER;
    next();
  },
  authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
  requirePermission: (_perm: any) => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: jest.fn(async () => undefined),
}));

// ─── Peripheral service / util mocks ─────────────────────────────────────────

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/utils/requestIp', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('../../src/utils/detach', () => ({
  detach: jest.fn((p: Promise<any>) => p),
}));

jest.mock('../../src/services/permission.service', () => ({
  isValidPermissionKey: jest.fn(() => true),
  getPermissionCatalogGrouped: jest.fn(() => ({})),
  resolveUserPermissionBreakdown: jest.fn(async () => []),
}));

// ─── bcrypt mock — skip slow hashing in unit tests ───────────────────────────

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (_val: string, _rounds: number) => '$2b$12$mockedhash'),
  compare: jest.fn(async () => true),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const { default: adminsRouter } = await import('../../src/routes/adminAdmins.routes');
  app.use('/api/admin/admins', adminsRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BC-ADMIN-SPEC-REAUDIT9: POST /api/admin/admins — firstName/lastName/phone required', () => {
  const BASE_BODY = {
    email: 'newadmin@boomcard.bg',
    firstName: 'Alice',
    lastName: 'Smith',
    phone: '+359 88 123 4567',
    password: 'Str0ng!Pass',
    roleKey: 'ADMIN',
  };

  it('1. returns 400 when firstName is missing', async () => {
    const body = { ...BASE_BODY, firstName: undefined };
    const res = await request(app)
      .post('/api/admin/admins')
      .send(body)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('firstName and lastName are required');
  });

  it('2. returns 400 when lastName is missing', async () => {
    const body = { ...BASE_BODY, lastName: undefined };
    const res = await request(app)
      .post('/api/admin/admins')
      .send(body)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('firstName and lastName are required');
  });

  it('3. returns 400 when phone is missing', async () => {
    const body = { ...BASE_BODY, phone: undefined };
    const res = await request(app)
      .post('/api/admin/admins')
      .send(body)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('phone is required');
  });

  it('4. returns 202 when all fields present and roleKey=SUPER_ADMIN (pending request created)', async () => {
    const body = { ...BASE_BODY, roleKey: 'SUPER_ADMIN' };

    // No existing admin with that email
    mockPrisma.user.findFirst.mockResolvedValue(null);
    // No existing pending request for that email
    mockPrisma.pendingSuperAdminRequest.findFirst.mockResolvedValue(null);
    // Pending request creation succeeds
    mockPrisma.pendingSuperAdminRequest.create.mockResolvedValue({
      id: 'pending-001',
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/admin/admins')
      .send(body)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.pending).toBe(true);
    expect(res.body.request).toBeDefined();
  });

  it('5. returns 201 when all fields present and roleKey=ADMIN (admin user created)', async () => {
    const body = { ...BASE_BODY, roleKey: 'ADMIN' };

    // AdminRole found
    mockPrisma.adminRole.findUnique.mockResolvedValue({
      id: 'role-admin-001',
      key: 'ADMIN',
      label: 'Administrator',
    });
    // No existing admin with that email
    mockPrisma.user.findFirst.mockResolvedValue(null);
    // user.create returns the created user
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-new-001',
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/admin/admins')
      .send(body)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(body.email);
  });

  it('6. POST /pending-super/:id/approve returns 422 when stored request has null firstName', async () => {
    // Simulate a legacy pending request with null firstName
    mockPrisma.pendingSuperAdminRequest.findUnique.mockResolvedValue({
      id: 'pending-legacy-001',
      email: 'newsuper@boomcard.bg',
      firstName: null,
      lastName: 'Smith',
      phone: '+359 88 123 4567',
      passwordHash: '$2b$12$mockedhash',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      requestedById: 'other-sa-002',
      requestedBy: {
        id: 'other-sa-002',
        email: 'other@boomcard.bg',
        firstName: 'Other',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });

    const res = await request(app)
      .post('/api/admin/admins/pending-super/pending-legacy-001/approve')
      .send({})
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(422);
    expect(res.body.error).toContain('missing required fields');
  });

  it('7. returns 400 when firstName is whitespace-only', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({ ...BASE_BODY, firstName: '   ', roleKey: 'ADMIN' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('firstName and lastName are required');
  });

  it('8. returns 400 when lastName is whitespace-only', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({ ...BASE_BODY, lastName: '\t', roleKey: 'ADMIN' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('firstName and lastName are required');
  });

  it('9. returns 400 when phone is whitespace-only', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({ ...BASE_BODY, phone: ' ', roleKey: 'ADMIN' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('phone is required');
  });

  // SUPER_ADMIN path: validation fires before the SUPER_ADMIN branch — these
  // confirm the guard is shared, not branch-local.
  it('10. returns 400 when firstName missing on SUPER_ADMIN path', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({ ...BASE_BODY, firstName: undefined, roleKey: 'SUPER_ADMIN' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('firstName and lastName are required');
  });

  it('11. returns 400 when phone is empty string on SUPER_ADMIN path (empty = whitespace-only)', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({ ...BASE_BODY, phone: '', roleKey: 'SUPER_ADMIN' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('phone is required');
  });

  // Explicit null value in JSON body — null?.trim() is undefined → !undefined is true → 400
  it('12. returns 400 when firstName is explicitly null in JSON body', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .send({ ...BASE_BODY, firstName: null, roleKey: 'ADMIN' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('firstName and lastName are required');
  });
});
