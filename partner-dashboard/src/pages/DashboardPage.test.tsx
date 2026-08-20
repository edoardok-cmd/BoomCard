import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './DashboardPage';
import { apiService } from '../services/api.service';
import { LanguageProvider } from '../contexts/LanguageContext';

// Regression test for BC-QA-031: GET /api/dashboard/me's `receipts[].totalAmount`
// / `receipts[].cashbackAmount` changed from a dual-currency {bgn, eur, windowOpen}
// wrapper object to a corrected, EUR-converted plain number when the dual-currency
// display feature was retired. DashboardPage (the primary post-login landing page
// for non-partner users) must render the plain-number shape without crashing.

vi.mock('../services/api.service', () => ({
  apiService: {
    get: vi.fn(),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'consumer@example.com', firstName: 'Ana', role: 'user', status: 'ACTIVE' },
  }),
}));

const dashboardMeResponse = {
  subscription: { plan: 'BASIC', status: 'ACTIVE' },
  wallet: { availableBalance: 42.5, pendingBalance: 7 },
  receipts: [
    {
      id: 'receipt-1',
      merchantName: 'Test Merchant',
      // Post-BC-QA-031 shape: plain EUR numbers, not {bgn, eur, windowOpen}.
      totalAmount: 25,
      cashbackAmount: 3.75,
      status: 'APPROVED',
      createdAt: '2026-01-05T00:00:00.000Z',
    },
  ],
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>
          <DashboardPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('DashboardPage — plain-number receipts shape (BC-QA-031 regression)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders receipts.cashbackAmount from /dashboard/me as a plain EUR number without crashing', async () => {
    (apiService.get as ReturnType<typeof vi.fn>).mockResolvedValue(dashboardMeResponse);

    renderPage();

    await waitFor(() => expect(screen.getByText('+€3.75')).toBeInTheDocument());
    expect(screen.getByText('Test Merchant')).toBeInTheDocument();
  });

  // BC-QA-031 F1: the dashboard used to run the retired `formatWithCurrency(x,
  // 'EUR_ONLY')` over these values, which divided them by BGN_TO_EUR_RATE
  // (1.95583). Against the backend's already-EUR scalars that rendered
  // availableBalance 42.50 as "€21.73" and pendingBalance 7.00 as "€3.58" —
  // roughly half of every money figure on the page. The wallet balances must be
  // rendered verbatim, with no client-side conversion.
  it('renders wallet balances verbatim in EUR, without a second BGN→EUR conversion', async () => {
    (apiService.get as ReturnType<typeof vi.fn>).mockResolvedValue(dashboardMeResponse);

    renderPage();

    // availableBalance: 42.5 → "€42.50" (the halved value would be "€21.73").
    await waitFor(() => expect(screen.getByText('€42.50')).toBeInTheDocument());
    expect(screen.queryByText('€21.73')).not.toBeInTheDocument();

    // pendingBalance: 7 → "€7.00" (the halved value would be "€3.58").
    expect(screen.getByText('€7.00')).toBeInTheDocument();
    expect(screen.queryByText('€3.58')).not.toBeInTheDocument();
  });
});
