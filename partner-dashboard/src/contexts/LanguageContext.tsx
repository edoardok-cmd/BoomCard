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
  // boomcard.bg and all other domains default to Bulgarian
  return 'bg';
};

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check localStorage first
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bg' || stored === 'en') {
      return stored;
    }

    // Detect from domain
    return getDefaultLanguageForDomain();
  });

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
