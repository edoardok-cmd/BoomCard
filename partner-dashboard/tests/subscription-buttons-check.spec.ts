import { test, expect } from '@playwright/test';

test('Check subscription plan buttons are centered and animated', async ({ page }) => {
  // Navigate to the homepage
  await page.goto('http://localhost:3023/');

  // Wait for subscription section to load
  await page.waitForSelector('text=Choose Plan', { timeout: 10000 });

  // Find all "Choose Plan" buttons
  const buttons = page.locator('text=Choose Plan').locator('..');

  // Verify we have 3 buttons (one for each plan)
  const count = await buttons.count();
  console.log(`Found ${count} "Choose Plan" buttons`);

  // Check the first button's parent container for centering
  const firstButtonContainer = buttons.first().locator('..');
  const containerStyles = await firstButtonContainer.evaluate((el) => {
    return {
      display: window.getComputedStyle(el).display,
      justifyContent: window.getComputedStyle(el).justifyContent,
      alignItems: window.getComputedStyle(el).alignItems,
    };
  });

  console.log('Button container styles:', containerStyles);

  // Check button animation properties
  const firstButton = buttons.first();
  const buttonStyles = await firstButton.evaluate((el) => {
    return {
      animation: window.getComputedStyle(el).animation,
      background: window.getComputedStyle(el).background,
      transition: window.getComputedStyle(el).transition,
      position: window.getComputedStyle(el).position,
      overflow: window.getComputedStyle(el).overflow,
    };
  });

  console.log('Button animation styles:', buttonStyles);

  // Take a screenshot of the subscription section
  await page.screenshot({
    path: 'tests/screenshots/subscription-buttons.png',
    fullPage: true
  });

  console.log('Screenshot saved to tests/screenshots/subscription-buttons.png');

  // Verify buttons are clickable and have proper href
  const firstButtonHref = await buttons.first().evaluate((el) => {
    return el.closest('a')?.getAttribute('href');
  });

  console.log('First button href:', firstButtonHref);
  expect(firstButtonHref).toBe('/register');
});
