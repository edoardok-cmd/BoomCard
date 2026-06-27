/**
 * BC-ADMIN-SPEC-REAUDIT7-VOID-PAID-GUARD-1
 *
 * LOW finding (Unit C r1): voiding a PAID cashback entry returned HTTP 500
 * because voidEntry had no explicit PAID guard and fell through to
 * cashbackLifecycle.markVoided, which throws a plain Error (no .statusCode).
 * The route's `error.statusCode ?? 500` then surfaced it as a server fault.
 *
 * Fix: added an explicit AppError(400) guard in voidEntry after the VOIDED check,
 * mirroring the EXPIRED/VOIDED/TRIAL_PENDING guards already present.
 *
 * Invariant: INV-SM-CASH-009 (PAID is terminal — §1.3).
 */

// ── Mutable shared state ─────────────────────────────────────────────────────

let wtRow: any = null;
const walletUpdateCalls: any[] = [];

// ── Prisma mock ──────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const client = {
    walletTransaction: {
      findUnique: jest.fn(async (args: any) => {
        if (args?.where?.id === wtRow?.id) return wtRow;
        return null;
      }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    wallet: {
      update: jest.fn(async (args: any) => {
        walletUpdateCalls.push({ ...args });
        return {};
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(client)),
  };
  return { __esModule: true, default: client, prisma: client };
});

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async () => {}),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from '../../src/lib/prisma';
import { voidEntry } from '../../src/services/adminCashback.service';
import { AppError } from '../../src/middleware/error.middleware';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePaidEntry(overrides: Record<string, any> = {}) {
  return {
    id: 'wt-paid-1',
    type: 'CASHBACK_CREDIT',
    status: 'COMPLETED',
    cashbackStatus: 'PAID',
    walletId: 'wallet-1',
    amount: 50,
    ...overrides,
  };
}

function resetState(entry: any) {
  wtRow = { ...entry };
  walletUpdateCalls.length = 0;
  jest.clearAllMocks();
  // Re-point findUnique at the fresh row after clearAllMocks
  (prisma.walletTransaction.findUnique as jest.Mock).mockImplementation(async (args: any) => {
    if (args?.where?.id === wtRow?.id) return wtRow;
    return null;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BC-ADMIN-SPEC-REAUDIT7-VOID-PAID-GUARD-1 — voidEntry rejects PAID entry with HTTP 400', () => {
  beforeEach(() => {
    const entry = makePaidEntry();
    resetState(entry);
  });

  it('throws AppError with status 400 when cashbackStatus is PAID', async () => {
    await expect(voidEntry('wt-paid-1', 'admin-1', 'DUPLICATE: duplicate receipt')).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/PAID.*terminal|terminal.*PAID/i),
    });
  });

  it('throws an AppError (not a plain Error) so the route maps it to 4xx not 500', async () => {
    let caught: unknown;
    try {
      await voidEntry('wt-paid-1', 'admin-1', 'DUPLICATE: duplicate receipt');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(400);
  });

  it('does NOT mutate the wallet when a PAID void is rejected', async () => {
    await expect(
      voidEntry('wt-paid-1', 'admin-1', 'DUPLICATE: duplicate receipt'),
    ).rejects.toThrow();
    expect(walletUpdateCalls).toHaveLength(0);
    expect((prisma.walletTransaction.update as jest.Mock)).not.toHaveBeenCalled();
    expect((prisma.walletTransaction.updateMany as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does NOT open a $transaction when a PAID void is rejected', async () => {
    await expect(
      voidEntry('wt-paid-1', 'admin-1', 'DUPLICATE: duplicate receipt'),
    ).rejects.toThrow();
    expect((prisma.$transaction as jest.Mock)).not.toHaveBeenCalled();
  });
});
