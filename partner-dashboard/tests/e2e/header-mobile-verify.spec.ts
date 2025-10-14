import { test, expect } from '@playwright/test';

test.describe('Mobile Header Verification', () => {
  test.use({
    viewport: { width: 375, height: 667 },
  });

  test('should verify menu controls in hamburger', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    // Click hamburger menu
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await hamburger.click();
    await page.waitForTimeout(1000);

    // Take full page screenshot to see the menu
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-full.png',
      fullPage: false
    });

    // Check if language buttons exist in menu
    const enButton = page.locator('button:has-text("EN")').last();
    const bgButton = page.locator('button:has-text("BG")').last();
    
    const enVisible = await enButton.isVisible();
    const bgVisible = await bgButton.isVisible();
    
    console.log('EN button visible in menu:', enVisible);
    console.log('BG button visible in menu:', bgVisible);
  });
});
