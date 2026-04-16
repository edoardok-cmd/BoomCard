import { test, expect } from '@playwright/test';

test.describe('Dark Mode Visual Verification', () => {
  test('should apply dark mode across multiple pages', async ({ page }) => {
    // Theme picker is only visible at nav breakpoint (1400px+)
    await page.setViewportSize({ width: 1440, height: 900 });

    // Go to homepage
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Enable dark mode via theme picker
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    // Verify dark mode is active
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Verify dark mode persists on other pages
    for (const path of ['/analytics', '/rewards', '/dashboard']) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    }
  });
});
