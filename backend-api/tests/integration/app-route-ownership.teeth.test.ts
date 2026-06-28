/**
 * Teeth-proof for app-route-ownership.test.ts
 *
 * Forces one route to `unowned` in the in-memory manifest, asserts the
 * ownership gate goes RED; restores the correct scope, asserts GREEN.
 *
 * Also directly tests classifyScope() to confirm routes outside the
 * registered scope rules are classified 'unowned', and that known admin
 * paths are correctly claimed. Does NOT modify any src/** file or the
 * committed manifest on disk.
 */

import { classifyScope, SCOPES, ownedRoutes } from '../helpers/appScopes';

// ── Validate-manifest logic: replicated from app-route-ownership.test.ts ─────

interface ManifestEntry {
  method: string;
  path: string;
  scope: string;
}

function validateManifest(
  manifestRoutes: ManifestEntry[],
  liveRoutes: ManifestEntry[],
): string[] {
  const liveKeys = new Set(liveRoutes.map((e) => `${e.method} ${e.path}`));
  const manKeys = new Set(manifestRoutes.map((e) => `${e.method} ${e.path}`));

  const added = [...liveKeys].filter((k) => !manKeys.has(k)).sort();
  const removed = [...manKeys].filter((k) => !liveKeys.has(k)).sort();
  const badScope = manifestRoutes
    .filter((e) => !(SCOPES as readonly string[]).includes(e.scope))
    .map((e) => `${e.method} ${e.path}=${e.scope}`);
  const unowned = manifestRoutes
    .filter((e) => e.scope === 'unowned')
    .map((e) => `${e.method} ${e.path}`);

  const problems: string[] = [];
  if (added.length) problems.push(`NEW routes not in manifest: ${added.join(', ')}`);
  if (removed.length) problems.push(`STALE manifest entries: ${removed.join(', ')}`);
  if (badScope.length) problems.push(`Unknown scopes: ${badScope.join(', ')}`);
  if (unowned.length) problems.push(`UNOWNED routes: ${unowned.join(', ')}`);
  return problems;
}

// ── classifyScope unit assertions ─────────────────────────────────────────────

describe('app-route-ownership teeth-proof: classifyScope correctly gates unowned routes', () => {
  it('RED: classifyScope returns "unowned" for a path outside all registered scope rules', () => {
    // A hypothetical route not matching any RULES — it would be unowned in the manifest.
    const scope = classifyScope('GET', '/api/some-new-surface/data');
    // If this assertion fails, the classifier is not catching unclassified routes.
    expect(scope).toBe('unowned');
  });

  it('GREEN: classifyScope correctly claims /api/admin/* routes as "admin"', () => {
    expect(classifyScope('GET', '/api/admin/subscribers')).toBe('admin');
    expect(classifyScope('POST', '/api/admin/partners')).toBe('admin');
    expect(classifyScope('DELETE', '/api/admin/users/abc')).toBe('admin');
  });

  it('GREEN: classifyScope correctly claims known non-admin routes', () => {
    expect(classifyScope('GET', '/api/partners/dashboard')).toBe('partner');
    expect(classifyScope('GET', '/api/subscriptions/current')).toBe('user');
    expect(classifyScope('GET', '/api/health')).toBe('system');
    expect(classifyScope('GET', '/api/plans')).toBe('public');
    expect(classifyScope('GET', '/api/stickers/scan')).toBe('redemption');
  });
});

// ── Manifest-validation gate assertions ───────────────────────────────────────

describe('app-route-ownership teeth-proof: gate rejects unowned manifest entry', () => {
  const BASE_ROUTES: ManifestEntry[] = [
    { method: 'GET', path: '/api/admin/subscribers', scope: 'admin' },
    { method: 'GET', path: '/api/partners/dashboard', scope: 'partner' },
    { method: 'GET', path: '/api/health', scope: 'system' },
  ];

  it('RED: validateManifest returns problems when a route has scope "unowned"', () => {
    // Force one entry to 'unowned' — simulates a new route that wasn't classified.
    const manifestWithUnowned: ManifestEntry[] = [
      { method: 'GET', path: '/api/admin/subscribers', scope: 'admin' },
      { method: 'GET', path: '/api/partners/dashboard', scope: 'unowned' }, // ← FORCED BROKEN
      { method: 'GET', path: '/api/health', scope: 'system' },
    ];
    const problems = validateManifest(manifestWithUnowned, BASE_ROUTES);
    // Must find the unowned problem — if empty the gate is blind.
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes('UNOWNED'))).toBe(true);
  });

  it('GREEN: validateManifest returns no problems when all routes are owned', () => {
    const problems = validateManifest(BASE_ROUTES, BASE_ROUTES);
    expect(problems).toEqual([]);
  });

  it('RED: validateManifest returns problems when a route uses an unknown scope string', () => {
    const manifestWithBadScope: ManifestEntry[] = [
      { method: 'GET', path: '/api/admin/subscribers', scope: 'admin' },
      { method: 'GET', path: '/api/partners/dashboard', scope: 'partner' },
      { method: 'GET', path: '/api/health', scope: 'unknown-scope' }, // ← invalid
    ];
    const problems = validateManifest(manifestWithBadScope, BASE_ROUTES);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes('Unknown scope'))).toBe(true);
  });
});
