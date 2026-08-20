/**
 * BC-QA-031 round 6 — read/write money-unit symmetry sweep.
 *
 * THE CLASS THIS GUARDS
 * ---------------------
 * BC-QA-031 converted GET responses to EUR with `bgnToEur()` but left the write
 * handlers on the same resources storing whatever they received as BGN. Where an
 * admin form is seeded from a converted GET and submitted back, the value is
 * silently halved on write — and it persists, and (for receipts) cashback is
 * recomputed from the halved figure. Two instances were found by accident while
 * someone was auditing labels; this sweep exists so the third is found by a test.
 *
 * WHY THIS IS SOURCE ANALYSIS AND NOT ROUTE INTROSPECTION
 * ------------------------------------------------------
 * Express route introspection yields method + path only. It cannot tell you which
 * Prisma column a handler persists, nor whether the paired GET ran `bgnToEur` over
 * that same column — so a unit check cannot be derived from the route table the
 * way `subscriber-internal-field-introspect-sweep` derives its walk. Rather than
 * ship an introspecting sweep that would pass vacuously, this sweep works on the
 * axis where the signal actually lives: the route SOURCE.
 *
 * It re-derives, from disk on every run, the set of route/service files that apply
 * a read-side conversion, and fails if any of them is not classified in the
 * registry below. That makes the gate fire at the moment the class is reopened —
 * when someone adds `bgnToEur()` to a new GET — and forces the write side to be
 * decided and recorded rather than forgotten. It cannot pass vacuously: the file
 * list is grepped, not hardcoded, so deleting the registry fails the test.
 *
 * Runtime round-trip coverage for the specific pair that was broken lives in
 * `payout-thresholds-write-currency.test.ts`, which asserts the PERSISTED value.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');
const ROUTES = path.join(SRC, 'routes');
const SERVICES = path.join(SRC, 'services');

/** Read-side conversion helpers: BGN storage → EUR on the wire. */
const READ_CONV = /\b(bgnToEur|toEur|toEurOrNull|sumMixedCurrencyToEur)\s*\(/;
/** Write-side conversion helper: EUR on the wire → BGN storage. */
const WRITE_CONV = /\beurToBgn\s*\(/;

type Symmetry =
  /** A client-writable money field exists here AND the write converts EUR→BGN. */
  | 'write-converts'
  /** This file declares no POST/PUT/PATCH handler at all, so no request body can reach storage through it. */
  | 'no-write-handler'
  /** Both sides deliberately speak BGN (the read is NOT converted for the writer). */
  | 'symmetric-bgn'
  /** Money here is server-derived; no client-supplied amount is persisted. */
  | 'server-derived';

interface Entry {
  symmetry: Symmetry;
  why: string;
}

/**
 * Every file that applies a read-side money conversion, with the write-side
 * decision recorded. Adding `bgnToEur()` to a new file WILL fail this test until
 * an entry is added here — which is the point.
 */
const REGISTRY: Record<string, Entry> = {
  // ── The one genuine read/write asymmetry found in round 6 ─────────────────
  'routes/adminSettings.routes.ts': {
    symmetry: 'write-converts',
    why:
      'GET /payout-thresholds returns bgnToEur(minAmount); PUT /payout-thresholds is ' +
      'seeded from it by AdminSettingsThresholdsPage and now converts back with ' +
      'eurToBgn() before persisting. Pinned by payout-thresholds-write-currency.test.ts.',
  },

  // ── Reads converted; the paired writes take no client money amount ────────
  'routes/adminPayouts.routes.ts': {
    symmetry: 'server-derived',
    why:
      'Payout amounts come from the WalletTransaction rows being approved/rejected; ' +
      'the PATCH bodies carry only ids, statuses and notes. No client-supplied amount.',
  },
  'routes/adminCashback.routes.ts': {
    symmetry: 'server-derived',
    why: 'Cashback totals and thresholds are computed from ledger rows; writes carry status transitions only.',
  },
  'routes/adminFinance.routes.ts': {
    symmetry: 'server-derived',
    why:
      'POST /invoices/generate accepts only `month`; every money figure is aggregated ' +
      'server-side from StickerScan rows in BGN storage.',
  },
  'routes/adminDashboard.routes.ts': {
    symmetry: 'no-write-handler',
    why: 'GET /admin/dashboard statistics only — this router declares no POST/PUT/PATCH handler, so no client-supplied amount can reach storage through it.',
  },
  'routes/adminSubscribers.routes.ts': {
    symmetry: 'server-derived',
    why:
      'Wallet balances are read-converted from the BGN ledger. One write handler DOES take a ' +
      'client amount — POST /:userId/refund (adminSubscribers.routes.ts:1306) destructures ' +
      '`amount` at :1309 — but it is out of the BGN-column class: the figure is denominated in ' +
      "the Stripe PaymentIntent's own currency, capped against amount_received / 100 (:1385-1400) " +
      'and forwarded to stripeService.createRefund (:1408). No local money row is written, so ' +
      'there is no bgnToEur column for it to round-trip against. Every other write body on this ' +
      'router carries profile/plan fields only.',
  },
  'routes/adminSubscriptions.routes.ts': {
    symmetry: 'server-derived',
    why: 'paymentTotalAmount is a per-currency aggregate over Transaction; writes are cancel/reactivate/auto-renewal.',
  },
  'routes/adminTransactions.routes.ts': {
    symmetry: 'symmetric-bgn',
    why:
      'POST /adjust takes a client amount and stores it on WalletTransaction (uniformly BGN). ' +
      'Its own response converts to EUR, so the submitted unit is ambiguous — tracked as a ' +
      'separate product decision (see admin-transactions-audit-fixes.test.ts:171), NOT as a ' +
      'seeded-form round trip: nothing seeds the adjust form from a converted GET.',
  },
  'routes/dashboard.routes.ts': {
    symmetry: 'no-write-handler',
    why: 'GET /dashboard/me only — it projects StickerScan money into EUR for the mobile home screen and declares no write handler of any kind.',
  },
  'routes/wallet.routes.ts': {
    symmetry: 'server-derived',
    why: 'Balances and statistics are derived from the WalletTransaction ledger; the write handlers request a payout, whose amount the service computes from the available balance rather than from the request body.',
  },
  'routes/loyalty.routes.ts': {
    symmetry: 'no-write-handler',
    why: 'Reward.cashValue and loyalty balances are read-converted; Reward rows are seeded operationally and no route in this app creates or updates them from a request body.',
  },
  'routes/partners.routes.ts': { symmetry: 'server-derived', why: 'Revenue/turnover figures are aggregated server-side.' },
  'routes/subscriptions.routes.ts': { symmetry: 'no-write-handler', why: 'History reads only; no client-supplied amount is persisted.' },
  'routes/payments.paysera.routes.ts': {
    symmetry: 'symmetric-bgn',
    why:
      'POST /create stores the caller amount together with the caller currency, so the row ' +
      'is self-describing and reads convert per-row via toEur(). Not a seeded-form round trip.',
  },
  'routes/offers.routes.ts': {
    symmetry: 'symmetric-bgn',
    why:
      'mapOffer() converts discountAmount/minPurchase/maxDiscount for NON-admin readers only ' +
      '(`if (isAdmin) return offer`). Both offer write routes are ADMIN-only, so the admin ' +
      'editor reads raw BGN and writes BGN — symmetric. Converting the write here would ' +
      'INTRODUCE the halving; verified in round 6 before nearly doing exactly that.',
  },
  'routes/stickers.routes.ts': {
    symmetry: 'symmetric-bgn',
    why:
      'POST /scan takes a fresh user-entered billAmount (not seeded from a converted GET) and ' +
      'GET /admin/pending-review — the surface the admin override form is seeded from — returns ' +
      'raw rows. The user-facing /my-scans conversion does not feed any write form. The unit the ' +
      'scanning user believes they are entering is a separate open question, recorded in the round-6 report.',
  },

  // ── Services ──────────────────────────────────────────────────────────────
  'services/receipt.service.ts': {
    symmetry: 'symmetric-bgn',
    why:
      'formatReceipt() short-circuits on `includeInternal` (receipt.service.ts:624) BEFORE its ' +
      'bgnToEur block, so this file serves the SAME Receipt rows in two different units and the ' +
      'classification depends on which reader seeds the write. TWO surfaces seed a verifiedAmount ' +
      'write to POST /receipts/:id/review, and they read opposite units: (1) AdminReceiptsPage ' +
      'loads GET /api/receipts/v2/admin/all, which passes includeInternal:true, so it reads RAW ' +
      'BGN and writing BGN back is symmetric — this is the shipping path; (2) ReceiptReviewDashboard ' +
      'loads GET /api/receipts (receipts.routes.ts:69, no includeInternal), so it reads EUR and ' +
      'seeding its Verified Amount input from that EUR totalAmount would write EUR onto the BGN ' +
      'column and recompute cashback from it — the A1 shape this sweep exists to catch. That second ' +
      'path is NOT symmetric; the file is classified symmetric-bgn only because ' +
      'ReceiptReviewDashboard has no mount site (it is imported solely by its own test) and so ' +
      'ships nothing today. Wiring that component up REQUIRES converting its write, or reading it ' +
      'from the admin endpoint instead. The underlying contract defect — one Receipt resource ' +
      'returning EUR or BGN depending on the CALLER ROLE, with no currency discriminator anywhere ' +
      'on the wire for a client to branch on — is filed as BC-QA-031-FOLLOWUP-3 (admin receipts ' +
      'and transaction-adjust endpoints carry role-dependent or unlabelled currency units).',
  },
  'services/wallet.service.ts': { symmetry: 'server-derived', why: 'Balances are ledger-derived; no client amount is persisted through this service.' },
  'services/adminAlerts.service.ts': {
    symmetry: 'no-write-handler',
    why: 'meta.threshold is derived from PayoutThreshold/SystemSetting for display in the alert feed; this service performs no writes at all.',
  },
  'services/receiptAnalytics.service.ts': {
    symmetry: 'no-write-handler',
    why: 'Aggregates Receipt rows into totals for the analytics widgets; every money value is computed from stored rows and nothing is persisted from a request.',
  },
  'services/auth.service.ts': {
    symmetry: 'no-write-handler',
    why: 'Converts loyalty balance and receipt totals for the GDPR data-export payload; the export is a pure read and persists no amount.',
  },
};

function filesWithReadConversion(): string[] {
  const out: string[] = [];
  for (const [dir, label] of [[ROUTES, 'routes'], [SERVICES, 'services']] as const) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const body = fs.readFileSync(path.join(dir, f), 'utf-8');
      if (READ_CONV.test(body)) out.push(`${label}/${f}`);
    }
  }
  return out.sort();
}

