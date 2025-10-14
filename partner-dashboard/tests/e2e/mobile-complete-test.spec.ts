import { test, expect } from '@playwright/test';

test.describe('Mobile Header Complete Implementation', () => {
  test.use({
    viewport: { width: 375, height: 667 },
  });

  test('verify all requirements are met', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    // REQUIREMENT 1: Language toggle (EN/BG) should be hidden on mobile header
    console.log('\n=== REQUIREMENT 1: Language toggle hidden on header ===');
    const headerLangToggle = page.locator('header').locator('button:has-text("EN")').first();
    const isHiddenInHeader = !(await headerLangToggle.isVisible());
    console.log('✓ Language toggle hidden in header:', isHiddenInHeader);
    expect(isHiddenInHeader).toBe(true);

    // REQUIREMENT 2: Theme switcher should be hidden on mobile header
    console.log('\n=== REQUIREMENT 2: Theme switcher hidden on header ===');
    // Theme switcher uses an icon button, check if it's hidden
    const headerThemeSwitcher = page.locator('header').locator('[aria-label="Change theme"]').first();
    const themeHiddenInHeader = !(await headerThemeSwitcher.isVisible());
    console.log('✓ Theme switcher hidden in header:', themeHiddenInHeader);
    expect(themeHiddenInHeader).toBe(true);

    // Open hamburger menu
    console.log('\n=== Opening hamburger menu ===');
    await page.locator('[aria-label="Toggle menu"]').click();
    await page.waitForTimeout(800);

    // REQUIREMENT 3: Language toggle should be visible inside hamburger menu
    console.log('\n=== REQUIREMENT 3: Language toggle visible in menu ===');
    const menuEnButton = page.locator('button:has-text("EN")').last();
    const menuBgButton = page.locator('button:has-text("BG")').last();
    const langVisibleInMenu = await menuEnButton.isVisible() && await menuBgButton.isVisible();
    console.log('✓ Language buttons visible in menu:', langVisibleInMenu);
    expect(langVisibleInMenu).toBe(true);

    // REQUIREMENT 4: Theme switcher should be visible inside hamburger menu
    console.log('\n=== REQUIREMENT 4: Theme switcher visible in menu ===');
    const menuThemeButtons = page.locator('button:has-text("Light"), button:has-text("Dark"), button:has-text("Color")');
    const themeButtonCount = await menuThemeButtons.count();
    console.log('✓ Theme buttons found in menu:', themeButtonCount, '(expected: 3)');
    expect(themeButtonCount).toBeGreaterThanOrEqual(3);

    console.log('\n=== ALL REQUIREMENTS MET ===\n');
  });
});
