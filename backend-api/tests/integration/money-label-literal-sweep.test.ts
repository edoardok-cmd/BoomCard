/**
 * BC-QA-031-FOLLOWUP-1 impl-r1 F3 — currency-label honesty sweep.
 *
 * THE CLASS THIS GUARDS
 * ---------------------
 * BC-QA-031-FOLLOWUP-1 exists because three read paths did this:
 *
 *     { amount: toEur(row.amount, row.currency), currency: 'EUR' }
 *
 * The conversion is keyed on the row; the LABEL is a literal. For every row in
 * the accepted domain the two agree, so the bug is invisible in testing — until
 * a row arrives that the conversion cannot handle, at which point the literal
 * asserts a unit the amount is not in. That is exactly how a 100.00 USD top-up
 * came to be reported as EUR 100.00.
 *
 * The round-1 review then found the identical shape one column over, on
 * `Wallet`/`WalletTransaction` reads (F3), which the original fix had not
 * touched. Fixing five call sites by hand does not stop the sixth from being
 * written next week — so this sweep makes the RULE executable:
 *
 *   No object literal may pair a currency STRING LITERAL with a money
 *   CONVERSION CALL. If an object converts money, its currency label must be
 *   derived from the same row the conversion was keyed on — in practice
 *   `displayCurrency(...)`, or `toDisplayMoney(...)` which returns both at once
 *   and therefore cannot disagree with itself.
 *
 * WHY SOURCE ANALYSIS
 * -------------------
 * Same reasoning as `money-read-write-unit-sweep.test.ts`: route introspection
 * yields method + path, not which column a handler converted or what label it
 * paired with it. The signal lives in the source, so the sweep reads the source
 * — re-derived from disk on every run, so it cannot pass vacuously and cannot
 * be satisfied by editing a hardcoded list.
 *
 * Comments are stripped before scanning. An earlier revision of a sibling sweep
 * matched a helper name mentioned in PROSE, which is a false positive that
 * teaches people to word comments around the tool instead of fixing code.
 */

import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');
const SCAN_DIRS = [path.join(SRC, 'routes'), path.join(SRC, 'services')];

/** Money conversion helpers whose result is denominated by a ROW's currency. */
const CONVERSION_CALL = /\b(bgnToEur|toEur|toEurOrNull|toDisplayMoney|sumMixedCurrencyToEur)\s*\(/;

/** `currency: 'EUR'` / `currency: "BGN"` / `paidCurrency: 'EUR'` … */
const CURRENCY_LITERAL = /\b(\w*[cC]urrency)\s*:\s*(['"])([A-Za-z]{3})\2/g;

/**
 * Strip `//` line comments and block comments, preserving offsets so reported
 * line numbers stay true. String contents are preserved (we need to see the
 * currency literals), so a `//` inside a string literal is handled by tracking
 * quote state.
 */
function stripComments(src: string): string {
  const out = src.split('');
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'tick' = 'code';
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === "'") state = 'single';
      else if (c === '"') state = 'double';
      else if (c === '`') state = 'tick';
      i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; i += 1; continue; }
      out[i] = ' '; i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c !== '\n') out[i] = ' ';
      i += 1; continue;
    }
    // inside a string: only look for its terminator, honouring backslash escapes
    if (c === '\\') { i += 2; continue; }
    if ((state === 'single' && c === "'") || (state === 'double' && c === '"') || (state === 'tick' && c === '`')) {
      state = 'code';
    }
    i += 1;
  }
  return out.join('');
}

/** Index of the `{` opening the object literal that contains `pos`. */
function enclosingObjectStart(src: string, pos: number): number | null {
  let depth = 0;
  for (let i = pos; i >= 0; i--) {
    const c = src[i];
    if (c === '}') depth += 1;
    else if (c === '{') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return null;
}

/**
 * Is the `{` at `i` the start of an OBJECT LITERAL rather than a code block?
 *
 * Decided by the previous non-whitespace token: an object literal can only
 * appear in expression position, so it follows `(`, `,`, `=`, `:`, `[`, `&&`,
 * `||`, `?` or `return`. A block brace follows `)`, `;`, `{`, `}`, `=>`, or a
 * keyword like `else`/`try`/`do`.
 *
 * `=>` is deliberately NOT in the accept list: `=> {` opens a function BODY,
 * while an arrow returning an object is always written `=> ({`, which the `(`
 * rule already accepts. Treating a bare `=>` as an object start made the walk
 * climb into the enclosing handler body and attribute unrelated conversions to
 * an EUR-native label (`subscriptions.routes.ts`'s Stripe-invoice map, whose
 * amounts come from `Plan.price*Eur` and are genuinely never converted).
 *
 * The stop matters because the ancestor walk below must halt at the first
 * enclosing BLOCK; otherwise any conversion elsewhere in the same function is
 * blamed on this label.
 */
function isObjectLiteralStart(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 0) return false;
  const c = src[j];
  if ('(,=:[&|?'.includes(c)) return true;
  return /\breturn$/.test(src.slice(Math.max(0, j - 6), j + 1));
}

