/**
 * BC-ADMIN-AUDIT-FIX-008 — Verify two specific defects are fixed:
 *
 * MEDIUM: Category endpoint allows edits on non-ACTIVE partners
 *   - FIX: Add status check requiring partner.status === ACTIVE before allowing edits
 *   - Return 400 if partner is INACTIVE, SUSPENDED, ARCHIVED, PENDING
 *
 * LOW: Response shape inconsistency
 *   - visibility endpoint returned only 4 fields (id, businessName, isVisible, status)
 *   - category endpoint returns full PARTNER_SELECT (~20+ fields)
 *   - FIX: Make visibility endpoint return full PARTNER_SELECT for consistency
 */

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockPartnerFindUnique = jest.fn();
const mockPartnerUpdate = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    partner: {
      findUnique: (...a: any[]) => mockPartnerFindUnique(...a),
      update: (...a: any[]) => mockPartnerUpdate(...a),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    user: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
    },
    partnerRequestNote: {
      create: jest.fn(async () => ({ id: 'note-1', body: 'x', isInternal: true, author: {} })),
      findMany: jest.fn(async () => []),
    },
    auditLog: { findMany: jest.fn(async () => []) },
    activationLink: {
      findFirst: jest.fn(async () => null),
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

// ── writeAudit spy ────────────────────────────────────────────────────────────
const writeAuditMock = jest.fn(async (_arg: any) => undefined);
jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: (arg: any) => writeAuditMock(arg),
}));

// ── Auth middleware ───────────────────────────────────────────────────────────
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

// ── Category registry mock ────────────────────────────────────────────────────
jest.mock('../../src/constants/categoryRegistry', () => ({
  isMainCategoryId: jest.fn((id: string) => id === 'restaurants' || id === 'accommodation'),
  isSubcategoryId: jest.fn((id: string) => id === 'restaurants/fast-food'),
}));

// ── Service / helper mocks ────────────────────────────────────────────────────
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
  partnerService: {},
  derivePartnerInactiveSubType: jest.fn(() => null),
}));

jest.mock('../../src/services/partnerSla.helper', () => ({
  computePartnerSla: jest.fn(() => ({})),
}));

