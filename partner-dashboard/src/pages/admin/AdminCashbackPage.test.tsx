import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminCashbackPage from './AdminCashbackPage';
import { adminCashbackService } from '../../services/adminCashback.service';
import { LanguageProvider } from '../../contexts/LanguageContext';

// Regression test for BC-QA-031 task-r1 finding 2: the backend's
// GET /api/admin/cashback/{stats,payout-thresholds,entries} responses changed
// from a dual-currency {bgn, eur, windowOpen} shape (with a top-level
// `display` envelope on /payout-thresholds) to plain EUR numbers, when the
// dual-currency display feature was retired. AdminCashbackPage must render
// the real values from that shape, not '—' placeholders, and the
// warning/danger stat-card highlighting must react to the plain numbers.

vi.mock('../../services/adminCashback.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminCashback.service')>(
    '../../services/adminCashback.service',
  );
  return {
    ...actual,
    adminCashbackService: {
      getStats: vi.fn(),
      getPayoutThresholds: vi.fn(),
      getEntries: vi.fn(),
    },
  };
});

const renderPage = () => {
  // Pin language to English so assertions don't depend on domain-based
  // language detection (LanguageProvider defaults to 'bg' outside boomcard.eu).
  localStorage.setItem('boomcard_language', 'en');
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>
          <AdminCashbackPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminCashbackPage — plain-number response shape (BC-QA-031 regression)', () => {
  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders stat cards, payout thresholds, and the entries amount column from plain EUR numbers', async () => {
    (adminCashbackService.getStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalAccrued: 120.5,
      totalCleared: 80,
      totalPending: 40.5,
      expiringTotal: 15,
      totalLocked: 25,
      totalPaid: 60,
      totalExpired: 5,
      totalVoided: 3,
    });
    (adminCashbackService.getPayoutThresholds as ReturnType<typeof vi.fn>).mockResolvedValue({
      BASIC: 10,
      PREMIUM_WEEKLY: 15,
      PREMIUM: 20,
      PREMIUM_MONTHLY: 20,
    });
    (adminCashbackService.getEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          amount: 12.34,
          status: 'Cleared',
          rawStatus: 'CLEARED',
          cashbackExpiresAt: null,
          daysUntilExpiry: null,
          description: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          voidedAt: null,
          voidedReason: null,
          receipt: null,
          partner: null,
          user: { id: 'user-1', email: 'subscriber@example.com', firstName: null, lastName: null },
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    });

    renderPage();

    // Stat cards must render the real number, not '—'.
    await waitFor(() => expect(screen.getByText('€120.50')).toBeInTheDocument());
    expect(screen.getByText('€80.00')).toBeInTheDocument();
    expect(screen.getByText('€40.50')).toBeInTheDocument();
    expect(screen.getByText('€15.00')).toBeInTheDocument();
    expect(screen.getByText('€25.00')).toBeInTheDocument();
    expect(screen.getByText('€60.00')).toBeInTheDocument();
    expect(screen.getByText('€5.00')).toBeInTheDocument();
    expect(screen.getByText('€3.00')).toBeInTheDocument();

    // Payout-threshold hint must read the real `data` keys, not a nonexistent `display` key
    // (which would leave every threshold value as undefined → '—').
    await waitFor(() => expect(screen.getByText(/Basic €10.00/)).toBeInTheDocument());
    expect(screen.getByText(/Premium wk. €15.00/)).toBeInTheDocument();
    expect(screen.getByText(/Premium mo. €20.00/)).toBeInTheDocument();

    // Entries table amount column must render the plain-number amount.
    await waitFor(() => expect(screen.getByText('€12.34')).toBeInTheDocument());
  });
});
