import { test, expect } from '@playwright/test';

test('Check homepage CTA button styling', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:3023/');

  // Wait for the hero section to load
  await page.waitForSelector('a[href="/register"]', { timeout: 10000 });

  // Find the CTA button in the hero section
  const ctaButton = page.locator('a[href="/register"]').first().locator('button');

  // Wait for the button to be visible
  await ctaButton.waitFor({ state: 'visible' });

  // Get computed styles
  const backgroundColor = await ctaButton.evaluate((el) => {
    return window.getComputedStyle(el).background;
  });

  const color = await ctaButton.evaluate((el) => {
    return window.getComputedStyle(el).color;
  });

  const border = await ctaButton.evaluate((el) => {
    return window.getComputedStyle(el).border;
  });

  console.log('CTA Button Styles:');
  console.log('Background:', backgroundColor);
  console.log('Color:', color);
  console.log('Border:', border);

  // Take a screenshot
  await page.screenshot({ path: 'tests/screenshots/homepage-cta.png', fullPage: true });

  console.log('Screenshot saved to tests/screenshots/homepage-cta.png');
});
