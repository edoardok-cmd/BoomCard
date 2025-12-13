import { test, expect } from '@playwright/test';

test('Check navigation items are centered', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:3023/');

  // Wait for navigation to load
  await page.waitForSelector('nav', { timeout: 10000 });

  // Find the navigation wrapper
  const nav = page.locator('nav').first();

  // Get navigation styles
  const navStyles = await nav.evaluate((el) => {
    return {
      display: window.getComputedStyle(el).display,
      alignItems: window.getComputedStyle(el).alignItems,
      justifyContent: window.getComputedStyle(el).justifyContent,
      gap: window.getComputedStyle(el).gap,
    };
  });

  console.log('Navigation styles:', navStyles);

  // Verify centering
  expect(navStyles.justifyContent).toBe('center');
  expect(navStyles.alignItems).toBe('center');

  // Get all navigation links
  const navLinks = page.locator('nav a');
  const count = await navLinks.count();
  console.log(`Found ${count} navigation links`);

  // List navigation items
  for (let i = 0; i < count; i++) {
    const text = await navLinks.nth(i).textContent();
    console.log(`Nav item ${i + 1}: ${text}`);
  }

  // Take a screenshot of the header
  await page.screenshot({
    path: 'tests/screenshots/navigation-centered.png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 1920, height: 200 }
  });

  console.log('Screenshot saved to tests/screenshots/navigation-centered.png');
});
