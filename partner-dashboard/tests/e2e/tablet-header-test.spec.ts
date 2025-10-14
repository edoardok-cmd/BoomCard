import { test } from '@playwright/test';

test.describe('Tablet/Laptop Header Test', () => {
  test('should test at 1024px (lg breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/screenshots/tablet-1024-header.png',
      clip: { x: 0, y: 0, width: 1024, height: 80 }
    });

    const langToggle = page.locator('button:has-text("EN")').first();
    const themeSwitcher = page.locator('[aria-label="Change theme"]').first();
    
    console.log('=== AT 1024px (lg breakpoint) ===');
    console.log('Language toggle visible:', await langToggle.isVisible());
    console.log('Theme switcher visible:', await themeSwitcher.isVisible());
  });

  test('should test at 1023px (just below lg)', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/screenshots/tablet-1023-header.png',
      clip: { x: 0, y: 0, width: 1023, height: 80 }
    });

    const langToggle = page.locator('button:has-text("EN")').first();
    const themeSwitcher = page.locator('[aria-label="Change theme"]').first();
    
    console.log('=== AT 1023px (just below lg) ===');
    console.log('Language toggle visible (should be FALSE):', await langToggle.isVisible());
    console.log('Theme switcher visible (should be FALSE):', await themeSwitcher.isVisible());
  });

  test('should test at 900px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/screenshots/tablet-900-header.png',
      clip: { x: 0, y: 0, width: 900, height: 80 }
    });

    await page.screenshot({
      path: 'tests/screenshots/tablet-900-hero.png',
      clip: { x: 0, y: 80, width: 900, height: 500 }
    });

    const langToggle = page.locator('button:has-text("EN")').first();
    const themeSwitcher = page.locator('[aria-label="Change theme"]').first();
    
    console.log('=== AT 900px ===');
    console.log('Language toggle visible (should be FALSE):', await langToggle.isVisible());
    console.log('Theme switcher visible (should be FALSE):', await themeSwitcher.isVisible());
  });
});
