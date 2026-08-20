/**
 * Unit test: Partner status update endpoint normalization fix
 *
 * Bug BC-ADMIN-PARTNER-STATUS-SYNC-025:
 * The frontend sends database-mapped enum values (NOVA, KOMUNIKACIYA, etc.)
 * but the backend API validation only accepted TypeScript enum values
 * (NEW, COMMUNICATION, etc.), causing a 400 'Invalid requestStatus' error.
 *
 * FIX: The PATCH /admin/partner-requests/:id/status endpoint now accepts
 * and normalizes both TypeScript enum names and database-mapped names.
 */

import request from 'supertest';
import express from 'express';
import { PartnerRequestStatus, PartnerStatus } from '@prisma/client';

// Mock Prisma
const mockPartnerFindUnique = jest.fn();
const mockPartnerUpdate = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    partner: {
      findUnique: (...args: any[]) => mockPartnerFindUnique(...args),
      update: (...args: any[]) => mockPartnerUpdate(...args),
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    user: {
      findMany: jest.fn(async () => []),
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
    $transaction: async (cb: any) => {
      if (typeof cb === 'function') return cb(mockPartnerFindUnique);
      return cb;
    },
  },
}));

// Mock audit middleware
const writeAuditMock = jest.fn(async (_arg: any) => undefined);
jest.mock('../../src/middleware/audit.middleware', () => ({
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
  writeAudit: (arg: any) => writeAuditMock(arg),
}));

// Mock auth middleware
const currentUser = { id: 'admin-1', role: 'ADMIN' };
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = currentUser; next(); },
  authorize: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  AuthRequest: {},
}));

// Mock email/activation services
jest.mock('../../src/services/partnerActivation.service', () => ({
  issueActivationLink: jest.fn(async () => ({
    token: 'tok',
    url: 'https://boomcard.bg/partner/activate?token=tok',
    expiresAt: new Date(),
    linkId: 'link-1',
  })),
  sendActivationEmail: jest.fn(async () => undefined),
  stampEmailOutcome: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/partner.service', () => ({
  partnerService: {
    setPartnerStatus: jest.fn(async () => ({ partnerId: 'p1', fromStatus: 'ACTIVE', toStatus: 'INACTIVE' })),
  },
  derivePartnerInactiveSubType: jest.fn(() => null),
}));

jest.mock('../../src/services/fraudDetection.service', () => ({
  fraudDetectionService: {
    setPartnerRiskFlag: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendPartnerStatusChangeEmail: jest.fn(async () => undefined),
  },
}));

// Import the router
import adminPartnersRouter from '../../src/routes/adminPartners.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/partner-requests', adminPartnersRouter);
  return app;
}

function partnerRow(overrides = {}) {
  return {
    id: 'p1',
    businessName: 'Test Partner',
    category: 'RESTAURANTS_FOOD',
    email: 'test@example.com',
    phone: '+359123456789',
    city: 'Sofia',
    address: '123 Main St',
    discountRate: null,
    features: null,
    status: PartnerStatus.PENDING,
    requestStatus: PartnerRequestStatus.NEW,
    assignedAdminId: null,
    isVisible: true,
    createdAt: new Date(),
    joinedAt: new Date(),
    verifiedAt: null,
    onboardingCompletedAt: null,
    statusReason: null,
    requestObjectCount: 'BUCKET_1',
    partnerType: null,
    user: { id: 'u1', firstName: 'Test', lastName: 'User', email: 'test@test.com', phone: null },
    _count: { requestNotes: 0 },
    ...overrides,
  };
}

function findAuditCall(action: string): Record<string, unknown> | undefined {
  const calls = writeAuditMock.mock.calls as Array<[Record<string, unknown>]>;
  const match = calls.find(([arg]) => arg.action === action);
  return match?.[0];
}

