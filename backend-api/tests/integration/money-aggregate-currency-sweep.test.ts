/**
 * BC-QA-031-FOLLOWUP-1 task-r1 F1 — currency-aware money AGGREGATES.
 *
 * THE CLASS THIS GUARDS
 * ---------------------
 * The sibling `money-label-literal-sweep` checks that a converted ROW never
 * ships under a hardcoded label. It is blind to aggregates, and that blindness
 * cost a round: three endpoints kept summing a mixed-currency column flat and
 * dividing the whole thing by the BGN peg, on the very screens whose per-row
 * labels this task had just made honest. Measured live, `GET
 * /api/wallet/statistics` returned `{"totalTopups":156.02,"currency":"EUR"}`
 * over rows of 195.58 BGN + 19.56 BGN + 50 USD + 40 EUR.
 *
 * The rule this sweep encodes:
 *
 *   A Prisma aggregate that sums a MONEY column on a currency-bearing model
 *   must have `currency` in its grouping key, so the per-currency subtotals can
 *   be folded by `foldMixedCurrencyToEur` — which converts what it can and
 *   reports what it cannot. Any site that legitimately does not need this must
 *   say why, in the registry below.
 *
 * WHY A REGISTRY RATHER THAN "FIX EVERYTHING"
 * -------------------------------------------
 * Not every `_sum` becomes a displayed EUR figure. Some feed an internal
 * threshold comparison in the storage unit, some live on code with no caller.
 * Converting those would be churn without meaning. What must not happen is a
 * site being skipped SILENTLY — so the file set is re-derived from disk on
 * every run and an unregistered, ungrouped money aggregate fails this test.
 *
 * SCOPE: ALL of `src/`, walked recursively (task-r2 F15). It used to scan only
 * `src/routes` and `src/services`, which made `src/jobs`, `src/queues`,
 * `src/lib`, `src/websocket`, `src/validators` and `src/config` invisible — a
 * flat `walletTransaction.aggregate` planted in `src/jobs` left the sweep green
 * while this very header claimed the file set was re-derived from disk.
 * `src/jobs/scheduler.ts` already does money work, so that was a live blind
 * spot rather than a theoretical one.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');
const SCAN_DIRS = [SRC];

/** Models whose rows carry a `currency` column (schema.prisma). */
const CURRENCY_BEARING = ['transaction', 'wallet', 'walletTransaction'];

/** Money columns on those models. A `_sum` over any of these is a money figure. */
const MONEY_FIELDS = [
  'amount',
  // Transaction.discount is a money column too (task-r2 S9). No site sums it
  // today; listing it means one that starts to is caught rather than ignored.
  'discount',
  'finalAmount',
  'cashbackAmount',
  'marginAmount',
  'netAmount',
  'discountAmount',
  'refundedAmount',
  'processingFee',
  'balance',
  'availableBalance',
  'pendingBalance',
];

type Reason =
  /**
   * The sum never leaves the storage unit AND does not determine a money value:
   * it is compared, discarded, and nothing downstream depends on its magnitude
   * being right. Structurally safe — no legacy row can make it wrong, because
   * nothing renders it and nothing computes money from it.
   *
   * NARROWED by task-r2 F16. The old definition said only "never becomes a
   * labelled money figure", and the two `fraudDetection` entries hid behind
   * that: their sums are never displayed, but they DO set the cashback cap, so
   * the magnitude decides how much money a user is credited. Both were retagged
   * `bgn-by-provenance`. This value currently has NO members — kept because it
   * is the right disposition for a genuinely inert sum, and because deleting it
   * would invite the next such site to be tagged something weaker.
   */
  | 'internal-threshold'
  /**
   * The sum's MAGNITUDE MATTERS — it becomes a displayed EUR figure, or it
   * determines a money value such as a cap or a threshold that money is
   * computed from — and it is safe only because every row it can see was
   * written by a caller that omits the `currency` column (schema default BGN).
   *
   * This is a PROVENANCE argument, not a structural one (impl-r4 F12): it holds
   * exactly as long as no legacy non-BGN row exists in the aggregated set. Six
   * entries used to be tagged `internal-threshold`, whose own definition says
   * the opposite — one of them contradicted its own tag in its own `why` text —
   * which made a data-dependent exposure read as a permanent guarantee. Every
   * entry with this reason MUST cite the follow-up that retires it.
   */
  | 'bgn-by-provenance'
  /** The code containing it has no caller / its router is not mounted. */
  | 'unreachable';

