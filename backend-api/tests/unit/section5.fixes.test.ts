/**
 * §5 Fix A — auth.service.ts login gate changes
 *
 * Verifies that SUSPENDED/PAUSED partners can now log in (returning a
 * `partnerRestriction` flag) instead of being hard-blocked, while ARCHIVED
 * partners and unactivated partners remain blocked as before.
 */

// ── Prisma mock ──────────────────────────────────────────────────────────────
const authUserFindMany = jest.fn() as jest.Mock;
const authUserUpdate = jest.fn() as jest.Mock;
const authPartnerFindUnique = jest.fn() as jest.Mock;
const authRefreshTokenCreate = jest.fn(async () => ({})) as jest.Mock;
const authLoginHistoryCreate = jest.fn(async () => ({})) as jest.Mock;

jest.mock('../../src/lib/prisma', () => {
  const client: any = {
    $transaction: jest.fn(async (fn: any) => fn(client)),
    user: {
      findMany: (...a: any[]) => authUserFindMany(...a),
      update: (...a: any[]) => authUserUpdate(...a),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
    },
    partner: {
      findUnique: (...a: any[]) => authPartnerFindUnique(...a),
      update: jest.fn(async (v: any) => ({ ...(v.data ?? {}), id: 'p1' })),
    },
    refreshToken: { create: (...a: any[]) => authRefreshTokenCreate(...a) },
    loginHistory: { create: (...a: any[]) => authLoginHistoryCreate(...a), createMany: jest.fn(async () => ({})) },
    activationLink: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── External dependency mocks ─────────────────────────────────────────────────
jest.mock('../../src/services/email.service', () => ({
  emailService: {
    sendEmail: jest.fn(async () => ({ success: true })),
    sendPartnerEmailVerification: jest.fn(async () => undefined),
    sendPartnerApplicationAck: jest.fn(async () => undefined),
    sendPartnerStatusChangeEmail: jest.fn(async () => undefined),
    sendPartnerApprovalEmail: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    createForUser: jest.fn(async () => undefined),
    notifyAdminOpsNewPartner: jest.fn(async () => undefined),
  },
}));

jest.mock('otplib', () => ({
  __esModule: true,
  authenticator: { check: jest.fn(() => true), generate: jest.fn(() => '123456') },
  verifySync: jest.fn(() => ({ valid: true })),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async () => 'hashed'),
}));

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: jest.fn(() => 'access-token'),
    verify: jest.fn(() => ({ sub: 'u1', role: 'PARTNER', jti: 'jti1' })),
  },
}));

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
  auditMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// ── Subject under test ───────────────────────────────────────────────────────
import { AuthService } from '../../src/services/auth.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const basePartnerUser = {
  id: 'u1',
  email: 'partner@test.bg',
  passwordHash: 'hashed',
  firstName: 'Test',
  lastName: 'Partner',
  role: 'PARTNER',
  status: 'ACTIVE',
  avatar: null,
  emailVerified: true,
  totpSecret: null,
  totpEnabledAt: null,
  mustChangePassword: false,
  createdAt: new Date(),
};

beforeEach(() => {
  authUserFindMany.mockReset();
  authPartnerFindUnique.mockReset();
  authUserUpdate.mockReset();
  authRefreshTokenCreate.mockReset();
  authLoginHistoryCreate.mockReset();
  authUserUpdate.mockResolvedValue({ ...basePartnerUser, lastLoginAt: new Date() });
  authRefreshTokenCreate.mockResolvedValue({ token: 'refresh' });
  authLoginHistoryCreate.mockResolvedValue({});
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('§5.3 Fix A — SUSPENDED partner login allowed with restriction flag', () => {
  it('SUSPENDED partner with verifiedAt logs in and receives partnerRestriction=SUSPENDED', async () => {
    authUserFindMany.mockResolvedValue([basePartnerUser]);
    authPartnerFindUnique.mockResolvedValue({ status: 'SUSPENDED', verifiedAt: new Date() });

    const result = await AuthService.login({
      email: 'partner@test.bg',
      password: 'secret',
      clientType: 'web',
    });

    expect(result.partnerRestriction).toBe('SUSPENDED');
    expect(result.user).toBeDefined();
    expect(result.accessToken).toBeDefined();
  });

  it('PAUSED partner with verifiedAt logs in and receives partnerRestriction=SUSPENDED', async () => {
    authUserFindMany.mockResolvedValue([basePartnerUser]);
    authPartnerFindUnique.mockResolvedValue({ status: 'PAUSED', verifiedAt: new Date() });

    const result = await AuthService.login({
      email: 'partner@test.bg',
      password: 'secret',
      clientType: 'web',
    });

    expect(result.partnerRestriction).toBe('SUSPENDED');
  });

  it('SUSPENDED partner without verifiedAt is blocked (awaiting activation — must activate first)', async () => {
    authUserFindMany.mockResolvedValue([basePartnerUser]);
    authPartnerFindUnique.mockResolvedValue({ status: 'SUSPENDED', verifiedAt: null });

    await expect(
      AuthService.login({ email: 'partner@test.bg', password: 'secret', clientType: 'web' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('ARCHIVED partner with verifiedAt is fully blocked', async () => {
    authUserFindMany.mockResolvedValue([basePartnerUser]);
    authPartnerFindUnique.mockResolvedValue({ status: 'ARCHIVED', verifiedAt: new Date() });

    await expect(
      AuthService.login({ email: 'partner@test.bg', password: 'secret', clientType: 'web' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('ACTIVE partner with verifiedAt has no partnerRestriction in response', async () => {
    authUserFindMany.mockResolvedValue([basePartnerUser]);
    authPartnerFindUnique.mockResolvedValue({ status: 'ACTIVE', verifiedAt: new Date() });

    const result = await AuthService.login({
      email: 'partner@test.bg',
      password: 'secret',
      clientType: 'web',
    });

    expect(result.partnerRestriction).toBeUndefined();
  });

  it('INACTIVE partner with verifiedAt logs in with no restriction (read-only enforced downstream)', async () => {
    authUserFindMany.mockResolvedValue([basePartnerUser]);
    authPartnerFindUnique.mockResolvedValue({ status: 'INACTIVE', verifiedAt: new Date() });

    const result = await AuthService.login({
      email: 'partner@test.bg',
      password: 'secret',
      clientType: 'web',
    });

    // INACTIVE is read-only downstream; no restriction flag in spec
    expect(result.partnerRestriction).toBeUndefined();
    expect(result.user).toBeDefined();
  });
});
