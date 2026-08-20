import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminFinanceInvoicesPage from './AdminFinanceInvoicesPage';
import { adminFinanceService } from '../../services/adminFinance.service';
import { adminCashbackService } from '../../services/adminCashback.service';

/**
 * BC-QA-031 impl-r5 F1 — the admin finance surface rendered this task's new EUR
 * scalars under hardcoded `лв.` / `currency: 'BGN'` labels.
 *
 * The sharpest case is the cashback mark-paid confirmation modal: an admin
 * opens it for a partner owed 42.50 BGN, sees the EUR figure the backend
 * converted (21.73) labelled "лв.", and transfers 21.73 BGN — 51% of the
 * obligation, with the receipt trail agreeing with itself.
 *
 * Backend contract encoded here:
 *   - adminCashback.routes.ts:  `totalOwed: bgnToEur(entry.totalOwed)`
 *   - adminFinance.routes.ts `toEurInvoice()`: totalCashbackOwed /
 *     turnoverAmount / marginAmount all through bgnToEur()
 *
 * These are render-level assertions on purpose: the page owns its own money
 * formatter, so a formatter-level test would not have caught the original
 * defect.
 */

vi.mock('../../services/adminFinance.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminFinance.service')>(
    '../../services/adminFinance.service',
  );
  return {
    ...actual,
    adminFinanceService: {
      listInvoices: vi.fn(),
      markInvoicePaid: vi.fn(),
      markInvoiceOverdue: vi.fn(),
      markInvoicePending: vi.fn(),
      updateInvoiceNotes: vi.fn(),
      generateInvoices: vi.fn(),
      exportInvoices: vi.fn(),
      exportCashbackSummary: vi.fn(),
    },
  };
});

vi.mock('../../services/adminCashback.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminCashback.service')>(
    '../../services/adminCashback.service',
  );
  return {
    ...actual,
    adminCashbackService: {
      getSummary: vi.fn(),
      markPaid: vi.fn(),
      sendReminder: vi.fn(),
    },
  };
});

// 42.50 BGN is 21.73 EUR at the fixed 1.95583 rate — the exact figure from the
// round-5 failure scenario.
const CB_ENTRY = {
  partnerId: 'partner-1',
  partnerName: 'Test Partner',
  partnerEmail: 'partner@example.com',
  month: '2026-08',
  receiptCount: 12,
  totalOwed: 21.73,
  paymentStatus: 'PENDING' as const,
  paidAt: null,
  notes: null,
};

const INVOICE = {
  id: 'inv-1',
  partnerId: 'partner-1',
  month: '2026-08',
  turnoverAmount: 511.29,
  contractedRate: 5,
  totalCashbackOwed: 21.73,
  marginAmount: 5.11,
  status: 'PENDING' as const,
  paidAt: null,
  paidBy: null,
  notes: null,
  invoiceNumber: 'INV-2026-0001',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  reportingPeriodStatus: 'OPEN' as const,
  partner: {
    id: 'partner-1',
    businessName: 'Test Partner',
    status: 'ACTIVE',
    city: 'Sofia',
    partnerType: null,
  },
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminFinanceInvoicesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const mockData = () => {
  (adminFinanceService.listInvoices as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [INVOICE],
    meta: { total: 1, page: 1, limit: 25, pages: 1 },
  });
  (adminCashbackService.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue([CB_ENTRY]);
};

describe('AdminFinanceInvoicesPage — EUR money labels (BC-QA-031 r5-F1)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders invoice money columns in EUR, never Lev', async () => {
    mockData();
    const { container } = renderPage();

    // Intl 'bg-BG' + EUR renders as "21,73 €" (narrow no-break space before the
    // symbol), so assert on the symbol + digits rather than an exact string.
    await waitFor(() => expect(container.textContent).toMatch(/21,73\s*€/));
    expect(container.textContent).toMatch(/511,29\s*€/);
    expect(container.textContent).not.toMatch(/лв/);
    expect(container.textContent).not.toMatch(/\bBGN\b/);
    // The Lev symbol Intl would have emitted under currency:'BGN'.
    expect(container.textContent).not.toMatch(/лв\./);
  });

  it('renders the cashback summary "Дължимо" column in EUR', async () => {
    mockData();
    const { container } = renderPage();

    fireEvent.click(await screen.findByText('Кешбек по партньор'));

    await waitFor(() => expect(screen.getByText('Test Partner')).toBeInTheDocument());
    expect(container.textContent).toMatch(/21,73\s*€/);
    expect(container.textContent).not.toMatch(/лв/);
  });

  it('shows the mark-paid confirmation amount in EUR — the figure the admin transfers', async () => {
    mockData();
    renderPage();

    fireEvent.click(await screen.findByText('Кешбек по партньор'));
    await waitFor(() => expect(screen.getByText('Test Partner')).toBeInTheDocument());

    // Open the row action menu, then the mark-paid action.
    fireEvent.click(screen.getByText('···'));
    fireEvent.click(await screen.findByText('Маркирай като платено'));

    const modalTitle = await screen.findByText('Маркирай кешбек като платен');
    // The whole modal, not just the amount node — a stray "лв." anywhere in the
    // confirmation is the defect.
    const modal = modalTitle.closest('div')!.parentElement!;
    expect(modal.textContent).toMatch(/21,73\s*€/);
    expect(modal.textContent).not.toMatch(/лв/);
    expect(modal.textContent).not.toMatch(/\bBGN\b/);
  });
});
