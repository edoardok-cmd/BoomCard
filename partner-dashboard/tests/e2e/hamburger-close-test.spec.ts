import { test, expect } from '@playwright/test';

test.describe('Hamburger Button Close Test', () => {
  test('Hamburger button toggles menu open and closed', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== HAMBURGER TOGGLE TEST ===\n');

    const hamburger = page.locator('[aria-label="Toggle menu"]');
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');

    // 1. Open menu with hamburger
    console.log('1. Opening menu with hamburger...');
    await hamburger.click();
    await page.waitForTimeout(600);

    const openVisible = await menuPanel.isVisible();
    console.log(`   Menu visible: ${openVisible}`);
    expect(openVisible).toBe(true);

    // 2. Close menu with hamburger (X button)
    console.log('2. Closing menu with hamburger X button...');
    await hamburger.click();
    await page.waitForTimeout(600);

    const closedVisible = await menuPanel.isVisible().catch(() => false);
    console.log(`   Menu visible after close: ${closedVisible}`);
    expect(closedVisible).toBe(false);

    console.log('\n✅ HAMBURGER TOGGLE WORKS!\n');
  });
});
