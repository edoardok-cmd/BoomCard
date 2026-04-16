import { test, expect } from '@playwright/test';

test.describe('Mobile Header - Layout', () => {
  test('Mobile header should show hamburger and hide desktop nav', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Hamburger should be visible on mobile
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();

    // Theme picker should be hidden on mobile (only visible at nav breakpoint 1400px+)
    const themePicker = page.locator('[data-testid="theme-picker"]');
    const themeVisible = await themePicker.isVisible().catch(() => false);
    expect(themeVisible).toBe(false);

    // Open hamburger menu
    await hamburger.click();
    await page.waitForTimeout(800);

    // Mobile menu panel should be visible
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(menuPanel).toBeVisible({ timeout: 3000 });
  });
});
