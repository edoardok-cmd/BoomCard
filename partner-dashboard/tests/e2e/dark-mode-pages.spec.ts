import { test, expect } from '@playwright/test';

test.describe('Dark Mode Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Theme picker is only visible at nav breakpoint (1400px+)
    await page.setViewportSize({ width: 1440, height: 900 });
    // Navigate to homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Analytics page should have dark background in dark mode', async ({ page }) => {
    // Enable dark mode via theme picker
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    // Navigate to analytics page
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Verify dark mode is active
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
  });

  test('Rewards/Loyalty page should have dark backgrounds in dark mode', async ({ page }) => {
    // Enable dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    // Navigate to rewards page
    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Verify dark mode persists
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
  });

  test('Dashboard page should have dark background in dark mode', async ({ page }) => {
    // Enable dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    // Navigate to dashboard page
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify dark mode persists
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
  });

  test('All pages should maintain dark mode across navigation', async ({ page }) => {
    const pages = [
      { url: '/analytics', name: 'analytics' },
      { url: '/rewards', name: 'rewards' },
      { url: '/dashboard', name: 'dashboard' },
    ];

    // Enable dark mode
    await page.click('[data-testid="theme-picker"]');
    await page.click('text=/Dark|Тъмен/');
    await page.waitForTimeout(500);

    for (const pageInfo of pages) {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');

      // Verify dark mode persists on each page
      const htmlElement = page.locator('html');
      await expect(htmlElement).toHaveAttribute('data-theme', 'dark');
    }
  });
});
