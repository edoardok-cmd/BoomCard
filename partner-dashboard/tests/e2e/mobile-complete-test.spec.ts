import { test, expect } from '@playwright/test';

test.describe('Mobile Header Complete Implementation', () => {
  test.use({
    viewport: { width: 375, height: 667 },
  });

  test('verify all requirements are met', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // REQUIREMENT 1: Theme switcher should be hidden on mobile header
    const headerThemeSwitcher = page.locator('[data-testid="theme-picker"]');
    const themeHiddenInHeader = !(await headerThemeSwitcher.isVisible().catch(() => false));
    expect(themeHiddenInHeader).toBe(true);

    // Open hamburger menu
    await page.locator('[aria-label="Toggle menu"]').click();
    await page.waitForTimeout(800);

    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(menuPanel).toBeVisible({ timeout: 3000 });

    // REQUIREMENT 2: Theme switcher should be visible inside hamburger menu (light + dark)
    const menuThemeButtons = menuPanel.locator('button:has-text("☀️"), button:has-text("🌙")');
    const themeButtonCount = await menuThemeButtons.count();
    expect(themeButtonCount).toBeGreaterThanOrEqual(2);
  });
});
