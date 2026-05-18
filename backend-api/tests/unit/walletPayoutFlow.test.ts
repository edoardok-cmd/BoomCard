/**
 * Unit tests for §6.1 v1.1 payout flow refactor.
 *
 * Covers:
 *   - requestPayout enqueues PENDING (not PROCESSING) and does not fire Paysera
 *   - executePayoutTransfer transitions PENDING → PROCESSING atomically
 *   - executePayoutTransfer is idempotent: a second call returns alreadyProcessed
 *     WITHOUT re-firing Paysera (prevents double-credit on the failure path)
 *   - executePayoutTransfer with no Paysera config leaves the row PROCESSING
 *     for manual completion
 *   - executePayoutTransfer rejects FAILED rows so a reverted payout can't be
 *     re-fired by accident
 *   - On Paysera failure: balance is restored exactly once and an ADJUSTMENT
 *     audit row is created with correct sign and balance pre/post values
 *   - Concurrent execute calls on the same PENDING row never double-fire Paysera
 *     or double-credit the wallet
 *
 * Prisma is fully mocked; Paysera is mocked.  No DB connection is required.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

const txCreated: any[] = [];
const txUpdated: any[] = [];
let walletStore: any = {
  id: 'wallet-1',
  userId: 'user-1',
  balance: 100,
  availableBalance: 100,
  pendingBalance: 0,
  currency: 'BGN',
  isLocked: false,
  payoutIban: 'BG80BNBG96611020345678',
  payoutBeneficiaryName: 'Ivan Ivanov',
};
let inflightExisting: any = null; // set per-test to simulate existing PENDING/PROCESSING

jest.mock('../../src/lib/prisma', () => {
  const txDelegate = {
    findFirst: jest.fn(async (_args: any) => inflightExisting),
    // Spec §4.4 v1.1 — requestPayout now scans for CLEARED CASHBACK_CREDIT
    // rows to mark them LOCKED. The unit test fixture has no cashback rows so
    // returning an empty array is correct here.
    findMany: jest.fn(async (_args: any) => [] as any[]),
    findUnique: jest.fn(async (args: any) => {
      const id = args.where?.id;
      const base = txCreated.find((t) => t.id === id);
      if (!base) return null;
      const lastUpdate = [...txUpdated].reverse().find((t) => t.id === id);
      const merged = { ...base, ...(lastUpdate ?? {}) };
      // Honor `include: { wallet: true }` (used by executePayoutTransfer).
      if (args.include?.wallet) return { ...merged, wallet: walletStore };
      return merged;
    }),
    update: jest.fn(async (args: any) => {
      const stamp = { id: args.where.id, ...args.data };
      txUpdated.push(stamp);
      return stamp;
    }),
    updateMany: jest.fn(async (args: any) => {
      // For the PENDING → PROCESSING precondition we simulate a successful update.
      const id = args.where.id;
      const required = args.where.status;
      const row = txCreated.find((t) => t.id === id);
      if (!row) return { count: 0 };
      if (required && row.status !== required) return { count: 0 };
      Object.assign(row, args.data);
      return { count: 1 };
    }),
    create: jest.fn(async (args: any) => {
      const created = { id: `tx-${txCreated.length + 1}`, ...args.data };
      txCreated.push(created);
      return created;
    }),
  };
  const applyField = (field: 'balance' | 'availableBalance' | 'pendingBalance', value: any) => {
    if (value && typeof value === 'object') {
      if (typeof value.increment === 'number') walletStore[field] += value.increment;
      else if (typeof value.decrement === 'number') walletStore[field] -= value.decrement;
      else if (typeof value.set === 'number') walletStore[field] = value.set;
    } else if (typeof value === 'number') {
      walletStore[field] = value;
    }
  };
  const walletDelegate = {
    upsert: jest.fn(async () => walletStore),
    update: jest.fn(async (args: any) => {
      const data = args.data ?? {};
      // Apply numeric ops on tracked fields, then plain scalar fields.
      for (const f of ['balance', 'availableBalance', 'pendingBalance'] as const) {
        if (f in data) applyField(f, data[f]);
      }
      for (const [k, v] of Object.entries(data)) {
        if (['balance', 'availableBalance', 'pendingBalance'].includes(k)) continue;
        (walletStore as any)[k] = v;
      }
      return walletStore;
    }),
    findUniqueOrThrow: jest.fn(async () => walletStore),
    findUnique: jest.fn(async () => walletStore),
  };
  const subscriptionDelegate = {
    findFirst: jest.fn(async (args: any) => {
      const where = args?.where ?? {};
      if (where.status === 'FAILED_PAYMENT') return null;
      // For the ACTIVE/TRIALING lookup return an ACTIVE subscription.
      return { id: 'sub-1', plan: 'BASIC', status: 'ACTIVE', createdAt: new Date() };
    }),
  };
  const client = {
    walletTransaction: txDelegate,
    wallet: walletDelegate,
    subscription: subscriptionDelegate,
    $transaction: async (fn: any) => fn({
      walletTransaction: txDelegate,
      wallet: walletDelegate,
      subscription: subscriptionDelegate,
    }),
  };
  // wallet.service.ts uses both `import prisma from '../lib/prisma'` (default)
  // and other modules import the named `prisma`.  Provide both.
  return { __esModule: true, prisma: client, default: client };
});

jest.mock('../../src/services/paysera.service', () => ({
  payseraService: {
    isTransferConfigured: jest.fn(() => false),
    createTransfer: jest.fn(async () => ({ id: 'paysera-transfer-1' })),
    reserveTransfer: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {
    notifyPayoutReady: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => undefined),
}));

jest.mock('../../src/utils/payoutThreshold', () => ({
  getPayoutThresholdBGN: jest.fn(async () => 20),
}));

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_k: string, fallback: number) => fallback),
}));

jest.mock('../../src/jobs/scheduler', () => ({
  expireWallet: jest.fn(async () => 0),
}));

// Quiet down winston logging during tests
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { walletService } from '../../src/services/wallet.service';

beforeEach(() => {
  txCreated.length = 0;
  txUpdated.length = 0;
  walletStore = {
    id: 'wallet-1',
    userId: 'user-1',
    balance: 100,
    availableBalance: 100,
    pendingBalance: 0,
    currency: 'BGN',
    isLocked: false,
    payoutIban: 'BG80BNBG96611020345678',
    payoutBeneficiaryName: 'Ivan Ivanov',
  };
  inflightExisting = null;
  // Reset call counters on the Paysera spies so per-test expectations on
  // createTransfer / reserveTransfer call counts don't leak across cases.
  const { payseraService } = jest.requireMock('../../src/services/paysera.service');
  payseraService.isTransferConfigured.mockReset();
  payseraService.isTransferConfigured.mockReturnValue(false);
  payseraService.createTransfer.mockReset();
  payseraService.createTransfer.mockResolvedValue({ id: 'paysera-transfer-1' });
  payseraService.reserveTransfer.mockReset();
  payseraService.reserveTransfer.mockResolvedValue(undefined);
});

// Latest mutation observed via Prisma .update() for a given row id.
function latestUpdate(id: string): any | undefined {
  return [...txUpdated].reverse().find((t) => t.id === id);
}

describe('§6.1 v1.1 requestPayout (subscriber-facing)', () => {
  it('enqueues WITHDRAWAL in PENDING (not PROCESSING) and does not fire Paysera', async () => {
    const result = await walletService.requestPayout('user-1');
    expect(result.status).toBe('PENDING');
    expect(result.amount).toBe(100);
    expect(result.currency).toBe('BGN');

    expect(txCreated).toHaveLength(1);
    const tx = txCreated[0];
    expect(tx.type).toBe('WITHDRAWAL');
    expect(tx.status).toBe('PENDING');
    expect(tx.amount).toBe(-100);

    // Balance is debited so the user can't double-request while the row waits for review.
    expect(walletStore.availableBalance).toBe(0);
    expect(walletStore.balance).toBe(0);

    // Paysera should NOT have been invoked — that's the admin /approve responsibility now.
    // (Mock asserts via getMock — but Paysera is also gated on isTransferConfigured() returning false here.)
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    expect(payseraService.createTransfer).not.toHaveBeenCalled();
  });

  it('rejects when a PENDING withdrawal already exists for the wallet', async () => {
    inflightExisting = { id: 'existing-pending', status: 'PENDING' };
    await expect(walletService.requestPayout('user-1')).rejects.toThrow(/already pending/i);
  });

  it('rejects when a PROCESSING withdrawal already exists for the wallet', async () => {
    inflightExisting = { id: 'existing-processing', status: 'PROCESSING' };
    await expect(walletService.requestPayout('user-1')).rejects.toThrow(/already pending|in processing/i);
  });
});

describe('§6.1 v1.1 executePayoutTransfer (admin /approve helper)', () => {
  it('transitions PENDING → PROCESSING atomically when Paysera is not configured', async () => {
    // Seed a PENDING row by going through requestPayout
    await walletService.requestPayout('user-1');
    const pending = txCreated[0];
    expect(pending.status).toBe('PENDING');

    const result = await walletService.executePayoutTransfer(pending.id);
    expect(result.alreadyProcessed).toBeUndefined();
    expect(result.amount).toBe(100);
    expect(pending.status).toBe('PROCESSING');

    // Paysera disabled → no transfer fired
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    expect(payseraService.createTransfer).not.toHaveBeenCalled();
  });

  it('stamps metadata.manualHold=true when Paysera is not configured (admin /complete required)', async () => {
    // The no-Paysera branch parks the row in PROCESSING expecting an admin
    // /complete. /reset-stuck must refuse those rows, so executePayoutTransfer
    // tags them with manualHold:true to make the intent explicit.
    //
    // manualHold is now written in the same atomic updateMany as the
    // PENDING→PROCESSING transition (not a separate update call), so we read
    // it from the in-place-mutated txCreated row, not from txUpdated/latestUpdate.
    await walletService.requestPayout('user-1');
    const pending = txCreated[0];

    await walletService.executePayoutTransfer(pending.id);

    // The updateMany mock mutates txCreated[0] in place; read back directly.
    expect(typeof pending.metadata).toBe('string');
    const meta = JSON.parse(pending.metadata);
    expect(meta.manualHold).toBe(true);
    expect(meta.processingStartedAt).toBeTruthy();

    // No separate prisma.update should have been called for this path.
    expect(latestUpdate(pending.id)).toBeUndefined();
  });

  it('is idempotent: a second invocation reports alreadyProcessed without re-firing Paysera', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    payseraService.isTransferConfigured.mockReturnValue(true);

    await walletService.requestPayout('user-1');
    const pending = txCreated[0];

    const first = await walletService.executePayoutTransfer(pending.id);
    expect(first.alreadyProcessed).toBeUndefined();
    expect(pending.status).toBe('PROCESSING');
    expect(payseraService.createTransfer).toHaveBeenCalledTimes(1);

    // Second call — row is now PROCESSING. The helper must short-circuit and
    // return alreadyProcessed WITHOUT calling Paysera again (which is what
    // protects against the catch-block double-credit if Paysera retried-fail).
    const second = await walletService.executePayoutTransfer(pending.id);
    expect(second.alreadyProcessed).toBe(true);
    expect(second.amount).toBe(100);
    expect(payseraService.createTransfer).toHaveBeenCalledTimes(1);

    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('rejects FAILED rows so a reverted payout cannot be silently re-fired', async () => {
    await walletService.requestPayout('user-1');
    const pending = txCreated[0];
    pending.status = 'FAILED';

    await expect(walletService.executePayoutTransfer(pending.id)).rejects.toThrow(/only PENDING can be executed/i);
  });

  it('fires Paysera when configured and stamps payseraTransferId in metadata', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    payseraService.isTransferConfigured.mockReturnValue(true);

    await walletService.requestPayout('user-1');
    const pending = txCreated[0];

    const result = await walletService.executePayoutTransfer(pending.id);
    expect(result.transferId).toBe('paysera-transfer-1');
    expect(payseraService.createTransfer).toHaveBeenCalledTimes(1);
    expect(payseraService.reserveTransfer).toHaveBeenCalledWith('paysera-transfer-1');

    // Reset for the next test
    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('reverses balance and creates an ADJUSTMENT with correct sign when Paysera fails', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    payseraService.createTransfer.mockRejectedValueOnce(new Error('Paysera 503 — unavailable'));

    await walletService.requestPayout('user-1');
    const pending = txCreated[0];
    expect(walletStore.balance).toBe(0);
    expect(walletStore.availableBalance).toBe(0);

    await expect(walletService.executePayoutTransfer(pending.id))
      .rejects.toThrow(/Payout could not be processed/i);

    // Balance restored exactly once
    expect(walletStore.balance).toBe(100);
    expect(walletStore.availableBalance).toBe(100);

    // WITHDRAWAL row is FAILED (read the latest update in the audit log; the
    // mock's txDelegate.update writes to txUpdated rather than mutating the
    // txCreated row in place).
    expect(latestUpdate(pending.id)?.status).toBe('FAILED');

    // ADJUSTMENT row exists with correct sign (positive = credit-back) and balances
    const adjustment = txCreated.find((t) => t.type === 'ADJUSTMENT');
    expect(adjustment).toBeDefined();
    expect(adjustment.amount).toBe(100);
    expect(adjustment.balanceBefore).toBe(0);
    expect(adjustment.balanceAfter).toBe(100);
    expect(adjustment.status).toBe('COMPLETED');

    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('does not double-credit when two concurrent execute calls race on the same PENDING row', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    payseraService.createTransfer.mockResolvedValue({ id: 'paysera-transfer-race' });
    payseraService.reserveTransfer.mockResolvedValue(undefined);

    await walletService.requestPayout('user-1');
    const pending = txCreated[0];
    expect(walletStore.balance).toBe(0);

    const balanceBefore = walletStore.balance;
    const [a, b] = await Promise.all([
      walletService.executePayoutTransfer(pending.id),
      walletService.executePayoutTransfer(pending.id),
    ]);

    // Exactly one of the two won the transition; the other reports alreadyProcessed.
    const winners = [a, b].filter((r) => !r.alreadyProcessed);
    const losers = [a, b].filter((r) => r.alreadyProcessed);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    // Paysera fired exactly once.
    expect(payseraService.createTransfer).toHaveBeenCalledTimes(1);

    // Balance NEVER drifted from the debited baseline (no double-credit, no double-debit).
    expect(walletStore.balance).toBe(balanceBefore);

    // No ADJUSTMENT row was created (no reversal path taken).
    const adjustments = txCreated.filter((t) => t.type === 'ADJUSTMENT');
    expect(adjustments).toHaveLength(0);

    payseraService.isTransferConfigured.mockReturnValue(false);
  });
});
