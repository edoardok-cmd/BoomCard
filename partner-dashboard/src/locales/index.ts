import { en } from './en';
import { bg } from './bg';

export type Language = 'en' | 'bg';

export const translations = {
  en,
  bg,
};

// Helper function to get nested translation value
export function getTranslation(
  language: Language,
  key: string
): string {
  const keys = key.split('.');
  let value: unknown = translations[language];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
}

export { en, bg };
