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

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Check localStorage first
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'bg' || stored === 'en') {
      return stored;
    }

    // If no stored preference, detect from browser language
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('bg')) {
      return 'bg';
    } else if (browserLang.startsWith('en')) {
      return 'en';
    }

    // Default to Bulgarian for Bulgaria-focused app
    return 'bg';
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
