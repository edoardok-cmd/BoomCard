/**
 * M7 / Spec §3.7 + §8.1 rule 4 + Clash 12.1 — Dual-currency display for admin
 * financial output during the BGN→EUR transition window.
 *
 * Spec rule (verbatim, §8.1 rule 4):
 *   - During the BGN→EUR transition window: amounts displayed in BOTH BGN and EUR.
 *   - After the transition window closes: BGN display is hidden; EUR only.
 *
 * Stored monetary amounts in the DB are denominated in BGN (the wallet balance,
 * cashback amounts, payout thresholds, invoice totals are all BGN). This helper
 * converts a BGN amount to a `{ bgn, eur }` display pair using the fixed
 * currency-board rate (EUR_TO_BGN_RATE), gated by the transition-window flag:
 *
 *   - window OPEN  → { bgn: <amount>, eur: <converted> }
 *   - window CLOSED → { bgn: null,    eur: <converted> }
 *
 * The window flag is read from the `currency_transition_window_open` SystemSetting
 * (string "true"/"false"), defaulting to OPEN (true) — Bulgaria is currently inside
 * the BGN→EUR transition window, so both currencies must show until product flips
 * the flag after €-adoption completes. No DB schema change is required: the flag is
 * a SystemSetting row, not a new column.
 *
 * Backward-compat: callers keep emitting their existing BGN scalar fields untouched;
 * the `{ bgn, eur }` pair is added ALONGSIDE under a new field (e.g. `amountDisplay`)
 * so no existing consumer breaks.
 */
import { EUR_TO_BGN_RATE } from '../constants/receipt.constants';
import { getSystemSettingStr } from '../utils/systemSettings';

export const CURRENCY_TRANSITION_WINDOW_SETTING = 'currency_transition_window_open';

export interface DualCurrencyAmount {
  /** BGN value — null once the transition window has closed (EUR-only display). */
  bgn: number | null;
  /** EUR value — always present. */
  eur: number;
  /** Whether the transition window is open (both currencies shown). */
  windowOpen: boolean;
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Convert a BGN amount to EUR at the fixed currency-board rate. */
export function bgnToEur(amountBgn: number): number {
  return r2(amountBgn / EUR_TO_BGN_RATE);
}

/**
 * Read the transition-window flag (cached 60s by getSystemSettingStr). Defaults to
 * OPEN. Any value other than the literal "false" (case-insensitive) is treated as
 * open, so a missing/blank setting keeps both currencies visible (fail-open: showing
 * BGN too is never wrong during/ before adoption — only after adoption is BGN hidden).
 */
export async function isCurrencyTransitionWindowOpen(): Promise<boolean> {
  const raw = await getSystemSettingStr(CURRENCY_TRANSITION_WINDOW_SETTING, 'true');
  return raw.trim().toLowerCase() !== 'false';
}

/**
 * Build a single dual-currency display pair from a BGN-denominated amount, using a
 * pre-resolved window flag (so a batch of amounts shares one settings read).
 */
export function toDualCurrency(amountBgn: number, windowOpen: boolean): DualCurrencyAmount {
  return {
    bgn: windowOpen ? r2(amountBgn) : null,
    eur: bgnToEur(amountBgn),
    windowOpen,
  };
}

/**
 * Map an object of `{ key: bgnAmount }` to `{ key: DualCurrencyAmount }` with a
 * single window-flag read. Convenience for an endpoint that emits several amounts.
 */
export async function buildDualCurrencyMap<K extends string>(
  amountsBgn: Record<K, number>,
): Promise<Record<K, DualCurrencyAmount>> {
  const windowOpen = await isCurrencyTransitionWindowOpen();
  const out = {} as Record<K, DualCurrencyAmount>;
  for (const key of Object.keys(amountsBgn) as K[]) {
    out[key] = toDualCurrency(amountsBgn[key], windowOpen);
  }
  return out;
}
