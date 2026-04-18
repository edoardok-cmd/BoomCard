import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './error.middleware';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    // Sibling-account IDs this session can switch between without re-auth.
    // Populated from the `ag` claim on the access token; only present when
    // the login matched more than one account (see AuthService.login).
    ag?: string[];
    // Client surface the token was minted for. Populated from the `ct`
    // claim; absent on tokens issued before the claim was added, in which
    // case callers should fall back to Origin/Referer inference.
    ct?: 'mobile' | 'web';
    // Standard JWT `iat` (seconds since epoch). Needed by /switch-account
    // to compare against target.passwordChangedAt and refuse pivots from
    // tokens issued before the target rotated their credentials.
    iat?: number;
    // Impersonation claims — present only when this session was minted by
    // POST /auth/impersonate. `imp` marks the session as an impersonation,
    // `impBy` is the admin userId who initiated it. /auth/stop-impersonate
    // uses `impBy` to restore the admin's own session.
    imp?: true;
    impBy?: string;
    impByRole?: string;
    impAg?: string[];
  };
  file?: any; // Multer file upload
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;

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
