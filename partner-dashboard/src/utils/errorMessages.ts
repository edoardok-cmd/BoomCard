/**
 * BC-QA-004 — client-side error-code → localized-message mapping.
 *
 * Backend auth endpoints raise most errors as plain hardcoded English strings
 * today (see auth.validator.ts / auth.service.ts / auth.routes.ts), so a BG
 * user can see raw English text when something goes wrong. A handful of
 * endpoints already attach a machine-readable `code` field alongside the
 * message (e.g. pending-checkout.routes.ts's EMAIL_ALREADY_HAS_ACTIVE_PLAN /
 * EMAIL_REGISTERED_NO_ACTIVE_PLAN / CHECKOUT_ALREADY_IN_PROGRESS) — this
 * module is the client-side half of that pattern: it prefers a `code` field
 * when present, and falls back to the server's raw `message` field when it
 * isn't (so nothing regresses before every backend site emits a code).
 *
 * The AUTH_ERROR_CODE_MAP keys below are the error-code names proposed for
 * the backend-engineer follow-up task (see BC-QA-004 report). Adding a real
 * `code` to a backend response is the ONLY change needed to route it through
 * a localized message here — no frontend change required at that point.
 */
import { getTranslation, type Language } from '../locales';

export interface ApiErrorLike {
  response?: {
    status?: number;
    data?: {
      code?: string;
      message?: string;
      error?: string | { message?: string };
    };
  };
  message?: string;
}

/**
 * Maps a backend `code` value to a translation key in locales/{en,bg}.ts.
 * Every key referenced here must exist in BOTH bg.ts and en.ts (enforced by
 * locales/keyParity.test.ts).
 */
export const AUTH_ERROR_CODE_MAP: Record<string, string> = {
  // Already emitted with a `code` field today (pending-checkout.routes.ts).
  EMAIL_ALREADY_HAS_ACTIVE_PLAN: 'checkoutPage.emailConflictActivePlanPrefix',
  EMAIL_REGISTERED_NO_ACTIVE_PLAN: 'checkoutPage.emailConflictExistsPrefix',
  CHECKOUT_ALREADY_IN_PROGRESS: 'checkoutPage.emailConflictInProgress',

  // Proposed codes for the backend-engineer follow-up (auth.validator.ts /
  // auth.service.ts / auth.routes.ts do not emit these yet — see the BC-QA-004
  // report's full catalog for file:line and the exact string each maps to).
  AUTH_EMAIL_ALREADY_REGISTERED: 'errors.emailAlreadyRegistered',
  AUTH_PHONE_ALREADY_REGISTERED: 'errors.phoneAlreadyRegistered',
  AUTH_TOO_MANY_ATTEMPTS: 'errors.tooManyRequests',
  AUTH_INVALID_CREDENTIALS: 'errors.invalidCredentials',
  AUTH_PARTNER_ACCOUNT_EXISTS: 'errors.emailAlreadyRegistered',
  AUTH_REGISTRATION_TOKEN_INVALID: 'completeProfilePage.invalidLinkMessage',
  AUTH_REGISTRATION_TOKEN_EXPIRED: 'completeProfilePage.invalidLinkMessage',
  AUTH_COMPLETE_PROFILE_EMAIL_EXISTS: 'completeProfilePage.emailConflictPrefix',
  AUTH_PASSWORD_POLICY: 'auth.passwordMinLength',
};

/**
 * Resolve a localized error message for a caught API error.
 *
 * Resolution order:
 *   1. `response.data.code` — if present and mapped, use the localized string.
 *   2. `response.data.message` — the server's raw message (today's behavior;
 *      keeps working for every endpoint that hasn't been given a code yet).
 *   3. `error.message` — the client-side/network error message.
 *   4. `fallbackKey` — a translation key resolved in the caller's language
 *      (defaults to the generic "errors.somethingWentWrong").
 */
export function getLocalizedErrorMessage(
  error: unknown,
  language: Language,
  fallbackKey: string = 'errors.somethingWentWrong',
): string {
  const err = error as ApiErrorLike;
  const code = err?.response?.data?.code;
  if (code && AUTH_ERROR_CODE_MAP[code]) {
    return getTranslation(language, AUTH_ERROR_CODE_MAP[code]);
  }

  const data = err?.response?.data;
  const rawErrorField = data?.error;
  const rawMessage =
    data?.message ||
    (typeof rawErrorField === 'object' ? rawErrorField?.message : rawErrorField) ||
    err?.message;
  if (rawMessage) return rawMessage;

  return getTranslation(language, fallbackKey);
}
