import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminFinanceReportsPage from './AdminFinanceReportsPage';
import { adminFinanceService } from '../../services/adminFinance.service';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1(c).
 *
 * Every money scalar this page renders is converted server-side before it
 * arrives: adminFinance.routes.ts runs bgnToEur() over the walletTransactions
 * per-type totals, the cashbackInvoices total/marginTotal/turnoverTotal, each
 * partnerBreakdown and planBreakdown row, and the payoutBreakdown per-status
 * totals. The page's single `fmt` helper used `currency: 'BGN'`, so all of them
 * rendered with a Lev label.
 */

vi.mock('../../services/adminFinance.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminFinance.service')>(
    '../../services/adminFinance.service',
  );
  return {
    ...actual,
    adminFinanceService: {
      getReports: vi.fn(),
      getReportPartners: vi.fn(),
      exportReports: vi.fn(),
      exportInvoices: vi.fn(),
      exportPayouts: vi.fn(),
    },
  };
});

vi.mock('../../services/adminAlerts.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminAlerts.service')>(
    '../../services/adminAlerts.service',
  );
  return { ...actual, adminAlertsService: { getAlerts: vi.fn().mockResolvedValue(null) } };
});

const REPORT = {
  period: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' },
  walletTransactions: {
    CASHBACK_CREDIT: { total: 111.11, count: 10 },
    WITHDRAWAL: { total: 222.22, count: 4 },
    TOP_UP: { total: 333.33, count: 6 },
  },
  cashbackInvoices: { total: 444.44, marginTotal: 555.55, turnoverTotal: 666.66, count: 3 },
  partnerBreakdown: [
    {
      partnerId: 'p-1',
      partnerName: 'Test Partner',
      partnerCity: 'Sofia',
      cashback: 777.77,
      margin: 888.88,
      turnover: 999.99,
      invoiceCount: 2,
      contractedRate: 5,
      ratesVary: false,
      statuses: { PENDING: 1, PAID: 1 },
    },
  ],
  periodStatuses: [],
  planBreakdown: [],
  payoutBreakdown: { byStatus: {}, total: 0, count: 0, filtered: false },
};

const renderPage = () => {
  localStorage.setItem('boomcard_language', 'bg');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>
          <AdminFinanceReportsPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminFinanceReportsPage — EUR report figures (BC-QA-031 r5-F1)', () => {
  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders wallet, invoice and partner-breakdown money in EUR, never Lev', async () => {
    (adminFinanceService.getReports as ReturnType<typeof vi.fn>).mockResolvedValue({ data: REPORT });
    (adminFinanceService.getReportPartners as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    const { container } = renderPage();

    // Wallet-transaction stat cards.
    await waitFor(() => expect(container.textContent).toMatch(/111,11\s*€/));
    expect(container.textContent).toMatch(/222,22\s*€/);
    expect(container.textContent).toMatch(/333,33\s*€/);

    // cashbackInvoices stat cards.
    expect(container.textContent).toMatch(/444,44\s*€/);
    expect(container.textContent).toMatch(/555,55\s*€/);
    expect(container.textContent).toMatch(/666,66\s*€/);

    // Per-partner breakdown row.
    expect(container.textContent).toMatch(/777,77\s*€/);
    expect(container.textContent).toMatch(/888,88\s*€/);
    expect(container.textContent).toMatch(/999,99\s*€/);

    expect(container.textContent).not.toMatch(/лв/);
    expect(container.textContent).not.toMatch(/\bBGN\b/);
  });
});
