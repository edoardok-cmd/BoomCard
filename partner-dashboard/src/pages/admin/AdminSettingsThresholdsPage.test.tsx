import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSettingsThresholdsPage from './AdminSettingsThresholdsPage';
import { adminSettingsService } from '../../services/adminSettings.service';

/**
 * BC-QA-031 — the payout-threshold page is EUR on every surface.
 *
 * HISTORY, because an earlier revision of this header asserted the opposite and
 * the correction is the point of these cases:
 *
 * Round 5 fixed only the read-only history list (`{row.minAmount} лв.` → `€`)
 * and this header recorded that the EDITOR was deliberately left `лв.`, because
 * PUT /payout-thresholds then stored the submitted number verbatim into a BGN
 * column while the GET seeding it returned EUR. It also said that "if the
 * backend PUT is later made EUR-aware, the editor label and SEED_DEFAULTS must
 * change together". Round 6 made the PUT EUR-aware (`eurToBgn()`) and moved
 * SEED_DEFAULTS to EUR — and the label did not follow, so the page rendered a
 * EUR figure beside `лв.` while showing the same quantity as `€20` in the
 * history list below it.
 *
 * The whole surface is now EUR: GET converts out with bgnToEur(), PUT converts
 * in with eurToBgn(), storage stays BGN, and the admin sees € on the input, the
 * subtitle, both low-threshold warnings and the history row. These cases pin
 * every one of those labels so the next revert goes red rather than shipping.
 */

vi.mock('../../services/adminSettings.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/adminSettings.service')>(
    '../../services/adminSettings.service',
  );
  return {
    ...actual,
    adminSettingsService: {
      getPayoutThresholds: vi.fn(),
      getPayoutThresholdsHistory: vi.fn(),
      savePayoutThresholds: vi.fn(),
    },
  };
});

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminSettingsThresholdsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AdminSettingsThresholdsPage — EUR labels across the whole page (BC-QA-031)', () => {
  beforeEach(() => {
    (adminSettingsService.getPayoutThresholds as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        // Real SubscriptionPlan enum keys. The retired BASIC/PREMIUM/LIGHT
        // triple this fixture used to return matched nothing the page reads, so
        // every input silently fell back to SEED_DEFAULTS and the corrected
        // seeding path was never exercised.
        BASIC: { minAmount: 20, notes: null, updatedAt: null },
        PREMIUM_MONTHLY: { minAmount: 15, notes: null, updatedAt: null },
        PREMIUM_WEEKLY: { minAmount: 10, notes: null, updatedAt: null },
      },
    });
    (adminSettingsService.getPayoutThresholdsHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'h-1',
          plan: 'BASIC',
          minAmount: 20,
          notes: 'raised',
          createdAt: '2026-08-01T00:00:00.000Z',
          createdByName: 'Admin One',
          createdByEmail: null,
        },
      ],
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders the history amount with a € prefix, not a лв. suffix', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('€20')).toBeInTheDocument());
    // The history row must not carry the old Lev suffix.
    expect(screen.queryByText('20 лв.')).not.toBeInTheDocument();
  });

  it('labels the threshold EDITOR input € — the field is EUR on both legs', async () => {
    renderPage();

    // One <Currency> element per plan row sits beside each editor input.
    await waitFor(() => expect(screen.getAllByText('€').length).toBeGreaterThanOrEqual(3));
    // The label that shipped beside a EUR value for a whole round.
    expect(screen.queryByText('лв.')).not.toBeInTheDocument();
  });

  it('states the page subtitle unit as €, not лв.', async () => {
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/Минимален изчистен кешбек баланс \(€\)/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Минимален изчистен кешбек баланс \(лв\.\)/),
    ).not.toBeInTheDocument();
  });

  it('seeds each input from the API response rather than falling back to SEED_DEFAULTS', async () => {
    // The fixture returns 20 / 15 / 10 under the REAL enum keys. Before the key
    // fix the page read BASIC|PREMIUM|LIGHT, so PREMIUM_MONTHLY/PREMIUM_WEEKLY
    // resolved undefined and both inputs fell back to SEED_DEFAULTS instead.
    renderPage();

    await waitFor(() => {
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      const values = inputs.map((i) => i.value).sort();
      expect(values).toEqual(['10', '15', '20']);
    });
  });

  it('renders the low-threshold warning in €, matching the unit LOW_THRESHOLD_FLOOR compares', async () => {
    (adminSettingsService.getPayoutThresholds as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        BASIC: { minAmount: 1, notes: null, updatedAt: null },
        PREMIUM_MONTHLY: { minAmount: 15, notes: null, updatedAt: null },
        PREMIUM_WEEKLY: { minAmount: 10, notes: null, updatedAt: null },
      },
    });

    renderPage();

    // BASIC at 1 is under the floor of 5, so the WarnBox renders.
    await waitFor(() => expect(screen.getByText(/препоръчителния минимум/)).toBeInTheDocument());
    expect(screen.getByText(/от 5 €/)).toBeInTheDocument();
    expect(screen.queryByText(/от 5 лв\./)).not.toBeInTheDocument();
  });
});
