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

/**
 * Read-side conversion helpers: BGN storage → EUR on the wire.
 *
 * `toDisplayMoney` was added by BC-QA-031-FOLLOWUP-1: it converts exactly like
 * `toEur` and additionally returns the truthful currency label to pair with the
 * converted amount (a hardcoded `currency: 'EUR'` beside a `toEur()` call was
 * how a legacy USD row shipped its raw magnitude as euros). It must be listed
 * here, or a route that migrates from `toEur` to it would silently drop out of
 * this sweep's file set and lose its registry classification.
 */
const READ_CONV = /\b(bgnToEur|toEur|toEurOrNull|toDisplayMoney|sumMixedCurrencyToEur|foldMixedCurrencyToEur)\s*\(/;
/** Write-side conversion helper: EUR on the wire → BGN storage. */
const WRITE_CONV = /\beurToBgn\s*\(/;

type Symmetry =
  /** A client-writable money field exists here AND the write converts EUR→BGN. */
  | 'write-converts'
  /**
   * A ROUTE file that declares no POST/PUT/PATCH handler at all, so no request
   * body can reach storage through it. Mechanically verified below — this is the
   * one value the sweep can check rather than take on trust. It is meaningless
   * for a service (services declare no routes), so it is rejected outside
   * `routes/`.
   */
  | 'no-write-handler'
  /** Both sides deliberately speak BGN (the read is NOT converted for the writer). */
  | 'symmetric-bgn'
  /**
   * The file has write handlers, but no CLIENT-SUPPLIED money amount is persisted
   * through it — every stored figure is computed server-side or copied from an
   * existing row. Strictly weaker than `no-write-handler`, and the correct value
   * whenever a write handler exists at all.
   */
  | 'server-derived'
  /**
   * A client-supplied money amount IS persisted here WITHOUT conversion while the
   * read side converts — i.e. the A1 asymmetry is present in the code — but no
   * live caller seeds that write from the converted read, so nothing ships broken
   * today. This is a deferral, not a clearance: entries using it MUST cite a
   * follow-up task, and the dormancy claim MUST be backed by an executable check
   * below, because "nothing calls it yet" is precisely the premise that rots.
   */
  | 'asymmetric-dormant';

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
    symmetry: 'server-derived',
    why:
      'Reward.cashValue and loyalty balances are read-converted. This router DOES declare a write ' +
      'handler — POST /rewards/:rewardId/redeem (loyalty.routes.ts:202) — but its body carries no ' +
      'money: the redemption debits the account by the Reward row\'s own stored cashValue, which ' +
      'the server reads rather than the client supplying. Reward rows themselves are seeded ' +
      'operationally and no route creates or updates them from a request body.',
  },
  'routes/partners.routes.ts': { symmetry: 'server-derived', why: 'Revenue/turnover figures are aggregated server-side.' },
  'routes/subscriptions.routes.ts': {
    symmetry: 'server-derived',
    why:
      'GET /history is read-converted. This router declares eight write handlers ' +
      '(:315 create, :344 change-card, :358 cancel, :383 reactivate, :396 resume, :407 pause, ' +
      ':426 auto-renewal, :470 update-plan) and not one of them takes a money amount from the ' +
      'request: prices come from the Plan row and Stripe/Paysera, and the bodies carry plan ids, ' +
      'flags and reasons. So no client-supplied amount is persisted through this file.',
  },
  'routes/cards.routes.ts': {
    symmetry: 'server-derived',
    why:
      'GET /:id/statistics folds the card cashback subtotals to EUR at the route boundary ' +
      '(BC-QA-031-FOLLOWUP-1 task-r2 F14). This router declares five write handlers ' +
      '(POST /, /:id/upgrade, /:id/deactivate, /:id/activate, /validate) and not one takes a money ' +
      'amount from the request: their bodies are `newTier` (enum), `reason` (string) and ' +
      '`cardNumber` (string), and POST / takes no body at all. So no client-supplied amount is ' +
      'persisted through this file and there is no read/write unit to keep symmetric.',
  },
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
      'WRITE side is symmetric: POST /scan takes a fresh user-entered billAmount (not seeded from ' +
      'a converted GET) and stores it raw, and GET /admin/pending-review — the surface the admin ' +
      'override form IS seeded from — returns raw rows too, so the admin correction round-trips in ' +
      'BGN on both legs. ' +
      'READ side is NOT uniform, and the registry previously said nothing about it: the same three ' +
      'StickerScan money columns (billAmount / verifiedAmount / cashbackAmount) come back in ' +
      'different units depending on the endpoint. POST /api/stickers/scan returns them RAW BGN — ' +
      'its response projection at stickers.routes.ts:209 strips ten internal fields and converts no ' +
      'money field at all — while POST /scan/:scanId/receipt and GET /my-scans return the same ' +
      'columns converted with bgnToEur(). A client reading the scan response as EUR overstates by ' +
      '1.96x, and nothing on the wire distinguishes the two shapes. ' +
      'Filed as item 4 of BC-QA-031-FOLLOWUP-3 (admin receipts and transaction-adjust endpoints ' +
      'carry role-dependent or unlabelled currency units), which also carries the open question of ' +
      'whether the submitted billAmount should stay BGN — it interacts with autoApproveThreshold ' +
      'and the other VenueStickerConfig thresholds, which are never converted on read.',
  },

  // ── Services ──────────────────────────────────────────────────────────────
  'services/receipt.service.ts': {
    symmetry: 'asymmetric-dormant',
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
      'path is NOT symmetric, which is why this entry is asymmetric-dormant rather than a ' +
      'clearance: ReceiptReviewDashboard has no mount site (it is imported solely by its own test) ' +
      'and so ships nothing today. Wiring that component up REQUIRES converting its write, or ' +
      'reading it from the admin endpoint instead. The dormancy is asserted executably below, not ' +
      'taken on trust. The underlying contract defect — one Receipt resource ' +
      'returning EUR or BGN depending on the CALLER ROLE, with no currency discriminator anywhere ' +
      'on the wire for a client to branch on — is filed as BC-QA-031-FOLLOWUP-3 (admin receipts ' +
      'and transaction-adjust endpoints carry role-dependent or unlabelled currency units).',
  },
  'services/wallet.service.ts': { symmetry: 'server-derived', why: 'Balances are ledger-derived; no client amount is persisted through this service.' },
  'services/adminAlerts.service.ts': {
    symmetry: 'server-derived',
    why:
      'meta.threshold is derived from PayoutThreshold / SystemSetting rows for display in the ' +
      'alert feed. This service performs no Prisma writes at all, so no client-supplied amount ' +
      'can be persisted through it.',
  },
  'services/receiptAnalytics.service.ts': {
    symmetry: 'asymmetric-dormant',
    why:
      'getAnalytics() converts totalCashback / totalSpent / averageReceiptAmount and every ' +
      'topMerchants.totalSpent with bgnToEur() (:70-80), and the service PERSISTS money at ' +
      ':50, :143, :173, :249 and :460. Those figures normally arrive server-side from ' +
      'receipt.service.ts, but one path lets a client supply them: POST /api/receipts/v2/analytics/update ' +
      '(receipts.enhanced.routes.ts:475-493) reads cashbackAmount and totalAmount off the request ' +
      'body and hands them to updateAnalytics(), which adds them to the BGN columns UNCONVERTED. ' +
      'Read EUR, write BGN, on the same columns — the A1 asymmetry, present in the code. It is ' +
      'dormant, but check the chain rather than the wrapper: the frontend wrapper ' +
      'receipt.service.ts updateReceiptAnalytics() IS called, at :200 — inside submitReceipt(), ' +
      'which is itself declared once at :89 and referenced nowhere in the app. So the route is ' +
      'unreachable because the whole submitReceipt flow is dead code, not because the wrapper ' +
      'is uncalled. Filed as BC-QA-031-FOLLOWUP-3 (admin receipts and transaction-adjust ' +
      'endpoints carry role-dependent or unlabelled currency units). The dormancy is asserted ' +
      'executably below, not taken on trust.',
  },
  'services/auth.service.ts': {
    symmetry: 'server-derived',
    why:
      'Converts loyalty balance and receipt totals for the GDPR data-export payload. This service ' +
      'does write (registration, password and profile mutations), but none of those writes carries ' +
      'a money amount — the export path itself is a pure read.',
  },
};

