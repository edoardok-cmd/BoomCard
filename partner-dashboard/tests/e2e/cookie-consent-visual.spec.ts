import { test, expect } from '@playwright/test';

test.describe('Cookie Consent Visual Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure cookie banner appears
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('cookie consent banner is visible on homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take homepage screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/homepage-with-banner.png', fullPage: true });

    // Check for cookie consent banner text
    const bannerText = page.locator('text=бисквитки').first();
    await expect(bannerText).toBeVisible({ timeout: 5000 });
    console.log('✅ Cookie consent banner visible');
  });

  test('cookie policy page loads correctly', async ({ page }) => {
    await page.goto('/cookies');
    await page.waitForLoadState('networkidle');

    // Take cookie policy page screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/cookies-page.png', fullPage: true });

    // Check for page title
    const title = page.getByText(/Cookie Policy|Политика за бисквитки/i).first();
    await expect(title).toBeVisible();
    console.log('✅ Cookie policy page loads correctly');
  });

  test('footer has cookie links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Take footer screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/footer-cookie-links.png' });

    // Check for cookie policy link
    const cookieLink = page.locator('a[href="/cookies"]');
    await expect(cookieLink).toBeVisible();
    console.log('✅ Cookie policy link in footer');

    // Check for cookie settings button
    const settingsButton = page.locator('button').filter({ hasText: /Cookie Settings|Настройки на бисквитките/ });
    await expect(settingsButton).toBeVisible();
    console.log('✅ Cookie settings button in footer');
  });

  test('cookie preferences modal opens', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for settings button in banner or footer
    const settingsBtn = page.locator('button').filter({ hasText: /Настройки|Settings/ }).first();
    await settingsBtn.click();
    await page.waitForTimeout(500);

    // Take screenshot of preferences modal
    await page.screenshot({ path: 'tests/e2e/screenshots/cookie-preferences-modal.png' });
    console.log('✅ Cookie preferences modal screenshot captured');
  });
});
