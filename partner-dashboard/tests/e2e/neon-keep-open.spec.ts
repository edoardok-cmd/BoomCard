import { test } from '@playwright/test';

test('Neon console - Keep Chrome window open', async ({ page }) => {
  test.setTimeout(0); // No timeout - runs forever until Ctrl+C

  console.log('\n🌐 Opening Neon console in Chrome...');
  console.log('📌 Window will stay open until you press Ctrl+C\n');

  await page.goto('https://console.neon.tech/app/projects');
  await page.waitForTimeout(3000);

  console.log('✅ Neon console opened in Chrome');
  console.log('\n🔍 Monitoring compute status...\n');

  // Keep checking status forever
  let checkCount = 0;
  while (true) {
    checkCount++;

    const pageText = await page.textContent('body').catch(() => '');

    if (pageText.includes('ACTIVE')) {
      if (checkCount % 20 === 1) { // Print every minute
        console.log(`✅ Compute is ACTIVE (check #${checkCount})`);
      }
    } else if (pageText.includes('IDLE')) {
      if (checkCount % 20 === 1) {
        console.log(`⚡ Compute is IDLE (check #${checkCount})`);
      }
    } else if (pageText.includes('SUSPENDED')) {
      console.log(`⚠️  Compute is SUSPENDED (check #${checkCount})`);
    }

    await page.waitForTimeout(3000); // Check every 3 seconds
  }
});
