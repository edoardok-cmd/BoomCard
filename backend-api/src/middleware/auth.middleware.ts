import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';
import { touchUserActivity } from '../services/userActivity.service';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    // Effective permission keys for this session (loaded from DB on login,
    // carried as a plain array in the JWT to avoid extra DB hits per request).
    permissions?: string[];
    // Sibling-account IDs this session can switch between without re-auth.
    ag?: string[];
    // Client surface the token was minted for.
    ct?: 'mobile' | 'web';
    // Standard JWT iat — used by /switch-account to refuse stale pivots.
    iat?: number;
    // Impersonation claims.
    imp?: true;
    impBy?: string;
    impByRole?: string;
    impAg?: string[];
    // Spec §1.5: admin read-only flag. True when admin account status is INACTIVE.
    // Inactive admins can log in but cannot approve, reassign, or modify records.
    aro?: true;
  };
  file?: any; // Multer file upload
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;

    // For ADMIN and SUPER_ADMIN users: if their roles were updated after this JWT was
    // issued, the embedded permissions (or role itself) are stale — reject with 401 so
    // the client is forced to re-login and get a fresh token.
    // SUPER_ADMIN is included because a downgrade (SUPER_ADMIN → ADMIN via role revoke)
    // stamps rolesUpdatedAt on the User row while the JWT still carries role='SUPER_ADMIN',
    // bypassing both authorize() and requirePermission() on every subsequent request until
    // natural expiry.
    if ((decoded?.role === 'ADMIN' || decoded?.role === 'SUPER_ADMIN') && decoded?.id) {
      const now = new Date();
      const freshUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          status: true,
          rolesUpdatedAt: true,
          // Check for any role assignment that has since expired.  take:1 keeps cost
          // low — we only need to know if at least one expired row exists.
          adminRoles: {
            where: { expiresAt: { lte: now } },
            select: { expiresAt: true },
            take: 1,
          },
        },
      });

      // M2 — defense-in-depth live admin status re-check (mirrors the USER/PARTNER
      // branch below). Archived/Suspended-stamping rolesUpdatedAt is the primary
      // live-token invalidation path, but if an admin row is moved to a no-login
      // status without that stamp, the embedded JWT would otherwise coast to natural
      // expiry. Per spec §1.5, Archived and Suspended admins have NO login access;
      // Inactive admins MAY still log in (read-only, enforced via the aro flag), so
      // INACTIVE is intentionally NOT rejected here.
      const as = freshUser?.status as string | undefined;
      if (as === 'ARCHIVED' || as === 'SUSPENDED' || as === 'DELETED') {
        return res.status(401).json({ error: 'Account not accessible.' });
      }

      // M4 (spec §1.5, line 177) — re-derive the admin read-only flag from the
      // LIVE account status on every request, not just at login. The `aro` claim
      // is stamped into the JWT at login (auth.service), but a mid-session
      // ACTIVE → INACTIVE downgrade does NOT stamp rolesUpdatedAt (Inactive admins
      // "coast to natural expiry" in read-only mode per §1.5), so without this the
      // live token would retain full write access until expiry. Forcing aro=true
      // here whenever the live status is INACTIVE closes that window; the
      // requirePermission / requireActiveAdmin guards then block all writes.
      // (Conversely, if an Inactive admin is reactivated to ACTIVE mid-session we
      // clear the stale aro claim so they regain write access without re-login.)
      if (as === 'INACTIVE') {
        req.user.aro = true;
      } else if (req.user.aro) {
        delete req.user.aro;
      }

      if (
        freshUser?.rolesUpdatedAt &&
        freshUser.rolesUpdatedAt.getTime() > (decoded.iat as number) * 1000
      ) {
        return next(new AppError('Permissions updated — please re-login', 401));
      }

      // If a time-bounded role assignment has expired, stamp rolesUpdatedAt so that
      // this cheaper check catches all subsequent requests without re-joining to adminRoles.
      // The expired UserAdminRole row is retained for audit; resolveUserPermissions
      // (called on the next successful login) excludes it from the new JWT.
      if (freshUser?.adminRoles && freshUser.adminRoles.length > 0) {
        await prisma.user.update({ where: { id: decoded.id }, data: { rolesUpdatedAt: now } });
        return next(new AppError('Role assignment expired — please re-login', 401));
      }
    }

    if (decoded?.role === 'USER' || decoded?.role === 'PARTNER') {
      const freshUser = await prisma.user.findUnique({
        where: { id: decoded.userId ?? decoded.id },
        select: { status: true },
      }).catch(() => null);
      const s = freshUser?.status as string | undefined;
      // M1 — SUSPENDED must reject here too. The admin branch (above), login
      // (auth.service.ts) and refresh-rotation all block SUSPENDED; without it
      // here a USER auto-suspended by the password-reset abuse lockout
      // (forgotPassword sets status=SUSPENDED) would keep an existing access
      // token valid until natural expiry, defeating the lockout.
      if (s === 'SUSPENDED' || s === 'ARCHIVED' || s === 'DELETED' || s === 'PENDING_VERIFICATION' || s === 'PENDING_PAYMENT') {
        return res.status(401).json({ error: 'Account not accessible.' });
      }
    }

    // Spec §1.2 / §5.1 / §11.2: Archived partner — no login, no operational
    // access. partner.service.setPartnerStatus() updates Partner.status but NOT
    // User.status, so the User.status check above is insufficient for the PARTNER
    // role. Query Partner.status independently to close the gap.
    if (decoded?.role === 'PARTNER' && decoded?.id) {
      const partner = await prisma.partner.findUnique({
        where: { userId: decoded.id },
        select: { status: true },
      }).catch(() => null);
      const ps = partner?.status as string | undefined;
      if (ps === 'ARCHIVED' || ps === 'REJECTED') {
        return res.status(401).json({ error: 'Account not accessible.' });
      }
    }

    if (decoded?.id && decoded?.role) {
      touchUserActivity(decoded.id, decoded.role);
    }

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

