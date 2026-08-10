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

import { bgnToEur } from '../../src/utils/currency';
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
