/**
 * BC-QA-031-FOLLOWUP-1 — the accepted currency domain.
 *
 * The defect: `Transaction.currency` accepted every currency Paysera's library
 * can process (see `REJECTED_CURRENCIES` below for the ones now refused),
 * stored the caller's code verbatim, and every read path then converted only
 * BGN and labelled the result `'EUR'`. A 100.00 USD top-up therefore surfaced as
 * `{ amount: 100, currency: 'EUR' }` — roughly 8 EUR more than the payment was
 * worth — and the same magnitude was folded into admin lifetime totals.
 *
 * The fix (user decision, 2026-08-20): reject at write time. The accepted
 * domain is narrowed to {BGN, EUR}, which is exactly the domain `toEur()` can
 * convert and the response unit can express, so the downstream EUR labels
 * become true statements instead of assertions.
 *
 * This file pins the domain primitives and the read-side honesty rules. The
 * write paths that consume them are pinned in
 * `bc-qa-031-followup-1-write-rejection.test.ts`; the route-level labels in
 * `bc-qa-031-followup-1-admin-read-labels.test.ts` and
 * `bc-qa-031-followup-1-legacy-row-labels.test.ts`; the wallet-credit unit
 * conversion in `bc-qa-031-followup-1-wallet-credit-units.test.ts`.
 */

import {
  ACCEPTED_CURRENCIES,
  RESPONSE_CURRENCY,
  UnsupportedCurrencyError,
  assertAcceptedCurrency,
  bgnToEur,
  displayCurrency,
  eurToBgn,
  foldMixedCurrencyToEur,
  isAcceptedCurrency,
  normalizeCurrency,
  sumMixedCurrencyToEur,
  toBgn,
  toDisplayMoney,
  toEur,
} from '../../src/utils/currency';

// The five codes Paysera accepts that BoomCard does not. Every assertion below
// runs over the whole set: the defect was reported for USD, but nothing about
// it was USD-specific.
const REJECTED_CURRENCIES = ['USD', 'GBP', 'PLN', 'CZK', 'RON'] as const;

describe('ACCEPTED_CURRENCIES — the single source of truth', () => {
  it('is exactly {BGN, EUR}', () => {
    expect([...ACCEPTED_CURRENCIES].sort()).toEqual(['BGN', 'EUR']);
  });

  it('excludes every currency Paysera accepts but BoomCard does not', () => {
    for (const code of REJECTED_CURRENCIES) {
      expect(ACCEPTED_CURRENCIES as readonly string[]).not.toContain(code);
    }
  });

  it('denominates responses in EUR', () => {
    expect(RESPONSE_CURRENCY).toBe('EUR');
    expect(ACCEPTED_CURRENCIES as readonly string[]).toContain(RESPONSE_CURRENCY);
  });
});

describe('normalizeCurrency / isAcceptedCurrency', () => {
  it('accepts BGN and EUR', () => {
    expect(normalizeCurrency('BGN')).toBe('BGN');
    expect(normalizeCurrency('EUR')).toBe('EUR');
  });

  it('is case- and whitespace-insensitive, and canonicalises to upper case', () => {
    expect(normalizeCurrency('bgn')).toBe('BGN');
    expect(normalizeCurrency('  eur  ')).toBe('EUR');
    expect(normalizeCurrency('Eur')).toBe('EUR');
  });

  it('rejects every out-of-domain currency Paysera would otherwise allow', () => {
    for (const code of REJECTED_CURRENCIES) {
      expect(normalizeCurrency(code)).toBeNull();
      expect(normalizeCurrency(code.toLowerCase())).toBeNull();
      expect(isAcceptedCurrency(code)).toBe(false);
    }
  });

  it('rejects absent / non-string / junk values rather than defaulting them', () => {
    expect(normalizeCurrency(null)).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
    expect(normalizeCurrency('')).toBeNull();
    expect(normalizeCurrency('XYZ')).toBeNull();
    expect(normalizeCurrency(42)).toBeNull();
    expect(normalizeCurrency({ toString: () => 'EUR' })).toBeNull();
  });
});

