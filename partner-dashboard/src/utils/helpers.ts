// Official Bulgarian Lev to Euro exchange rate (fixed)
export const BGN_TO_EUR_RATE = 1.95583;

export const formatCurrency = (amount: number, currency: string = 'BGN'): string => {
  return new Intl.NumberFormat('bg-BG', {
    style: 'currency',
    currency
  }).format(amount);
};

// Convert BGN to EUR
export const convertBGNToEUR = (amountBGN: number): number => {
  return Math.round(amountBGN / BGN_TO_EUR_RATE);
};

// Format amount in dual currency (BGN / EUR)
export const formatDualCurrency = (
  amountBGN: number,
  language: 'en' | 'bg' = 'en',
  compact: boolean = false
): string => {
  const amountEUR = convertBGNToEUR(amountBGN);

  if (language === 'bg') {
    if (compact) {
      return `${amountBGN} лв. / €${amountEUR}`;
    }
    return `${amountBGN} лв. / €${amountEUR} EUR`;
  } else {
    if (compact) {
      return `${amountBGN} BGN / €${amountEUR}`;
    }
    return `${amountBGN} BGN / €${amountEUR} EUR`;
  }
};

// Format dual currency with custom separators (for flexibility)
export const formatDualCurrencyCustom = (
  amountBGN: number,
  options: {
    language?: 'en' | 'bg';
    separator?: string;
    showEURLabel?: boolean;
    showBGNLabel?: boolean;
  } = {}
): { bgn: string; eur: string; formatted: string } => {
  const {
    language = 'en',
    separator = ' / ',
    showEURLabel = true,
    showBGNLabel = true
  } = options;

  const amountEUR = convertBGNToEUR(amountBGN);
  const bgnLabel = language === 'bg' ? 'лв.' : 'BGN';
  const eurLabel = 'EUR';

  const bgnText = showBGNLabel ? `${amountBGN} ${bgnLabel}` : `${amountBGN}`;
  const eurText = showEURLabel ? `€${amountEUR} ${eurLabel}` : `€${amountEUR}`;

  return {
    bgn: bgnText,
    eur: eurText,
    formatted: `${bgnText}${separator}${eurText}`
  };
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

export const debounce = <T extends (...args: any[]) => any>(
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

export const generateQueryString = (params: Record<string, any>): string => {
  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  return queryString ? `?${queryString}` : '';
};