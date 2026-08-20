import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceiptAnalyticsWidget } from './ReceiptAnalyticsWidget';
import { receiptsApiService } from '../../services/receipts-api.service';
import { ReceiptStatus } from '../../types/receipt.types';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 — receipt analytics widget currency labels.
 *
 * What this test genuinely pins is `totalCashback`. That value is computed in
 * the widget from receiptsApiService.getReceipts() → GET /api/receipts/v2,
 * which does not pass `includeInternal`, so receipt.service.ts
 * `formatReceipt()` reaches its bgnToEur() block and the rows are EUR. The `лв`
 * suffix there was wrong and is fixed.
 *
 * CAVEAT on the other two figures, corrected in round 6: `totalAmount` and
 * `averageAmount` are read from receiptsApiService.getUserStats() → GET
 * /api/receipts/v2/stats/user, which is `getUserSubmissionStats()` — a
 * submission-COUNT endpoint that returns no money fields whatsoever. The
 * `stats` fixture below therefore describes `ReceiptStatsResponse` as the
 * frontend type DECLARES it, not as the endpoint actually behaves; at runtime
 * those two fields are `undefined` and `.toFixed(2)` would throw. That is a
 * pre-existing defect independent of currency, reported as a caveat.
 *
 * The widget has no mount site (exported from `components/widgets/index.tsx`,
 * imported nowhere), so nothing ships broken today — this test keeps the
 * labels honest if it is ever wired up, and the fixture comment keeps the
 * endpoint mismatch from being forgotten.
 */

vi.mock('../../services/receipts-api.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/receipts-api.service')>(
    '../../services/receipts-api.service',
  );
  return {
    ...actual,
    receiptsApiService: { getUserStats: vi.fn(), getReceipts: vi.fn() },
  };
});

const renderWidget = () => {
  localStorage.setItem('boomcard_language', 'en');
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ReceiptAnalyticsWidget />
      </LanguageProvider>
    </MemoryRouter>,
  );
};

describe('ReceiptAnalyticsWidget — EUR receipt stats (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (receiptsApiService.getUserStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        totalReceipts: 4,
        validatedReceipts: 3,
        rejectedReceipts: 0,
        pendingReceipts: 1,
        totalAmount: 400.4,
        averageAmount: 100.1,
      },
    });
    (receiptsApiService.getReceipts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'r-1',
          userId: 'u-1',
          totalAmount: 200,
          merchantName: 'Test Merchant',
          ocrConfidence: 90,
          imageUrl: 'https://example.com/r.jpg',
          imageHash: 'h',
          cashbackPercent: 5,
          cashbackAmount: 10,
          fraudScore: 1,
          status: ReceiptStatus.CASHBACK_APPLIED,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders the EUR-backed cashback total with a € prefix and no лв suffix', async () => {
    const { container } = renderWidget();

    // totalCashback = 200 * 0.05 = 10.00
    await waitFor(() => expect(screen.getByText(/€10\.00/)).toBeInTheDocument());
    expect(screen.getByText('€400.40')).toBeInTheDocument();
    expect(screen.getByText('€100.10')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/лв/);
    expect(container.textContent).not.toMatch(/\bBGN\b/);
  });
});
