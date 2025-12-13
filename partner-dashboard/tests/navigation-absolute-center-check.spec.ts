import { test, expect } from '@playwright/test';

test('Check navigation items are absolutely centered on page', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:3023/');

  // Wait for navigation to load
  await page.waitForSelector('nav', { timeout: 10000 });

  // Get page width
  const pageWidth = await page.evaluate(() => window.innerWidth);
  console.log('Page width:', pageWidth);

  // Find the navigation container (the div that contains the nav)
  const navContainer = page.locator('.hidden.lg\\:flex.items-center.justify-center.absolute').first();

  // Get the bounding box of the navigation container
  const navBox = await navContainer.boundingBox();

  if (navBox) {
    const navCenter = navBox.x + (navBox.width / 2);
    const pageCenter = pageWidth / 2;
    const offset = Math.abs(navCenter - pageCenter);

    console.log('Navigation center X:', navCenter);
    console.log('Page center X:', pageCenter);
    console.log('Offset from center:', offset);

    // Navigation should be centered within 5px tolerance
    expect(offset).toBeLessThan(5);
  }

  // Get all navigation links
  const navLinks = page.locator('nav a');
  const count = await navLinks.count();
  console.log(`Found ${count} navigation links`);

  // Take a screenshot with guidelines
  await page.screenshot({
    path: 'tests/screenshots/navigation-absolute-center.png',
    fullPage: false,
    clip: { x: 0, y: 0, width: 1920, height: 200 }
  });

  console.log('Screenshot saved to tests/screenshots/navigation-absolute-center.png');
});
