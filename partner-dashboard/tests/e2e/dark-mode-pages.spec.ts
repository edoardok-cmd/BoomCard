import { test, expect } from '@playwright/test';

test.describe('Dark Mode Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:5173');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('Analytics page should have dark background in dark mode', async ({ page }) => {
    // Enable dark mode
    await page.click('[aria-label="Toggle theme"]');

    // Navigate to analytics page
    await page.goto('http://localhost:5173/analytics');
    await page.waitForLoadState('networkidle');

    // Wait for page content to render
    await page.waitForSelector('h1:has-text("Анализи")', { timeout: 5000 });

    // Check that the page container has dark background
    const pageContainer = page.locator('div').first();
    const backgroundColor = await pageContainer.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Dark background should be rgb(17, 24, 39) which is #111827
    expect(backgroundColor).toContain('rgb(17, 24, 39)');

    console.log('✓ Analytics page has dark background');
  });

  test('Rewards/Loyalty page should have dark backgrounds in dark mode', async ({ page }) => {
    // Enable dark mode
    await page.click('[aria-label="Toggle theme"]');

    // Navigate to rewards page
    await page.goto('http://localhost:5173/rewards');
    await page.waitForLoadState('networkidle');

    // Wait for page content to render
    await page.waitForSelector('h1', { timeout: 5000 });

    // Take a screenshot to verify visually
    await page.screenshot({
      path: 'test-results/rewards-dark-mode.png',
      fullPage: true
    });

    console.log('✓ Rewards page screenshot captured');
  });

  test('Dashboard page Recent Activity should have dark background in dark mode', async ({ page }) => {
    // Enable dark mode
    await page.click('[aria-label="Toggle theme"]');

    // Navigate to dashboard page
    await page.goto('http://localhost:5173/dashboard');
    await page.waitForLoadState('networkidle');

    // Wait for page content to render
    await page.waitForSelector('h1', { timeout: 5000 });

    // Scroll to Recent Activity section
    await page.evaluate(() => {
      const element = document.querySelector('h2');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    await page.waitForTimeout(500);

    // Take a screenshot to verify visually
    await page.screenshot({
      path: 'test-results/dashboard-dark-mode.png',
      fullPage: true
    });

    console.log('✓ Dashboard page screenshot captured');
  });

  test('All three pages side-by-side comparison', async ({ page }) => {
    const pages = [
      { url: 'http://localhost:5173/analytics', name: 'analytics' },
      { url: 'http://localhost:5173/rewards', name: 'rewards' },
      { url: 'http://localhost:5173/dashboard', name: 'dashboard' },
    ];

    // Enable dark mode
    await page.click('[aria-label="Toggle theme"]');

    for (const pageInfo of pages) {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Take screenshot
      await page.screenshot({
        path: `test-results/${pageInfo.name}-dark-comparison.png`,
        fullPage: true
      });

      console.log(`✓ ${pageInfo.name} page screenshot captured`);
    }
  });
});
