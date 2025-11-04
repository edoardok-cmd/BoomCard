/**
 * Security Configuration
 *
 * Centralized security configuration for the application
 */

import { Application } from 'express';
import cors from 'cors';
import {
  productionHelmetConfig,
  developmentHelmetConfig,
  authRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  paymentRateLimiter,
  sanitizeInput,
  securityHeaders,
  configureTrustProxy,
  requestId,
  validateJWTFormat,
  securityAuditLog,
  preventParameterPollution,
  corsPreflightCache,
} from '../middleware/security.middleware';
import { logger } from '../utils/logger';

/**
 * Apply all security middleware to the application
 */
export function applySecurityMiddleware(app: Application) {
  const isProduction = process.env.NODE_ENV === 'production';

  logger.info(`Applying security middleware (${process.env.NODE_ENV} mode)`);

  // 1. Trust proxy configuration (must be first)
  configureTrustProxy(app);

  // 2. Helmet security headers
  app.use(isProduction ? productionHelmetConfig : developmentHelmetConfig);

  // 3. CORS configuration
  const corsOrigins = getCorsOrigins();
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400, // 24 hours
  }));

  logger.info(`CORS enabled for: ${corsOrigins.join(', ')}`);

  // 4. Custom security headers
  app.use(securityHeaders);

  // 5. Request ID tracking
  app.use(requestId);

  // 6. CORS preflight cache
  app.use(corsPreflightCache);

  // 7. Prevent parameter pollution
  app.use(preventParameterPollution);

  // 8. Input sanitization (after body parsing)
  app.use(sanitizeInput);

  // 9. Security audit logging
  app.use(securityAuditLog);

  // 10. JWT format validation (for protected routes)
  app.use('/api/', validateJWTFormat);

  logger.info('✅ Security middleware applied successfully');
}

/**
 * Apply rate limiters to specific routes
 */
export function applyRateLimiters(app: Application) {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    logger.info('Rate limiting disabled in development mode');
    return;
  }

  // Auth endpoints - most restrictive
  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);
  app.use('/api/auth/forgot-password', authRateLimiter);
  app.use('/api/auth/reset-password', authRateLimiter);

  // Payment endpoints - very restrictive
  app.use('/api/payments', paymentRateLimiter);

  // Upload endpoints - moderately restrictive
  app.use('/api/receipts/upload', uploadRateLimiter);
  app.use('/api/receipts/scan', uploadRateLimiter);

  // General API endpoints - standard rate limiting
  app.use('/api/', apiRateLimiter);

  logger.info('✅ Rate limiters configured');
}

/**
 * Get CORS origins from environment
 */
function getCorsOrigins(): string[] {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
  }

  // Default development origins
  return [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:5178',
  ];
}

/**
 * Security Configuration Constants
 */
export const SECURITY_CONFIG = {
  // JWT Configuration
  JWT: {
    ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY || '1h',
    REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    ALGORITHM: 'HS256' as const,
  },

  // Password Requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBER: true,
    REQUIRE_SPECIAL_CHAR: false,
  },

  // Session Configuration
  SESSION: {
    MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
    ROLLING: true,
    SECURE: process.env.NODE_ENV === 'production',
    HTTP_ONLY: true,
    SAME_SITE: 'strict' as const,
  },

  // File Upload Limits
  UPLOAD: {
    MAX_FILE_SIZE: parseInt(process.env.MAX_RECEIPT_SIZE || '5242880'), // 5MB
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    MAX_FILES: 1,
  },

  // Rate Limiting
  RATE_LIMIT: {
    AUTH: {
      WINDOW_MS: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000'),
      MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5'),
    },
    API: {
      WINDOW_MS: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000'),
      MAX: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '30'),
    },
    UPLOAD: {
      WINDOW_MS: 60000,
      MAX: 5,
    },
    PAYMENT: {
      WINDOW_MS: 900000,
      MAX: 10,
    },
  },

  // Security Thresholds
  SECURITY: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
    PASSWORD_RESET_EXPIRY: 1 * 60 * 60 * 1000, // 1 hour
    EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Fraud Detection
  FRAUD: {
    MIN_OCR_CONFIDENCE: parseInt(process.env.MIN_OCR_CONFIDENCE || '30'),
    AUTO_APPROVE_THRESHOLD: parseInt(process.env.FRAUD_SCORE_AUTO_APPROVE || '30'),
    AUTO_REJECT_THRESHOLD: parseInt(process.env.FRAUD_SCORE_AUTO_REJECT || '70'),
    MAX_SCANS_PER_DAY: parseInt(process.env.MAX_SCANS_PER_DAY || '3'),
    MAX_SCANS_PER_MONTH: parseInt(process.env.MAX_SCANS_PER_MONTH || '30'),
  },

  // Content Security
  CSP: {
    REPORT_URI: process.env.CSP_REPORT_URI || '',
    REPORT_ONLY: process.env.NODE_ENV !== 'production',
  },

  // Allowed Admin IPs (for IP whitelist)
  ADMIN_IPS: process.env.ADMIN_ALLOWED_IPS
    ? process.env.ADMIN_ALLOWED_IPS.split(',').map(ip => ip.trim())
    : [],
};

