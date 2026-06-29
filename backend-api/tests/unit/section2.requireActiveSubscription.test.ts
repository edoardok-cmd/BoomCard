/**
 * F-005 (BC-USER-SPEC-GAP-001 / BC-USER-SPEC-FIX-005-CODE) —
 * requireActiveSubscription middleware unit tests.
 *
 * Enforces the spec §2 sequence (payment → Active subscription → full operational
 * access) at the access-control layer: a USER without an Active (or
 * Cancelled-within-paid-period) subscription is blocked from operational/write
 * endpoints with a typed 402 SUBSCRIPTION_REQUIRED — not a generic 500 — directing
 * them to complete plan selection + payment. Onboarding endpoints stay reachable.
 */

// ── Prisma mock ───────────────────────────────────────────────────────────────
const subscriptionFindFirst = jest.fn() as jest.Mock;
const userFindUnique = jest.fn() as jest.Mock;

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: {
    subscription: { findFirst: (...a: any[]) => subscriptionFindFirst(...a) },
    user: { findUnique: (...a: any[]) => userFindUnique(...a) },
  },
  prisma: {
    subscription: { findFirst: (...a: any[]) => subscriptionFindFirst(...a) },
    user: { findUnique: (...a: any[]) => userFindUnique(...a) },
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('../../src/services/userActivity.service', () => ({
  touchUserActivity: jest.fn(),
}));

import { requireActiveSubscription, AuthRequest } from '../../src/middleware/auth.middleware';
import { AppError } from '../../src/middleware/error.middleware';
import type { Response, NextFunction } from 'express';

function makeReq(user?: { id: string; role: string }): AuthRequest {
  return { user } as unknown as AuthRequest;
}

beforeEach(() => {
  subscriptionFindFirst.mockReset();
  userFindUnique.mockReset();
  // Default: ACTIVE user — account-status gate passes through to subscription check.
  userFindUnique.mockResolvedValue({ status: 'ACTIVE' });
});

describe('F-005 requireActiveSubscription — non-USER bypass', () => {
  it.each(['ADMIN', 'SUPER_ADMIN', 'PARTNER'])(
    'passes %s through without a subscription lookup',
    async (role) => {
      const req = makeReq({ id: 'u1', role });
      const next = jest.fn() as unknown as NextFunction;

      await requireActiveSubscription(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect((next as jest.Mock).mock.calls[0][0]).toBeUndefined(); // no error
      expect(subscriptionFindFirst).not.toHaveBeenCalled();
      expect(userFindUnique).not.toHaveBeenCalled();
    },
  );
});

describe('F-005 requireActiveSubscription — unauthenticated', () => {
  it('rejects when req.user is missing', async () => {
    const req = makeReq(undefined);
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(401);
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
  });
});

describe('F-005 requireActiveSubscription — USER gating', () => {
  it('allows a USER with an eligible (Active/Cancelled-within-period) subscription', async () => {
    subscriptionFindFirst.mockResolvedValue({ id: 'sub-1' });
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeUndefined();

    // Confirm the eligibility query encodes the spec §2/§3.2 rule: ACTIVE/TRIALING
    // OR CANCELLED-within-paid-period (currentPeriodEnd in the future).
    const where = subscriptionFindFirst.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { status: { in: ['ACTIVE', 'TRIALING'] } },
        // Spec §3.2: Cancelled-within-paid-period only — must include the
        // currentPeriodEnd guard so a Cancelled-post-period row is NOT admitted.
        { status: 'CANCELLED', currentPeriodEnd: { gt: expect.any(Date) } },
      ]),
    );
  });

  it('blocks a USER with a Cancelled-post-period subscription (currentPeriodEnd guard)', async () => {
    // The query must NOT match a CANCELLED row whose period has ended.
    // We verify this by checking that the OR clause's CANCELLED branch carries
    // currentPeriodEnd: { gt: <date> } — so a past-period row falls outside the
    // WHERE and findFirst returns null → 402.
    subscriptionFindFirst.mockResolvedValue(null); // period ended → query returns null
    const req = makeReq({ id: 'u3', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(402);

    // Verify the query that produced null includes the currentPeriodEnd guard.
    const where = subscriptionFindFirst.mock.calls[0][0].where;
    const cancelledClause = (where.OR as any[]).find(
      (c: any) => c.status === 'CANCELLED',
    );
    expect(cancelledClause).toBeDefined();
    expect(cancelledClause.currentPeriodEnd).toEqual({ gt: expect.any(Date) });
  });

  it('blocks a pre-payment USER (no subscription) with typed 402 SUBSCRIPTION_REQUIRED', async () => {
    subscriptionFindFirst.mockResolvedValue(null);
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(402);
    expect((err as AppError).details).toEqual({ code: 'SUBSCRIPTION_REQUIRED' });
    // Must direct the user to plan selection / payment, not a generic message.
    expect((err as AppError).message).toMatch(/SUBSCRIPTION_REQUIRED/);
  });

  it('blocks a USER whose subscription is Expired/lapsed (findFirst returns null)', async () => {
    // The eligibility query itself filters out Expired / Failed-Payment /
    // Cancelled-post-period, so the service returns null → blocked.
    subscriptionFindFirst.mockResolvedValue(null);
    const req = makeReq({ id: 'u2', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect((err as AppError).statusCode).toBe(402);
  });

  it('fails closed (503, not fall-open, not raw 500) on a DB error', async () => {
    subscriptionFindFirst.mockRejectedValue(new Error('db down'));
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(503);
    expect((err as AppError).details).toEqual({ code: 'SUBSCRIPTION_CHECK_FAILED' });
  });
});

describe('F-005 requireActiveSubscription — account status gate (spec §8.1 rule 1)', () => {
  it('blocks an INACTIVE USER with 402 ACCOUNT_INACTIVE before checking subscription', async () => {
    userFindUnique.mockResolvedValue({ status: 'INACTIVE' });
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(402);
    expect((err as AppError).details).toEqual({ code: 'ACCOUNT_INACTIVE' });
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
  });

  it('blocks an ARCHIVED USER with 403 ACCOUNT_NOT_ACCESSIBLE before checking subscription', async () => {
    userFindUnique.mockResolvedValue({ status: 'ARCHIVED' });
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
    expect((err as AppError).details).toMatchObject({ code: 'ACCOUNT_NOT_ACCESSIBLE', subCode: 'ARCHIVED' });
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
  });

  it('blocks a DELETED USER with 403 ACCOUNT_NOT_ACCESSIBLE before checking subscription', async () => {
    userFindUnique.mockResolvedValue({ status: 'DELETED' });
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
    expect((err as AppError).details).toMatchObject({ code: 'ACCOUNT_NOT_ACCESSIBLE', subCode: 'DELETED' });
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
  });

  it('proceeds to subscription check when user row not found (post-delete race — findUnique returns null)', async () => {
    // findUnique returns null for a missing record (not a throw). Middleware treats
    // null as "no account-status block" and falls through to the subscription check.
    userFindUnique.mockResolvedValue(null);
    subscriptionFindFirst.mockResolvedValue({ id: 'sub-1' });
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeUndefined();
  });

  it('fails closed (503) on any DB error from the user status lookup', async () => {
    // Any rejection from findUnique (connection failure, pool exhaustion, etc.)
    // propagates directly to the outer try/catch → must not fail open.
    const dbErr = Object.assign(new Error('connection reset'), { code: 'P9999' });
    userFindUnique.mockRejectedValue(dbErr);
    const req = makeReq({ id: 'u1', role: 'USER' });
    const next = jest.fn() as unknown as NextFunction;

    await requireActiveSubscription(req, {} as Response, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(503);
    expect((err as AppError).details).toEqual({ code: 'SUBSCRIPTION_CHECK_FAILED' });
    expect(subscriptionFindFirst).not.toHaveBeenCalled();
  });
});
