/**
 * Format Utilities
 *
 * Formatting functions for currency, dates, numbers, etc.
 */

import { APP_CONFIG } from '../constants/config';

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = APP_CONFIG.CURRENCY): string {
  const formattedAmount = amount.toFixed(2);

  if (currency === 'BGN') {
    return `${formattedAmount} лв`;
  }

  if (currency === 'EUR') {
    return `€${formattedAmount}`;
  }

  return `${formattedAmount} ${currency}`;
}

/**
 * Format a plain EUR amount for display.
 *
 * All wallet/cashback/receipts amounts are sourced from backend endpoints
 * (`/wallet/balance`, `/wallet/statistics`, `/wallet/transactions`, receipts)
 * that return EUR-denominated plain numbers — dual BGN/EUR display was
 * retired app-wide. This replaces the old `formatDualCurrency()`, which
 * incorrectly treated its input as still-raw BGN (mislabeling it with a
 * `лв` suffix and dividing it a second time by `EUR_EXCHANGE_RATE`).
 */
export function formatEurAmount(amountEUR: number): string {
  return formatCurrency(amountEUR, 'EUR');
}

/**
 * Format date to locale string
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('bg-BG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date to short format
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('bg-BG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Format date with time
 */
export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('bg-BG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('bg-BG');
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
}
