/**
 * Spec §9.5 — system-wide number/date format settings consumed by all modules.
 *
 * number_format stored values map to Intl locales:
 *   '1 234,56'  → bg-BG  (space thousands, comma decimal — spec default)
 *   '1,234.56'  → en-US  (comma thousands, dot decimal)
 *
 * date_format stored values map to rendering strategies:
 *   'DD.MM.YYYY' → bg-BG  (e.g. 18.05.2026)
 *   'MM/DD/YYYY' → en-US  (e.g. 05/18/2026)
 *   'YYYY-MM-DD' → ISO slice (e.g. 2026-05-18)
 */

import { useQuery } from '@tanstack/react-query';
import { adminSettingsService } from '../services/adminSettings.service';

const NUMBER_FORMAT_TO_LOCALE: Record<string, string> = {
  '1 234,56': 'bg-BG',
  '1,234.56': 'en-US',
};

const DATE_FORMAT_TO_LOCALE: Record<string, string> = {
  'DD.MM.YYYY': 'bg-BG',
  'MM/DD/YYYY': 'en-US',
  'YYYY-MM-DD': 'iso',
};

const DEFAULT_NUMBER_FORMAT = '1 234,56';
const DEFAULT_DATE_FORMAT   = 'DD.MM.YYYY';

export function useSystemFormat() {
  const { data } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const numberFormat = data?.data?.number_format || DEFAULT_NUMBER_FORMAT;
  const dateFormat   = data?.data?.date_format   || DEFAULT_DATE_FORMAT;
  const numberLocale = NUMBER_FORMAT_TO_LOCALE[numberFormat] ?? 'bg-BG';
  const dateLocale   = DATE_FORMAT_TO_LOCALE[dateFormat]    ?? 'bg-BG';

  /**
   * Format a money value under an explicit ISO-4217 currency code.
   *
   * BC-QA-031: `currency` is REQUIRED and deliberately has no default. It used
   * to default to `'BGN'`, and that silent default is what made
   * `AdminSubscribersAllPage` stamp `лв.` onto wallet balances that
   * `adminSubscribers.routes.ts` had already converted to EUR — the call site
   * simply passed one argument and the mislabel was invisible at both the call
   * site and here. A default of `'EUR'` would have fixed today's two callers
   * while leaving the same trap armed for the next one (any genuinely
   * BGN-denominated value would then silently render as EUR). Requiring the
   * argument makes every money caller state its unit, and `tsc` — not a
   * reviewer tracing routes by hand — catches the ones that don't.
   *
   * This hook formats; it never converts. Pass the code the value is actually
   * denominated in, as returned by the backend endpoint that produced it.
   */
  function formatAmount(value: number, currency: string): string {
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(numberLocale, opts).format(value);
  }

  function formatDate(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    if (dateLocale === 'iso') return d.toISOString().slice(0, 10);
    return new Intl.DateTimeFormat(dateLocale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  return { formatAmount, formatNumber, formatDate, numberLocale, dateLocale, numberFormat, dateFormat };
}