/**
 * Every enclosing OBJECT LITERAL `{` around `pos`, innermost first, stopping at
 * the first enclosing code block.
 *
 * Checking ONLY the innermost object is not enough, and this is not
 * hypothetical: `adminPayouts.routes.ts`'s `toEurPayout` writes its label with
 * the conditional-spread idiom
 *
 *     ...(payout.currency !== undefined && { currency: displayCurrency(...) }),
 *
 * whose innermost enclosing object is the two-token `{ currency: … }` inside the
 * `&&`. That object contains no conversion call, so an innermost-only scan
 * reported the site clean even with the label hardcoded — the sweep silently
 * failed to cover the very file F3 named. Walking the ancestor chain fixes it:
 * a literal label is a violation if ANY object literal it sits inside also
 * converts money, which is precisely the rule this sweep encodes.
 */
function enclosingObjectStarts(src: string, pos: number): number[] {
  const starts: number[] = [];
  let from = pos;
  // Bounded by the file: each step moves strictly left, so this terminates.
  for (;;) {
    const start = enclosingObjectStart(src, from);
    if (start === null) return starts;
    if (!isObjectLiteralStart(src, start)) return starts; // hit a code block
    starts.push(start);
    if (start === 0) return starts;
    from = start - 1;
  }
}

/** Index of the `}` matching the `{` at `start`. */
function matchingObjectEnd(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return src.length - 1;
}

function lineOf(src: string, pos: number): number {
  return src.slice(0, pos).split('\n').length;
}

function tsFilesIn(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(dir, f));
}

interface Violation {
  file: string;
  line: number;
  label: string;
  snippet: string;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of tsFilesIn(dir)) {
      const raw = fs.readFileSync(file, 'utf8');
      const src = stripComments(raw);
      CURRENCY_LITERAL.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CURRENCY_LITERAL.exec(src)) !== null) {
        const starts = enclosingObjectStarts(src, m.index);
        if (starts.length === 0) continue;
        // A violation if the literal sits inside ANY object literal that also
        // converts money — see `enclosingObjectStarts` for why the innermost
        // one alone is not sufficient.
        const converts = starts.some((start) =>
          CONVERSION_CALL.test(src.slice(start, matchingObjectEnd(src, start) + 1)),
        );
        if (!converts) continue;

        violations.push({
          file: path.relative(SRC, file),
          line: lineOf(src, m.index),
          label: `${m[1]}: '${m[3]}'`,
          snippet: raw.split('\n')[lineOf(src, m.index) - 1]?.trim() ?? '',
        });
      }
    }
  }
  return violations;
}

