import React, { createContext, useContext, ReactNode } from 'react';

// BC-QA-031: the dual-currency display feature (and its backing endpoint,
// GET /api/settings/currency-display-mode) was removed from the backend —
// all amounts are EUR-only now, permanently. This context used to poll that
// endpoint every 30s for the life of every authenticated session; since the
// endpoint is gone for good (confirmed 404, not coming back), polling it at
// all was pure waste (an unbounded per-session network + console-error leak,
// BC-QA-031 task-r1 finding 3). Rather than special-case a 404 the way a
// transient error would be handled, the context now just resolves to a fixed
// eur_only value synchronously, with no network calls and no polling.
//
// Kept as a context (rather than deleted outright) so its four existing
// consumers (AdminTransactionsPage, AdminSubscriptionsPage,
// AdminSubscriberDetailPage, AdminPayoutsPage) don't need to change —
// they only read `currencyDisplayMode`, which now always resolves to
// 'eur_only', the same steady-state value the old fetch fell back to
// on error/completion anyway.
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

const FIXED_VALUE: CurrencyDisplayContextType = {
  currencyDisplayMode: 'eur_only',
  windowOpen: false,
  isLoading: false,
  error: null,
};

export const CurrencyDisplayProvider: React.FC<CurrencyDisplayProviderProps> = ({ children }) => {
  return (
    <CurrencyDisplayContext.Provider value={FIXED_VALUE}>
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
