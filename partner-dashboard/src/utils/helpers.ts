/*
 * BC-QA-031 r5-F7 — the last of the dual-currency display layer is gone.
 *
 * Removed here, in the same pass that stripped the dual BGN/EUR pricing render
 * from PricingPlans / PricingPublicPage / SubscriptionsPage / HomePage and
 * deleted the unreferenced PaymentButton:
 *
 *   - `BGN_TO_EUR_RATE`   (1.95583) — round 4 kept it alive solely for the two
 *                          converters below; it now has no non-test consumer.
 *   - `convertBGNToEUR()` — only caller was PricingPlans' hardcoded `priceBGN`
 *                          catalogue (now stored in EUR) and PaymentButton.
 *   - `convertEURToBGN()` — only callers were the three plan-price surfaces,
 *                          which now render the backend's EUR figure directly.
 *   - `formatCurrency(amount, currency = 'BGN')` — zero call sites repo-wide
 *                          (the three same-named identifiers in OfferCard,
 *                          BookingModal and DashboardPage are file-local
 *                          consts, not imports of this one). It carried the
 *                          same silent-BGN-default trap removed from
 *                          `useSystemFormat.formatAmount`, so it is deleted
 *                          rather than hardened: an unused export cannot be
 *                          pinned by a test, and keeping it only preserves the
 *                          trap for a future caller.
 *
 * Money now arrives from the backend already denominated in EUR; the frontend
 * formats it and never converts. `formatEUR` below is the whole surface.
 */

/**
 * Format an amount that is ALREADY denominated in EUR.
 *
 * BC-QA-031: the dual-currency (BGN alongside EUR) display feature was retired.
 * Every money-returning backend endpoint now emits plain EUR scalars, so the
 * frontend must format them as-is — it must NOT apply any BGN→EUR conversion.
 * This replaces `formatWithCurrency(x, 'EUR_ONLY')` and `formatMoneyByMode(x,
 * 'eur_only')`, both of which divided their already-EUR input by the fixed
 * BGN→EUR rate (1.95583) and therefore rendered roughly half of every figure.
 * That rate constant no longer exists anywhere in this package — see the header
 * comment above.
 *
 * Missing / non-finite input renders as an em-dash rather than "€NaN". Note
 * `null` and `undefined` are rejected explicitly: `Number(null)` is 0, so a
 * bare finite-check would render an ABSENT balance as a confident "€0.00".
 */
export const formatEUR = (amountEUR: number | null | undefined): string => {
  if (amountEUR === null || amountEUR === undefined) return '—';
  const safe = Number(amountEUR);
  if (!isFinite(safe)) return '—';
  return `€${safe.toFixed(2)}`;
};

export const formatDate = (date: Date | string): string => {
  return new Intl.DateTimeFormat('bg-BG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(date));
};

export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }
  return `${(meters / 1000).toFixed(1)} км`;
};

export const debounce = <T extends (...args: never[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export const generateQueryString = (params: Record<string, unknown>): string => {
  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return queryString ? `?${queryString}` : '';
};

// BC-QA-031: `formatMoneyByMode` (dual / eur_only) was removed along with the
// rest of the dual-currency display layer. Its four admin call sites all passed
// 'eur_only' against backend values that are already EUR, so they now use
// `formatEUR` above.