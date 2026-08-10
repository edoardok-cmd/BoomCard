/**
 * Unit Tests: format utils
 *
 * Regression coverage for BC-QA-031: the backend (`GET /api/wallet/balance`,
 * `/wallet/statistics`, `/wallet/transactions`) was changed to return
 * EUR-denominated plain numbers. The old `formatDualCurrency()` still
 * assumed its input was raw BGN — it labeled the value with a `лв` (BGN)
 * suffix and divided it a second time by `EUR_EXCHANGE_RATE`, producing a
 * mislabeled figure and a EUR amount roughly half the true value. It was
 * replaced by `formatEurAmount()`, a plain EUR formatter with no second
 * conversion.
 */

import { formatCurrency, formatEurAmount } from '../../utils/format';

describe('formatEurAmount', () => {
  it('formats a wallet balance as a plain EUR string with no BGN conversion', () => {
    // A wallet truly worth EUR 100.00 — backend now returns the plain number 100.
    expect(formatEurAmount(100)).toBe('€100.00');
  });

  it('does not divide the input a second time by EUR_EXCHANGE_RATE', () => {
    // The old formatDualCurrency(100) EUR half rendered as "€51.13"
    // (100 / 1.95583, an incorrect double conversion). The correct EUR figure
    // for an amount the backend already reports in EUR is the value itself.
    const result = formatEurAmount(100);
    expect(result).not.toContain('51.13');
    expect(result).toBe('€100.00');
  });

  it('never labels the amount with a лв (BGN) suffix', () => {
    expect(formatEurAmount(195.583)).not.toContain('лв');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatEurAmount(42.5)).toBe('€42.50');
    expect(formatEurAmount(0)).toBe('€0.00');
  });

  it('matches formatCurrency(amount, "EUR") directly', () => {
    expect(formatEurAmount(73.4)).toBe(formatCurrency(73.4, 'EUR'));
  });
});