describe('assertAcceptedCurrency — the fail-closed write gate', () => {
  it('returns the normalised code for an accepted currency', () => {
    expect(assertAcceptedCurrency('bgn', 'test')).toBe('BGN');
    expect(assertAcceptedCurrency('EUR', 'test')).toBe('EUR');
  });

  it('throws UnsupportedCurrencyError for each rejected currency', () => {
    for (const code of REJECTED_CURRENCIES) {
      expect(() => assertAcceptedCurrency(code, 'test')).toThrow(UnsupportedCurrencyError);
    }
  });

  it('carries a 400 status and names both the offending code and the accepted set', () => {
    try {
      assertAcceptedCurrency('USD', 'POST /api/payments/create');
      throw new Error('expected assertAcceptedCurrency to throw');
    } catch (err) {
      const e = err as UnsupportedCurrencyError;
      expect(e).toBeInstanceOf(UnsupportedCurrencyError);
      expect(e.statusCode).toBe(400);
      expect(e.currency).toBe('USD');
      expect(e.message).toContain('USD');
      expect(e.message).toContain('POST /api/payments/create');
      expect(e.message).toContain('BGN, EUR');
    }
  });

  it('truncates an oversized value instead of echoing unbounded caller input', () => {
    const huge = 'A'.repeat(500);
    try {
      assertAcceptedCurrency(huge, 'test');
      throw new Error('expected assertAcceptedCurrency to throw');
    } catch (err) {
      expect((err as Error).message.length).toBeLessThan(200);
    }
  });
});

describe('displayCurrency — the label that must accompany a converted amount', () => {
  it('labels every in-domain row EUR (a BGN row was converted, a EUR row already was)', () => {
    expect(displayCurrency('BGN')).toBe('EUR');
    expect(displayCurrency('EUR')).toBe('EUR');
    expect(displayCurrency('bgn')).toBe('EUR');
    expect(displayCurrency(null)).toBe('EUR');
    expect(displayCurrency(undefined)).toBe('EUR');
  });

  it('keeps a legacy out-of-domain row under its OWN code — never EUR', () => {
    for (const code of REJECTED_CURRENCIES) {
      expect(displayCurrency(code)).toBe(code);
      expect(displayCurrency(code)).not.toBe(RESPONSE_CURRENCY);
    }
  });
});

describe('toEur — conversion keyed on the row currency', () => {
  it('converts BGN and passes EUR through (unchanged behaviour)', () => {
    expect(toEur(19.5583, 'BGN')).toBeCloseTo(10, 2);
    expect(toEur(25, 'EUR')).toBe(25);
    expect(toEur(19.5583, null)).toBeCloseTo(10, 2);
  });

  it('returns a legacy out-of-domain amount unconverted — there is no rate for it', () => {
    // Unconverted is correct; the honesty comes from the LABEL, which
    // displayCurrency/toDisplayMoney keep as the row's own code.
    expect(toEur(100, 'USD')).toBe(100);
  });
});

describe('toDisplayMoney — amount and label produced together', () => {
  it('converts a BGN row and labels it EUR', () => {
    expect(toDisplayMoney(19.5583, 'BGN')).toEqual({ amount: bgnToEur(19.5583), currency: 'EUR' });
  });

  it('passes a EUR row through and labels it EUR', () => {
    expect(toDisplayMoney(25, 'EUR')).toEqual({ amount: 25, currency: 'EUR' });
  });

  it('REGRESSION: a 100.00 USD row is never reported as 100.00 EUR', () => {
    // The exact failure scenario from the task description. Before the fix this
    // produced { amount: 100, currency: 'EUR' } for a payment worth ~92 EUR.
    const money = toDisplayMoney(100, 'USD');
    expect(money.currency).toBe('USD');
    expect(money.currency).not.toBe('EUR');
    // The magnitude is only trustworthy BECAUSE it is labelled USD.
    expect(money.amount).toBe(100);
  });

  it('never pairs a foreign magnitude with a EUR label, for any rejected currency', () => {
    for (const code of REJECTED_CURRENCIES) {
      const money = toDisplayMoney(100, code);
      const mislabelled = money.currency === RESPONSE_CURRENCY && money.amount === 100;
      expect(mislabelled).toBe(false);
    }
  });
});

describe('sumMixedCurrencyToEur — folding per-currency DB subtotals', () => {
  it('still converts each in-domain subtotal by its own currency before summing', () => {
    expect(
      sumMixedCurrencyToEur([
        { currency: 'BGN', amount: 19.5583 },
        { currency: 'EUR', amount: 25 },
      ]),
    ).toBeCloseTo(35, 2);
  });

  it('EXCLUDES a legacy out-of-domain subtotal instead of folding its raw magnitude in', () => {
    // A scalar total has no room for a per-currency label, so the two options
    // are a wrong number or a smaller true one. We take the true one and log.
    const total = sumMixedCurrencyToEur([
      { currency: 'EUR', amount: 25 },
      { currency: 'USD', amount: 100 },
    ]);
    expect(total).toBe(25);
    // The pre-fix behaviour — 125 — was a EUR figure containing 100 USD.
    expect(total).not.toBe(125);
  });

  it('excludes every rejected currency, not just USD', () => {
    for (const code of REJECTED_CURRENCIES) {
      expect(
        sumMixedCurrencyToEur([
          { currency: 'EUR', amount: 10 },
          { currency: code, amount: 1000 },
        ]),
      ).toBe(10);
    }
  });

  it('still treats a null currency as BGN (the schema column default)', () => {
    expect(
      sumMixedCurrencyToEur([
        { currency: null, amount: 19.5583 },
        { currency: 'EUR', amount: null },
      ]),
    ).toBeCloseTo(10, 2);
  });
});

