import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceiptsPage } from './ReceiptsPage';
import { apiService } from '../services/api.service';
import { receiptsApiService } from '../services/receipts-api.service';
import { LanguageProvider } from '../contexts/LanguageContext';

// Regression test for BC-QA-031: the backend's GET /api/wallet/statistics
// response for availableBalance/pendingBalance changed from a dual-currency
// {bgn, eur, windowOpen} object to a plain EUR number when the dual-currency
// display feature was retired. ReceiptsPage (aliased as CashbackPage, the
// live /receipts and /cashback route) must render the plain-number shape
// without throwing.

vi.mock('../services/api.service', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

vi.mock('../services/receipts-api.service', () => ({
  receiptsApiService: {
    getReceipts: vi.fn(),
  },
}));

const emptyReceiptsResponse = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <ReceiptsPage />
      </LanguageProvider>
    </MemoryRouter>,
  );

describe('ReceiptsPage — cashback summary (BC-QA-031 regression)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders plain-number availableBalance/pendingBalance from /wallet/statistics without crashing', async () => {
    (apiService.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/wallet/statistics') {
        // Post-BC-QA-031 shape: plain EUR numbers, not {bgn, eur, windowOpen}.
        return Promise.resolve({ availableBalance: 42.5, pendingBalance: 7 });
      }
      return Promise.resolve({});
    });
    (receiptsApiService.getReceipts as ReturnType<typeof vi.fn>).mockResolvedValue(
      emptyReceiptsResponse,
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('€42.50')).toBeInTheDocument());
    expect(screen.getByText('€7.00')).toBeInTheDocument();
  });

  it('falls back to €0.00 for both balances when the fetch fails', async () => {
    (apiService.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    (receiptsApiService.getReceipts as ReturnType<typeof vi.fn>).mockResolvedValue(
      emptyReceiptsResponse,
    );

    renderPage();

    await waitFor(() => expect(screen.getAllByText('€0.00')).toHaveLength(2));
  });
});
