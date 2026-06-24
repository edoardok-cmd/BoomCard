import * as Sentry from '@sentry/browser';
import { Platform } from 'react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (Platform.OS === 'web' && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1,
  });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (Platform.OS !== 'web' || !dsn) return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}
