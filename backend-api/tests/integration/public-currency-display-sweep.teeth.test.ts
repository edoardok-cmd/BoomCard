/**
 * Teeth-proof for public-currency-display-sweep.test.ts
 *
 * Asserts the dual-display scanner pricingObjectsMissingBgn() correctly flags a
 * KNOWN-BROKEN synthetic response (EUR prices, no BGN companion) and passes a
 * KNOWN-FIXED response (EUR prices with a BGN companion field alongside each).
 * Also asserts the scanner catches missing BGN at depth (nested inside a
 * `data[0].pricing` object), not just at top-level.
 *
 * Strategy: inlines the pricingObjectsMissingBgn() logic exactly from the sweep
 * and runs it against synthetic JSON objects — no supertest, no DB, no imports
 * from src/**. Does NOT modify any src/** file.
 */

// ── Replicated scanner logic (must stay in sync with public-currency-display-sweep) ──

function pricingObjectsMissingBgn(node: any, path: string, out: string[]): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((el: any, i: number) =>
      pricingObjectsMissingBgn(el, `${path}[${i}]`, out),
    );
    return;
  }
  // A pricing object is one that carries a `currency` marker or weekly/monthly/
  // yearly numeric price fields.
  const keys = Object.keys(node);
  const looksLikePricing =
    keys.includes('currency') ||
    keys.some((k) => /^(weekly|monthly|yearly)$/i.test(k));
  if (looksLikePricing) {
    const hasEurScalar =
      node.currency === 'EUR' ||
      ['weekly', 'monthly', 'yearly'].some((k) => typeof node[k] === 'number');
    // BGN evidence: a `bgn` field, a `*Bgn`/`priceBgn` field, or a nested
    // { bgn, eur } shape on any price.
    const json = JSON.stringify(node).toLowerCase();
    const hasBgn = /"bgn"|bgn"\s*:/.test(json) || /[a-z]bgn"/.test(json);
    if (hasEurScalar && !hasBgn) {
      out.push(path);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    pricingObjectsMissingBgn(v, path ? `${path}.${k}` : k, out);
  }
}

// ── BROKEN synthetic responses: EUR pricing, no BGN companion ────────────────

// Pre-fix top-level list response — plans have currency:'EUR' and numeric prices
// but no bgn fields at all.
const BROKEN_PLANS_LIST = {
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      planCode: 'BASIC',
      displayName: 'Basic Plan',
      weekly: 3.57,
      monthly: 10.22,
      yearly: 101.86,
      currency: 'EUR',
    },
  ],
};

// Pre-fix single plan response — same EUR-only shape
const BROKEN_SINGLE_PLAN = {
  success: true,
  data: {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    planCode: 'PRO',
    displayName: 'Pro Plan',
    weekly: 7.14,
    monthly: 20.44,
    yearly: 203.72,
    currency: 'EUR',
  },
};

// A plan response where pricing is nested inside a sub-object (tests depth scanning)
const BROKEN_NESTED_PRICING = {
  success: true,
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      planCode: 'GOLD',
      displayName: 'Gold Plan',
      pricing: {
        weekly: 3.57,
        monthly: 10.22,
        yearly: 101.86,
        currency: 'EUR',
        // NO bgn fields — should be flagged
      },
    },
  ],
};

// ── FIXED synthetic responses: EUR pricing WITH BGN companion ─────────────────

// Post-fix list response — each plan has both EUR scalars and BGN companions
const FIXED_PLANS_LIST = {
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      planCode: 'BASIC',
      displayName: 'Basic Plan',
      weekly: 3.57,
      weeklyBgn: 6.98,
      monthly: 10.22,
      monthlyBgn: 19.99,
      yearly: 101.86,
      yearlyBgn: 199.11,
      currency: 'EUR',
    },
  ],
};

// Post-fix single plan — { bgn, eur } pair on each price
const FIXED_SINGLE_PLAN = {
  success: true,
  data: {
    id: 'aaaaaaaa-0000-0000-0000-000000000002',
    planCode: 'PRO',
    displayName: 'Pro Plan',
    weekly: 7.14,
    weeklyBgn: 13.96,
    monthly: 20.44,
    monthlyBgn: 39.97,
    yearly: 203.72,
    yearlyBgn: 398.22,
    currency: 'EUR',
  },
};

