import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminReceiptsPage from './AdminReceiptsPage';
import { receiptsApiService } from '../services/receipts-api.service';
import { ReceiptStatus } from '../types/receipt.types';
import { LanguageProvider } from '../contexts/LanguageContext';

/**
 * BC-QA-031 — admin receipts list currency labels.
 *
 * HISTORY, because this test asserted the OPPOSITE one round ago and the
 * correction matters more than the assertion:
 *
 * In round 5 I traced GET /api/receipts/v2/admin/all to
 * `receipt.service.ts getReceipts()` → `formatReceipt()`, saw the bgnToEur()
 * block at the end of `formatReceipt`, and concluded the admin list was EUR —
 * so I relabelled the page € and wrote this test to pin that. That trace was
 * WRONG. `formatReceipt()` short-circuits first:
 *
 *     if (opts.includeInternal) return base;   // receipt.service.ts:624
 *
 * and `/admin/all` sets `includeInternal: true`
 * (receipts.enhanced.routes.ts:346). The admin list therefore returns the RAW
 * BGN row and never reaches the conversion block. The backend specialist caught
 * this in round 6 and reverted the page to `лв.`; I re-verified both the
 * short-circuit and the caller and agree.
 *
 * The write path is symmetric and is what makes BGN the right answer rather
 * than merely the honest one: `handleApprove` posts
 * `verifiedAmount: receipt.totalAmount` to POST /:id/review, which stores it as
 * BGN. Labelling the display € without converting the write would have halved
 * every approved receipt's persisted amount.
 *
 * The two sibling surfaces I fixed in the same round are NOT affected and stay
 * €, re-verified here: `ReceiptReviewDashboard` reads GET /api/receipts (base
 * router, no `includeInternal`) so `formatReceipt` does convert, and
 * `getUserReceiptStats()` converts explicitly in its own return.
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

describe('AdminReceiptsPage — raw BGN receipt amounts (BC-QA-031 r6 correction)', () => {
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

  it('renders the amount and cashback cells as BGN — the unit the endpoint actually returns (English)', async () => {
    const { container } = renderPage('en');

    await waitFor(() => expect(screen.getByText('Test Merchant')).toBeInTheDocument());

    expect(screen.getByText('21.73 лв.')).toBeInTheDocument();
    expect(screen.getByText('1.09 лв. (5.0%)')).toBeInTheDocument();
    // No € anywhere: a Euro sign here would claim a conversion that
    // `formatReceipt`'s includeInternal short-circuit never performs.
    expect(container.textContent).not.toMatch(/€/);
    expect(screen.getByText('Cashback Credited (BGN)')).toBeInTheDocument();
  });

  it('renders BGN in Bulgarian too, with no € marker', async () => {
    const { container } = renderPage('bg');

    await waitFor(() => expect(screen.getByText('Test Merchant')).toBeInTheDocument());

    expect(screen.getByText('21.73 лв.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/€/);
    expect(screen.getByText('Кредитиран кешбек (лв.)')).toBeInTheDocument();
  });
});
