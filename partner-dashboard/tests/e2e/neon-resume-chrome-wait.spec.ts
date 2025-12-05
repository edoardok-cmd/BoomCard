import { test, expect } from '@playwright/test';

test('Resume Neon compute - Chrome interactive', async ({ page }) => {
  test.setTimeout(600000); // 10 minutes timeout

  console.log('\n🌐 Opening Neon console in Chrome...');
  console.log('📌 Window will stay open - DO NOT CLOSE IT\n');

  await page.goto('https://console.neon.tech/app/projects');
  await page.waitForTimeout(3000);

  console.log('✅ Neon console opened in Chrome');
  console.log('\n📋 PLEASE DO THE FOLLOWING:');
  console.log('1. Log in to your Neon account in the Chrome window');
  console.log('2. Navigate to your BoomCard project');
  console.log('3. Click on the "Primary" compute that shows SUSPENDED');
  console.log('4. Click the "Edit" button');
  console.log('5. Resume/Start the compute');
  console.log('\n⏸️  Window will stay open. Press Ctrl+C when done.\n');

  // Keep page alive and check for compute status changes
  let checkCount = 0;
  while (checkCount < 200) { // Check for ~10 minutes
    checkCount++;

    // Look for "ACTIVE" status
    const activeText = await page.locator('text=/ACTIVE/i').count();
    const idleText = await page.locator('text=/IDLE/i').count();

    if (activeText > 0) {
      console.log('\n✅ DETECTED: Compute status changed to ACTIVE!');
      console.log('🎉 Database should now be accessible!\n');
      break;
    } else if (idleText > 0) {
      console.log('\n✅ DETECTED: Compute status changed to IDLE (ready to use)!');
      console.log('🎉 Database should now be accessible!\n');
      break;
    }

    if (checkCount % 10 === 0) {
      console.log(`⏳ Still waiting... (${checkCount * 3} seconds elapsed)`);
    }

    await page.waitForTimeout(3000);
  }

  console.log('\n📸 Taking final screenshot...');
  await page.screenshot({ path: 'neon-final-state.png', fullPage: true });
  console.log('✅ Screenshot saved: neon-final-state.png');

  console.log('\n💡 Keeping window open for 30 more seconds...');
  await page.waitForTimeout(30000);
});
