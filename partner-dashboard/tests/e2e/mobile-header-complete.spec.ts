import { test, expect } from '@playwright/test';

test.describe('Mobile Header - All Buttons Hidden', () => {
  test('Mobile header should only show logo and hamburger', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== MOBILE HEADER TEST ===\n');

    // Screenshot of closed header
    await page.screenshot({
      path: 'tests/screenshots/mobile-header-CLEAN.png',
      clip: { x: 0, y: 0, width: 375, height: 70 }
    });

    console.log('✓ Header screenshot (closed)');

    // Check that buttons are hidden
    const nearbyBtn = page.locator('[aria-label="Nearby Offers"]').first();
    const favoritesBtn = page.locator('[aria-label="Favorites"]').first();
    const getStartedBtn = page.locator('a[href="/register"]').first();

    const nearbyVisible = await nearbyBtn.isVisible();
    const favoritesVisible = await favoritesBtn.isVisible();
    const getStartedVisible = await getStartedBtn.isVisible();

    console.log(`\nButtons in header (should all be false):`);
    console.log(`  Nearby: ${nearbyVisible}`);
    console.log(`  Favorites: ${favoritesVisible}`);
    console.log(`  Get Started: ${getStartedVisible}`);

    expect(nearbyVisible).toBe(false);
    expect(favoritesVisible).toBe(false);
    expect(getStartedVisible).toBe(false);

    // Open hamburger menu
    console.log('\n=== Opening hamburger menu ===\n');
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await hamburger.click();
    await page.waitForTimeout(1000);

    // Scroll to top to ensure menu panel is visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Screenshot of full page with menu open showing the side panel
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-EXPANDED.png',
      fullPage: false
    });

    console.log('✓ Menu screenshot (expanded)');

    // Check that buttons are visible in menu
    const nearbyInMenu = page.locator('a[href="/nearby"]').last();
    const favoritesInMenu = page.locator('a[href="/favorites"]').last();
    const getStartedInMenu = page.locator('a[href="/register"]').last();

    const nearbyInMenuVisible = await nearbyInMenu.isVisible();
    const favoritesInMenuVisible = await favoritesInMenu.isVisible();
    const getStartedInMenuVisible = await getStartedInMenu.isVisible();

    console.log(`\nButtons in menu (should all be true):`);
    console.log(`  Nearby: ${nearbyInMenuVisible}`);
    console.log(`  Favorites: ${favoritesInMenuVisible}`);
    console.log(`  Get Started: ${getStartedInMenuVisible}`);

    expect(nearbyInMenuVisible).toBe(true);
    expect(favoritesInMenuVisible).toBe(true);
    expect(getStartedInMenuVisible).toBe(true);

    console.log('\n✅ ALL CHECKS PASSED!\n');
  });
});
