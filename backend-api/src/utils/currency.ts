/**
 * Currency — the accepted currency domain, BGN→EUR conversion, and the
 * EUR-only response labelling that BC-QA-031 introduced.
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
import { logger } from './logger';
// `AppError` is the shape `errorHandler` reads a status code from; see
// `UnsupportedCurrencyError` below. `error.middleware` imports only
// express/multer/logger/monitoring, none of which reach back here, so this adds
// no import cycle.
import { AppError } from '../middleware/error.middleware';

/**
 * THE accepted currency domain for every money column BoomCard writes
 * (`Transaction.currency`, `Wallet.currency`, `WalletTransaction.currency`).
 *
 * This is an APPLICATION-LEVEL POLICY, deliberately narrower than what the
 * payment provider can technically process (see
 * `PayseraService.getSupportedCurrencies()` for the provider's own list). That
 * wider list is the Paysera library's default, not a BoomCard product
 * decision: no BoomCard surface (web frontend, partner dashboard, mobile)
 * offers a picker for anything outside this constant, every plan price and
 * payout threshold is denominated in BGN or EUR, and there is no FX rate
 * source anywhere in this codebase. Accepting a wider domain at the API
 * boundary therefore bought no product capability and only produced rows this
 * module cannot honestly convert.
 *
 * BGN is here because it is the storage unit of every legacy money column
 * (`@default("BGN")` in schema.prisma). EUR is here because it is the unit
 * every API response is expressed in. Nothing else can be both written and
 * displayed truthfully, so nothing else is accepted.
 *
 * Enforcement is layered (BC-QA-031-FOLLOWUP-1). The first two layers are what
 * actually close the hole; the third is a backstop with KNOWN LIMITS, spelled
 * out here rather than overstated:
 *   1. The caller-supplied input path rejects with a 400 before any write:
 *      `POST /api/payments/create`. That is the ONLY live one — `payments.routes.ts`
 *      (`POST /api/payments/intents`) and `PaymentService` in
 *      `payment.service.ts` carry the same gate but are both DORMANT: the router
 *      is imported in `server.ts` and never mounted, so the endpoint 404s, and
 *      `PaymentService` has no callers anywhere under `src/` (task-r1 F4 —
 *      this enumeration previously named `/intents` as a live layer, which
 *      overstated the enforced surface by one path). Their gates are kept so
 *      that mounting the router later cannot reopen the hole.
 *   2. Provider-driven paths (Stripe webhooks) refuse to write a row they
 *      cannot label truthfully, log an error and raise an admin-ops alert
 *      instead of returning an error to the provider.
 *   3. `src/lib/prisma.ts` installs a client extension that rejects an
 *      out-of-domain `currency` on the TOP-LEVEL write operations of the money
 *      models. It is a safety net for the ordinary `prisma.<model>.<op>(...)`
 *      shape, NOT a database-level invariant: Prisma query extensions are not
 *      invoked for NESTED writes (`prisma.user.update({ data: { transactions:
 *      { create: … } } })` bypasses it entirely), and it can only cover the
 *      operation names it enumerates. Raw SQL bypasses it too. The genuinely
 *      structural version of this constraint is a Postgres `CHECK` on the
 *      three columns, which is a migration and therefore out of this task's
 *      scope — see `withCurrencyGuard` in `src/lib/prisma.ts` for the measured
 *      limits and the follow-up recommendation.
 *
 * Use `normalizeCurrency` / `assertAcceptedCurrency` rather than comparing
 * against string literals anywhere else.
 */
export const ACCEPTED_CURRENCIES = ['BGN', 'EUR'] as const;

export type AcceptedCurrency = (typeof ACCEPTED_CURRENCIES)[number];

