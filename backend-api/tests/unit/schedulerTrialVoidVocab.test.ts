/**
 * BC-ADMIN-REAUDIT2-TRIALVOID-VOCAB-1 — Scheduler TrialPending → Voided path
 * must conform to the canonical void-reason vocabulary AND stamp a responsible
 * actor (Spec §8.1 rule 6 + §1.3: "Every Voided cashback record requires:
 * reason category + responsible admin identity + timestamp"; "The same
 * validation is shared by all void paths").
 *
 * The scheduler's resolveTrialPendingCashback() voids surviving TRIAL_PENDING
 * cashback when the trial refund was already used. This test drives that exact
 * branch through a stateful in-memory prisma mock and asserts the resulting
 * walletTransaction row:
 *   - cashbackStatus === VOIDED
 *   - voidedByUserId === SYSTEM_ACTOR_ID (the zero-UUID sentinel, NOT null)
 *   - voidedReason's category prefix is a member of VOID_REASON_CATEGORIES
 *   - wallet.balance decreased by the trial amount (TRIAL_PENDING credits touch
 *     balance only)
 *   - availableBalance unchanged
 */

import { CashbackEntryStatus, WalletTransactionStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Stateful in-memory store
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';
const TRIAL_AMOUNT = 12.5;

interface FakeTx {
  id: string;
  walletId: string;
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
    payoutIban: null,
  });

  txs.push({
    id: 'tx-1',
    walletId: 'wallet-1',
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
  findMany: jest.fn(async (q: any) => {
    const where = q?.where ?? {};
    let rows = txs.filter((t) => matchesWhere(t, where));
    if (q?.distinct?.includes('walletId')) {
      const seen = new Set<string>();
      rows = rows.filter((t) => (seen.has(t.walletId) ? false : (seen.add(t.walletId), true)));
    }
    // Honor the `select` shape loosely — return full rows; callers only read
    // the fields they selected.
    return rows.map((t) => ({ ...t }));
  }),
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
};

const walletModel = {
  findMany: jest.fn(async (q: any) => {
    const ids: string[] = q?.where?.id?.in ?? [];
    return wallets.filter((w) => ids.includes(w.id)).map((w) => ({ ...w }));
  }),
  update: jest.fn(async (q: any) => {
    const w = wallets.find((x) => x.id === q.where.id);
    if (!w) throw new Error(`wallet ${q.where.id} not found`);
    const data = q.data ?? {};
    if (data.balance?.decrement != null) w.balance -= data.balance.decrement;
    if (data.balance?.increment != null) w.balance += data.balance.increment;
    if (data.availableBalance?.decrement != null) w.availableBalance -= data.availableBalance.decrement;
    if (data.availableBalance?.increment != null) w.availableBalance += data.availableBalance.increment;
    return { ...w };
  }),
};

const userModel = {
  findUnique: jest.fn(async (_q: any) => ({ status: 'ACTIVE' })),
};

const subscriptionModel = {
  // First call in the function: "still within trial window?" → none open.
  // Second call: "was trial refund used?" → yes (routes into the void branch).
  findFirst: jest.fn(async (q: any) => {
    if (q?.where?.trialRefundEligibleUntil) return null; // no still-open window
    if (q?.where?.trialRefundUsed === true) return { id: 'sub-1' }; // refund used
    return null;
  }),
};

const prismaMock: any = {
  walletTransaction: walletTransactionModel,
  wallet: walletModel,
  user: userModel,
  subscription: subscriptionModel,
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

// Avoid pulling real DB-backed system settings.
jest.mock('../../src/utils/systemSettings', () => ({
  __esModule: true,
  getSystemSettingInt: jest.fn(async (_k: string, fallback: number) => fallback),
}));

import { resolveTrialPendingCashback } from '../../src/jobs/scheduler';
import { VOID_REASON_CATEGORIES, SYSTEM_ACTOR_ID } from '../../src/services/cashbackLifecycle.service';

describe('resolveTrialPendingCashback — TrialPending → Voided conforms to §8.1 rule 6 / §1.3', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it('voids the survivor with a canonical reason + system-actor stamp and reclaims balance only', async () => {
    await resolveTrialPendingCashback();

    const row = txs.find((t) => t.id === 'tx-1')!;
    const wallet = wallets.find((w) => w.id === 'wallet-1')!;

    // Status machine: TrialPending → Voided
    expect(row.cashbackStatus).toBe(CashbackEntryStatus.VOIDED);

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

    // TRIAL_PENDING credits touch balance only: balance reclaimed, available unchanged.
    expect(wallet.balance).toBe(0); // started at TRIAL_AMOUNT, decremented by it
    expect(wallet.availableBalance).toBe(0); // untouched
  });
});
