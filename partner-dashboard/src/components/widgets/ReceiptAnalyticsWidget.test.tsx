import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReceiptAnalyticsWidget } from './ReceiptAnalyticsWidget';
import { receiptsApiService } from '../../services/receipts-api.service';
import { ReceiptStatus } from '../../types/receipt.types';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1 (enumeration sweep).
 *
 * This widget renders `receiptsApiService.getUserStats()` — GET
 * /api/receipts/stats, whose handler `receipt.service.ts getUserReceiptStats()`
 * converts totalAmount and averageAmount with bgnToEur() — plus a cashback
 * total derived from receipt rows that `formatReceipt()` already converted. All
 * three were rendered with a `лв` suffix.
 *
 * The widget currently has no mount site in the app (it is exported from
 * `components/widgets/index.tsx` and imported nowhere else), so this test is
 * what keeps the labels honest if it is ever wired up.
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

  it('renders every money stat with a € prefix and no лв suffix', async () => {
    const { container } = renderWidget();

    // totalCashback = 200 * 0.05 = 10.00
    await waitFor(() => expect(screen.getByText(/€10\.00/)).toBeInTheDocument());
    expect(screen.getByText('€400.40')).toBeInTheDocument();
    expect(screen.getByText('€100.10')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/лв/);
    expect(container.textContent).not.toMatch(/\bBGN\b/);
  });
});
