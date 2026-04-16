import { test, expect } from '@playwright/test';
import { loginAs, fixtures } from '../helpers/auth';
import { runScanFlow } from '../helpers/flow';

async function gotoScanner(context: any, page: any) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const scanTab = page.getByText(/^scan$/i).first();
  await scanTab.waitFor({ timeout: 15_000 });
  await scanTab.click();
  await page.waitForFunction(() => !!(window as any).__BOOM_TEST_SCAN__, { timeout: 15_000 });
}

test('smoke: Premium × 20% venue × 100 BGN → 16 BGN cashback', async ({ context, page }) => {
  await loginAs(context, 'premium');
  await gotoScanner(context, page);

  const result = await runScanFlow(page, {
    qrPayload: fixtures.venues['20'].qrPayload,
    billAmount: 100,
  });

  expect(result.venueName).toBe('Test Venue 20%');
  expect(result.cashbackPercent).toBe(16);
  expect(result.cashbackEarned).toBeCloseTo(16, 2);
});
