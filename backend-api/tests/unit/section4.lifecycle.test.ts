/**
 * §4 v1.1 lifecycle fix regression tests.
 *
 * Covers the six audit findings patched in this batch:
 *   1. promotePendingToCleared — wallet credited exactly once on idempotent re-entry
 *   2. expireOverdueCashback   — CLEARED precondition prevents double-debit
 *   3. clearFailedPaymentSubsForUser — audit skipped when concurrent retry wins updateMany
 *   4. approveEntry            — concurrent second click skips clearedAt extension
 *   5. requestPayout           — FAILED_PAYMENT gate throws AppError(403) with prefix
 *   6. approveScan             — verifiedAmount > 10× billAmount rejected pre-credit
 *
 * All Prisma interactions are mocked. No DB connection required.
 */

// ── Shared mutable state ─────────────────────────────────────────────────────

// walletTransaction row mutated by the lifecycle functions
let wtRow: any = null;
// wallet balance
let walletBalance = { balance: 0, availableBalance: 0 };
// updateMany return value (controllable per test)
let updateManyCount = 1;
// subscription rows returned by findMany
let subscriptionRows: any[] = [];
// subscription updateMany count
let subUpdateManyCount = 1;

// Track calls so we can assert on them
const walletUpdateCalls: any[] = [];
const auditCalls: any[] = [];
const loggerInfoCalls: string[] = [];

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => {
  const walletTransactionDelegate = {
    findUnique: jest.fn(async (args: any) => {
      if (args.where.id === wtRow?.id) return wtRow;
      return null;
    }),
    findFirst: jest.fn(async (_args: any) => null),
    findMany: jest.fn(async (_args: any) => (wtRow ? [wtRow] : [])),
    update: jest.fn(async (args: any) => {
      Object.assign(wtRow, args.data);
      return wtRow;
    }),
    updateMany: jest.fn(async (_args: any) => ({ count: updateManyCount })),
    create: jest.fn(async (args: any) => {
      const row = { id: 'wt-new', ...args.data };
      wtRow = row;
      return row;
    }),
  };
  const walletDelegate = {
    findUnique: jest.fn(async (_args: any) => ({
      id: 'wallet-1',
      userId: 'user-1',
      balance: walletBalance.balance,
      availableBalance: walletBalance.availableBalance,
      isLocked: false,
    })),
    findUniqueOrThrow: jest.fn(async (_args: any) => ({
      id: 'wallet-1',
      userId: 'user-1',
      balance: walletBalance.balance,
      availableBalance: walletBalance.availableBalance,
      isLocked: false,
      lockedReason: null,
    })),
    update: jest.fn(async (args: any) => {
      walletUpdateCalls.push({ ...args });
      const data = args.data ?? {};
      if (data.balance?.increment) walletBalance.balance += data.balance.increment;
      if (data.balance?.decrement) walletBalance.balance -= data.balance.decrement;
      if (data.availableBalance?.increment) walletBalance.availableBalance += data.availableBalance.increment;
      if (data.availableBalance?.decrement) walletBalance.availableBalance -= data.availableBalance.decrement;
      return walletBalance;
    }),
    upsert: jest.fn(async () => ({
      id: 'wallet-1',
      userId: 'user-1',
      balance: walletBalance.balance,
      availableBalance: walletBalance.availableBalance,
      isLocked: false,
    })),
  };
  const subscriptionDelegate = {
    findFirst: jest.fn(async (args: any) => {
      const status = args?.where?.status;
      if (status === 'FAILED_PAYMENT') {
        return subscriptionRows.find((s) => s.status === 'FAILED_PAYMENT') ?? null;
      }
      if (status?.in) {
        return subscriptionRows.find((s) => status.in.includes(s.status)) ?? null;
      }
      return subscriptionRows[0] ?? null;
    }),
    findMany: jest.fn(async (_args: any) => subscriptionRows.filter((s) => s.status === 'FAILED_PAYMENT')),
    updateMany: jest.fn(async (_args: any) => ({ count: subUpdateManyCount })),
  };
  const walletTransactionDelegateForTx = {
    findUnique: jest.fn(async (args: any) => {
      if (args.where.id === wtRow?.id) return wtRow;
      return null;
    }),
    update: jest.fn(async (args: any) => {
      Object.assign(wtRow, args.data);
      return wtRow;
    }),
    updateMany: jest.fn(async (_args: any) => ({ count: updateManyCount })),
  };
  const walletDelegateForTx = {
    update: jest.fn(async (args: any) => {
      walletUpdateCalls.push({ ...args });
      const data = args.data ?? {};
      if (data.balance?.increment) walletBalance.balance += data.balance.increment;
      if (data.balance?.decrement) walletBalance.balance -= data.balance.decrement;
      if (data.availableBalance?.increment) walletBalance.availableBalance += data.availableBalance.increment;
      if (data.availableBalance?.decrement) walletBalance.availableBalance -= data.availableBalance.decrement;
      return walletBalance;
    }),
    findUnique: jest.fn(async () => ({
      id: 'wallet-1',
      userId: 'user-1',
      balance: walletBalance.balance,
      availableBalance: walletBalance.availableBalance,
      isLocked: false,
    })),
    findUniqueOrThrow: jest.fn(async () => ({
      id: 'wallet-1',
      userId: 'user-1',
      balance: walletBalance.balance,
      availableBalance: walletBalance.availableBalance,
      isLocked: false,
      lockedReason: null,
    })),
  };

  const client = {
    walletTransaction: walletTransactionDelegate,
    wallet: walletDelegate,
    subscription: subscriptionDelegate,
    $transaction: jest.fn(async (fnOrArray: any) => {
      if (typeof fnOrArray === 'function') {
        return fnOrArray({
          walletTransaction: walletTransactionDelegateForTx,
          wallet: walletDelegateForTx,
        });
      }
      // Array form used by old expireOverdueCashback — kept for compat but new
      // code uses callback form.
      return Promise.all(fnOrArray);
    }),
  };
  return { __esModule: true, default: client, prisma: client };
});

