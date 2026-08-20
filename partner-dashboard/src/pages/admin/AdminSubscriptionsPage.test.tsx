import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSubscriptionsPage from './AdminSubscriptionsPage';
import { adminSubscriptionsService } from '../../services/adminSubscriptions.service';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1(e).
 *
 * adminSubscriptions.routes.ts:243 folds each subscription's per-currency
 * payment subtotals into `paymentTotalAmount` via sumMixedCurrencyToEur(), so
 * the export column is EUR. The CSV header read `Payments (total BGN)` — a
 * downstream accounting consumer keying on that header would have booked every
 * total at ~1.96x its real value.
 */

vi.mock('../../services/adminSubscriptions.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminSubscriptions.service')>(
    '../../services/adminSubscriptions.service',
  );
  return {
    ...actual,
    adminSubscriptionsService: {
      list: vi.fn(),
      exportAll: vi.fn(),
      cancel: vi.fn(),
      reactivate: vi.fn(),
      resume: vi.fn(),
      toggleAutoRenewal: vi.fn(),
      getUserHistory: vi.fn(),
    },
  };
});

const SUBSCRIPTION = {
  id: 'sub-1',
  plan: 'PREMIUM' as const,
  status: 'ACTIVE' as const,
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  autoRenewal: true,
  stripeSubscriptionId: null,
  payseraOrderId: 'PS-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  user: {
    id: 'user-1',
    email: 'ivan@example.com',
    firstName: 'Ivan',
    lastName: 'Ivanov',
    phone: '+359888123456',
    isTest: false,
  },
  userSubscriptionCount: 1,
  billingCycle: 'MONTHLY' as const,
  paymentCount: 4,
  paymentTotalAmount: 61.36,
  lastPaymentAt: '2026-08-01T00:00:00.000Z',
};

const renderPage = () => {
  localStorage.setItem('boomcard_language', 'en');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>
          <AdminSubscriptionsPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminSubscriptionsPage — EUR CSV payment total (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (adminSubscriptionsService.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptions: [SUBSCRIPTION],
      total: 1,
      page: 1,
      limit: 25,
    });
    (adminSubscriptionsService.exportAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptions: [SUBSCRIPTION],
      total: 1,
      truncated: false,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('labels the CSV payment-total column EUR, matching the value it carries', async () => {
    let csv = '';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          csv += parts.map((p) => String(p)).join('');
        }
      },
    );

    renderPage();
    await waitFor(() => expect(screen.getByText('ivan@example.com')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Export CSV'));

    await waitFor(() => expect(csv).toMatch(/Payments \(total/));
    expect(csv).toMatch(/Payments \(total EUR\)/);
    expect(csv).not.toMatch(/Payments \(total BGN\)/);
    expect(csv).toMatch(/61\.36/);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