/**
 * Validate security configuration on startup
 */
export function validateSecurityConfig() {
  const errors: string[] = [];

  // Check JWT secrets
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  if (!process.env.REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET.length < 32) {
    errors.push('REFRESH_TOKEN_SECRET must be at least 32 characters');
  }

  // Check production-specific requirements
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CORS_ORIGIN) {
      errors.push('CORS_ORIGIN must be set in production');
    }

    if (process.env.JWT_SECRET === 'your-secret-key-here') {
      errors.push('JWT_SECRET must be changed from default value in production');
    }

    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgresql://')) {
      errors.push('DATABASE_URL must use PostgreSQL in production');
    }
  }

  // Log errors
  if (errors.length > 0) {
    logger.error('❌ Security configuration errors:');
    errors.forEach(error => logger.error(`  - ${error}`));

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Security configuration validation failed. Cannot start server.');
    } else {
      logger.warn('⚠️  Development mode: Continuing despite security warnings');
    }
  } else {
    logger.info('✅ Security configuration validated');
  }
}

/**
 * Security Best Practices Checklist
 */
export const SECURITY_CHECKLIST = {
  production: [
    'Change all default secrets and API keys',
    'Enable HTTPS/TLS for all connections',
    'Configure proper CORS origins',
    'Enable rate limiting on all endpoints',
    'Set up database connection pooling',
    'Enable security headers (Helmet)',
    'Configure CSP (Content Security Policy)',
    'Set up error tracking (Sentry)',
    'Enable audit logging for sensitive operations',
    'Use parameterized queries (Prisma handles this)',
    'Implement proper input validation',
    'Sanitize user input',
    'Use bcrypt for password hashing (with salt rounds >= 10)',
    'Implement JWT token rotation',
    'Set secure cookie flags (httpOnly, secure, sameSite)',
    'Configure session timeouts',
    'Enable SQL injection protection',
    'Implement XSS protection',
    'Configure CSRF protection',
    'Set up IP whitelisting for admin endpoints',
    'Enable 2FA for admin accounts',
    'Regularly update dependencies',
    'Run security audits (npm audit)',
    'Monitor for suspicious activity',
    'Set up automated backups',
    'Implement proper error handling (do not leak sensitive info)',
  ],
  deployment: [
    'Use environment variables for secrets',
    'Never commit .env files to git',
    'Use secrets manager (AWS Secrets Manager, etc.)',
    'Enable firewall rules',
    'Configure load balancer security groups',
    'Set up DDoS protection (CloudFlare, AWS Shield)',
    'Enable database encryption at rest',
    'Use SSL/TLS for database connections',
    'Configure VPC/subnet isolation',
    'Set up monitoring and alerts',
    'Enable CloudWatch/DataDog logging',
    'Configure automated security updates',
    'Use least privilege IAM policies',
    'Enable MFA for cloud accounts',
    'Set up intrusion detection',
  ],
};

export default {
  applySecurityMiddleware,
  applyRateLimiters,
  SECURITY_CONFIG,
  validateSecurityConfig,
  SECURITY_CHECKLIST,
};
