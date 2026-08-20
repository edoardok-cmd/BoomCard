/**
 * BC-QA-031 — money-display regression guards.
 *
 * The dual-currency (BGN alongside EUR) display feature was removed. Every
 * money-returning backend endpoint now emits plain EUR scalars, so the
 * frontend must format them verbatim. Before this task the partner-dashboard
 * still ran the old BGN→EUR conversion over those values:
 *
 *   - `formatWithCurrency(x, 'EUR_ONLY')` and `formatMoneyByMode(x, 'eur_only')`
 *     both returned `€${x / 1.95583}`, halving every figure (F1).
 *   - The admin alert threshold branch appended a hardcoded `лв`/`BGN` suffix
 *     to a value the backend now emits in EUR (F2).
 *
 * These tests pin the corrected behaviour at the formatter level; the
 * end-to-end render path is pinned by DashboardPage.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import { formatEUR } from './helpers';
import { formatThresholdTitle } from './adminAlertCatalog';

/**
 * BC-QA-031 r5-F7: `BGN_TO_EUR_RATE` was deleted from `helpers.ts` along with
 * the rest of the dual-currency layer, so the rate is spelled out here instead
 * of imported. This is the DEFECT's constant, kept local to the test that
 * describes the defect — importing it back into production code is what this
 * task removed. The self-check on the next line pins the arithmetic so the
 * literal cannot drift.
 */
const DEFECT_BGN_TO_EUR_RATE = 1.95583;

describe('formatEUR (BC-QA-031 F1)', () => {
  it('renders a backend EUR scalar verbatim, applying no conversion', () => {
    // The real /dashboard/me wallet payload the reviewer measured live.
    expect(formatEUR(42.5)).toBe('€42.50');
    expect(formatEUR(7)).toBe('€7.00');
  });

  it('does NOT divide by the BGN→EUR rate', () => {
    // The defect's output for the same inputs, spelled out so a reintroduced
    // division fails here rather than silently shipping.
    const halved = (n: number) => `€${(n / DEFECT_BGN_TO_EUR_RATE).toFixed(2)}`;
    expect(halved(42.5)).toBe('€21.73'); // guards the arithmetic in this test
    expect(formatEUR(42.5)).not.toBe(halved(42.5));
    expect(formatEUR(7)).not.toBe(halved(7));
  });

  it('rounds to two decimals and preserves sign', () => {
    expect(formatEUR(3.456)).toBe('€3.46');
    expect(formatEUR(0)).toBe('€0.00');
    expect(formatEUR(-12.3)).toBe('€-12.30');
  });

  it('renders an em-dash for missing / non-finite input instead of "€NaN"', () => {
    expect(formatEUR(undefined)).toBe('—');
    expect(formatEUR(null)).toBe('—');
    expect(formatEUR(Number.NaN)).toBe('—');
    expect(formatEUR(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatThresholdTitle (BC-QA-031 F2)', () => {
  it('labels the backend threshold in EUR, never in лв/BGN', () => {
    // adminAlerts.service.ts emits meta.threshold as bgnToEur(PAYOUT_THRESHOLD).
    const title = formatThresholdTitle('Абонати достигнали праг за изплащане', 25.56);
    expect(title).toBe('Абонати достигнали праг за изплащане (≥€25.56)');
    expect(title).not.toContain('лв');
    expect(title).not.toContain('BGN');
  });

  it('accepts a numeric string threshold and normalises it to two decimals', () => {
    expect(formatThresholdTitle('Alert', '25.5')).toBe('Alert (≥€25.50)');
  });

  it('leaves the title untouched when no threshold is supplied', () => {
    expect(formatThresholdTitle('Alert', undefined)).toBe('Alert');
    expect(formatThresholdTitle('Alert', null)).toBe('Alert');
    expect(formatThresholdTitle('Alert', { bgn: 50, eur: 25.56 })).toBe('Alert');
    expect(formatThresholdTitle('Alert', 'not-a-number')).toBe('Alert');
  });
});
