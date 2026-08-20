import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminFinancePeriodsPage from './AdminFinancePeriodsPage';
import { adminFinanceService } from '../../services/adminFinance.service';

/**
 * BC-QA-031 impl-r5 F1(c).
 *
 * adminFinance.routes.ts:572 emits `periodsEur` — every period `total` run
 * through bgnToEur(). Both render sites on this page used
 * `Intl.NumberFormat('bg-BG', { style: 'currency', currency: 'BGN' })`, so an
 * already-converted figure carried a Lev label. One of the two is the
 * lifecycle-transition confirmation modal, i.e. the moment an admin commits to
 * locking or invoicing that exact obligation.
 */

vi.mock('../../services/adminFinance.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminFinance.service')>(
    '../../services/adminFinance.service',
  );
  return {
    ...actual,
    adminFinanceService: {
      getPeriods: vi.fn(),
      getReportingPeriods: vi.fn(),
      advanceReportingPeriod: vi.fn(),
      upsertReportingPeriod: vi.fn(),
      deleteReportingPeriod: vi.fn(),
      updatePeriodNotes: vi.fn(),
      exportPeriods: vi.fn(),
    },
  };
});

const PERIOD = {
  month: '2026-08',
  total: 1234.56,
  pending: 1,
  paid: 2,
  overdue: 0,
  count: 3,
  hasUnbilledScans: false,
};

const REPORTING_PERIOD = {
  id: 'rp-1',
  month: '2026-08',
  status: 'OPEN' as const,
  openedAt: '2026-08-01T00:00:00.000Z',
  openedBy: 'admin-1',
  openedByName: 'Admin One',
  reviewedAt: null,
  reviewedBy: null,
  reviewedByName: null,
  lockedAt: null,
  lockedBy: null,
  lockedByName: null,
  invoicedAt: null,
  invoicedBy: null,
  invoicedByName: null,
  notes: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminFinancePeriodsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const mockData = () => {
  (adminFinanceService.getPeriods as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [PERIOD],
    meta: { year: 2026 },
  });
  (adminFinanceService.getReportingPeriods as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [REPORTING_PERIOD],
  });
};

describe('AdminFinancePeriodsPage — EUR period totals (BC-QA-031 r5-F1)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders the period total in EUR, never Lev', async () => {
    mockData();
    const { container } = renderPage();

    // 'bg-BG' + EUR renders "1234,56 €" (with grouping + narrow no-break space).
    await waitFor(() => expect(container.textContent).toMatch(/1\s?234,56\s*€/));
    expect(container.textContent).not.toMatch(/лв/);
    expect(container.textContent).not.toMatch(/\bBGN\b/);
  });

  it('renders the lifecycle-transition confirmation amount in EUR', async () => {
    mockData();
    renderPage();

    await waitFor(() => expect(screen.getByText(/Август 2026|2026/)).toBeInTheDocument());

    // Advance OPEN → FOR_REVIEW; count > 0 so the button is enabled.
    fireEvent.click(await screen.findByText(/→ За проверка/));

    const heading = await screen.findByText(/Засяга/);
    const modalText = heading.textContent ?? '';
    expect(modalText).toMatch(/1\s?234,56\s*€/);
    expect(modalText).not.toMatch(/лв/);
    expect(modalText).not.toMatch(/\bBGN\b/);
  });
});
