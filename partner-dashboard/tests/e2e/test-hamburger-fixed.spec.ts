import { test, expect } from '@playwright/test';

test.describe('Hamburger Menu - Breakpoint Tests', () => {

  test('Hamburger menu should work at 768px (iPad portrait)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Hamburger should be visible below nav breakpoint (1400px)
    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();

    // Click to open menu
    await hamburger.click();
    await page.waitForTimeout(500);

    // Mobile menu panel should be visible
    const mobilePanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(mobilePanel).toBeVisible();

    // Close the menu
    await hamburger.click();
    await page.waitForTimeout(500);
    await expect(mobilePanel).not.toBeVisible();
  });

  test('Hamburger menu should work at 375px (iPhone SE)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();

    await hamburger.click();
    await page.waitForTimeout(500);

    const mobilePanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(mobilePanel).toBeVisible();
  });

  test('Hamburger should be hidden at 1440px (above nav breakpoint)', async ({ page }) => {
    // nav breakpoint is 1400px — hamburger hides above it
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).not.toBeVisible();
  });

  test('Hamburger should be visible at 1399px (just below nav breakpoint)', async ({ page }) => {
    await page.setViewportSize({ width: 1399, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();

    await hamburger.click();
    await page.waitForTimeout(800);

    const mobilePanel = page.locator('[data-testid="mobile-menu-panel"]');
    await expect(mobilePanel).toBeVisible({ timeout: 3000 });
  });

  test('Hamburger should still be visible at 1280px', async ({ page }) => {
    // 1280px is below the nav breakpoint (1400px)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator('button[aria-label="Toggle menu"]');
    await expect(hamburger).toBeVisible();
  });
});
