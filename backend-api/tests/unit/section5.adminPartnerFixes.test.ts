/**
 * §5 Admin-partner pipeline fixes (2026-05-19)
 *
 * Covers the five issues fixed in the §5 audit:
 *   Bug 1  — INACTIVE partner cannot be re-approved via POST /:id/approve
 *   Bug 2  — writeAudit calls use objectType 'Partner' (PascalCase) so
 *            GET /:id/audit returns them
 *   Bug 3  — writeAudit is called for assign, contract, and visibility PATCHes
 *   Bug 4  — POST /:id/notes requestStatus init is atomic (single $transaction)
 *            and scoped to PENDING partners only
 *   Inaccuracy 2 — approve gate blocks ODOBRENA + non-PENDING status combos
 *
 * Gap 2 (features excluded from partner pendingChanges) is covered in the
 * PUT /:id section at the bottom.
 */

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockPartnerFindUnique = jest.fn();
const mockPartnerUpdate = jest.fn();
const mockUserFindFirst = jest.fn();
const mockActivationLinkFindFirst = jest.fn();
const mockTxFn = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    $transaction: (...args: any[]) => mockTxFn(...args),
    partner: {
      findUnique: (...a: any[]) => mockPartnerFindUnique(...a),
      update: (...a: any[]) => mockPartnerUpdate(...a),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    user: {
      findMany: jest.fn(async () => []),
      findFirst: (...a: any[]) => mockUserFindFirst(...a),
      findUnique: jest.fn(async () => null),
    },
    partnerRequestNote: {
      create: jest.fn(async () => ({ id: 'note-1', body: 'x', isInternal: true, author: {} })),
      findMany: jest.fn(async () => []),
    },
    auditLog: { findMany: jest.fn(async () => []) },
    activationLink: {
      findFirst: (...a: any[]) => mockActivationLinkFindFirst(...a),
      findMany: jest.fn(async () => []),
    },
    partnerStatusChange: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
    },
    venue: { findMany: jest.fn(async () => []) },
    venueReceiptTemplate: {
      groupBy: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── writeAudit spy (takes exactly one argument) ───────────────────────────────
const writeAuditMock = jest.fn(async (_arg: any) => undefined);
jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: (arg: any) => writeAuditMock(arg),
}));

// ── Auth middleware ────────────────────────────────────────────────────────────
let currentUser: { id: string; role: string } = { id: 'admin-1', role: 'ADMIN' };
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

// ── Service / helper mocks ─────────────────────────────────────────────────────
jest.mock('../../src/services/partnerActivation.service', () => ({
  issueActivationLink: jest.fn(async () => ({
    token: 'tok',
    url: 'https://boomcard.bg/partner/activate?token=tok',
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    linkId: 'link-1',
  })),
  sendActivationEmail: jest.fn(async () => undefined),
  stampEmailOutcome: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/partner.service', () => ({
  partnerService: {
    setPartnerStatus: jest.fn(async (p: any) => ({
      partnerId: p.partnerId,
      fromStatus: 'ACTIVE',
      toStatus: p.toStatus,
    })),
  },
  isPartnerOperationallyActive: jest.fn(() => true),
}));

jest.mock('../../src/services/partnerSla.helper', () => ({
  computePartnerSla: jest.fn(() => ({
    hoursElapsed: 1, hoursRemaining: 23, state: 'ok', deadlineHours: 24, isClosed: false,
  })),
}));

jest.mock('../../src/services/partnerVenueCountBucket.helper', () => ({
  parseVenueCountBucket: jest.fn(() => 'ONE'),
  formatVenueCountBucket: jest.fn(() => '1'),
  VENUE_COUNT_BUCKET_DISPLAY_VALUES: ['1', '2-5', '6-10', '11+'],
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendPartnerStatusChangeEmail: jest.fn(async () => undefined),
    sendEmail: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));

jest.mock('../../src/utils/requestIp', () => ({ getClientIp: jest.fn(() => '127.0.0.1') }));

jest.mock('../../src/constants/receipt.constants', () => ({
  CASHBACK_MATRIX_STEPS: [3, 5, 7, 10, 15],
}));

jest.mock('../../src/services/partnerType.service', () => ({
  partnerTypeService: { findById: jest.fn(async () => null) },
}));

jest.mock('../../src/constants/categoryRegistry', () => ({
  findInvalidCategoryEntry: jest.fn(() => null),
}));

// ── App bootstrap ─────────────────────────────────────────────────────────────
import express from 'express';
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminPartnersRouter = require('../../src/routes/adminPartners.routes').default;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/partners', adminPartnersRouter);
  return app;
}

