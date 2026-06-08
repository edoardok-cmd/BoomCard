/**
 * Currency display mode utility — spec §7.3, Clash 12.1.
 *
 * During the BGN→EUR transition window amounts must show both BGN and EUR.
 * After the window closes (BGN_TRANSITION_END), only EUR is shown.
 *
 * This module provides a single source of truth for the current display mode
 * so every monetary display in the codebase can be updated in one place.
 *
 * The transition window ended 2026-01-01. `BGN_ONLY` mode is therefore never
 * reached in production at this time, and `EUR_ONLY` is the current default.
 * When the currency-context API is available, replace `resolveCurrencyMode()`
 * with a server-driven toggle without touching any call site.
 */

import { convertBGNToEUR } from './helpers';

/** The three display modes mandated by spec Clash 12.1. */
export type CurrencyDisplayMode = 'BGN_ONLY' | 'DUAL' | 'EUR_ONLY';

/** ISO timestamp when the BGN→EUR transition window closes. */
const BGN_TRANSITION_END = new Date('2026-01-01T00:00:00Z');

/**
 * Resolve the current display mode based on the system clock.
 *
 * Returns:
 *   'BGN_ONLY'  — before any transition activity (pre-announcement, not used currently)
 *   'DUAL'      — during the transition window
 *   'EUR_ONLY'  — after the transition window has closed
 *
 * Replace this function body with an API/feature-flag call when the
 * currency-context service becomes available.
 */
export function resolveCurrencyMode(): CurrencyDisplayMode {
  const now = new Date();
  if (now > BGN_TRANSITION_END) {
    return 'EUR_ONLY';
  }
  return 'DUAL';
}

/**
 * React hook that returns the current currency display mode.
 * Wraps `resolveCurrencyMode` so components can consume it as a hook and
 * the implementation can be upgraded to a context/query without call-site changes.
 */
export function useCurrencyDisplay(): CurrencyDisplayMode {
  return resolveCurrencyMode();
}

/**
 * Format a BGN amount according to the current display mode.
 *
 * @param amountBGN  Amount in Bulgarian Lev (BGN)
 * @param mode       Currency display mode (use `resolveCurrencyMode()` or `useCurrencyDisplay()`)
 * @param language   'bg' | 'en' — controls the лв vs BGN suffix
 */
export function formatWithCurrency(
  amountBGN: number,
  mode: CurrencyDisplayMode,
  language: 'bg' | 'en' = 'bg',
): string {
  const fixed = amountBGN.toFixed(2);
  const bgnLabel = language === 'bg' ? 'лв' : 'BGN';
  const eur = convertBGNToEUR(amountBGN);

  switch (mode) {
    case 'BGN_ONLY':
      return `${fixed} ${bgnLabel}`;
    case 'DUAL':
      return `${fixed} ${bgnLabel} / €${eur.toFixed(2)}`;
    case 'EUR_ONLY':
      return `€${eur.toFixed(2)}`;
    default:
      return `${fixed} ${bgnLabel}`;
  }
}
