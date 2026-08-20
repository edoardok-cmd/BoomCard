/**
 * BC-QA-031 — standing guard against unmarked dual-currency requirement text in
 * the spec corpus (`docs/specs/`).
 *
 * WHY THIS EXISTS
 * ---------------
 * The dual-currency (BGN+EUR) display feature was removed, but the requirement
 * documents that mandate it are prose, so nothing failed when they were left
 * behind. This task was bitten by stale documentation four separate times, each
 * caught only because a person happened to read the right file:
 *   • nine files dating the retirement 2026-08-10, a day nothing shipped
 *   • INV-RDM-082 citing a describe block containing no /my-scans test
 *   • 33 manifest routes tagged `sweep:CUR`, naming a deleted suite
 *   • `08-user-spec-extracted.md` §17 + `01`/`02` still REQUIRING simultaneous
 *     BGN+EUR display, through seven audit rounds
 *
 * The last of those is the reason this file checks BOTH ALPHABETS. `08` was
 * missed because nobody swept the numbered set as a set; `01-admin-module-final.md`
 * and `02-partner-module-final.md` were missed by everyone — reviewer and
 * implementer alike — because their requirements are written in Bulgarian and
 * every sweep used English patterns. That is encoded here rather than left as a
 * lesson in a report.
 *
 * WHAT IT ASSERTS
 * ---------------
 * Not "this phrasing may never appear" — the corpus legitimately contains the
 * historical record: the original clash catalogue (`00`), the clash-resolution
 * decision (`04`), and the dated client deliverables (`01`, `02`). Deleting those
 * would falsify what was specified and decided at the time.
 *
 * Corpus: every `*.md` under `docs/` (see the SPECS constant for why not wider).
 *
 * The rule is instead: any dual-display requirement text must carry a dated
 * BC-QA-031 supersession marker NEARBY, so a reader cannot land on a live-voice
 * requirement without immediately seeing that it no longer holds. New unmarked
 * text fails the build.
 */

import fs from 'fs';
import path from 'path';

/**
 * The corpus is all of `docs/`, recursively — NOT just `docs/specs/`.
 *
 * It started as `docs/specs/*.md` and that let one live-voice site through:
 * `docs/BC-USER-SPEC-GAP-001-report.md` still quoted §17's dual-display rule as
 * the live spec rule AND reported a `CURRENCY_TRANSITION_MODE` env var — deleted
 * by this task — as the shipped resolution.
 *
 * The widening was measured rather than assumed, because a wider net over a repo
 * full of historical reports can cost more in false positives than it buys:
 *   docs/specs/  21 files →  7 marked, 0 unmarked
 *   docs/**      50 files →  9 marked, 0 unmarked  (+1 true positive, 0 false)
 *   whole repo  350 files →  8 marked, 6 unmarked  (5 of them audit artifacts)
 *
 * `docs/**` costs nothing and catches a real one. The repo-wide option was
 * rejected: five of its six extra hits are dated review files under
 * `backend-api/.claude/reviews/`, which are an append-only audit trail. Demanding
 * that past review rounds be edited to satisfy a present-day check would falsify
 * the record, and the set grows with every review — a check that nags about
 * immutable history is a check somebody disables.
 */
const SPECS = path.join(__dirname, '..', '..', '..', 'docs');

/**
 * A line counts as dual-display requirement text only when BOTH a dual signal and
 * a currency context appear on it.
 *
 * The two-stage form is not decoration. A bare `simultaneous` matched five
 * unrelated lines about `office@boomcard.bg` serving two mailbox roles and one
 * about the dashboard rendering three cashback buckets — a sweep that cries wolf
 * six times gets muted, which is how this class survives.
 *
 * Bulgarian stems use `\S*`, NOT `\w*`: JavaScript's `\w` is `[A-Za-z0-9_]` and
 * does not match Cyrillic, so `/преходн\w*\s+период/` silently fails against
 * "преходен период". That single character class is the difference between this
 * sweep working in both alphabets and only appearing to.
 */