/**
 * Strip `//` and block comments before matching (BC-QA-031-FOLLOWUP-1).
 *
 * `READ_CONV` is matched against raw source, so a comment that merely NAMES one
 * of the helpers — e.g. a docblock explaining why a Stripe webhook refuses a
 * currency `toEur()` has no rate for — used to enrol that file in the registry
 * as if it converted money. That teaches contributors to word comments around
 * the tool instead of fixing code, and it is a false positive either way.
 * Sibling sweep `money-label-literal-sweep.test.ts` uses the same treatment.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function filesWithReadConversion(): string[] {
  const out: string[] = [];
  for (const [dir, label] of [[ROUTES, 'routes'], [SERVICES, 'services']] as const) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const body = stripComments(fs.readFileSync(path.join(dir, f), 'utf-8'));
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

  // ── Machine-checked classifications ───────────────────────────────────────
  // Round 8 rewrote `no-write-handler` toward a stricter definition without
  // checking which files could satisfy it, and tagged two routers that declare
  // nine write handlers between them plus three services that declare no routes
  // at all. These assertions exist so that value can never again be asserted
  // where it is untrue: it is the one classification the sweep can verify.

  it("no file tagged 'no-write-handler' declares a write handler", () => {
    const violations = Object.entries(REGISTRY)
      .filter(([, e]) => e.symmetry === 'no-write-handler')
      .map(([f]) => {
        const p = path.join(SRC, f);
        if (!fs.existsSync(p)) return { f, count: -1 };
        const matches = fs.readFileSync(p, 'utf-8').match(/^router\.(post|put|patch)\(/gm);
        return { f, count: matches ? matches.length : 0 };
      })
      .filter((r) => r.count !== 0);

    expect(
      violations.length === 0
        ? 'all verified'
        : "Files tagged 'no-write-handler' that DO declare write handlers (or are missing):\n" +
          violations.map((v) => `  - ${v.f}: ${v.count === -1 ? 'file not found' : `${v.count} POST/PUT/PATCH handler(s)`}`).join('\n') +
          "\n\nUse 'server-derived' instead — it is the weaker claim that a write handler exists\n" +
          'but persists no client-supplied money amount.',
    ).toBe('all verified');
  });

  it("'no-write-handler' is only used for route files, never services", () => {
    // A service declares no Express routes, so the value is vacuously true there
    // and tells a reader nothing. Three service entries carried it before round 9.
    const misused = Object.entries(REGISTRY)
      .filter(([f, e]) => e.symmetry === 'no-write-handler' && !f.startsWith('routes/'))
      .map(([f]) => f);
    expect(
      misused.length === 0
        ? 'routes only'
        : `'no-write-handler' is meaningless outside routes/ — these entries must use 'server-derived':\n${misused
            .map((f) => `  - ${f}`)
            .join('\n')}`,
    ).toBe('routes only');
  });

  it("every 'asymmetric-dormant' entry cites a follow-up task", () => {
    // This value is a deferral, not a clearance. Without a task id it is just a
    // known defect recorded in a file only this sweep reads.
    const uncited = Object.entries(REGISTRY)
      .filter(([, e]) => e.symmetry === 'asymmetric-dormant')
      .filter(([, e]) => !/BC-QA-031-FOLLOWUP-\d+/.test(e.why))
      .map(([f]) => f);
    expect(
      uncited.length === 0
        ? 'all cited'
        : `'asymmetric-dormant' entries with no BC-QA-031-FOLLOWUP-<n> citation:\n${uncited
            .map((f) => `  - ${f}`)
            .join('\n')}`,
    ).toBe('all cited');
  });

  it('every registry entry carries a non-trivial justification', () => {
    const thin = Object.entries(REGISTRY).filter(([, e]) => !e.why || e.why.trim().length < 40);
    expect(
      thin.length === 0
        ? 'all justified'
        : `Registry entries with no real justification:\n${thin.map(([f]) => `  - ${f}`).join('\n')}`,
    ).toBe('all justified');
  });

  // ── Executable dormancy checks ────────────────────────────────────────────
  // Two entries are classified `asymmetric-dormant`: the A1 asymmetry IS in the
  // code and is only harmless because nothing calls the write. That premise is a
  // fact about the frontend, so it decays without any backend change — the day
  // someone mounts the component or calls the wrapper, the registry becomes
  // silently wrong with every suite still green. These assertions move the
  // premise out of prose. They read the sibling package directly, which is
  // already precedent in this suite (four other backend tests do the same).

  const FRONTEND_SRC = path.join(__dirname, '..', '..', '..', 'partner-dashboard', 'src');

  function frontendFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
      }
    };
    walk(dir_or_throw());
    return out;
  }

  function dir_or_throw(): string {
    // Deliberately NOT skipped when absent. A silent pass here is the exact
    // vacuity these checks exist to remove; if the sibling package is missing the
    // sweep must say so rather than quietly clear two dormant asymmetries.
    if (!fs.existsSync(FRONTEND_SRC)) {
      throw new Error(
        `money-read-write-unit-sweep needs the sibling partner-dashboard package to verify its ` +
          `two 'asymmetric-dormant' entries, and ${FRONTEND_SRC} does not exist. Those entries are ` +
          `clearances that hold ONLY while no frontend caller exists, so they cannot be verified ` +
          `from backend-api alone. Run this suite from a full checkout.`,
      );
    }
    return FRONTEND_SRC;
  }

  it('ReceiptReviewDashboard has no importer outside its own test (receipt.service.ts dormancy)', () => {
    const IMPORT_RE = /^\s*import[\s\S]{0,200}?from\s+['"][^'"]*ReceiptReviewDashboard['"]/m;
    const importers = frontendFiles()
      .filter((f) => path.basename(f) !== 'ReceiptReviewDashboard.test.tsx')
      .filter((f) => IMPORT_RE.test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(FRONTEND_SRC, f));

    expect(
      importers.length === 0
        ? 'dormant'
        : 'ReceiptReviewDashboard is now imported outside its own test:\n' +
          importers.map((f) => `  - partner-dashboard/src/${f}`).join('\n') +
          "\n\nThe registry classifies services/receipt.service.ts 'asymmetric-dormant' ONLY because\n" +
          'this component was unmounted. It seeds a Verified Amount input from the EUR-converted\n' +
          'GET /api/receipts and posts it to POST /receipts/:id/review, which stores it verbatim on\n' +
          'the BGN column AND recomputes cashback from it. Mounting it therefore requires either\n' +
          'converting that write (eurToBgn) and the cashback recompute with it, or reading the queue\n' +
          'from GET /api/receipts/v2/admin/all (raw BGN) instead. Tracked as BC-QA-031-FOLLOWUP-3.',
    ).toBe('dormant');
  });

  it('the submitReceipt flow feeding analytics/update is still unreachable (receiptAnalytics dormancy)', () => {
    const svc = path.join(FRONTEND_SRC, 'services', 'receipt.service.ts');
    expect(fs.existsSync(svc)).toBe(true);

    // The chain that would make POST /api/receipts/v2/analytics/update live is
    //   <some surface> -> receiptService.submitReceipt() -> updateReceiptAnalytics() -> POST
    // updateReceiptAnalytics IS called (receipt.service.ts:200), so checking the
    // wrapper proves nothing — an earlier revision of this test did exactly that
    // and asserted a premise that was false. What actually keeps the route
    // unreachable is that submitReceipt itself is dead: declared once, referenced
    // nowhere. That is the property to pin.
    const refs = frontendFiles()
      .map((f) => ({ f, hits: (fs.readFileSync(f, 'utf-8').match(/\bsubmitReceipt\b/g) ?? []).length }))
      .filter((r) => r.hits > 0)
      .map((r) => ({ file: path.relative(FRONTEND_SRC, r.f), hits: r.hits }));

    const declarationSite = path.join('services', 'receipt.service.ts');
    const external = refs.filter((r) => r.file !== declarationSite);
    const localHits = refs.find((r) => r.file === declarationSite)?.hits ?? 0;

    expect(
      external.length === 0 && localHits <= 1
        ? 'dormant'
        : 'receiptService.submitReceipt() now has a caller, which makes\n' +
          'POST /api/receipts/v2/analytics/update reachable:\n' +
          (external.length
            ? external.map((r) => `  - partner-dashboard/src/${r.file} (${r.hits}x)`).join('\n')
            : `  - ${localHits} references inside partner-dashboard/src/${declarationSite}`) +
          '\n\nThat route reads cashbackAmount/totalAmount off the request body and ADDS them to\n' +
          "ReceiptAnalytics' BGN columns unconverted, while getAnalytics() converts them out with\n" +
          'bgnToEur(). The registry classifies services/receiptAnalytics.service.ts\n' +
          "'asymmetric-dormant' only while that chain is dead. Making it live requires converting\n" +
          'the write (eurToBgn) before updateAnalytics() accumulates it.\n' +
          'Tracked as BC-QA-031-FOLLOWUP-3.',
    ).toBe('dormant');
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
