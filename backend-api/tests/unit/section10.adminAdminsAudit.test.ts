/**
 * §10 Admin-management audit-pass regression tests.
 *
 * Covers the 8 fixes applied in this pass:
 *
 *   Bug 1  — POST /admins duplicate-email pre-check (non-SUPER_ADMIN path)
 *   Bug 2  — GET  /critical-actions rejects unknown status param
 *   Bug 3  — POST /:id/approve blocks SUPER_ADMIN roleKey
 *   Gap 1  — POST /risk-queue/:id/approve requires notes
 *   Gap 2  — POST /:id/resend-activation writes rich AuditLog entry
 *   Gap 3  — SUPER_ADMIN request approve/reject notifies the requester by email
 *   Gap 4  — PATCH /:id/status requires reason when archiving or deactivating
 *   Minor  — GET /admins and GET /admins/:id expose mustChangePassword
 *
 * All Prisma and service interactions are mocked. No DB connection required.
 */

import express from 'express';
import request from 'supertest';

// ─── Shared spy state ─────────────────────────────────────────────────────────

const auditCreateCalls: any[] = [];
const emailSendCalls: any[] = [];
let userFindFirstResult: any = null;
let userFindUniqueResult: any = null;
let userCountResult = 0;
let adminRoleFindUniqueResult: any = { id: 'role-1', key: 'ADMIN' };
let pendingRequestFindUniqueResult: any = null;
let criticalActionFindUniqueResult: any = null;
let userAdminRoleFindManyResult: any[] = [];
let scanFindUniqueResult: any = null;
let activationLinkFindFirstResult: any = null;
let partnerFindUniqueResult: any = null;

// ─── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    $transaction: jest.fn(async (ops: any) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops(client);
    }),
    auditLog: {
      create: jest.fn(async (args: any) => {
        auditCreateCalls.push(args.data);
        return { id: 'al-1', ...args.data };
      }),
    },
    adminRole: {
      findUnique: jest.fn(async () => adminRoleFindUniqueResult),
      findMany: jest.fn(async () => [
        { id: 'role-1', key: 'ADMIN', label: 'Admin' },
        { id: 'role-2', key: 'SUPER_ADMIN', label: 'Super Admin' },
      ]),
      upsert: jest.fn(async () => adminRoleFindUniqueResult ?? { id: 'role-sa', key: 'SUPER_ADMIN', label: 'Super Administrator' }),
    },
    user: {
      findFirst: jest.fn(async () => userFindFirstResult),
      findUnique: jest.fn(async () => userFindUniqueResult),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => userCountResult),
      create: jest.fn(async (args: any) => ({
        id: 'u-new',
        email: args.data.email,
        firstName: args.data.firstName ?? null,
        lastName: args.data.lastName ?? null,
        role: args.data.role,
        status: args.data.status,
        createdAt: new Date(),
      })),
      update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
    },
    userAdminRole: {
      findMany: jest.fn(async () => userAdminRoleFindManyResult),
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    pendingSuperAdminRequest: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => pendingRequestFindUniqueResult),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: any) => ({
        id: 'psa-1',
        email: args.data.email,
        firstName: args.data.firstName ?? null,
        lastName: args.data.lastName ?? null,
        createdAt: new Date(),
      })),
      delete: jest.fn(async () => ({})),
      count: jest.fn(async () => 0),
    },
    criticalActionRequest: {
      findUnique: jest.fn(async () => criticalActionFindUniqueResult),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: any) => ({
        id: 'ca-1',
        ...args.data,
        createdAt: new Date(),
        requestedBy: { id: 'u-1', firstName: 'Test', lastName: 'Admin', email: 'test@example.com' },
      })),
      update: jest.fn(async (args: any) => ({ id: args.where.id, ...args.data })),
    },
    stickerScan: {
      findUnique: jest.fn(async () => scanFindUniqueResult),
    },
    activationLink: {
      findFirst: jest.fn(async () => activationLinkFindFirstResult),
    },
    partner: {
      findUnique: jest.fn(async () => partnerFindUniqueResult),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ─── Email service mock ───────────────────────────────────────────────────────

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: jest.fn(async (args: any) => {
      emailSendCalls.push(args);
      return { success: true };
    }),
    // adminPartners.routes.ts uses this in PATCH /:id/partner-status — stub so any
    // future test of that endpoint in this file doesn't throw TypeError.
    sendPartnerStatusChangeEmail: jest.fn(async () => {}),
  },
}));

// ─── External dependency stubs ────────────────────────────────────────────────

