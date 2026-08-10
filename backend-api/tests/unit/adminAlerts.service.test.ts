/**
 * Unit tests for the admin alerts service (spec §3.2).
 *
 * Focus: the alert-side behaviour that diverges from the click-through page
 * is the most likely source of bugs, so these tests pin:
 *   - failed_payouts_pipeline counts only WITHDRAWAL FAILED rows
 *   - fraud_check_errors counts only active-status scans (not resolved ones)
 *   - risk-tier alerts count only active-status scans
 *   - HIGH_BILL_AMOUNT lives in SUSPICIOUS_EXACT_CODES (moved from prefix to exact)
 *   - alert links match the route filters they expect
 *   - the suspicious-activity raw query uses the parameterised IN/LIKE form
 */

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    systemSetting: { findUnique: jest.fn() },
    payoutThreshold: { findFirst: jest.fn() },
    partner: { count: jest.fn() },
    stickerScan: { count: jest.fn() },
    partnerCashbackPayment: { count: jest.fn() },
    reportingPeriod: { count: jest.fn() },
    dispute: { count: jest.fn() },
    subscription: { count: jest.fn() },
    transaction: { count: jest.fn() },
    user: { count: jest.fn() },
    walletTransaction: { count: jest.fn() },
    wallet: { count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../../src/lib/prisma';
import {
  getAlerts,
  ACTIVE_SCAN_STATUSES,
  SUSPICIOUS_EXACT_CODES,
  SUSPICIOUS_PREFIX_CODES,
  SUSPICIOUS_ACTIVITY_WINDOW_HOURS,
} from '../../src/services/adminAlerts.service';
import { invalidatePayoutThresholdCache } from '../../src/utils/payoutThreshold';
import { bgnToEur } from '../../src/utils/currency';

type AnyMock = jest.Mock;
const m = prisma as unknown as {
  systemSetting: { findUnique: AnyMock };
  payoutThreshold: { findFirst: AnyMock };
  partner: { count: AnyMock };
  stickerScan: { count: AnyMock };
  partnerCashbackPayment: { count: AnyMock };
  reportingPeriod: { count: AnyMock };
  dispute: { count: AnyMock };
  subscription: { count: AnyMock };
  transaction: { count: AnyMock };
  user: { count: AnyMock };
  walletTransaction: { count: AnyMock };
  wallet: { count: AnyMock };
  $queryRaw: AnyMock;
};

// failed_transactions binds to the service's local `oneDayAgo` (24h), NOT to
// SUSPICIOUS_ACTIVITY_WINDOW_HOURS. Named here so the assertion reads as
// intent rather than magic numbers.
const FAILED_TX_WINDOW_HOURS = 24;

function resetAllToZero() {
  m.systemSetting.findUnique.mockResolvedValue(null);
  m.payoutThreshold.findFirst.mockResolvedValue(null); // → utility falls back to compile-time constants
  m.partner.count.mockResolvedValue(0);
  m.stickerScan.count.mockResolvedValue(0);
  m.partnerCashbackPayment.count.mockResolvedValue(0);
  m.reportingPeriod.count.mockResolvedValue(0);
  m.dispute.count.mockResolvedValue(0);
  m.subscription.count.mockResolvedValue(0);
  m.transaction.count.mockResolvedValue(0);
  m.user.count.mockResolvedValue(0);
  m.walletTransaction.count.mockResolvedValue(0);
  m.wallet.count.mockResolvedValue(0);
  m.$queryRaw.mockResolvedValue([{ count: 0n }]);
}

describe('adminAlerts.service constants', () => {
  it('HIGH_BILL_AMOUNT is in SUSPICIOUS_EXACT_CODES (exact match, no suffix)', () => {
    expect(SUSPICIOUS_EXACT_CODES).toContain('HIGH_BILL_AMOUNT');
    expect(SUSPICIOUS_PREFIX_CODES).not.toContain('HIGH_BILL_AMOUNT');
  });

  it('ACTIVE_SCAN_STATUSES is exactly the three pre-resolution states', () => {
    expect([...ACTIVE_SCAN_STATUSES].sort()).toEqual(['MANUAL_REVIEW', 'PENDING', 'VALIDATING']);
  });

  it('SUSPICIOUS_EXACT_CODES has no overlap with prefix codes', () => {
    const overlap = (SUSPICIOUS_EXACT_CODES as readonly string[]).filter((c) =>
      (SUSPICIOUS_PREFIX_CODES as readonly string[]).includes(c),
    );
    expect(overlap).toEqual([]);
  });
});

describe('adminAlerts.service.getAlerts query shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePayoutThresholdCache(); // ensure each test starts with a fresh threshold lookup
    resetAllToZero();
  });

  it('large_pending_payouts uses lte:-threshold because WITHDRAWAL amounts are stored negative (Bug 1 fix)', async () => {
    // WITHDRAWAL amounts are stored as negatives (wallet.service.ts writes `amount: -payoutAmount`).
    // The alert MUST use `lte: -LARGE_TX_THRESHOLD` — using `gte: +threshold` would never match
    // any real withdrawal row and the alert would silently never fire.
    await getAlerts();
    const largeTxCall = m.walletTransaction.count.mock.calls.find(
      ([arg]) => arg?.where?.type === 'WITHDRAWAL' && arg?.where?.status === 'PENDING',
    );
    expect(largeTxCall).toBeDefined();
    const amountFilter = largeTxCall![0].where.amount;
    // Must use lte (≤) with a negative value — not gte (≥) with a positive.
    expect(amountFilter).toHaveProperty('lte');
    expect(amountFilter.lte).toBeLessThan(0);
    expect(amountFilter).not.toHaveProperty('gte');
  });

  it('failed_payouts_pipeline filters by type=WITHDRAWAL (B4 fix)', async () => {
    await getAlerts();
    // walletTransaction.count is called twice: once for failedWalletPayouts and
    // once for largePendingTx. Find the FAILED-status call.
    const failedCall = m.walletTransaction.count.mock.calls.find(
      ([arg]) => arg?.where?.status === 'FAILED',
    );
    expect(failedCall).toBeDefined();
    expect(failedCall![0].where).toEqual(
      expect.objectContaining({ type: 'WITHDRAWAL', status: 'FAILED' }),
    );
  });

  it('fraud_check_errors filters by ACTIVE_SCAN_STATUSES (B3 fix)', async () => {
    await getAlerts();
    // stickerScan.count is called for receiptReviews, highRiskScans, mediumRiskScans,
    // and fraudCheckErrorScans. Find the one keyed on FRAUD_CHECK_ERROR.
    const fraudErrCall = m.stickerScan.count.mock.calls.find(
      ([arg]) => arg?.where?.fraudReasons?.has === 'FRAUD_CHECK_ERROR',
    );
    expect(fraudErrCall).toBeDefined();
    expect(fraudErrCall![0].where.status).toBeDefined();
    expect(fraudErrCall![0].where.status.in).toEqual(
      expect.arrayContaining(['PENDING', 'VALIDATING', 'MANUAL_REVIEW']),
    );
  });

  it('high-risk and medium-risk scan counts are restricted to ACTIVE_SCAN_STATUSES', async () => {
    await getAlerts();
    const highCall = m.stickerScan.count.mock.calls.find(
      ([arg]) => arg?.where?.fraudScore?.gte === 61,
    );
    const medCall = m.stickerScan.count.mock.calls.find(
      ([arg]) => arg?.where?.fraudScore?.gte === 31 && arg?.where?.fraudScore?.lt === 61,
    );
    expect(highCall![0].where.status.in).toEqual(
      expect.arrayContaining(['PENDING', 'VALIDATING', 'MANUAL_REVIEW']),
    );
    expect(medCall![0].where.status.in).toEqual(
      expect.arrayContaining(['PENDING', 'VALIDATING', 'MANUAL_REVIEW']),
    );
  });

  it('suspicious-activity raw query passes both exact codes and prefix patterns as text[] params, plus the configured window start as a Date', async () => {
    const before = Date.now();
    await getAlerts();
    expect(m.$queryRaw).toHaveBeenCalledTimes(1);
    // Prisma's tagged-template form receives a TemplateStringsArray + values.
    // We assert the values include the exact-codes array and the prefix-pattern
    // array (each prefix appended with `:%`), plus a Date that's ~window-hours ago.
    const callArgs = m.$queryRaw.mock.calls[0];
    const values = callArgs.slice(1);
    const exactCodes = values.find(
      (v: unknown) => Array.isArray(v) && (v as string[]).includes('DUPLICATE_IMAGE'),
    );
    const prefixPatterns = values.find(
      (v: unknown) => Array.isArray(v) && (v as string[]).some((s) => s === 'MERCHANT_MISMATCH:%'),
    );
    const windowStart = values.find((v: unknown) => v instanceof Date) as Date | undefined;
    expect(exactCodes).toBeDefined();
    expect(prefixPatterns).toBeDefined();
    expect(windowStart).toBeDefined();
    // Sanity: every prefix pattern ends with ":%"
    (prefixPatterns as string[]).forEach((p) => expect(p).toMatch(/:%$/));
    // Window start is ~SUSPICIOUS_ACTIVITY_WINDOW_HOURS before the call (within 1min skew)
    const expectedMs = SUSPICIOUS_ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000;
    const elapsed = before - (windowStart as Date).getTime();
    expect(elapsed).toBeGreaterThanOrEqual(expectedMs - 60_000);
    expect(elapsed).toBeLessThanOrEqual(expectedMs + 60_000);
  });
});

