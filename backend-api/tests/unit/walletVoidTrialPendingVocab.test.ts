/**
 * BC-ADMIN-REAUDIT2-TRIALVOID-VOCAB-1 — PRIMARY (user-triggered) TrialPending →
 * Voided path must conform to the canonical void-reason vocabulary AND stamp a
 * responsible actor (Spec §8.1 rule 6 + §1.3: "Every Voided cashback record
 * requires: reason category + responsible identity + timestamp"; "The same
 * validation is shared by ALL void paths").
 *
 * WalletService.voidTrialPendingCashback() is the path that actually runs first
 * when a user uses their trial refund; the scheduler's resolveTrialPendingCashback
 * is only the fallback for when this path silently fails. This test drives the
 * updateMany branch through a stateful in-memory prisma mock and asserts the
 * resulting walletTransaction row:
 *   - cashbackStatus === VOIDED, status === CANCELLED
 *   - voidedByUserId === SYSTEM_ACTOR_ID (the zero-UUID sentinel, NOT null)
 *   - voidedReason's category prefix is a member of VOID_REASON_CATEGORIES
 *   - voidedReason equals the same single-sourced TRIAL_VOID_REASON the scheduler uses
 *   - wallet.balance decreased by the trial amount (TRIAL_PENDING credits touch
 *     balance only); availableBalance unchanged
 *   - the paired ADJUSTMENT row is created (balance semantics preserved)
 */

import { CashbackEntryStatus, WalletTransactionStatus, WalletTransactionType } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Stateful in-memory store
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';
const TRIAL_AMOUNT = 12.5;

interface FakeTx {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  status: string;
  cashbackStatus: string | null;
  voidedAt: Date | null;
  voidedReason: string | null;
  voidedByUserId: string | null;
}

interface FakeWallet {
  id: string;
  userId: string;
  balance: number;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  isLocked: boolean;
  lockedReason: string | null;
  payoutIban: string | null;
}

const wallets: FakeWallet[] = [];
const txs: FakeTx[] = [];

function resetStore() {
  wallets.length = 0;
  txs.length = 0;

  wallets.push({
    id: 'wallet-1',
    userId: 'user-1',
    balance: TRIAL_AMOUNT, // TRIAL_PENDING credit incremented balance only
    availableBalance: 0,
    pendingBalance: 0,
    currency: 'BGN',
    isLocked: false,
    lockedReason: null,
    payoutIban: null,
  });

  txs.push({
    id: 'tx-1',
    walletId: 'wallet-1',
    type: WalletTransactionType.CASHBACK_CREDIT,
    amount: TRIAL_AMOUNT,
    status: WalletTransactionStatus.TRIAL_PENDING,
    cashbackStatus: CashbackEntryStatus.TRIAL_PENDING,
    voidedAt: null,
    voidedReason: null,
    voidedByUserId: null,
  });
}

function matchesWhere(tx: FakeTx, where: any): boolean {
  if (where.id?.in && !where.id.in.includes(tx.id)) return false;
  if (where.id && typeof where.id === 'string' && tx.id !== where.id) return false;
  if (where.walletId && tx.walletId !== where.walletId) return false;
  if (where.status && tx.status !== where.status) return false;
  return true;
}

const walletTransactionModel = {
  updateMany: jest.fn(async (q: any) => {
    const where = q?.where ?? {};
    const data = q?.data ?? {};
    let count = 0;
    for (const t of txs) {
      if (!matchesWhere(t, where)) continue;
      Object.assign(t, data);
      count++;
    }
    return { count };
  }),
  create: jest.fn(async (q: any) => {
    const row: FakeTx = {
      id: `tx-${txs.length + 1}`,
      walletId: q.data.walletId,
      type: q.data.type,
      amount: q.data.amount,
      status: q.data.status,
      cashbackStatus: q.data.cashbackStatus ?? null,
      voidedAt: null,
      voidedReason: null,
      voidedByUserId: null,
    };
    txs.push(row);
    return { ...row };
  }),
};

