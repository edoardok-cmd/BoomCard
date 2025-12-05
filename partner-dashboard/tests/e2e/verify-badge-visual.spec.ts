import { test } from '@playwright/test';

test('Visual verification of subscription cards alignment', async ({ page }) => {
  await page.goto('http://localhost:3015');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // Scroll to subscription section
  await page.evaluate(() => {
    window.scrollTo(0, 1800);
  });

  // Wait for animations
  await page.waitForTimeout(1500);

  // Take screenshot
  await page.screenshot({ path: 'subscription-cards-alignment.png', fullPage: false });

  console.log('Screenshot saved to subscription-cards-alignment.png');
});