// ── Audit mock ────────────────────────────────────────────────────────────────

jest.mock('../../src/middleware/audit.middleware', () => ({
  writeAudit: jest.fn(async (args: any) => {
    auditCalls.push({ ...args });
  }),
}));

// ── Logger mock ───────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn((...args: any[]) => { loggerInfoCalls.push(args.join(' ')); }),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// ── System settings mock (cashback_expiry_days = 60) ─────────────────────────

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, def: number) => def),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  promotePendingToCleared,
  expireOverdueCashback,
} from '../../src/services/cashbackLifecycle.service';
import { clearFailedPaymentSubsForUser } from '../../src/services/subscription.service';
import { approveEntry } from '../../src/services/adminCashback.service';
import { AppError } from '../../src/middleware/error.middleware';
import { WalletTransactionStatus } from '@prisma/client';
import prisma from '../../src/lib/prisma';
import { writeAudit } from '../../src/middleware/audit.middleware';

const prismaMock = prisma as any;
const writeAuditMock = writeAudit as jest.Mock;

// ─────────────────────────────────────────────────────────────────────────────
// 1. promotePendingToCleared idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('promotePendingToCleared — wallet credited once on idempotent re-entry', () => {
  beforeEach(() => {
    wtRow = {
      id: 'wt-1',
      type: 'CASHBACK_CREDIT',
      cashbackStatus: 'PENDING',
      status: 'PENDING',
      amount: 10,
      walletId: 'wallet-1',
      clearedAt: null,
    };
    walletBalance = { balance: 50, availableBalance: 50 };
    updateManyCount = 1;
    walletUpdateCalls.length = 0;
    auditCalls.length = 0;
    loggerInfoCalls.length = 0;
    jest.clearAllMocks();
  });

  it('increments wallet balance on first call', async () => {
    const result = await promotePendingToCleared({
      walletTransactionId: 'wt-1',
      actorUserId: 'admin-1',
      reason: 'test',
    });
    // wallet.update should have been called with an increment
    expect(walletUpdateCalls.length).toBeGreaterThanOrEqual(1);
    const incrementCall = walletUpdateCalls.find((c) => c.data?.balance?.increment != null);
    expect(incrementCall).toBeDefined();
    expect(incrementCall.data.balance.increment).toBe(10);
    expect(result).toBeDefined();
  });

  it('does NOT increment wallet a second time when row is already CLEARED', async () => {
    // First call transitions to CLEARED (wtRow mutates)
    await promotePendingToCleared({
      walletTransactionId: 'wt-1',
      actorUserId: 'admin-1',
      reason: 'first call',
    });
    const balanceAfterFirst = walletBalance.balance;

    walletUpdateCalls.length = 0;

    // Second call — row is now CLEARED so the transaction's early-return fires
    const result2 = await promotePendingToCleared({
      walletTransactionId: 'wt-1',
      actorUserId: 'admin-1',
      reason: 'duplicate call',
    });

    // No additional wallet update on second call
    const incrementCallsOnSecond = walletUpdateCalls.filter((c) => c.data?.balance?.increment != null);
    expect(incrementCallsOnSecond).toHaveLength(0);
    // Balance unchanged from after the first call
    expect(walletBalance.balance).toBe(balanceAfterFirst);
    expect(result2).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. expireOverdueCashback — CLEARED precondition blocks double-debit
// ─────────────────────────────────────────────────────────────────────────────

describe('expireOverdueCashback — CLEARED precondition prevents double-debit', () => {
  const now = new Date('2026-01-01T10:00:00Z');

  beforeEach(() => {
    wtRow = {
      id: 'wt-expire-1',
      type: 'CASHBACK_CREDIT',
      cashbackStatus: 'CLEARED',
      walletId: 'wallet-1',
      amount: 20,
    };
    walletBalance = { balance: 100, availableBalance: 100 };
    updateManyCount = 1;
    walletUpdateCalls.length = 0;
    auditCalls.length = 0;
    loggerInfoCalls.length = 0;
    jest.clearAllMocks();
  });

  it('decrements wallet once when updateMany returns count=1', async () => {
    // Simulate prisma.$transaction calling the cb with a tx that has updateMany
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        walletTransaction: {
          findUnique: jest.fn(async () => wtRow),
          update: jest.fn(async (args: any) => { Object.assign(wtRow, args.data); return wtRow; }),
          updateMany: jest.fn(async (_args: any) => ({ count: 1 })),
        },
        wallet: {
          update: jest.fn(async (args: any) => {
            walletUpdateCalls.push({ ...args });
            const data = args.data ?? {};
            if (data.balance?.decrement) walletBalance.balance -= data.balance.decrement;
            if (data.availableBalance?.decrement) walletBalance.availableBalance -= data.availableBalance.decrement;
            return walletBalance;
          }),
        },
      });
    });

    // Mock findMany to return our expired row
    prismaMock.walletTransaction.findMany.mockResolvedValue([{ id: 'wt-expire-1', walletId: 'wallet-1', amount: 20 }]);

    await expireOverdueCashback(null);

    const decrements = walletUpdateCalls.filter((c) => c.data?.balance?.decrement != null);
    expect(decrements).toHaveLength(1);
    expect(decrements[0].data.balance.decrement).toBe(20);
  });

  it('skips wallet.update when updateMany returns count=0 (already expired by concurrent run)', async () => {
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        walletTransaction: {
          updateMany: jest.fn(async (_args: any) => ({ count: 0 })), // already transitioned
          update: jest.fn(),
        },
        wallet: {
          update: jest.fn(async (args: any) => {
            walletUpdateCalls.push({ ...args });
            return walletBalance;
          }),
        },
      });
    });

    prismaMock.walletTransaction.findMany.mockResolvedValue([{ id: 'wt-expire-1', walletId: 'wallet-1', amount: 20 }]);

    await expireOverdueCashback(null);

    const decrements = walletUpdateCalls.filter((c) => c.data?.balance?.decrement != null);
    expect(decrements).toHaveLength(0);
    expect(walletBalance.balance).toBe(100); // unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. clearFailedPaymentSubsForUser — concurrent retry skips duplicate audits
