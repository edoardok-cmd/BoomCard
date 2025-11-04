/**
 * Enhanced Security Middleware
 *
 * Comprehensive security middleware for production environment
 */

import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';

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
        "'unsafe-inline'", // Required for some frameworks
        'https://js.stripe.com',
        'https://maps.googleapis.com',
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for styled-components
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
        process.env.CORS_ORIGIN || "'self'",
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
 */
export const authRateLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5'), // 5 attempts
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Store in memory (use Redis for distributed systems)
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
  windowMs: 60000, // 1 minute
  max: 5, // 5 uploads per minute
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
 */
export const paymentRateLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: 10, // 10 payment attempts per 15 minutes
  message: {
    error: 'Payment rate limit exceeded',
    message: 'Too many payment attempts, please contact support if you need assistance',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Request Sanitization Middleware
 * Sanitizes user input to prevent XSS and injection attacks
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key] as string);
      }
    });
  }

  // Sanitize body parameters
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  next();
};

/**
 * Sanitize string to prevent XSS
 */
function sanitizeString(str: string): string {
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove inline event handlers
    .trim();
}

/**
 * Recursively sanitize object
 */
function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (typeof obj[key] === 'string') {
        sanitized[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = sanitizeObject(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
  }
  return sanitized;
}

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
