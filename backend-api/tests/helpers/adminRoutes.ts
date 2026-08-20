/**
 * Shared admin-route introspection for the coverage manifest + sweeps.
 *
 * Walks the live Express router stack so the set of admin endpoints is derived
 * from the running app, never hand-maintained. Used by:
 *   - admin-endpoint-coverage.test.ts (the coverage-manifest gate)
 *   - admin-uuid-500-sweep.test.ts
 *
 * The walk logic originated in the admin-currency-leak-sweep suite, which was
 * deleted in BC-QA-031 along with the dual-currency display feature it policed;
 * this helper is now the single source of that logic.
 */

export interface EnumeratedRoute {
  method: string; // upper-case HTTP verb
  path: string; // full path with mount prefixes, e.g. /api/admin/payouts/:id/approve
}

function layerRegexToPrefix(layer: any): string {
  if (typeof layer.path === 'string') return layer.path;
  const keys: any[] = layer.keys || [];
  const src: string = layer.regexp?.source ?? '';
  if (layer.regexp?.fast_slash) return '';
  let working = src
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\$$/, '')
    .replace(/\\\//g, '/');
  let keyIdx = 0;
  working = working.replace(/\(\[\^\\?\/]\+\?\)/g, () => {
    const k = keys[keyIdx++];
    return k ? `:${k.name}` : ':param';
  });
  working = working.replace(/\/\?$/, '').replace(/\(\?:\(\?=\/\|\$\)\)$/, '');
  return working;
}

function collectRoutes(stack: any[], prefix: string, out: EnumeratedRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const routePath: string = layer.route.path;
      const methods = layer.route.methods || {};
      for (const m of Object.keys(methods)) {
        if (m === '_all') continue;
        out.push({ method: m.toUpperCase(), path: prefix + routePath });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const sub = layerRegexToPrefix(layer);
      collectRoutes(layer.handle.stack, prefix + sub, out);
    }
  }
}

export function enumerateRoutes(app: any): EnumeratedRoute[] {
  const stack = app._router?.stack || app.router?.stack || [];
  const out: EnumeratedRoute[] = [];
  collectRoutes(stack, '', out);
  return out;
}

/** All admin routes (under /api/admin), de-duplicated and sorted. */
export function adminRoutes(app: any): EnumeratedRoute[] {
  const seen = new Set<string>();
  const out: EnumeratedRoute[] = [];
  for (const r of enumerateRoutes(app)) {
    if (!r.path.startsWith('/api/admin')) continue;
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
  return out;
}

/**
 * Sweep classes that are valid `sweep:<CLASS>` coverage tags, mapped to the
 * suite file (relative to `tests/integration/`) that actually implements the
 * sweep. `admin-endpoint-coverage.test.ts` asserts every mapped file exists on
 * disk — this is the check that stops a deleted suite from silently leaving a
 * dangling coverage claim behind (BC-QA-031 deleted
 * `admin-currency-leak-sweep.test.ts` but left 37 `sweep:CUR`/`matrix:INV-CUR-*`
 * claims standing until BC-QA-031-FOLLOWUP-2 caught and fixed it). Adding a
 * new sweep class means adding it here AND writing the suite file — the two
 * cannot drift apart without the coverage test failing.
 */
export const SWEEP_SUITE_FILES: Record<string, string> = {
  INPUT: 'admin-uuid-500-sweep.test.ts',
};

export const COVERAGE_TAGS = ['sweep:INPUT', 'review'] as const;
export type CoverageTag = (typeof COVERAGE_TAGS)[number];

/**
 * Valid coverage classifications for a manifest entry:
 *   - `sweep:INPUT` — covered by an exhaustive class sweep (see
 *     `SWEEP_SUITE_FILES` for the suite each `sweep:<CLASS>` name resolves to)
 *   - `matrix:INV-XXX[,INV-YYY]` — covered by named invariant-matrix row(s),
 *     checked by re-audit (use when no sweep covers the route's risk)
 *   - `review` — accounted-for but NOT yet mapped to a sweep OR an invariant
 *     (a known breadth gap; the manifest reports how many remain)
 */
export function isValidCoverageTag(tag: string): boolean {
  if ((COVERAGE_TAGS as readonly string[]).includes(tag)) return true;
  // Invariant IDs may carry a multi-segment class name (e.g. INV-SM-CASH-002,
  // INV-SM-DISP-004) in addition to the single-segment families (INV-FIN-010).
  return /^matrix:INV-[A-Z]+(-[A-Z]+)*-\d+(\s*,\s*INV-[A-Z]+(-[A-Z]+)*-\d+)*$/i.test(tag);
}

/**
 * Default coverage classification for a route, used to bootstrap the manifest:
 *   - any `:param` route → covered by admin-uuid-500-sweep (INPUT)
 *   - everything else (money-returning GETs included) → `review`:
 *     NOT covered by an exhaustive sweep, so it must map to an invariant-matrix
 *     row and be checked by a re-audit. (This is exactly the class the
 *     subscriber null-wallet 500 lived in — a list GET no sweep gated.)
 *
 * There used to be a third branch here minting `sweep:CUR` for every
 * money-returning admin GET, naming `admin-currency-leak-sweep.test.ts`. That
 * suite was deleted in BC-QA-031 along with the dual-currency display feature
 * it policed, which left the tag dangling for new routes too — every route
 * added after BC-QA-031 and before BC-QA-031-FOLLOWUP-2 would have kept
 * acquiring a coverage claim from a suite that no longer existed. The branch is
 * removed rather than replaced: there is no successor sweep, so a fresh
 * money-returning GET now falls through to `review` like any other route with
 * no exhaustive-sweep coverage, and picks up real coverage only when a human
 * maps it to a `matrix:INV-XXX` row. The 33 pre-existing routes that carried
 * `sweep:CUR` (plus the 2 that carried a lone now-removed `matrix:INV-CUR-*`
 * reference) were re-tagged in `tests/admin-endpoint-manifest.json` and given
 * real, untested `INV-CURGAP-*` rows in `docs/specs/admin-invariant-matrix.md`
 * as part of BC-QA-031-FOLLOWUP-2.
 */
export function classifyRoute(r: EnumeratedRoute): CoverageTag {
  if (r.path.includes(':')) return 'sweep:INPUT';
  return 'review';
}

export function routeKey(r: { method: string; path: string }): string {
  return `${r.method} ${r.path}`;
}