/**
 * The WALLET LEDGER's accepted domain: BGN and nothing else.
 *
 * `Wallet.balance`, `Wallet.availableBalance`, `Wallet.pendingBalance` and
 * `WalletTransaction.amount` are not merely *usually* BGN — the arithmetic that
 * maintains them is unconditionally BGN. `walletService.credit()`/`debit()`
 * take no currency and increment the column by whatever number they are handed;
 * `getPayoutThresholdBGN` returns BGN; every caller converts INTO BGN with
 * `toBgn()` before crediting. Nothing anywhere writes `Wallet.currency` at all
 * (`getOrCreateWallet` omits it, so the schema default applies).
 *
 * Admitting EUR here would therefore admit a value the ledger cannot honour,
 * and it did: with `Wallet.currency = 'EUR'`, a 10.00 EUR top-up moved the
 * reported balance by 19.56 EUR — the reads were keyed on the column while the
 * writes stayed BGN, a ~96% over-credit (task-r1 F3, measured). Narrowing the
 * WRITE domain to BGN is both cheaper and more truthful than inventing
 * currency-aware wallet arithmetic for a currency nothing asks for.
 *
 * This is a WRITE-side policy only. Reads must still cope with legacy rows
 * written before the narrowing — including EUR ones — which is why `toEur`,
 * `displayCurrency` and `foldMixedCurrencyToEur` keep the wider
 * {@link ACCEPTED_CURRENCIES} view: a stored EUR amount is displayable at face
 * value, a stored USD amount is not convertible at all.
 */
export const WALLET_LEDGER_CURRENCIES = ['BGN'] as const;

/**
 * The write-side accepted domain PER MODEL, consumed by `withCurrencyGuard` in
 * `src/lib/prisma.ts`. Keys are Prisma model names as the extension sees them.
 *
 * `Transaction.currency` is genuinely {BGN, EUR}: it records what a customer
 * PAID, and BoomCard prices in both. The two wallet columns are the LEDGER's
 * own unit and are BGN alone — see {@link WALLET_LEDGER_CURRENCIES}.
 */
export const CURRENCY_DOMAIN_BY_MODEL: Record<string, readonly string[]> = {
  transaction: ACCEPTED_CURRENCIES,
  wallet: WALLET_LEDGER_CURRENCIES,
  walletTransaction: WALLET_LEDGER_CURRENCIES,
};

/**
 * The single currency every API response is denominated in. Stored BGN
 * amounts are converted to it on the way out; stored EUR amounts already are.
 */
export const RESPONSE_CURRENCY: AcceptedCurrency = 'EUR';

/**
 * Normalise an arbitrary caller/provider-supplied currency code to a member of
 * {@link ACCEPTED_CURRENCIES}, or `null` if it is outside the accepted domain.
 *
 * Whitespace-trimming and upper-casing are deliberate: `'bgn'` (Stripe reports
 * lowercase ISO codes) and `'BGN'` are the same currency, and rejecting one
 * spelling while accepting the other would be an accident, not a policy.
 * `null`/`undefined`/non-strings return `null` — absence is NOT silently
 * coerced to the column default here, because a writer that omitted the field
 * entirely must be able to tell that apart from one that supplied garbage.
 */
export function normalizeCurrency(value: unknown): AcceptedCurrency | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return (ACCEPTED_CURRENCIES as readonly string[]).includes(code)
    ? (code as AcceptedCurrency)
    : null;
}

/** True when `value` is a currency BoomCard is willing to store. */
export function isAcceptedCurrency(value: unknown): value is AcceptedCurrency {
  return normalizeCurrency(value) !== null;
}

/**
 * Thrown by {@link assertAcceptedCurrency} / {@link assertCurrencyInDomain}
 * when a write would persist a currency outside the target column's domain.
 *
 * EXTENDS `AppError` (task-r1 F2). It previously extended plain `Error` with a
 * `statusCode = 400` field, and the docblock claimed that made "the shared error
 * middleware render it as a client error" — which was false: `errorHandler`
 * reads `statusCode` only from its `err instanceof AppError` branch and has no
 * generic `err.statusCode` fallback, so this surfaced as HTTP 500 carrying a
 * full server stack trace in the response body (measured live through
 * `POST /api/admin/transactions/adjust` against a wallet holding a legacy
 * out-of-domain currency — i.e. it misbehaved exactly in the scenario the guard
 * exists for). Extending `AppError` makes the declared status the real one.
 */
