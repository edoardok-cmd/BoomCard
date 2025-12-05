import { test } from '@playwright/test';

test('Check Neon database status', async ({ page }) => {
  console.log('📸 Taking screenshot of current Neon console state...');

  // The page should already be open in the browser
  await page.goto('https://console.neon.tech');
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'neon-status-check.png', fullPage: true });
  console.log('✅ Screenshot saved: neon-status-check.png');

  // Look for status indicators
  const pageText = await page.textContent('body');
  const statusKeywords = ['idle', 'suspended', 'active', 'paused', 'inactive', 'offline'];

  console.log('\n🔍 Looking for status indicators...');
  statusKeywords.forEach(keyword => {
    if (pageText?.toLowerCase().includes(keyword)) {
      console.log(`   Found: "${keyword}"`);
    }
  });

  // Look for action buttons
  const buttons = await page.locator('button').allTextContents();
  console.log('\n🔘 Buttons found:', buttons.filter(b => b.trim()));

  await page.waitForTimeout(5000);
});