describe('adminAlerts.service.getAlerts emitted links (B1, B2, B3, B5 fixes)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAllToZero();
    // Force every alert to emit by returning >0 from each query.
    m.partner.count.mockResolvedValue(1);
    m.stickerScan.count.mockResolvedValue(1);
    m.partnerCashbackPayment.count.mockResolvedValue(1);
    m.reportingPeriod.count.mockResolvedValue(1);
    m.dispute.count.mockResolvedValue(1);
    m.subscription.count.mockResolvedValue(1);
    m.transaction.count.mockResolvedValue(1);
    m.user.count.mockResolvedValue(1);
    m.walletTransaction.count.mockResolvedValue(1);
    m.wallet.count.mockResolvedValue(1);
    m.$queryRaw.mockResolvedValue([{ count: 1n }]);
  });

  it('high-risk alert (61+) is CRITICAL and medium-risk alert (31-60) is OPERATIONAL with correct deep-links', async () => {
    const result = await getAlerts();
    const high = result.critical.find((a) => a.id === 'risk_transactions');
    // medium_risk_transactions moved to OPERATIONAL — 31-60 needs review, not immediate action
    const med = result.operational.find((a) => a.id === 'medium_risk_transactions');
    expect(high?.link).toBe('/admin/control/risk?bucket=HIGH_61_PLUS&status=active');
    expect(med?.link).toBe('/admin/control/risk?bucket=REVIEW_31_60&status=active');
    expect(high?.tier).toBe('critical');
    expect(med?.tier).toBe('operational');
  });

  it('fraud_check_errors deep-links with reasons + status=active', async () => {
    const result = await getAlerts();
    const fce = result.critical.find((a) => a.id === 'fraud_check_errors');
    expect(fce?.link).toBe('/admin/control/risk?reasons=FRAUD_CHECK_ERROR&status=active');
  });

  it('suspicious_activity deep-link forwards dateFromHours=SUSPICIOUS_ACTIVITY_WINDOW_HOURS so the page count matches the alert badge (B-A1 fix)', async () => {
    const result = await getAlerts();
    const sus = result.critical.find((a) => a.id === 'suspicious_activity');
    expect(sus?.link).toBe(
      `/admin/control/risk?suspicious=true&status=active&dateFromHours=${SUSPICIOUS_ACTIVITY_WINDOW_HOURS}`,
    );
    expect(sus?.meta?.windowHours).toBe(SUSPICIOUS_ACTIVITY_WINDOW_HOURS);
    // dateFrom is the alert's window start as ISO — the page can render it next to the chip if needed.
    expect(typeof sus?.meta?.dateFrom).toBe('string');
    expect(() => new Date(sus!.meta!.dateFrom as string).toISOString()).not.toThrow();
  });

  it('failed_payouts_pipeline deep-links to /admin/finance/payouts?status=FAILED (spec §3.2 destination)', async () => {
    const result = await getAlerts();
    const fpp = result.critical.find((a) => a.id === 'failed_payouts_pipeline');
    expect(fpp?.link).toBe('/admin/finance/payouts?status=FAILED');
  });

  it('large_pending_payouts link bakes minAmount=LARGE_TX_THRESHOLD (HIGH#1 fix)', async () => {
    // Default fallback is 500 when systemSetting.findUnique returns null.
    // The deep-link's minAmount stays BGN (it filters the raw DB column
    // directly), but meta.threshold is a display value — BC-QA-031 converts
    // it to EUR, same as every other admin money field in this response.
    const result = await getAlerts();
    const lpp = result.operational.find((a) => a.id === 'large_pending_payouts');
    expect(lpp?.link).toBe('/admin/subscribers/transactions?view=wallet&status=PENDING&minAmount=500');
    expect(lpp?.meta).toEqual({ threshold: bgnToEur(500) });
  });

  it('failed_transactions is OPERATIONAL and carries 24h dateFrom in meta (HIGH#2 fix + tier correction)', async () => {
    const result = await getAlerts();
    const ft = result.operational.find((a) => a.id === 'failed_transactions');
    expect(ft).toBeDefined();
    expect(ft?.tier).toBe('operational');
    expect(ft?.meta?.['dateFrom']).toBeDefined();
    // ISO string parses to a date roughly 24h before now.
    const dateFrom = new Date(ft?.meta?.['dateFrom'] as string);
    const ageMs = Date.now() - dateFrom.getTime();
    expect(ageMs).toBeGreaterThan((FAILED_TX_WINDOW_HOURS - 0.1) * 60 * 60 * 1000);
    expect(ageMs).toBeLessThan((FAILED_TX_WINDOW_HOURS + 0.1) * 60 * 60 * 1000);
  });

  it('payout_threshold carries min-plan threshold in meta, converted to EUR (MEDIUM#5 fix + BC-QA-031)', async () => {
    // No DB rows → utility falls back to compile-time constants.
    // Min across plans: PREMIUM_WEEKLY 19.56 BGN < PREMIUM 29.34 BGN < BASIC 39.12 BGN.
    // BC-QA-031 — meta.threshold is a display value: BGN storage converts to
    // EUR (19.56 BGN → 10.00 EUR) before it reaches the response.
    const result = await getAlerts();
    const pt = result.operational.find((a) => a.id === 'payout_threshold');
    expect(pt?.meta).toEqual({ threshold: bgnToEur(19.56) });
    expect(pt?.meta?.threshold).toBeCloseTo(10, 2);
    // Title is now static — the threshold is rendered by the frontend from meta.
    expect(pt?.title).toBe('Абонати достигнали праг за изплащане');
  });

  it('all emitted alert tiers are lowercase strings matching the frontend AlertTier type (Bug 3 fix)', async () => {
    // Backend AlertTier was uppercase ('CRITICAL' etc.) but the frontend normalizes on ingestion.
    // After the fix, the wire values must be lowercase so normalizeTier() is purely defensive.
    const result = await getAlerts();
    const allAlerts = [...result.critical, ...result.operational, ...result.informational];
    expect(allAlerts.length).toBeGreaterThan(0);
    for (const alert of allAlerts) {
      expect(alert.tier).toMatch(/^(critical|operational|informational)$/);
      expect(alert.tier).not.toMatch(/^(CRITICAL|OPERATIONAL|INFORMATIONAL)$/);
    }
  });

  it('medium_risk_transactions is in operational, not critical (Design fix — 31-60 is review, not immediate action)', async () => {
    const result = await getAlerts();
    const inCritical = result.critical.find((a) => a.id === 'medium_risk_transactions');
    const inOperational = result.operational.find((a) => a.id === 'medium_risk_transactions');
    expect(inCritical).toBeUndefined();
    expect(inOperational).toBeDefined();
    expect(inOperational?.tier).toBe('operational');
  });

  it('failed_transactions is OPERATIONAL (routine monitoring) while failed_payouts_pipeline is CRITICAL (system error)', async () => {
    // Spec §3.1: failed_transactions records business tx decline noise (OPERATIONAL);
    // failed_payouts_pipeline is a system failure requiring immediate action (CRITICAL).
    // These must be segregated so admins quickly distinguish routine payment noise from
    // critical payout infrastructure failures.
    const result = await getAlerts();
    const ft = result.operational.find((a) => a.id === 'failed_transactions');
    const fpp = result.critical.find((a) => a.id === 'failed_payouts_pipeline');
    expect(ft).toBeDefined();
    expect(fpp).toBeDefined();
    expect(ft?.tier).toBe('operational');
    expect(fpp?.tier).toBe('critical');
    // Distinct links: failed_transactions → Finance reports, failed_payouts_pipeline → Finance payouts
    expect(ft?.link).toContain('/admin/finance/reports');
    expect(fpp?.link).toContain('/admin/finance/payouts');
  });

  it('parseSetting falls back to defaults when large_tx_threshold systemSetting is non-numeric', async () => {
    // Simulate a corrupted/manually-edited row: parseFloat returns NaN → must fall back
    // (otherwise the gte/lte comparisons would silently return zero rows).
    //
    // Note: payout_threshold is no longer read from SystemSetting — it comes from the
    // PayoutThreshold DB table via getPayoutThresholdBGN (min across plan thresholds).
    //
    // jest.clearAllMocks() (called in beforeEach) clears call history but NOT
    // implementations, so a mockImplementation set here would leak into the next
    // test if `resetAllToZero()` ever stops re-mocking systemSetting. Reset
    // defensively so test isolation doesn't depend on that contract.
    try {
      m.systemSetting.findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
        if (where.key === 'large_tx_threshold') return Promise.resolve({ value: '' });
        return Promise.resolve(null);
      });
      const result = await getAlerts();
      const pt = result.operational.find((a) => a.id === 'payout_threshold');
      const lpp = result.operational.find((a) => a.id === 'large_pending_payouts');
      // payout_threshold uses min plan threshold (PREMIUM_WEEKLY fallback = 19.56 BGN),
      // converted to EUR for the display meta (BC-QA-031).
      expect(pt?.meta).toEqual({ threshold: bgnToEur(19.56) });
      // large_tx_threshold falls back to 500 (BGN) when value is empty string;
      // meta.threshold is the EUR-converted display value.
      expect(lpp?.meta).toEqual({ threshold: bgnToEur(500) });
      expect(lpp?.link).toBe('/admin/subscribers/transactions?view=wallet&status=PENDING&minAmount=500');
    } finally {
      m.systemSetting.findUnique.mockReset();
    }
  });
});
