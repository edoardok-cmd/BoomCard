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
 * `totalCashback` is computed in the widget from
 * receiptsApiService.getReceipts() → GET /api/receipts/v2, which does not pass
 * `includeInternal`, so receipt.service.ts `formatReceipt()` reaches its
 * bgnToEur() block and the rows are EUR. The `лв` suffix there was wrong and is
 * fixed.
 *
 * Both fixtures below are real response bodies. The `getReceipts` fixture is a
 * row as `formatReceipt()` emits it for a non-admin caller: internal-only fields
 * (userId, ocrConfidence, imageHash, cashbackPercent, fraudScore) are STRIPPED,
 * and `status` holds a member of the backend ReceiptStatus enum
 * (backend-api/prisma/schema.prisma). BC-QA-031-FOLLOWUP-4: it previously
 * declared `status: CASHBACK_APPLIED` — a status the backend cannot produce —
 * and carried the stripped internal fields, so the green cashback assertion was
 * measuring a state that never reaches the browser.
 *
 * `totalAmount` and `averageAmount` come from receiptsApiService.getUserStats().
 * BC-QA-031-FOLLOWUP-4 repointed that method from GET /api/receipts/v2/stats/user
 * (`getUserSubmissionStats()` — submission counters, no money fields, no
 * { success, data } envelope) to GET /api/receipts/stats
 * (`getUserReceiptStats()`), which emits both figures already bgnToEur()-converted.
 * The `stats` fixture below is therefore the real response body of
 * GET /api/receipts/stats.
 *
 * This test asserts what the widget RENDERS. It does not, and cannot, check
 * that the frontend type matches the endpoint — that correspondence is pinned
 * by `src/services/receipts-api.contract.test.ts`, which reads the backend
 * route/service source and fails if getUserStats() is repointed at an endpoint
 * that does not emit these fields.
 *
 * The widget has no mount site (exported from `components/widgets/index.tsx`,
 * imported nowhere), so this test keeps the labels honest if it is ever wired up.
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
    // Real response body of GET /api/receipts/stats (receiptService
    // .getUserReceiptStats): counts plus EUR money totals, in a
    // { success, data } envelope.
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
          // BC-QA-031-FOLLOWUP-4: `cashbackAmount` is deliberately NOT 5%
          // of `totalAmount`. It used to be (10 of 200), which made the row's
          // real cashback figure and the old hardcoded `totalAmount * 0.05`
          // placeholder render identically, so the assertion below could not
          // tell them apart and the field half of the fix was unpinned.
          // Any value that is not totalAmount * 0.05 restores that distinction;
          // 12.34 also has no decimal in common with 10.00 or 17.50.
          id: 'r-1',
          totalAmount: 200,
          merchantName: 'Test Merchant',
          imageUrl: 'https://example.com/r.jpg',
          cashbackAmount: 12.34,
          status: ReceiptStatus.APPROVED,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
        {
          // Not APPROVED: its cashback has not been granted, so it must not be
          // summed into the Total Cashback card.
          id: 'r-2',
          totalAmount: 150,
          merchantName: 'Other Merchant',
          imageUrl: 'https://example.com/r2.jpg',
          cashbackAmount: 7.5,
          status: ReceiptStatus.PENDING,
          createdAt: '2026-08-02T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
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

    // totalCashback = sum of cashbackAmount over APPROVED rows only
    //               = 12.34 (r-1)  — r-2 is PENDING and contributes nothing.
    //
    // This figure pins BOTH halves of the status/field fix INDEPENDENTLY —
    // reverting either half alone must go red:
    //   status half   — revert the filter to the impossible ReceiptStatus
    //                   .CASHBACK_APPLIED and no row matches, so the card
    //                   renders €0.00.
    //   field half    — revert the summed value to the old hardcoded
    //                   `(r.totalAmount || 0) * 0.05` placeholder and, with the
    //                   APPROVED filter kept, r-1 alone yields 200 * 0.05 =
    //                   €10.00.
    // Neither is €12.34, so neither revert can pass. The two guards below cover
    // the remaining pre-fix shapes: 17.50 is the placeholder summed over both
    // rows (200 * 0.05 + 150 * 0.05, i.e. the filter dropped as well), and 0.00
    // is the original structural failure.
    await waitFor(() => expect(screen.getByText(/€12\.34/)).toBeInTheDocument());
    expect(container.textContent).not.toMatch(/€17\.50/);
    expect(container.textContent).not.toMatch(/€0\.00/);
    expect(screen.getByText('€400.40')).toBeInTheDocument();
    expect(screen.getByText('€100.10')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/лв/);
    expect(container.textContent).not.toMatch(/\bBGN\b/);
  });

  it('does not fall back to the empty state when the account has receipts', async () => {
    // BC-QA-031-FOLLOWUP-4 — the actual pre-fix failure mode, measured against
    // the live payload of the endpoint getUserStats() used to hit. That handler
    // responds with a BARE object (no { success, data } envelope), so
    // `statsResponse.success` was `undefined`, the guard in fetchAnalytics()
    // short-circuited, `analytics` kept its all-zero initial state, and the
    // `totalReceipts === 0` early return rendered "No receipt data available
    // yet" for every user forever. It never threw — it was silently, always
    // empty, which is why nothing was noticed.
    renderWidget();

    await waitFor(() => expect(screen.getByText('€400.40')).toBeInTheDocument());
    expect(screen.queryByText('No receipt data available yet')).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // stats.totalReceipts
  });
});
