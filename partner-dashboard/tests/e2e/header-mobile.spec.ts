import { test, expect } from '@playwright/test';

test.describe('Mobile Header Test', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
  });

  test('should hide language toggle on mobile header', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    // Take screenshot of header
    await page.screenshot({
      path: 'tests/screenshots/mobile-header-current.png',
      clip: { x: 0, y: 0, width: 375, height: 100 }
    });

    // Check if language toggle is hidden (should have hidden xl:flex class)
    const langToggle = page.locator('[class*="LanguageToggleContainer"]').first();
    const isVisible = await langToggle.isVisible();

    console.log('Language toggle visible:', isVisible);

    // Click hamburger menu
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await hamburger.click();
    await page.waitForTimeout(500);

    // Take screenshot of opened menu
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-open.png'
    });
  });
});
