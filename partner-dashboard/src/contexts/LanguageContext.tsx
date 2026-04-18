import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language, getTranslation } from '../locales';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'boomcard_language';

interface LanguageProviderProps {
  children: ReactNode;
}

/**
 * Detect the default language based on the current domain.
 * - boomcard.bg → Bulgarian
 * - boomcard.eu → English
 */
const getDefaultLanguageForDomain = (): Language => {
  const hostname = window.location.hostname;
  if (hostname.endsWith('boomcard.eu') || hostname === 'boomcard.eu') {
    return 'en';
  }
  return 'bg';
};

const getLangFromUrl = (): Language | null => {
  const params = new URLSearchParams(window.location.search);
  const lang = params.get('lang');
  if (lang === 'en' || lang === 'bg') return lang;
  return null;
};

const stripLangParam = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.history.replaceState(null, '', url.toString());
};

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // ?lang= param wins (used by .eu → .bg redirect)
    const urlLang = getLangFromUrl();
    if (urlLang) {
      localStorage.setItem(STORAGE_KEY, urlLang);
      return urlLang;
    }

    // Then localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bg' || stored === 'en') {
      return stored;
    }

    // Fall back to domain detection
    return getDefaultLanguageForDomain();
  });

  // Strip ?lang= from URL after reading it (keep URLs clean)
  useEffect(() => {
    if (getLangFromUrl()) stripLangParam();
  }, []);

  // Persist to localStorage whenever language changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    // Update HTML lang attribute for accessibility
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState(prev => prev === 'en' ? 'bg' : 'en');
  };

  const t = (key: string): string => {
    return getTranslation(language, key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
