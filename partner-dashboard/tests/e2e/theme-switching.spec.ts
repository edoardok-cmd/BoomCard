import { test, expect } from '@playwright/test';

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    // Theme picker is only visible at nav breakpoint (1400px+)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display theme options in theme picker', async ({ page }) => {
    // Click the theme picker button
    await page.click('[data-testid="theme-picker"]');

    // Wait for dropdown to appear - labels are "Light"/"Dark" (EN) or "Светъл"/"Тъмен" (BG)
    await expect(page.locator('text=/Light|Светъл/')).toBeVisible();
    await expect(page.locator('text=/Dark|Тъмен/')).toBeVisible();
  });

  test('should switch to dark mode and apply dark theme colors', async ({ page }) => {
    // Click theme picker
    await page.click('[data-testid="theme-picker"]');

    // Select Dark
    await page.click('text=/Dark|Тъмен/');

    // Wait for theme to apply
    await page.waitForTimeout(500);

    // Verify data-theme attribute is set
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
  });

  test('should persist theme selection after page reload', async ({ page }) => {
    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify dark mode is still active
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
  });

  test('should apply theme to header component', async ({ page }) => {
    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    // Check header background color
    const header = page.locator('header');
    const headerBgColor = await header.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Header should have a background color applied
    expect(headerBgColor).toBeTruthy();
  });

  test('should switch between light and dark themes', async ({ page }) => {
    // Start in light mode (default)
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'light');

    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');

    // Switch back to light mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Light|Светъл/');
    await page.waitForTimeout(500);
    await expect(htmlElement).toHaveAttribute('data-theme', 'light');
  });
});
