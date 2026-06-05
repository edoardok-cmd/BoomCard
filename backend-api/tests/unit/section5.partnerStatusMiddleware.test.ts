/**
 * §5.3 — requireActivePartnerForWrites middleware unit tests
 *
 * Verifies the write-gate middleware that blocks non-ACTIVE partners from
 * executing state-changing operations on partner-facing routes.
 */

// ── Prisma mock ───────────────────────────────────────────────────────────────
const partnerFindUnique = jest.fn() as jest.Mock;

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: { partner: { findUnique: (...a: any[]) => partnerFindUnique(...a) } },
  prisma: { partner: { findUnique: (...a: any[]) => partnerFindUnique(...a) } },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { requireActivePartnerForWrites } from '../../src/middleware/partnerStatus.middleware';
import type { AuthRequest } from '../../src/middleware/auth.middleware';
import type { Response, NextFunction } from 'express';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(method: string, role: string): AuthRequest {
  return {
    method,
    user: { id: 'user-1', role },
  } as unknown as AuthRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, json, status };
}

beforeEach(() => {
  partnerFindUnique.mockReset();
});

// ── Read-only bypass ──────────────────────────────────────────────────────────

describe('§5.3 middleware — read-only bypass', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])('passes %s through without a DB lookup', async (method) => {
    const req = makeReq(method, 'PARTNER');
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(partnerFindUnique).not.toHaveBeenCalled();
  });
});

// ── Non-PARTNER bypass ────────────────────────────────────────────────────────

describe('§5.3 middleware — admin bypass', () => {
  it.each(['ADMIN', 'SUPER_ADMIN'])('%s role bypasses gate on POST', async (role) => {
    const req = makeReq('POST', role);
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(partnerFindUnique).not.toHaveBeenCalled();
  });
});

// ── ACTIVE partner ────────────────────────────────────────────────────────────

describe('§5.3 middleware — ACTIVE partner write allowed', () => {
  it('allows POST for ACTIVE partner', async () => {
    partnerFindUnique.mockResolvedValue({ status: 'ACTIVE' });
    const req = makeReq('POST', 'PARTNER');
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ── Blocked statuses ──────────────────────────────────────────────────────────

describe('§5.3 middleware — non-ACTIVE partner write blocked', () => {
  // Spec §1.1 / MEDIUM-1: the partner-facing API exposes ONLY the canonical
  // three-value enum (Active | Inactive | Archived). Internal DB sub-types
  // (PAUSED, SUSPENDED, PENDING, REJECTED) must not leak into responses:
  //   INACTIVE / SUSPENDED / PAUSED / PENDING → 'Inactive'
  //   ARCHIVED / REJECTED                     → 'Archived'
  it.each([
    ['INACTIVE', 'Inactive'],
    ['SUSPENDED', 'Inactive'],
    ['PAUSED', 'Inactive'],
    ['PENDING', 'Inactive'],
    ['ARCHIVED', 'Archived'],
  ])(
    '%s partner POST returns 403 with PARTNER_STATUS_BLOCKED code and canonical partnerStatus=%s',
    async (rawStatus, canonicalStatus) => {
      partnerFindUnique.mockResolvedValue({ status: rawStatus });
      const req = makeReq('POST', 'PARTNER');
      const { res, status, json } = makeRes();
      const next: NextFunction = jest.fn();

      await requireActivePartnerForWrites(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'PARTNER_STATUS_BLOCKED',
          partnerStatus: canonicalStatus,
        }),
      );
    },
  );

  it('INACTIVE partner PUT is blocked', async () => {
    partnerFindUnique.mockResolvedValue({ status: 'INACTIVE' });
    const req = makeReq('PUT', 'PARTNER');
    const { res, status } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('ARCHIVED partner PATCH is blocked', async () => {
    partnerFindUnique.mockResolvedValue({ status: 'ARCHIVED' });
    const req = makeReq('PATCH', 'PARTNER');
    const { res, status } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});

// ── No partner row ────────────────────────────────────────────────────────────

describe('§5.3 middleware — no partner row', () => {
  it('fails CLOSED with 403 PARTNER_NOT_FOUND when the partner record is missing', async () => {
    // The gate now fails closed on a missing partner row instead of delegating to
    // the route: a write request with no resolvable partner must not slip through.
    partnerFindUnique.mockResolvedValue(null);
    const req = makeReq('POST', 'PARTNER');
    const { res, status, json } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'PARTNER_NOT_FOUND' }),
    );
  });
});

// ── DB error — fail CLOSED ────────────────────────────────────────────────────

describe('§5.3 middleware — DB error fails closed (503)', () => {
  it('returns 503 when prisma throws, instead of passing through', async () => {
    partnerFindUnique.mockRejectedValue(new Error('connection refused'));
    const req = makeReq('POST', 'PARTNER');
    const { res, status, json } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'PARTNER_STATUS_CHECK_FAILED' }),
    );
  });
});

// ── Unauthenticated request ───────────────────────────────────────────────────

describe('§5.3 middleware — unauthenticated request', () => {
  it('calls next() when req.user is undefined (auth middleware handles it upstream)', async () => {
    const req = { method: 'POST', user: undefined } as unknown as AuthRequest;
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    await requireActivePartnerForWrites(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(partnerFindUnique).not.toHaveBeenCalled();
  });
});
