/**
 * Teeth-proof for admin-currency-leak-sweep.test.ts
 *
 * Asserts the BGN-leak scanner correctly catches a KNOWN closed-window leak
 * (CUR-012/013 pattern: nested wallet.availableBalance/pendingBalance on
 * GET /admin/payouts leaking as raw BGN scalars) and passes a correctly-gated
 * response (null BGN scalars with display:{bgn:null,eur:number}).
 *
 * Strategy: inlines the same MONEY_KEY/ALLOW_NONMONEY/walkForLeaks logic from
 * the sweep and runs it against synthetic response bodies — no DB required.
 * Does NOT modify any src/** file.
 */

// ── Replicated scanner constants (must stay in sync with admin-currency-leak-sweep) ──

const MONEY_KEY =
  /(amount|balance|total|fee|margin|cashback|discount|netamount|payout|price|threshold|revenue|payment|refund|sum|cost|gross|net|owed|turnover|earnings|spend|withdraw|deposit|credit|debit|wallet)/i;

const ALLOW_NONMONEY = new Set<string>(
  [
    'count', 'totalcount', 'pendingcount', 'processingcount', 'completedcount',
    'failedcount', 'cancelledcount', 'paymentcount', 'totalpayments', 'totalrefunds',
    'totalpayouts', 'totalrevenue_count', 'totaltransactions', 'transactioncount',
    'usercount', 'partnercount', 'subscribercount', 'cashbackcount', 'totalcashbackcount',
    'pending', 'paid', 'overdue', 'processing', 'failed', 'completed', 'cancelled', 'total',
    'rate', 'discountrate', 'maxdiscountrate', 'mindiscountrate', 'defaultdiscountrate',
    'cashbackrate', 'cashbackpercent', 'percentage', 'percent', 'marginpercent',
    'marginpercentage', 'commissionrate', 'taxrate', 'interestrate', 'feerate',
    'discountstep', 'discountmin', 'discountmax', 'failedpayment', 'activepayment',
  ].map((s) => s.toLowerCase()),
);

interface Leak {
  route: string;
  jsonPath: string;
  key: string;
  value: unknown;
  kind: 'LEAK' | 'UNCLASSIFIED';
}

function isNumericLeaf(v: unknown): boolean {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return true;
  return false;
}

function isCountKey(keyLc: string): boolean {
  return keyLc.endsWith('count');
}

function walkForLeaks(node: unknown, route: string, path: string, leaks: Leak[]): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    (node as unknown[]).forEach((el, i) => walkForLeaks(el, route, `${path}[${i}]`, leaks));
    return;
  }
  if (typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    const keyLc = key.toLowerCase();

    if (value && typeof value === 'object') {
      walkForLeaks(value, route, childPath, leaks);
      continue;
    }

    if (!isNumericLeaf(value)) continue;

    if (keyLc === 'bgn') {
      leaks.push({ route, jsonPath: childPath, key, value, kind: 'LEAK' });
      continue;
    }
    if (keyLc === 'eur') continue;
    if (!MONEY_KEY.test(key)) continue;
    if (isCountKey(keyLc)) continue;
    if (ALLOW_NONMONEY.has(keyLc)) continue;
    leaks.push({ route, jsonPath: childPath, key, value, kind: 'LEAK' });
  }
}

// ── Known-broken response: CUR-012/013 pre-fix GET /admin/payouts shape ──────
// wallet.availableBalance and wallet.pendingBalance were raw BGN scalars.
// filteredSummary.totalAmount was also a raw BGN scalar.
const BROKEN_PAYOUTS_RESPONSE = {
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      walletTransaction: {
        wallet: {
          availableBalance: 1234.56, // RAW BGN — should be null or inside display{}
          pendingBalance: 78.9,      // RAW BGN — should be null or inside display{}
          currency: 'BGN',
        },
      },
      filteredSummary: {
        totalAmount: 500.0, // RAW BGN — should be null or inside display{}
      },
    },
  ],
  total: 1,
};

// ── Correctly-gated response: all monetary scalars nulled; EUR inside display{} ─
const FIXED_PAYOUTS_RESPONSE = {
  data: [
    {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      type: 'WITHDRAWAL',
      status: 'PENDING',
      walletTransaction: {
        wallet: {
          availableBalance: null, // nulled when window closed ✓
          pendingBalance: null,   // nulled when window closed ✓
          currency: 'BGN',
          display: {
            bgn: null, // null when window closed ✓
            eur: 632.0,
          },
        },
      },
      filteredSummary: {
        totalAmount: null, // nulled when window closed ✓
        display: {
          bgn: null, // null when window closed ✓
          eur: 255.9,
        },
      },
    },
  ],
  total: 1,
};

describe('admin-currency-leak-sweep teeth-proof: scanner catches known CUR-012/013 leak then passes the fix', () => {
  it('RED: scanner detects raw BGN scalars in the pre-fix GET /admin/payouts response (CUR-012/013)', () => {
    const leaks: Leak[] = [];
    walkForLeaks(BROKEN_PAYOUTS_RESPONSE, 'GET /api/admin/payouts', '', leaks);

    // Must find leaks — if this assertion fails the scanner is blind.
    expect(leaks.length).toBeGreaterThan(0);

    const leakKeys = leaks.map((l) => l.key);
    expect(leakKeys).toContain('availableBalance');
    expect(leakKeys).toContain('pendingBalance');
    expect(leakKeys).toContain('totalAmount');
  });

  it('GREEN: scanner finds ZERO leaks in the correctly-gated GET /admin/payouts response', () => {
    const leaks: Leak[] = [];
    walkForLeaks(FIXED_PAYOUTS_RESPONSE, 'GET /api/admin/payouts', '', leaks);

    expect(leaks).toEqual([]);
  });

  it('RED: scanner catches a display.bgn non-null value (window-closed invariant violation)', () => {
    const broken = {
      wallet: {
        display: {
          bgn: 99.99, // non-null bgn inside display{} while window closed — LEAK
          eur: 51.12,
        },
      },
    };
    const leaks: Leak[] = [];
    walkForLeaks(broken, 'GET /api/admin/test', '', leaks);
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks[0].key).toBe('bgn');
  });

  it('GREEN: scanner does NOT flag EUR-only or null-BGN display{} entries', () => {
    const clean = {
      wallet: {
        display: {
          bgn: null,
          eur: 51.12,
        },
      },
    };
    const leaks: Leak[] = [];
    walkForLeaks(clean, 'GET /api/admin/test', '', leaks);
    expect(leaks).toEqual([]);
  });
});
