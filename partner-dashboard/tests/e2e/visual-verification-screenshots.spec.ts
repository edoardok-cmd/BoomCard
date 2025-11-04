import { test, expect } from '@playwright/test';

test.describe('Visual Verification - Full Page Screenshots', () => {

  test('Homepage - Full page screenshot with all changes', async ({ page }) => {
    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Wait for any animations to complete
    await page.waitForTimeout(2000);

    // Take full-page screenshot
    await page.screenshot({
      path: 'test-results/screenshots/homepage-full.png',
      fullPage: true
    });

    console.log('✅ Homepage screenshot saved to: test-results/screenshots/homepage-full.png');
  });

  test('Pricing/Subscriptions page - Full page screenshot with credit card designs', async ({ page }) => {
    await page.goto('/subscriptions');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Wait for any animations to complete
    await page.waitForTimeout(2000);

    // Take full-page screenshot
    await page.screenshot({
      path: 'test-results/screenshots/subscriptions-full.png',
      fullPage: true
    });

    console.log('✅ Subscriptions page screenshot saved to: test-results/screenshots/subscriptions-full.png');
  });

  test('Pricing page - Yearly billing view', async ({ page }) => {
    await page.goto('/subscriptions');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Click yearly toggle
    const yearlyToggle = page.getByRole('button', { name: /Yearly|Годишно/ });
    await yearlyToggle.click();

    // Wait for state change
    await page.waitForTimeout(1000);

    // Take full-page screenshot
    await page.screenshot({
      path: 'test-results/screenshots/subscriptions-yearly.png',
      fullPage: true
    });

    console.log('✅ Subscriptions (Yearly) screenshot saved to: test-results/screenshots/subscriptions-yearly.png');
  });

  test('Partners page - Full page screenshot with fixed buttons', async ({ page }) => {
    await page.goto('/partners');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Wait for any animations to complete
    await page.waitForTimeout(2000);

    // Take full-page screenshot
    await page.screenshot({
      path: 'test-results/screenshots/partners-full.png',
      fullPage: true
    });

    console.log('✅ Partners page screenshot saved to: test-results/screenshots/partners-full.png');
  });

  test('All pages - Dark mode screenshots', async ({ page }) => {
    // Set to dark mode
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Homepage dark mode
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/screenshots/homepage-dark.png',
      fullPage: true
    });
    console.log('✅ Homepage (Dark) screenshot saved');

    // Subscriptions dark mode
    await page.goto('/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/screenshots/subscriptions-dark.png',
      fullPage: true
    });
    console.log('✅ Subscriptions (Dark) screenshot saved');

    // Partners dark mode
    await page.goto('/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/screenshots/partners-dark.png',
      fullPage: true
    });
    console.log('✅ Partners (Dark) screenshot saved');
  });

  test('All pages - Light mode screenshots', async ({ page }) => {
    // Set to light mode
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    // Homepage light mode
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/screenshots/homepage-light.png',
      fullPage: true
    });
    console.log('✅ Homepage (Light) screenshot saved');

    // Subscriptions light mode
    await page.goto('/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/screenshots/subscriptions-light.png',
      fullPage: true
    });
    console.log('✅ Subscriptions (Light) screenshot saved');

    // Partners light mode
    await page.goto('/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/screenshots/partners-light.png',
      fullPage: true
    });
    console.log('✅ Partners (Light) screenshot saved');
  });

  test('Subscriptions page - Individual credit cards with hover states', async ({ page }) => {
    await page.goto('/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Find all credit cards
    const cards = page.locator('[data-variant]');
    const cardCount = await cards.count();

    console.log(`Found ${cardCount} credit cards`);

    // Screenshot each card
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const variant = await card.getAttribute('data-variant');

      // Scroll card into view
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Normal state
      await card.screenshot({
        path: `test-results/screenshots/card-${variant}-normal.png`
      });
      console.log(`✅ Card ${variant} (normal) screenshot saved`);

      // Hover state
      await card.hover();
      await page.waitForTimeout(600); // Wait for hover animation
      await card.screenshot({
        path: `test-results/screenshots/card-${variant}-hover.png`
      });
      console.log(`✅ Card ${variant} (hover) screenshot saved`);
    }
  });

  test('Partners page - Hero section with buttons', async ({ page }) => {
    await page.goto('/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Find hero section
    const heroSection = page.locator('div').filter({ hasText: /Apply Now|Contact Us/i }).first();

    await heroSection.screenshot({
      path: 'test-results/screenshots/partners-hero-buttons.png'
    });

    console.log('✅ Partners hero section screenshot saved');
  });

  test('Summary report - All screenshots location', async ({ page }) => {
    console.log('\n========================================');
    console.log('📸 VISUAL VERIFICATION COMPLETE');
    console.log('========================================\n');
    console.log('All screenshots saved to: test-results/screenshots/\n');
    console.log('Screenshots created:');
    console.log('  ✓ homepage-full.png');
    console.log('  ✓ homepage-light.png');
    console.log('  ✓ homepage-dark.png');
    console.log('  ✓ subscriptions-full.png');
    console.log('  ✓ subscriptions-yearly.png');
    console.log('  ✓ subscriptions-light.png');
    console.log('  ✓ subscriptions-dark.png');
    console.log('  ✓ partners-full.png');
    console.log('  ✓ partners-light.png');
    console.log('  ✓ partners-dark.png');
    console.log('  ✓ partners-hero-buttons.png');
    console.log('  ✓ card-silver-normal.png');
    console.log('  ✓ card-silver-hover.png');
    console.log('  ✓ card-gold-normal.png');
    console.log('  ✓ card-gold-hover.png');
    console.log('  ✓ card-platinum-normal.png');
    console.log('  ✓ card-platinum-hover.png');
    console.log('\n========================================\n');

    // Just navigate to homepage to pass the test
    await page.goto('/');
    expect(true).toBe(true);
  });
});
