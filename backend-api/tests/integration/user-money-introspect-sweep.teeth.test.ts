/**
 * Teeth-proof for user-money-introspect-sweep.test.ts
 *
 * Asserts the findBareMoneyScalar() scanner correctly catches a KNOWN
 * bare-money-scalar leak (SUBMUTATION-FIELD-LEAK pre-fix shape, where
 * totalAmount/cashbackAmount were raw numbers on mutation response bodies)
 * and passes a correctly-gated response (money scalars wrapped in
 * display:{bgn:null,eur:number} when the currency transition window is CLOSED).
 *
 * Strategy: inlines findBareMoneyScalar() from the sweep and runs it against
 * synthetic response bodies — no DB, no HTTP, no beforeAll setup required.
 * A SYNC-CHECK test reads the sweep source file and asserts the MONEY_KEYS
 * regex embedded here matches the one in the sweep, so stale drift fails fast.
 * Does NOT modify any src/** file.
 */

import fs from 'fs';
import path from 'path';

// ── Inlined scanner (copied from user-money-introspect-sweep.test.ts) ────────
//
// IMPORTANT: keep this copy in sync with the sweep. A runtime sync-check test
// below verifies the MONEY_KEYS regex source matches the sweep's copy exactly;
// any drift causes that test to fail, exposing stale teeth before CI merges.

const MONEY_KEYS =
  /^(amount|price|balance|balanceBefore|balanceAfter|currentBalance|availableBalance|pendingBalance|expiringBalance|totalCashback|totalTopups|totalSpent|totalAmount|verifiedAmount|payoutAmount|cashbackAmount|cashbackBalance|cashValue|averageAmount|averageReceiptAmount|discountAmount|minPurchase|maxDiscount|fee|totalFee)$/i;