jest.mock('../../src/utils/requestIp', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('../../src/utils/detach', () => ({
  detach: (promise: Promise<any>, _onErr?: (e: Error) => void) => {
    promise.catch(() => {}); // fire-and-forget
  },
}));

jest.mock('../../src/services/fraudDetection.service', () => ({
  fraudDetectionService: {},
}));

jest.mock('../../src/services/partnerVenueCountBucket.helper', () => ({
  parseVenueCountBucket: jest.fn(),
  formatVenueCountBucket: jest.fn((v: any) => v),
  VENUE_COUNT_BUCKET_DISPLAY_VALUES: ['1', '2-5', '6-10', '11+'],
}));

jest.mock('../../src/constants/receipt.constants', () => ({
  CASHBACK_MATRIX_STEPS: [0.5, 1, 1.5, 2, 2.5, 3],
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

/** Full partner row with all PARTNER_SELECT fields */
function fullPartnerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    businessName: 'Test Partner',
    category: 'restaurants',
    categories: [],
    email: 'partner@test.bg',
    phone: null,
    city: 'Sofia',
    address: null,
    discountRate: null,
    features: null,
    status: 'ACTIVE',
    requestStatus: 'APPROVED',
    assignedAdminId: null,
    isVisible: true,
    createdAt: new Date('2026-01-01'),
    joinedAt: new Date('2026-01-15'),
    verifiedAt: new Date('2026-01-20'),
    onboardingCompletedAt: new Date('2026-01-10'),
    statusReason: null,
    requestObjectCount: null,
    partnerType: { id: 'pt1', name: 'Restaurant', color: '#FF0000' },
    user: { id: 'u1', firstName: 'Ivan', lastName: 'Ivanov', email: 'ivan@test.bg', phone: null },
    _count: { requestNotes: 0 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIUM: Category endpoint status check
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /:id/category — Status check (MEDIUM fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('Should allow category edit on ACTIVE partner', async () => {
    const activePartner = fullPartnerRow({ status: 'ACTIVE' });
    mockPartnerFindUnique.mockResolvedValueOnce(activePartner);
    mockPartnerUpdate.mockResolvedValueOnce(
      fullPartnerRow({ status: 'ACTIVE', category: 'accommodation' })
    );

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/category')
      .send({ category: 'accommodation' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('partner');
    expect(res.body.partner.category).toBe('accommodation');
  });

  it('Should REJECT category edit on INACTIVE partner', async () => {
    const inactivePartner = fullPartnerRow({ status: 'INACTIVE' });
    mockPartnerFindUnique.mockResolvedValueOnce(inactivePartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/category')
      .send({ category: 'accommodation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot edit category of non-ACTIVE partner');
    expect(res.body.currentStatus).toBe('INACTIVE');
    // Ensure update was never called
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('Should REJECT category edit on SUSPENDED partner', async () => {
    const suspendedPartner = fullPartnerRow({ status: 'SUSPENDED' });
    mockPartnerFindUnique.mockResolvedValueOnce(suspendedPartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/category')
      .send({ category: 'accommodation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot edit category of non-ACTIVE partner');
    expect(res.body.currentStatus).toBe('SUSPENDED');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('Should REJECT category edit on ARCHIVED partner', async () => {
    const archivedPartner = fullPartnerRow({ status: 'ARCHIVED' });
    mockPartnerFindUnique.mockResolvedValueOnce(archivedPartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/category')
      .send({ category: 'accommodation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot edit category of non-ACTIVE partner');
    expect(res.body.currentStatus).toBe('ARCHIVED');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('Should REJECT category edit on PENDING partner', async () => {
    const pendingPartner = fullPartnerRow({ status: 'PENDING' });
    mockPartnerFindUnique.mockResolvedValueOnce(pendingPartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/category')
      .send({ category: 'accommodation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot edit category of non-ACTIVE partner');
    expect(res.body.currentStatus).toBe('PENDING');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('Should REJECT category edit on PAUSED partner', async () => {
    const pausedPartner = fullPartnerRow({ status: 'PAUSED' });
    mockPartnerFindUnique.mockResolvedValueOnce(pausedPartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/category')
      .send({ category: 'accommodation' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot edit category of non-ACTIVE partner');
    expect(res.body.currentStatus).toBe('PAUSED');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOW: Response shape consistency (visibility vs category)
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /:id/visibility — Response shape (LOW fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('Should return full PARTNER_SELECT on visibility update (consistency with category)', async () => {
    const activePartner = fullPartnerRow({ status: 'ACTIVE', isVisible: true });
    mockPartnerFindUnique.mockResolvedValueOnce(activePartner);
    const updatedPartner = fullPartnerRow({ status: 'ACTIVE', isVisible: false });
    mockPartnerUpdate.mockResolvedValueOnce(updatedPartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/visibility')
      .send({ isVisible: false });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('partner');

    // Verify response has all PARTNER_SELECT fields, not just 4
    const partner = res.body.partner;
    expect(partner).toHaveProperty('id');
    expect(partner).toHaveProperty('businessName');
    expect(partner).toHaveProperty('isVisible');
    expect(partner).toHaveProperty('status');
    // Additional fields that PARTNER_SELECT includes but the old response didn't
    expect(partner).toHaveProperty('category');
    expect(partner).toHaveProperty('email');
    expect(partner).toHaveProperty('phone');
    expect(partner).toHaveProperty('city');
    expect(partner).toHaveProperty('createdAt');
    expect(partner).toHaveProperty('joinedAt');
    expect(partner).toHaveProperty('verifiedAt');
    expect(partner).toHaveProperty('onboardingCompletedAt');
    expect(partner).toHaveProperty('partnerType');
    expect(partner).toHaveProperty('user');
    expect(partner).toHaveProperty('_count');
  });

  it('Should call Prisma update with PARTNER_SELECT, not reduced select', async () => {
    const activePartner = fullPartnerRow({ status: 'ACTIVE', isVisible: true });
    mockPartnerFindUnique.mockResolvedValueOnce(activePartner);
    mockPartnerUpdate.mockResolvedValueOnce(
      fullPartnerRow({ status: 'ACTIVE', isVisible: false })
    );

    await request(makeApp())
      .patch('/api/admin/partners/p1/visibility')
      .send({ isVisible: false });

    // Verify the update call used PARTNER_SELECT
    expect(mockPartnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { isVisible: false },
        select: expect.objectContaining({
          id: true,
          businessName: true,
          category: true,
          email: true,
          createdAt: true,
          // etc. — full PARTNER_SELECT
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify visibility endpoint still blocks non-ACTIVE partners
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /:id/visibility — Status guard (existing behavior)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 'admin-1', role: 'ADMIN' };
  });

  it('Should block visibility toggle on non-ACTIVE partners', async () => {
    const inactivePartner = fullPartnerRow({ status: 'INACTIVE' });
    mockPartnerFindUnique.mockResolvedValueOnce(inactivePartner);

    const res = await request(makeApp())
      .patch('/api/admin/partners/p1/visibility')
      .send({ isVisible: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('only valid for ACTIVE partners');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });
});
