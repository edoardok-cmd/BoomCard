import { test } from '@playwright/test';

test.describe('Desktop Header Test', () => {
  test.use({
    viewport: { width: 1440, height: 900 }, // Desktop size
  });

  test('should show language toggle and theme switcher on desktop', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Take screenshot of full desktop view
    await page.screenshot({
      path: 'tests/screenshots/desktop-full-page.png',
      fullPage: true
    });

    // Take screenshot of just the header
    await page.screenshot({
      path: 'tests/screenshots/desktop-header.png',
      clip: { x: 0, y: 0, width: 1440, height: 80 }
    });

    // Check if language toggle is visible on desktop
    const langToggle = page.locator('button:has-text("EN")').first();
    const isLangVisible = await langToggle.isVisible();
    console.log('Language toggle visible on desktop (should be TRUE):', isLangVisible);

    // Check if theme switcher is visible on desktop
    const themeSwitcher = page.locator('[aria-label="Change theme"]').first();
    const isThemeVisible = await themeSwitcher.isVisible();
    console.log('Theme switcher visible on desktop (should be TRUE):', isThemeVisible);

    // Check hero section for black overlay
    await page.screenshot({
      path: 'tests/screenshots/desktop-hero-cards.png',
      clip: { x: 0, y: 80, width: 1440, height: 600 }
    });
  });
});
