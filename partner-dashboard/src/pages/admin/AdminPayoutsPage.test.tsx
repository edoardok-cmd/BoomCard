import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminPayoutsPage from './AdminPayoutsPage';
import { adminPayoutsService } from '../../services/adminPayouts.service';
import { adminFinanceService } from '../../services/adminFinance.service';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1(a).
 *
 * adminPayouts.routes.ts:323–343 emits pendingTotal / processingTotal /
 * completedTotal / failedTotal through bgnToEur(). The page had TWO money
 * formatters — `fmtAmount` (converted to € in the round-4 fix pass) and a
 * leftover `fmtBgn = (n) => \`${n.toFixed(2)} BGN\`` two lines above it, which
 * still fed all four summary cards. An admin working the payout queue read
 * roughly half the real obligation under a BGN label.
 *
 * The page now has exactly one money formatter; these assertions pin both the
 * summary cards and the row amounts so a second one cannot creep back in
 * unnoticed.
 */

vi.mock('../../services/adminPayouts.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminPayouts.service')>(
    '../../services/adminPayouts.service',
  );
  return {
    ...actual,
    adminPayoutsService: {
      list: vi.fn(),
      approve: vi.fn(),
      bulkApprove: vi.fn(),
      reject: vi.fn(),
      complete: vi.fn(),
      hold: vi.fn(),
      release: vi.fn(),
      fail: vi.fn(),
      resetStuck: vi.fn(),
      exportPayouts: vi.fn(),
    },
  };
});

vi.mock('../../services/adminFinance.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminFinance.service')>(
    '../../services/adminFinance.service',
  );
  return {
    ...actual,
    adminFinanceService: { ...actual.adminFinanceService, getPayoutThresholds: vi.fn() },
  };
});

const PAYOUT = {
  id: 'payout-1',
  type: 'WITHDRAWAL',
  amount: -25.55,
  balanceBefore: 100.1,
  balanceAfter: 74.55,
  currency: 'EUR',
  status: 'PENDING' as const,
  description: null,
  createdAt: '2026-08-20T09:00:00.000Z',
  metadata: null,
  wallet: {
    id: 'wallet-1',
    availableBalance: 74.55,
    pendingBalance: 0,
    payoutIban: 'BG80BNBG96611020345678',
    payoutBeneficiaryName: 'Ivan Ivanov',
    user: {
      id: 'user-1',
      email: 'ivan@example.com',
      firstName: 'Ivan',
      lastName: 'Ivanov',
      phone: null,
      subscription: null,
    },
  },
};

// Distinct values so one card cannot satisfy another card's assertion.
const SUMMARY = {
  pendingCount: 3,
  pendingTotal: 111.11,
  processingCount: 2,
  processingTotal: 222.22,
  completedCount: 8,
  completedTotal: 333.33,
  riskHoldCount: 1,
  failedCount: 4,
  failedTotal: 444.44,
  totalCount: 18,
};

const renderPage = () => {
  localStorage.setItem('boomcard_language', 'bg');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>
          <AdminPayoutsPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminPayoutsPage — EUR summary totals (BC-QA-031 r5-F1)', () => {
  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders all four summary-card totals with a € prefix and no BGN label', async () => {
    (adminPayoutsService.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      payouts: [PAYOUT],
      total: 1,
      page: 1,
      limit: 25,
      summary: SUMMARY,
      filteredSummary: SUMMARY,
    });
    (adminFinanceService.getPayoutThresholds as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { BASIC: 20 },
    });

    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText(/€111\.11/)).toBeInTheDocument());
    expect(screen.getByText(/€222\.22/)).toBeInTheDocument();
    expect(screen.getByText(/€333\.33/)).toBeInTheDocument();
    expect(screen.getByText(/€444\.44/)).toBeInTheDocument();

    // The row amount, already € before this round — asserted so the single
    // remaining formatter stays pinned on both surfaces.
    expect(screen.getByText('€25.55')).toBeInTheDocument();

    expect(container.textContent).not.toMatch(/\bBGN\b/);
    expect(container.textContent).not.toMatch(/лв/);
  });
});
