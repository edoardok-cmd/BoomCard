const { chromium } = require('playwright');

async function resumeNeonCompute() {
  console.log('\n🚀 Starting automated Neon compute resume...\n');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🌐 Opening Neon console in Chrome...');
  await page.goto('https://console.neon.tech/app/projects');
  await page.waitForTimeout(3000);

  console.log('✅ Neon console loaded');
  console.log('⏳ Since you confirmed you\'re logged in, proceeding automatically...\n');

  // Wait a bit for page to fully load after login
  await page.waitForTimeout(3000);

  await page.screenshot({ path: 'neon-projects-list.png', fullPage: true });
  console.log('📸 Screenshot: neon-projects-list.png\n');

  // Look for BoomCard project
  console.log('🔍 Looking for BoomCard project...');
  const boomcardLink = page.locator('text=/BoomCard/i').first();

  if (await boomcardLink.isVisible({ timeout: 5000 })) {
    console.log('✓ Found BoomCard project, clicking...');
    await boomcardLink.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('⚠️  BoomCard project not found in list');
    console.log('   Looking for any project link...');

    // Try clicking first project
    const anyProject = page.locator('[href*="/app/projects/"]').first();
    if (await anyProject.isVisible({ timeout: 2000 })) {
      console.log('✓ Clicking first available project...');
      await anyProject.click();
      await page.waitForTimeout(3000);
    }
  }

  await page.screenshot({ path: 'neon-project-overview.png', fullPage: true });
  console.log('📸 Screenshot: neon-project-overview.png\n');

  // Look for suspended compute
  console.log('🔍 Checking compute status...');
  const pageText = await page.textContent('body');

  if (pageText.includes('SUSPENDED')) {
    console.log('✓ Found SUSPENDED compute - attempting to resume...\n');

    // Click on the Computes tab if not already there
    const computesTab = page.locator('button:has-text("Computes"), a:has-text("Computes")').first();
    if (await computesTab.isVisible({ timeout: 2000 })) {
      await computesTab.click();
      await page.waitForTimeout(2000);
    }

    // Look for Edit button
    const editButtons = page.locator('button:has-text("Edit")');
    const editCount = await editButtons.count();

    if (editCount > 0) {
      console.log(`✓ Found ${editCount} Edit button(s), clicking first one...`);
      await editButtons.first().click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'neon-compute-edit.png', fullPage: true });
      console.log('📸 Screenshot: neon-compute-edit.png\n');

      // Look for autosuspend settings or state toggle
      console.log('🔍 Looking for compute state controls...');

      // Try to find a switch/toggle to enable compute
      const switches = page.locator('[role="switch"]');
      const switchCount = await switches.count();

      if (switchCount > 0) {
        console.log(`✓ Found ${switchCount} toggle switch(es)`);

        for (let i = 0; i < switchCount; i++) {
          const switchEl = switches.nth(i);
          const ariaChecked = await switchEl.getAttribute('aria-checked');
          const ariaLabel = await switchEl.getAttribute('aria-label');

          console.log(`   Switch ${i+1}: ${ariaLabel || 'unlabeled'} - ${ariaChecked}`);

          // If it's an autosuspend toggle that's ON, turn it OFF
          if (ariaLabel && ariaLabel.toLowerCase().includes('suspend') && ariaChecked === 'true') {
            console.log(`   🔄 Turning OFF autosuspend to keep compute active...`);
            await switchEl.click();
            await page.waitForTimeout(1000);
          }
        }
      }

      // Look for and click Save button
      const saveButtons = page.locator('button:has-text("Save"), button:has-text("Apply"), button:has-text("Confirm"), button:has-text("Update")');
      if (await saveButtons.first().isVisible({ timeout: 2000 })) {
        console.log('✓ Clicking Save button...');
        await saveButtons.first().click();
        await page.waitForTimeout(3000);
      }

      await page.screenshot({ path: 'neon-after-save.png', fullPage: true });
      console.log('📸 Screenshot: neon-after-save.png\n');
    }
  } else if (pageText.includes('IDLE') || pageText.includes('ACTIVE')) {
    console.log('✓ Compute is already IDLE or ACTIVE - no action needed!\n');
  }

  // Final check
  console.log('⏳ Waiting 5 seconds for changes to apply...\n');
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'neon-final-status.png', fullPage: true });
  console.log('📸 Final screenshot: neon-final-status.png\n');

  const finalText = await page.textContent('body');
  if (finalText.includes('ACTIVE') || finalText.includes('IDLE')) {
    console.log('🎉 SUCCESS! Compute status shows ACTIVE or IDLE\n');
  } else if (finalText.includes('SUSPENDED')) {
    console.log('⚠️  Compute still shows SUSPENDED\n');
    console.log('💡 The compute might auto-wake on connection attempts\n');
  }

  console.log('💡 Keeping Chrome window open for 60 seconds for verification...\n');
  await page.waitForTimeout(60000);

  console.log('✅ Done! Closing browser...\n');
  await browser.close();
}

resumeNeonCompute().catch(console.error);
