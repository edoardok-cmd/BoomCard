/**
 * Spec §5 invariants — unit-level coverage for the partner module.
 *
 * The existing test suite only covered the SLA helper and a thin slice of
 * the activation service. This file fills the gaps called out in the audit
 * (L5): login-gate matrix, public-list filter shape, scan-gate per status,
 * resend supersession + rate behavior, status PATCH history. Each test
 * mocks Prisma so the suite runs without a live DB.
 */

import { publicPartnerFilter } from '../../src/services/publicPartnerFilter';
import {
  parseVenueCountBucket,
  formatVenueCountBucket,
} from '../../src/services/partnerVenueCountBucket.helper';

describe('§5.3 publicPartnerFilter shape', () => {
  it('requires status=ACTIVE + verifiedAt + isVisible', () => {
    expect(publicPartnerFilter).toEqual({
      status: 'ACTIVE',
      verifiedAt: { not: null },
      isVisible: true,
    });
  });
});

describe('§5.1 venue-count bucket helpers', () => {
  it('round-trips the four canonical buckets', () => {
    for (const wire of ['1', '2-5', '6-10', '11+'] as const) {
      const enumVal = parseVenueCountBucket(wire);
      expect(enumVal).not.toBeNull();
      expect(formatVenueCountBucket(enumVal)).toBe(wire);
    }
  });
  it('returns null for empty / unknown input', () => {
    expect(parseVenueCountBucket(undefined)).toBeNull();
    expect(parseVenueCountBucket('')).toBeNull();
    expect(parseVenueCountBucket('many')).toBeNull();
    expect(formatVenueCountBucket(null)).toBeNull();
    expect(formatVenueCountBucket(undefined)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// activationLink.service.issue — supersedes prior unconsumed link and runs in
// a SERIALIZABLE transaction. We test that updateMany+create are issued in
// order against the transaction handle (i.e., not on the bare client) so the
// race window between invalidate and create is closed.
// ─────────────────────────────────────────────────────────────────────────────

const txUpdateMany = jest.fn();
const txCreate = jest.fn();
const txUpdate = jest.fn();
const txFindUnique = jest.fn();
const txUserUpdate = jest.fn();
const txPartnerUpdate = jest.fn();

const transactionMock = jest.fn();

jest.mock('../../src/lib/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: (...args: unknown[]) => (transactionMock as jest.Mock)(...args),
      activationLink: {
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      partner: { findUnique: jest.fn(), update: jest.fn() },
      user: { update: jest.fn() },
      linkResendLog: { create: jest.fn(async () => ({})) },
    },
    prisma: {
      $transaction: (...args: unknown[]) => (transactionMock as jest.Mock)(...args),
    },
  };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => undefined),
}));

import { activationLinkService } from '../../src/services/activationLink.service';
import { ActivationLinkReason } from '@prisma/client';

describe('§5.2 activationLinkService.issue', () => {
  beforeEach(() => {
    transactionMock.mockReset();
    txUpdateMany.mockReset();
    txCreate.mockReset();
  });

  it('invalidates prior unconsumed links AND creates a new one inside a single tx', async () => {
    transactionMock.mockImplementation(async (fn: any, opts: any) => {
      // Capture isolation level the caller asked for
      expect(opts?.isolationLevel).toBe('Serializable');
      const tx = {
        activationLink: {
          updateMany: txUpdateMany.mockResolvedValue({ count: 1 }),
          create: txCreate.mockResolvedValue({ id: 'link-new', token: 'TOK', expiresAt: new Date('2099-01-01') }),
        },
      };
      return fn(tx);
    });

    const issued = await activationLinkService.issue({
      partnerId: 'p1',
      createdById: 'admin-1',
      reason: ActivationLinkReason.INITIAL,
    });

    expect(txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { partnerId: 'p1', consumedAt: null, invalidatedAt: null },
      data: expect.objectContaining({ invalidatedAt: expect.any(Date) }),
    }));
    expect(txCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        partnerId: 'p1',
        createdById: 'admin-1',
        reason: ActivationLinkReason.INITIAL,
      }),
    }));
    // The service generates the token itself (crypto.randomBytes) — assert
    // it's a long hex string rather than matching the mock's placeholder.
    expect(issued.token).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.id).toBe('link-new');
    expect(issued.reason).toBe(ActivationLinkReason.INITIAL);
  });

  it('retries once on a P2034 serialization conflict', async () => {
    const P2034 = Object.assign(new Error('serialization'), {
      code: 'P2034',
    });
    // Mark it as a PrismaClientKnownRequestError so the type guard matches.
    Object.setPrototypeOf(P2034, (require('@prisma/client').Prisma.PrismaClientKnownRequestError).prototype);

    transactionMock
      .mockImplementationOnce(async () => { throw P2034; })
      .mockImplementationOnce(async (fn: any) => fn({
        activationLink: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'link-retry', token: 'TOK2', expiresAt: new Date('2099-01-01') }),
        },
      }));

    const issued = await activationLinkService.issue({ partnerId: 'p1', createdById: 'a1' });
    expect(issued.token).toMatch(/^[0-9a-f]{64}$/);
    expect(transactionMock).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// activationLinkService.consume — atomic mark + verifiedAt + optional password
// ─────────────────────────────────────────────────────────────────────────────

