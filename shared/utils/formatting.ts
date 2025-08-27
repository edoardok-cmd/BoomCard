import { format, formatDistance, formatRelative } from 'date-fns';
import { bg } from 'date-fns/locale';

export const formatters = {
  currency: (amount: number, currency: string = 'BGN'): string => {
    return new Intl.NumberFormat('bg-BG', {
      style: 'currency',
      currency,
    }).format(amount);
  },

  percentage: (value: number, decimals: number = 0): string => {
    return `${value.toFixed(decimals)}%`;
  },

  date: {
    short: (date: Date | string): string => {
      return format(new Date(date), 'dd.MM.yyyy', { locale: bg });
    },

    long: (date: Date | string): string => {
      return format(new Date(date), 'dd MMMM yyyy', { locale: bg });
    },

    time: (date: Date | string): string => {
      return format(new Date(date), 'HH:mm', { locale: bg });
    },

    datetime: (date: Date | string): string => {
      return format(new Date(date), 'dd.MM.yyyy HH:mm', { locale: bg });
    },

    relative: (date: Date | string): string => {
      return formatRelative(new Date(date), new Date(), { locale: bg });
    },

    distance: (date: Date | string): string => {
      return formatDistance(new Date(date), new Date(), { 
        addSuffix: true,
        locale: bg 
      });
    },
  },

  number: {
    compact: (num: number): string => {
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
      }
      if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
      }
      return num.toString();
    },

    ordinal: (num: number): string => {
      // Bulgarian ordinals
      return `${num}-ти`;
    },
  },

  phone: (phone: string): string => {
    // Format Bulgarian phone numbers
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('359')) {
      return `+359 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
    }
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  },

  fileSize: (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  },
};