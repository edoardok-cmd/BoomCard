import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
import { adminDashboardService } from '../../services/adminDashboard.service';
import { adminAlertsService } from '../../services/adminAlerts.service';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F2 (AX-161 fix-pinning).
 *
 * Round 4 reported that AdminDashboardPage rendered EUR scalars under a
 * hardcoded `лв.` suffix. The fix changed `fmtEur` at the top of the page to
 * `€${n.toFixed(2)}` and dropped the `лв. днес` / `BGN today` sub-labels — but
 * NOTHING asserted it. Round 5 reverted `fmtEur` straight back to the defect
 * and the entire 136-test partner-dashboard suite stayed green.
 *
 * These tests mount the real page against a mocked
 * GET /api/admin/dashboard payload and assert the rendered labels, so a
 * regression of `fmtEur` — or of any of the nine money renders that use it —
 * fails here. A formatter-level test cannot do this job: the page owns its own
 * money formatter, which is exactly how the gap arose.
 *
 * The backend contract these assertions encode: adminDashboard.routes.ts
 * converts every monetary field with bgnToEur()/sumMixedCurrencyToEur() before
 * responding, so each number below is EUR and must render with a € prefix and
 * no Lev/BGN marker anywhere on the page.
 */

vi.mock('../../services/adminDashboard.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminDashboard.service')>(
    '../../services/adminDashboard.service',
  );
  return {
    ...actual,
    adminDashboardService: { getStats: vi.fn(), getStatsWithMeta: vi.fn() },
  };
});

vi.mock('../../services/adminAlerts.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminAlerts.service')>(
    '../../services/adminAlerts.service',
  );
  return {
    ...actual,
    adminAlertsService: { getAlerts: vi.fn() },
  };
});

// The page reads `user` only for the greeting and the tile permission gate.
// `can()` defaults open when no user is loaded, so a null user renders every
// tile — which is what these assertions need.
vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/AuthContext')>(
    '../../contexts/AuthContext',
  );
  return { ...actual, useAuth: () => ({ user: null }) };
});

const STATS = {
  subscribers: { active: 10, newLast30Days: 2, expired: 1, paused: 0, failedPayment: 3 },
  // Distinct values so a mis-wired render can't accidentally satisfy another
  // field's assertion.
  transactions: { todayCount: 7, todayVolume: 111.11, todayAvg: 222.22, totalVolume: 333.33 },
  cashback: { accrued: 444.44, approved: 555.55, pending: 666.66, expiringSoon: 777.77 },
  partners: { active: 4, requests: 1, locations: 9 },
  finance: { payoutsDue: 888.88, payoutsDueCount: 5, partnerReceivables: 999.99, margin: 121.21 },
};

const renderPage = (language: 'en' | 'bg' = 'en') => {
  localStorage.setItem('boomcard_language', language);
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <AdminDashboardPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
};

const mockOk = () => {
  (adminDashboardService.getStatsWithMeta as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: STATS,
    generatedAt: '2026-08-20T10:30:00.000Z',
  });
  (adminAlertsService.getAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({
    critical: [],
    operational: [],
    informational: [],
    totalCount: 0,
    generatedAt: '2026-08-20T10:30:00.000Z',
  });
};

describe('AdminDashboardPage — EUR money labels (BC-QA-031 r5-F2 fix-pinning)', () => {
  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders all nine money values with a € prefix', async () => {
    mockOk();
    renderPage();

    // Transactions tile
    await waitFor(() => expect(screen.getByText('€111.11')).toBeInTheDocument());
    expect(screen.getByText('€222.22')).toBeInTheDocument();
    expect(screen.getByText('€333.33')).toBeInTheDocument();

    // Cashback tile
    expect(screen.getByText('€444.44')).toBeInTheDocument();
    expect(screen.getByText('€555.55')).toBeInTheDocument();
    expect(screen.getByText('€666.66')).toBeInTheDocument();
    expect(screen.getByText('€777.77')).toBeInTheDocument();

    // Finance tile
    expect(screen.getByText('€888.88')).toBeInTheDocument();
    expect(screen.getByText('€999.99')).toBeInTheDocument();
    expect(screen.getByText('€121.21')).toBeInTheDocument();
  });

  it('never renders a Lev or BGN marker anywhere on the page (English)', async () => {
    mockOk();
    const { container } = renderPage('en');

    await waitFor(() => expect(screen.getByText('€111.11')).toBeInTheDocument());

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/лв/);
    expect(text).not.toMatch(/\bBGN\b/);
    // The sub-label under "Transactions Today" is a bare "today" — it used to
    // read "BGN today", which is the other half of the round-4 fix.
    expect(screen.getByText('today')).toBeInTheDocument();
  });

  it('never renders a Lev or BGN marker anywhere on the page (Bulgarian)', async () => {
    mockOk();
    const { container } = renderPage('bg');

    await waitFor(() => expect(screen.getByText('€111.11')).toBeInTheDocument());

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/лв/);
    expect(text).not.toMatch(/\bBGN\b/);
    // Bulgarian sub-label is a bare "днес"; it used to read "лв. днес".
    expect(screen.getByText('днес')).toBeInTheDocument();
  });

  it('renders an em-dash rather than a currency-marked zero when a field is absent', async () => {
    (adminDashboardService.getStatsWithMeta as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );
    (adminAlertsService.getAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({
      critical: [],
      operational: [],
      informational: [],
      totalCount: 0,
      generatedAt: '',
    });

    const { container } = renderPage();

    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThan(0));
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/лв/);
    expect(text).not.toMatch(/\bBGN\b/);
    expect(text).not.toMatch(/€0\.00/);
  });
});
