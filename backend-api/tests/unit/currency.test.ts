/**
 * BC-QA-031 (Step-4 regression fix) — unit coverage for `bgnToEur()`.
 *
 * This is the mechanical regression guard the reviewer flagged as missing:
 * `specConformFix009.test.ts`'s old "M7 — dual-currency display" block
 * asserted `bgnToEur(100)).toBeCloseTo(100 / EUR_TO_BGN_RATE, 2)` and was the
 * one test that would have caught the CRITICAL money-display bug (BGN→EUR
 * conversion silently dropped when the dual-currency display wrapper was
 * removed). This file restores that coverage against the new, permanent
 * `bgnToEur()` helper in `src/utils/currency.ts` — NOT the deleted
 * dual-currency/transition-window machinery, which stays gone.
 */

import { bgnToEur, toEur, toEurOrNull, sumMixedCurrencyToEur } from '../../src/utils/currency';
import { EUR_TO_BGN_RATE } from '../../src/constants/receipt.constants';

describe('bgnToEur — BGN→EUR conversion at the fixed currency-board rate', () => {
  it('converts the exact currency-board rate (1.95583 BGN) to 1 EUR', () => {
    expect(bgnToEur(EUR_TO_BGN_RATE)).toBeCloseTo(1, 2);
  });

  it('converts 100 BGN to the correctly-rounded EUR equivalent', () => {
    expect(bgnToEur(100)).toBeCloseTo(100 / EUR_TO_BGN_RATE, 2);
  });

  it('converts the exact wallet-seed regression value (195.583 BGN → 100.00 EUR)', () => {
    // This is the precise repro the Step-4 reviewer used against a live wallet:
    // a balance seeded at 195.583 BGN (the exact BGN-peg equivalent of €100.00)
    // was returned unconverted, overstating the true EUR value by ~96%.
    expect(bgnToEur(195.583)).toBeCloseTo(100, 2);
  });

  it('rounds to 2 decimal places', () => {
    expect(bgnToEur(19.56)).toBe(10);
    expect(bgnToEur(29.34)).toBe(15);
    expect(bgnToEur(39.12)).toBe(20);
  });

  it('converts 0 to 0', () => {
    expect(bgnToEur(0)).toBe(0);
  });

  it('does not return NaN or throw for negative amounts (debits/adjustments)', () => {
    expect(bgnToEur(-19.5583)).toBeCloseTo(-10, 2);
  });
});

/**
 * BC-QA-031 round 4 — the mixed-currency helpers.
 *
 * `Transaction.currency` is genuinely mixed: the schema default is BGN, but
 * POST /api/payments/create stores a caller-supplied currency that defaults to
 * EUR, and stripe.service.ts writes `(invoice.currency ?? 'bgn').toUpperCase()`.
 * A blanket `bgnToEur()` over that column halves every already-EUR row, and a
 * `_sum` taken across it is wrong before any conversion can run.
 */
describe('toEur — per-row conversion keyed on the row currency', () => {
  it('converts a BGN-denominated amount', () => {
    expect(toEur(19.5583, 'BGN')).toBeCloseTo(10, 2);
  });

  it('passes an EUR-denominated amount through untouched', () => {
    expect(toEur(25, 'EUR')).toBe(25);
  });

  it('is case-insensitive on the currency code', () => {
    expect(toEur(19.5583, 'bgn')).toBeCloseTo(10, 2);
    expect(toEur(25, 'eur')).toBe(25);
  });

  it('treats null/undefined as BGN, matching the schema column default', () => {
    expect(toEur(19.5583, null)).toBeCloseTo(10, 2);
    expect(toEur(19.5583, undefined)).toBeCloseTo(10, 2);
  });

  it('is idempotent for EUR — applying it twice does not halve the value', () => {
    expect(toEur(toEur(25, 'EUR'), 'EUR')).toBe(25);
  });
});

describe('toEurOrNull — nullable money columns', () => {
  it('returns null for a null/undefined amount rather than converting 0', () => {
    expect(toEurOrNull(null, 'BGN')).toBeNull();
    expect(toEurOrNull(undefined, 'BGN')).toBeNull();
  });

  it('converts a present BGN amount and passes a present EUR amount through', () => {
    expect(toEurOrNull(19.5583, 'BGN')).toBeCloseTo(10, 2);
    expect(toEurOrNull(25, 'EUR')).toBe(25);
  });

  it('converts a legitimate 0 rather than treating it as absent', () => {
    expect(toEurOrNull(0, 'BGN')).toBe(0);
  });
});

describe('sumMixedCurrencyToEur — folding per-currency DB subtotals', () => {
  it('converts each subtotal by its own currency before summing', () => {
    // 19.5583 BGN → 10.00 EUR, plus 25.00 EUR native = 35.00 EUR.
    expect(
      sumMixedCurrencyToEur([
        { currency: 'BGN', amount: 19.5583 },
        { currency: 'EUR', amount: 25 },
      ]),
    ).toBeCloseTo(35, 2);
  });

  it('differs from the broken blanket conversion of a combined sum', () => {
    // The defect this helper exists to prevent: summing first, converting once.
    const blanket = bgnToEur(19.5583 + 25);
    const correct = sumMixedCurrencyToEur([
      { currency: 'BGN', amount: 19.5583 },
      { currency: 'EUR', amount: 25 },
    ]);
    expect(blanket).toBeCloseTo(22.78, 2);
    expect(correct).toBeCloseTo(35, 2);
    expect(correct).not.toBeCloseTo(blanket, 2);
  });

  it('returns 0 for an empty group list (no matching rows)', () => {
    expect(sumMixedCurrencyToEur([])).toBe(0);
  });

  it('treats a null subtotal as 0 and a null currency as BGN', () => {
    expect(
      sumMixedCurrencyToEur([
        { currency: null, amount: 19.5583 },
        { currency: 'EUR', amount: null },
      ]),
    ).toBeCloseTo(10, 2);
  });

  it('is linear — a BGN subtotal folds identically to converting its rows one by one', () => {
    // bgnToEur is linear, so the group-level conversion must match the row-level
    // one up to the single 2dp rounding the helper documents.
    const rows = [10.0, 20.0, 30.5];
    const grouped = sumMixedCurrencyToEur([
      { currency: 'BGN', amount: rows.reduce((a, b) => a + b, 0) },
    ]);
    const perRow = rows.reduce((acc, r) => acc + bgnToEur(r), 0);
    expect(grouped).toBeCloseTo(perRow, 1);
  });

  it('handles negative subtotals (withdrawals are stored negative)', () => {
    expect(sumMixedCurrencyToEur([{ currency: 'BGN', amount: -19.5583 }])).toBeCloseTo(-10, 2);
  });
});