const DUAL_SIGNALS: Array<{ label: string; re: RegExp }> = [
  // Deliberately NOT a bare /\bboth\b/: that matched "resolved by X and Y (both
  // complete)" in public-invariant-matrix.md, whose only currency token came from
  // a task NAME (…-PLANS-DUAL-CURRENCY), not from a requirement. The real
  // requirement phrasings are these two specific pairings.
  { label: 'en: both BGN and EUR', re: /both\s+BGN\s+and\s+EUR/i },
  { label: 'en: both currencies', re: /both\s+currencies/i },
  { label: 'en: simultaneously', re: /simultaneous(ly)?/i },
  { label: 'bg: едновременно', re: /едновременно/i },
  { label: 'bg: преход* период', re: /преход\S*\s+период/i },
  { label: 'bg: двувалутно', re: /двувалутн\S*/i },
];

/** Currency context — without this, a dual signal is about something else. */
const CURRENCY_CONTEXT = /\bBGN\b|\bEUR\b|валут|двувалутн|\bлв\b|currencies/i;

function classify(line: string): string | null {
  if (!CURRENCY_CONTEXT.test(line)) return null;
  return DUAL_SIGNALS.find((p) => p.re.test(line))?.label ?? null;
}

/**
 * The dated supersession marker that makes a historical occurrence safe to keep.
 *
 * The task id ALONE is not enough, and an earlier revision of this constant was
 * just `/BC-QA-031/` while this file's header and the commit message both said
 * the marker must be dated — so a note reading only "(see BC-QA-031)" beside a
 * live-voice requirement would have passed a check documented to reject it. The
 * date is the part that tells a reader when the supersession happened and lets
 * them cross-check it against the commit history; a bare id does not.
 *
 * Both orderings occur in the corpus and both are accepted:
 *   **Update (2026-08-20, BC-QA-031):** …        (date first)
 *   … has been removed (BC-QA-031, 2026-08-20)   (id first)
 * The 40-character budget keeps the two on the same line, so a date elsewhere in
 * a table row cannot vouch for an unrelated id.
 */
const MARKER =
  /BC-QA-031[^\n]{0,40}\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}[^\n]{0,40}BC-QA-031/;

/**
 * How far from the offending line the marker may sit. Three lines each way covers
 * a note placed directly above a bullet list or directly below a table row, which
 * are the two shapes the corpus actually uses, without letting a marker elsewhere
 * in a 700-line document vouch for text it has nothing to do with.
 */
const MARKER_WINDOW = 3;

interface Hit {
  file: string;
  line: number;
  label: string;
  text: string;
}

function specFiles(): string[] {
  if (!fs.existsSync(SPECS)) {
    throw new Error(
      `spec-corpus-dual-currency-sweep cannot find the docs corpus at ${SPECS}. ` +
        'This suite guards documentation that lives outside backend-api; run it from a full checkout.',
    );
  }
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) out.push(path.relative(SPECS, full));
    }
  };
  walk(SPECS);
  return out.sort();
}

/** Every dual-display occurrence in the corpus, with its marker status. */
function scan(): { marked: Hit[]; unmarked: Hit[] } {
  const marked: Hit[] = [];
  const unmarked: Hit[] = [];

  for (const file of specFiles()) {
    const lines = fs.readFileSync(path.join(SPECS, file), 'utf-8').split('\n');
    lines.forEach((line, i) => {
      const label = classify(line);
      if (!label) return;
      const window = lines.slice(Math.max(0, i - MARKER_WINDOW), i + MARKER_WINDOW + 1).join('\n');
      const hit: Hit = { file, line: i + 1, label, text: line.trim().slice(0, 140) };
      (MARKER.test(window) ? marked : unmarked).push(hit);
    });
  }
  return { marked, unmarked };
}

