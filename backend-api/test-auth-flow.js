const { chromium } = require('playwright');
const crypto = require('crypto');

async function createTestPendingSubscription() {
  // This would normally call the database, but for now we'll simulate it
  // In a real scenario, you'd use the Prisma client directly
  const token = crypto.randomBytes(32).toString('hex');
  console.log('Generated test token:', token);
  return {
    email: `test-${Date.now()}@example.com`,
    token,
  };
}

async function testAuthFlow() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Create test data
    const testData = await createTestPendingSubscription();
    console.log('\n=== Test Setup ===');
    console.log('Test Email:', testData.email);
    console.log('Test Token:', testData.token);

    // Navigate to complete-profile page
    const completeProfileUrl = `http://localhost:3556/complete-profile?token=${testData.token}`;
    console.log('\nNavigating to:', completeProfileUrl);
    await page.goto(completeProfileUrl);

    // Wait a bit for page to load
    await page.waitForTimeout(2000);

    // Take screenshot
    console.log('\nTaking screenshot of complete-profile page...');
    await page.screenshot({ path: '/tmp/complete-profile-page.png', fullPage: true });
    console.log('Screenshot saved to /tmp/complete-profile-page.png');

    // Check if the page loaded with an error
    const errorText = await page.evaluate(() => document.body.innerText);
    if (errorText.includes('error') || errorText.includes('Error') || errorText.includes('invalid')) {
      console.log('\n⚠ Page shows error message:');
      console.log(errorText.substring(0, 500));
    } else {
      console.log('\n✓ Page appears to have loaded successfully');
      console.log('Page content preview:', errorText.substring(0, 300));
    }

    // Try to fill in the form with test data
    console.log('\n=== Attempting Form Fill ===');

    // Look for form fields
    const firstNameInput = page.locator('input[name="firstName"], input[placeholder*="First"], input[placeholder*="first"]').first();
    const lastNameInput = page.locator('input[name="lastName"], input[placeholder*="Last"], input[placeholder*="last"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const submitButton = page.locator('button[type="submit"], button:has-text("Activate"), button:has-text("activate"), button:has-text("Complete")').first();

    console.log('Looking for form fields...');

    if (await firstNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('✓ Found firstName field');
      await firstNameInput.fill('Test');
    } else {
      console.log('⚠ firstName field not found');
    }

    if (await lastNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('✓ Found lastName field');
      await lastNameInput.fill('User');
    } else {
      console.log('⚠ lastName field not found');
    }

    if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('✓ Found password field');
      await passwordInput.fill('TestPassword123!');
    } else {
      console.log('⚠ password field not found');
    }

    if (await submitButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log('✓ Found submit button');
      console.log('Submit button text:', await submitButton.innerText());
    } else {
      console.log('⚠ submit button not found');
    }

    // Take another screenshot before submission
    await page.screenshot({ path: '/tmp/complete-profile-filled.png', fullPage: true });
    console.log('Screenshot saved to /tmp/complete-profile-filled.png');

  } catch (error) {
    console.error('Error during test:', error.message);
  } finally {
    await browser.close();
  }
}

testAuthFlow();