// Post-fix nested pricing — BGN fields present inside the nested pricing object
const FIXED_NESTED_PRICING = {
  success: true,
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      planCode: 'GOLD',
      displayName: 'Gold Plan',
      pricing: {
        weekly: 3.57,
        weeklyBgn: 6.98,
        monthly: 10.22,
        monthlyBgn: 19.99,
        yearly: 101.86,
        yearlyBgn: 199.11,
        currency: 'EUR',
      },
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('public-currency-display-sweep teeth-proof: scanner catches EUR-only pricing then passes BGN-paired response', () => {
  it('RED: scanner flags top-level EUR-only plan list (no BGN companion fields)', () => {
    const missing: string[] = [];
    pricingObjectsMissingBgn(BROKEN_PLANS_LIST, '', missing);
    // Must detect the missing BGN — if empty the scanner is blind
    expect(missing.length).toBeGreaterThan(0);
  });

  it('RED: scanner flags single plan response with EUR prices and no BGN companion', () => {
    const missing: string[] = [];
    pricingObjectsMissingBgn(BROKEN_SINGLE_PLAN, '', missing);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('RED: scanner detects missing BGN at depth (nested inside data[0].pricing)', () => {
    const missing: string[] = [];
    pricingObjectsMissingBgn(BROKEN_NESTED_PRICING, '', missing);
    expect(missing.length).toBeGreaterThan(0);
    // The flagged path should reference the nested pricing object, not just root
    expect(missing.some((p) => p.includes('pricing') || p.includes('[0]'))).toBe(true);
  });

  it('RED: scanner flags a bare { currency: "EUR", weekly: 3.57 } object with no BGN', () => {
    const node = { currency: 'EUR', weekly: 3.57, monthly: 10.22, yearly: 101.86 };
    const missing: string[] = [];
    pricingObjectsMissingBgn(node, 'root', missing);
    expect(missing).toContain('root');
  });

  it('GREEN: scanner passes a plan list where every pricing object has BGN companion fields', () => {
    const missing: string[] = [];
    pricingObjectsMissingBgn(FIXED_PLANS_LIST, '', missing);
    expect(missing).toEqual([]);
  });

  it('GREEN: scanner passes a single plan response with complete BGN+EUR pricing', () => {
    const missing: string[] = [];
    pricingObjectsMissingBgn(FIXED_SINGLE_PLAN, '', missing);
    expect(missing).toEqual([]);
  });

  it('GREEN: scanner passes a nested pricing object that includes BGN companion fields', () => {
    const missing: string[] = [];
    pricingObjectsMissingBgn(FIXED_NESTED_PRICING, '', missing);
    expect(missing).toEqual([]);
  });

  it('GREEN: scanner passes a { weekly: 3.57, weeklyBgn: 6.98, ... } object with the documented pair shape', () => {
    const node = {
      weekly: 3.57,
      weeklyBgn: 6.98,
      monthly: 10.22,
      monthlyBgn: 19.99,
      yearly: 101.86,
      yearlyBgn: 199.11,
      currency: 'EUR',
    };
    const missing: string[] = [];
    pricingObjectsMissingBgn(node, 'pricing', missing);
    expect(missing).toEqual([]);
  });

  it('GREEN: scanner passes a response that has no pricing objects at all (no currency, no weekly/monthly/yearly)', () => {
    const nonPricingNode = {
      success: true,
      data: { id: 'abc', name: 'Test', description: 'A description', active: true },
    };
    const missing: string[] = [];
    pricingObjectsMissingBgn(nonPricingNode, '', missing);
    expect(missing).toEqual([]);
  });

  it('RED: scanner correctly flags when only some plans in a list are missing BGN', () => {
    const partialList = {
      data: [
        {
          id: 'aaa',
          planCode: 'FIXED',
          weekly: 3.57,
          weeklyBgn: 6.98,
          monthly: 10.22,
          monthlyBgn: 19.99,
          yearly: 101.86,
          yearlyBgn: 199.11,
          currency: 'EUR',
        },
        {
          id: 'bbb',
          planCode: 'BROKEN',
          weekly: 7.14,
          monthly: 20.44,
          yearly: 203.72,
          currency: 'EUR',
          // NO bgn fields — should be flagged
        },
      ],
    };
    const missing: string[] = [];
    pricingObjectsMissingBgn(partialList, '', missing);
    // One of the two plans is missing BGN
    expect(missing.length).toBe(1);
  });
});