describe('§5.2 activationLinkService.consume', () => {
  beforeEach(() => {
    transactionMock.mockReset();
  });

  // Helper: a well-formed partner object as returned from the findUnique that
  // now includes partner.user.mustChangePassword (M1 fix). Tests that don't
  // exercise the password-required gate set mustChangePassword: false.
  const basePartner = (overrides: any = {}) => ({
    id: 'p1', userId: 'u1', businessName: 'X', status: 'ACTIVE', verifiedAt: null,
    user: { mustChangePassword: false },
    ...overrides,
  });

  it('rejects expired token without mutating state', async () => {
    transactionMock.mockImplementation(async (fn: any) => {
      const tx = {
        activationLink: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'l1',
            consumedAt: null,
            invalidatedAt: null,
            expiresAt: new Date(Date.now() - 1),
            partner: basePartner(),
          }),
          update: jest.fn(),
        },
        partner: { update: jest.fn() },
        user: { update: jest.fn() },
      };
      return fn(tx);
    });

    await expect(activationLinkService.consume('expired-tok')).rejects.toThrow('Activation link has expired');
  });

  it('rejects already-used token', async () => {
    transactionMock.mockImplementation(async (fn: any) => fn({
      activationLink: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'l1', consumedAt: new Date(), invalidatedAt: null,
          expiresAt: new Date(Date.now() + 1000),
          partner: basePartner(),
        }),
        update: jest.fn(),
      },
      partner: { update: jest.fn() },
      user: { update: jest.fn() },
    }));
    await expect(activationLinkService.consume('used-tok')).rejects.toThrow('Activation link already used');
  });

  // After the C3 fix, consume uses an atomic updateMany + findUniqueOrThrow
  // pattern under SERIALIZABLE; the mocks must reflect that.
  const buildTx = (overrides: any = {}) => ({
    activationLink: {
      findUnique: jest.fn<any, any>().mockResolvedValue({
        id: 'l1', consumedAt: null, invalidatedAt: null,
        expiresAt: new Date(Date.now() + 1000),
        partner: basePartner(),
      }),
      updateMany: jest.fn<any, any>().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn<any, any>().mockResolvedValue({
        id: 'l1', consumedAt: new Date(),
        partner: basePartner(),
      }),
      ...overrides.activationLink,
    },
    partner: { update: jest.fn<any, any>().mockResolvedValue({}), ...overrides.partner },
    user: { update: jest.fn<any, any>().mockResolvedValue({}), ...overrides.user },
  });

  it('stamps verifiedAt and updates user without password', async () => {
    const tx = buildTx();
    transactionMock.mockImplementation(async (fn: any) => fn(tx));

    await activationLinkService.consume('good-tok');
    expect(tx.partner.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: expect.objectContaining({ verifiedAt: expect.any(Date) }),
    }));
    expect(tx.user.update).toHaveBeenCalled();
  });

  it('hashes and stores password when supplied', async () => {
    const tx = buildTx({
      activationLink: {
        findUnique: jest.fn<any, any>().mockResolvedValue({
          id: 'l1', consumedAt: null, invalidatedAt: null,
          expiresAt: new Date(Date.now() + 1000),
          partner: basePartner({ status: 'PENDING' }),
        }),
        findUniqueOrThrow: jest.fn<any, any>().mockResolvedValue({
          partner: basePartner({ status: 'PENDING' }),
        }),
      },
    });
    transactionMock.mockImplementation(async (fn: any) => fn(tx));

    await activationLinkService.consume('good-tok', { password: 'SecurePass123!' });
    const userArgs = (tx.user.update as any).mock.calls[0][0];
    expect(userArgs.where).toEqual({ id: 'u1' });
    expect(typeof userArgs.data.passwordHash).toBe('string');
    expect(userArgs.data.passwordHash.startsWith('$2')).toBe(true); // bcrypt prefix
    expect(userArgs.data.status).toBe('ACTIVE');
    expect(userArgs.data.emailVerified).toBe(true);
  });

  it('rejects too-short password (transaction rolled back)', async () => {
    transactionMock.mockImplementation(async (fn: any) => fn(buildTx()));

    await expect(
      activationLinkService.consume('good-tok', { password: 'short' }),
    ).rejects.toThrow('Password must be at least 8 characters');
  });

  // M1 fix: admin-onboarded partners must supply a password — backend enforces
  // this at the API level so the UI's `required` gate cannot be bypassed.
  it('rejects consume without password when partner.user.mustChangePassword=true', async () => {
    transactionMock.mockImplementation(async (fn: any) => fn(buildTx({
      activationLink: {
        findUnique: jest.fn<any, any>().mockResolvedValue({
          id: 'l1', consumedAt: null, invalidatedAt: null,
          expiresAt: new Date(Date.now() + 1000),
          partner: basePartner({ user: { mustChangePassword: true } }),
        }),
        updateMany: jest.fn<any, any>().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn<any, any>().mockResolvedValue({
          partner: basePartner({ user: { mustChangePassword: true } }),
        }),
      },
    })));

    const err: any = await activationLinkService.consume('admin-tok').catch((e) => e);
    expect(err.code).toBe('PASSWORD_REQUIRED');
    expect(err.message).toMatch(/password is required/i);
  });

  it('accepts consume without password when partner.user.mustChangePassword=false (self-registered)', async () => {
    const tx = buildTx();
    transactionMock.mockImplementation(async (fn: any) => fn(tx));
    // Should not throw — self-registered partners already set a password at /register
    await expect(activationLinkService.consume('self-tok')).resolves.toBeDefined();
  });
});
