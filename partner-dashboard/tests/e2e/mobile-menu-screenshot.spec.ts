import { test } from '@playwright/test';

test('Capture mobile menu screenshot', async ({ page }) => {
  // Set mobile viewport
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:3005/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Open hamburger menu
  const hamburger = page.locator('[aria-label="Toggle menu"]');
  await hamburger.click();
  await page.waitForTimeout(1500); // Wait for animation

  // Ensure we're at the top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Take full viewport screenshot showing the menu overlay
  await page.screenshot({
    path: 'tests/screenshots/mobile-menu-EXPANDED-FULL.png',
    fullPage: false
  });

  console.log('✓ Mobile menu screenshot saved');
});