interface Entry {
  reason: Reason;
  why: string;
}

/** The follow-up that retires the `bgn-by-provenance` exemptions. */
const PROVENANCE_FOLLOW_UP = 'BC-QA-031-FOLLOWUP-12';

/**
 * Sites that sum a money column WITHOUT `currency` in the grouping key.
 *
 * KEYED PER SITE, not per file (impl-r4 F10). The key is
 * `<dir>/<file>:<model>.<op>#<discriminator>`, where the discriminator is
 * derived from the call's own `where` clause — so adding a new aggregate to an
 * already-registered file produces a NEW key and fails the sweep until it is
 * registered on its own. Under the previous file-level key, eight entries
 * silently exempted twenty-five sites, and a freshly planted aggregate in
 * `adminDashboard.routes.ts` passed the sweep green.
 */
const REGISTRY: Record<string, Entry> = {
  // ── The cashback cap: not displayed, but it decides money credited ──
  'services/fraudDetection.service.ts:walletTransaction.aggregate#ut3fzf': {
    reason: 'bgn-by-provenance',
    why:
      "calculateCashback's DAILY cap sum. It becomes earnedToday, then remainingDaily, then clamps " +
      'the credit via Math.min(cashbackAmount, remainingDaily, remainingMonthly) — so its magnitude ' +
      'decides how much money a user actually receives. A legacy 50 USD row would contribute 50 ' +
      'instead of ~97.8 BGN, under-counting the day and letting the cap pass more cashback than ' +
      `policy allows. Safe only because walletService.credit() omits the currency column. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/fraudDetection.service.ts:walletTransaction.aggregate#q0r93j': {
    reason: 'bgn-by-provenance',
    why:
      "calculateCashback's MONTHLY cap sum, feeding earnedThisMonth -> remainingMonthly into the same " +
      'Math.min clamp. Identical exposure and the same provenance argument as the daily window ' +
      `above: an under-counted month raises the effective cap. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },

  // ── Displayed EUR money, safe only by provenance — retire via the follow-up ──
  'services/adminCashback.service.ts:walletTransaction.aggregate#k9kg3h': {
    reason: 'bgn-by-provenance',
    why:
      'getSummary totalOwed subtotal. It reaches a rendered EUR figure through ' +
      'adminCashback.routes.ts bgnToEur(entry.totalOwed), so it is NOT internal. Safe only because ' +
      'every CASHBACK_CREDIT row is written by walletService.credit(), which omits the currency ' +
      `column. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#hfhh7w': {
    reason: 'bgn-by-provenance',
    why:
      'Cashback ledger subtotal on the same admin summary; identical provenance argument and the ' +
      `same rendered-EUR exposure as the entry above. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#1co99t': {
    reason: 'bgn-by-provenance',
    why:
      'Cashback ledger subtotal on the same admin summary; identical provenance argument and the ' +
      `same rendered-EUR exposure. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#dvyrj5': {
    reason: 'bgn-by-provenance',
    why:
      'Cashback ledger subtotal on the same admin summary; identical provenance argument and the ' +
      `same rendered-EUR exposure. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#1lf0kt': {
    reason: 'bgn-by-provenance',
    why:
      'Per-partner cashback obligation subtotal; reaches the admin cashback screen as an EUR figure ' +
      `through the same bgnToEur boundary. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#clweql': {
    reason: 'bgn-by-provenance',
    why:
      'Per-partner cashback obligation subtotal; same rendered-EUR exposure and the same provenance ' +
      `argument. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#1m4d50': {
    reason: 'bgn-by-provenance',
    why:
      'Per-partner cashback obligation subtotal; same rendered-EUR exposure and the same provenance ' +
      `argument. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'services/adminCashback.service.ts:walletTransaction.aggregate#1dl6ds': {
    reason: 'bgn-by-provenance',
    why:
      'Per-partner cashback obligation subtotal; same rendered-EUR exposure and the same provenance ' +
      `argument. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'routes/adminFinance.routes.ts:walletTransaction.groupBy#1q9jd3': {
    reason: 'bgn-by-provenance',
    why:
      'Monthly finance roll-up grouped by transaction type; its subtotals are rendered as EUR on ' +
      'the finance dashboard, so this is NOT internal. Safe only because walletService omits the ' +
      `currency column on every row it writes. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'routes/adminFinance.routes.ts:walletTransaction.groupBy#17al90': {
    reason: 'bgn-by-provenance',
    why:
      'Second monthly finance roll-up over the same wallet rows; identical rendered-EUR exposure ' +
      `and provenance argument. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'routes/adminFinance.routes.ts:walletTransaction.groupBy#1k9k4p': {
    reason: 'bgn-by-provenance',
    why:
      'Period-scoped finance roll-up feeding an EUR figure on the same dashboard; same provenance ' +
      `argument, same data-dependent exposure. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },
  'routes/adminFinance.routes.ts:walletTransaction.groupBy#eu7kk4': {
    reason: 'bgn-by-provenance',
    why:
      'Period-scoped finance roll-up feeding an EUR figure on the same dashboard; same provenance ' +
      `argument, same data-dependent exposure. Retire in ${PROVENANCE_FOLLOW_UP}.`,
  },

  // ── Unreachable: no caller / router never mounted (task-r1 F4) ──
  'services/payment.service.ts:transaction.aggregate#1ofcl2': {
    reason: 'unreachable',
    why:
      'PaymentService.getPaymentStats has zero importers anywhere under src/ (task-r1 F4), so this ' +
      'aggregate cannot reach a response. Documented rather than converted, because converting ' +
      'unreachable code hides the fact that it is unreachable.',
  },
  'services/payment.service.ts:transaction.aggregate#f1o7so': {
    reason: 'unreachable',
    why:
      'Second aggregate inside the same caller-less PaymentService.getPaymentStats; unreachable for ' +
      'the same reason and left as-is for the same reason.',
  },
  'services/payment.service.ts:transaction.aggregate#1ovnb2': {
    reason: 'unreachable',
    why:
      'Third aggregate inside the same caller-less PaymentService.getPaymentStats; unreachable for ' +
      'the same reason and left as-is for the same reason.',
  },
  'routes/payments.routes.ts:transaction.groupBy#lvl6eu': {
    reason: 'unreachable',
    why:
      'paymentsRouter is imported in server.ts and never mounted (task-r1 F4), so every route in ' +
      'this file 404s. Documented rather than converted, because converting unreachable code hides ' +
      'the fact that it is unreachable.',
  },
};
/**
 * Strip comments so prose cannot enrol or excuse a site.
 *
 * NEWLINE-PRESERVING (impl-r4 F13). The previous version collapsed each
 * `/* … *\/` span to a single space, which destroyed every newline inside it —
 * so every line number derived afterwards was short by the number of comment
 * lines above it. A site planted at real line 1011 was reported as 998, and the
 * heavily-commented files in this repo drifted by up to 61 lines: precisely the
 * files where finding the site by eye is hardest. Each stripped span now keeps
 * its own newlines, so offsets stay true to the original source.
 */
function stripComments(src: string): string {
  const keepNewlines = (match: string) => match.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, keepNewlines)
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, lead: string) => lead);
}

/** Extract the balanced `(...)` argument text starting at `open`. */
function argsAt(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

interface Site {
  /** Per-SITE identity: file + callee + a discriminator drawn from the call itself. */
  key: string;
  file: string;
  line: number;
  callee: string;
  groupsByCurrency: boolean;
  sumsMoney: boolean;
}

/**
 * Recursively collect every `.ts` under `dir`.
 *
 * The original scanner read only the top level of `src/routes` and
 * `src/services`. Any aggregate in a subdirectory — or in a sibling directory
 * such as `src/jobs` — was invisible to it, and it agreed with an exhaustive
 * enumeration only by accident of where the calls happened to sit. Walking
 * recursively removes the coincidence. (No site count is quoted here on
 * purpose: a number in a comment cannot re-derive itself, and the count is
 * asserted executably by the registry-size check below — AX-175.)
 */
function tsFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * A stable discriminator for one call site within a file.
 *
 * WHY THIS EXISTS (impl-r4 F10). The key used to be `<file>:<model>.<op>`, so a
 * single registry entry exempted EVERY present and future aggregate of that
 * shape in that file. Eight entries were silently excusing twenty-five sites,
 * and the reviewer demonstrated the consequence: a brand-new flat
 * `walletTransaction.aggregate` appended to `adminDashboard.routes.ts` — an
 * already-registered file — left the sweep 5/5 green, while the byte-identical
 * function in an unregistered file reddened at once. The sweep's own header
 * promised the opposite.
 *
 * The discriminator is derived from the call's `where` clause rather than from
 * its line number: line numbers churn on every edit above them and would make
 * the registry a maintenance tax, whereas two aggregates in the same file that
 * do the same thing to the same filter are genuinely the same site. A new
 * aggregate with a different filter gets a different key and must be
 * registered on its own.
 */
function siteDiscriminator(args: string): string {
  const where = /\bwhere\s*:\s*(\{[\s\S]*?\})\s*,\s*(?:_sum|_count|_avg|by|orderBy|select)/.exec(args);
  const basis = (where?.[1] ?? args)
    .replace(/\s+/g, '')
    .replace(/['"`]/g, '');
  // Short, stable, and readable enough to look up by eye in the source.
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = (h * 31 + basis.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 6);
}

function findSites(): Site[] {
  const sites: Site[] = [];
  // Receiver pattern widened to any identifier (the reviewer's enumeration used
  // `any receiver`, not just prisma|tx|client) so a call through an aliased
  // client cannot slip past.
  const callRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\.(${CURRENCY_BEARING.join('|')})\\.(aggregate|groupBy)\\s*\\(`,
    'g',
  );

  for (const dir of SCAN_DIRS) {
    for (const full of tsFilesUnder(dir)) {
      const rel = path.relative(SRC, full).split(path.sep).join('/');
      const raw = fs.readFileSync(full, 'utf8');
      const src = stripComments(raw);
      callRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(src)) !== null) {
        const open = src.indexOf('(', m.index + m[0].length - 1);
        const args = argsAt(src, open);
        const sumBlock = /_sum\s*:\s*\{([^}]*)\}/.exec(args);
        const sumsMoney = !!sumBlock && MONEY_FIELDS.some((fld) => new RegExp(`\\b${fld}\\s*:\\s*true`).test(sumBlock[1]));
        const byBlock = /\bby\s*:\s*\[([^\]]*)\]/.exec(args);
        const groupsByCurrency = !!byBlock && /['"]currency['"]/.test(byBlock[1]);
        const callee = `${m[2]}.${m[3]}`;
        sites.push({
          key: `${rel}:${callee}#${siteDiscriminator(args)}`,
          file: rel,
          line: src.slice(0, m.index).split('\n').length,
          callee,
          groupsByCurrency,
          sumsMoney,
        });
      }
    }
  }
  return sites;
}

