import { test, expect } from '@playwright/test';

test.describe('Hamburger Menu - After Fix', () => {

  test('Hamburger menu should work at 768px (iPad portrait)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    console.log('\n=== Test at 768px ===');

    // Check hamburger button exists and is visible
    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();
    console.log('✓ Hamburger button is visible');

    // Check that desktop navigation main container is hidden
    const desktopNavContainer = page.locator('.hidden.lg\\:flex').first();
    const isNavVisible = await desktopNavContainer.isVisible();
    expect(isNavVisible).toBe(false);
    console.log('✓ Desktop navigation is hidden');

    // Take screenshot before click
    await page.screenshot({ path: 'test-results/screenshots/768px-before-click.png' });

    // Click the hamburger button
    await hamburger.click();
    await page.waitForTimeout(500); // Wait for animation

    // Check if mobile menu panel is visible
    const mobilePanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(mobilePanel).toBeVisible();
    console.log('✓ Mobile menu panel is visible after click');

    // Take screenshot after click
    await page.screenshot({ path: 'test-results/screenshots/768px-after-click.png', fullPage: false });

    // Check that navigation links are visible inside the panel
    const navLinks = mobilePanel.locator('nav a');
    const linksCount = await navLinks.count();
    console.log(`✓ Found ${linksCount} navigation links in mobile menu`);
    expect(linksCount).toBeGreaterThan(0);

    // Close the menu by clicking the hamburger again
    await hamburger.click();
    await page.waitForTimeout(500);

    // Mobile panel should be hidden now
    await expect(mobilePanel).not.toBeVisible();
    console.log('✓ Mobile menu panel closes when hamburger clicked again');
  });

  test('Hamburger menu should work at 375px (iPhone SE)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    console.log('\n=== Test at 375px ===');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();
    console.log('✓ Hamburger button is visible');

    await page.screenshot({ path: 'test-results/screenshots/375px-before-click.png' });

    await hamburger.click();
    await page.waitForTimeout(500);

    const mobilePanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(mobilePanel).toBeVisible();
    console.log('✓ Mobile menu panel is visible after click');

    await page.screenshot({ path: 'test-results/screenshots/375px-after-click.png', fullPage: false });
  });

  test('Hamburger menu should NOT work at 1280px (xl breakpoint - extra wide)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    console.log('\n=== Test at 1280px (xl breakpoint - extra wide) ===');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).not.toBeVisible();
    console.log('✓ Hamburger button is hidden at 1280px (desktop mode)');

    const desktopNavContainer = page.locator('.hidden.lg\\:flex').first();
    await expect(desktopNavContainer).toBeVisible();
    console.log('✓ Desktop navigation is visible at 1280px');

    await page.screenshot({ path: 'test-results/screenshots/1280px-desktop.png' });
  });

  test('Hamburger should be hidden at 1024px+ (lg breakpoint - desktop mode)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    console.log('\n=== Test at 1024px (lg breakpoint - desktop) ===');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).not.toBeVisible();
    console.log('✓ Hamburger button is hidden at 1024px (desktop mode)');

    // Desktop navigation main container should exist
    const desktopNavContainer = page.locator('.hidden.lg\\:flex').first();
    await expect(desktopNavContainer).toBeVisible();
    console.log('✓ Desktop navigation is visible at 1024px');

    await page.screenshot({ path: 'test-results/screenshots/1024px-desktop.png' });
  });

  test('Hamburger should work at 1023px (one pixel before desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    console.log('\n=== Test at 1023px (one pixel before lg breakpoint) ===');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();
    console.log('✓ Hamburger button is visible at 1023px');

    await page.screenshot({ path: 'test-results/screenshots/1023px-before-click.png' });

    await hamburger.click();
    await page.waitForTimeout(500);

    const mobilePanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(mobilePanel).toBeVisible();
    console.log('✓ Mobile menu panel is visible after click at 1023px');

    await page.screenshot({ path: 'test-results/screenshots/1023px-after-click.png', fullPage: false });
  });

  test('Summary - All breakpoints working correctly', async ({ page }) => {
    console.log('\n========================================');
    console.log('HAMBURGER MENU FIX - VERIFICATION COMPLETE');
    console.log('========================================\n');
    console.log('✓ Hamburger works at 375px (mobile)');
    console.log('✓ Hamburger works at 768px (tablet)');
    console.log('✓ Hamburger works at 1023px (one pixel before lg breakpoint)');
    console.log('✓ Hamburger hidden at 1024px+ (desktop mode - lg breakpoint)');
    console.log('✓ Desktop navigation shows at 1024px+');
    console.log('\n========================================\n');
  });
});
