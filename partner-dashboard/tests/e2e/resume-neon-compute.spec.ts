import { test } from '@playwright/test';

test('Resume suspended Neon compute', async ({ page }) => {
  console.log('🔍 Navigating to Neon console...');

  await page.goto('https://console.neon.tech/app/projects');
  await page.waitForTimeout(2000);

  // Look for the project
  const projectLink = page.locator('text=/BoomCard/i').first();
  if (await projectLink.isVisible({ timeout: 5000 })) {
    console.log('✓ Found BoomCard project, clicking...');
    await projectLink.click();
    await page.waitForTimeout(2000);
  }

  // Screenshot current state
  await page.screenshot({ path: 'neon-before-resume.png', fullPage: true });
  console.log('📸 Screenshot saved: neon-before-resume.png');

  // Look for the suspended compute
  const suspendedLabel = page.locator('text=SUSPENDED');
  if (await suspendedLabel.isVisible({ timeout: 3000 })) {
    console.log('✓ Found SUSPENDED compute');

    // Look for Edit button near the compute
    const editButton = page.locator('button:has-text("Edit")').first();
    if (await editButton.isVisible({ timeout: 2000 })) {
      console.log('✓ Clicking Edit button...');
      await editButton.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: 'neon-edit-modal.png', fullPage: true });
      console.log('📸 Edit modal screenshot saved');
    }

    // Look for Resume, Start, or Activate button
    const resumeSelectors = [
      'button:has-text("Resume")',
      'button:has-text("Start")',
      'button:has-text("Activate")',
      'button:has-text("Wake")',
      'text=/Resume compute/i',
      'text=/Start compute/i',
    ];

    for (const selector of resumeSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        console.log(`✓ Found button: ${selector}`);
        console.log('🔄 Clicking to resume compute...');
        await button.click();
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'neon-after-resume.png', fullPage: true });
        console.log('📸 After resume screenshot saved');
        console.log('✅ Compute resume action triggered!');
        break;
      }
    }
  }

  // Check if compute status changed
  const activeLabel = page.locator('text=/ACTIVE|Active/i');
  if (await activeLabel.isVisible({ timeout: 5000 })) {
    console.log('\n🎉 SUCCESS! Compute is now ACTIVE');
  } else {
    console.log('\n⏳ Compute may be starting up...');
    console.log('   Check the Neon console for status');
  }

  await page.waitForTimeout(5000);
});
