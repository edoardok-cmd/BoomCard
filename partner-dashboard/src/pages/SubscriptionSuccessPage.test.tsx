// ─── Regression: anonymous/guest-checkout copy (BC-QA-003 round 2, F1 + F2) ──
//
// SubscriptionSuccessPage.tsx's anonymous/guest-checkout branch (status ===
// 'success' && isAnonymous, driven by GET /subscriptions/status/:orderId
// returning { type: 'pending', status: 'PAID' | 'COMPLETED' }) has two bugs
// fixed in this round:
//
//   F1: the subtitle interpolated `planName` with no null fallback. planName
//       is null whenever the active locale's plan display name is unset
//       (Plan.displayNameBg is a nullable column, passed through
//       unconditionally by the backend's pending-subscription branch) —
//       reintroducing the exact "empty Plan field" bug this task exists to
//       fix. Same gap existed in the SubscriptionDetails Plan row.
//   F2: the Status badge reused the generic "Processing" label under the
//       green "Payment Received!" success icon/title — read as if the
//       original "stuck on Обработва се" bug were still happening, even
//       though isActive: false is factually correct here (no real
//       Subscription row exists yet).
//
// Follows the "render the full component + mocked network layer" convention
// used by SubscriptionPage.test.tsx, mocking plansService directly since
// SubscriptionSuccessPage calls it via plain axios (no react-query).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import { plansService } from '../services/plans.service';
import SubscriptionSuccessPage from './SubscriptionSuccessPage';

vi.mock('../services/plans.service', () => ({
  plansService: {
    checkSubscriptionStatus: vi.fn(),
    verifyPaymentRedirect: vi.fn(),
  },
}));

const mockCheckStatus = plansService.checkSubscriptionStatus as unknown as ReturnType<typeof vi.fn>;

function renderPage(orderId = 'ORDER-1') {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/subscription/success?orderId=${orderId}`]}>
        <SubscriptionSuccessPage />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('SubscriptionSuccessPage — anonymous/guest-checkout copy (BC-QA-003 round 2)', () => {
  beforeEach(() => {
    localStorage.setItem('boomcard_language', 'bg');
  });

  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('F1: falls back to generic subtitle copy (not a blank gap) when the bg plan name is null', async () => {
    mockCheckStatus.mockResolvedValue({
      type: 'pending',
      status: 'PAID',
      email: 'guest@example.com',
      isActive: false,
      plan: { code: 'BASIC', name: 'Basic', nameBg: null },
      billingPeriod: 'monthly',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Плащането е получено!')).toBeInTheDocument();
    });

    // The old bug: prefix + null + suffix rendered as two adjacent text nodes
    // with nothing between them — a blank gap where the plan name belongs.
    expect(
      screen.queryByText('Получихме плащането ви за план', { exact: false }),
    ).not.toBeInTheDocument();

    // Fixed: the generic fallback sentence renders whole instead.
    expect(
      screen.getByText('Получихме плащането ви. Проверете имейла си, за да завършите настройката на акаунта.'),
    ).toBeInTheDocument();

    // Same gap existed in the SubscriptionDetails Plan row — must show the
    // dash fallback, never an empty cell.
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('F1: interpolates the real plan name when the bg name is present', async () => {
    mockCheckStatus.mockResolvedValue({
      type: 'pending',
      status: 'PAID',
      email: 'guest@example.com',
      isActive: false,
      plan: { code: 'BASIC', name: 'Basic', nameBg: 'Базов' },
      billingPeriod: 'monthly',
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Плащането е получено!')).toBeInTheDocument();
    });

    // Prefix + planName + suffix render as sibling text nodes inside the
    // same <p> (the getByText string-matcher only matches a single node),
    // so assert on the paragraph's assembled textContent instead.
    const subtitle = container.querySelector('p');
    expect(subtitle?.textContent).toBe(
      'Получихме плащането ви за план Базов. Проверете имейла си, за да завършите настройката на акаунта.',
    );
  });

  it('F2: shows a distinct "awaiting setup" status label, not the permanent "Processing" label', async () => {
    mockCheckStatus.mockResolvedValue({
      type: 'pending',
      status: 'PAID',
      email: 'guest@example.com',
      isActive: false,
      plan: { code: 'BASIC', name: 'Basic', nameBg: 'Базов' },
      billingPeriod: 'monthly',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Плащането е получено!')).toBeInTheDocument();
    });

    // Fixed label present, old generic label absent from the badge.
    expect(screen.getByText('Очаква се настройка на профила')).toBeInTheDocument();
    expect(screen.queryByText('Обработва се')).not.toBeInTheDocument();
  });
});
