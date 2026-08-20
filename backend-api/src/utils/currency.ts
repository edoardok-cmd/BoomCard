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

/**
 * Convert ONE stored amount to EUR according to the currency it is stored in.
 *
 * `Transaction.currency` is genuinely mixed, so a blanket `bgnToEur()` over that
 * column halves any row that is already EUR-denominated. The writers are:
 *   - `schema.prisma` `Transaction.currency @default("BGN")` — legacy/default rows
 *   - `POST /api/payments/create` — stores the caller-supplied currency, which
 *     `createPaymentSchema` defaults to `'EUR'`
 *   - `stripe.service.ts` — `(invoice.currency ?? 'bgn').toUpperCase()`, so an
 *     EUR-priced Stripe invoice produces an EUR row
 *
 * Only the BGN case is converted; anything already EUR-denominated passes through
 * untouched. A `null`/absent currency is treated as BGN, matching the column default.
 */
export function toEur(amount: number, currency: string | null | undefined): number {
  return (currency ?? 'BGN').toUpperCase() === 'BGN' ? bgnToEur(amount) : amount;
}

/** Nullable-passthrough variant of {@link toEur} for optional money columns. */
export function toEurOrNull(
  amount: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  return amount == null ? null : toEur(amount, currency);
}

/**
 * Fold a per-currency set of DB-side sums into a single EUR total.
 *
 * A Prisma `_sum.amount` taken across a mixed-currency column is meaningless
 * BEFORE any conversion — it adds BGN and EUR magnitudes together — so a
 * row-level guard cannot repair it downstream. The fix is to make `currency`
 * part of the aggregate's grouping key and fold the per-currency subtotals here.
 *
 * `bgnToEur` is linear, so converting a currency's subtotal equals converting each
 * of its rows and summing, up to a single 2dp rounding at the subtotal instead of
 * one per row — which is the more accurate of the two for a displayed total.
 */
export function sumMixedCurrencyToEur(
  groups: Array<{ currency: string | null; amount: number | null }>,
): number {
  return r2(
    groups.reduce((runningTotal, group) => runningTotal + toEur(group.amount ?? 0, group.currency), 0),
  );
}
