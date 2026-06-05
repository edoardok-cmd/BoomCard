/**
 * §14 — Cashback Rules & Limitations
 *
 * §14.2 Cashback Validity
 *   - credit() sets cashbackExpiresAt = now + 60 days (CASHBACK_VALIDITY_DAYS) for cleared cashback
 *   - credit() respects cashback_expiry_days system-setting override
 *   - TRIAL_PENDING credits do NOT receive cashbackExpiresAt at credit time (clock deferred to clearedAt)
 *
 * §14.3 Per-User Cashback Caps (Rolling Windows)
 *   - calculateCashback() clamps result to remaining daily cap (Part A only, simple case)
 *   - calculateCashback() clamps result to remaining monthly cap
 *   - calculateCashback() returns 0 and logs CRITICAL when cap-check DB query fails
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  wallet: {
    findUnique: jest.fn(async () => null),
    upsert: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
    findUniqueOrThrow: jest.fn(async () => null),
  },
  walletTransaction: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async () => ({ id: 'wt-1', amount: 10 })),
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    aggregate: jest.fn(async () => ({ _sum: { amount: null } })),
    updateMany: jest.fn(async () => ({ count: 0 })),
  },
  receipt: {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    aggregate: jest.fn(async () => ({ _sum: { cashbackAmount: null } })),
    count: jest.fn(async () => 0),
  },
  stickerScan: {
    findFirst: jest.fn(async () => null),
    aggregate: jest.fn(async () => ({ _sum: { cashbackAmount: null } })),
  },
  subscription: {
    findFirst: jest.fn(async () => null),
  },
  venue: {
    findUnique: jest.fn(async () => null),
  },
  venueFraudConfig: {
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async () => null),
  },
  merchantWhitelist: {
    findUnique: jest.fn(async () => null),
  },
  cashbackRate: {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
  user: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
  },
  $transaction: jest.fn(async (fn: any) => {
    if (typeof fn === 'function') return fn(mockPrisma);
    return Promise.all(fn);
  }),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ─── System settings mock ─────────────────────────────────────────────────────

const mockGetSystemSettingInt = jest.fn(async (_key: string, fallback: number) => fallback);
const mockGetSystemSettingFloat = jest.fn(async (_key: string, fallback: number) => fallback);

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: (key: string, fallback: number) => mockGetSystemSettingInt(key, fallback),
  getSystemSettingFloat: (key: string, fallback: number) => mockGetSystemSettingFloat(key, fallback),
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
  invalidateSystemSettingCache: jest.fn(),
}));

// ─── Logger mock ──────────────────────────────────────────────────────────────

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }));

// ─── Other service mocks ──────────────────────────────────────────────────────

jest.mock('../../src/services/paysera.service', () => ({
  payseraService: {
    isTransferConfigured: jest.fn(() => false),
    createTransfer: jest.fn(async () => { throw new Error('not configured'); }),
    reserveTransfer: jest.fn(async () => ({})),
  },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(), notifyPayoutReady: jest.fn(async () => {}) },
}));

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: jest.fn(async () => ({ success: true })) },
}));

jest.mock('../../src/services/ocr.service', () => ({
  ocrService: { processImage: jest.fn(async () => ({ text: '', confidence: 0, merchantName: null, amount: null })) },
}));

jest.mock('../../src/services/receiptTemplate.service', () => ({
  receiptTemplateService: { compareAgainstTemplates: jest.fn(async () => ({ score: 0, isMatch: false })) },
}));

// fireAutomation used internally in wallet.service
jest.mock('../../src/lib/automationDispatcher', () => ({
  fireAutomation: jest.fn(async () => {}),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { walletService } from '../../src/services/wallet.service';
import { fraudDetectionService } from '../../src/services/fraudDetection.service';
import { WalletTransactionType } from '@prisma/client';
import { CASHBACK_VALIDITY_DAYS, DEFAULT_MAX_CASHBACK_PER_DAY, DEFAULT_MAX_CASHBACK_PER_MONTH } from '../../src/constants/receipt.constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseWallet = {
  id: 'w-1',
  userId: 'u-1',
  balance: 50,
  availableBalance: 50,
  isLocked: false,
  lockedReason: null,
  lockedAt: null,
  payoutIban: null,
  payoutBeneficiaryName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSystemSettingInt.mockImplementation(async (_key: string, fallback: number) => fallback);
  mockGetSystemSettingFloat.mockImplementation(async (_key: string, fallback: number) => fallback);
  mockPrisma.wallet.findUnique.mockResolvedValue(baseWallet);
  mockPrisma.wallet.upsert.mockResolvedValue(baseWallet);
  mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue(baseWallet);
  mockPrisma.wallet.update.mockImplementation(async (args: any) => {
    const inc = args.data?.balance?.increment ?? 0;
    return { ...baseWallet, balance: baseWallet.balance + inc, availableBalance: baseWallet.availableBalance + inc };
  });
  mockPrisma.walletTransaction.create.mockImplementation(async (args: any) => ({
    id: 'wt-1', ...args.data,
  }));
  mockPrisma.walletTransaction.findFirst.mockResolvedValue(null);
  mockPrisma.subscription.findFirst.mockResolvedValue(null);
  mockPrisma.cashbackRate.findFirst.mockResolvedValue(null);
  mockPrisma.receipt.count.mockResolvedValue(0);
  mockPrisma.receipt.findFirst.mockResolvedValue(null);
  mockPrisma.receipt.findMany.mockResolvedValue([]);
  mockPrisma.venueFraudConfig.findUnique.mockResolvedValue(null);
  mockPrisma.venueFraudConfig.findFirst.mockResolvedValue(null);
  mockPrisma.merchantWhitelist.findUnique.mockResolvedValue(null);
  // Default: all aggregate queries return 0
  mockPrisma.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPrisma.receipt.aggregate.mockResolvedValue({ _sum: { cashbackAmount: null } });
  mockPrisma.stickerScan.aggregate.mockResolvedValue({ _sum: { cashbackAmount: null } });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §14.2 — Cashback Validity
// ═══════════════════════════════════════════════════════════════════════════════

describe('§14.2 Cashback validity — credit() sets 60-day expiry', () => {
  it('cashbackExpiresAt is set to approx now + 60 days for cleared CASHBACK_CREDIT', async () => {
    const before = Date.now();

    await walletService.credit({
      userId: 'u-1',
      amount: 10,
      type: WalletTransactionType.CASHBACK_CREDIT,
    });

    const after = Date.now();
    const txData = mockPrisma.walletTransaction.create.mock.calls[0][0].data;

    expect(txData.cashbackExpiresAt).toBeInstanceOf(Date);
    const expiryMs = txData.cashbackExpiresAt.getTime();
    const expectedMin = before + CASHBACK_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
    const expectedMax = after + CASHBACK_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

    expect(expiryMs).toBeGreaterThanOrEqual(expectedMin);
    expect(expiryMs).toBeLessThanOrEqual(expectedMax);
  });

  it('cashbackExpiresAt uses cashback_expiry_days system-setting override (e.g. 30 days)', async () => {
    // Override: system setting returns 30 instead of default 60
    mockGetSystemSettingInt.mockImplementation(async (key: string, fallback: number) => {
      if (key === 'cashback_expiry_days') return 30;
      return fallback;
    });

    const before = Date.now();
    await walletService.credit({
      userId: 'u-1',
      amount: 10,
      type: WalletTransactionType.CASHBACK_CREDIT,
    });
    const after = Date.now();

    const txData = mockPrisma.walletTransaction.create.mock.calls[0][0].data;
    const expiryMs = txData.cashbackExpiresAt.getTime();
    const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 30 * 24 * 60 * 60 * 1000;

    expect(expiryMs).toBeGreaterThanOrEqual(expectedMin);
    expect(expiryMs).toBeLessThanOrEqual(expectedMax);
  });

  it('TRIAL_PENDING credit does NOT receive cashbackExpiresAt (deferred to clearedAt)', async () => {
    // Active subscription within trial refund window → credit becomes TRIAL_PENDING
    mockPrisma.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub-1',
      trialRefundEligibleUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      trialRefundUsed: false,
    });

    await walletService.credit({
      userId: 'u-1',
      amount: 10,
      type: WalletTransactionType.CASHBACK_CREDIT,
    });

    const txData = mockPrisma.walletTransaction.create.mock.calls[0][0].data;

    // Spec §14.2 / §4.4 v1.1: clock starts at clearedAt (when cashback becomes Available),
    // not at the original scan. cashbackExpiresAt must be undefined for TRIAL_PENDING credits.
    expect(txData.cashbackExpiresAt).toBeUndefined();
  });

  it('non-cashback credit (WITHDRAWAL) does not set cashbackExpiresAt', async () => {
    await walletService.credit({
      userId: 'u-1',
      amount: 10,
      type: WalletTransactionType.WITHDRAWAL,
    });

    const txData = mockPrisma.walletTransaction.create.mock.calls[0][0].data;
    expect(txData.cashbackExpiresAt).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §14.3 — Per-User Cashback Caps (Rolling Windows)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§14.3 Cashback caps — calculateCashback() enforces rolling windows', () => {
  // Venue at 20% discount, PREMIUM_MONTHLY plan → 16% cashback = 16 BGN on 100 BGN
  const baseParams = {
    venueId: 'venue-1',
    amount: 100,
    cardTier: 'PREMIUM_MONTHLY' as const,
    userId: 'u-1',
  };

  beforeEach(() => {
    // Venue has 20% discount rate
    mockPrisma.venue.findUnique.mockResolvedValue({
      partner: { discountRate: 20, partnerType: null },
    });
  });

  it('clamps cashbackAmount to remaining daily cap (spec: rolling 24h)', async () => {
    // User has already earned 95 BGN today; daily cap is 100 → only 5 BGN remaining
    mockPrisma.walletTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 95 } })  // daily Part A
      .mockResolvedValueOnce({ _sum: { amount: 0 } });  // monthly Part A
    mockPrisma.receipt.aggregate
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } })  // daily Part B
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } }); // monthly Part B
    mockPrisma.stickerScan.aggregate
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } })  // daily Part C
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } }); // monthly Part C

    const result = await fraudDetectionService.calculateCashback(baseParams);

    // Raw cashback = 16 BGN; daily remaining = 100 - 95 = 5 → clamped to 5
    expect(result.cashbackAmount).toBe(5);
  });

  it('clamps cashbackAmount to remaining monthly cap (spec: rolling 30-day)', async () => {
    // Daily is fine (0 earned); monthly cap approached: 490/500 earned → 10 BGN remaining
    mockPrisma.walletTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })    // daily Part A
      .mockResolvedValueOnce({ _sum: { amount: 490 } }); // monthly Part A
    mockPrisma.receipt.aggregate
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } })
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } });
    mockPrisma.stickerScan.aggregate
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } })
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } });
    mockGetSystemSettingFloat.mockImplementation(async (key: string, fallback: number) => {
      if (key === 'max_cashback_per_month') return DEFAULT_MAX_CASHBACK_PER_MONTH; // 500
      return fallback;
    });

    const result = await fraudDetectionService.calculateCashback(baseParams);

    // Raw cashback = 16 BGN; daily remaining = 100 BGN (unlimited); monthly remaining = 10 BGN → clamped
    expect(result.cashbackAmount).toBe(10);
  });

  it('cap-check DB failure → cashbackAmount=0 and logs CRITICAL error (spec §14.3 note)', async () => {
    // Force all aggregate queries to throw to simulate DB failure
    mockPrisma.walletTransaction.aggregate.mockRejectedValue(new Error('DB connection lost'));

    const result = await fraudDetectionService.calculateCashback(baseParams);

    // §14.3 spec note: "If cap-check DB query fails, cashback is BLOCKED (zeroed)"
    expect(result.cashbackAmount).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL'),
      expect.anything(),
    );
  });

  it('returns 0 when cardTier is null (no active subscription) — caps not applied', async () => {
    const result = await fraudDetectionService.calculateCashback({
      ...baseParams,
      cardTier: null,
    });

    // No subscription → 0 cashback regardless of caps
    expect(result.cashbackAmount).toBe(0);
    // Cap aggregates should not be called when cashback is already 0
    expect(mockPrisma.walletTransaction.aggregate).not.toHaveBeenCalled();
  });

  it('three-part cap aggregation: Part B (approved receipts in-flight) counts toward daily cap', async () => {
    // Part A = 0 (no completed wallet txs), Part B = 90 BGN (receipt approved, credit not yet committed)
    // Daily cap = 100 → remaining = 10 BGN
    mockPrisma.walletTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } })  // daily Part A
      .mockResolvedValueOnce({ _sum: { amount: null } }); // monthly Part A
    mockPrisma.receipt.aggregate
      .mockResolvedValueOnce({ _sum: { cashbackAmount: 90 } })   // daily Part B
      .mockResolvedValueOnce({ _sum: { cashbackAmount: 90 } });  // monthly Part B
    mockPrisma.stickerScan.aggregate
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } })
      .mockResolvedValueOnce({ _sum: { cashbackAmount: null } });

    const result = await fraudDetectionService.calculateCashback(baseParams);

    expect(result.cashbackAmount).toBe(10); // 100 - 90 = 10 remaining
  });
});
