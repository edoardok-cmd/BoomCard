import { test } from '@playwright/test';

test.describe('User Viewport Test', () => {
  test('should test at ~860px (user screenshot size)', async ({ page }) => {
    await page.setViewportSize({ width: 864, height: 1400 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scroll to show cards
    await page.evaluate(() => window.scrollTo(0, 100));
    await page.waitForTimeout(500);

    // Full page screenshot
    await page.screenshot({
      path: 'tests/screenshots/user-viewport-full.png',
      fullPage: false
    });

    // Header only
    await page.screenshot({
      path: 'tests/screenshots/user-viewport-header.png',
      clip: { x: 0, y: 0, width: 864, height: 130 }
    });

    // Hero section with cards
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: 'tests/screenshots/user-viewport-hero-cards.png',
      clip: { x: 0, y: 70, width: 864, height: 700 }
    });

    const langToggle = page.locator('button:has-text("EN")').first();
    const themeSwitcher = page.locator('[aria-label="Change theme"]').first();
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    
    console.log('=== AT 864px (user viewport) ===');
    console.log('Language toggle visible:', await langToggle.isVisible());
    console.log('Theme switcher visible:', await themeSwitcher.isVisible());
    console.log('Hamburger menu visible:', await hamburger.isVisible());
    
    // Check if hamburger menu works
    await hamburger.click();
    await page.waitForTimeout(800);
    
    await page.screenshot({
      path: 'tests/screenshots/user-viewport-menu-open.png',
      clip: { x: 0, y: 0, width: 864, height: 500 }
    });
    
    const enInMenu = page.locator('button:has-text("EN")').last();
    console.log('EN button in menu visible:', await enInMenu.isVisible());
  });
});
