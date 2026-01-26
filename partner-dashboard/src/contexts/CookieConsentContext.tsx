import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export interface CookiePreferences {
  essential: boolean;  // Always true - required for site functionality
  analytics: boolean;  // Google Analytics, usage tracking
  marketing: boolean;  // Marketing cookies (if applicable)
}

interface CookieConsentContextType {
  hasConsented: boolean;
  preferences: CookiePreferences;
  showBanner: boolean;
  showModal: boolean;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  savePreferences: (prefs: Partial<CookiePreferences>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  closeBanner: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined);

const STORAGE_KEY = 'boomcard_cookie_consent';

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
};

interface StoredConsent {
  hasConsented: boolean;
  preferences: CookiePreferences;
  timestamp: number;
}

interface CookieConsentProviderProps {
  children: ReactNode;
}

export const CookieConsentProvider: React.FC<CookieConsentProviderProps> = ({ children }) => {
  const [hasConsented, setHasConsented] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Load consent from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: StoredConsent = JSON.parse(stored);
        // Check if consent is still valid (e.g., not older than 1 year)
        const oneYear = 365 * 24 * 60 * 60 * 1000;
        if (Date.now() - parsed.timestamp < oneYear) {
          setHasConsented(parsed.hasConsented);
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed.preferences, essential: true });
          setShowBanner(false);
          return;
        }
      }
      // No valid consent found, show banner
      setShowBanner(true);
    } catch (error) {
      console.error('Error loading cookie consent:', error);
      setShowBanner(true);
    }
  }, []);

  // Save consent to localStorage
  const saveConsent = useCallback((consented: boolean, prefs: CookiePreferences) => {
    const data: StoredConsent = {
      hasConsented: consented,
      preferences: prefs,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setHasConsented(consented);
    setPreferences(prefs);
    setShowBanner(false);
    setShowModal(false);

    // Dispatch event for analytics to listen to
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { detail: prefs }));
  }, []);

  const acceptAll = useCallback(() => {
    saveConsent(true, {
      essential: true,
      analytics: true,
      marketing: true,
    });
  }, [saveConsent]);

  const rejectNonEssential = useCallback(() => {
    saveConsent(true, {
      essential: true,
      analytics: false,
      marketing: false,
    });
  }, [saveConsent]);

  const savePreferences = useCallback((prefs: Partial<CookiePreferences>) => {
    const newPrefs: CookiePreferences = {
      ...preferences,
      ...prefs,
      essential: true, // Essential is always true
    };
    saveConsent(true, newPrefs);
  }, [preferences, saveConsent]);

  const openSettings = useCallback(() => {
    setShowModal(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowModal(false);
  }, []);

  const closeBanner = useCallback(() => {
    setShowBanner(false);
  }, []);

  return (
    <CookieConsentContext.Provider
      value={{
        hasConsented,
        preferences,
        showBanner,
        showModal,
        acceptAll,
        rejectNonEssential,
        savePreferences,
        openSettings,
        closeSettings,
        closeBanner,
      }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
};

export const useCookieConsent = (): CookieConsentContextType => {
  const context = useContext(CookieConsentContext);
  if (context === undefined) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
};

// Helper function to get consent (for use outside React components)
export const getCookieConsent = (): CookiePreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: StoredConsent = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed.preferences, essential: true };
    }
  } catch (error) {
    console.error('Error reading cookie consent:', error);
  }
  return DEFAULT_PREFERENCES;
};

// Check if user has given analytics consent
export const hasAnalyticsConsent = (): boolean => {
  return getCookieConsent().analytics;
};

export default CookieConsentContext;
