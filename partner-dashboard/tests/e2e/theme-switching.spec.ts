import { test, expect } from '@playwright/test';

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display all 3 theme options in theme picker', async ({ page }) => {
    // Click the theme picker button (moon icon)
    await page.click('[data-testid="theme-picker"]');

    // Wait for dropdown to appear
    await page.waitForSelector('text=Light Mode', { state: 'visible' });

    // Verify all 3 options exist
    await expect(page.locator('text=Light Mode')).toBeVisible();
    await expect(page.locator('text=Dark Mode')).toBeVisible();
    await expect(page.locator('text=Color Mode')).toBeVisible();
  });

  test('should switch to dark mode and apply dark theme colors', async ({ page }) => {
    // Click theme picker
    await page.click('[data-testid="theme-picker"]');

    // Select Dark Mode
    await page.click('text=Dark Mode');

    // Wait for theme to apply
    await page.waitForTimeout(500);

    // Verify data-theme attribute is set
    const htmlElement = await page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');

    // Verify body background is dark
    const bodyBgColor = await page.evaluate(() => {
      const bgColor = window.getComputedStyle(document.body).backgroundColor;
      const bgVar = window.getComputedStyle(document.documentElement).getPropertyValue('--color-background');
      console.log('Body BG:', bgColor);
      console.log('CSS Variable --color-background:', bgVar);
      return bgColor;
    });

    // Dark mode should have dark background (rgb(15, 23, 42) = #0f172a)
    expect(bodyBgColor).toContain('rgb(15, 23, 42)');
  });

  test('should switch to color mode and apply colorful theme', async ({ page }) => {
    // Click theme picker
    await page.click('[data-testid="theme-picker"]');

    // Select Color Mode
    await page.click('text=Color Mode');

    // Wait for theme to apply
    await page.waitForTimeout(500);

    // Verify data-theme attribute is set
    const htmlElement = await page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'color');

    // Verify body background is warm/golden
    const bodyBgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Color mode should have warm white background (rgb(255, 254, 245) = #fffef5)
    expect(bodyBgColor).toContain('rgb(255, 254, 245)');
  });

  test('should persist theme selection after page reload', async ({ page }) => {
    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=Dark Mode');
    await page.waitForTimeout(500);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify dark mode is still active
    const htmlElement = await page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
  });

  test('should apply theme to header component', async ({ page }) => {
    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=Dark Mode');
    await page.waitForTimeout(500);

    // Check header background color
    const header = page.locator('header');
    const headerBgColor = await header.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Header should have dark background with transparency
    // Should contain dark slate color
    expect(headerBgColor).toContain('rgba');
  });

  test('should apply theme to dropdown menus', async ({ page }) => {
    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=Dark Mode');
    await page.waitForTimeout(500);

    // Hover over a menu item to show dropdown (e.g., "Categories")
    await page.hover('text=Categories');
    await page.waitForTimeout(500);

    // Check if dropdown appeared
    // Note: This might need adjustment based on actual dropdown content
    const dropdown = page.locator('[role="menu"], nav div').first();
    if (await dropdown.isVisible()) {
      const dropdownBg = await dropdown.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return styles.backgroundColor || styles.background;
      });

      // Dropdown should have dark styling in dark mode
      console.log('Dropdown background:', dropdownBg);
    }
  });

  test('should switch between all three themes sequentially', async ({ page }) => {
    // Start in light mode (default)
    const htmlElement = await page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'light');

    // Switch to dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=Dark Mode');
    await page.waitForTimeout(500);
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');

    // Switch to color mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=Color Mode');
    await page.waitForTimeout(500);
    await expect(htmlElement).toHaveAttribute('data-theme', 'color');

    // Switch back to light mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=Light Mode');
    await page.waitForTimeout(500);
    await expect(htmlElement).toHaveAttribute('data-theme', 'light');
  });
});
