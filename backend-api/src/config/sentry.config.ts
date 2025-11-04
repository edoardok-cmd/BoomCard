/**
 * Sentry Configuration for Backend API
 * Error tracking and performance monitoring
 */

import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Express } from 'express';

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
  enabled: boolean;
}

/**
 * Initialize Sentry with Express integration
 */
export function initSentry(app: Express): void {
  const config: SentryConfig = {
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    release: `boomcard-api@${process.env.npm_package_version || '1.0.0'}`,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    enabled: process.env.NODE_ENV === 'production' && !!process.env.SENTRY_DSN,
  };

  if (!config.enabled) {
    console.log('[Sentry] Disabled in non-production environment or DSN missing');
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,

    // Performance Monitoring
    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,

    // Integrations
    integrations: [
      // Express integration for automatic request/response tracking
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),

      // Profiling for performance insights
      new ProfilingIntegration(),

      // Prisma integration for database query tracking
      new Sentry.Integrations.Prisma({ client: undefined }), // Will be set later

      // Node integrations
      new Sentry.Integrations.OnUncaughtException({
        exitEvenIfOtherHandlersAreRegistered: false,
      }),
      new Sentry.Integrations.OnUnhandledRejection({
        mode: 'warn',
      }),
    ],

    // Request data
    sendDefaultPii: false, // Don't send personally identifiable information

    // Ignore certain errors
    ignoreErrors: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'Socket timeout',
      'Connection timeout',
    ],

    // Before send hook for filtering
    beforeSend(event, hint) {
      const error = hint.originalException as Error;

      // Filter out validation errors (client errors)
      if (error?.message?.includes('ValidationError')) {
        return null;
      }

      // Filter out authentication errors
      if (error?.message?.includes('Unauthorized') || error?.message?.includes('Invalid token')) {
        return null;
      }

      // Scrub sensitive data from request
      if (event.request) {
        // Remove authorization headers
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }

        // Remove sensitive query params
        if (event.request.query_string && typeof event.request.query_string === 'string') {
          event.request.query_string = event.request.query_string
            .replace(/token=[^&]*/g, 'token=[REDACTED]')
            .replace(/password=[^&]*/g, 'password=[REDACTED]');
        }
      }

      return event;
    },

    // Breadcrumbs for debugging context
    beforeBreadcrumb(breadcrumb) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null;
      }
      return breadcrumb;
    },
  });

  console.log(`[Sentry] Initialized successfully (${config.environment})`);
}

/**
 * Get Sentry request handler middleware
 * Must be used before other middleware
 */
export function getSentryRequestHandler() {
  return Sentry.Handlers.requestHandler({
    ip: false, // Don't track IP addresses (GDPR compliance)
    user: ['id', 'email', 'role'], // Track user context
  });
}

/**
 * Get Sentry tracing middleware
 * For performance monitoring
 */
export function getSentryTracingHandler() {
  return Sentry.Handlers.tracingHandler();
}

/**
 * Get Sentry error handler middleware
 * Must be used after all other middleware and routes
 */
export function getSentryErrorHandler(): any {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only send server errors (5xx)
      const statusCode = (error as any).statusCode || 500;
      return statusCode >= 500;
    },
  });
}

/**
 * Capture exception manually
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Sentry Debug]', error, context);
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture message
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, any>
): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Sentry Debug] ${level.toUpperCase()}:`, message, context);
    return;
  }

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context for error tracking
 */
export function setUser(user: {
  id: string;
  email?: string;
  role?: string;
  [key: string]: any;
}): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

/**
 * Clear user context
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, any>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string
): Sentry.Transaction {
  return Sentry.startTransaction({
    name,
    op,
  });
}

/**
 * Flush Sentry events (useful for serverless)
 */
export async function flush(timeout = 2000): Promise<boolean> {
  return Sentry.flush(timeout);
}

/**
 * Close Sentry connection
 */
export async function close(timeout = 2000): Promise<boolean> {
  return Sentry.close(timeout);
}

export default {
  init: initSentry,
  requestHandler: getSentryRequestHandler,
  tracingHandler: getSentryTracingHandler,
  errorHandler: getSentryErrorHandler,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  startTransaction,
  flush,
  close,
};
