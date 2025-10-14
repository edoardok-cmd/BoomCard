import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Simple Visibility Test', () => {
  test('Menu opens, is visible, and closes properly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== MOBILE MENU SIMPLE TEST ===\n');

    const hamburgerButton = page.locator('[aria-label="Toggle menu"]');
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    const backdrop = page.locator('.fixed.inset-0').filter({ hasText: '' }).first();

    // Step 1: Menu should be hidden initially
    const initiallyVisible = await menuPanel.isVisible().catch(() => false);
    console.log(`1. Menu initially visible: ${initiallyVisible}`);
    expect(initiallyVisible).toBe(false);

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

    // Step 3: Click backdrop to close
    console.log('3. Closing via backdrop...');
    await page.click('body', { position: { x: 10, y: 300 } });
    await page.waitForTimeout(500);

    const closedViaBackdrop = await menuPanel.isVisible().catch(() => false);
    console.log(`   Menu visible after backdrop close: ${closedViaBackdrop}`);
    expect(closedViaBackdrop).toBe(false);

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