// ─────────────────────────────────────────────────────────────────────────────

describe('clearFailedPaymentSubsForUser — audit skipped when concurrent retry wins', () => {
  beforeEach(() => {
    subscriptionRows = [
      { id: 'sub-fail-1', status: 'FAILED_PAYMENT' },
      { id: 'sub-fail-2', status: 'FAILED_PAYMENT' },
    ];
    subUpdateManyCount = 1;
    auditCalls.length = 0;
    loggerInfoCalls.length = 0;
    jest.clearAllMocks();
    writeAuditMock.mockClear();
  });

  it('writes audit rows when updateMany.count > 0', async () => {
    prismaMock.subscription.findMany.mockResolvedValue(subscriptionRows);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 2 });

    const cleared = await clearFailedPaymentSubsForUser('user-1', null, 'admin-1');

    expect(cleared).toBe(2);
    expect(writeAuditMock).toHaveBeenCalledTimes(2);
  });

  it('skips audit writes and returns 0 when updateMany.count = 0 (concurrent request won)', async () => {
    prismaMock.subscription.findMany.mockResolvedValue(subscriptionRows);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });

    const cleared = await clearFailedPaymentSubsForUser('user-1', null, null);

    expect(cleared).toBe(0);
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it('returns 0 early when findMany returns no FAILED_PAYMENT subs', async () => {
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });

    const cleared = await clearFailedPaymentSubsForUser('user-1', null, null);

    expect(cleared).toBe(0);
    expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. approveEntry — concurrent click skips clearedAt re-write
// ─────────────────────────────────────────────────────────────────────────────

