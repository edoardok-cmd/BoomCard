const { chromium } = require('playwright');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('=== BoomCard Account Activation Test ===\n');

    // Step 1: Get or create a test plan
    console.log('Step 1: Fetching test plan...');
    let plan = await prisma.plan.findFirst({
      where: { planCode: 'BASIC' },
    });

    if (!plan) {
      console.log('Creating test plan (BASIC)...');
      plan = await prisma.plan.create({
        data: {
          planCode: 'BASIC',
          displayName: 'Basic Plan',
          priceYearlyEur: 100,
          cashbackRate: 0.01,
        },
      });
    }
    console.log('✓ Using plan:', plan.planCode, `(ID: ${plan.id})\n`);

    // Step 2: Create a test PendingSubscription
    console.log('Step 2: Creating test PendingSubscription...');
    const token = crypto.randomBytes(32).toString('hex');
    const testEmail = `test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.com`;
    const now = new Date();
    const inFuture = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const pending = await prisma.pendingSubscription.create({
      data: {
        email: testEmail,
        planId: plan.id,
        status: 'PAID',
        token,
        tokenExpiresAt: inFuture,
        paidAt: now,
        expiresAt: inFuture,
        billingPeriod: 'monthly',
        language: 'en',
      },
    });

    console.log('✓ Created PendingSubscription');
    console.log('  Email:', testEmail);
    console.log('  Token:', token.substring(0, 16) + '...\n');

    // Step 3: Navigate to complete-profile page
    console.log('Step 3: Navigating to complete-profile page...');
    const completeProfileUrl = `http://localhost:3556/complete-profile?token=${token}`;
    await page.goto(completeProfileUrl);
    console.log('✓ Navigated to:', completeProfileUrl);

    // Wait for page to load
    await page.waitForTimeout(2000);

    // Step 4: Fill in the form
    console.log('\nStep 4: Filling password form...');
    const testPassword = 'TestPassword123!';

    const passwordInput = page.locator('input[type="password"]').first();
    const confirmPasswordInput = page.locator('input[type="password"]').nth(1);

    if (await passwordInput.isVisible({ timeout: 2000 })) {
      console.log('✓ Found password inputs');
      await passwordInput.fill(testPassword);
      await confirmPasswordInput.fill(testPassword);
      console.log('✓ Filled password fields');
    } else {
      console.log('✗ Password inputs not visible!');
      await page.screenshot({ path: '/tmp/auth-error.png', fullPage: true });
      throw new Error('Password inputs not found');
    }

    // Check marketing checkboxes (optional but let's test both paths)
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log(`✓ Found ${checkboxCount} checkboxes`);

    // Step 5: Submit the form
    console.log('\nStep 5: Submitting form...');
    const submitButton = page.locator('button:has-text("Activate"), button:has-text("активир"), button:has-text("Активирай")').first();

    if (await submitButton.isVisible({ timeout: 1000 })) {
      console.log('✓ Found submit button');
      const buttonText = await submitButton.innerText();
      console.log('  Button text:', buttonText);

      // Take a screenshot before submitting
      await page.screenshot({ path: '/tmp/auth-before-submit.png', fullPage: true });
      console.log('✓ Screenshot saved: /tmp/auth-before-submit.png');

      // Submit the form
      await submitButton.click();
      console.log('✓ Form submitted');
    } else {
      console.log('✗ Submit button not found!');
      throw new Error('Submit button not found');
    }

    // Step 6: Wait for response and redirect
    console.log('\nStep 6: Waiting for server response...');
    await page.waitForTimeout(3000);

    // Check for error messages
    const pageContent = await page.evaluate(() => document.body.innerText);

    if (pageContent.includes('Something went wrong') || pageContent.includes('Error') || pageContent.includes('Нещо се обърка')) {
      console.log('✗ Server returned an error!');
      console.log('Error message:', pageContent.substring(0, 300));
      await page.screenshot({ path: '/tmp/auth-server-error.png', fullPage: true });
      throw new Error('Server error during form submission');
    }

    // Check if we were redirected to dashboard
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    if (currentUrl.includes('dashboard') || currentUrl.includes('/dashboard')) {
      console.log('✓ SUCCESS! Redirected to dashboard');
      console.log('✓ Account activation completed successfully!\n');

      // Verify the user was created
      const createdUser = await prisma.user.findFirst({
        where: { email: testEmail },
      });

      if (createdUser) {
        console.log('✓ User record verified in database');
        console.log('  User ID:', createdUser.id);
        console.log('  Email:', createdUser.email);
        console.log('  Status:', createdUser.status);
        console.log('  Email Verified:', createdUser.emailVerified);
      }

      // Take final screenshot
      await page.screenshot({ path: '/tmp/auth-success.png', fullPage: true });
      console.log('\n✓ Final screenshot: /tmp/auth-success.png');

      return true;
    } else {
      console.log('⚠ Not redirected to dashboard');
      console.log('Page URL:', currentUrl);
      console.log('Page content preview:', pageContent.substring(0, 300));
      await page.screenshot({ path: '/tmp/auth-no-redirect.png', fullPage: true });
      throw new Error('Did not redirect to dashboard');
    }

  } catch (error) {
    console.error('\n✗ TEST FAILED:', error.message);
    await page.screenshot({ path: '/tmp/auth-failure.png', fullPage: true });
    console.log('Error screenshot: /tmp/auth-failure.png');
    process.exit(1);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log('\n=== TEST PASSED ===');
  process.exit(0);
});
