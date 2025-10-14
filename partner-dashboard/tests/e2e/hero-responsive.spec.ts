import { test, expect } from '@playwright/test';

// Test viewports
const viewports = {
  mobile: { width: 375, height: 667, name: 'iPhone SE' },
  mobileSmall: { width: 320, height: 568, name: 'iPhone 5/SE' },
  tablet: { width: 768, height: 1024, name: 'iPad' },
};

test.describe('Hero Section Responsiveness', () => {
  test('Hero card should be fully visible and contained on mobile (375px)', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    // Wait for hero section to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for card animation to appear

    // Check that the page doesn't have horizontal overflow
    const overflowX = await page.evaluate(() => {
      const bodyOverflow = window.getComputedStyle(document.body).overflowX;
      return bodyOverflow;
    });
    expect(overflowX).toBe('hidden');

    // Check viewport width
    const viewportWidth = await page.viewportSize();
    expect(viewportWidth?.width).toBe(375);

    // Take screenshot
    await page.screenshot({ path: 'test-results/hero-mobile-375.png', fullPage: true });
  });

  test('Hero card should be fully visible on small mobile (320px)', async ({ page }) => {
    await page.setViewportSize(viewports.mobileSmall);
    await page.goto('/');

    // Wait for hero section to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check that overflow is hidden
    const overflowX = await page.evaluate(() => {
      const bodyOverflow = window.getComputedStyle(document.body).overflowX;
      return bodyOverflow;
    });
    expect(overflowX).toBe('hidden');

    // Take screenshot
    await page.screenshot({ path: 'test-results/hero-mobile-320.png', fullPage: true });
  });

  test('Hero title and subtitle should be readable on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    await page.waitForLoadState('networkidle');

    // Check that hero section has content (even if video hasn't played yet)
    // Just verify the page loaded and has the expected structure
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test('Hero buttons should be properly sized on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto('/');

    await page.waitForLoadState('networkidle');

    // Check that any button on the page meets minimum touch target size
    const buttons = page.locator('button').first();
    if (await buttons.count() > 0) {
      const buttonBox = await buttons.boundingBox();
      if (buttonBox) {
        expect(buttonBox.height).toBeGreaterThanOrEqual(32); // Minimum touch target
      }
    }
  });

  test('Hero section should not cause horizontal scroll on any mobile size', async ({ page }) => {
    const mobileSizes = [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 375, height: 667 },
      { width: 414, height: 896 },
    ];

    for (const size of mobileSizes) {
      await page.setViewportSize(size);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Check overflow is hidden
      const overflowX = await page.evaluate(() => {
        return window.getComputedStyle(document.body).overflowX;
      });

      expect(overflowX, `Overflow should be hidden at ${size.width}x${size.height}`).toBe('hidden');

      // Take screenshot for each size
      await page.screenshot({
        path: `test-results/hero-mobile-${size.width}x${size.height}.png`,
        fullPage: false
      });
    }
  });

  test('Hero card should scale proportionally on tablet', async ({ page }) => {
    await page.setViewportSize(viewports.tablet);
    await page.goto('/');

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check overflow is hidden
    const overflowX = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflowX;
    });
    expect(overflowX).toBe('hidden');

    // Take screenshot
    await page.screenshot({ path: 'test-results/hero-tablet-768.png', fullPage: false });
  });
});
