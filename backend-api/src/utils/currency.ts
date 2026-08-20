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
 * Convert a EUR amount BACK to BGN at the same fixed currency-board rate.
 *
 * This is the WRITE-side counterpart of {@link bgnToEur}, and it exists because
 * BC-QA-031 converted GET responses to EUR without touching the write handlers
 * on the same resources. Where an admin form is seeded from a converted GET and
 * submitted back, the value was persisted verbatim as BGN — silently halving it
 * on every save, and (for receipts) recomputing cashback from the halved figure.
 *
 * The storage unit is unchanged: money columns remain BGN-denominated, exactly
 * as `bgnToEur`'s header describes. What this restores is the symmetry the API
 * boundary is supposed to have — EUR out via `bgnToEur`, EUR in via `eurToBgn`,
 * BGN in the database on both sides.
 *
 * Apply it at the ROUTE boundary (where `bgnToEur` is applied on the way out),
 * not inside services: services operate in the storage unit, and converting
 * there would double-convert any internal caller that already holds BGN.
 *
 * `bgnToEur(eurToBgn(x))` is NOT exactly `x` — each direction rounds to 2dp, so
 * a round trip can move by a cent. That is inherent to storing a converted unit
 * and is the strongest argument for migrating these columns to EUR outright;
 * see the round-6 report's migration recommendation.
 */
export function eurToBgn(amountEur: number): number {
  return r2(amountEur * EUR_TO_BGN_RATE);
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
 * ⚠ THE VALUE DOMAIN IS SEVEN CURRENCIES, NOT TWO. `POST /api/payments/create`
 * accepts any `z.string().length(3)` code and validates it against
 * `PayseraService.getSupportedCurrencies()` — `['EUR','USD','GBP','PLN','CZK',
 * 'RON','BGN']` (`paysera.service.ts:761-763`) — then stores it verbatim. So a
 * stored row can legitimately be USD, GBP, PLN, CZK or RON.
 *
 * This function converts ONLY the BGN case. Every other currency — EUR and the
 * five non-EUR ones alike — passes through UNCONVERTED, while the route consumers
 * that call it (`subscriptions.routes.ts`, `adminSubscriptions.routes.ts`,
 * `adminTransactions.routes.ts`) then relabel the row `currency: 'EUR'`. For a
 * USD/GBP/PLN/CZK/RON row that means its raw magnitude ships under a EUR label.
 * That is a KNOWN DEFECT, tracked as **BC-QA-031-FOLLOWUP-1** ("Non-BGN payment
 * currencies are relabelled EUR without conversion (USD/GBP/PLN/CZK/RON)"); the
 * fix — reject/convert those rows, or preserve the real currency label instead of
 * asserting EUR — belongs to that task, not here. Do not "fix" it by widening this
 * helper in isolation: the label is written by the callers, so both halves have to
 * move together.
 *
 * A `null`/absent currency is treated as BGN, matching the column default.
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
 * BEFORE any conversion — it adds magnitudes denominated in different currencies
 * together — so a row-level guard cannot repair it downstream. The fix is to make
 * `currency` part of the aggregate's grouping key and fold the per-currency
 * subtotals here.
 *
 * `bgnToEur` is linear, so converting a currency's subtotal equals converting each
 * of its rows and summing, up to a single 2dp rounding at the subtotal instead of
 * one per row — which is the more accurate of the two for a displayed total.
 *
 * ⚠ Inherits {@link toEur}'s value-domain limitation: the column's real domain is
 * Paysera's seven accepted currencies, and only the BGN subtotal is converted. A
 * USD/GBP/PLN/CZK/RON subtotal is added to the EUR total at its raw magnitude, so
 * a total spanning such rows is overstated or understated by the FX difference.
 * Tracked as **BC-QA-031-FOLLOWUP-1**; fix it there, together with the callers
 * that relabel the row `'EUR'`.
 */
export function sumMixedCurrencyToEur(
  groups: Array<{ currency: string | null; amount: number | null }>,
): number {
  return r2(
    groups.reduce((runningTotal, group) => runningTotal + toEur(group.amount ?? 0, group.currency), 0),
  );
}
