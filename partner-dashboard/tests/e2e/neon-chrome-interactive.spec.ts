import { test } from '@playwright/test';

test('Neon console - Interactive Chrome session', async ({ page }) => {
  console.log('\n🌐 Opening Neon console in Chrome...');
  console.log('📌 The browser window will stay open');
  console.log('⏳ Please log in to your Neon account\n');

  await page.goto('https://console.neon.tech');
  await page.waitForTimeout(2000);

  console.log('✅ Neon console loaded');
  console.log('\n📋 INSTRUCTIONS:');
  console.log('1. Log in to your Neon account in the browser window');
  console.log('2. Navigate to your BoomCard project');
  console.log('3. Go to the compute section');
  console.log('4. When you\'re ready, type "ready" in the terminal and press Enter\n');

  // Wait for user to navigate and confirm
  console.log('⏳ Waiting for you to complete login and navigation...');
  console.log('   (This script will wait up to 5 minutes)\n');

  // Wait a long time for user to interact
  await page.waitForTimeout(300000); // 5 minutes

  console.log('\n✅ Session complete!');
});