/**
 * impl-r1 F4 — the fold has to say what it left out, or every figure rendered
 * beside the total (a row count, an average derived by dividing by it) silently
 * describes a different set of rows than the total does.
 */
describe('foldMixedCurrencyToEur — the total AND the rows it covers', () => {
  it('reports the count of rows behind the total, not the count of all rows', () => {
    const r = foldMixedCurrencyToEur([
      { currency: 'EUR', amount: 50, count: 2 },
      { currency: 'USD', amount: 100, count: 1 },
    ]);

    expect(r.total).toBe(50);
    expect(r.includedCount).toBe(2);
    expect(r.excludedCount).toBe(1);
    expect(r.excludedCurrencies).toEqual(['USD']);
  });

  it('keeps total / includedCount a meaningful average', () => {
    const r = foldMixedCurrencyToEur([
      { currency: 'EUR', amount: 50, count: 2 },
      { currency: 'USD', amount: 999, count: 5 },
    ]);
    // 25.00 is the true mean of the rows the total actually covers.
    expect(r.total / r.includedCount).toBeCloseTo(25, 2);
    // Dividing by 7 would have produced a number that is the mean of nothing.
    expect(r.total / (r.includedCount + r.excludedCount)).not.toBeCloseTo(25, 2);
  });

  it('de-duplicates and sorts the excluded currency codes', () => {
    const r = foldMixedCurrencyToEur([
      { currency: 'USD', amount: 1, count: 1 },
      { currency: 'GBP', amount: 1, count: 1 },
      { currency: 'usd', amount: 1, count: 1 },
    ]);
    expect(r.excludedCurrencies).toEqual(['GBP', 'USD']);
    expect(r.excludedCount).toBe(3);
  });

  it('reports no exclusions for an all-in-domain set', () => {
    const r = foldMixedCurrencyToEur([
      { currency: 'BGN', amount: 19.5583, count: 1 },
      { currency: 'EUR', amount: 25, count: 1 },
      { currency: null, amount: 19.5583, count: 1 },
    ]);
    expect(r.total).toBeCloseTo(45, 2);
    expect(r.includedCount).toBe(3);
    expect(r.excludedCount).toBe(0);
    expect(r.excludedCurrencies).toEqual([]);
  });

  it('tolerates absent counts (callers that render no count beside the total)', () => {
    const r = foldMixedCurrencyToEur([
      { currency: 'EUR', amount: 25 },
      { currency: 'USD', amount: 100 },
    ]);
    expect(r.total).toBe(25);
    expect(r.includedCount).toBe(0);
    expect(r.excludedCount).toBe(0);
    // The currency is still reported even when the row count is unknown.
    expect(r.excludedCurrencies).toEqual(['USD']);
  });

  it('sumMixedCurrencyToEur is exactly this fold`s total', () => {
    const groups = [
      { currency: 'BGN', amount: 19.5583, count: 1 },
      { currency: 'EUR', amount: 25, count: 1 },
      { currency: 'USD', amount: 100, count: 1 },
    ];
    expect(sumMixedCurrencyToEur(groups)).toBe(foldMixedCurrencyToEur(groups).total);
  });
});

/**
 * impl-r1 F1 — the write-side mirror of `toEur`. A EUR-denominated payment
 * credited verbatim into the BGN wallet ledger lost ~49% of its value.
 */
describe('toBgn — converting an arriving amount into the BGN storage unit', () => {
  it('converts a EUR amount at the fixed currency-board rate', () => {
    expect(toBgn(100, 'EUR')).toBeCloseTo(eurToBgn(100), 2);
    expect(toBgn(100, 'EUR')).toBeCloseTo(195.58, 2);
  });

  it('passes a BGN amount through untouched — no double conversion', () => {
    expect(toBgn(100, 'BGN')).toBe(100);
    expect(toBgn(100, 'bgn')).toBe(100);
  });

  it('treats a null/absent currency as BGN, matching the column default', () => {
    expect(toBgn(100, null)).toBe(100);
    expect(toBgn(100, undefined)).toBe(100);
  });

  it('is the exact inverse of toEur for the EUR case, up to 2dp rounding', () => {
    expect(toEur(toBgn(100, 'EUR'), 'BGN')).toBeCloseTo(100, 1);
  });

  it('THROWS for an out-of-domain currency rather than crediting a wrong number', () => {
    // Unlike `toEur`, which must keep serving legacy rows, this is a write-side
    // helper: there is no rate, so there is no honest number to increment by.
    for (const code of REJECTED_CURRENCIES) {
      expect(() => toBgn(100, code)).toThrow(UnsupportedCurrencyError);
    }
  });
});