export class UnsupportedCurrencyError extends AppError {
  readonly currency: string;

  constructor(currency: unknown, context: string, domain: readonly string[] = ACCEPTED_CURRENCIES) {
    super(
      `Currency ${formatCurrencyForMessage(currency)} is not supported${context ? ` (${context})` : ''}. ` +
        `Supported currencies: ${domain.join(', ')}.`,
      400,
    );
    this.name = 'UnsupportedCurrencyError';
    this.currency = typeof currency === 'string' ? currency : String(currency);
  }
}

/**
 * Render an untrusted currency value for an error message without echoing an
 * unbounded blob of caller input back at the caller or into the logs.
 */
function formatCurrencyForMessage(value: unknown): string {
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 16)}…` : trimmed || '(empty)';
}

/**
 * Fail-closed gate for a write: return the normalised currency, or throw.
 *
 * `context` names the write site (e.g. `'POST /api/payments/create'`) and is
 * included in the message so an operator reading a log or a 400 body can tell
 * which path refused.
 */
export function assertCurrencyInDomain(
  value: unknown,
  context: string,
  domain: readonly string[],
): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : null;
  if (code === null || !domain.includes(code)) {
    throw new UnsupportedCurrencyError(value, context, domain);
  }
  return code;
}

export function assertAcceptedCurrency(value: unknown, context: string): AcceptedCurrency {
  const normalized = normalizeCurrency(value);
  if (normalized === null) {
    throw new UnsupportedCurrencyError(value, context);
  }
  return normalized;
}

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
 * Convert an amount DENOMINATED IN A KNOWN CURRENCY into the BGN storage unit.
 *
 * The exact mirror of {@link toEur}: `toEur` takes a stored amount plus the
 * currency it is stored in and produces the EUR figure to put on the wire;
 * `toBgn` takes an amount plus the currency it ARRIVED in and produces the BGN
 * figure to put in the ledger. Use it wherever an externally-denominated amount
 * crosses into a BGN-denominated column.
 *
 * WHY THIS EXISTS (BC-QA-031-FOLLOWUP-1 impl-r1 F1). `Wallet.balance`,
 * `Wallet.availableBalance` and `WalletTransaction.amount` are BGN-denominated
 * (`Wallet.currency @default("BGN")`, and `wallet.service.ts` converts them with
 * `bgnToEur` on the way out). But `POST /api/payments/create` DEFAULTS the
 * payment currency to EUR, so the ordinary top-up path produced a EUR-priced
 * `Transaction` whose amount was then handed to `walletService.credit()` and
 * incremented into that BGN column verbatim. Measured end-to-end: a 100.00 EUR
 * top-up moved the balance by 100 stored BGN, which the wallet screen renders
 * as EUR 51.13 — the user lost ~49% of what they paid. The Stripe top-up and
 * refund paths had the identical mismatch.
 *
 * A `null`/absent currency is treated as BGN, matching the column default and
 * `toEur`'s own convention, so a caller that genuinely holds storage units can
 * pass `null` and get an identity.
 *
 * FAIL-CLOSED on an out-of-domain currency: unlike `toEur` — which must keep
 * SERVING legacy rows and so returns them unconverted under their own label —
 * this is a WRITE-side helper, and there is no honest way to increment a BGN
 * ledger by a USD magnitude. There is no rate, so it throws
 * {@link UnsupportedCurrencyError} rather than silently crediting the wrong
 * number. Every caller sits behind a domain gate already, so this is a
 * defence-in-depth throw and not an expected path.
 */
export function toBgn(amount: number, currency: string | null | undefined): number {
  if (currency == null) return amount;
  const normalized = assertAcceptedCurrency(currency, 'toBgn (credit into a BGN-denominated column)');
  return normalized === 'EUR' ? eurToBgn(amount) : amount;
}

/**
 * Log an out-of-domain currency observed on a READ.
 *
 * After BC-QA-031-FOLLOWUP-1 no write path can create such a row, so anything
 * that reaches here is a LEGACY row persisted before the domain was narrowed
 * (or a row inserted straight into the database by hand). It is a real data
 * defect, not a routine event, so it is logged at error level — but it must
 * not throw: a single legacy row would otherwise take down an entire admin
 * grid or payment-history page.
 */
function reportLegacyCurrency(currency: string, where: string): void {
  logger.error(
    `[currency] Out-of-domain ${currency} row encountered in ${where}. ` +
      `Accepted currencies are ${ACCEPTED_CURRENCIES.join('/')}; this row predates ` +
      `BC-QA-031-FOLLOWUP-1's write-side narrowing and cannot be converted (no FX source). ` +
      `It is reported under its own currency label, never relabelled ${RESPONSE_CURRENCY}.`,
  );
}

