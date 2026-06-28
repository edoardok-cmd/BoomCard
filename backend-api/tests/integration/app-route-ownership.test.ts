/**
 * App-wide route-ownership gate — the cross-scope completeness guarantee.
 *
 * Asserts EVERY route the app serves is claimed by exactly one audit scope in a
 * committed manifest, and that ZERO routes are `unowned`. A new route that no
 * scope owns fails the build — structurally preventing a whole surface from
 * going un-audited (the failure mode behind the run-8 false-clean and the 3
 * un-modeled admin surfaces).
 *
 * Bootstrap/refresh: missing manifest OR `UPDATE_ROUTE_OWNERSHIP=1` (re)writes
 * it from the live surface (auto-classified), preserving any human scope edits.
 * In CI (no flag) it is a pure gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createTestApp } from '../setup';
import { ownedRoutes, routeKey, SCOPES } from '../helpers/appScopes';

const MANIFEST = path.join(__dirname, '..', 'app-route-ownership-manifest.json');

interface Entry { method: string; path: string; scope: string }

describe('app-route-ownership: every API route is owned by exactly one audit scope', () => {
  let app: any;
  beforeAll(async () => { app = await createTestApp(); });

  it('manifest matches the live surface and has zero unowned routes', () => {
    const live = ownedRoutes(app);

    const shouldWrite = !fs.existsSync(MANIFEST) || process.env.UPDATE_ROUTE_OWNERSHIP === '1';
    if (shouldWrite) {
      let prev: Entry[] = [];
      if (fs.existsSync(MANIFEST)) prev = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).routes ?? [];
      const prevByKey = new Map(prev.map((e) => [routeKey(e), e]));
      const merged = live.map((e) => {
        const old = prevByKey.get(routeKey(e));
        // preserve a human scope override (but never let it re-introduce 'unowned')
        return old && old.scope !== 'unowned' ? { ...e, scope: old.scope } : e;
      });
      const byScope: Record<string, number> = {};
      for (const e of merged) byScope[e.scope] = (byScope[e.scope] ?? 0) + 1;
      fs.writeFileSync(MANIFEST, JSON.stringify({ generated: 'run UPDATE_ROUTE_OWNERSHIP=1 to refresh', total: merged.length, byScope, routes: merged }, null, 2) + '\n');
      // eslint-disable-next-line no-console
      console.log(`[route-ownership] wrote ${merged.length} routes:`, JSON.stringify(byScope));
      return;
    }

    const manifest: { routes: Entry[] } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const liveKeys = new Set(live.map(routeKey));
    const manKeys = new Set(manifest.routes.map(routeKey));
    const added = [...liveKeys].filter((k) => !manKeys.has(k)).sort();
    const removed = [...manKeys].filter((k) => !liveKeys.has(k)).sort();
    const badScope = manifest.routes.filter((e) => !(SCOPES as readonly string[]).includes(e.scope)).map((e) => `${routeKey(e)}=${e.scope}`);
    const unowned = manifest.routes.filter((e) => e.scope === 'unowned').map(routeKey);

    const byScope: Record<string, number> = {};
    for (const e of manifest.routes) byScope[e.scope] = (byScope[e.scope] ?? 0) + 1;
    // eslint-disable-next-line no-console
    console.log(`[route-ownership] ${manifest.routes.length} routes:`, JSON.stringify(byScope));

    const problems: string[] = [];
    if (added.length) problems.push(`NEW route(s) not in manifest — classify in app-route-ownership-manifest.json (or UPDATE_ROUTE_OWNERSHIP=1):\n  ${added.join('\n  ')}`);
    if (removed.length) problems.push(`STALE manifest entr(ies):\n  ${removed.join('\n  ')}`);
    if (badScope.length) problems.push(`Unknown scope(s) (allowed: ${SCOPES.join(', ')}):\n  ${badScope.join('\n  ')}`);
    if (unowned.length) problems.push(`UNOWNED route(s) — no audit scope will ever look at these; assign a scope:\n  ${unowned.join('\n  ')}`);

    expect(problems.join('\n\n')).toBe('');
  });
});
