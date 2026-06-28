/**
 * Shared admin-route introspection for the coverage manifest + sweeps.
 *
 * Walks the live Express router stack so the set of admin endpoints is derived
 * from the running app, never hand-maintained. Used by:
 *   - admin-endpoint-coverage.test.ts (the coverage-manifest gate)
 *   - (can be adopted by admin-currency-leak-sweep / admin-uuid-500-sweep)
 *
 * The walk logic is copied verbatim from admin-currency-leak-sweep.test.ts so
 * the two stay consistent.
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

export const COVERAGE_TAGS = ['sweep:CUR', 'sweep:INPUT', 'review'] as const;
export type CoverageTag = (typeof COVERAGE_TAGS)[number];

/**
 * Valid coverage classifications for a manifest entry:
 *   - `sweep:CUR` / `sweep:INPUT` — covered by an exhaustive class sweep
 *   - `matrix:INV-XXX[,INV-YYY]` — covered by named invariant-matrix row(s),
 *     checked by re-audit (use when no sweep covers the route's risk)
 *   - `review` — accounted-for but NOT yet mapped to a sweep OR an invariant
 *     (a known breadth gap; the manifest reports how many remain)
 */
export function isValidCoverageTag(tag: string): boolean {
  if ((COVERAGE_TAGS as readonly string[]).includes(tag)) return true;
  // Invariant IDs may carry a multi-segment class name (e.g. INV-SM-CASH-002,
  // INV-SM-DISP-004) in addition to the single-segment families (INV-CUR-026).
  return /^matrix:INV-[A-Z]+(-[A-Z]+)*-\d+(\s*,\s*INV-[A-Z]+(-[A-Z]+)*-\d+)*$/i.test(tag);
}

const MONEY_ROUTER =
  /^\/api\/admin\/(transactions|payouts|finance|cashback|subscribers|subscriptions|dashboard|wallet)\b/;

/**
 * Default coverage classification for a route, used to bootstrap the manifest:
 *   - a money-returning GET → covered by admin-currency-leak-sweep (CUR)
 *   - any `:param` route   → covered by admin-uuid-500-sweep (INPUT)
 *   - everything else (e.g. non-money list GETs, POST bodies) → `review`:
 *     NOT covered by an exhaustive sweep, so it must map to an invariant-matrix
 *     row and be checked by a re-audit. (This is exactly the class the
 *     subscriber null-wallet 500 lived in — a list GET no sweep gated.)
 */
export function classifyRoute(r: EnumeratedRoute): CoverageTag {
  if (r.method === 'GET' && MONEY_ROUTER.test(r.path)) return 'sweep:CUR';
  if (r.path.includes(':')) return 'sweep:INPUT';
  return 'review';
}

export function routeKey(r: { method: string; path: string }): string {
  return `${r.method} ${r.path}`;
}
