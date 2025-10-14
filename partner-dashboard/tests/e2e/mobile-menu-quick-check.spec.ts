import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Quick Check', () => {
  test('Check mobile menu state', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== MOBILE MENU QUICK CHECK ===\n');

    // Open hamburger menu
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await hamburger.click();
    await page.waitForTimeout(800);

    // Take screenshot
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-STATE.png',
      fullPage: false
    });

    console.log('✓ Screenshot saved: mobile-menu-STATE.png');
    console.log('\n✅ CHECK COMPLETE!\n');
  });
});