/** Minimal partner row for tests */
function partnerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    businessName: 'Acme',
    category: 'restaurant',
    categories: [],
    email: 'partner@acme.bg',
    phone: null,
    city: 'Sofia',
    address: null,
    discountRate: null,
    features: null,
    status: 'PENDING',
    requestStatus: 'ONBOARDING',
    assignedAdminId: null,
    isVisible: true,
    joinedAt: new Date(),
    verifiedAt: null,
    onboardingCompletedAt: null,
    requestObjectCount: null,
    partnerType: null,
    user: { id: 'u1', firstName: 'Ivan', lastName: 'Ivanov', email: 'ivan@acme.bg', phone: null },
    _count: { requestNotes: 0 },
    ...overrides,
  };
}

/** Find the first writeAudit call matching a given action */
function findAuditCall(action: string): Record<string, unknown> | undefined {
  const calls = writeAuditMock.mock.calls as Array<[Record<string, unknown>]>;
  const match = calls.find(([arg]) => arg.action === action);
  return match?.[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug 1 — INACTIVE partner cannot be re-approved via POST /:id/approve
// ─────────────────────────────────────────────────────────────────────────────
describe('Bug 1 — INACTIVE blocked from POST /:id/approve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('returns 400 when partner status is INACTIVE', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'INACTIVE', requestStatus: 'ODOBRENA', verifiedAt: new Date() })
    );
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/partner-status/i);
  });

  it('returns 400 when partner status is SUSPENDED', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'SUSPENDED', requestStatus: 'ODOBRENA' })
    );
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when partner status is ARCHIVED', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'ARCHIVED', requestStatus: 'ODOBRENA' })
    );
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(400);
  });

  it('succeeds for a PENDING partner at ONBOARDING stage', async () => {
    const p = partnerRow({ status: 'PENDING', requestStatus: 'ONBOARDING' });
    mockPartnerFindUnique.mockResolvedValueOnce(p);
    const updated = { ...p, status: 'ACTIVE', requestStatus: 'ODOBRENA' };
    mockTxFn.mockResolvedValueOnce([updated, {}]);
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inaccuracy 2 — approve gate blocks ODOBRENA + non-PENDING
// ─────────────────────────────────────────────────────────────────────────────
describe('Inaccuracy 2 — approve gate blocks ODOBRENA + non-PENDING', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('blocks when requestStatus=ODOBRENA and partner.status=ACTIVE (already active guard)', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'ACTIVE', requestStatus: 'ODOBRENA', verifiedAt: new Date() })
    );
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already ACTIVE/i);
  });

  it('blocks when requestStatus=ODOBRENA and partner.status=SUSPENDED (NON_APPROVABLE_STATUSES)', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'SUSPENDED', requestStatus: 'ODOBRENA' })
    );
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/partner-status/i);
  });

  it('blocks when requestStatus=ODOBRENA and partner.status=INACTIVE (belt-and-braces guard)', async () => {
    // INACTIVE is now in NON_APPROVABLE_STATUSES — caught before the ODOBRENA guard
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'INACTIVE', requestStatus: 'ODOBRENA', verifiedAt: new Date() })
    );
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(400);
  });

  it('allows ODOBRENA when partner.status=PENDING (manual pipeline advance scenario)', async () => {
    const p = partnerRow({ status: 'PENDING', requestStatus: 'ODOBRENA' });
    mockPartnerFindUnique.mockResolvedValueOnce(p);
    const updated = { ...p, status: 'ACTIVE', requestStatus: 'ODOBRENA' };
    mockTxFn.mockResolvedValueOnce([updated, {}]);
    const res = await request(makeApp()).post('/api/admin/partners/p1/approve').send({});
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 2 — writeAudit calls use objectType 'Partner' (PascalCase)
// ─────────────────────────────────────────────────────────────────────────────
describe('Bug 2 — audit objectType is PascalCase for all admin writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('PATCH /status writes objectType=Partner', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'NOVA' }));
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ requestStatus: 'KOMUNIKACIYA' }));
    await request(makeApp())
      .patch('/api/admin/partners/p1/status')
      .send({ requestStatus: 'KOMUNIKACIYA' });
    const audit = findAuditCall('partner.request.status');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
  });

  it('PATCH /discount-rate writes objectType=Partner', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ partnerType: { maxDiscountRate: 15 }, discountRate: null })
    );
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ discountRate: 5 }));
    await request(makeApp())
      .patch('/api/admin/partners/p1/discount-rate')
      .send({ rate: 5 });
    const audit = findAuditCall('partner.discount-rate.update');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
  });

  it('POST /resend-activation writes objectType=Partner', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'ACTIVE', verifiedAt: null, user: { email: 'x@x.bg', firstName: 'X' } })
    );
    mockActivationLinkFindFirst.mockResolvedValueOnce(null);
    await request(makeApp()).post('/api/admin/partners/p1/resend-activation').send({});
    const audit = findAuditCall('partner.activation-link.resend');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
  });

  it('PATCH /partner-status writes objectType=Partner', async () => {
    mockPartnerFindUnique
      .mockResolvedValueOnce(partnerRow({ status: 'ACTIVE', user: { email: 'x@x.bg', firstName: 'X' } }))
      .mockResolvedValueOnce(partnerRow({ status: 'INACTIVE' }));
    await request(makeApp())
      .patch('/api/admin/partners/p1/partner-status')
      .send({ status: 'INACTIVE', reason: 'Seasonal closure' });
    const audit = findAuditCall('partner.status.update');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 3 — writeAudit called for assign, contract, visibility
// ─────────────────────────────────────────────────────────────────────────────
describe('Bug 3 — missing audit trails now present', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('PATCH /assign writes a partner.assign audit entry with before/after', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ assignedAdminId: null }));
    mockUserFindFirst.mockResolvedValueOnce({ id: 'admin-2', role: 'ADMIN' });
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ assignedAdminId: 'admin-2' }));
    await request(makeApp())
      .patch('/api/admin/partners/p1/assign')
      .send({ adminId: 'admin-2' });
    const audit = findAuditCall('partner.assign');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
    expect(audit!.before).toEqual({ assignedAdminId: null });
    expect(audit!.after).toEqual({ assignedAdminId: 'admin-2' });
  });

  it('PATCH /assign unassign (null adminId) still writes audit entry', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ assignedAdminId: 'admin-2' }));
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ assignedAdminId: null }));
    await request(makeApp())
      .patch('/api/admin/partners/p1/assign')
      .send({ adminId: null });
    const audit = findAuditCall('partner.assign');
    expect(audit).toBeDefined();
    expect(audit!.before).toEqual({ assignedAdminId: 'admin-2' });
    expect(audit!.after).toEqual({ assignedAdminId: null });
  });

  it('PATCH /contract writes a partner.contract.update audit entry', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ features: null }));
    mockPartnerUpdate.mockResolvedValueOnce({
      id: 'p1',
      features: JSON.stringify({ contractSigned: true }),
    });
    await request(makeApp())
      .patch('/api/admin/partners/p1/contract')
      .send({ signed: true });
    const audit = findAuditCall('partner.contract.update');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
    expect(audit!.before).toEqual({ contractSigned: null });
    expect(audit!.after).toEqual({ contractSigned: true });
  });

  it('PATCH /visibility writes a partner.visibility.update audit entry', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ isVisible: true }));
    mockPartnerUpdate.mockResolvedValueOnce({ id: 'p1', businessName: 'Acme', isVisible: false });
    await request(makeApp())
      .patch('/api/admin/partners/p1/visibility')
      .send({ isVisible: false });
    const audit = findAuditCall('partner.visibility.update');
    expect(audit).toBeDefined();
    expect(audit!.objectType).toBe('Partner');
    expect(audit!.before).toEqual({ isVisible: true });
    expect(audit!.after).toEqual({ isVisible: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug 4 — POST /notes requestStatus init is atomic and scope-guarded
// ─────────────────────────────────────────────────────────────────────────────
describe('Bug 4 — POST /notes requestStatus init', () => {
  const fakeNote = {
    id: 'note-1',
    body: 'test',
    isInternal: true,
    author: { id: 'admin-1', firstName: 'A', lastName: 'B', email: 'a@b.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('uses $transaction for PENDING partner with no requestStatus', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'PENDING', requestStatus: null })
    );
    let partnerUpdateCalledInTx = false;
    mockTxFn.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        partner: { update: jest.fn(async () => { partnerUpdateCalledInTx = true; return {}; }) },
        partnerRequestNote: { create: jest.fn(async () => fakeNote) },
      };
      return fn(tx);
    });
    const res = await request(makeApp())
      .post('/api/admin/partners/p1/notes')
      .send({ body: 'First contact' });
    expect(res.status).toBe(201);
    expect(mockTxFn).toHaveBeenCalledTimes(1);
    // partner.update inside tx WAS called because needsInit=true
    expect(partnerUpdateCalledInTx).toBe(true);
  });

  it('does NOT set requestStatus for a non-PENDING (ACTIVE) partner with no requestStatus', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'ACTIVE', requestStatus: null, verifiedAt: new Date() })
    );
    let partnerUpdateCalledInTx = false;
    mockTxFn.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        partner: { update: jest.fn(async () => { partnerUpdateCalledInTx = true; return {}; }) },
        partnerRequestNote: { create: jest.fn(async () => fakeNote) },
      };
      return fn(tx);
    });
    const res = await request(makeApp())
      .post('/api/admin/partners/p1/notes')
      .send({ body: 'Internal note' });
    expect(res.status).toBe(201);
    expect(partnerUpdateCalledInTx).toBe(false);
  });

  it('does NOT set requestStatus when requestStatus is already set (KOMUNIKACIYA)', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(
      partnerRow({ status: 'PENDING', requestStatus: 'KOMUNIKACIYA' })
    );
    let partnerUpdateCalledInTx = false;
    mockTxFn.mockImplementationOnce(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        partner: { update: jest.fn(async () => { partnerUpdateCalledInTx = true; return {}; }) },
        partnerRequestNote: { create: jest.fn(async () => fakeNote) },
      };
      return fn(tx);
    });
    const res = await request(makeApp())
      .post('/api/admin/partners/p1/notes')
      .send({ body: 'Follow-up' });
    expect(res.status).toBe(201);
    expect(partnerUpdateCalledInTx).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 2 — features excluded from partner pendingChanges in PUT /:id
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap 2 — features not included in partner pendingChanges', () => {
  let partnersApp: express.Express;

  beforeAll(() => {
    // Load partners router after mocks are registered
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const partnersRouter = require('../../src/routes/partners.routes').default;
    partnersApp = express();
    partnersApp.use(express.json());
    partnersApp.use('/api/partners', partnersRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Set PARTNER role so the "non-admin pendingChanges" branch executes
    currentUser = { id: 'u1', role: 'PARTNER' };

    mockPartnerFindUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      status: 'ACTIVE',
      verifiedAt: new Date(),
      partnerType: null,
      user: { id: 'u1', email: 'p@p.bg' },
      businessName: 'X',
      category: 'restaurant',
      categories: [],
      discountRate: null,
      features: null,
      amenities: null,
    });
    mockPartnerUpdate.mockResolvedValue({
      id: 'p1',
      pendingChanges: {},
      pendingChangesAt: new Date(),
    });
  });

  it('does not include features in pendingChanges when PARTNER submits features', async () => {
    await request(partnersApp)
      .put('/api/partners/p1')
      .send({
        businessName: 'NewName',
        features: { contractSigned: false },
        amenities: '{"wifi":true}',
      });

    const updateCall = mockPartnerUpdate.mock.calls[0] as any;
    expect(updateCall).toBeDefined();
    const pending = updateCall[0]?.data?.pendingChanges as Record<string, unknown>;
    // businessName and amenities should be in pendingChanges
    expect(pending).toHaveProperty('businessName', 'NewName');
    expect(pending).toHaveProperty('amenities');
    // features must NOT be in pendingChanges
    expect(pending).not.toHaveProperty('features');
  });

  it('includes only profile-safe fields in pendingChanges', async () => {
    await request(partnersApp)
      .put('/api/partners/p1')
      .send({
        description: 'Updated desc',
        website: 'https://acme.bg',
        phone: '+359888000000',
        // These admin-only fields should be silently dropped
        discountRate: 99,
        status: 'ARCHIVED',
        features: { contractSigned: false },
      });

    const updateCall = mockPartnerUpdate.mock.calls[0] as any;
    const pending = updateCall?.[0]?.data?.pendingChanges as Record<string, unknown>;
    expect(pending).toHaveProperty('description');
    expect(pending).toHaveProperty('website');
    expect(pending).toHaveProperty('phone');
    // None of these must appear
    expect(pending).not.toHaveProperty('discountRate');
    expect(pending).not.toHaveProperty('status');
    expect(pending).not.toHaveProperty('features');
  });
});
