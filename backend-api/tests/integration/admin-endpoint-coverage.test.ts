/**
 * Admin endpoint-coverage manifest gate.
 *
 * Guarantees COVERAGE BREADTH ("nothing un-looked-at"): every admin endpoint
 * the app actually serves must be accounted for in a committed manifest with a
 * coverage classification. A newly-added admin route that nobody classified
 * fails this test — structurally preventing the run-8 failure mode where a
 * sampling audit never looks at a surface (e.g. the subscriber null-wallet 500
 * lived on a list GET no sweep covered).
 *
 * The manifest is the live route table, frozen + classified. The test diffs the
 * live surface against it:
 *   - a live route missing from the manifest  → FAIL ("new un-accounted endpoint")
 *   - a manifest route no longer live         → FAIL ("stale manifest entry")
 *   - any entry with an unknown coverage tag  → FAIL
 *
 * Bootstrapping / updating: when the manifest is missing OR env
 * `UPDATE_ENDPOINT_MANIFEST=1`, the test (re)writes the manifest from the live
 * surface (auto-classified) and passes with a note. Review the diff, then
 * commit. In CI (no env flag) the test is a pure gate.
 *
 * `review`-tagged routes are intentionally allowed (they are accounted-for but
 * NOT exhaustively swept) — they must map to an invariant-matrix row and be
 * checked by a re-audit. The test reports their count so the gap stays visible.
 *
 * A SEPARATE assertion below closes a distinct gap: a `sweep:<CLASS>` tag being
 * *present* on an entry (checked above via `isValidCoverageTag`) says nothing
 * about whether the suite it names still exists. BC-QA-031 deleted
 * `admin-currency-leak-sweep.test.ts` and left 37 `sweep:CUR` / dangling
 * `matrix:INV-CUR-*` entries claiming coverage from it, undetected, until
 * BC-QA-031-FOLLOWUP-2 caught it by hand. The "every sweep:<CLASS> tag resolves
 * to a suite file on disk" test below makes that check automatic and
 * unconditional on any human noticing, for every current and future sweep
 * class in `SWEEP_SUITE_FILES`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createTestApp } from '../setup';
import {
  adminRoutes,
  classifyRoute,
  routeKey,
  COVERAGE_TAGS,
  isValidCoverageTag,
  SWEEP_SUITE_FILES,
} from '../helpers/adminRoutes';

const MANIFEST_PATH = path.join(__dirname, '..', 'admin-endpoint-manifest.json');

interface ManifestEntry {
  method: string;
  path: string;
  coverage: string;
  notes?: string;
}

describe('admin-endpoint-coverage: every admin route is accounted for in the manifest', () => {
  let app: any;
  beforeAll(async () => {
    app = await createTestApp();
  });

  it('manifest exactly matches the live admin route surface (no un-accounted or stale routes)', () => {
    const live = adminRoutes(app);
    const liveEntries: ManifestEntry[] = live.map((r) => ({
      method: r.method,
      path: r.path,
      coverage: classifyRoute(r),
    }));

    const shouldWrite = !fs.existsSync(MANIFEST_PATH) || process.env.UPDATE_ENDPOINT_MANIFEST === '1';
    if (shouldWrite) {
      // Preserve human-set coverage/notes for routes that already exist.
      let prev: ManifestEntry[] = [];
      if (fs.existsSync(MANIFEST_PATH)) {
        prev = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).routes ?? [];
      }
      const prevByKey = new Map(prev.map((e) => [routeKey(e), e]));
      const merged = liveEntries.map((e) => {
        const old = prevByKey.get(routeKey(e));
        return old ? { ...e, coverage: old.coverage, ...(old.notes ? { notes: old.notes } : {}) } : e;
      });
      fs.writeFileSync(
        MANIFEST_PATH,
        JSON.stringify(
          { generated: 'run UPDATE_ENDPOINT_MANIFEST=1 to refresh', count: merged.length, routes: merged },
          null,
          2
        ) + '\n'
      );
      // eslint-disable-next-line no-console
      console.log(`[endpoint-coverage] wrote manifest with ${merged.length} admin routes. Review + commit.`);
      return;
    }

    const manifest: { routes: ManifestEntry[] } = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const liveKeys = new Set(live.map(routeKey));
    const manifestKeys = new Set(manifest.routes.map(routeKey));

    const added = [...liveKeys].filter((k) => !manifestKeys.has(k)).sort();
    const removed = [...manifestKeys].filter((k) => !liveKeys.has(k)).sort();
    const badTag = manifest.routes
      .filter((e) => !isValidCoverageTag(e.coverage))
      .map((e) => `${routeKey(e)} (coverage='${e.coverage}')`);

    const reviewCount = manifest.routes.filter((e) => e.coverage === 'review').length;
    // eslint-disable-next-line no-console
    console.log(
      `[endpoint-coverage] ${manifest.routes.length} routes manifested; ` +
        `${reviewCount} tagged 'review' (accounted-for but NOT sweep-covered — must map to a matrix invariant).`
    );

    const problems: string[] = [];
    if (added.length) {
      problems.push(
        `NEW un-accounted admin route(s) — classify them in tests/admin-endpoint-manifest.json ` +
          `(or run UPDATE_ENDPOINT_MANIFEST=1):\n  ${added.join('\n  ')}`
      );
    }
    if (removed.length) {
      problems.push(`STALE manifest entr(ies) (route removed) — drop them:\n  ${removed.join('\n  ')}`);
    }
    if (badTag.length) {
      problems.push(`Unknown coverage tag(s) (allowed: ${COVERAGE_TAGS.join(', ')}, matrix:INV-XXX):\n  ${badTag.join('\n  ')}`);
    }

    expect(problems.join('\n\n')).toBe('');
  });

  it('every sweep:<CLASS> tag used in the manifest resolves to a suite file that actually exists on disk', () => {
    // This does NOT depend on the live app / manifest-diff logic above — it is
    // a pure filesystem check, deliberately independent of `createTestApp()`,
    // so it stays meaningful even if the app fails to boot. It reads the
    // manifest that's committed on disk, not a live-derived one, since the
    // committed manifest is the artifact a stale claim would hide in.
    if (!fs.existsSync(MANIFEST_PATH)) {
      // Nothing to check yet — the other test in this file will bootstrap it.
      return;
    }
    const manifest: { routes: ManifestEntry[] } = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

    const usedClasses = new Set(
      manifest.routes
        .map((e) => e.coverage)
        .filter((c) => c.startsWith('sweep:'))
        .map((c) => c.slice('sweep:'.length))
    );

    const problems: string[] = [];
    for (const cls of usedClasses) {
      const suiteFile = SWEEP_SUITE_FILES[cls];
      if (!suiteFile) {
        problems.push(
          `sweep:${cls} is used in the manifest but has no entry in SWEEP_SUITE_FILES (tests/helpers/adminRoutes.ts) ` +
            `— either register the suite file that covers it, or re-tag the affected route(s).`
        );
        continue;
      }
      const suitePath = path.join(__dirname, suiteFile);
      if (!fs.existsSync(suitePath)) {
        problems.push(
          `sweep:${cls} names suite file '${suiteFile}' (resolved: ${suitePath}) which does NOT exist on disk. ` +
            `The suite was deleted (or renamed) but a coverage claim naming it was left standing in ` +
            `tests/admin-endpoint-manifest.json — re-tag the affected route(s) to an honest classification ` +
            `(e.g. 'review' or a real 'matrix:INV-XXX' row) instead of leaving a dangling sweep reference. ` +
            `(This is exactly the BC-QA-031 bug that BC-QA-031-FOLLOWUP-2 fixed by hand — this assertion exists ` +
            `so the next deletion fails the build instead of silently leaving dangling coverage claims again.)`
        );
      }
    }

    expect(problems.join('\n\n')).toBe('');
  });
});
