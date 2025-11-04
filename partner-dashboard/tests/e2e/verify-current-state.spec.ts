import { test, expect } from '@playwright/test';

test.describe('Verify Current State - Local Development', () => {

  test('Subscriptions page - Verify new credit card design', async ({ page }) => {
    await page.goto('http://localhost:5175/subscriptions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check for new elements that should exist
    const boomLogo = page.locator('text=BOOM').first();
    const year2025 = page.locator('text=2025').first();
    const qrCode = page.getByText(/SCAN ME/i).first();
    const cardYear = page.locator('[class*="CardYear"]').first();

    console.log('\n=== SUBSCRIPTIONS PAGE CHECK ===');
    console.log('BOOM logo exists:', await boomLogo.count() > 0);
    console.log('Year 2025 exists:', await year2025.count() > 0);
    console.log('QR Code exists:', await qrCode.count() > 0);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/screenshots/VERIFY-subscriptions.png',
      fullPage: true
    });

    console.log('Screenshot saved: VERIFY-subscriptions.png\n');

    // Count cards
    const cards = page.locator('[data-variant]');
    const cardCount = await cards.count();
    console.log('Number of subscription cards:', cardCount);
    expect(cardCount).toBe(2); // Should only be 2 cards
  });

  test('Partners page - Verify button fixes', async ({ page }) => {
    await page.goto('http://localhost:5175/partners');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== PARTNERS PAGE CHECK ===');

    // Check for Apply Now button
    const applyNowButton = page.locator('a[href="#application"]').first();
    const applyNowExists = await applyNowButton.count() > 0;
    console.log('Apply Now button exists:', applyNowExists);

    // Check for Contact Us button
    const contactUsButton = page.locator('a[href="/contact"]').first();
    const contactUsExists = await contactUsButton.count() > 0;
    console.log('Contact Us button exists:', contactUsExists);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/screenshots/VERIFY-partners.png',
      fullPage: true
    });

    console.log('Screenshot saved: VERIFY-partners.png\n');

    expect(applyNowExists).toBe(true);
    expect(contactUsExists).toBe(true);
  });

  test('Homepage - Verify subscription cards', async ({ page }) => {
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== HOMEPAGE CHECK ===');

    // Scroll to subscription section
    await page.locator('text=/Subscription Plans|Choose the perfect plan/i').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    // Count subscription cards on homepage
    const subscriptionSection = page.locator('section:has-text("Subscription Plans")');
    await subscriptionSection.screenshot({
      path: 'test-results/screenshots/VERIFY-homepage-subscriptions.png'
    });

    console.log('Homepage subscription section screenshot saved\n');
  });
});