const walletModel = {
  upsert: jest.fn(async (q: any) => {
    const w = wallets.find((x) => x.userId === q.where.userId);
    if (w) return { ...w };
    const created: FakeWallet = {
      id: `wallet-${wallets.length + 1}`,
      userId: q.where.userId,
      balance: 0,
      availableBalance: 0,
      pendingBalance: 0,
      currency: 'BGN',
      isLocked: false,
      lockedReason: null,
      payoutIban: null,
    };
    wallets.push(created);
    return { ...created };
  }),
  findUniqueOrThrow: jest.fn(async (q: any) => {
    const w = wallets.find((x) => (q.where.id ? x.id === q.where.id : x.userId === q.where.userId));
    if (!w) throw new Error('wallet not found');
    return { ...w };
  }),
  update: jest.fn(async (q: any) => {
    const w = wallets.find((x) => (q.where.id ? x.id === q.where.id : x.userId === q.where.userId));
    if (!w) throw new Error(`wallet not found`);
    const data = q.data ?? {};
    if (data.balance?.decrement != null) w.balance -= data.balance.decrement;
    if (data.balance?.increment != null) w.balance += data.balance.increment;
    if (data.availableBalance?.decrement != null) w.availableBalance -= data.availableBalance.decrement;
    if (data.availableBalance?.increment != null) w.availableBalance += data.availableBalance.increment;
    return { ...w };
  }),
};

const prismaMock: any = {
  walletTransaction: walletTransactionModel,
  wallet: walletModel,
  // Callback-form $transaction: pass the same mock as the tx client.
  $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
  prisma: prismaMock,
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/utils/systemSettings', () => ({
  __esModule: true,
  getSystemSettingInt: jest.fn(async (_k: string, fallback: number) => fallback),
}));

// Heavy / side-effectful modules pulled in by wallet.service that are irrelevant
// to this path — stub them so the import is DB-free.
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
    notifyPayoutFailedInvalidIban: jest.fn(async () => undefined),
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

jest.mock('../../src/jobs/scheduler', () => ({
  expireWallet: jest.fn(async () => 0),
}));

// NOTE: cashbackLifecycle.service is intentionally NOT mocked — the test asserts
// against the REAL single-sourced SYSTEM_ACTOR_ID / TRIAL_VOID_REASON /
// VOID_REASON_CATEGORIES this path now imports.
import { walletService } from '../../src/services/wallet.service';
import {
  VOID_REASON_CATEGORIES,
  SYSTEM_ACTOR_ID,
  TRIAL_VOID_REASON,
} from '../../src/services/cashbackLifecycle.service';

describe('WalletService.voidTrialPendingCashback — TrialPending → Voided conforms to §8.1 rule 6 / §1.3', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it('voids the txns with a canonical reason + system-actor stamp and reclaims balance only', async () => {
    await walletService.voidTrialPendingCashback({
      userId: 'user-1',
      amount: TRIAL_AMOUNT,
      transactionIds: ['tx-1'],
    });

    const row = txs.find((t) => t.id === 'tx-1')!;
    const wallet = wallets.find((w) => w.id === 'wallet-1')!;

    // Status machine: TrialPending → Voided / Cancelled
    expect(row.cashbackStatus).toBe(CashbackEntryStatus.VOIDED);
    expect(row.status).toBe(WalletTransactionStatus.CANCELLED);

    // Responsible actor stamped — never NULL — and equals the exported sentinel.
    expect(row.voidedByUserId).toBe(SYSTEM_ACTOR_ID);
    expect(row.voidedByUserId).toBe(SYSTEM_ACTOR_UUID);
    expect(row.voidedByUserId).not.toBeNull();

    // Timestamp recorded.
    expect(row.voidedAt).toBeInstanceOf(Date);

    // Canonical-vocabulary reason category.
    expect(row.voidedReason).toBeTruthy();
    const category = row.voidedReason!.split(':')[0].trim().toUpperCase();
    expect(VOID_REASON_CATEGORIES as readonly string[]).toContain(category);
    // Specifically SYSTEM_ERROR (internal reconciliation, not FRAUD).
    expect(category).toBe('SYSTEM_ERROR');
    expect(category).not.toBe('FRAUD');

    // Single-sourced with the scheduler fallback: identical reason value.
    expect(row.voidedReason).toBe(TRIAL_VOID_REASON);

    // TRIAL_PENDING credits touch balance only: balance reclaimed, available unchanged.
    expect(wallet.balance).toBe(0); // started at TRIAL_AMOUNT, decremented by it
    expect(wallet.availableBalance).toBe(0); // untouched

    // Balance semantics preserved: a paired negative ADJUSTMENT row is created.
    const adjustment = txs.find((t) => t.type === WalletTransactionType.ADJUSTMENT);
    expect(adjustment).toBeTruthy();
    expect(adjustment!.amount).toBe(-TRIAL_AMOUNT);
  });
});
