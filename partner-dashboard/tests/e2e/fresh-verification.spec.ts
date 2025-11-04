import { test } from '@playwright/test';

test.describe('Fresh Verification - Clear Cache', () => {

  test('Homepage - Clear cache and capture', async ({ page, context }) => {
    // Clear all cookies and storage
    await context.clearCookies();
    await context.clearPermissions();

    await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' });

    // Force reload without cache
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/FRESH-homepage.png',
      fullPage: true
    });

    console.log('✅ Fresh homepage screenshot saved');
  });

  test('Subscriptions - Clear cache and capture', async ({ page, context }) => {
    await context.clearCookies();

    await page.goto('http://localhost:5175/subscriptions', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/FRESH-subscriptions.png',
      fullPage: true
    });

    console.log('✅ Fresh subscriptions screenshot saved');

    // Verify credit card elements are present
    const boomLogo = await page.locator('text=BOOM').first();
    const yearText = await page.locator('text=2025').first();
    const qrCode = await page.locator('text=/SCAN ME/i').first();

    console.log('BOOM logo visible:', await boomLogo.isVisible());
    console.log('Year 2025 visible:', await yearText.isVisible());
    console.log('QR code visible:', await qrCode.isVisible());
  });

  test('Partners - Clear cache and capture', async ({ page, context }) => {
    await context.clearCookies();

    await page.goto('http://localhost:5175/partners', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'test-results/screenshots/FRESH-partners.png',
      fullPage: true
    });

    console.log('✅ Fresh partners screenshot saved');
  });
});
