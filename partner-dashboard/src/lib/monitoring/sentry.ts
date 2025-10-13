/**
 * Sentry Error Tracking Configuration
 */

import * as Sentry from '@sentry/react';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production';
  const enabled = import.meta.env.VITE_APP_ENVIRONMENT === 'production';

  if (!dsn || !enabled) {
    console.log('[Sentry] Skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      new Sentry.BrowserTracing({
        tracePropagationTargets: ['localhost', /^\//, /^https:\/\/api\.boomcard\.bg/],
      }),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event, hint) {
      const error = hint.originalException as Error;
      const ignorePatterns = [
        /ResizeObserver loop limit exceeded/i,
        /Non-Error promise rejection captured/i,
      ];
      
      for (const pattern of ignorePatterns) {
        if (pattern.test(error?.message || '')) {
          return null;
        }
      }
      
      return event;
    },
    release: `boomcard@${import.meta.env.VITE_APP_VERSION || '2.0.0'}`,
  });

  console.log('[Sentry] Initialized successfully');
}

export function captureException(error: Error, context?: Record<string, any>): void {
  if (import.meta.env.VITE_APP_ENVIRONMENT !== 'production') {
    console.error('[Sentry Debug]', error, context);
    return;
  }
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (import.meta.env.VITE_APP_ENVIRONMENT !== 'production') {
    console.log(`[Sentry Debug] ${level.toUpperCase()}:`, message);
    return;
  }
  Sentry.captureMessage(message, { level });
}

export function setUser(user: { id: string; email?: string; username?: string }): void {
  Sentry.setUser(user);
}

export function clearUser(): void {
  Sentry.setUser(null);
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;

export default {
  init: initSentry,
  captureException,
  captureMessage,
  setUser,
  clearUser,
  ErrorBoundary: SentryErrorBoundary,
};
