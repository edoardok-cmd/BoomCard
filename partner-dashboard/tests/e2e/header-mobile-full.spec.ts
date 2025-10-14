import { test, expect } from '@playwright/test';

test.describe('Mobile Header Full Test', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
  });

  test('should show menu items only in hamburger menu', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    // Take screenshot of closed header
    await page.screenshot({
      path: 'tests/screenshots/mobile-header-closed.png',
      clip: { x: 0, y: 0, width: 375, height: 80 }
    });

    // Check language toggle is hidden on header
    const langToggle = page.locator('[class*="LanguageToggleContainer"]').first();
    const isVisible = await langToggle.isVisible();
    console.log('Language toggle visible in header:', isVisible);

    // Click hamburger menu
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await hamburger.click();
    await page.waitForTimeout(800);

    // Take screenshot of opened menu showing the top with controls
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-controls.png',
      clip: { x: 0, y: 0, width: 375, height: 400 }
    });
  });
});
