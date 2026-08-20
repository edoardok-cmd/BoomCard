import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSubscribersAllPage from './AdminSubscribersAllPage';
import { adminSubscribersService } from '../../services/adminSubscribers.service';
import { adminDashboardService } from '../../services/adminDashboard.service';
import { adminSettingsService } from '../../services/adminSettings.service';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1(d).
 *
 * adminSubscribers.routes.ts:307–318 converts every stored wallet balance with
 * bgnToEur() before responding. The page rendered those EUR scalars through
 * `useSystemFormat().formatAmount(value)` — a one-argument call against a
 * signature that defaulted `currency` to `'BGN'` — so Intl stamped `лв.` onto
 * the primary admin subscriber list. Its CSV export carried
 * `Available cashback (BGN)` / `Pending cashback (BGN)` headers over the same
 * EUR values.
 *
 * `formatAmount`'s `currency` parameter is now required with no default, so
 * this class of mislabel is a compile error rather than a silent one; these
 * tests pin the two rendered surfaces (list cell + CSV header) that the type
 * change cannot pin on its own.
 */

vi.mock('../../services/adminSubscribers.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminSubscribers.service')>(
    '../../services/adminSubscribers.service',
  );
  return {
    ...actual,
    adminSubscribersService: {
      list: vi.fn(),
      exportAll: vi.fn(),
      getSubscriber: vi.fn(),
      getTransactions: vi.fn(),
      refundPreview: vi.fn(),
      refund: vi.fn(),
      cancelSubscription: vi.fn(),
      changePlan: vi.fn(),
      suspendSubscriber: vi.fn(),
      forceLogout: vi.fn(),
      deleteAccount: vi.fn(),
      restoreAccount: vi.fn(),
    },
  };
});

vi.mock('../../services/adminDashboard.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminDashboard.service')>(
    '../../services/adminDashboard.service',
  );
  return { ...actual, adminDashboardService: { getStats: vi.fn(), getStatsWithMeta: vi.fn() } };
});

vi.mock('../../services/adminSettings.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminSettings.service')>(
    '../../services/adminSettings.service',
  );
  return {
    ...actual,
    adminSettingsService: {
      ...actual.adminSettingsService,
      // useSystemFormat reads this; resolved per-test in beforeEach so
      // vi.resetAllMocks() between cases can't leave it undefined.
      getSystemSettings: vi.fn(),
    },
  };
});

const SUBSCRIBER = {
  id: 'user-1',
  firstName: 'Ivan',
  lastName: 'Ivanov',
  email: 'ivan@example.com',
  phone: '+359888123456',
  status: 'ACTIVE' as const,
  deletedAt: null,
  riskScore: 12,
  riskBucket: 'LOW' as const,
  lastLoginAt: '2026-08-19T10:00:00.000Z',
  lastActivityAt: '2026-08-19T10:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  wallet: { id: 'w-1', balance: 90.12, availableBalance: 71.23, pendingBalance: 18.89 },
  subscription: null,
};

const renderPage = () => {
  localStorage.setItem('boomcard_language', 'en');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>
          <AdminSubscribersAllPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminSubscribersAllPage — EUR wallet balances (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (adminSubscribersService.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscribers: [SUBSCRIBER],
      total: 1,
      page: 1,
      limit: 20,
    });
    (adminDashboardService.getStats as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (adminDashboardService.getStatsWithMeta as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (adminSettingsService.getSystemSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { number_format: '1 234,56', date_format: 'DD.MM.YYYY' },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders the wallet cashback cell in EUR, never Lev', async () => {
    const { container } = renderPage();

    await waitFor(() => expect(screen.getByText('ivan@example.com')).toBeInTheDocument());

    // bg-BG number locale + EUR renders "71,23 €".
    await waitFor(() => expect(container.textContent).toMatch(/71,23\s*€/));
    expect(container.textContent).toMatch(/18,89\s*€/);
    expect(container.textContent).not.toMatch(/лв/);
  });

  it('labels the CSV cashback columns EUR, matching the values they carry', async () => {
    (adminSubscribersService.exportAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscribers: [SUBSCRIBER],
    });

    // Capture the generated CSV instead of downloading it.
    let csv = '';
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(((blob: Blob) => {
        // Blob#text() is async; read the parts synchronously via the constructor
        // spy below instead. Keep a stable URL so the anchor click is harmless.
        void blob;
        return 'blob:mock';
      }) as unknown as typeof URL.createObjectURL);
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

    fireEvent.click(screen.getByText('↓ Export CSV'));

    await waitFor(() => expect(csv).toMatch(/Available cashback/));
    expect(csv).toMatch(/Available cashback \(EUR\)/);
    expect(csv).toMatch(/Pending cashback \(EUR\)/);
    expect(csv).not.toMatch(/cashback \(BGN\)/);
    // The values under those headers are the EUR scalars the backend converted.
    expect(csv).toMatch(/71\.23/);
    expect(csv).toMatch(/18\.89/);

    vi.unstubAllGlobals();
    createObjectURL.mockRestore();
  });
});
