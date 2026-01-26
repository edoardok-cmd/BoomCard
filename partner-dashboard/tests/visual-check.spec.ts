import { test, expect } from '@playwright/test';

test('visual verification of landing page updates', async ({ page }) => {
  // Test homepage
  await page.goto('http://localhost:3022');
  await page.waitForLoadState('networkidle');
  
  // Check for cookie consent banner
  const bannerLocator = page.locator('text=бисквитки').first();
  const bannerVisible = await bannerLocator.isVisible().catch(() => false);
  console.log(bannerVisible ? '✅ Cookie consent banner visible' : 'ℹ️ Cookie consent banner may be hidden (consent already given)');
  
  // Take homepage screenshot
  await page.screenshot({ path: 'tests/screenshots/homepage.png', fullPage: true });
  console.log('✅ Homepage screenshot saved');
  
  // Test cookie policy page
  await page.goto('http://localhost:3022/cookies');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/screenshots/cookies-page.png', fullPage: true });
  console.log('✅ Cookie policy page screenshot saved');
  
  // Test footer has cookie links
  await page.goto('http://localhost:3022');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  
  // Check for cookie policy link
  const cookieLink = page.locator('a[href="/cookies"]');
  await expect(cookieLink).toBeVisible();
  console.log('✅ Cookie policy link in footer');
  
  // Check for cookie settings button
  const settingsButton = page.locator('button', { hasText: /Cookie Settings|Настройки на бисквитките/ });
  await expect(settingsButton).toBeVisible();
  console.log('✅ Cookie settings button in footer');
  
  await page.screenshot({ path: 'tests/screenshots/footer.png' });
  console.log('✅ Footer screenshot saved');
});
