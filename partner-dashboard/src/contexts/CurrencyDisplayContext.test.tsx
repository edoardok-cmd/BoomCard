import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrencyDisplayProvider, useCurrencyDisplay } from './CurrencyDisplayContext';
import { apiService } from '../services/api.service';

// Regression test for BC-QA-031 task-r1 finding 3: this context used to poll
// the now-permanently-deleted GET /api/settings/currency-display-mode
// endpoint every 30s for the life of every authenticated session, and a 404
// from that dead endpoint was not special-cased to stop polling (only
// 401/403 were), so the leak ran forever. The fix retires the network call
// entirely — the context must never call the API, at mount or on any timer.

vi.mock('../services/api.service', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

function Consumer() {
  const { currencyDisplayMode, windowOpen, isLoading, error } = useCurrencyDisplay();
  return (
    <div>
      <span data-testid="mode">{currencyDisplayMode}</span>
      <span data-testid="window-open">{String(windowOpen)}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="error">{String(error)}</span>
    </div>
  );
}

describe('CurrencyDisplayContext (BC-QA-031 regression — dead-endpoint poll retired)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('never calls the API on mount', () => {
    render(
      <CurrencyDisplayProvider>
        <Consumer />
      </CurrencyDisplayProvider>,
    );
    expect(apiService.get).not.toHaveBeenCalled();
  });

  it('resolves synchronously to a fixed eur_only, non-loading, error-free value', () => {
    render(
      <CurrencyDisplayProvider>
        <Consumer />
      </CurrencyDisplayProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('eur_only');
    expect(screen.getByTestId('window-open').textContent).toBe('false');
    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('never polls the API, even after many multiples of the old 30s interval', () => {
    vi.useFakeTimers();
    render(
      <CurrencyDisplayProvider>
        <Consumer />
      </CurrencyDisplayProvider>,
    );
    // Old poll interval was 30s; advance far beyond it to prove no timer survives.
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(apiService.get).not.toHaveBeenCalled();
  });
});
