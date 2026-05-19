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
      const freshUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { rolesUpdatedAt: true },
      });
      if (
        freshUser?.rolesUpdatedAt &&
        freshUser.rolesUpdatedAt.getTime() > (decoded.iat as number) * 1000
      ) {
        return next(new AppError('Permissions updated — please re-login', 401));
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

// Fine-grained permission guard. Falls back to allowing SUPER_ADMIN unconditionally
// so existing admin routes continue to work before permissions are fully seeded.
// Accepts a single key or an array of keys (OR logic — user needs any one of them).
export const requirePermission = (key: string | string[]) => {
  const keys = Array.isArray(key) ? key : [key];
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
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
