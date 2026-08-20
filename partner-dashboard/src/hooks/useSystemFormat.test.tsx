import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSystemFormat } from './useSystemFormat';
import { adminSettingsService } from '../services/adminSettings.service';

/**
 * BC-QA-031 impl-r5 F1 — the structural half.
 *
 * `formatAmount(value, currency = 'BGN')` is what let
 * `AdminSubscribersAllPage` stamp `лв.` onto EUR wallet balances: the call site
 * passed one argument and neither end of the call showed the mislabel.
 *
 * The default is gone — `currency` is required. That is enforced by `tsc`, not
 * by this file; what this file pins is the runtime behaviour the type change
 * relies on: the formatter formats under the code it is GIVEN and performs no
 * conversion of its own. If someone reintroduces a default, or makes the hook
 * convert, these assertions still hold — but the compile error that now guards
 * every new money caller would be gone, so the accompanying page-level tests
 * are the real net.
 */

vi.mock('../services/adminSettings.service', async () => {
  const actual = await vi.importActual<typeof import('../services/adminSettings.service')>(
    '../services/adminSettings.service',
  );
  return {
    ...actual,
    adminSettingsService: { ...actual.adminSettingsService, getSystemSettings: vi.fn() },
  };
});

function Probe() {
  const { formatAmount } = useSystemFormat();
  return (
    <div>
      <span data-testid="eur">{formatAmount(21.73, 'EUR')}</span>
      <span data-testid="bgn">{formatAmount(21.73, 'BGN')}</span>
    </div>
  );
}

const renderProbe = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
};

describe('useSystemFormat.formatAmount — explicit currency (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (adminSettingsService.getSystemSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { number_format: '1 234,56', date_format: 'DD.MM.YYYY' },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('formats under the currency code it is given and converts nothing', async () => {
    renderProbe();

    await waitFor(() => expect(screen.getByTestId('eur').textContent).toMatch(/€/));

    const eur = screen.getByTestId('eur').textContent ?? '';
    const bgn = screen.getByTestId('bgn').textContent ?? '';

    // Same magnitude in both — the hook labels, it never converts.
    expect(eur).toMatch(/21,73/);
    expect(bgn).toMatch(/21,73/);

    // And the labels are the ones asked for, not a default.
    expect(eur).toMatch(/€/);
    expect(eur).not.toMatch(/лв/);
    expect(bgn).toMatch(/лв/);
  });
});
