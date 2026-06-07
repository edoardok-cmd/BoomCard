/**
 * BC-ADMIN-SPEC-CONFORM-FIX — M4 + H2 behavioural unit tests.
 *
 *   M4 — authenticate re-derives the admin read-only (aro) flag from the LIVE
 *        account status: a mid-session ACTIVE→INACTIVE downgrade flips aro=true
 *        on the live token (and an INACTIVE→ACTIVE upgrade clears a stale aro).
 *   H2 — stickerService.reactivateInactiveSticker reactivates an INACTIVE sticker
 *        only when the owning partner is operationally Active, and rejects any
 *        non-INACTIVE source state (no auto-reactivation).
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
const userFindUnique = jest.fn() as jest.Mock;
const partnerFindUnique = jest.fn() as jest.Mock;
const stickerFindUnique = jest.fn() as jest.Mock;
const stickerUpdate = jest.fn() as jest.Mock;
const userUpdate = jest.fn() as jest.Mock;

const prismaMock: any = {
  user: { findUnique: (...a: any[]) => userFindUnique(...a), update: (...a: any[]) => userUpdate(...a) },
  partner: { findUnique: (...a: any[]) => partnerFindUnique(...a) },
  sticker: { findUnique: (...a: any[]) => stickerFindUnique(...a), update: (...a: any[]) => stickerUpdate(...a) },
};

jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: prismaMock, prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/middleware/audit.middleware', () => ({ writeAudit: jest.fn(async () => {}) }));
jest.mock('../../src/services/userActivity.service', () => ({ touchUserActivity: jest.fn() }));
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: { verify: jest.fn() },
  verify: jest.fn(),
  JsonWebTokenError: class JsonWebTokenError extends Error {},
  TokenExpiredError: class TokenExpiredError extends Error {},
}));

import jwt from 'jsonwebtoken';
import { authenticate } from '../../src/middleware/auth.middleware';
import { stickerService } from '../../src/services/sticker.service';
import type { AuthRequest } from '../../src/middleware/auth.middleware';
import type { Response, NextFunction } from 'express';

process.env.JWT_SECRET = 'test-secret';

function makeReq(decoded: any): AuthRequest {
  return { headers: { authorization: 'Bearer tok' }, method: 'GET' } as unknown as AuthRequest & { user?: any } & any;
}
function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status } as unknown as Response, json, status };
}

beforeEach(() => {
  userFindUnique.mockReset();
  partnerFindUnique.mockReset();
  stickerFindUnique.mockReset();
  stickerUpdate.mockReset();
  userUpdate.mockReset();
  (jwt.verify as jest.Mock).mockReset();
});

// ── M4 — live aro re-derivation ────────────────────────────────────────────────

describe('M4 — authenticate re-derives aro from live admin status', () => {
  it('sets aro=true when a live ADMIN status is INACTIVE (no aro in JWT)', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ id: 'a1', role: 'ADMIN', iat: Math.floor(Date.now() / 1000) });
    userFindUnique.mockResolvedValue({ status: 'INACTIVE', rolesUpdatedAt: null, adminRoles: [] });
    const req = makeReq(null);
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    await authenticate(req, res, next);

    expect(req.user?.aro).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('clears a stale aro=true when the live status is back to ACTIVE', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ id: 'a1', role: 'ADMIN', aro: true, iat: Math.floor(Date.now() / 1000) });
    userFindUnique.mockResolvedValue({ status: 'ACTIVE', rolesUpdatedAt: null, adminRoles: [] });
    const req = makeReq(null);
    const { res } = makeRes();
    const next: NextFunction = jest.fn();

    await authenticate(req, res, next);

    expect(req.user?.aro).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('still hard-rejects an ARCHIVED admin (no coast)', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ id: 'a1', role: 'ADMIN', iat: Math.floor(Date.now() / 1000) });
    userFindUnique.mockResolvedValue({ status: 'ARCHIVED', rolesUpdatedAt: null, adminRoles: [] });
    const req = makeReq(null);
    const { res, status } = makeRes();
    const next: NextFunction = jest.fn();

    await authenticate(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── H2 — per-QR reactivation ────────────────────────────────────────────────────

describe('H2 — reactivateInactiveSticker', () => {
  it('reactivates an INACTIVE sticker when the partner is operationally Active', async () => {
    stickerFindUnique.mockResolvedValue({
      id: 's1',
      status: 'INACTIVE',
      venue: { partner: { status: 'ACTIVE', verifiedAt: new Date() } },
    });
    stickerUpdate.mockResolvedValue({ id: 's1', status: 'ACTIVE' });

    const out = await stickerService.reactivateInactiveSticker('STK-1', 'admin-1');

    expect(out.status).toBe('ACTIVE');
    expect(stickerUpdate).toHaveBeenCalledTimes(1);
    const arg = stickerUpdate.mock.calls[0][0];
    expect(arg.data.status).toBe('ACTIVE');
    expect(arg.data.autoDeactivatedAt).toBeNull();
  });

  it('rejects a non-INACTIVE source state (no auto-reactivation of PENDING/ACTIVE)', async () => {
    stickerFindUnique.mockResolvedValue({
      id: 's1',
      status: 'PENDING',
      venue: { partner: { status: 'ACTIVE', verifiedAt: new Date() } },
    });
    await expect(stickerService.reactivateInactiveSticker('STK-1', 'admin-1')).rejects.toThrow(/cannot be reactivated from PENDING/);
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('rejects when the owning partner is not operationally Active (e.g. still re-onboarding)', async () => {
    stickerFindUnique.mockResolvedValue({
      id: 's1',
      status: 'INACTIVE',
      venue: { partner: { status: 'ACTIVE', verifiedAt: null } }, // verifiedAt null → not operational
    });
    await expect(stickerService.reactivateInactiveSticker('STK-1', 'admin-1')).rejects.toThrow(/partner status is not Active/);
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('throws not-found for a missing sticker', async () => {
    stickerFindUnique.mockResolvedValue(null);
    await expect(stickerService.reactivateInactiveSticker('NOPE', 'admin-1')).rejects.toThrow(/not found/);
  });

  // F3 — fail CLOSED on an orphan sticker whose venue/partner cannot be resolved.
  it('rejects an orphan INACTIVE sticker with a null partner (fail-closed)', async () => {
    stickerFindUnique.mockResolvedValue({
      id: 's1',
      status: 'INACTIVE',
      venue: { partner: null }, // orphaned — partner cannot be confirmed Active
    });
    await expect(stickerService.reactivateInactiveSticker('STK-1', 'admin-1')).rejects.toThrow(/partner status is not Active/);
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('rejects an orphan INACTIVE sticker with a null venue (fail-closed)', async () => {
    stickerFindUnique.mockResolvedValue({
      id: 's1',
      status: 'INACTIVE',
      venue: null, // no venue relation at all
    });
    await expect(stickerService.reactivateInactiveSticker('STK-1', 'admin-1')).rejects.toThrow(/partner status is not Active/);
    expect(stickerUpdate).not.toHaveBeenCalled();
  });
});
