import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSettingsThresholdsPage from './AdminSettingsThresholdsPage';
import { adminSettingsService } from '../../services/adminSettings.service';

/**
 * BC-QA-031 impl-r5 F1 (found by the enumeration sweep, beyond the reviewer's
 * listed sites).
 *
 * GET /api/admin/settings/payout-thresholds/history runs each stored
 * `minAmount` through bgnToEur() (adminSettings.routes.ts:106–116), so every
 * history row is EUR; it was rendered as `{row.minAmount} лв.`.
 *
 * IMPORTANT — this test deliberately covers ONLY the read-only history list.
 * The threshold EDITOR on the same page is still labelled `лв.` because its
 * write path (PUT /payout-thresholds) stores the submitted number verbatim into
 * a BGN column while the GET it is seeded from returns EUR. That asymmetry is a
 * backend defect reported alongside this fix; relabelling the editor would move
 * the lie from the read side to the write side rather than fix it. If the
 * backend PUT is later made EUR-aware, the editor label and SEED_DEFAULTS must
 * change together and this comment should go with them.
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

describe('AdminSettingsThresholdsPage — EUR threshold history (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (adminSettingsService.getPayoutThresholds as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        BASIC: { minAmount: 20, notes: null, updatedAt: null },
        PREMIUM: { minAmount: 15, notes: null, updatedAt: null },
        LIGHT: { minAmount: 10, notes: null, updatedAt: null },
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
});
