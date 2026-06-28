/**
 * App-wide route → audit-scope ownership.
 *
 * Every route the app serves must be owned by exactly ONE audit scope. This is
 * the completeness guarantee across scopes: a route owned by nobody (`unowned`)
 * is a surface no re-audit will ever look at. Used by app-route-ownership.test.ts.
 *
 * Reuses the live-router walk from adminRoutes.ts so ownership is derived from
 * the running app, never hand-maintained.
 */
import { enumerateRoutes, routeKey } from './adminRoutes';

export const SCOPES = [
  'admin', // BC-ADMIN-SPEC-REAUDIT (complete)
  'partner', // BC-PARTNER-SPEC-REAUDIT
  'user', // BC-USER-SPEC-REAUDIT
  'system', // BC-SYSTEM-SPEC-REAUDIT (webhooks/email/integrations/health)
  'public', // BC-PUBLIC-SPEC-REAUDIT (plans/contact/sidebar/mobile)
  'redemption', // BC-REDEMPTION-SPEC-REAUDIT (stickers/venues/bookings/messaging/dashboard)
  'unowned', // NOT claimed by any scope — must be 0
] as const;
export type Scope = (typeof SCOPES)[number];

export interface OwnedRoute {
  method: string;
  path: string;
  scope: Scope;
}

// Ordered rules: first match wins. Mount-prefix based, with /api/auth split by
// keyword because that router is shared across admin/partner/user.
const RULES: Array<[RegExp, Scope]> = [
  [/^\/api\/admin\//, 'admin'],
  [/^\/api\/partners(\/|$)|^\/api\/partner\//, 'partner'],
  [/^\/api\/(webhooks|email|integrations|health)(\/|$)/, 'system'],
  [/^\/api\/(plans|contact|sidebar|config\/mobile|mobile)(\/|$)/, 'public'],
  [/^\/api\/(stickers|venues|bookings|messaging|dashboard)(\/|$)/, 'redemption'],
  [
    /^\/api\/(subscriptions|wallet|offers|receipts|favorites|cards|checkout|pending-checkout|payments|notifications|help|loyalty|reviews|unsubscribe)(\/|$)/,
    'user',
  ],
];

export function classifyScope(method: string, path: string): Scope {
  for (const [re, scope] of RULES) if (re.test(path)) return scope;
  if (path.startsWith('/api/auth')) {
    const p = path.toLowerCase();
    if (/impersonat|critical|admin/.test(p)) return 'admin';
    if (/partner|activation/.test(p)) return 'partner';
    return 'user'; // register/login/verify/refresh/password/2fa default to the subscriber scope
  }
  return 'unowned';
}

/** All app routes with their owning scope, de-duplicated and sorted. */
export function ownedRoutes(app: any): OwnedRoute[] {
  const seen = new Set<string>();
  const out: OwnedRoute[] = [];
  for (const r of enumerateRoutes(app)) {
    if (!r.path.startsWith('/api/')) continue; // ignore non-API mounts
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ method: r.method, path: r.path, scope: classifyScope(r.method, r.path) });
  }
  out.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
  return out;
}

export { routeKey };