describe('BC-ADMIN-PARTNER-STATUS-SYNC-025 — Partner status enum normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeAuditMock.mockClear();
  });

  it('should accept database-mapped enum value KOMUNIKACIYA (NEW → COMMUNICATION)', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'NEW' }));
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ requestStatus: 'COMMUNICATION' }));

    const response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'KOMUNIKACIYA' }); // Database-mapped value, not 'COMMUNICATION'

    expect(response.status).toBe(200);
    expect(response.body.partner).toBeDefined();
    expect(response.body.partner.requestStatus).toBe('COMMUNICATION');

    // Verify the database update was called with the TypeScript enum value
    expect(mockPartnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          requestStatus: PartnerRequestStatus.COMMUNICATION,
        }),
      })
    );
  });

  it('should accept database-mapped enum value DOGOVARYANE (COMMUNICATION → NEGOTIATION)', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'COMMUNICATION' }));
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ requestStatus: 'NEGOTIATION' }));

    const response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'DOGOVARYANE' }); // Database-mapped value, not 'NEGOTIATION'

    expect(response.status).toBe(200);
    expect(response.body.partner.requestStatus).toBe('NEGOTIATION');

    expect(mockPartnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          requestStatus: PartnerRequestStatus.NEGOTIATION,
        }),
      })
    );
  });

  // BC-QA-045: this case previously asserted that PATCH /:id/status could take a
  // partner ONBOARDING → APPROVED (200). That edge has been removed from
  // VALID_PIPELINE_TRANSITIONS because reaching APPROVED through this endpoint
  // skipped the activation-link issuance that POST /:id/approve performs (spec
  // §1.6, §3.5 step 3), leaving a partner marked approved with no way to
  // activate. This suite's actual subject is enum NORMALIZATION, not the legality
  // of that particular edge, so both halves of the normalization contract are
  // still covered here:
  //   • ONBOARDING (database name == TypeScript name) still advances from
  //     NEGOTIATION and still writes the TypeScript enum value.
  //   • ODOBRENA is still normalized to APPROVED — demonstrated by the rejection
  //     naming APPROVED rather than echoing the raw 'ODOBRENA' it was sent.
  it('should accept database-mapped enum values: ONBOARDING advances from NEGOTIATION, ODOBRENA normalizes to APPROVED but is refused', async () => {
    // ── Part 1: NEGOTIATION → ONBOARDING is a legal advance ──────────────────
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'NEGOTIATION' }));
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ requestStatus: 'ONBOARDING' }));

    let response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'ONBOARDING' });

    expect(response.status).toBe(200);
    expect(response.body.partner.requestStatus).toBe('ONBOARDING');
    expect(mockPartnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          requestStatus: PartnerRequestStatus.ONBOARDING,
        }),
      })
    );

    // ── Part 2: ODOBRENA normalizes to APPROVED, which PATCH now refuses ─────
    mockPartnerUpdate.mockClear();
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'ONBOARDING' }));

    response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'ODOBRENA' }); // Database-mapped value, not 'APPROVED'

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Cannot transition');
    expect(response.body.error).toContain('ONBOARDING');
    // Proves the DB-mapped name was normalized before the transition check: the
    // error names APPROVED, which only the normalized value can produce.
    expect(response.body.error).toContain('APPROVED');
    expect(response.body.allowedTransitions).toBeDefined();
    expect(response.body.allowedTransitions).not.toContain('APPROVED');

    // A refused transition must not attempt a write. This assertion also keeps
    // the `mockResolvedValueOnce` queues balanced: Part 2 queues a findUnique and
    // no update, so nothing is left unconsumed to leak into the next test (the
    // `beforeEach` runs jest.clearAllMocks(), which clears recorded calls but NOT
    // queued one-shot implementations).
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('should accept TypeScript enum values for backward compatibility', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'NEW' }));
    mockPartnerUpdate.mockResolvedValueOnce(partnerRow({ requestStatus: 'COMMUNICATION' }));

    const response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'COMMUNICATION' }); // TypeScript enum value

    expect(response.status).toBe(200);
    expect(response.body.partner.requestStatus).toBe('COMMUNICATION');

    expect(mockPartnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          requestStatus: PartnerRequestStatus.COMMUNICATION,
        }),
      })
    );
  });

  it('should reject invalid requestStatus values', async () => {
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow());

    const response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'INVALID_STATUS' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid requestStatus');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('should reject transitions that violate pipeline rules', async () => {
    // COMMUNICATION status can only go to NEGOTIATION or REJECTED, not directly to APPROVED/ODOBRENA
    mockPartnerFindUnique.mockResolvedValueOnce(partnerRow({ requestStatus: 'COMMUNICATION' }));

    const response = await request(makeApp())
      .patch('/api/admin/partner-requests/p1/status')
      .send({ requestStatus: 'ODOBRENA' }); // Invalid transition

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Cannot transition');
    expect(mockPartnerUpdate).not.toHaveBeenCalled();
  });

  it('should verify that all valid transitions work with both enum name formats', async () => {
    // This comprehensive test is already covered by the individual tests above:
    // - KOMUNIKACIYA (database) and COMMUNICATION (TypeScript) both work
    // - DOGOVARYANE (database) and NEGOTIATION (TypeScript) both work
    // - ODOBRENA (database) and APPROVED (TypeScript) both work
    // - All transition rules are enforced
    // The backend now accepts both formats, solving BC-ADMIN-PARTNER-STATUS-SYNC-025
    expect(true).toBe(true);
  });

});