function findBareMoneyScalar(node: any, nodePath = '$'): string[] {
  const leaks: string[] = [];

  function walk(n: any, p: string) {
    if (n == null) return;
    if (Array.isArray(n)) {
      n.forEach((v, i) => walk(v, `${p}[${i}]`));
      return;
    }
    if (typeof n === 'object') {
      // A correctly-gated money value is a {bgn, eur} object — stop recursing.
      if ('eur' in n && 'bgn' in n) return;
      // Detect whether this object is a correctly-gated EUR-native plain scalar
      // (e.g. wallet balance endpoint intentionally returns balance:<EUR number>,
      // currency:'EUR' when the transition window is closed).
      const currencyField = (Object.keys(n) as string[]).find(
        (fk) => fk.toLowerCase() === 'currency',
      );
      const isEurNative =
        currencyField != null &&
        String((n as any)[currencyField]).toUpperCase() === 'EUR';
      for (const [k, v] of Object.entries(n)) {
        if (MONEY_KEYS.test(k) && typeof v === 'number' && v !== 0 && !isEurNative) {
          leaks.push(`${p}.${k} = ${v} (bare money scalar, not display:{bgn,eur} and not EUR-native)`);
        }
        walk(v, `${p}.${k}`);
      }
    }
  }

  walk(node, nodePath);
  return leaks;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('user-money-introspect-sweep teeth-proof: findBareMoneyScalar catches known bare-scalar leak then passes the fix', () => {

  // ── SYNC CHECK: MONEY_KEYS regex must stay in sync with the sweep ─────────────
  //
  // Reads the sweep source and compares the MONEY_KEYS regex source string.
  // Fails immediately if this file's copy drifts from the sweep, without needing
  // a human to notice the divergence.

  it('SYNC: MONEY_KEYS regex in this file matches the regex in user-money-introspect-sweep.test.ts', () => {
    const sweepSrc = fs.readFileSync(
      path.resolve(__dirname, 'user-money-introspect-sweep.test.ts'),
      'utf8',
    );
    // Extract the regex literal from the sweep: const MONEY_KEYS = /.../i;
    const match = sweepSrc.match(/const MONEY_KEYS\s*=\s*(\/\^[^;]+\/i)/);
    expect(match).not.toBeNull(); // sweep must still declare MONEY_KEYS
    const sweepRegexSrc = match![1].trim();
    expect(MONEY_KEYS.toString()).toBe(sweepRegexSrc);
  });

  // ── RED test 1: bare balance/cashbackBalance scalars on a user dashboard shape ──
  //
  // Historical context: any GET endpoint that returned { balance: <number>, currency: 'BGN',
  // cashbackBalance: <number> } while the transition window was CLOSED was a bare-scalar leak.
  // The fix requires nulling the raw scalars and surfacing them inside display:{bgn,eur}.

  it('RED 1: scanner detects bare balance and cashbackBalance on a BROKEN dashboard-like response', () => {
    const brokenResponse = {
      data: {
        balance: 1234.56,       // RAW BGN scalar — should be null + display:{bgn,eur}
        currency: 'BGN',
        cashbackBalance: 99.99, // RAW BGN scalar — should be null + display:{bgn,eur}
      },
    };

    const leaks = findBareMoneyScalar(brokenResponse.data, '$.data');

    expect(leaks.length).toBeGreaterThanOrEqual(2);
    const leakPaths = leaks.join('\n');
    expect(leakPaths).toMatch(/balance/);
    expect(leakPaths).toMatch(/cashbackBalance/);
  });

  it('GREEN 1: scanner finds ZERO leaks when money scalars are nulled and wrapped in display:{bgn,eur}', () => {
    const fixedResponse = {
      data: {
        balance: null,        // nulled when window closed ✓
        currency: 'BGN',
        cashbackBalance: null, // nulled when window closed ✓
        display: {
          bgn: null,          // null when window closed ✓
          eur: 631.02,
        },
      },
    };

    const leaks = findBareMoneyScalar(fixedResponse.data, '$.data');

    expect(leaks).toEqual([]);
  });

  // ── RED test 2: pre-SUB_USER_FIELDS-fix subscription mutation response shape ──
  //
  // Historical context (SUBMUTATION-FIELD-LEAK): before the SUB_USER_FIELDS allowlist
  // and toSubUserView() wrapper were added, subscription mutation responses leaked raw
  // money scalars like totalAmount/cashbackAmount alongside payment-provider string
  // fields (payseraOrderId, stripeSubscriptionId, etc.).
  //
  // NOTE: findBareMoneyScalar scans for money-key numeric fields only. String fields
  // like payseraOrderId and stripeSubscriptionId are outside its remit and will NOT
  // be flagged by this scanner — that is expected and correct. Those string-field leaks
  // are caught by the INV-RDM-081 and subscription-mutation dedicated assertions in
  // other sweep files.

  it('RED 2: scanner detects bare totalAmount and cashbackAmount on a BROKEN pre-fix subscription mutation response', () => {
    const brokenSubMutationResponse = {
      data: {
        id: 'sub-uuid-0001',
        totalAmount: 29.99,                  // RAW BGN scalar — LEAK
        cashbackAmount: 2.99,                // RAW BGN scalar — LEAK
        payseraOrderId: 'order-abc',         // string — outside scanner remit (correct)
        stripeSubscriptionId: 'sub_abc',     // string — outside scanner remit (correct)
        status: 'ACTIVE',
      },
    };

    const leaks = findBareMoneyScalar(brokenSubMutationResponse.data, '$.data');

    expect(leaks.length).toBeGreaterThanOrEqual(2);
    const leakPaths = leaks.join('\n');
    expect(leakPaths).toMatch(/totalAmount/);
    expect(leakPaths).toMatch(/cashbackAmount/);

    // Confirm: string provider fields are NOT flagged by this scanner (by design).
    // Their exposure is caught by the subscription-mutation dedicated sweep, not here.
    expect(leakPaths).not.toMatch(/payseraOrderId/);
    expect(leakPaths).not.toMatch(/stripeSubscriptionId/);
  });

  it('GREEN 2: scanner finds ZERO leaks on the post-fix subscription mutation response (money scalars wrapped, provider strings absent)', () => {
    const fixedSubMutationResponse = {
      data: {
        id: 'sub-uuid-0001',
        totalAmount: null,    // nulled when window closed ✓
        cashbackAmount: null, // nulled when window closed ✓
        status: 'ACTIVE',
        display: {
          totalAmount: {
            bgn: null,  // null when window closed ✓
            eur: 15.30,
          },
          cashbackAmount: {
            bgn: null,  // null when window closed ✓
            eur: 1.53,
          },
        },
        // payment-provider string fields absent (stripped by toSubUserView()) ✓
      },
    };

    const leaks = findBareMoneyScalar(fixedSubMutationResponse.data, '$.data');

    expect(leaks).toEqual([]);
  });

  // ── Bonus RED: bare cashbackAmount on a nested loyaltyAccount object ──────────

  it('BONUS RED: scanner detects bare cashbackAmount on a nested loyaltyAccount object', () => {
    const brokenNested = {
      loyaltyAccount: {
        tier: 'BRONZE',
        points: 0,
        cashbackAmount: 14.75, // RAW BGN scalar — LEAK
      },
    };

    const leaks = findBareMoneyScalar(brokenNested, '$');

    expect(leaks.length).toBeGreaterThanOrEqual(1);
    expect(leaks.join('\n')).toMatch(/cashbackAmount/);
  });

  // ── Bonus GREEN: {bgn,eur} wrapper on that same nested field ─────────────────

  it('BONUS GREEN: scanner finds ZERO leaks when nested loyaltyAccount cashbackAmount is wrapped in {bgn,eur}', () => {
    const fixedNested = {
      loyaltyAccount: {
        tier: 'BRONZE',
        points: 0,
        cashbackAmount: null, // nulled ✓
        display: {
          cashbackAmount: {
            bgn: null,  // null when window closed ✓
            eur: 7.55,
          },
        },
      },
    };

    const leaks = findBareMoneyScalar(fixedNested, '$');

    expect(leaks).toEqual([]);
  });
});
