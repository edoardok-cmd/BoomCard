import { test, expect } from '@playwright/test';

test('Check Light plan Most Bought badge styling', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:3023/');

  // Wait for subscription section to load
  await page.waitForSelector('text=Most Bought', { timeout: 10000 });

  // Find the Most Bought badge
  const mostBoughtBadge = page.locator('text=Most Bought');

  // Verify badge exists
  await expect(mostBoughtBadge).toBeVisible();

  // Get badge styles
  const badgeStyles = await mostBoughtBadge.evaluate((el) => {
    return {
      background: window.getComputedStyle(el).background,
      color: window.getComputedStyle(el).color,
      border: window.getComputedStyle(el).border,
      backdropFilter: window.getComputedStyle(el).backdropFilter,
    };
  });

  console.log('Most Bought badge styles:', badgeStyles);

  // Verify golden border and transparent background
  expect(badgeStyles.border).toContain('rgb(201, 162, 55)');
  expect(badgeStyles.color).toBe('rgb(201, 162, 55)');

  // Take a screenshot focused on subscription section
  await page.locator('text=Subscription Plans').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'tests/screenshots/most-bought-badge.png',
    fullPage: true
  });

  console.log('Screenshot saved to tests/screenshots/most-bought-badge.png');
});
