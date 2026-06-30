/**
 * Enhanced Security Middleware
 *
 * Comprehensive security middleware for production environment
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

// Inline rate limit values to avoid circular dependency with security.config.ts
const UPLOAD_RATE_LIMIT = { WINDOW_MS: 60000, MAX: 5 };
const PAYMENT_RATE_LIMIT = { WINDOW_MS: 900000, MAX: 10 };

/**
 * Enhanced Helmet Configuration for Production
 * Provides strict security headers
 */
export const productionHelmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // NOTE: Remove 'unsafe-inline' — use nonces or 'strict-dynamic' for any inline scripts.
        // Swagger UI requires inline scripts; serve docs behind a separate route without CSP
        // or add a nonce via middleware if you re-enable Swagger in production.
        'https://js.stripe.com',
        'https://maps.googleapis.com',
      ],
      styleSrc: [
        "'self'",
        // 'unsafe-inline' retained for styled-components runtime CSS injection.
        // Migrate to babel-plugin-styled-components with SSR to eliminate this.
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https:',
        'https://*.cloudflare.com',
        'https://*.amazonaws.com', // S3 images
      ],
      connectSrc: [
        "'self'",
        'https://api.stripe.com',
        ...(process.env.CORS_ORIGIN
          ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
          : []),
      ],
      frameSrc: [
        "'self'",
        'https://js.stripe.com',
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },

  // X-DNS-Prefetch-Control: controls browser DNS prefetching
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Frame-Options: prevents clickjacking
  frameguard: {
    action: 'deny',
  },

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // X-Content-Type-Options: prevents MIME sniffing
  noSniff: true,

  // X-XSS-Protection (legacy, but still useful)
  xssFilter: true,
});

/**
 * Development Helmet Configuration
 * More relaxed settings for development
 */
export const developmentHelmetConfig = helmet({
  contentSecurityPolicy: false, // Disable CSP in dev for easier testing
  hsts: false, // No HSTS in dev
});

/**
 * Auth Endpoints Rate Limiter
 * More restrictive for login/register endpoints
 * Keyed by IP (email-based brute-force protection is handled in AuthService via OTP lockout)
 */
export const authRateLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5'), // 5 attempts
  keyGenerator: (req) => {
    // Prefer authenticated user ID when present, fall back to IP
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : req.ip || 'unknown';
  },
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many login attempts, please try again later',
    });
  },
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * Account-switch rate limiter.
 *
 * /switch-account is authenticated, so brute-force isn't the concern here —
 * the point is to cap DB-write griefing (token rotation) and accidental
 * runaway loops. Keyed by the authenticated user id so shared-IP offices /
 * NATed households don't starve each other, and the cap is deliberately
 * higher than authRateLimiter's 5/15min so a user flipping between 2–3
 * accounts during a normal work session never hits it.
 *
 * Must be mounted AFTER `authenticate` so req.user is populated by the time
 * this runs; the keyGenerator falls back to IP only as a defence-in-depth
 * against misordering.
 */
export const switchAccountRateLimiter = rateLimit({
  windowMs: parseInt(process.env.SWITCH_ACCOUNT_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.SWITCH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS || '30'), // 30 switches
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `switch:${userId}` : `switch-ip:${req.ip || 'unknown'}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Switch-account rate limit exceeded for user ${(req as any).user?.id} (ip ${req.ip})`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many account switches, please slow down',
    });
  },
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * Admin impersonation rate limiter.
 *
 * /auth/impersonate is tighter than switch-account because an admin
 * flipping between many partners in quick succession is almost always
 * a misconfigured script or a credential-abuse pattern, not a real
 * workflow. Keyed by userId so an admin can't starve another admin
 * sharing an IP. Mounted AFTER `authenticate`.
 */
export const impersonateRateLimiter = rateLimit({
  windowMs: parseInt(process.env.IMPERSONATE_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.IMPERSONATE_RATE_LIMIT_MAX_REQUESTS || '10'), // 10 impersonations
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `impersonate:${userId}` : `impersonate-ip:${req.ip || 'unknown'}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Impersonate rate limit exceeded for user ${(req as any).user?.id} (ip ${req.ip})`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many impersonation requests, please slow down',
    });
  },
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * Read-side rate limiter for the switcher list.
 *
 * /switchable-accounts filters out SUSPENDED / INACTIVE siblings, so without
 * any cap a leaked access token could poll the endpoint as an oracle for
 * "when does sibling X get suspended?". Cap is looser than the write-side
 * switchAccountRateLimiter because legitimate UIs may pull the list on every
 * tab focus / route change.
 */
export const switchableAccountsRateLimiter = rateLimit({
  windowMs: parseInt(process.env.SWITCHABLE_ACCOUNTS_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.SWITCHABLE_ACCOUNTS_RATE_LIMIT_MAX_REQUESTS || '120'), // 120 reads
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `switchable:${userId}` : `switchable-ip:${req.ip || 'unknown'}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Switchable-accounts rate limit exceeded for user ${(req as any).user?.id} (ip ${req.ip})`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests, please slow down',
    });
  },
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * API Rate Limiter
 * Standard rate limiting for API endpoints
 */
export const apiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '30'), // 30 requests
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * File Upload Rate Limiter
 * More restrictive for file uploads (receipts, images)
 */
