/**
 * i18n Configuration
 *
 * International configuration for the BoomCard app
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from '../utils/secureStore';
import { APP_CONFIG, STORAGE_KEYS } from '../constants/config';

// Import translations
import bg from '../locales/bg.json';
import en from '../locales/en.json';

// Language resources
const resources = {
  bg: { translation: bg },
  en: { translation: en },
};

// Custom language detector plugin for expo-secure-store
const languageDetector = {
  type: 'languageDetector' as const,
  async: true,
  detect: async (callback: (lng: string) => void) => {
    try {
      const savedLanguage = await SecureStore.getItemAsync(STORAGE_KEYS.LANGUAGE);
      // N8/A5 — spec §18.3 mandates Bulgarian as the default for a fresh install.
      callback(savedLanguage || APP_CONFIG.DEFAULT_LANGUAGE);
    } catch (error) {
      console.error('Error loading language:', error);
      callback(APP_CONFIG.DEFAULT_LANGUAGE);
    }
  },
  init: () => {},
  cacheUserLanguage: async (lng: string) => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, lng);
    } catch (error) {
      console.error('Error saving language:', error);
    }
  },
};

// Initialize i18n
i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: APP_CONFIG.DEFAULT_LANGUAGE, // N8/A5 — Bulgarian per spec §18.3
    compatibilityJSON: 'v4',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;

/**
 * Change the app language
 */
export const changeLanguage = async (language: string) => {
  try {
    await i18n.changeLanguage(language);
    await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE, language);
    // A8 — keep the backend preferredLanguage in sync so transactional emails
    // honour the in-app language. Best-effort: pre-auth (first-run) calls have no
    // token and simply 401, which we swallow. Lazy import avoids a cycle.
    try {
      const AuthApi = (await import('../api/auth.api')).default;
      const isAuthed = await AuthApi.isAuthenticated();
      if (isAuthed) {
        AuthApi.updateProfile({ preferredLanguage: language } as any).catch(() => {});
      }
    } catch {
      /* swallow — language already applied locally */
    }
  } catch (error) {
    console.error('Error changing language:', error);
  }
};

/**
 * Get the current language
 */
export const getCurrentLanguage = (): string => {
  return i18n.language || APP_CONFIG.DEFAULT_LANGUAGE;
};