/**
 * Convert ONE stored amount to EUR according to the currency it is stored in.
 *
 * The value domain of `Transaction.currency` is {@link ACCEPTED_CURRENCIES} —
 * BGN or EUR — and every write path enforces that (see the constant's own
 * docblock for the three enforcement layers). So:
 *   - BGN (and a `null`/absent currency, matching the `@default("BGN")`
 *     column default) is converted at the fixed currency-board rate;
 *   - EUR is already in the response unit and passes through untouched.
 *
 * LEGACY OUT-OF-DOMAIN ROWS. Rows written before the domain was narrowed may
 * still hold USD/GBP/PLN/CZK/RON. There is no FX source in this codebase, so
 * such an amount cannot be converted; it is returned at its raw magnitude and
 * logged at error level. It is the CALLER's responsibility never to pair that
 * magnitude with a hardcoded `'EUR'` label — use {@link toDisplayMoney} (or
 * {@link displayCurrency}) so the amount and its label always agree. That
 * pairing is exactly the defect BC-QA-031-FOLLOWUP-1 fixed: a 100.00 USD row
 * used to ship as `{ amount: 100, currency: 'EUR' }`, overstating a ~92 EUR
 * payment.
 */
export function toEur(amount: number, currency: string | null | undefined): number {
  if (currency == null) return bgnToEur(amount);
  const normalized = normalizeCurrency(currency);
  if (normalized === null) {
    reportLegacyCurrency(String(currency).toUpperCase(), 'toEur()');
    return amount;
  }
  return normalized === 'BGN' ? bgnToEur(amount) : amount;
}

/** Nullable-passthrough variant of {@link toEur} for optional money columns. */
export function toEurOrNull(
  amount: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  return amount == null ? null : toEur(amount, currency);
}

/**
 * The currency label that must accompany an amount produced by {@link toEur}.
 *
 * For every row inside the accepted domain this is `'EUR'` — a BGN row was
 * converted, a EUR row was already EUR. For a legacy out-of-domain row it is
 * that row's OWN currency code, because its amount was returned unconverted
 * and labelling it `'EUR'` would be a false statement about how much money the
 * row represents.
 *
 * Never write `currency: 'EUR'` next to a `toEur(...)` call; call this instead.
 */
export function displayCurrency(currency: string | null | undefined): string {
  if (currency == null) return RESPONSE_CURRENCY;
  return normalizeCurrency(currency) === null
    ? String(currency).trim().toUpperCase()
    : RESPONSE_CURRENCY;
}

/**
 * Convert an amount and derive its truthful label in one step.
 *
 * Preferred over calling {@link toEur} and {@link displayCurrency} separately:
 * the two can only disagree if a caller pairs one of them with a literal, and
 * returning them together removes that opportunity.
 */
export function toDisplayMoney(
  amount: number,
  currency: string | null | undefined,
): { amount: number; currency: string } {
  return { amount: toEur(amount, currency), currency: displayCurrency(currency) };
}

/**
 * A per-currency subtotal as Prisma's `groupBy(['currency'])` returns it.
 *
 * `count` is optional and only needed by callers that render a row count or an
 * average beside the total — see {@link foldMixedCurrencyToEur}.
 */
