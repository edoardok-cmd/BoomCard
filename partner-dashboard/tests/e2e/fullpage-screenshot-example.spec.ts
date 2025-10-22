import { test, expect } from '@playwright/test';
import { captureFullPageScreenshot, getPageDimensions } from '../utils/screenshot-helper';

/**
 * Example test demonstrating full-page screenshot helper usage
 * This test shows how to capture complete pages including content below the fold
 */

test.describe('Full-Page Screenshot Examples', () => {
  test('homepage full-page screenshot with helper', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Get page dimensions for verification
    const dimensions = await getPageDimensions(page);
    console.log(`Page dimensions: ${dimensions.scrollHeight}px tall (viewport: ${dimensions.viewportHeight}px)`);

    // Capture full-page screenshot with helper (handles internal scroll containers)
    await captureFullPageScreenshot(
      page,
      'test-results/homepage-fullpage-example.png',
      { debug: true }  // Enable debug output to see what's happening
    );

    // Verify screenshot was created
    // In a real test, you might verify dimensions or compare against baseline
    expect(dimensions.scrollHeight).toBeGreaterThan(0);
  });

  test('compare helper vs built-in fullPage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Method 1: Helper utility (recommended - handles internal scroll containers)
    await captureFullPageScreenshot(
      page,
      'test-results/comparison-helper.png',
      { debug: true }
    );

    // Method 2: Built-in Playwright fullPage
    await page.screenshot({
      path: 'test-results/comparison-builtin.png',
      fullPage: true
    });

    // Both should capture full page, but helper is more robust for internal scroll containers
    console.log('✅ Both screenshots captured. Compare file sizes:');
    console.log('   - If similar: built-in fullPage works for this page');
    console.log('   - If helper is larger: page has internal scroll containers');
  });

  test('mobile viewport full-page screenshot', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Even with small viewport, capture entire page
    await captureFullPageScreenshot(
      page,
      'test-results/mobile-fullpage-example.png',
      {
        debug: true,
        scrollWait: 1500  // Wait longer on mobile for lazy loading
      }
    );

    const dimensions = await getPageDimensions(page);
    console.log(`Mobile page: ${dimensions.scrollHeight}px tall`);

    // Page should be taller than viewport
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.viewportHeight);
  });
});
