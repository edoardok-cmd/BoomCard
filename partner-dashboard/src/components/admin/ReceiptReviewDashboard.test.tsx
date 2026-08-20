import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ReceiptReviewDashboard } from './ReceiptReviewDashboard';
import { receiptService } from '../../services/receipt.service';
import { ReceiptStatus } from '../../types/receipt.types';
import { LanguageProvider } from '../../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1 (enumeration sweep).
 *
 * This dashboard lists `receiptService.getUserReceipts()` — GET /api/receipts,
 * whose rows pass through `receipt.service.ts formatReceipt()`, which converts
 * totalAmount and cashbackAmount with bgnToEur(). Both were rendered with a
 * hardcoded ` BGN` suffix.
 *
 * The component has no mount site in the app today; the test keeps its labels
 * honest if it is ever wired up.
 */

vi.mock('../../services/receipt.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/receipt.service')>(
    '../../services/receipt.service',
  );
  return {
    ...actual,
    receiptService: {
      getUserReceipts: vi.fn(),
      reviewReceipt: vi.fn(),
      bulkApprove: vi.fn(),
      bulkReject: vi.fn(),
    },
  };
});

const RECEIPT = {
  id: 'r-1',
  userId: 'u-1',
  totalAmount: 21.73,
  merchantName: 'Test Merchant',
  ocrConfidence: 88,
  imageUrl: 'https://example.com/r.jpg',
  imageHash: 'h',
  cashbackPercent: 5,
  cashbackAmount: 1.09,
  fraudScore: 3,
  status: ReceiptStatus.MANUAL_REVIEW,
  createdAt: '2026-08-20T09:00:00.000Z',
  updatedAt: '2026-08-20T09:00:00.000Z',
};

const renderDashboard = () => {
  localStorage.setItem('boomcard_language', 'en');
  return render(
    <LanguageProvider>
      <ReceiptReviewDashboard />
    </LanguageProvider>,
  );
};

describe('ReceiptReviewDashboard — EUR receipt amounts (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (receiptService.getUserReceipts as ReturnType<typeof vi.fn>).mockResolvedValue([RECEIPT]);
  });

  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders receipt amount and cashback with a € prefix, never BGN', async () => {
    const { container } = renderDashboard();

    await waitFor(() => expect(screen.getByText('Test Merchant')).toBeInTheDocument());

    expect(screen.getByText('€21.73')).toBeInTheDocument();
    expect(screen.getByText('€1.09')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bBGN\b/);
    expect(container.textContent).not.toMatch(/лв/);
  });
});
