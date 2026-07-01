import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/api.service';
import { getAccessToken } from '../lib/auth/session';

interface CurrencyDisplayContextType {
  currencyDisplayMode: 'dual' | 'eur_only';
  windowOpen: boolean;
  isLoading: boolean;
  error: string | null;
}

const CurrencyDisplayContext = createContext<CurrencyDisplayContextType | undefined>(undefined);

interface CurrencyDisplayProviderProps {
  children: ReactNode;
}

const CACHE_KEY = 'boomcard_currency_display_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 30 * 1000; // poll more frequently so post-login fetch fires within 30s

interface CacheEntry {
  data: { currencyDisplayMode: 'dual' | 'eur_only'; windowOpen: boolean };
  timestamp: number;
}

export const CurrencyDisplayProvider: React.FC<CurrencyDisplayProviderProps> = ({ children }) => {
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState<'dual' | 'eur_only'>('eur_only');
  const [windowOpen, setWindowOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCurrencyDisplayMode = async () => {
      if (!getAccessToken()) {
        setError(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Check cache first
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const cacheEntry: CacheEntry = JSON.parse(cached);
          const now = Date.now();
          if (now - cacheEntry.timestamp < CACHE_TTL_MS) {
            setCurrencyDisplayMode(cacheEntry.data.currencyDisplayMode);
            setWindowOpen(cacheEntry.data.windowOpen);
            setIsLoading(false);
            return;
          }
        }

        // Fetch fresh data
        const json = await apiService.get<{ data?: { currencyDisplayMode?: 'dual' | 'eur_only'; windowOpen?: boolean } }>(
          '/admin/settings/currency-display-mode'
        );
        const data = json.data || {};

        // Update state
        setCurrencyDisplayMode(data.currencyDisplayMode || 'eur_only');
        setWindowOpen(data.windowOpen || false);

        // Cache the result
        const cacheEntry: CacheEntry = {
          data: {
            currencyDisplayMode: data.currencyDisplayMode || 'eur_only',
            windowOpen: data.windowOpen || false,
          },
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));

        setError(null);
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          // Not authenticated yet — silent no-op, keep defaults
          return;
        }
        console.error('Error fetching currency display mode:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Fall back to EUR-only on error
        setCurrencyDisplayMode('eur_only');
        setWindowOpen(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrencyDisplayMode();

    // Set up polling interval (optional, to sync changes across tabs)
    const pollInterval = setInterval(() => {
      fetchCurrencyDisplayMode();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <CurrencyDisplayContext.Provider value={{ currencyDisplayMode, windowOpen, isLoading, error }}>
      {children}
    </CurrencyDisplayContext.Provider>
  );
};

export const useCurrencyDisplay = (): CurrencyDisplayContextType => {
  const context = useContext(CurrencyDisplayContext);
  if (context === undefined) {
    throw new Error('useCurrencyDisplay must be used within a CurrencyDisplayProvider');
  }
  return context;
};

export default CurrencyDisplayContext;
