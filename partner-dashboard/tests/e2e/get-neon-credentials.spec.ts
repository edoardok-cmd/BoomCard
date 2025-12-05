import { test } from '@playwright/test';

test('Extract Neon database credentials from console', async ({ page }) => {
  console.log('🔍 Navigating to Neon Console...');

  // Navigate to Neon console
  await page.goto('https://console.neon.tech');

  // Wait for page to load
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Take screenshot of current state
  await page.screenshot({ path: 'neon-console-1.png', fullPage: true });
  console.log('📸 Screenshot saved: neon-console-1.png');

  // Look for connection string elements
  console.log('\n🔍 Looking for database connection information...');

  // Try to find "Connection Details" or similar
  const connectionDetailsButton = page.locator('text=/Connection|Connect|Database|Connection String/i').first();
  if (await connectionDetailsButton.isVisible({ timeout: 5000 })) {
    console.log('✓ Found connection details section');
    await connectionDetailsButton.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'neon-console-2.png', fullPage: true });
    console.log('📸 Screenshot saved: neon-console-2.png');
  }

  // Try to find the actual connection string
  const possibleSelectors = [
    'text=/postgresql:\/\//i',
    '[class*="connection"]',
    '[class*="string"]',
    'code',
    'pre',
    'input[type="text"]',
    'input[type="password"]',
  ];

  for (const selector of possibleSelectors) {
    try {
      const elements = await page.locator(selector).all();
      for (const element of elements) {
        const text = await element.textContent();
        if (text && text.includes('postgresql://')) {
          console.log('\n✅ FOUND CONNECTION STRING:');
          console.log(text);
          break;
        }
      }
    } catch (e) {
      // Continue to next selector
    }
  }

  // Look for copy buttons
  const copyButtons = page.locator('button:has-text("Copy")');
  const copyCount = await copyButtons.count();
  console.log(`\n📋 Found ${copyCount} copy buttons`);

  // Get all visible text that might contain credentials
  const pageText = await page.textContent('body');
  const lines = pageText?.split('\n') || [];
  const credentialLines = lines.filter(line =>
    line.includes('postgresql://') ||
    line.includes('neon.tech') ||
    line.includes('Database') ||
    line.includes('Host') ||
    line.includes('Password')
  );

  if (credentialLines.length > 0) {
    console.log('\n📝 Relevant information found:');
    credentialLines.forEach(line => {
      if (line.trim()) {
        console.log(line.trim());
      }
    });
  }

  // Final screenshot
  await page.screenshot({ path: 'neon-console-final.png', fullPage: true });
  console.log('\n📸 Final screenshot saved: neon-console-final.png');

  console.log('\n✅ Scan complete! Check the console output and screenshots.');
});
