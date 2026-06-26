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
// The payout owner. requestPayout() reads `status` (F-001 INACTIVE gate, spec §1.2)
// and the shared two-strike risk helper reads/writes `riskScore` / `riskBucket`.
let userStore: any = {
  id: 'user-1',
  status: 'ACTIVE',
  riskScore: 0,
  riskBucket: null,
};

jest.mock('../../src/lib/prisma', () => {
  const txDelegate = {
    findFirst: jest.fn(async (_args: any) => inflightExisting),
    // Spec §4.4 v1.1 — requestPayout scans for CLEARED CASHBACK_CREDIT rows to
    // mark them LOCKED (those always return []). The strike-count query uses
    // type=WITHDRAWAL with status.in=[FAILED,RISK_HOLD] and needs real rows so
    // F-014 second-failure escalation and no-IBAN-hold exclusion tests work.
    findMany: jest.fn(async (args: any) => {
      const w = args?.where ?? {};
      if (
        w.type === 'WITHDRAWAL' &&
        w.status &&
        typeof w.status === 'object' &&
        Array.isArray(w.status.in)
      ) {
        return txCreated
          .filter((t) => {
            const last = [...txUpdated].reverse().find((u: any) => u.id === t.id);
            const eff = { ...t, ...(last ?? {}) };
            if (w.walletId !== undefined && eff.walletId !== w.walletId) return false;
            if (!w.status.in.includes(eff.status)) return false;
            return true;
          })
          .map((t) => {
            const last = [...txUpdated].reverse().find((u: any) => u.id === t.id);
            const eff = { ...t, ...(last ?? {}) };
            return { metadata: eff.metadata ?? null, description: eff.description ?? null };
          });
      }
      return [];
    }),
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
    // F-014 payout-failure escalation counts prior FAILED withdrawals for the
    // wallet. Effective status = latest txUpdated stamp merged over the created
    // row (the reversal marks the row FAILED via update(), which lands in
    // txUpdated rather than mutating txCreated in place).
    count: jest.fn(async (args: any) => {
      const w = args?.where ?? {};
      return txCreated.filter((t) => {
        const last = [...txUpdated].reverse().find((u) => u.id === t.id);
        const eff = { ...t, ...(last ?? {}) };
        if (w.walletId !== undefined && eff.walletId !== w.walletId) return false;
        if (w.type !== undefined && eff.type !== w.type) return false;
        if (w.status !== undefined) {
          // status may be a scalar or a Prisma `{ in: [...] }` operator (the
          // strike-count query filters FAILED + RISK_HOLD via `in`).
          if (w.status && typeof w.status === 'object' && Array.isArray(w.status.in)) {
            if (!w.status.in.includes(eff.status)) return false;
          } else if (eff.status !== w.status) {
            return false;
          }
        }
        return true;
      }).length;
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
  // requestPayout() reads user.status (INACTIVE gate); the shared two-strike risk
  // helper reads riskScore and writes riskScore/riskBucket via updateMany.
  const userDelegate = {
    findUnique: jest.fn(async (args: any) => {
      if (args.where?.id !== userStore.id) return null;
      const select = args.select as Record<string, boolean> | undefined;
      if (!select) return { ...userStore };
      const picked: any = {};
      for (const k of Object.keys(select)) if (select[k]) picked[k] = userStore[k];
      return picked;
    }),
    updateMany: jest.fn(async (args: any) => {
      if (args.where?.id !== userStore.id) return { count: 0 };
      Object.assign(userStore, args.data);
      return { count: 1 };
    }),
  };
  const client = {
    walletTransaction: txDelegate,
    wallet: walletDelegate,
    subscription: subscriptionDelegate,
    user: userDelegate,
    $transaction: async (fn: any) => fn({
      walletTransaction: txDelegate,
      wallet: walletDelegate,
      subscription: subscriptionDelegate,
      user: userDelegate,
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
    // F-014 payout-failure escalation (spec §7.4): first failure notifies the
    // user to correct their IBAN; second+ failure notifies admin ops.
    notifyPayoutFailedInvalidIban: jest.fn(async () => undefined),
    // Second+ failure with a non-IBAN cause: generic "could not be processed"
    // notice (mirrors notifyPayoutFailedInvalidIban). Added when wallet.service
    // gained the generic-failure branch.
    notifyPayoutFailedGeneric: jest.fn(async () => undefined),
    notifyPayoutHeldNoIban: jest.fn(async () => undefined),
    notifyAdminOps: jest.fn(async () => undefined),
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
  userStore = {
    id: 'user-1',
    status: 'ACTIVE',
    riskScore: 0,
    riskBucket: null,
  };
  // Reset call counters on the Paysera spies so per-test expectations on
  // createTransfer / reserveTransfer call counts don't leak across cases.
  const { payseraService } = jest.requireMock('../../src/services/paysera.service');
  payseraService.isTransferConfigured.mockReset();
  payseraService.isTransferConfigured.mockReturnValue(false);
  payseraService.createTransfer.mockReset();
  payseraService.createTransfer.mockResolvedValue({ id: 'paysera-transfer-1' });
  payseraService.reserveTransfer.mockReset();
  payseraService.reserveTransfer.mockResolvedValue(undefined);
  // Notification spies are module-level — clear call history so the F-014
  // first-vs-second-failure assertions below don't see leaked calls.
  const { notificationService } = jest.requireMock('../../src/services/notification.service');
  notificationService.notifyPayoutReady.mockClear();
  notificationService.notifyPayoutFailedInvalidIban.mockClear();
  notificationService.notifyPayoutFailedGeneric.mockClear();
  notificationService.notifyPayoutHeldNoIban.mockClear();
  notificationService.notifyAdminOps.mockClear();
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

  it('F-014 first payout failure notifies the user to correct their IBAN (spec §7.4), with no risk escalation', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    // L1 classifier: an IBAN-indicating failure reason routes to IBAN-correction
    // wording (notifyPayoutFailedInvalidIban), matching this test's intent.
    payseraService.createTransfer.mockRejectedValueOnce(new Error('Invalid IBAN — beneficiary account rejected'));

    await walletService.requestPayout('user-1');
    const pending = txCreated.find((t) => t.status === 'PENDING' && t.type === 'WITHDRAWAL');

    await expect(walletService.executePayoutTransfer(pending.id))
      .rejects.toThrow(/Payout could not be processed/i);

    // Exactly one FAILED withdrawal (the one just reversed) → first-failure branch.
    expect(notificationService.notifyPayoutFailedInvalidIban).toHaveBeenCalledWith('user-1');
    expect(notificationService.notifyPayoutFailedGeneric).not.toHaveBeenCalled();
    expect(notificationService.notifyAdminOps).not.toHaveBeenCalled();
    // A first failure must not touch the risk profile.
    expect(userStore.riskScore).toBe(0);
    expect(userStore.riskBucket).toBeNull();

    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('F-014 second payout failure escalates the user to HIGH risk, riskScore floored at 51 (spec §2.1/§7.4)', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    payseraService.createTransfer.mockRejectedValueOnce(new Error('Paysera 503 — unavailable'));

    // Seed a prior FAILED withdrawal on this wallet so the new failure is the 2nd strike.
    txCreated.push({ id: 'prior-failed', walletId: 'wallet-1', type: 'WITHDRAWAL', status: 'FAILED', amount: -50 });

    await walletService.requestPayout('user-1');
    const pending = txCreated.find((t) => t.status === 'PENDING' && t.type === 'WITHDRAWAL');

    await expect(walletService.executePayoutTransfer(pending.id))
      .rejects.toThrow(/Payout could not be processed/i);

    // Two FAILED withdrawals now (seeded + just-reversed) → second-failure branch.
    // The shared two-strike helper floors riskScore at 51 (canonical HIGH boundary per §2.1)
    // and sets the HIGH bucket; it must NOT inflate unbounded.
    expect(userStore.riskScore).toBe(51);
    expect(userStore.riskBucket).toBe('HIGH_51_PLUS');
    expect(notificationService.notifyAdminOps).toHaveBeenCalled();
    // Second failure does NOT notify the user (spec §7.4).
    expect(notificationService.notifyPayoutFailedInvalidIban).not.toHaveBeenCalled();

    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('F-014 escalation never downgrades a higher existing riskScore (Math.max floor)', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    payseraService.createTransfer.mockRejectedValueOnce(new Error('Paysera 503 — unavailable'));

    userStore.riskScore = 85; // already higher than the 61 floor
    txCreated.push({ id: 'prior-failed', walletId: 'wallet-1', type: 'WITHDRAWAL', status: 'FAILED', amount: -50 });

    await walletService.requestPayout('user-1');
    const pending = txCreated.find((t) => t.status === 'PENDING' && t.type === 'WITHDRAWAL');

    await expect(walletService.executePayoutTransfer(pending.id))
      .rejects.toThrow(/Payout could not be processed/i);

    // Existing score 85 > 61 floor → preserved, not downgraded.
    expect(userStore.riskScore).toBe(85);
    expect(userStore.riskBucket).toBe('HIGH_51_PLUS');

    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('F-014 no-IBAN RISK_HOLD does not count as a strike — genuine first failure takes first-failure branch (spec §3.7)', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    payseraService.createTransfer.mockRejectedValueOnce(new Error('Invalid IBAN'));

    // Seed a prior RISK_HOLD stamped with noIbanHold=true (written by the no-IBAN
    // hold path in adminPayouts.routes.ts).  This must NOT count as a strike.
    txCreated.push({
      id: 'prior-no-iban-hold',
      walletId: 'wallet-1',
      type: 'WITHDRAWAL',
      status: 'RISK_HOLD',
      amount: -50,
      metadata: JSON.stringify({ noIbanHold: true }),
    });

    await walletService.requestPayout('user-1');
    const pending = txCreated.find((t) => t.status === 'PENDING' && t.type === 'WITHDRAWAL');

    await expect(walletService.executePayoutTransfer(pending.id))
      .rejects.toThrow(/Payout could not be processed/i);

    // noIbanHold row excluded from strike count → this is the FIRST genuine failure:
    // riskBucket must NOT be elevated and user must be notified to correct their IBAN.
    expect(userStore.riskBucket).toBeNull();
    expect(userStore.riskScore).toBe(0);
    expect(notificationService.notifyPayoutFailedInvalidIban).toHaveBeenCalled();
    expect(notificationService.notifyAdminOps).not.toHaveBeenCalled();

    payseraService.isTransferConfigured.mockReturnValue(false);
  });

  it('F-014 legacy no-IBAN RISK_HOLD (no metadata flag, pre-fix description) does not count as a strike', async () => {
    const { payseraService } = jest.requireMock('../../src/services/paysera.service');
    const { notificationService } = jest.requireMock('../../src/services/notification.service');
    payseraService.isTransferConfigured.mockReturnValue(true);
    payseraService.createTransfer.mockRejectedValueOnce(new Error('Invalid IBAN'));

    // Simulate a legacy row: RISK_HOLD with NO metadata flag (written before this fix)
    // but with the canonical no-IBAN hold description.
    txCreated.push({
      id: 'prior-legacy-no-iban',
      walletId: 'wallet-1',
      type: 'WITHDRAWAL',
      status: 'RISK_HOLD',
      amount: -50,
      metadata: null,
      description: 'Задържано - липсва банкова сметка (IBAN). Моля добавете вашия IBAN преди повторно одобрение.',
    });

    await walletService.requestPayout('user-1');
    const pending = txCreated.find((t) => t.status === 'PENDING' && t.type === 'WITHDRAWAL');

    await expect(walletService.executePayoutTransfer(pending.id))
      .rejects.toThrow(/Payout could not be processed/i);

    // Legacy no-IBAN hold excluded via description fallback → first genuine failure.
    expect(userStore.riskBucket).toBeNull();
    expect(userStore.riskScore).toBe(0);
    expect(notificationService.notifyPayoutFailedInvalidIban).toHaveBeenCalled();
    expect(notificationService.notifyAdminOps).not.toHaveBeenCalled();

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