describe('approveEntry — concurrent second click skips clearedAt re-write', () => {
  beforeEach(() => {
    wtRow = {
      id: 'entry-1',
      type: 'CASHBACK_CREDIT',
      cashbackStatus: 'PENDING',
      status: 'PENDING',
      amount: 15,
    };
    updateManyCount = 1;
    walletUpdateCalls.length = 0;
    auditCalls.length = 0;
    loggerInfoCalls.length = 0;
    jest.clearAllMocks();
    writeAuditMock.mockClear();
  });

  it('completes without error on first call', async () => {
    prismaMock.walletTransaction.findUnique.mockResolvedValue(wtRow);
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        walletTransaction: {
          update: jest.fn(async (args: any) => { Object.assign(wtRow, args.data); return wtRow; }),
          updateMany: jest.fn(async (_args: any) => ({ count: 1 })),
        },
      });
    });

    await expect(approveEntry('entry-1', 'admin-1')).resolves.toBeUndefined();
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CASHBACK_CLEARED' }),
    );
  });

  it('does not throw and logs "already CLEARED" when updateMany.count = 0', async () => {
    prismaMock.walletTransaction.findUnique.mockResolvedValue({
      ...wtRow,
      cashbackStatus: 'PENDING', // still PENDING in outer read
    });

    const txUpdateMany = jest.fn(async (_args: any) => ({ count: 0 }));
    const txUpdate = jest.fn(async (args: any) => { Object.assign(wtRow, args.data); return wtRow; });

    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        walletTransaction: { update: txUpdate, updateMany: txUpdateMany },
      });
    });

    const { logger } = require('../../src/utils/logger');

    await expect(approveEntry('entry-1', 'admin-1')).resolves.toBeUndefined();
    // Should log the "already CLEARED" message
    const infoCall = (logger.info as jest.Mock).mock.calls.find((c: any[]) =>
      c[0]?.includes?.('already CLEARED')
    );
    expect(infoCall).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. requestPayout — FAILED_PAYMENT gate throws AppError(403) with prefix
// ─────────────────────────────────────────────────────────────────────────────

describe('requestPayout — FAILED_PAYMENT gate throws AppError(403)', () => {
  beforeEach(() => {
    walletBalance = { balance: 200, availableBalance: 200 };
    walletUpdateCalls.length = 0;
    jest.clearAllMocks();
  });

  it('throws AppError with statusCode=403 and SUBSCRIPTION_FAILED_PAYMENT prefix', async () => {
    // Latest sub is FAILED_PAYMENT
    prismaMock.subscription.findFirst
      .mockResolvedValueOnce({ status: 'FAILED_PAYMENT' }); // latestSub query

    // Import inside test to get fresh module (mocks are already set up)
    const { walletService } = await import('../../src/services/wallet.service');

    let caught: any = null;
    try {
      await walletService.requestPayout('user-1', {});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(403);
    expect((caught as AppError).message).toMatch(/^SUBSCRIPTION_FAILED_PAYMENT:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. approveScan — verifiedAmount > 10× billAmount is rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('approveScan — verifiedAmount upper-bound guard', () => {
  const baseScan = {
    id: 'scan-1',
    userId: 'user-1',
    venueId: 'venue-1',
    stickerId: 'sticker-1',
    cardId: 'card-1',
    billAmount: 100,
    cashbackPercent: 5,
    cashbackAmount: 5,
    status: 'MANUAL_REVIEW',
    fraudScore: 0,
    processedAt: null,
    verifiedAmount: null,
    sticker: { location: { name: 'Test Location' }, venue: {} },
    user: {},
    card: {},
    venue: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.stickerScan = {
      findUnique: jest.fn(async () => baseScan),
      update: jest.fn(async () => baseScan),
      updateMany: jest.fn(async () => ({ count: 1 })),
    };
  });

  it('throws when verifiedAmount exceeds 10× the scanned bill amount', async () => {
    const { stickerService } = await import('../../src/services/sticker.service');

    await expect(
      stickerService.approveScan('scan-1', { verifiedAmount: 1001, adminUserId: 'admin-1' })
    ).rejects.toThrow(/10×/);
  });

  it('accepts a verifiedAmount at exactly 10× (edge case)', async () => {
    // 10 × 100 = 1000 — should NOT throw the upper-bound error
    // (it may throw for other reasons like wallet check, but not the bound error)
    const { stickerService } = await import('../../src/services/sticker.service');

    let thrownMessage: string | null = null;
    try {
      await stickerService.approveScan('scan-1', { verifiedAmount: 1000, adminUserId: 'admin-1' });
    } catch (e: any) {
      thrownMessage = e.message ?? '';
    }

    if (thrownMessage) {
      expect(thrownMessage).not.toMatch(/10×/);
    }
  });

  it('accepts verifiedAmount below billAmount (downward correction)', async () => {
    const { stickerService } = await import('../../src/services/sticker.service');

    let thrownMessage: string | null = null;
    try {
      await stickerService.approveScan('scan-1', { verifiedAmount: 50, adminUserId: 'admin-1' });
    } catch (e: any) {
      thrownMessage = e.message ?? '';
    }

    if (thrownMessage) {
      expect(thrownMessage).not.toMatch(/10×/);
    }
  });
});
