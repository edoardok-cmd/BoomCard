const { chromium } = require('@playwright/test');
const readline = require('readline');

async function resumeNeonCompute() {
  console.log('\n🚀 Starting interactive Neon compute resume...\n');

  // Launch Chrome (not Chromium)
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // Use installed Chrome
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🌐 Opening Neon console in Chrome...');
  await page.goto('https://console.neon.tech/app/projects');
  await page.waitForTimeout(2000);

  console.log('\n✅ Chrome window opened');
  console.log('\n📋 PLEASE DO THE FOLLOWING IN THE CHROME WINDOW:');
  console.log('   1. Log in to your Neon account');
  console.log('   2. You should see your BoomCard project');
  console.log('\n⏸️  When you\'re logged in and can see your projects, press ENTER here...\n');

  // Wait for user to press Enter
  await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });

  console.log('\n✅ Confirmed! Now navigating to BoomCard project...\n');

  // Look for BoomCard project link
  const boomcardLink = page.locator('text=/BoomCard/i').first();
  if (await boomcardLink.isVisible({ timeout: 5000 })) {
    console.log('✓ Found BoomCard project, clicking...');
    await boomcardLink.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('⚠️  Could not find BoomCard project link automatically');
    console.log('   Please click on BoomCard project manually, then press ENTER...\n');
    await new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.question('', () => {
        rl.close();
        resolve();
      });
    });
  }

  await page.screenshot({ path: 'neon-project-page.png', fullPage: true });
  console.log('📸 Screenshot saved: neon-project-page.png\n');

  // Look for SUSPENDED compute
  console.log('🔍 Looking for suspended compute...');
  const suspendedText = await page.locator('text=SUSPENDED').count();

  if (suspendedText > 0) {
    console.log('✓ Found SUSPENDED compute');

    // Look for Edit button
    const editButton = page.locator('button:has-text("Edit")').first();
    if (await editButton.isVisible({ timeout: 3000 })) {
      console.log('✓ Clicking Edit button...');
      await editButton.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'neon-edit-modal.png', fullPage: true });
      console.log('📸 Edit modal screenshot saved\n');

      // Look for compute settings
      console.log('🔍 Looking for compute resume options...');

      // Try to find and click resume/activate options
      const resumeOptions = [
        'button:has-text("Resume")',
        'button:has-text("Start")',
        'button:has-text("Activate")',
        '[role="switch"]', // Toggle switch
        'text=/Resume compute/i',
      ];

      for (const selector of resumeOptions) {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          console.log(`✓ Found element: ${selector}`);
          console.log('🔄 Clicking to resume compute...');
          await element.click();
          await page.waitForTimeout(2000);
          break;
        }
      }

      // Look for Save/Apply button
      const saveButton = page.locator('button:has-text("Save"), button:has-text("Apply"), button:has-text("Confirm")').first();
      if (await saveButton.isVisible({ timeout: 2000 })) {
        console.log('✓ Clicking Save button...');
        await saveButton.click();
        await page.waitForTimeout(3000);
      }

      await page.screenshot({ path: 'neon-after-action.png', fullPage: true });
      console.log('📸 After action screenshot saved\n');
    } else {
      console.log('⚠️  Could not find Edit button automatically');
      console.log('\n📋 Please manually:');
      console.log('   1. Click the Edit button next to the compute');
      console.log('   2. Resume/Start the compute');
      console.log('   3. Save the changes');
      console.log('\n   Then press ENTER here...\n');

      await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('', () => {
          rl.close();
          resolve();
        });
      });
    }
  } else {
    console.log('✓ Compute is already active or not suspended!');
  }

  // Wait and check final status
  console.log('\n⏳ Waiting 10 seconds for compute to activate...\n');
  await page.waitForTimeout(10000);

  await page.screenshot({ path: 'neon-final.png', fullPage: true });
  console.log('📸 Final screenshot saved: neon-final.png\n');

  // Check for ACTIVE or IDLE status
  const activeCount = await page.locator('text=/ACTIVE|IDLE/i').count();
  if (activeCount > 0) {
    console.log('🎉 SUCCESS! Compute appears to be active!\n');
  } else {
    console.log('⚠️  Could not confirm compute is active. Check the browser window.\n');
  }

  console.log('💡 Keeping Chrome window open for 60 seconds so you can verify...\n');
  await page.waitForTimeout(60000);

  console.log('✅ Done! Closing browser...\n');
  await browser.close();
}

resumeNeonCompute().catch(console.error);
