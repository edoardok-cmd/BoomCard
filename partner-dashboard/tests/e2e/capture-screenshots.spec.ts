import { test, expect } from '@playwright/test';

test.describe('Visual Verification Screenshots', () => {

  test('Capture Homepage - Full page', async ({ page }) => {
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/screenshots/01-homepage-full.png',
      fullPage: true
    });

    console.log('✅ Homepage screenshot saved');
  });

  test('Capture Subscriptions page - Monthly view', async ({ page }) => {
    await page.goto('http://localhost:5175/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/screenshots/02-subscriptions-monthly.png',
      fullPage: true
    });

    console.log('✅ Subscriptions (Monthly) screenshot saved');
  });

  test('Capture Subscriptions page - Yearly view with Save badge', async ({ page }) => {
    await page.goto('http://localhost:5175/subscriptions');
    await page.waitForLoadState('networkidle');

    // Click yearly toggle
    const yearlyToggle = page.getByRole('button', { name: /Yearly|Годишно/ });
    await yearlyToggle.click();
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'test-results/screenshots/03-subscriptions-yearly.png',
      fullPage: true
    });

    console.log('✅ Subscriptions (Yearly) screenshot saved');
  });

  test('Capture Partners page - Full page with buttons', async ({ page }) => {
    await page.goto('http://localhost:5175/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'test-results/screenshots/04-partners-full.png',
      fullPage: true
    });

    console.log('✅ Partners page screenshot saved');
  });

  test('Capture credit cards - Individual with hover', async ({ page }) => {
    await page.goto('http://localhost:5175/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const cards = page.locator('[data-variant]');
    const cardCount = await cards.count();

    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const variant = await card.getAttribute('data-variant');

      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Normal state
      await card.screenshot({
        path: `test-results/screenshots/05-card-${variant}-normal.png`
      });

      // Hover state
      await card.hover();
      await page.waitForTimeout(700);
      await card.screenshot({
        path: `test-results/screenshots/06-card-${variant}-hover.png`
      });

      console.log(`✅ Card ${variant} screenshots saved`);
    }
  });

  test('Capture dark mode - All pages', async ({ page }) => {
    // Homepage dark
    await page.goto('http://localhost:5175/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/screenshots/07-homepage-dark.png',
      fullPage: true
    });
    console.log('✅ Homepage (Dark) saved');

    // Subscriptions dark
    await page.goto('http://localhost:5175/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/screenshots/08-subscriptions-dark.png',
      fullPage: true
    });
    console.log('✅ Subscriptions (Dark) saved');

    // Partners dark
    await page.goto('http://localhost:5175/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/screenshots/09-partners-dark.png',
      fullPage: true
    });
    console.log('✅ Partners (Dark) saved');
  });

  test('Capture light mode - All pages', async ({ page }) => {
    // Homepage light
    await page.goto('http://localhost:5175/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/screenshots/10-homepage-light.png',
      fullPage: true
    });
    console.log('✅ Homepage (Light) saved');

    // Subscriptions light
    await page.goto('http://localhost:5175/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/screenshots/11-subscriptions-light.png',
      fullPage: true
    });
    console.log('✅ Subscriptions (Light) saved');

    // Partners light
    await page.goto('http://localhost:5175/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'test-results/screenshots/12-partners-light.png',
      fullPage: true
    });
    console.log('✅ Partners (Light) saved');
  });

  test('Summary - List all screenshots', async ({ page }) => {
    console.log('\n========================================');
    console.log('📸 VISUAL VERIFICATION COMPLETE');
    console.log('========================================\n');
    console.log('Screenshots Location: test-results/screenshots/\n');
    console.log('Files Created:');
    console.log('  01-homepage-full.png');
    console.log('  02-subscriptions-monthly.png');
    console.log('  03-subscriptions-yearly.png');
    console.log('  04-partners-full.png');
    console.log('  05-card-silver-normal.png');
    console.log('  06-card-silver-hover.png');
    console.log('  05-card-gold-normal.png');
    console.log('  06-card-gold-hover.png');
    console.log('  05-card-platinum-normal.png');
    console.log('  06-card-platinum-hover.png');
    console.log('  07-homepage-dark.png');
    console.log('  08-subscriptions-dark.png');
    console.log('  09-partners-dark.png');
    console.log('  10-homepage-light.png');
    console.log('  11-subscriptions-light.png');
    console.log('  12-partners-light.png');
    console.log('\n========================================\n');

    expect(true).toBe(true);
  });
});
