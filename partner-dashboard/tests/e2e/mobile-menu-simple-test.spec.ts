import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Simple Visibility Test', () => {
  test('Menu opens, is visible, and closes properly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== MOBILE MENU SIMPLE TEST ===\n');

    const hamburgerButton = page.locator('[aria-label="Toggle menu"]');
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    const backdrop = page.locator('.fixed.inset-0').filter({ hasText: '' }).first();

    // Step 1: Menu should be hidden initially (not in DOM or not visible)
    await expect(menuPanel).not.toBeVisible({ timeout: 2000 });

    // Step 2: Click hamburger to open
    console.log('2. Opening menu...');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    const openMenuVisible = await menuPanel.isVisible();
    console.log(`   Menu visible after open: ${openMenuVisible}`);
    expect(openMenuVisible).toBe(true);

    // Take screenshot of open menu
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-OPEN.png',
      fullPage: false
    });
    console.log('   ✓ Screenshot saved: mobile-menu-OPEN.png');

    // Step 3: Close via hamburger button
    console.log('3. Closing via hamburger button...');
    await hamburgerButton.click();
    await page.waitForTimeout(800);

    await expect(menuPanel).not.toBeVisible({ timeout: 3000 });

    // Step 4: Reopen and close via hamburger button
    console.log('4. Reopening menu...');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    const reopenedVisible = await menuPanel.isVisible();
    console.log(`   Menu visible after reopen: ${reopenedVisible}`);
    expect(reopenedVisible).toBe(true);

    console.log('5. Closing via hamburger button...');
    await hamburgerButton.click();
    await page.waitForTimeout(500);

    const finallyGone = await menuPanel.isVisible().catch(() => false);
    console.log(`   Menu visible after hamburger close: ${finallyGone}`);
    expect(finallyGone).toBe(false);

    console.log('\n✅ ALL TESTS PASSED!\n');
  });
});