export const optionalAuthenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      req.user = decoded;
      if (decoded?.id && decoded?.role) {
        touchUserActivity(decoded.id, decoded.role);
      }
    }
  } catch (error) {
    // Token invalid or expired - continue as guest
  }
  next();
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('Not authorized', 403));
    }

    next();
  };
};

/**
 * L2 — Permission read/write classification for the spec §1.5 admin read-only gate
 * (Inactive admins, aro=true, may only perform read operations).
 *
 * The previous implementation classified by WRITE suffix and treated everything
 * else as read — a fragile default. In particular `.actions` was listed as a write
 * suffix, but the only `.actions`-family permission is `admins.actions.read` (a READ
 * capability: "view pending critical-action requests"). A future `*.actions` write
 * key OR a `*.actions.read` key mis-parsed by an `endsWith('.actions')` rule could
 * silently regress an Inactive admin's read access (or, worse, leak a write).
 *
 * This explicit classifier inverts the default to FAIL-CLOSED: a permission counts as
 * READ-only for the aro gate ONLY when it ends in an explicit read marker; everything
 * else is treated as a write (blocked for Inactive admins). New write keys are
 * therefore blocked automatically without needing to be enumerated, while read keys
 * are recognised by their explicit `.read` (or `.read.*`) marker.
 */
const READ_PERMISSION_MARKERS = ['.read'];

/** True when the key is an explicit READ permission (safe for Inactive admins). */
function isReadPermission(key: string): boolean {
  // `.read` anywhere as a terminal segment: `x.read`, `x.read.all`, `admins.actions.read`.
  return READ_PERMISSION_MARKERS.some(
    (marker) => key.endsWith(marker) || key.includes(`${marker}.`),
  );
}

/**
 * B3 fix — block Inactive admins (aro=true) from write routes that bypass
 * requirePermission() by using authorize() directly (e.g. SUPER_ADMIN-only
 * routes that do not go through the permissions table).
 *
 * Use this middleware on any write route that uses only authenticate +
 * authorize() without requirePermission(), so that the aro=true gate still
 * fires even when no permission key is involved.
 *
 * adminProfile routes (self-service: PATCH /me, POST /me/password, etc.) are
 * intentionally excluded from this guard — they operate only on the actor's
 * own account and do not mutate shared platform records. Spec §1.5 restricts
 * "approve, reassign, or modify records" of other entities, not self-service.
 */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireActiveAdmin = (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Not authenticated', 401));
  }
  // L7 — robust read-only gate: block by HTTP method. Any non-read method
  // (POST/PUT/PATCH/DELETE) is a mutation and must be blocked for an Inactive
  // admin, regardless of whether a permission key suffix happens to match.
  // This covers future write routes whose permission keys do not end in a
  // recognised write suffix, and SA-only routes that use authorize() without
  // requirePermission(). GET/HEAD/OPTIONS pass through so read-only access works.
  if (req.user.aro === true && !READ_ONLY_METHODS.has(req.method)) {
    return next(
      new AppError(
        'Your admin account is inactive. Operational rights are limited to read-only access. ' +
        'Contact a Super Admin to restore full access.',
        403,
      ),
    );
  }
  next();
};

/**
 * L2: a permission is a WRITE op (blocked for Inactive admins) unless it is an
 * explicit read permission. Fail-closed: unknown / future keys default to write.
 */
function isWritePermission(key: string): boolean {
  return !isReadPermission(key);
}