describe('[MONEY-AGGREGATE sweep] a money sum over a currency-bearing model is grouped by currency', () => {
  it('has real input — the scanner finds aggregate call sites on disk', () => {
    const sites = findSites();
    // Guards against a vacuous pass from a broken regex or a wrong path.
    expect(sites.length).toBeGreaterThan(15);
    expect(sites.some((s) => s.sumsMoney)).toBe(true);
    expect(sites.some((s) => s.groupsByCurrency)).toBe(true);
  });

  it('scans ALL of src/, not just routes and services (task-r2 F15)', () => {
    // The scope regression can only be DEMONSTRATED by planting a violation in
    // src/jobs (done, and it reddens) — but a planted file must not be
    // committed, so the property is asserted statically here instead.
    expect(SCAN_DIRS).toEqual([SRC]);

    const files = SCAN_DIRS.flatMap(tsFilesUnder);
    const topLevel = new Set(
      files.map((f) => path.relative(SRC, f).split(path.sep)[0]).filter((d) => d.endsWith('.ts') === false),
    );
    // The tree really does have money-capable code outside routes/services —
    // src/jobs/scheduler.ts among them — so a routes+services-only scan is a
    // live blind spot, not a theoretical one.
    expect(topLevel.has('jobs')).toBe(true);
    expect(topLevel.size).toBeGreaterThan(2);
    expect(files.some((f) => f.endsWith(path.join('jobs', 'scheduler.ts')))).toBe(true);
  });

  it('MONEY_FIELDS covers every money column on the currency-bearing models (task-r2 S9)', () => {
    // Drawn from schema.prisma. A `_sum` over any of these is a money figure;
    // omitting one means a future aggregate over it is invisible to the sweep.
    for (const field of ['amount', 'discount', 'finalAmount', 'cashbackAmount', 'marginAmount', 'netAmount']) {
      expect(MONEY_FIELDS).toContain(field);
    }
  });

  it('two sites with identical filters collide on one key — which is what the count check catches (task-r2 F17)', () => {
    // The discriminator is hashed from the call's `where` clause, so two sites
    // that filter identically DO share a key. That is the residual the
    // registry-size assertion exists to catch: it is only invisible while the
    // registry has one entry per site.
    const a = 'prisma.walletTransaction.aggregate({ where: { walletId: w, type: "TOP_UP" }, _sum: { amount: true } })';
    const b = 'prisma.walletTransaction.aggregate({ where: { walletId: w, type: "TOP_UP" }, _sum: { amount: true } })';
    expect(siteDiscriminator(argsAt(a, a.indexOf('(')))).toBe(siteDiscriminator(argsAt(b, b.indexOf('('))));

    // A different filter must NOT collide.
    const c = 'prisma.walletTransaction.aggregate({ where: { walletId: w, type: "WITHDRAWAL" }, _sum: { amount: true } })';
    expect(siteDiscriminator(argsAt(a, a.indexOf('(')))).not.toBe(siteDiscriminator(argsAt(c, c.indexOf('('))));
  });

  it('reports TRUE line numbers — comment stripping preserves newlines (impl-r4 F13)', () => {
    // The stripper used to collapse each block comment to a single space,
    // destroying its newlines, so every line number derived afterwards was short
    // by the number of comment lines above it: a site planted at real line 1011
    // was reported as 998 and adminFinance drifted by 61 lines. That sends a
    // reader to the wrong place in exactly the files where finding the call by
    // eye is hardest.
    const sample = [
      'const a = 1;',
      '/**',
      ' * a block comment',
      ' * spanning several lines',
      ' */',
      'const b = 2;',
      'prisma.walletTransaction.aggregate({ where: { x: 1 }, _sum: { amount: true } });',
    ].join('\n');

    const stripped = stripComments(sample);
    // Same number of lines in, same number out.
    expect(stripped.split('\n').length).toBe(sample.split('\n').length);

    // And the call still resolves to its real line (7), not to 3.
    const idx = stripped.indexOf('prisma.walletTransaction.aggregate');
    expect(idx).toBeGreaterThan(-1);
    expect(stripped.slice(0, idx).split('\n').length).toBe(7);
  });

  it('recognises the shapes it is supposed to recognise', () => {
    // A self-test of the extractor, so a future refactor cannot quietly make it
    // match nothing and pass everything.
    const sample = `
      prisma.walletTransaction.groupBy({ by: ['type', 'currency'], _sum: { amount: true } });
      prisma.transaction.aggregate({ where: {}, _sum: { finalAmount: true } });
      prisma.walletTransaction.groupBy({ by: ['walletId'], _count: { _all: true } });
    `;
    const callRe = /\b(?:prisma|tx|client)\.(transaction|wallet|walletTransaction)\.(aggregate|groupBy)\s*\(/g;
    const found: Array<{ money: boolean; grouped: boolean }> = [];
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(sample)) !== null) {
      const open = sample.indexOf('(', m.index + m[0].length - 1);
      const args = argsAt(sample, open);
      const sumBlock = /_sum\s*:\s*\{([^}]*)\}/.exec(args);
      const byBlock = /\bby\s*:\s*\[([^\]]*)\]/.exec(args);
      found.push({
        money: !!sumBlock && /\b(amount|finalAmount)\s*:\s*true/.test(sumBlock[1]),
        grouped: !!byBlock && /['"]currency['"]/.test(byBlock[1]),
      });
    }
    expect(found).toEqual([
      { money: true, grouped: true },   // grouped money sum
      { money: true, grouped: false },  // flat money sum
      { money: false, grouped: false }, // count only
    ]);
  });

  it('every money aggregate either groups by currency or is registered with a reason', () => {
    const offenders = findSites()
      .filter((s) => s.sumsMoney && !s.groupsByCurrency)
      .filter((s) => !REGISTRY[s.key]);

    const report = offenders.map((s) => `  - ${s.file}:${s.line}  ${s.callee}`).join('\n');

    expect(
      offenders.length === 0
        ? 'all money aggregates accounted for'
        : 'These sum a money column on a currency-bearing model without `currency` in the\n' +
          'grouping key, so the result mixes denominations before anything can convert it:\n\n' +
          `${report}\n\n` +
          "Add 'currency' to the groupBy key and fold with foldMixedCurrencyToEur(), which\n" +
          'converts the subtotals it has a rate for and reports excludedCount/excludedCurrencies —\n' +
          'or add a REGISTRY entry in this file explaining why this particular sum never becomes\n' +
          'a displayed EUR figure.',
    ).toBe('all money aggregates accounted for');
  });

  /**
   * task-r2 F17 — the registry must have exactly as many entries as there are
   * ungrouped money sites, not merely cover them.
   *
   * The site key ends in a discriminator hashed from the call's `where` clause.
   * Two DIFFERENT sites whose argument text normalises identically would
   * collapse onto one key, and the offender check — which only asks "is this
   * key registered?" — would pass while one of them went unexamined. Comparing
   * the two counts closes that tail: a collision makes 19 sites map to 18
   * entries and this fails. No colliding pair exists today.
   */
  it('has exactly one registry entry per ungrouped money site (task-r2 F17)', () => {
    const ungrouped = findSites().filter((s) => s.sumsMoney && !s.groupsByCurrency);
    const distinctKeys = new Set(ungrouped.map((s) => s.key));

    // Every site has its own key — no two collapse onto one.
    expect(distinctKeys.size).toBe(ungrouped.length);
    // And the registry describes exactly those sites, no more and no fewer.
    expect(Object.keys(REGISTRY).length).toBe(ungrouped.length);
  });

  it('the registry has no stale entries', () => {
    const live = new Set(findSites().filter((s) => s.sumsMoney && !s.groupsByCurrency).map((s) => s.key));
    const stale = Object.keys(REGISTRY).filter((k) => !live.has(k));

    expect(
      stale.length === 0
        ? 'no stale entries'
        : `Registry entries whose site no longer exists or now groups by currency:\n${stale
            .map((k) => `  - ${k}`)
            .join('\n')}`,
    ).toBe('no stale entries');
  });

  it('every registry entry carries a non-trivial justification and a per-site key', () => {
    for (const [key, entry] of Object.entries(REGISTRY)) {
      expect(entry.why.length).toBeGreaterThan(60);
      expect(['internal-threshold', 'bgn-by-provenance', 'unreachable']).toContain(entry.reason);
      // Per-site key, not per-file (impl-r4 F10): the `#<discriminator>` suffix
      // is what stops a new aggregate inheriting an existing file's exemption.
      expect(key).toMatch(/^(routes|services)\/[\w.-]+\.ts:\w+\.(aggregate|groupBy)#[0-9a-z]+$/);
    }
  });

  it('every provenance-based exemption cites the follow-up that retires it (impl-r4 F12)', () => {
    // `bgn-by-provenance` is data-dependent, not structural: it holds only while
    // no legacy non-BGN row exists in the aggregated set. An entry that does not
    // name its retirement path is the same concealment the mis-tagging caused.
    const provenance = Object.entries(REGISTRY).filter(([, e]) => e.reason === 'bgn-by-provenance');
    expect(provenance.length).toBeGreaterThan(0);
    for (const [key, entry] of provenance) {
      expect(`${key} -> ${entry.why}`).toContain(PROVENANCE_FOLLOW_UP);
    }
  });

  it('no entry claims to be internal while describing a rendered figure (impl-r4 F12)', () => {
    // The mis-tag that made twenty-five sites look accounted for was an
    // `internal-threshold` entry whose own text said "callers apply bgnToEur at
    // the route boundary" — describing the exact conversion the tag denies.
    //
    // The tell is a CONVERSION HELPER, not a rendering word: a truthful internal
    // entry naturally says "never returned, rendered or labelled", so matching
    // rendering vocabulary would flag the honest negative form too.
    const RENDERED = /bgnToEur|toEur\s*\(|foldMixedCurrencyToEur/i;
    for (const [key, entry] of Object.entries(REGISTRY)) {
      if (entry.reason !== 'internal-threshold') continue;
      expect(`${key}: ${entry.why}`).not.toMatch(RENDERED);
    }
  });

  it('no entry claims to be internal while describing a sum that decides money (task-r2 F16)', () => {
    // The second half of the narrowed `internal-threshold` definition: the sum
    // must not DETERMINE a money value either. Two fraudDetection entries hid
    // behind the old wording — never displayed, but feeding
    // `Math.min(cashbackAmount, remainingDaily, remainingMonthly)`, so their
    // magnitude set how much cashback a user was credited. "Never rendered" was
    // true and irrelevant; the tag's safety claim was false.
    const DECIDES_MONEY = /Math\.min|clamp|cap\b|caps\b|remaining(Daily|Monthly)|credited|threshold that/i;
    for (const [key, entry] of Object.entries(REGISTRY)) {
      if (entry.reason !== 'internal-threshold') continue;
      expect(`${key}: ${entry.why}`).not.toMatch(DECIDES_MONEY);
    }
  });
});
