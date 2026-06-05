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
      if (s === 'ARCHIVED' || s === 'DELETED' || s === 'PENDING_VERIFICATION' || s === 'PENDING_PAYMENT') {
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
 * Write-permission key suffixes — any permission key that ends with one of
 * these fragments is considered a write operation. Used by the spec §1.5
 * admin read-only enforcement: Inactive admins (aro=true) are blocked from
 * write operations even when they hold the permission in their JWT.
 *
 * Keys that do NOT match are read-only (safe for Inactive admins).
 */
const WRITE_PERMISSION_SUFFIXES = ['.write', '.create', '.delete', '.update', '.actions'];

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
export const requireActiveAdmin = (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError('Not authenticated', 401));
  }
  if (req.user.aro === true) {
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

function isWritePermission(key: string): boolean {
  return WRITE_PERMISSION_SUFFIXES.some((suffix) => key.endsWith(suffix));
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
