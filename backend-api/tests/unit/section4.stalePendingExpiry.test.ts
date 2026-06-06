/**
 * Tests for expireStalePendingCashback (Spec §5 / §8.2 — "Pending cashback NEVER expires")
 *
 * The cashback-lifecycle refactor disabled this function per spec §5 / §8.2:
 *   "Pending cashback NEVER expires — only Cleared cashback has a 60-day
 *    countdown (from clearedAt)."
 *
 * expireStalePendingCashback() is now an intentional TRUE no-op that RESOLVES
 * with { count: 0 } (it does NOT throw). Rationale: the 2:05 AM
 * `stale-pending-cashback-expiry` cron (scheduler.ts) routes any rejection into
 * alertSchedulerFailure, so a throwing-but-disabled job paged ops every single
 * night. Returning { count: 0 } reports a clean run (zero entries modified) and
 * keeps the cron registration in case the spec position changes.
 *
 * These tests pin the disabled contract so the function cannot silently regain
 * Pending-expiry behaviour (which would violate the earned-rights model):
 *   1. It resolves with { count: 0 } for any actor argument (no false alerts).
 *   2. It never reads or writes the database (no findMany / updateMany).
 *   3. It never writes an audit entry (no Pending entry is modified).
 */

// ── Shared mutable state ──────────────────────────────────────────────────────

const auditCalls: any[] = [];

// ── Prisma mock ───────────────────────────────────────────────────────────────
// Delegates throw if touched — the disabled function must not reach the DB at all.

jest.mock('../../src/lib/prisma', () => {
  const explode = (name: string) =>
    jest.fn(async () => {
      throw new Error(`prisma.walletTransaction.${name} must not be called by the disabled expireStalePendingCashback`);
    });
  const client = {
    walletTransaction: {
      findMany: explode('findMany'),
      updateMany: explode('updateMany'),
    },
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async (args: any) => { auditCalls.push(args); }),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { expireStalePendingCashback } from '../../src/services/cashbackLifecycle.service';
import { prisma } from '../../src/lib/prisma';

type AnyMock = jest.Mock;
const mp = prisma as unknown as {
  walletTransaction: { findMany: AnyMock; updateMany: AnyMock };
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('expireStalePendingCashback — disabled per spec §5 (Pending never expires)', () => {
  beforeEach(() => {
    auditCalls.length = 0;
    jest.clearAllMocks();
  });

  it('resolves with { count: 0 } (does NOT throw) when called with a null actor', async () => {
    await expect(expireStalePendingCashback(null)).resolves.toEqual({ count: 0 });
  });

  it('resolves with { count: 0 } when called with a concrete actor id', async () => {
    await expect(expireStalePendingCashback('admin-1')).resolves.toEqual({ count: 0 });
  });

  it('never rejects — a disabled job must not trip the scheduler failure alert', async () => {
    await expect(expireStalePendingCashback(null)).resolves.not.toThrow;
    await expect(expireStalePendingCashback('admin-1')).resolves.toBeDefined();
  });

  it('never touches the database — no findMany / updateMany call', async () => {
    await expireStalePendingCashback(null);
    expect(mp.walletTransaction.findMany).not.toHaveBeenCalled();
    expect(mp.walletTransaction.updateMany).not.toHaveBeenCalled();
  });

  it('never writes an audit entry (no Pending entry is modified)', async () => {
    await expireStalePendingCashback(null);
    expect(auditCalls).toHaveLength(0);
  });
});