// Fine-grained permission guard. Falls back to allowing SUPER_ADMIN unconditionally
// so existing admin routes continue to work before permissions are fully seeded.
// Accepts a single key or an array of keys (OR logic — user needs any one of them).
export const requirePermission = (key: string | string[]) => {
  const keys = Array.isArray(key) ? key : [key];
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    // Spec §1.5: Inactive admin (aro=true) — login allowed, read-only.
    // Block any write operation; pass read-only operations through.
    if (req.user.aro === true) {
      const requestsWrite = keys.some((k) => isWritePermission(k));
      if (requestsWrite) {
        return next(
          new AppError(
            'Your admin account is inactive. Operational rights are limited to read-only access. ' +
            'Contact a Super Admin to restore full access.',
            403,
          ),
        );
      }
      // Read-only permission requested — allow through for Inactive admin.
      return next();
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const hasAny = keys.some((k) => req.user!.permissions?.includes(k));
    if (!hasAny) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

/**
 * F-005 (BC-USER-SPEC-GAP-001 / BC-USER-SPEC-FIX-005-CODE) — enforce the spec §2
 * registration sequence at the access-control layer.
 *
 * Spec §2 mandates the order: Account Creation → Plan Selection → Payment
 * (subscription becomes Active on successful charge) → full operational access.
 * Spec §2 note (line 95) further requires "no profile created before successful
 * payment" to be respected at the implementation level, i.e. a freshly-registered,
 * unpaid USER must NOT have operational/write access before a subscription is Active.
 *
 * Rather than change the JWT *shape* (which would break the deployed Expo mobile
 * client — boomcard-mobile — and every issued token), this is a reusable
 * server-side gate. Mount it on USER-facing operational/write endpoints (scan,
 * receipt upload, wallet writes). It leaves onboarding/payment endpoints
 * (register, complete-profile, subscription plan-selection + checkout) reachable
 * so the existing account-creation → plan → payment flow still works end to end.
 *
 * Enforcement (USER role only — ADMIN/PARTNER pass through untouched):
 *   - ACTIVE / TRIALING subscription                    → allow.
 *   - CANCELLED but still within the paid period        → allow (spec §3.2/§8.3
 *                                                          earned-rights window).
 *   - No subscription, or Expired / Failed-Payment /    → block with a typed
 *     Cancelled-post-period                                402 SUBSCRIPTION_REQUIRED
 *                                                          (NOT a generic 500),
 *                                                          directing the user to
 *                                                          complete plan selection
 *                                                          and payment.
 *
 * NOTE: the auth middleware above already 401s PENDING_VERIFICATION / PENDING_PAYMENT
 * users (their register-issued token is inert until complete-profile flips them to
 * ACTIVE). This gate closes the remaining §2 gap generally: a logged-in USER whose
 * status is ACTIVE but who has no Active subscription (e.g. lapsed/expired) still
 * cannot reach operational/write endpoints, and receives an actionable,
 * payment-directing error instead of a deep service-layer throw or a 500.
 */
export const requireActiveSubscription = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return next(new AppError('Not authenticated', 401));
  }

  // Only USER accounts are subscription-gated. Admin/partner operational access is
  // governed by their own role/status rules (spec §1.5 / §5.3), not by a customer
  // subscription, so they pass through here.
  if (req.user.role !== 'USER') {
    return next();
  }

  try {
    const now = new Date();
    // NOTE: PAUSED is intentionally treated as NON-operational here, matching
    // sticker.service.assertSubscriptionAllowsScanning. (PAUSED still earns a cashback
    // tier elsewhere, but cannot open a session/scan.) Keep these two gates aligned —
    // if product decides PAUSED retains grace-window access, add PAUSED to BOTH.
    const eligible = await prisma.subscription.findFirst({
      where: {
        userId: req.user.id,
        OR: [
          // Active or trialing — full operational access (spec §2 post-payment state).
          { status: { in: ['ACTIVE', 'TRIALING'] } },
          // Cancelled within the still-paid period — access continues through the
          // last paid day (spec §3.2 "Cancelled within paid period", §8.3).
          { status: 'CANCELLED', currentPeriodEnd: { gt: now } },
        ],
      },
      select: { id: true },
    });

    if (!eligible) {
      return next(
        new AppError(
          'SUBSCRIPTION_REQUIRED: За да използвате тази функция, изберете план и завършете плащането от менюто „Абонамент и плащания". ' +
          '(Select a subscription plan and complete payment to use this feature.)',
          402,
          { code: 'SUBSCRIPTION_REQUIRED' },
        ),
      );
    }

    return next();
  } catch (err) {
    // A DB error here must not silently fall open (that would re-open the §2 gap)
    // nor surface a raw 500. Map to a typed, retryable error.
    return next(
      new AppError(
        'Could not verify your subscription status. Please try again.',
        503,
        { code: 'SUBSCRIPTION_CHECK_FAILED' },
      ),
    );
  }
};
