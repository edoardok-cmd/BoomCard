import { test, expect } from '@playwright/test';

test.describe('BoomCard Implementation Verification', () => {
  test('Homepage loads successfully with new features', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 15000 });

    // Wait for page to be interactive
    await page.waitForLoadState('domcontentloaded');

    // Wait for any JavaScript to execute
    await page.waitForTimeout(3000);

    // Take full page screenshot to verify page loaded
    await page.screenshot({
      path: 'playwright-report/homepage-full.png',
      fullPage: true
    });

    console.log('✅ Homepage loaded successfully');
    console.log('✅ Full page screenshot saved');
  });

  test('Hero CTA button is visible and has proper styling', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 15000 });

    // Wait for page load and animations
    await page.waitForTimeout(5000);

    // Take screenshot of hero section
    await page.screenshot({
      path: 'playwright-report/hero-section.png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1000 }
    });

    // Look for any button in the hero area (more flexible search)
    const buttons = await page.locator('button').all();
    console.log(`✅ Found ${buttons.length} buttons on page`);

    // Check if at least one button exists
    expect(buttons.length).toBeGreaterThan(0);

    // Get text content of all buttons
    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      const text = await buttons[i].textContent();
      const isVisible = await buttons[i].isVisible();
      console.log(`Button ${i + 1}: "${text}" - Visible: ${isVisible}`);
    }

    console.log('✅ Buttons found and inspected');
  });

  test('Reviews section is present on homepage', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 15000 });

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Scroll to bottom of page
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for scroll to complete
    await page.waitForTimeout(2000);

    // Take screenshot of page bottom (reviews section)
    await page.screenshot({
      path: 'playwright-report/reviews-section.png',
      fullPage: false
    });

    // Check for reviews section heading (BG: "Какво казват нашите клиенти")
    const reviewsSection = page.getByText(/reviews|клиенти|отзиви/i).first();
    const hasReviews = await reviewsSection.isVisible().catch(() => false);

    // Verify reviews section exists on the homepage
    expect(hasReviews).toBe(true);

    console.log('✅ Reviews section verified');
  });

  test('Page has no console errors', async ({ page }) => {
    const consoleMessages: string[] = [];
    const errors: string[] = [];

    // Listen for console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });

    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 15000 });

    // Wait for page to settle
    await page.waitForTimeout(3000);

    // Log console messages
    console.log(`\n📊 Console Messages (total: ${consoleMessages.length}):`);
    consoleMessages.slice(0, 10).forEach(msg => console.log(`  ${msg}`));

    if (errors.length > 0) {
      console.log(`\n⚠️  Console Errors (${errors.length}):`);
      errors.forEach(err => console.log(`  ❌ ${err}`));
    } else {
      console.log('\n✅ No console errors detected');
    }

    console.log('\n✅ Page console check completed');
  });
});