describe('[MONEY-UNIT sweep] every read-side EUR conversion has a recorded write-side decision', () => {
  it('the sweep has real input — at least one file applies a read-side conversion', () => {
    // Guards against the whole sweep silently passing because the regex or the
    // directory layout drifted.
    expect(filesWithReadConversion().length).toBeGreaterThan(5);
  });

  it('every file that converts money on read is classified in the registry', () => {
    const unregistered = filesWithReadConversion().filter((f) => !(f in REGISTRY));

    expect(
      unregistered.length === 0
        ? 'all classified'
        : 'These files apply a read-side money conversion (bgnToEur/toEur/...) but have no\n' +
          'write-side decision recorded in REGISTRY in this test:\n\n' +
          unregistered.map((f) => `  - ${f}`).join('\n') +
          '\n\nBC-QA-031 halved money on write because exactly this pairing was left implicit.\n' +
          'For each file decide, and record, one of:\n' +
          "  'write-converts'  — a client-supplied amount is persisted here; the write now calls eurToBgn()\n" +
          "  'symmetric-bgn'   — the surface that seeds the write form reads RAW BGN, so both sides agree\n" +
          "  'server-derived'  — no client-supplied amount is persisted on this surface\n" +
          "  'no-write-handler' — this file declares no POST/PUT/PATCH handler at all\n" +
          'If you pick write-converts, add a test that asserts the PERSISTED value, not the response.',
    ).toBe('all classified');
  });

  it('every file declared write-converts actually calls eurToBgn()', () => {
    const declared = Object.entries(REGISTRY)
      .filter(([, e]) => e.symmetry === 'write-converts')
      .map(([f]) => f);

    // A declaration that is not backed by the conversion is worse than none —
    // it reads as coverage while the halving is live.
    const missing = declared.filter((f) => {
      const p = path.join(SRC, f);
      return !fs.existsSync(p) || !WRITE_CONV.test(fs.readFileSync(p, 'utf-8'));
    });

    expect(
      missing.length === 0
        ? 'all backed'
        : `Declared 'write-converts' but no eurToBgn() call found in:\n${missing.map((f) => `  - ${f}`).join('\n')}`,
    ).toBe('all backed');
  });

  it('every file that calls eurToBgn() is registered as write-converts', () => {
    // The reverse direction: a conversion added without a registry entry means the
    // pairing is undocumented again.
    const converters: string[] = [];
    for (const [dir, label] of [[ROUTES, 'routes'], [SERVICES, 'services']] as const) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        if (WRITE_CONV.test(fs.readFileSync(path.join(dir, f), 'utf-8'))) converters.push(`${label}/${f}`);
      }
    }

    const misfiled = converters.filter((f) => REGISTRY[f]?.symmetry !== 'write-converts');
    expect(
      misfiled.length === 0
        ? 'all registered'
        : `These files call eurToBgn() but are not registered as 'write-converts':\n${misfiled
            .map((f) => `  - ${f} (currently: ${REGISTRY[f]?.symmetry ?? 'unregistered'})`)
            .join('\n')}`,
    ).toBe('all registered');
  });

  it('every registry entry carries a non-trivial justification', () => {
    const thin = Object.entries(REGISTRY).filter(([, e]) => !e.why || e.why.trim().length < 40);
    expect(
      thin.length === 0
        ? 'all justified'
        : `Registry entries with no real justification:\n${thin.map(([f]) => `  - ${f}`).join('\n')}`,
    ).toBe('all justified');
  });

  it('the registry does not carry entries for files that no longer convert', () => {
    // Keeps the registry from rotting into a list of stale claims.
    const live = new Set(filesWithReadConversion());
    const stale = Object.keys(REGISTRY).filter((f) => {
      if (live.has(f)) return false;
      const p = path.join(SRC, f);
      // A write-converts file may legitimately have no read conversion of its own.
      return REGISTRY[f].symmetry !== 'write-converts' || !fs.existsSync(p);
    });
    expect(
      stale.length === 0
        ? 'no stale entries'
        : `Registry entries whose file no longer converts money on read:\n${stale.map((f) => `  - ${f}`).join('\n')}`,
    ).toBe('no stale entries');
  });
});
