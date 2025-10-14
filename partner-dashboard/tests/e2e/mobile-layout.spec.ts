import { test, expect } from '@playwright/test';

test.describe('Mobile Layout Tests', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
  });

  test('should check homepage mobile layout', async ({ page }) => {
    await page.goto('http://localhost:3005/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for animations

    // Take screenshot of hero section
    await page.screenshot({ path: 'tests/screenshots/mobile-hero.png', fullPage: false });

    // Scroll and check different sections
    const sections = [
      { selector: '[data-testid="features-section"]', name: 'features' },
      { selector: '[data-testid="pricing-section"]', name: 'pricing' },
      { selector: '[data-testid="testimonials-section"]', name: 'testimonials' },
      { selector: 'footer', name: 'footer' },
    ];

    for (const section of sections) {
      const element = await page.locator(section.selector).first();
      if (await element.count() > 0) {
        await element.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `tests/screenshots/mobile-${section.name}.png`,
          fullPage: false
        });
      }
    }

    // Check for cards
    const cards = await page.locator('[class*="Card"], .card, [data-testid*="card"]').all();
    console.log(`Found ${cards.length} cards on the page`);

    // Check each card's dimensions and position
    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      const card = cards[i];
      const box = await card.boundingBox();
      if (box) {
        console.log(`Card ${i}: width=${box.width}, height=${box.height}, x=${box.x}, y=${box.y}`);
      }
    }

    // Take full page screenshot
    await page.screenshot({ path: 'tests/screenshots/mobile-full-page.png', fullPage: true });
  });

  test('should check footer on mobile', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    // Scroll to footer
    await page.locator('footer').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Take screenshot of footer
    await page.screenshot({ path: 'tests/screenshots/mobile-footer-before.png', fullPage: false });

    // Check footer dimensions
    const footer = await page.locator('footer').first();
    const box = await footer.boundingBox();
    console.log('Footer dimensions:', box);

    // Check if footer content overflows
    const footerWidth = box?.width || 0;
    const viewportWidth = 375;
    console.log(`Footer width: ${footerWidth}, Viewport width: ${viewportWidth}`);
  });
});
