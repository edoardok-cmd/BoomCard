import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PricingPublicPage from './PricingPublicPage';
import SubscriptionsPage from './SubscriptionsPage';
import HomePage from './HomePage';
import { plansService, Plan } from '../services/plans.service';
import { LanguageProvider } from '../contexts/LanguageContext';

/**
 * BC-QA-031 impl-r5 F7 — dual BGN/EUR pricing display removed (user decision).
 *
 * These three surfaces rendered `X лв. / €Y`, deriving the лв half from the
 * backend's EUR plan price via `convertEURToBGN`. The reviewer verified the
 * arithmetic was CORRECT — `plans.routes.ts:52–57` emits `priceMonthlyEur / 100`
 * and the conversion ran EUR→BGN, so nothing was halved. This was therefore a
 * scope removal, not a bug fix, and the property most at risk is that the EUR
 * figure is UNCHANGED.
 *
 * Each test below asserts both halves of that:
 *   1. the exact EUR price still renders, and
 *   2. no `лв` / `BGN` marker survives anywhere on the page,
 * in both locales, since all three pages are localised.
 *
 * The fixture prices are deliberately values whose EUR→BGN conversion is
 * distinctive (9.99 → 19.54, 99.99 → 195.58), so a surviving лв half would be
 * caught by the negative assertion rather than coincidentally matching the EUR
 * digits.
 */

vi.mock('../services/plans.service', async () => {
  const actual = await vi.importActual<typeof import('../services/plans.service')>(
    '../services/plans.service',
  );
  return { ...actual, plansService: { getPlans: vi.fn() } };
});

const PLANS: Plan[] = [
  {
    id: 'plan-1',
    planCode: 'BASIC',
    displayName: 'Basic',
    displayNameBg: 'Базов',
    pricing: { weekly: null, monthly: 9.99, yearly: 99.99, currency: 'EUR', yearlyDiscountPct: 16 },
    billingOptions: { hasWeekly: false, hasMonthly: true, hasYearly: true },
    cashbackRate: 5,
    stickerBonus: 0,
    payoutThreshold: 20,
    features: ['Feature one'],
    featuresBg: ['Функция едно'],
    cardType: 'silver',
    isFeatured: false,
    badge: null,
  },
];

const renderWith = (ui: React.ReactElement, language: 'en' | 'bg') => {
  localStorage.setItem('boomcard_language', language);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LanguageProvider>{ui}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// The exact strings the лв half used to produce, spelled out so the negative
// assertions fail loudly if any of them comes back.
const OLD_BGN_MONTHLY = '19.54';
const OLD_BGN_YEARLY = '195.58';

const assertEurOnly = (container: HTMLElement) => {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/лв/);
  expect(text).not.toMatch(/\bBGN\b/);
  expect(text).not.toContain(OLD_BGN_MONTHLY);
  expect(text).not.toContain(OLD_BGN_YEARLY);
};

describe('Pricing surfaces — EUR only, no dual BGN render (BC-QA-031 r5-F7)', () => {
  beforeEach(() => {
    (plansService.getPlans as ReturnType<typeof vi.fn>).mockResolvedValue(PLANS);
  });

  afterEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  describe('PricingPublicPage', () => {
    it.each(['en', 'bg'] as const)('renders the unchanged EUR price and no лв half (%s)', async (lang) => {
      const { container } = renderWith(<PricingPublicPage />, lang);

      await waitFor(() => expect(container.textContent).toContain('€9.99'));
      assertEurOnly(container);
    });
  });

  describe('SubscriptionsPage', () => {
    it.each(['en', 'bg'] as const)('renders the unchanged EUR price and no лв half (%s)', async (lang) => {
      const { container } = renderWith(<SubscriptionsPage />, lang);

      await waitFor(() => expect(container.textContent).toContain('€9.99'));
      assertEurOnly(container);
    });
  });

  describe('HomePage', () => {
    it.each(['en', 'bg'] as const)('renders the unchanged EUR price and no лв half (%s)', async (lang) => {
      const { container } = renderWith(<HomePage />, lang);

      await waitFor(() => expect(container.textContent).toContain('€9.99'));
      assertEurOnly(container);
    });
  });

  it('still renders the price when the plan list arrives (guards against the removal blanking the card)', async () => {
    const { container } = renderWith(<SubscriptionsPage />, 'en');
    await waitFor(() => expect(container.textContent).toContain('€9.99'));
    // The old render was gated on `eurPrice != null && bgnPrice != null`; the
    // bgnPrice half of that guard was removed with the conversion. A plan with
    // a price must therefore still show it, never the 'N/A' fallback.
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });
});