jest.mock('../../src/services/partnerActivation.service', () => ({
  issueActivationLink: jest.fn(async () => ({
    url: 'https://example.com/activate/token',
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    linkId: 'link-1',
  })),
  sendActivationEmail: jest.fn(async () => {}),
  stampEmailOutcome: jest.fn(async () => {}),
  ActivationLinkReason: { RESEND: 'RESEND' },
}));

jest.mock('../../src/services/partner.service', () => ({
  partnerService: { setPartnerStatus: jest.fn(async () => ({ fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' })) },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({ fireAutomation: jest.fn(async () => {}) }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/services/partnerSla.helper', () => ({ computePartnerSla: jest.fn(() => null) }));
jest.mock('../../src/services/partnerVenueCountBucket.helper', () => ({
  parseVenueCountBucket: jest.fn(() => null),
  formatVenueCountBucket: jest.fn((v: any) => v),
  VENUE_COUNT_BUCKET_DISPLAY_VALUES: ['1', '2-5', '6-10', '11+'],
}));
jest.mock('../../src/services/sticker.service', () => ({
  stickerService: {
    approveScan: jest.fn(async () => ({ id: 'scan-1', status: 'APPROVED', fraudScore: 20 })),
    rejectScan: jest.fn(async () => ({ id: 'scan-1', status: 'REJECTED', fraudScore: 80 })),
  },
}));
jest.mock('../../src/services/cashbackLifecycle.service', () => ({}));

// ─── Auth middleware bypass ───────────────────────────────────────────────────

const SUPER_ADMIN_USER = { id: 'u-super', email: 'super@test.com', role: 'SUPER_ADMIN', permissions: [], imp: false };
const ADMIN_USER = { id: 'u-admin', email: 'admin@test.com', role: 'ADMIN', permissions: ['admins.write', 'admins.read', 'admins.roles.write', 'control.risk.write', 'partners.requests.write'], imp: false };

jest.mock('../../src/middleware/auth.middleware', () => {
  const original = jest.requireActual('../../src/middleware/auth.middleware');
  return {
    ...original,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = req.headers['x-test-role'] === 'SUPER_ADMIN' ? SUPER_ADMIN_USER : ADMIN_USER;
      next();
    },
    authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
    requirePermission: (_perm: any) => (_req: any, _res: any, next: any) => next(),
  };
});

// ─── System settings stub for control routes ─────────────────────────────────

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingFloat: jest.fn(async (_key: string, def: number) => def),
  getSystemSettingBool: jest.fn(async (_key: string, def: boolean) => def),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

let app: express.Express;
let adminAdminsRouter: express.Router;
let adminPartnersRouter: express.Router;
let adminControlRouter: express.Router;

beforeAll(async () => {
  app = express();
  app.use(express.json());

  const { default: adminsRoute } = await import('../../src/routes/adminAdmins.routes');
  const { default: partnersRoute } = await import('../../src/routes/adminPartners.routes');
  const { default: controlRoute } = await import('../../src/routes/adminControl.routes');

  adminAdminsRouter = adminsRoute;
  adminPartnersRouter = partnersRoute;
  adminControlRouter = controlRoute;

  app.use('/api/admin/admins', adminsRoute);
  app.use('/api/admin/partners', partnersRoute);
  app.use('/api/admin/control', controlRoute);
});

beforeEach(() => {
  auditCreateCalls.length = 0;
  emailSendCalls.length = 0;
  userFindFirstResult = null;
  userFindUniqueResult = null;
  userCountResult = 2;
  adminRoleFindUniqueResult = { id: 'role-1', key: 'ADMIN', label: 'Admin' };
  pendingRequestFindUniqueResult = null;
  criticalActionFindUniqueResult = null;
  userAdminRoleFindManyResult = [];
  scanFindUniqueResult = null;
  activationLinkFindFirstResult = null;
  partnerFindUniqueResult = null;
  jest.clearAllMocks();
});

// ─── Bug 1: duplicate-email pre-check ────────────────────────────────────────

describe('Bug 1 — POST /admins duplicate-email pre-check', () => {
  it('returns 409 when an ADMIN with the same email already exists', async () => {
    userFindFirstResult = { id: 'u-existing', email: 'dup@test.com', role: 'ADMIN' };

    const res = await request(app)
      .post('/api/admin/admins')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ email: 'dup@test.com', firstName: 'Dup', lastName: 'Admin', phone: '+359000000001', password: 'pass123', roleKey: 'ADMIN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 409 when a SUPER_ADMIN with the same email already exists', async () => {
    userFindFirstResult = { id: 'u-existing', email: 'dup@test.com', role: 'SUPER_ADMIN' };

    const res = await request(app)
      .post('/api/admin/admins')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ email: 'dup@test.com', firstName: 'Dup', lastName: 'Admin', phone: '+359000000002', password: 'pass123', roleKey: 'ADMIN' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('creates admin when no duplicate email exists', async () => {
    userFindFirstResult = null; // no existing admin with this email

    const res = await request(app)
      .post('/api/admin/admins')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ email: 'new@test.com', firstName: 'New', lastName: 'Admin', phone: '+359000000003', password: 'pass123', roleKey: 'ADMIN' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Bug 2: critical-actions status validation ────────────────────────────────

describe('Bug 2 — GET /critical-actions status validation', () => {
  it('returns 400 for unknown status value', async () => {
    const res = await request(app)
      .get('/api/admin/admins/critical-actions?status=INVALID')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PENDING.*APPROVED.*REJECTED.*ALL/i);
  });

  it('accepts PENDING (default)', async () => {
    const res = await request(app)
      .get('/api/admin/admins/critical-actions')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
  });

  it('accepts ALL', async () => {
    const res = await request(app)
      .get('/api/admin/admins/critical-actions?status=ALL')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
  });

  it('accepts APPROVED', async () => {
    const res = await request(app)
      .get('/api/admin/admins/critical-actions?status=APPROVED')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
  });

  it('accepts REJECTED', async () => {
    const res = await request(app)
      .get('/api/admin/admins/critical-actions?status=REJECTED')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
  });
});

// ─── Bug 3: SUPER_ADMIN blocked in /:id/approve ───────────────────────────────

describe('Bug 3 — POST /:id/approve blocks SUPER_ADMIN roleKey', () => {
  it('returns 400 when roleKey=SUPER_ADMIN is passed to the role-assign endpoint', async () => {
    const res = await request(app)
      .post('/api/admin/admins/some-user-id/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ roleKey: 'SUPER_ADMIN' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SUPER_ADMIN/);
    expect(res.body.error).toMatch(/creation flow/i);
  });

  it('allows non-SUPER_ADMIN roles through the approve endpoint', async () => {
    userFindUniqueResult = { id: 'some-user-id', role: 'ADMIN', adminRoles: [] };
    userAdminRoleFindManyResult = [];

    const res = await request(app)
      .post('/api/admin/admins/some-user-id/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ roleKey: 'ADMIN' });

    expect(res.status).toBe(200);
  });
});

// ─── Gap 1: risk.approve requires notes ──────────────────────────────────────

describe('Gap 1 — POST /risk-queue/:id/approve requires notes', () => {
  it('returns 400 when notes is missing', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes.*required/i);
  });

  it('returns 400 when notes is empty string', async () => {
    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ notes: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/notes.*required/i);
  });

  it('succeeds and includes notes in the AuditLog entry', async () => {
    scanFindUniqueResult = { status: 'MANUAL_REVIEW', fraudScore: 50, fraudReasons: [], billAmount: 10 };

    const res = await request(app)
      .post('/api/admin/control/risk-queue/scan-1/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ notes: 'Verified by manager' });

    expect(res.status).toBe(200);
    const auditEntry = auditCreateCalls.find((c) => c.action === 'risk.approve');
    expect(auditEntry).toBeDefined();
    expect(auditEntry.after.notes).toBe('Verified by manager');
  });
});

// ─── Gap 2: resend-activation writes rich AuditLog entry ─────────────────────

describe('Gap 2 — POST /:id/resend-activation writes explicit AuditLog entry', () => {
  beforeEach(() => {
    partnerFindUniqueResult = {
      id: 'p-1',
      email: 'partner@test.com',
      businessName: 'Test Biz',
      status: 'PENDING',
      verifiedAt: null,
      user: { email: 'user@test.com', firstName: 'John' },
    };
  });

  it('writes a partner.activation-link.resend audit entry with linkId and sentTo', async () => {
    const res = await request(app)
      .post('/api/admin/partners/p-1/resend-activation')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({});

    expect(res.status).toBe(200);

    const auditEntry = auditCreateCalls.find((c) => c.action === 'partner.activation-link.resend');
    expect(auditEntry).toBeDefined();
    expect(auditEntry.objectType).toBe('Partner');
    expect(auditEntry.objectId).toBe('p-1');
    expect(auditEntry.after).toMatchObject({ linkId: 'link-1', sentTo: 'partner@test.com' });
  });

  it('records the actor userId on the audit entry', async () => {
    await request(app)
      .post('/api/admin/partners/p-1/resend-activation')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({});

    const auditEntry = auditCreateCalls.find((c) => c.action === 'partner.activation-link.resend');
    expect(auditEntry?.actorUserId).toBe(SUPER_ADMIN_USER.id);
  });
});

// ─── Gap 3: SUPER_ADMIN request outcome notifies requester ────────────────────

describe('Gap 3 — SUPER_ADMIN request approve/reject notifies the requester', () => {
  const baseRequest = {
    id: 'psa-1',
    email: 'newsuper@test.com',
    firstName: 'New',
    lastName: 'Super',
    phone: '+359000000010',
    passwordHash: '$2b$12$hash',
    requestedById: 'u-other',
    createdAt: new Date(),
    requestedBy: { email: 'requester@test.com', firstName: 'Alice', lastName: 'Smith' },
  };

  it('sends an approval email to the requester when SUPER_ADMIN request is approved', async () => {
    pendingRequestFindUniqueResult = baseRequest;
    adminRoleFindUniqueResult = { id: 'role-sa', key: 'SUPER_ADMIN', label: 'Super Admin' };
    // SA-APPROVE-INITIATOR fix added initiator re-check: mock the initiator (requestedById='u-other') as ACTIVE SUPER_ADMIN.
    userFindUniqueResult = { role: 'SUPER_ADMIN', status: 'ACTIVE' };

    const res = await request(app)
      .post('/api/admin/admins/pending-super/psa-1/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({});

    expect(res.status).toBe(201);
    const email = emailSendCalls.find((e) => e.to === 'requester@test.com');
    expect(email).toBeDefined();
    expect(email.subject).toMatch(/approved/i);
    expect(email.html).toMatch(/newsuper@test\.com/);
  });

  it('sends a rejection email to the requester when SUPER_ADMIN request is rejected', async () => {
    // Spec §3.9 step 4 — only the initiator may cancel; the test SUPER_ADMIN actor is u-super.
    pendingRequestFindUniqueResult = { ...baseRequest, requestedById: 'u-super' };

    const res = await request(app)
      .delete('/api/admin/admins/pending-super/psa-1')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
    const email = emailSendCalls.find((e) => e.to === 'requester@test.com');
    expect(email).toBeDefined();
    expect(email.subject).toMatch(/rejected/i);
    expect(email.html).toMatch(/newsuper@test\.com/);
  });

  it('does not throw when requester has no email (approve path)', async () => {
    pendingRequestFindUniqueResult = {
      ...baseRequest,
      requestedBy: { email: null, firstName: 'Alice', lastName: 'Smith' },
    };
    adminRoleFindUniqueResult = { id: 'role-sa', key: 'SUPER_ADMIN', label: 'Super Admin' };
    // SA-APPROVE-INITIATOR fix added initiator re-check: mock the initiator (requestedById='u-other') as ACTIVE SUPER_ADMIN.
    userFindUniqueResult = { role: 'SUPER_ADMIN', status: 'ACTIVE' };

    const res = await request(app)
      .post('/api/admin/admins/pending-super/psa-1/approve')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({});

    expect(res.status).toBe(201);
    // No email sent when requester has no email address
    expect(emailSendCalls).toHaveLength(0);
  });

  it('does not throw when requester has no email (reject path)', async () => {
    pendingRequestFindUniqueResult = {
      ...baseRequest,
      requestedById: 'u-super',
      requestedBy: { email: null, firstName: 'Alice', lastName: 'Smith' },
    };

    const res = await request(app)
      .delete('/api/admin/admins/pending-super/psa-1')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
    // No email sent when requester has no email address
    expect(emailSendCalls).toHaveLength(0);
  });

  it('returns 403 when a non-initiator SUPER_ADMIN tries to cancel the request (spec §3.9 step 4)', async () => {
    // Request was initiated by u-other; acting SUPER_ADMIN is u-super (not the initiator).
    pendingRequestFindUniqueResult = { ...baseRequest, requestedById: 'u-other' };

    const res = await request(app)
      .delete('/api/admin/admins/pending-super/psa-1')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(403);
    // The pending request must not be deleted and no rejection email sent.
    expect(emailSendCalls).toHaveLength(0);
  });
});

// ─── Gap 4: require reason when suspending ────────────────────────────────────

describe('Gap 4 — PATCH /:id/status requires reason when archiving or deactivating', () => {
  beforeEach(() => {
    userFindUniqueResult = { id: 'u-target', role: 'ADMIN', status: 'ACTIVE' };
  });

  it('returns 400 when archiving without a reason', async () => {
    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'ARCHIVED' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('returns 400 when reason is only whitespace', async () => {
    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'ARCHIVED', reason: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason.*required/i);
  });

  it('succeeds when archiving with a reason', async () => {
    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'ARCHIVED', reason: 'Policy violation' });

    expect(res.status).toBe(200);
    const audit = auditCreateCalls.find((c) => c.action === 'admin.status');
    expect(audit?.after?.reason).toBe('Policy violation');
  });

  it('does not require reason when re-activating (ACTIVE)', async () => {
    userFindUniqueResult = { id: 'u-target', role: 'ADMIN', status: 'SUSPENDED' };

    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(200);
  });

  it('returns 403 when an ADMIN tries to change a SUPER_ADMIN\'s status', async () => {
    userFindUniqueResult = { id: 'u-target', role: 'SUPER_ADMIN', status: 'ACTIVE' };

    // No x-test-role header → actor is ADMIN_USER
    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .send({ status: 'ARCHIVED', reason: 'Privilege escalation attempt' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SUPER_ADMIN/);
  });

  it('returns 400 with legacy-deprecation message when attempting to set SUSPENDED status (INV-SM-ADMIN-001)', async () => {
    // SUSPENDED is a legacy status — the route explicitly rejects it as a new
    // write regardless of role, so even a SUPER_ADMIN actor cannot set it.
    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SUSPENDED.*legacy|legacy.*SUSPENDED/i);
  });

  it('allows a SUPER_ADMIN to change another SUPER_ADMIN\'s status', async () => {
    userFindUniqueResult = { id: 'u-target', role: 'SUPER_ADMIN', status: 'ACTIVE' };
    userCountResult = 2; // two active SUPER_ADMINs → last-SA guard passes

    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'ARCHIVED', reason: 'Policy violation' });

    expect(res.status).toBe(200);
  });

  it('returns 409 (not 403) when archiving the last active SUPER_ADMIN', async () => {
    // last-SA guard must take precedence over a generic "not allowed" error;
    // the actor IS a SUPER_ADMIN so the privilege guard passes, but the count
    // of OTHER active SAs is 0 → should 409 with a meaningful message.
    userFindUniqueResult = { id: 'u-target', role: 'SUPER_ADMIN', status: 'ACTIVE' };
    userCountResult = 0; // no other active SUPER_ADMINs

    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .set('x-test-role', 'SUPER_ADMIN')
      .send({ status: 'ARCHIVED', reason: 'Policy violation' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last.*SUPER_ADMIN/i);
  });

  it('returns 403 when an ADMIN tries to ACTIVATE a SUPER_ADMIN account', async () => {
    // Privilege guard fires for any status change to a SUPER_ADMIN target,
    // not just SUSPEND — verify the ACTIVATE path is equally blocked.
    userFindUniqueResult = { id: 'u-target', role: 'SUPER_ADMIN', status: 'SUSPENDED' };

    // No x-test-role header → actor is ADMIN_USER
    const res = await request(app)
      .patch('/api/admin/admins/u-target/status')
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SUPER_ADMIN/);
  });
});

// ─── Minor Gap: mustChangePassword in responses ───────────────────────────────

describe('Minor Gap — GET /admins and GET /admins/:id include mustChangePassword', () => {
  it('GET /admins includes mustChangePassword in each admin row', async () => {
    const { prisma } = await import('../../src/lib/prisma');
    (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'u-1',
        email: 'a@test.com',
        firstName: 'Alice',
        lastName: null,
        phone: null,
        role: 'ADMIN',
        status: 'ACTIVE',
        lastLoginAt: null,
        createdAt: new Date(),
        mustChangePassword: true,
        totpEnabledAt: null,
        adminRoles: [],
      },
    ]);
    (prisma.user.count as jest.Mock).mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/admin/admins')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(res.body.admins[0]).toHaveProperty('mustChangePassword', true);
  });

  it('GET /admins/:id includes mustChangePassword in the detail response', async () => {
    userFindUniqueResult = {
      id: 'u-1',
      email: 'a@test.com',
      firstName: 'Alice',
      lastName: null,
      phone: null,
      role: 'ADMIN',
      status: 'ACTIVE',
      lastLoginAt: null,
      createdAt: new Date(),
      mustChangePassword: false,
      totpEnabledAt: new Date(),
      adminRoles: [],
    };

    const res = await request(app)
      .get('/api/admin/admins/u-1')
      .set('x-test-role', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mustChangePassword', false);
    expect(res.body).toHaveProperty('twoFactorEnabled', true);
  });
});
