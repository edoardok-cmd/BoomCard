import type { User } from '../../contexts/AuthContext';

/**
 * Single source of truth for the admin "gated" state.
 *
 * An admin account is gated when it has not yet satisfied a mandatory
 * security step before it may use the rest of the panel:
 *   - mustChangePassword: a temporary password is still active
 *   - setup2FA: TOTP 2FA has not been configured (PROD only — the route
 *     guard's 2FA redirect is itself PROD-gated, so the nav lock must match)
 *
 * ProtectedRoute (the route guard) and CategoryShell (the sidebar nav) BOTH
 * derive their behaviour from this one function so the redirect and the lock
 * styling can never disagree. If the gating rule ever changes, it changes here
 * once.
 */
export type AdminGateReason = 'mustChangePassword' | 'setup2FA';

/**
 * Returns the reason an admin is gated, or null when the admin is free to
 * navigate. mustChangePassword takes precedence over setup2FA (it is the more
 * urgent / first step), mirroring the order the route guard checks them in.
 *
 * Non-admin users are never gated.
 */
export function getAdminGateReason(user: User | null | undefined): AdminGateReason | null {
  if (!user || user.role !== 'admin') return null;
  if (user.mustChangePassword) return 'mustChangePassword';
  // The 2FA redirect in ProtectedRoute is gated behind import.meta.env.PROD,
  // so the nav lock must apply under the exact same condition — otherwise dev
  // would show locks that the guard never enforces, and prod could show an
  // unlocked nav that the guard silently bounces.
  if (user.twoFactorEnabled === false && import.meta.env.PROD) return 'setup2FA';
  return null;
}

/** Convenience boolean wrapper around getAdminGateReason. */
export function isAdminGated(user: User | null | undefined): boolean {
  return getAdminGateReason(user) !== null;
}

/**
 * Routes that remain reachable even while gated, so the admin can actually
 * complete the required step (or sign out). Matches the `bypass` set in
 * ProtectedRoute. A nav target is locked only when it is NOT one of these.
 */
export function isGateBypassPath(path: string): boolean {
  return (
    path.startsWith('/admin/profile/security') ||
    path.startsWith('/admin/profile/logout')
  );
}

/**
 * Custom DOM event the security page listens for to scroll its guidance banner
 * into view and pulse it. Dispatched when a gated admin who is ALREADY on the
 * security page clicks a locked nav item (where a route change would be a
 * no-op, so there is no navigation/state to drive the highlight).
 */
export const ADMIN_GATE_HIGHLIGHT_EVENT = 'admin-gate-banner-highlight';

export interface AdminGateHighlightDetail {
  reason: AdminGateReason;
}

/**
 * Whether a given nav target should render locked for a gated admin.
 * The Профил category (path /admin/profile) stays reachable because it leads
 * to the security page where setup is completed.
 */
export function isNavTargetLocked(user: User | null | undefined, targetPath: string): boolean {
  if (!isAdminGated(user)) return false;
  // Профил must stay open: it is the route that contains Security + Logout.
  if (targetPath.startsWith('/admin/profile')) return false;
  if (isGateBypassPath(targetPath)) return false;
  return true;
}
