import { test } from '@playwright/test';

test('Get Neon connection string - Interactive', async ({ page }) => {
  console.log('🔍 Opening Neon Console...');
  console.log('⏳ Please log in to your Neon account when the browser opens...\n');

  // Navigate to Neon console
  await page.goto('https://console.neon.tech');

  // Wait for user to log in - check for dashboard elements
  console.log('⏳ Waiting for you to log in...');
  try {
    // Wait for login to complete (look for dashboard elements)
    await page.waitForURL(/console\.neon\.tech\/app/i, { timeout: 120000 });
    console.log('✅ Login detected!\n');
  } catch (e) {
    console.log('⚠️  Still waiting for login... Please complete login in the browser.');
    await page.waitForTimeout(5000);
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'neon-after-login.png', fullPage: true });
  console.log('📸 Screenshot after login saved\n');

  // Look for project
  console.log('🔍 Looking for your database project...');
  const projectLink = page.locator('[class*="project"], [data-testid*="project"], a').first();
  if (await projectLink.isVisible({ timeout: 5000 })) {
    await projectLink.click();
    await page.waitForTimeout(2000);
    console.log('✓ Opened project\n');
  }

  // Look for "Connection Details" or "Connect" button
  console.log('🔍 Looking for connection details...');
  const connectionSelectors = [
    'text=/Connection Details/i',
    'text=/Connect/i',
    'button:has-text("Connection")',
    'button:has-text("Connect")',
    '[data-testid*="connection"]',
  ];

  for (const selector of connectionSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.click();
        await page.waitForTimeout(1000);
        console.log('✓ Clicked connection details button\n');
        break;
      }
    } catch (e) {
      // Try next selector
    }
  }

  await page.screenshot({ path: 'neon-connection-details.png', fullPage: true });
  console.log('📸 Screenshot of connection details saved\n');

  // Extract connection string
  console.log('🔍 Extracting connection string...\n');

  // Look for elements containing postgresql://
  const allText = await page.locator('*').allTextContents();
  const connectionStrings = allText.filter(text =>
    text && text.includes('postgresql://') && text.includes('neon.tech')
  );

  if (connectionStrings.length > 0) {
    console.log('✅ FOUND CONNECTION STRING(S):\n');
    connectionStrings.forEach((str, i) => {
      console.log(`${i + 1}. ${str}\n`);
    });
  }

  // Try to find input fields or code blocks
  const codeBlocks = page.locator('code, pre, input[readonly], [class*="connection"]');
  const count = await codeBlocks.count();

  console.log(`\n📋 Found ${count} code/input elements. Checking each...\n`);

  for (let i = 0; i < Math.min(count, 10); i++) {
    try {
      const text = await codeBlocks.nth(i).textContent();
      if (text && (text.includes('postgresql://') || text.includes('neon.tech'))) {
        console.log(`✅ Element ${i + 1}:`);
        console.log(text);
        console.log('');
      }
    } catch (e) {
      // Skip
    }
  }

  // Get page HTML for manual inspection if needed
  const html = await page.content();
  const matches = html.match(/postgresql:\/\/[^"'\s<>]+neon\.tech[^"'\s<>]*/g);
  if (matches) {
    console.log('\n✅ EXTRACTED FROM HTML:\n');
    matches.forEach((match, i) => {
      console.log(`${i + 1}. ${match}\n`);
    });
  }

  console.log('\n✅ Extraction complete! Check output above for connection string.');
  console.log('⏸️  Browser will stay open for 30 seconds for you to verify...\n');

  await page.waitForTimeout(30000);
});
