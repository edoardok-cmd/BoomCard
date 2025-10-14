import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Collapsed by Default', () => {
  test('Navigation menus should be collapsed by default in hamburger menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== MOBILE MENU COLLAPSE TEST ===\n');

    // Open hamburger menu
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await hamburger.click();
    await page.waitForTimeout(1000);

    // Check that menu panel is visible
    const menuPanel = page.locator('nav').first();
    const isPanelVisible = await menuPanel.isVisible();
    console.log(`Menu panel visible: ${isPanelVisible}`);
    expect(isPanelVisible).toBe(true);

    // Look for expanded menu sections - they should NOT be visible by default
    // We'll check for common navigation items that would be in expanded sections
    const expandedSections = page.locator('[role="region"][aria-expanded="true"]');
    const expandedCount = await expandedSections.count();

    console.log(`\nExpanded sections count: ${expandedCount}`);
    console.log('Expected: 0 (all sections should be collapsed)');

    // Check for presence of collapsed sections
    const collapsedSections = page.locator('[role="region"][aria-expanded="false"]');
    const collapsedCount = await collapsedSections.count();

    console.log(`Collapsed sections count: ${collapsedCount}`);

    // Take screenshot of menu with all sections collapsed
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-COLLAPSED.png',
      fullPage: false
    });

    console.log('\n✓ Screenshot saved: mobile-menu-COLLAPSED.png');

    // The main assertion - no sections should be auto-expanded
    expect(expandedCount).toBe(0);

    console.log('\n✅ MENU COLLAPSED TEST PASSED!\n');
  });
});