export const uploadRateLimiter = rateLimit({
  windowMs: UPLOAD_RATE_LIMIT.WINDOW_MS,
  max: UPLOAD_RATE_LIMIT.MAX,
  message: {
    error: 'Upload rate limit exceeded',
    message: 'Too many uploads, please wait before uploading again',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * Strict Rate Limiter for Payment Endpoints
 * Very restrictive for payment-related operations
 * Keyed per-user when authenticated to prevent relay/proxy attacks
 */
export const paymentRateLimiter = rateLimit({
  windowMs: PAYMENT_RATE_LIMIT.WINDOW_MS,
  max: PAYMENT_RATE_LIMIT.MAX,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : req.ip || 'unknown';
  },
  message: {
    error: 'Payment rate limit exceeded',
    message: 'Too many payment attempts, please contact support if you need assistance',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security Headers Middleware
 * Adds additional custom security headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Permissions Policy (formerly Feature-Policy)
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), microphone=(), camera=(), payment=(self)'
  );

  next();
};

/**
 * Trust Proxy Configuration
 * Required when behind nginx, CloudFlare, or load balancer
 */
export const configureTrustProxy = (app: any) => {
  if (process.env.TRUST_PROXY === 'true') {
    // Trust first proxy (CloudFlare, nginx)
    app.set('trust proxy', 1);
    logger.info('Trust proxy enabled');
  }
};

/**
 * Request ID Middleware
 * Adds unique ID to each request for tracking and debugging
 */
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.headers['x-request-id'] = requestId as string;
  res.setHeader('X-Request-ID', requestId);
  next();
};

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * IP Whitelist Middleware (for admin endpoints)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.socket.remoteAddress || '';

    if (!allowedIPs.includes(clientIP)) {
      logger.warn(`Unauthorized IP access attempt: ${clientIP} on ${req.path}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Access denied from your IP address',
      });
    }

    next();
  };
};

/**
 * Validate JWT Token Middleware
 * Ensures JWT tokens are properly formatted before processing
 */
export const validateJWTFormat = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(); // Let auth middleware handle missing token
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Invalid authorization format',
      message: 'Authorization header must be: Bearer <token>',
    });
  }

  // Basic JWT format validation (header.payload.signature)
  const token = parts[1];
  const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

  if (!jwtPattern.test(token)) {
    return res.status(401).json({
      error: 'Invalid token format',
      message: 'JWT token format is invalid',
    });
  }

  next();
};

/**
 * Security Audit Logger
 * Logs security-relevant events
 */
export const securityAuditLog = (req: Request, res: Response, next: NextFunction) => {
  // Log sensitive operations
  const sensitiveOperations = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/payments',
    '/api/admin',
  ];

  const isSensitive = sensitiveOperations.some(op => req.path.startsWith(op));

  if (isSensitive) {
    logger.info('Security Audit', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'],
    });
  }

  next();
};

/**
 * Prevent Parameter Pollution
 * Ensures array parameters are not exploited
 */
export const preventParameterPollution = (req: Request, res: Response, next: NextFunction) => {
  // Convert array query params to single value (use last value)
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (Array.isArray(req.query[key])) {
        const arr = req.query[key] as string[];
        req.query[key] = arr[arr.length - 1]; // Use last value
      }
    });
  }

  next();
};

/**
 * CORS Preflight Cache
 * Improves performance by caching CORS preflight requests
 */
export const corsPreflightCache = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }
  next();
};

/**
 * CSRF Protection via Origin/Referer checking
 *
 * Defense-in-depth layer on top of SameSite=Strict cookies and Bearer token auth.
 * Rejects state-changing requests (POST/PUT/PATCH/DELETE) whose Origin or Referer
 * header doesn't match an allowed origin.
 *
 * Webhooks and same-origin requests (no Origin header, e.g. server-to-server) are
 * excluded via the skipPaths list passed at mount time.
 */
export const csrfProtection = (skipPaths: string[] = []) => {
  const _raw = process.env.CORS_ORIGIN;
  const allowedOrigins = (_raw && _raw !== '*')
    ? _raw.split(',').map(o => o.trim().replace(/\/$/, ''))
    : [
        'https://boomcard.eu',
        'https://boomcard.bg',
        'https://mobile.boomcard.bg',
        'https://boomcard.vercel.app',
        'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
        'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178',
        'http://localhost:5179', 'http://localhost:5180', 'http://localhost:5181',
        'http://localhost:5182', 'http://localhost:5183', 'http://localhost:5184',
        // Partner dashboard dev server (vite starts at 3021, overflows to 3025+)
        'http://localhost:3021', 'http://localhost:3022', 'http://localhost:3023',
        'http://localhost:3024', 'http://localhost:3025', 'http://localhost:3026',
      ];

  const stateMutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return (req: Request, res: Response, next: NextFunction) => {
    // Only check state-mutating requests
    if (!stateMutatingMethods.has(req.method)) return next();

    // Skip explicitly excluded paths (e.g. webhooks)
    if (skipPaths.some(p => req.path.startsWith(p))) return next();

    // Requests without an Origin header are server-to-server (no browser = no CSRF risk)
    const origin = req.headers.origin as string | undefined;
    if (!origin) return next();

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (!allowedOrigins.includes(normalizedOrigin)) {
      logger.warn(`CSRF: rejected request from origin "${origin}" to ${req.method} ${req.path}`);
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Request origin not allowed',
      });
    }

    next();
  };
};
