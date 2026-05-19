/**
 * §16 — Receipt Approval Limitations & Rate Limits
 *
 * §16.1 Submission Rate Limits
 *   - daily submissions >= maxDaily → +30 pts, DAILY_LIMIT_EXCEEDED
 *   - monthly submissions >= maxMonthly → +30 pts, MONTHLY_LIMIT_EXCEEDED
 *   - both can fire together (independent checks)
 *
 * §16.2 Rapid Submission Detection
 *   - 3+ receipts in 5-min window → +15 pts, RAPID_SUBMISSIONS
 *   - RAPID_SUBMISSIONS and UNUSUAL_TIME both fire independently (non-exclusive)
 *
 * §16.4 Deduplication
 *   - SHA-256 exact duplicate in APPROVED/PENDING/MANUAL_REVIEW → +40 pts, DUPLICATE_IMAGE
 *   - SHA-256 duplicate in REJECTED only → no flag (allow re-submission)
 *   - Perceptual hash (dHash) Hamming distance ≤10 → +35 pts, PERCEPTUAL_DUPLICATE_CLOSE
 *   - Perceptual hash Hamming distance 11–20 → +15 pts, PERCEPTUAL_DUPLICATE_MODERATE
 *   - dHash ≤10 takes precedence over moderate (mutually exclusive)
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  receipt: {
    count: jest.fn(async () => 0),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    aggregate: jest.fn(async () => ({ _sum: { cashbackAmount: null } })),
  },
  stickerScan: {
    findFirst: jest.fn(async () => null),
    aggregate: jest.fn(async () => ({ _sum: { cashbackAmount: null } })),
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
  walletTransaction: {
    aggregate: jest.fn(async () => ({ _sum: { amount: null } })),
  },
  user: {
    findMany: jest.fn(async () => []),
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

jest.mock('../../src/utils/systemSettings', () => ({
  getSystemSettingInt: jest.fn(async (_key: string, fallback: number) => fallback),
  getSystemSettingFloat: jest.fn(async (_key: string, fallback: number) => fallback),
  getSystemSettingStr: jest.fn(async (_key: string, fallback: string) => fallback),
  invalidateSystemSettingCache: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/ocr.service', () => ({
  ocrService: { processImage: jest.fn(async () => ({ text: '', confidence: 0, merchantName: null, amount: null })) },
}));

jest.mock('../../src/services/receiptTemplate.service', () => ({
  receiptTemplateService: { compareAgainstTemplates: jest.fn(async () => ({ score: 0, isMatch: false })) },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { fraudDetectionService } from '../../src/services/fraudDetection.service';
import {
  RAPID_SUBMISSION_WINDOW_MS,
  RAPID_SUBMISSION_COUNT_THRESHOLD,
  UNUSUAL_HOUR_START,
  UNUSUAL_HOUR_END,
} from '../../src/constants/receipt.constants';

// ─── Base checkReceipt params (minimal, passes all other checks) ──────────────

const baseParams = {
  userId: 'u-1',
  imageHash: 'deadbeef',
  ocrConfidence: 95,
  userAmount: 100,
};

// Params that include venueId — required for rate-limit tests so getVenueConfig()
// is invoked and per-venue maxScansPerDay / maxScansPerMonth are applied.
const baseParamsWithVenue = { ...baseParams, venueId: 'venue-1' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockPrisma.receipt.count.mockResolvedValue(0);
  mockPrisma.receipt.findFirst.mockResolvedValue(null);
  mockPrisma.receipt.findMany.mockResolvedValue([]);
  mockPrisma.stickerScan.findFirst.mockResolvedValue(null);
  mockPrisma.venue.findUnique.mockResolvedValue(null);
  mockPrisma.venueFraudConfig.findUnique.mockResolvedValue(null);
  mockPrisma.venueFraudConfig.findFirst.mockResolvedValue(null);
  mockPrisma.merchantWhitelist.findUnique.mockResolvedValue(null);
  mockPrisma.cashbackRate.findFirst.mockResolvedValue(null);
  mockPrisma.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mockPrisma.receipt.aggregate.mockResolvedValue({ _sum: { cashbackAmount: null } });
  mockPrisma.stickerScan.aggregate.mockResolvedValue({ _sum: { cashbackAmount: null } });
  mockPrisma.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// §16.1 — Submission Rate Limits (+30 pts each)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§16.1 Submission rate limits', () => {
  // Helper: return a venue fraud config with finite scan limits.
  // getVenueConfig() calls venueFraudConfig.findUnique (per-partner lookup) first;
  // we mock that because baseParamsWithVenue always supplies a venueId.
  function mockVenueConfig(maxScansPerDay: number, maxScansPerMonth: number) {
    mockPrisma.venueFraudConfig.findUnique.mockResolvedValueOnce({
      maxScansPerDay,
      maxScansPerMonth,
      gpsVerificationEnabled: false,
      ocrVerificationEnabled: false,
      maxCashbackPerScan: null,
    });
  }

  it('daily limit exceeded → +30 pts and DAILY_LIMIT_EXCEEDED reason', async () => {
    mockVenueConfig(5, 999999);
    // getUserStats receipt.count calls: (1) daily window, (2) monthly window
    // checkTimePattern receipt.count call: (3) rapid-submission 5-min window
    mockPrisma.receipt.count
      .mockResolvedValueOnce(5)  // submissionsToday >= maxScansPerDay(5)
      .mockResolvedValueOnce(1)  // submissionsThisMonth (below limit)
      .mockResolvedValue(0);     // rapid-submission check

    const result = await fraudDetectionService.checkReceipt(baseParamsWithVenue);

    expect(result.fraudReasons).toContain('DAILY_LIMIT_EXCEEDED');
    expect(result.fraudScore).toBeGreaterThanOrEqual(30);
  });

  it('monthly limit exceeded → +30 pts and MONTHLY_LIMIT_EXCEEDED reason', async () => {
    mockVenueConfig(999999, 10);
    mockPrisma.receipt.count
      .mockResolvedValueOnce(1)   // submissionsToday (within daily limit)
      .mockResolvedValueOnce(10)  // submissionsThisMonth >= maxScansPerMonth(10)
      .mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(baseParamsWithVenue);

    expect(result.fraudReasons).toContain('MONTHLY_LIMIT_EXCEEDED');
    expect(result.fraudScore).toBeGreaterThanOrEqual(30);
  });

  it('both daily and monthly limits exceeded → +60 pts total', async () => {
    mockVenueConfig(3, 5);
    mockPrisma.receipt.count
      .mockResolvedValueOnce(3)  // daily >= 3
      .mockResolvedValueOnce(5)  // monthly >= 5
      .mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(baseParamsWithVenue);

    expect(result.fraudReasons).toContain('DAILY_LIMIT_EXCEEDED');
    expect(result.fraudReasons).toContain('MONTHLY_LIMIT_EXCEEDED');
    expect(result.fraudScore).toBeGreaterThanOrEqual(60);
  });

  it('within limits → no rate-limit fraud reasons', async () => {
    mockVenueConfig(10, 100);
    // Only 2 today and 5 this month — well under limits
    mockPrisma.receipt.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5)
      .mockResolvedValue(0);

    const result = await fraudDetectionService.checkReceipt(baseParamsWithVenue);

    expect(result.fraudReasons).not.toContain('DAILY_LIMIT_EXCEEDED');
    expect(result.fraudReasons).not.toContain('MONTHLY_LIMIT_EXCEEDED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §16.2 — Rapid Submission Detection (+15 pts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§16.2 Rapid submission detection', () => {
  it(`${RAPID_SUBMISSION_COUNT_THRESHOLD}+ receipts in ${RAPID_SUBMISSION_WINDOW_MS / 60000}-min window → +15 pts, RAPID_SUBMISSIONS`, async () => {
    // receipt.count:
    //   call 1: submissionsToday (getUserStats)
    //   call 2: submissionsThisMonth (getUserStats)
    //   call 3: recentSubmissions (checkTimePattern — 5-min window)
    mockPrisma.receipt.count
      .mockResolvedValueOnce(0)                              // daily
      .mockResolvedValueOnce(0)                              // monthly
      .mockResolvedValueOnce(RAPID_SUBMISSION_COUNT_THRESHOLD); // rapid window: exactly at threshold

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).toContain('RAPID_SUBMISSIONS');
    expect(result.fraudScore).toBeGreaterThanOrEqual(15);
  });

  it('fewer than threshold in window → RAPID_SUBMISSIONS not triggered', async () => {
    mockPrisma.receipt.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(RAPID_SUBMISSION_COUNT_THRESHOLD - 1);

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).not.toContain('RAPID_SUBMISSIONS');
  });

  it('RAPID_SUBMISSIONS and UNUSUAL_TIME both fire when 3+ receipts at unusual hour', async () => {
    // Pin time to 3:00 AM (within UNUSUAL_HOUR_START=2 to UNUSUAL_HOUR_END=6)
    const unusualHour = UNUSUAL_HOUR_START + 1; // 3 AM
    const now = new Date();
    now.setHours(unusualHour, 0, 0, 0);
    jest.useFakeTimers({ now });

    mockPrisma.receipt.count
      .mockResolvedValueOnce(0)                               // daily
      .mockResolvedValueOnce(0)                               // monthly
      .mockResolvedValueOnce(RAPID_SUBMISSION_COUNT_THRESHOLD + 1); // rapid (> threshold)

    const result = await fraudDetectionService.checkReceipt(baseParams);

    // Both signals fire independently — total = 15 + 10 = 25 pts from time patterns alone
    expect(result.fraudReasons).toContain('RAPID_SUBMISSIONS');
    expect(result.fraudReasons).toContain('UNUSUAL_TIME');
    // Combined contribution ≥ 25 pts
    expect(result.fraudScore).toBeGreaterThanOrEqual(25);
  });

  afterEach(() => {
    jest.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §16.4 — Deduplication
// ═══════════════════════════════════════════════════════════════════════════════

describe('§16.4 SHA-256 exact deduplication', () => {
  it('matching SHA-256 in APPROVED receipt → +40 pts, DUPLICATE_IMAGE', async () => {
    // checkDuplicate: receipt.findFirst returns a match
    mockPrisma.receipt.findFirst.mockResolvedValueOnce({ id: 'r-prev', status: 'APPROVED' });

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).toContain('DUPLICATE_IMAGE');
    expect(result.fraudScore).toBeGreaterThanOrEqual(40);
  });

  it('matching SHA-256 in PENDING receipt → +40 pts, DUPLICATE_IMAGE', async () => {
    mockPrisma.receipt.findFirst.mockResolvedValueOnce({ id: 'r-prev', status: 'PENDING' });

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).toContain('DUPLICATE_IMAGE');
    expect(result.fraudScore).toBeGreaterThanOrEqual(40);
  });

  it('duplicate found in StickerScan table (not Receipt) → +40 pts, DUPLICATE_IMAGE', async () => {
    // receipt.findFirst returns null, but stickerScan.findFirst returns match
    mockPrisma.receipt.findFirst.mockResolvedValueOnce(null);
    mockPrisma.stickerScan.findFirst.mockResolvedValueOnce({ id: 'ss-prev', status: 'PENDING' });

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).toContain('DUPLICATE_IMAGE');
    expect(result.fraudScore).toBeGreaterThanOrEqual(40);
  });

  it('SHA-256 match exists only in REJECTED state → no duplicate flag (allow re-submission)', async () => {
    // checkDuplicate only checks APPROVED/PENDING/MANUAL_REVIEW — REJECTED is excluded
    // so mock returns null (the WHERE clause excludes REJECTED)
    mockPrisma.receipt.findFirst.mockResolvedValueOnce(null);
    mockPrisma.stickerScan.findFirst.mockResolvedValueOnce(null);

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).not.toContain('DUPLICATE_IMAGE');
  });

  it('no duplicate → no DUPLICATE_IMAGE flag', async () => {
    mockPrisma.receipt.findFirst.mockResolvedValueOnce(null);
    mockPrisma.stickerScan.findFirst.mockResolvedValueOnce(null);

    const result = await fraudDetectionService.checkReceipt(baseParams);

    expect(result.fraudReasons).not.toContain('DUPLICATE_IMAGE');
  });
});

describe('§16.4 Perceptual hash (dHash) deduplication', () => {
  // Two 16-hex-char hashes; Hamming distance is controlled by varying nibbles.
  // The fraudDetectionService uses per-nibble XOR popcount.

  it('dHash Hamming distance ≤10 → +35 pts, PERCEPTUAL_DUPLICATE_CLOSE', async () => {
    // Submit with perceptualHash 'aaaaaaaaaaaaaaaa'
    // Existing receipt has hash 'aaaaaaaaaaaaaaab' → XOR of last nibble = 0xa^0xb = 0x1 → 1 bit
    // Distance = 1 ≤ threshold (10) → isClose = true
    mockPrisma.receipt.findMany.mockResolvedValueOnce([
      { perceptualHash: 'aaaaaaaaaaaaaaab' },
    ]);

    const result = await fraudDetectionService.checkReceipt({
      ...baseParams,
      perceptualHash: 'aaaaaaaaaaaaaaaa',
    });

    expect(result.fraudReasons).toContain('PERCEPTUAL_DUPLICATE_CLOSE');
    expect(result.fraudScore).toBeGreaterThanOrEqual(35);
    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_MODERATE');
  });

  it('dHash Hamming distance 11–20 → +15 pts, PERCEPTUAL_DUPLICATE_MODERATE', async () => {
    // We need distance > 10 and ≤ 20. Use 3 nibbles differing by 0xf XOR 0x0 = 15 → 4 bits each → 12 bits total
    // Hash A: 'aaa0000000000000'
    // Hash B: 'aaf0000000000000' → nibble[2] = 'a' XOR 'f' = 0xa ^ 0xf = 5 → popcount(5=0101) = 2 bits... hmm
    // Let me be more careful. 0xa=1010, 0xf=1111, XOR=0101, popcount=2
    // For 11-20 range, need 11-20 bits total over 16 nibbles.
    // Use 3 nibbles at 4 bits each = 12 bits total (nibble '0' XOR 'f' = 0x0f = 4 bits):
    // 0x0 = 0000, 0xf = 1111, XOR = 1111 → popcount = 4 bits
    // 3 nibbles × 4 bits = 12 bits → isModerate = true (12 > 10 and 12 ≤ 20)
    mockPrisma.receipt.findMany.mockResolvedValueOnce([
      { perceptualHash: '0000000000000000' },
    ]);

    const result = await fraudDetectionService.checkReceipt({
      ...baseParams,
      // Compare 'fff0000000000000' vs '0000000000000000'
      // Nibbles 0,1,2: 'f'^'0' = 0xf = 4 bits each → 3 × 4 = 12 bits > 10, ≤ 20
      perceptualHash: 'fff0000000000000',
    });

    expect(result.fraudReasons).toContain('PERCEPTUAL_DUPLICATE_MODERATE');
    expect(result.fraudScore).toBeGreaterThanOrEqual(15);
    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_CLOSE');
  });

  it('dHash distance > 20 → no perceptual duplicate flag', async () => {
    // 6 nibbles × 4 bits each = 24 bits > 20 → neither flag
    mockPrisma.receipt.findMany.mockResolvedValueOnce([
      { perceptualHash: '0000000000000000' },
    ]);

    const result = await fraudDetectionService.checkReceipt({
      ...baseParams,
      perceptualHash: 'ffffff0000000000',
    });

    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_CLOSE');
    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_MODERATE');
  });

  it('no perceptual hash in params → perceptual check skipped entirely', async () => {
    const result = await fraudDetectionService.checkReceipt({
      ...baseParams,
      // no perceptualHash field
    });

    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_CLOSE');
    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_MODERATE');
    // receipt.findMany should not be called for perceptual check
    expect(mockPrisma.receipt.findMany).not.toHaveBeenCalled();
  });

  it('mismatched hash lengths → Infinity distance → no flag', async () => {
    // hexHammingDistance returns Infinity when lengths differ → neither threshold met
    mockPrisma.receipt.findMany.mockResolvedValueOnce([
      { perceptualHash: 'aabbccdd' }, // 8 chars
    ]);

    const result = await fraudDetectionService.checkReceipt({
      ...baseParams,
      perceptualHash: 'aabbccddee', // 10 chars — different length
    });

    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_CLOSE');
    expect(result.fraudReasons).not.toContain('PERCEPTUAL_DUPLICATE_MODERATE');
  });
});
