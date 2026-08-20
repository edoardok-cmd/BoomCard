import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminReceiptsPage from './AdminReceiptsPage';
import { receiptsApiService } from '../services/receipts-api.service';
import { ReceiptStatus } from '../types/receipt.types';
import { LanguageProvider } from '../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F1 (found by the enumeration sweep the round-5 brief asked
 * for, beyond the sites the reviewer listed).
 *
 * GET /api/receipts/admin/all is served by receipt.service.ts `getReceipts()`,
 * which maps every row through `formatReceipt()`; that converts
 * Receipt.totalAmount and Receipt.cashbackAmount with bgnToEur(). The page
 * rendered both under a hardcoded `лв` suffix and labelled its credited-cashback
 * stat card "Cashback Credited (BGN)" / "Кредитиран кешбек (лв)".
 */

vi.mock('../services/receipts-api.service', async () => {
  const actual = await vi.importActual<typeof import('../services/receipts-api.service')>(
    '../services/receipts-api.service',
  );
  return {
    ...actual,
    receiptsApiService: {
      getAllReceipts: vi.fn(),
      reviewReceipt: vi.fn(),
      bulkApprove: vi.fn(),
      bulkReject: vi.fn(),
    },
  };
});

const RECEIPT = {
  id: 'receipt-1',
  userId: 'user-1',
  totalAmount: 21.73,
  merchantName: 'Test Merchant',
  ocrConfidence: 92,
  imageUrl: 'https://example.com/r.jpg',
  imageKey: 'r.jpg',
  imageHash: 'hash',
  cashbackPercent: 5,
  cashbackAmount: 1.09,
  fraudScore: 4,
  status: ReceiptStatus.APPROVED,
  createdAt: '2026-08-20T09:00:00.000Z',
  updatedAt: '2026-08-20T09:00:00.000Z',
  user: { id: 'user-1', email: 'ivan@example.com', firstName: 'Ivan', lastName: 'Ivanov' },
};

const renderPage = (language: 'en' | 'bg' = 'en') => {
  localStorage.setItem('boomcard_language', language);
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <AdminReceiptsPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
};

describe('AdminReceiptsPage — EUR receipt amounts (BC-QA-031 r5-F1)', () => {
  beforeEach(() => {
    (receiptsApiService.getAllReceipts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [RECEIPT],
      total: 1,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders the amount and cashback cells with a € prefix, never лв (English)', async () => {
    const { container } = renderPage('en');

    await waitFor(() => expect(screen.getByText('Test Merchant')).toBeInTheDocument());

    expect(screen.getByText('€21.73')).toBeInTheDocument();
    expect(screen.getByText('€1.09 (5.0%)')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/лв/);
    // The credited-cashback stat card header.
    expect(screen.getByText('Cashback Credited (EUR)')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Cashback Credited \(BGN\)/);
  });

  it('renders no лв marker in Bulgarian either', async () => {
    const { container } = renderPage('bg');

    await waitFor(() => expect(screen.getByText('Test Merchant')).toBeInTheDocument());

    expect(screen.getByText('€21.73')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/лв/);
    expect(screen.getByText('Кредитиран кешбек (€)')).toBeInTheDocument();
  });
});