describe('[SPEC-CORPUS sweep] dual-currency requirement text carries a supersession marker', () => {
  it('the corpus is present and non-trivial', () => {
    // Guards the whole suite against silently passing because the path drifted.
    expect(specFiles().length).toBeGreaterThanOrEqual(40);
  });

  it('the pattern set still matches real dual-display phrasing in both alphabets', () => {
    // Non-vacuity, checked against synthetic controls rather than corpus content:
    // if the regexes rot, every corpus scan returns zero hits and the gate below
    // passes for the wrong reason. These strings are the exact shapes that were
    // found live in `08`, `01` and `02`.
    const controls = [
      'all amounts are displayed in **both BGN and EUR simultaneously.**',
      'all amounts are shown in both currencies simultaneously.',
      'сумите се показват едновременно в BGN и EUR.',
      'По време на дефиниран BGN→EUR преходен период',
      '| Валута | механиката за двувалутно показване е премахната',
    ];
    // Negative controls: dual wording with no currency context must NOT match, or
    // the sweep drowns in office@-mailbox and dashboard-bucket lines.
    const decoys = [
      'office@boomcard.bg both sends outbound notifications and parses inbound mail. Both roles active simultaneously.',
      'The dashboard cashback block must display available, pending, and expiring simultaneously.',
      'Earlier findings (input-boundary 5xx, EUR-only pricing) were resolved by `BC-PUBLIC-SPEC-REAUDIT-PLANS-DUAL-CURRENCY` (both complete).',
    ];
    const falsePositives = decoys.filter((d) => classify(d) !== null);
    expect(
      falsePositives.length === 0
        ? 'no false positives'
        : `These non-currency lines match the pattern set and would drown the signal:\n${falsePositives
            .map((d) => `  - ${d}`)
            .join('\n')}`,
    ).toBe('no false positives');
    const unmatched = controls.filter((c) => classify(c) === null);
    expect(
      unmatched.length === 0
        ? 'all controls matched'
        : `The pattern set no longer recognises known dual-display phrasing:\n${unmatched
            .map((c) => `  - ${c}`)
            .join('\n')}\nFix the patterns — a silent zero-hit scan is how this class returns.`,
    ).toBe('all controls matched');
  });

  it('the marker requirement is real — a marker outside the window does not vouch', () => {
    // Proves MARKER_WINDOW is enforced rather than being a whole-file grep, which
    // would let one dated note at the top of a document clear every stale
    // requirement below it.
    const far = ['**Update (2026-08-20, BC-QA-031):** superseded.', ...Array(10).fill('filler'), 'shown in both currencies simultaneously.'];
    const idx = far.length - 1;
    const window = far.slice(Math.max(0, idx - MARKER_WINDOW), idx + MARKER_WINDOW + 1).join('\n');
    expect(MARKER.test(window)).toBe(false);
  });

  it('no spec file carries an UNMARKED dual-currency requirement', () => {
    const { marked, unmarked } = scan();

    // The corpus legitimately keeps the historical record; if that ever drops to
    // zero the scan has stopped seeing the files it is meant to police.
    expect(marked.length).toBeGreaterThan(0);

    expect(
      unmarked.length === 0
        ? 'all superseded'
        : 'Dual-currency requirement text with no BC-QA-031 supersession marker within ' +
          `${MARKER_WINDOW} lines:\n\n` +
          unmarked.map((h) => `  - docs/${h.file}:${h.line}  [${h.label}]\n      ${h.text}`).join('\n') +
          '\n\nThe BGN→EUR transition window has closed and the dual-currency display feature was\n' +
          'removed in BC-QA-031. A reader must never land on a requirement mandating simultaneous\n' +
          'BGN+EUR display without seeing, in the same breath, that it no longer holds.\n\n' +
          'For a WORKING reference document (06/07/08-*-spec-extracted.md), rewrite the requirement\n' +
          'to the EUR-only contract, as §17 of 08 was.\n' +
          'For a HISTORICAL artifact (00, 01, 02, 04 — dated client deliverables and decision\n' +
          'records), keep the original text and append a dated note, as those four already do:\n' +
          '  **Update (2026-08-20, BC-QA-031):** … / *(Обновено 2026-08-20, BC-QA-031: …)*',
    ).toBe('all superseded');
  });
});
