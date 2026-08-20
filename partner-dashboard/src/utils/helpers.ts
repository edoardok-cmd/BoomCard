// Official Bulgarian Lev to Euro exchange rate (fixed rate for eurozone entry)
export const BGN_TO_EUR_RATE = 1.95583;

export const formatCurrency = (amount: number, currency: string = 'BGN'): string => {
  return new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency
  }).format(amount);
};

// Convert BGN to EUR
export const convertBGNToEUR = (amountBGN: number): number => {
  return Math.round((amountBGN / BGN_TO_EUR_RATE) * 100) / 100;
};

// Convert EUR to BGN
export const convertEURToBGN = (amountEUR: number): number => {
  return Math.round(amountEUR * BGN_TO_EUR_RATE * 100) / 100;
};

/**
 * Format an amount that is ALREADY denominated in EUR.
 *
 * BC-QA-031: the dual-currency (BGN alongside EUR) display feature was retired.
 * Every money-returning backend endpoint now emits plain EUR scalars, so the
 * frontend must format them as-is — it must NOT apply any BGN→EUR conversion.
 * This replaces `formatWithCurrency(x, 'EUR_ONLY')` and `formatMoneyByMode(x,
 * 'eur_only')`, both of which divided their already-EUR input by
 * `BGN_TO_EUR_RATE` and therefore rendered roughly half of every figure.
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