describe('[MONEY-LABEL sweep] a converted amount never ships under a literal currency label', () => {
  it('has real input — the scanner sees the source tree and the recognisers match something', () => {
    // Guards against a vacuous pass: if the directories were empty, the path
    // wrong, or the comment stripper ate everything, every assertion below
    // would pass by finding nothing.
    const files = SCAN_DIRS.flatMap(tsFilesIn);
    expect(files.length).toBeGreaterThan(20);

    const converting = files.filter((f) => CONVERSION_CALL.test(stripComments(fs.readFileSync(f, 'utf8'))));
    expect(converting.length).toBeGreaterThan(5);

    // And the literal recogniser must match a currency literal SOMEWHERE in the
    // tree (there are plenty in EUR-native responses that legitimately do not
    // convert), otherwise the regex is broken.
    const anyLiteral = files.some((f) => {
      CURRENCY_LITERAL.lastIndex = 0;
      return CURRENCY_LITERAL.test(stripComments(fs.readFileSync(f, 'utf8')));
    });
    expect(anyLiteral).toBe(true);
  });

  it('strips comments rather than matching helper names mentioned in prose', () => {
    const sample = `
      // toEur( mentioned in a line comment
      /* currency: 'EUR' inside a block comment */
      const x = { amount: 1, currency: 'EUR' };
    `;
    const stripped = stripComments(sample);
    expect(stripped).not.toContain('toEur(');
    // The real code line survives intact.
    expect(stripped).toContain("currency: 'EUR'");
    // Line numbering is preserved so reported positions stay true.
    expect(stripped.split('\n').length).toBe(sample.split('\n').length);
  });

  // Self-tests for the scanner's two known blind spots, both found by reverting
  // real sites one at a time (impl-r2). Without these, a future simplification
  // of the scoping logic could silently stop covering `toEurPayout` again.
  it('sees through the conditional-spread idiom that hides a label in a tiny inner object', () => {
    const sample = `
      function toEurPayout(payout) {
        return {
          ...payout,
          amount: toEur(payout.amount, rowCurrency),
          ...(payout.currency !== undefined && { currency: 'EUR' }),
        };
      }
    `;
    CURRENCY_LITERAL.lastIndex = 0;
    const m = CURRENCY_LITERAL.exec(sample)!;
    expect(m).not.toBeNull();

    // Innermost object is `{ currency: 'EUR' }` — no conversion in it.
    const innermost = enclosingObjectStart(sample, m.index)!;
    expect(CONVERSION_CALL.test(sample.slice(innermost, matchingObjectEnd(sample, innermost) + 1))).toBe(false);

    // The ancestor walk reaches the returned object, which does convert.
    const starts = enclosingObjectStarts(sample, m.index);
    expect(starts.length).toBeGreaterThan(1);
    expect(
      starts.some((s) => CONVERSION_CALL.test(sample.slice(s, matchingObjectEnd(sample, s) + 1))),
    ).toBe(true);
  });

  it('stops at a function body, so an unrelated conversion nearby is not blamed on an EUR-native label', () => {
    // `=> {` opens a BODY; the EUR-native object inside must not inherit the
    // conversion performed on a different value earlier in the same function.
    const sample = `
      router.get('/x', async (req, res) => {
        const rows = stored.map(r => ({ amount: toEur(r.amount, r.currency), currency: displayCurrency(r.currency) }));
        const native = invoices.map(inv => ({ amount: inv.amount_paid / 100, currency: 'EUR' }));
        res.json({ rows, native });
      });
    `;
    CURRENCY_LITERAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    let literalIndex = -1;
    while ((m = CURRENCY_LITERAL.exec(sample)) !== null) {
      if (m[3] === 'EUR' && sample.slice(m.index - 30, m.index).includes('amount_paid')) literalIndex = m.index;
    }
    expect(literalIndex).toBeGreaterThan(-1);

    const starts = enclosingObjectStarts(sample, literalIndex);
    expect(
      starts.some((s) => CONVERSION_CALL.test(sample.slice(s, matchingObjectEnd(sample, s) + 1))),
    ).toBe(false);
  });

  /**
   * task-r1 F5 — the same amount/label disagreement, in a CSV header.
   *
   * The payouts export writes a per-row `Валута` column derived from
   * `displayCurrency(p.currency)`, so a legacy row can export a USD magnitude.
   * A `(€)` in the amount column's header denominates that figure in euros
   * regardless — in the one artifact most likely to be read outside the app,
   * where the currency column is the only thing disambiguating it.
   */
  it('no export column header hardcodes a currency symbol beside a per-row currency column', () => {
    const financeSrc = stripComments(
      fs.readFileSync(path.join(SRC, 'routes', 'adminFinance.routes.ts'), 'utf8'),
    );

    // Premise: the export really does emit a per-row currency column.
    expect(financeSrc).toContain('displayCurrency(p.currency)');

    const headerBlocks = financeSrc.match(/_DISPLAY_HEADERS[^=]*=\s*\{[\s\S]*?\n\s*\};/g) ?? [];
    expect(headerBlocks.length).toBeGreaterThan(0);

    // Only blocks that ALSO declare a per-row `currency` column are in scope.
    // The other exports (cashback summary, partner obligations) carry no such
    // column and are genuinely EUR-denominated end to end, so a `(€)` header
    // there is informative rather than contradictory — flagging them would be
    // noise that teaches people to delete useful headers.
    const scoped = headerBlocks.filter((b) => /\n\s*currency\s*:/.test(b));
    expect(scoped.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const block of scoped) {
      for (const line of block.split('\n')) {
        if (/[€$£]|\bлв\b/.test(line)) offenders.push(line.trim());
      }
    }

    expect(
      offenders.length === 0
        ? 'no currency-symbol headers'
        : `These CSV column headers denominate their column in a fixed currency while the\n` +
          `export emits a per-row currency column beside it:\n${offenders.map((o) => `  - ${o}`).join('\n')}`,
    ).toBe('no currency-symbol headers');
  });

  it('no response object pairs a money conversion with a hardcoded currency label', () => {
    const violations = findViolations();

    const report = violations
      .map((v) => `  - ${v.file}:${v.line}  ${v.label}\n      ${v.snippet}`)
      .join('\n');

    expect(
      violations.length === 0
        ? 'no literal-labelled conversions'
        : 'These objects convert money AND hardcode the currency label, so the label is an\n' +
          'assertion rather than a fact about the row that was converted:\n\n' +
          `${report}\n\n` +
          'This is the BC-QA-031-FOLLOWUP-1 defect class. Derive the label from the same\n' +
          'row the conversion was keyed on:\n' +
          "  amount: toEur(row.amount, row.currency), currency: displayCurrency(row.currency)\n" +
          'or use toDisplayMoney(row.amount, row.currency), which returns both together and\n' +
          'therefore cannot disagree with itself.',
    ).toBe('no literal-labelled conversions');
  });
});
