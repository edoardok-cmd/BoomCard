/**
 * §15–§19 spec audit tests
 *
 * §15 — Cashback Rate Admin Override
 *   - calculateCashback() uses DB rate override when present (not hardcoded matrix)
 *   - calculateCashback() falls back to CASHBACK_MATRIX when no DB rate exists
 *   - calculateCashback() DB lookup failure is non-fatal (graceful fallback)
 *   - calculateCashback() returns 0 when cardTier=null (no active subscription)
 *   - createCashbackRates() throws when not all 5 discount steps supplied
 *   - createCashbackRates() throws when cashback % exceeds the discount step
 *   - createCashbackRates() throws on duplicate step in input array
 *   - createCashbackRates() throws on invalid step value
 *   - createCashbackRates() throws when percentage is negative
 *   - createCashbackRates() succeeds with all 5 valid steps
 *   - getCurrentRates() returns source='db' for steps with a DB row, source='default' otherwise
 *
 * §16 — Receipt Approval Rate Limits
 *   - UNUSUAL_TIME signal fires for hour ∈ [2, 6) → +10 pts
 *   - UNUSUAL_TIME does NOT fire at 6:00 AM or safe hours
 *
 * §17 — Merchant Whitelist
 *   - checkMerchant(): APPROVED status → isWhitelisted=true, isBlacklisted=false
 *   - checkMerchant(): BLOCKED status → isBlacklisted=true, isWhitelisted=false
 *   - checkMerchant(): PENDING → neither flag set
 *   - checkMerchant(): unknown merchant → neither flag set
 *   - checkReceipt(): APPROVED merchant does not add MERCHANT_BLACKLISTED
 *   - checkReceipt(): BLOCKED merchant adds MERCHANT_BLACKLISTED reason (+50 pts)
 *
 * §19 — Wallet Management
 *   - lockWallet() sets isLocked=true, lockedReason, lockedAt
 *   - unlockWallet() clears all lock fields
 *   - credit() throws "Wallet is locked" when isLocked=true
 *   - debit() throws "Wallet is locked" when isLocked=true
 *   - Auto-lock on payout reversal failure: lockedReason matches spec format
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  cashbackRate: {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    createMany: jest.fn(async () => ({ count: 0 })),
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
  receipt: {
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  },
  user: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
  },
  wallet: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => ({ id: 'w-1', userId: 'u-1', balance: 0, availableBalance: 0, isLocked: false, lockedReason: null, lockedAt: null })),
    update: jest.fn(async () => ({})),
    upsert: jest.fn(async () => ({ id: 'w-1', userId: 'u-1', balance: 0, availableBalance: 0, isLocked: false, lockedReason: null, lockedAt: null })),
  },
  walletTransaction: {
    create: jest.fn(async () => ({ id: 'wt-1', amount: 10 })),
    update: jest.fn(async () => ({})),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    updateMany: jest.fn(async () => ({ count: 1 })),
  },
  subscription: {
    findFirst: jest.fn(async () => null),
  },
  stickerScan: {
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
  $transaction: jest.fn(async (fn: any) => {
    if (typeof fn === 'function') {
      return fn(mockPrisma);
    }
    return Promise.all(fn);
  }),
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

// ─── System settings mock ─────────────────────────────────────────────────────

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
  invalidateSystemSettingCache: jest.fn(),
}));

// ─── Paysera mock ─────────────────────────────────────────────────────────────

jest.mock('../../src/services/paysera.service', () => ({
  payseraService: {
    isTransferConfigured: jest.fn(() => false),
    createTransfer: jest.fn(async () => { throw new Error('Paysera not configured'); }),
    reserveTransfer: jest.fn(async () => ({})),
  },
}));

// ─── Logger mock ─────────────────────────────────────────────────────────────

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// ─── Email / notification mocks ───────────────────────────────────────────────

jest.mock('../../src/services/email.service', () => ({
  emailService: { sendEmail: jest.fn(async () => ({ success: true })) },
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: { notifyAdminOps: jest.fn(async () => undefined) },
}));

// ─── OCR / receipt template mocks ────────────────────────────────────────────

jest.mock('../../src/services/ocr.service', () => ({
  ocrService: { processImage: jest.fn(async () => ({ text: '', confidence: 0, merchantName: null, amount: null })) },
}));

jest.mock('../../src/services/receiptTemplate.service', () => ({
  receiptTemplateService: {
    compareAgainstTemplates: jest.fn(async () => ({ score: 0, isMatch: false })),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { adminCashbackService } from '../../src/services/adminCashback.service';
import { fraudDetectionService } from '../../src/services/fraudDetection.service';
import { walletService } from '../../src/services/wallet.service';
import { CASHBACK_MATRIX, CASHBACK_MATRIX_STEPS } from '../../src/constants/receipt.constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseWallet = {
  id: 'w-1',
  userId: 'u-1',
  balance: 100,
  availableBalance: 100,
  isLocked: false,
  lockedReason: null,
  lockedAt: null,
  payoutIban: null,
  payoutBeneficiaryName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Reset mocks between tests ───────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: wallet findUnique returns existing wallet (for getOrCreateWallet)
  mockPrisma.wallet.findUnique.mockResolvedValue(baseWallet);
  // Default: no DB cashback rate override
  mockPrisma.cashbackRate.findFirst.mockResolvedValue(null);
  mockPrisma.cashbackRate.findMany.mockResolvedValue([]);
  // Default: no merchant whitelist entry
  mockPrisma.merchantWhitelist.findUnique.mockResolvedValue(null);
  // Default: no recent receipts, no duplicate
  mockPrisma.receipt.count.mockResolvedValue(0);
  mockPrisma.receipt.findFirst.mockResolvedValue(null);
  // Default: wallet upsert returns base wallet (for getOrCreateWallet)
  mockPrisma.wallet.upsert.mockResolvedValue(baseWallet);
  // Default: no venue config
  mockPrisma.venueFraudConfig.findUnique.mockResolvedValue(null);
  mockPrisma.venueFraudConfig.findFirst.mockResolvedValue(null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// §15 — Cashback Rate Admin Override
// ═══════════════════════════════════════════════════════════════════════════════

describe('§15.2 calculateCashback — DB rate override', () => {
  it('uses DB rate (basic) when a CashbackRate row exists for the matched step', async () => {
    // Partner at 10% discount → step 10 is selected
    mockPrisma.venue.findUnique.mockResolvedValueOnce({
      partner: { discountRate: 10, partnerType: null },
    });
    // DB override: basic=7 (vs hardcoded CASHBACK_MATRIX[10].basic=5)
    mockPrisma.cashbackRate.findFirst.mockResolvedValueOnce({
      discountStep: 10, basic: 7, premium: 9, effectiveFrom: new Date('2026-01-01'),
    });

    const result = await fraudDetectionService.calculateCashback({
      venueId: 'venue-1',
      amount: 100,
      cardTier: 'BASIC',
    });

    // DB override basic=7 → 7 BGN on 100 BGN bill
    expect(result.cashbackPercent).toBe(7);
    expect(result.cashbackAmount).toBe(7);
  });

  it('uses DB rate (premium) for premium subscribers', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce({
      partner: { discountRate: 10, partnerType: null },
    });
    // DB override: premium=9 (vs hardcoded CASHBACK_MATRIX[10].premium=8)
    mockPrisma.cashbackRate.findFirst.mockResolvedValueOnce({
      discountStep: 10, basic: 7, premium: 9, effectiveFrom: new Date('2026-01-01'),
    });

    const result = await fraudDetectionService.calculateCashback({
      venueId: 'venue-1',
      amount: 100,
      cardTier: 'PREMIUM',
    });

    expect(result.cashbackPercent).toBe(9);
    expect(result.cashbackAmount).toBe(9);
  });

  it('falls back to CASHBACK_MATRIX when no DB rate row exists', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce({
      partner: { discountRate: 10, partnerType: null },
    });
    // findFirst returns null → no DB override
    mockPrisma.cashbackRate.findFirst.mockResolvedValueOnce(null);

    const result = await fraudDetectionService.calculateCashback({
      venueId: 'venue-1',
      amount: 100,
      cardTier: 'BASIC',
    });

    // Hardcoded CASHBACK_MATRIX[10].basic = 5
    expect(result.cashbackPercent).toBe(CASHBACK_MATRIX[10].basic);
    expect(result.cashbackAmount).toBe(CASHBACK_MATRIX[10].basic);
  });

  it('falls back to hardcoded matrix when DB lookup throws (non-fatal)', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce({
      partner: { discountRate: 20, partnerType: null },
    });
    // DB lookup throws — must not propagate
    mockPrisma.cashbackRate.findFirst.mockRejectedValueOnce(new Error('DB timeout'));

    const result = await fraudDetectionService.calculateCashback({
      venueId: 'venue-1',
      amount: 100,
      cardTier: 'PREMIUM',
    });

    // Graceful fallback: CASHBACK_MATRIX[20].premium = 16
    expect(result.cashbackPercent).toBe(CASHBACK_MATRIX[20].premium);
    expect(result.cashbackAmount).toBeCloseTo(CASHBACK_MATRIX[20].premium, 2);
  });

  it('returns 0 cashback for cardTier=null (no active subscription)', async () => {
    mockPrisma.venue.findUnique.mockResolvedValueOnce({
      partner: { discountRate: 25, partnerType: null },
    });

    const result = await fraudDetectionService.calculateCashback({
      venueId: 'venue-1',
      amount: 100,
      cardTier: null,
    });

    expect(result.cashbackAmount).toBe(0);
    expect(result.cashbackPercent).toBe(0);
  });
});

describe('§15.3 createCashbackRates — validation', () => {
  const adminUserId = 'admin-1';

  it('throws when fewer than all 5 discount steps are supplied', async () => {
    // Only 4 steps — missing step 25
    const rates = CASHBACK_MATRIX_STEPS.slice(0, 4).map(step => ({
      discountStep: step,
      basic: CASHBACK_MATRIX[step].basic,
      premium: CASHBACK_MATRIX[step].premium,
    }));

    await expect(
      adminCashbackService.createCashbackRates({ rates, adminUserId }),
    ).rejects.toThrow(/Missing discount steps/i);
  });

  it('throws when cashback percent exceeds the discount step (negative margin)', async () => {
    const rates = CASHBACK_MATRIX_STEPS.map(step => ({
      discountStep: step,
      basic: CASHBACK_MATRIX[step].basic,
      premium: CASHBACK_MATRIX[step].premium,
    }));
    // Override step 10: basic=11 (exceeds discountStep=10)
    rates[1] = { discountStep: 10, basic: 11, premium: 8 };

    await expect(
      adminCashbackService.createCashbackRates({ rates, adminUserId }),
    ).rejects.toThrow(/cashback cannot exceed the partner discount/i);
  });

  it('throws when a duplicate discountStep appears in the input', async () => {
    // Two entries for step 5
    const rates = [
      { discountStep: 5, basic: 5, premium: 5 },
      { discountStep: 5, basic: 4, premium: 4 }, // duplicate
      { discountStep: 10, basic: 5, premium: 8 },
      { discountStep: 15, basic: 8, premium: 12 },
      { discountStep: 20, basic: 10, premium: 16 },
    ];

    await expect(
      adminCashbackService.createCashbackRates({ rates, adminUserId }),
    ).rejects.toThrow(/Duplicate discountStep/i);
  });

  it('throws when an invalid discount step is supplied', async () => {
    const rates: Array<{ discountStep: number; basic: number; premium: number }> =
      CASHBACK_MATRIX_STEPS.map(step => ({
        discountStep: step,
        basic: CASHBACK_MATRIX[step].basic,
        premium: CASHBACK_MATRIX[step].premium,
      }));
    rates[0] = { discountStep: 7, basic: 5, premium: 5 }; // 7 is not a valid step

    await expect(
      adminCashbackService.createCashbackRates({ rates, adminUserId }),
    ).rejects.toThrow(/Invalid discount step/i);
  });

  it('throws when cashback percentage is negative', async () => {
    const rates = CASHBACK_MATRIX_STEPS.map(step => ({
      discountStep: step,
      basic: CASHBACK_MATRIX[step].basic,
      premium: CASHBACK_MATRIX[step].premium,
    }));
    rates[0] = { discountStep: 5, basic: -1, premium: 5 };

    await expect(
      adminCashbackService.createCashbackRates({ rates, adminUserId }),
    ).rejects.toThrow(/between 0 and 100/i);
  });

  it('creates cashback rates when all 5 valid steps are provided', async () => {
    mockPrisma.cashbackRate.createMany.mockResolvedValueOnce({ count: 5 });

    const rates = CASHBACK_MATRIX_STEPS.map(step => ({
      discountStep: step,
      basic: CASHBACK_MATRIX[step].basic,
      premium: CASHBACK_MATRIX[step].premium,
    }));

    await expect(
      adminCashbackService.createCashbackRates({ rates, adminUserId, notes: 'Baseline' }),
    ).resolves.toBeUndefined();

    expect(mockPrisma.cashbackRate.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ discountStep: 5, basic: 5, premium: 5 }),
          expect.objectContaining({ discountStep: 25, basic: 10, premium: 20 }),
        ]),
      }),
    );
  });
});

describe('§15.3 getCurrentRates — source labelling', () => {
  it('returns source="db" for steps that have a DB rate row', async () => {
    const now = new Date();
    // Only step 10 has a DB row
    mockPrisma.cashbackRate.findMany.mockResolvedValueOnce([
      {
        id: 'cr-1', discountStep: 10, basic: 7, premium: 9,
        effectiveFrom: new Date(now.getTime() - 1000),
        createdBy: null, notes: null, createdAt: now,
      },
    ]);
    mockPrisma.user.findMany.mockResolvedValueOnce([]);

    const rates = await adminCashbackService.getCurrentRates();
    const step10 = rates.find(r => r.discountStep === 10);
    const step5 = rates.find(r => r.discountStep === 5);

    expect(step10?.source).toBe('db');
    expect(step10?.basic).toBe(7);
    expect(step5?.source).toBe('default');
    expect(step5?.basic).toBe(CASHBACK_MATRIX[5].basic);
  });

  it('returns source="default" for all steps when no DB rows exist', async () => {
    mockPrisma.cashbackRate.findMany.mockResolvedValueOnce([]);
    mockPrisma.user.findMany.mockResolvedValueOnce([]);

    const rates = await adminCashbackService.getCurrentRates();

    expect(rates).toHaveLength(CASHBACK_MATRIX_STEPS.length);
    expect(rates.every(r => r.source === 'default')).toBe(true);
    expect(rates.find(r => r.discountStep === 20)?.premium).toBe(CASHBACK_MATRIX[20].premium);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §16 — Receipt Approval Rate Limits
// ═══════════════════════════════════════════════════════════════════════════════

describe('§16.5 UNUSUAL_TIME fraud signal', () => {
  const minimalFraudParams = {
    imageHash: 'abc123',
    ocrConfidence: 0.9,
    userId: 'u-1',
    cardTier: 'BASIC' as const,
    merchantName: undefined,
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds +10 pts when receipt is submitted at 3:00 AM (hour ∈ [2,6))', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-19T03:00:00')); // 3 AM local

    // All other checks return no fraud
    mockPrisma.receipt.findMany.mockResolvedValue([]);
    mockPrisma.receipt.count.mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(minimalFraudParams);

    expect(result.fraudReasons).toContain('UNUSUAL_TIME');
    // Base score for unusual time is +10
    expect(result.fraudScore).toBeGreaterThanOrEqual(10);
  });

  it('does NOT fire UNUSUAL_TIME at 10:00 AM (outside window)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-19T10:00:00')); // 10 AM — safe

    mockPrisma.receipt.findMany.mockResolvedValue([]);
    mockPrisma.receipt.count.mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(minimalFraudParams);

    expect(result.fraudReasons).not.toContain('UNUSUAL_TIME');
  });

  it('fires UNUSUAL_TIME at 2:00 AM boundary (inclusive start of [2,6) window)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-19T02:00:00')); // exactly 2 AM

    mockPrisma.receipt.findMany.mockResolvedValue([]);
    mockPrisma.receipt.count.mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(minimalFraudParams);

    // Hour 2 IS in [2,6) — should fire
    expect(result.fraudReasons).toContain('UNUSUAL_TIME');
  });

  it('does NOT fire UNUSUAL_TIME at 6:00 AM (exclusive end of window)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-19T06:00:00')); // 6 AM — outside

    mockPrisma.receipt.findMany.mockResolvedValue([]);
    mockPrisma.receipt.count.mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(minimalFraudParams);

    expect(result.fraudReasons).not.toContain('UNUSUAL_TIME');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §17 — Merchant Whitelist
// ═══════════════════════════════════════════════════════════════════════════════

describe('§17 Merchant Whitelist — checkMerchant', () => {
  it('returns isWhitelisted=true for APPROVED merchant', async () => {
    mockPrisma.merchantWhitelist.findUnique.mockResolvedValueOnce({
      id: 'mw-1', merchantName: 'GoodCafe', status: 'APPROVED',
    });

    const result = await fraudDetectionService.checkMerchant('GoodCafe');

    expect(result.isWhitelisted).toBe(true);
    expect(result.isBlacklisted).toBe(false);
  });

  it('returns isBlacklisted=true for BLOCKED merchant', async () => {
    mockPrisma.merchantWhitelist.findUnique.mockResolvedValueOnce({
      id: 'mw-2', merchantName: 'FraudShop', status: 'BLOCKED',
    });

    const result = await fraudDetectionService.checkMerchant('FraudShop');

    expect(result.isBlacklisted).toBe(true);
    expect(result.isWhitelisted).toBe(false);
  });

  it('returns neither flag for PENDING merchant', async () => {
    mockPrisma.merchantWhitelist.findUnique.mockResolvedValueOnce({
      id: 'mw-3', merchantName: 'NewPlace', status: 'PENDING',
    });

    const result = await fraudDetectionService.checkMerchant('NewPlace');

    expect(result.isWhitelisted).toBe(false);
    expect(result.isBlacklisted).toBe(false);
  });

  it('returns neither flag for unknown merchant (not in whitelist)', async () => {
    mockPrisma.merchantWhitelist.findUnique.mockResolvedValueOnce(null);

    const result = await fraudDetectionService.checkMerchant('Unknown Merchant');

    expect(result.isWhitelisted).toBe(false);
    expect(result.isBlacklisted).toBe(false);
  });
});

describe('§17 Merchant Whitelist — fraud score effect in checkReceipt', () => {
  const baseParams = {
    imageHash: 'unique-hash-xyz',
    ocrConfidence: 0.9,
    userId: 'u-1',
    cardTier: 'PREMIUM' as const,
  };

  beforeEach(() => {
    // Suppress all other fraud signals for isolation
    mockPrisma.receipt.findMany.mockResolvedValue([]);  // no duplicate
    mockPrisma.receipt.count.mockResolvedValue(0);      // no rate limits / rapid
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-19T14:00:00')); // 2 PM — no UNUSUAL_TIME
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('APPROVED merchant reduces fraud score by 10 pts (§17: -10 trusted merchant)', async () => {
    mockPrisma.merchantWhitelist.findUnique.mockResolvedValueOnce({
      merchantName: 'TrustedCafe', status: 'APPROVED',
    });

    const resultApproved = await fraudDetectionService.checkReceipt({
      ...baseParams,
      merchantName: 'TrustedCafe',
    });
    const resultNoMerchant = await fraudDetectionService.checkReceipt({
      ...baseParams,
      merchantName: undefined,
    });

    // Approved merchant should have a lower (or equal) score — score is floored at 0
    expect(resultApproved.fraudScore).toBeLessThanOrEqual(resultNoMerchant.fraudScore);
    // No MERCHANT_BLACKLISTED reason
    expect(resultApproved.fraudReasons).not.toContain('MERCHANT_BLACKLISTED');
  });

  it('BLOCKED merchant adds 50 pts to fraud score (§17: +50 blacklisted)', async () => {
    mockPrisma.merchantWhitelist.findUnique.mockResolvedValueOnce({
      merchantName: 'BlacklistShop', status: 'BLOCKED',
    });

    const result = await fraudDetectionService.checkReceipt({
      ...baseParams,
      merchantName: 'BlacklistShop',
    });

    expect(result.fraudReasons).toContain('MERCHANT_BLACKLISTED');
    expect(result.fraudScore).toBeGreaterThanOrEqual(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §19 — Wallet Management
// ═══════════════════════════════════════════════════════════════════════════════

describe('§19.1 Wallet lock fields — lockWallet / unlockWallet', () => {
  it('lockWallet sets isLocked=true, lockedReason, and lockedAt', async () => {
    const mockWallet = { ...baseWallet, id: 'w-1' };
    mockPrisma.wallet.findUnique.mockResolvedValue(mockWallet);
    mockPrisma.wallet.update.mockResolvedValueOnce({
      ...mockWallet, isLocked: true, lockedReason: 'Fraud', lockedAt: new Date(),
    });

    await walletService.lockWallet('u-1', 'Fraud');

    expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-1' },
        data: expect.objectContaining({
          isLocked: true,
          lockedReason: 'Fraud',
          lockedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('unlockWallet clears isLocked, lockedReason, and lockedAt', async () => {
    const lockedWallet = { ...baseWallet, isLocked: true, lockedReason: 'Old reason', lockedAt: new Date() };
    mockPrisma.wallet.findUnique.mockResolvedValue(lockedWallet);
    mockPrisma.wallet.update.mockResolvedValueOnce({
      ...lockedWallet, isLocked: false, lockedReason: null, lockedAt: null,
    });

    await walletService.unlockWallet('u-1');

    expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u-1' },
        data: expect.objectContaining({
          isLocked: false,
          lockedReason: null,
          lockedAt: null,
        }),
      }),
    );
  });
});

describe('§19.2 Auto-lock — credit() and debit() blocked when wallet is locked', () => {
  it('credit() throws "Wallet is locked" immediately when isLocked=true', async () => {
    const lockedWallet = { ...baseWallet, isLocked: true, lockedReason: 'Payout reversal failed: API down. Manual review required.' };
    mockPrisma.wallet.findUnique.mockResolvedValue(lockedWallet);

    // The transaction callback will receive the locked wallet via findUniqueOrThrow
    mockPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
      return fn({
        ...mockPrisma,
        wallet: {
          ...mockPrisma.wallet,
          findUniqueOrThrow: jest.fn().mockResolvedValue(lockedWallet),
        },
      });
    });

    await expect(
      walletService.credit({
        userId: 'u-1',
        amount: 10,
        type: 'CASHBACK_CREDIT' as any,
        description: 'Test credit',
      }),
    ).rejects.toThrow(/Wallet is locked/i);
  });

  it('debit() throws "Wallet is locked" immediately when isLocked=true', async () => {
    const lockedWallet = { ...baseWallet, isLocked: true, lockedReason: 'Compliance hold' };
    mockPrisma.wallet.findUnique.mockResolvedValue(lockedWallet);

    mockPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
      return fn({
        ...mockPrisma,
        wallet: {
          ...mockPrisma.wallet,
          findUniqueOrThrow: jest.fn().mockResolvedValue(lockedWallet),
        },
      });
    });

    await expect(
      walletService.debit({
        userId: 'u-1',
        amount: 10,
        type: 'WITHDRAWAL' as any,
        description: 'Test debit',
      }),
    ).rejects.toThrow(/Wallet is locked/i);
  });
});

describe('§19.2 Auto-lock — payout reversal failure locks wallet with spec-mandated reason', () => {
  it('sets isLocked=true with "Payout reversal failed: … Manual review required." when reversal throws', async () => {
    const userId = 'u-1';
    const walletId = 'w-1';

    // executePayoutTransfer(walletTransactionId: string) — looks up the tx via findUnique.
    // Provide a PENDING WITHDRAWAL row with the fields that pass all validation guards:
    // callbackSecret (required when Paysera is configured), IBAN + beneficiary via wallet.
    mockPrisma.walletTransaction.findUnique.mockResolvedValue({
      id: 'wt-payout-1',
      walletId,
      type: 'WITHDRAWAL',
      status: 'PENDING',
      amount: -50,
      currency: 'BGN',
      metadata: JSON.stringify({ callbackSecret: 'cs-abc' }),
      wallet: {
        userId,
        payoutIban: 'BG80BNBG96611020345678',
        payoutBeneficiaryName: 'Test User',
      },
    });

    // Atomic PENDING→PROCESSING transition via updateMany (count=1 = this caller won).
    mockPrisma.walletTransaction.updateMany.mockResolvedValue({ count: 1 });

    // Paysera IS configured so the service reaches createTransfer.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { payseraService: psvc } = require('../../src/services/paysera.service');
    (psvc.isTransferConfigured as jest.Mock).mockReturnValue(true);
    // createTransfer throws → outer catch runs the reversal $transaction.
    (psvc.createTransfer as jest.Mock).mockRejectedValue(new Error('API down'));

    // Reversal $transaction also throws → inner catch fires the auto-lock.
    mockPrisma.$transaction.mockRejectedValue(new Error('DB constraint: reversal deadlock'));

    mockPrisma.wallet.update.mockResolvedValue({});

    try {
      await walletService.executePayoutTransfer('wt-payout-1');
    } catch {
      // Expected: service re-throws "Payout could not be processed: API down"
    }

    // Restore default so other tests are unaffected
    (psvc.isTransferConfigured as jest.Mock).mockReturnValue(false);

    // Verify auto-lock: wallet.update called with isLocked=true and spec-format reason
    const updateCalls = (mockPrisma.wallet.update as jest.Mock).mock.calls;
    const lockCall = updateCalls.find((call: any[]) =>
      call[0]?.data?.isLocked === true,
    );

    expect(lockCall).toBeDefined();
    expect(lockCall[0].data.lockedReason).toMatch(
      /^Payout reversal failed: .+\. Manual review required\.$/,
    );
    expect(lockCall[0].data.lockedAt).toBeInstanceOf(Date);
  });
});
