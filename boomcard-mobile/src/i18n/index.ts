/**
 * i18n Configuration
 *
 * International configuration for the BoomCard app
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
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
      // Use 'en' as fallback if no language is saved
      callback(savedLanguage || 'en');
    } catch (error) {
      console.error('Error loading language:', error);
      callback('en');
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
    fallbackLng: 'en', // Use English as fallback
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
