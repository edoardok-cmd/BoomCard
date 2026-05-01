/**
 * Error reporter — sends crash/error reports to two destinations:
 *  1. BoomCard's internal /api/mobile/errors endpoint (always, fire-and-forget)
 *  2. The admin-configured external URL (errorLogUrl from /api/config/mobile), if set
 *
 * Both sends are best-effort; failures are silently swallowed so reporting
 * never interferes with the app's main execution path.
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { API_CONFIG } from '../constants/config';

export type ErrorType = 'crash' | 'api_error' | 'render_error' | 'network_error' | 'unknown';

interface ReportPayload {
  platform: string;
  appVersion: string | null;
  errorType: ErrorType;
  message: string;
  stack?: string;
}

// Holds the external forwarding URL once the config has been fetched.
// Starts null (disabled); set by setExternalErrorLogUrl() at app startup.
let _externalUrl: string | null = null;

export function setExternalErrorLogUrl(url: string | null): void {
  _externalUrl = url || null;
}

function buildPayload(error: unknown, type: ErrorType): ReportPayload {
  const message =
    error instanceof Error
      ? error.message || String(error)
      : String(error);

  const stack =
    error instanceof Error && error.stack
      ? error.stack.slice(0, 5000)
      : undefined;

  const appVersion = Application.nativeApplicationVersion ?? null;

  // Expo Web runs in a browser — Platform.OS is 'web'
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  return { platform, appVersion, errorType: type, message, stack };
}

async function postToInternal(payload: ReportPayload): Promise<void> {
  await fetch(`${API_CONFIG.BASE_URL}/api/mobile/errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
}

async function postToExternal(url: string, payload: ReportPayload): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      source: 'boomcard-mobile',
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  });
}

export function reportError(error: unknown, type: ErrorType = 'unknown'): void {
  const payload = buildPayload(error, type);

  // Fire-and-forget — never await or throw
  postToInternal(payload).catch(() => {});
  if (_externalUrl) {
    postToExternal(_externalUrl, payload).catch(() => {});
  }
}
