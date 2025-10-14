import { test } from '@playwright/test';

test.describe('Mobile Menu Final Verification', () => {
  test.use({
    viewport: { width: 375, height: 667 },
  });

  test('show complete mobile menu with all controls', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    console.log('Step 1: Checking header without menu open');
    const langToggleInHeader = page.locator('[class*="LanguageToggleContainer"]').first();
    const headerVisible = await langToggleInHeader.isVisible();
    console.log('Language toggle visible in header (should be false):', headerVisible);

    await page.screenshot({
      path: 'tests/screenshots/final-header-closed.png',
      clip: { x: 0, y: 0, width: 375, height: 70 }
    });

    console.log('Step 2: Opening hamburger menu');
    await page.locator('[aria-label="Toggle menu"]').click();
    await page.waitForTimeout(600);

    console.log('Step 3: Checking controls in menu');
    const enInMenu = page.locator('button:has-text("EN")').last();
    const bgInMenu = page.locator('button:has-text("BG")').last();
    const menuVisible = await enInMenu.isVisible() && await bgInMenu.isVisible();
    console.log('Language buttons visible in menu (should be true):', menuVisible);

    // Capture the top portion of the menu showing all controls
    await page.screenshot({
      path: 'tests/screenshots/final-menu-with-controls.png',
      clip: { x: 0, y: 0, width: 375, height: 350 }
    });
  });
});
