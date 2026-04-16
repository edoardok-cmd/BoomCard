import { test, expect, BrowserContext, Page } from '@playwright/test';
import { loginAs, fixtures, UserKey } from '../helpers/auth';
import { runScanFlow } from '../helpers/flow';

type Plan = 'free' | 'basic' | 'premium' | 'light';
type DiscountStep = '5' | '10' | '15' | '20' | '25';

// Source of truth: receipt.constants.ts lookup matrix.
// FREE: always 0% (no subscription → 0 cashback applied).
// BASIC: 5→5, 10→5, 15→8, 20→10, 25→10.
// PREMIUM/LIGHT: 5→5, 10→8, 15→12, 20→16, 25→20.
const MATRIX: Record<Plan, Record<DiscountStep, number>> = {
  free:    { '5': 0,  '10': 0,  '15': 0,  '20': 0,  '25': 0  },
  basic:   { '5': 5,  '10': 5,  '15': 8,  '20': 10, '25': 10 },
  premium: { '5': 5,  '10': 8,  '15': 12, '20': 16, '25': 20 },
  light:   { '5': 5,  '10': 8,  '15': 12, '20': 16, '25': 20 },
};

async function gotoScanner(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const scanTab = page.getByText(/^scan$/i).first();
  await scanTab.waitFor({ timeout: 15_000 });
  await scanTab.click();
  await page.waitForFunction(() => !!(window as any).__BOOM_TEST_SCAN__, { timeout: 15_000 });
}

for (const plan of ['free', 'basic', 'premium', 'light'] as Plan[]) {
  for (const step of ['5', '10', '15', '20', '25'] as DiscountStep[]) {
    const expectedPct = MATRIX[plan][step];
    const bill = 100;
    const expectedCashback = (bill * expectedPct) / 100;

    test(`§1 ${plan.toUpperCase()} × ${step}% venue × ${bill} BGN → ${expectedCashback} BGN`, async ({ context, page }) => {
      await loginAs(context, plan as UserKey);
      await gotoScanner(page);

      const result = await runScanFlow(page, {
        qrPayload: fixtures.venues[step].qrPayload,
        billAmount: bill,
      });

      expect(result.venueName).toBe(`Test Venue ${step}%`);
      // For FREE users the backend returns cashbackAmount=0; cashbackEarned mirrors it.
      expect(result.cashbackEarned).toBeCloseTo(expectedCashback, 2);
    });
  }
}

// Edge cases: rounding + large bill
test('§1.21 BASIC × 15% × 33.33 → ≈2.67 BGN (rounding)', async ({ context, page }) => {
  await loginAs(context, 'basic');
  await gotoScanner(page);
  const result = await runScanFlow(page, { qrPayload: fixtures.venues['15'].qrPayload, billAmount: 33.33 });
  // 33.33 * 0.08 = 2.6664 → banker's/standard rounding → 2.67
  expect(result.cashbackEarned).toBeCloseTo(2.67, 1);
});

test('§1.22 BASIC × 15% × 99.99 → ≈8.00 BGN', async ({ context, page }) => {
  await loginAs(context, 'basic');
  await gotoScanner(page);
  const result = await runScanFlow(page, { qrPayload: fixtures.venues['15'].qrPayload, billAmount: 99.99 });
  // 99.99 * 0.08 = 7.9992 → ~8.00
  expect(result.cashbackEarned).toBeCloseTo(8, 1);
});

test('§1.23 PREMIUM × 25% × 1000 → 200 BGN (large bill)', async ({ context, page }) => {
  await loginAs(context, 'premium');
  await gotoScanner(page);
  const result = await runScanFlow(page, { qrPayload: fixtures.venues['25'].qrPayload, billAmount: 1000 });
  expect(result.cashbackEarned).toBeCloseTo(200, 2);
});