export interface CurrencySubtotal {
  currency: string | null;
  amount: number | null;
  count?: number | null;
}

/**
 * The full result of folding per-currency subtotals into one EUR figure.
 *
 * `total` is the EUR sum of everything that COULD be converted. The remaining
 * fields describe what could not, so a caller can keep its own derived figures
 * consistent with the total and tell a client that the picture is partial.
 */
export interface MixedCurrencyTotal {
  /** EUR total of the included subtotals. */
  total: number;
  /** Number of rows behind `total` (0 when no caller supplied counts). */
  includedCount: number;
  /** Number of rows dropped because their currency has no conversion rate. */
  excludedCount: number;
  /** The distinct currency codes that were dropped, upper-cased and sorted. */
  excludedCurrencies: string[];
}

/**
 * Fold a per-currency set of DB-side sums into a single EUR total, reporting
 * what had to be left out.
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
 * LEGACY OUT-OF-DOMAIN SUBTOTALS ARE EXCLUDED, not folded in. An aggregate is a
 * single scalar with no room for a per-currency label, so the honesty rule that
 * {@link displayCurrency} applies to a row cannot be applied to a total: the only
 * two options for, say, a USD subtotal are to add its raw magnitude to a EUR
 * figure (a number that is simply wrong — this is what BC-QA-031-FOLLOWUP-1
 * fixed) or to leave it out. Leaving it out keeps the returned figure a true EUR
 * total of the rows it can account for.
 *
 * WHY THE COUNTS COME BACK WITH IT (impl-r1 F4). Excluding rows from the total
 * while the count rendered NEXT to that total still includes them does not just
 * understate — it makes the admin screen contradict itself, and it corrupts any
 * figure derived by division. `adminTransactions`' `averageValue`,
 * `adminDashboard`'s `todayAvg` and `adminSubscriptions`' `paymentSummary` all
 * divide or pair this total with a count; each must use `includedCount`, not the
 * raw row count, or an operator sees "1 payment, EUR 0.00". Returning
 * `excludedCount`/`excludedCurrencies` also lets a response carry the fact that
 * something was dropped instead of leaving it only in a log line nobody reads.
 * No write path can produce such a subtotal any more, so in practice this only
 * affects databases that already contain pre-narrowing rows.
 */
export function foldMixedCurrencyToEur(groups: CurrencySubtotal[]): MixedCurrencyTotal {
  let total = 0;
  let includedCount = 0;
  let excludedCount = 0;
  const excludedCurrencies = new Set<string>();

  for (const group of groups) {
    const amount = group.amount ?? 0;
    const count = group.count ?? 0;

    if (group.currency != null && normalizeCurrency(group.currency) === null) {
      const code = String(group.currency).trim().toUpperCase();
      excludedCurrencies.add(code);
      excludedCount += count;
      logger.error(
        `[currency] Excluding ${amount} ${code} (${count} row(s)) from a ` +
          `${RESPONSE_CURRENCY} total: out-of-domain currency with no conversion rate ` +
          `(accepted: ${ACCEPTED_CURRENCIES.join('/')}). The total is understated by this ` +
          `subtotal rather than overstated by its unconverted magnitude.`,
      );
      continue;
    }

    total += toEur(amount, group.currency);
    includedCount += count;
  }

  return {
    total: r2(total),
    includedCount,
    excludedCount,
    excludedCurrencies: [...excludedCurrencies].sort(),
  };
}

/**
 * Scalar convenience wrapper over {@link foldMixedCurrencyToEur}.
 *
 * Use it only where NOTHING is rendered beside the total — no count, no
 * average, no per-row derivation. If a caller divides this number by anything,
 * or shows a row count next to it, it must call `foldMixedCurrencyToEur` and use
 * `includedCount` instead, or the two figures will disagree (impl-r1 F4).
 */
export function sumMixedCurrencyToEur(groups: CurrencySubtotal[]): number {
  return foldMixedCurrencyToEur(groups).total;
}
