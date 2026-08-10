/**
 * Currency conversion — BGN→EUR.
 *
 * Bulgaria's BGN→EUR transition window has closed; all API responses show
 * EUR-only amounts (see BC-QA-031). Stored monetary amounts in the DB remain
 * BGN-denominated (wallet balance, cashback amounts, payout thresholds,
 * invoice totals, etc.) — this helper converts a BGN amount to its EUR
 * equivalent at the fixed currency-board rate before it is returned in any
 * API response.
 *
 * This is a plain, permanent conversion helper — NOT a reintroduction of the
 * BGN/EUR dual-display or transition-window machinery removed in BC-QA-031.
 * There is no window flag and no `{ bgn, eur }` pair here; every response
 * field is a single EUR scalar.
 */
import { EUR_TO_BGN_RATE } from '../constants/receipt.constants';

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Convert a BGN amount to EUR at the fixed currency-board rate, rounded to 2dp. */
export function bgnToEur(amountBgn: number): number {
  return r2(amountBgn / EUR_TO_BGN_RATE);
}
