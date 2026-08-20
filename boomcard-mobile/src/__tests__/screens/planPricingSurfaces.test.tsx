/**
 * BC-QA-031 impl-r5 F7 — dual BGN/EUR pricing display removed (user decision).
 *
 * The three mobile plan surfaces rendered `X лв. / €Y`, deriving the лв half
 * from the backend's EUR plan price via a local
 * `convertEURToBGN(eur) = eur * APP_CONFIG.EUR_EXCHANGE_RATE`. The reviewer
 * verified the arithmetic was CORRECT (plans.routes.ts emits
 * `priceMonthlyEur / 100`, and the conversion ran EUR→BGN), so this is a scope
 * removal, not a bug fix — the property most at risk is that the EUR figure is
 * UNCHANGED.
 *
 * Each screen is mounted for real and asserted on both halves:
 *   1. the exact EUR price still renders, and
 *   2. no `лв` / `BGN` marker survives, and specifically not the value the
 *      deleted converter used to produce.
 * Both locales are covered because every лв/BGN label on these screens was
 * `language === 'bg' ? 'лв.' : 'BGN'`.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import UpgradePlansScreen from '../../screens/Card/UpgradePlansScreen';
import PlanSelectionScreen from '../../screens/Auth/PlanSelectionScreen';
import CheckoutScreen from '../../screens/Auth/CheckoutScreen';
import apiClient from '../../api/client';

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('../../store/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: 'u-1' } }),
}));

// i18n: `t` returns the key/fallback, and the language is driven per-test.
// The `mock` prefix is required — jest.mock factories are hoisted above
// ordinary `let` declarations and may only close over `mock*` bindings.
let mockCurrentLanguage = 'en';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // These screens call `t` both as `t(key, 'fallback string')` and as
    // `t(key, { amount })` for interpolation. Only the string form is a
    // fallback — returning the interpolation object would be rendered as a
    // React child and crash the tree.
    t: (key: string, second?: unknown) =>
      typeof second === 'string' ? second : key,
    i18n: { get language() { return mockCurrentLanguage; } },
  }),
}));

// Any colour key the screens read resolves to a string; a Proxy avoids having
// to enumerate the real palette and keeps this test insensitive to theme churn.
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    theme: {
      colors: new Proxy({}, { get: () => '#000000' }),
    },
  }),
}));

const PLAN = {
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
};

// The exact strings the deleted converter produced for this fixture:
//   9.99  * 1.95583 = 19.54  (toFixed(2))
//   99.99 * 1.95583 = 195.58
const OLD_BGN_MONTHLY = '19.54';
const OLD_BGN_YEARLY = '195.58';

const navigation = { setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), push: jest.fn() };

const textOf = (tree: ReturnType<typeof render>): string =>
  JSON.stringify(tree.toJSON() ?? {});

const assertEurOnly = (tree: ReturnType<typeof render>) => {
  const text = textOf(tree);
  expect(text).not.toMatch(/лв/);
  expect(text).not.toMatch(/BGN/);
  expect(text).not.toContain(OLD_BGN_MONTHLY);
  expect(text).not.toContain(OLD_BGN_YEARLY);
};

describe('Mobile plan pricing surfaces — EUR only (BC-QA-031 r5-F7)', () => {
  beforeEach(() => {
    mockCurrentLanguage = 'en';
    (apiClient.get as jest.Mock).mockReset();
  });

  describe.each(['en', 'bg'])('locale %s', (lang) => {
    beforeEach(() => {
      mockCurrentLanguage = lang;
    });

    it('UpgradePlansScreen renders the unchanged EUR price and no лв half', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, data: [PLAN] } });

      const tree = render(<UpgradePlansScreen navigation={navigation} route={{ params: {} }} />);

      await waitFor(() => expect(textOf(tree)).toContain('9.99'));
      expect(textOf(tree)).toContain('€');
      assertEurOnly(tree);
    });

    it('PlanSelectionScreen renders the unchanged EUR price and no лв half', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, data: [PLAN] } });

      const tree = render(<PlanSelectionScreen navigation={navigation} />);

      await waitFor(() => expect(textOf(tree)).toContain('9.99'));
      expect(textOf(tree)).toContain('€');
      assertEurOnly(tree);
    });

    it('CheckoutScreen renders the unchanged EUR price and total, and no лв half', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, data: PLAN } });

      const tree = render(
        <CheckoutScreen
          navigation={navigation}
          route={{ params: { planId: 'plan-1', billing: 'monthly' } }}
        />,
      );

      await waitFor(() => expect(textOf(tree)).toContain('9.99'));
      expect(textOf(tree)).toContain('€');
      assertEurOnly(tree);
    });
  });
});
