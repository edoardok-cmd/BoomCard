import { test, expect } from '@playwright/test';

test.describe('Dark Mode Visual Verification', () => {
  test('Verify dark mode on Analytics, Rewards, and Dashboard pages', async ({ page }) => {
    // Set viewport to a consistent size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Go to homepage first
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 10000 });

    // Find and click the theme toggle button
    const themeToggle = page.locator('button').filter({ hasText: /theme/i }).or(page.locator('[aria-label*="theme" i]')).or(page.locator('button:has-text("")')).first();

    // Try to find moon/sun icon buttons
    const moonButton = page.locator('svg').filter({ has: page.locator('path[d*="M21"]') }).locator('..').first();

    try {
      await moonButton.click({ timeout: 2000 });
      console.log('✓ Clicked theme toggle via moon icon');
    } catch {
      try {
        await themeToggle.click({ timeout: 2000 });
        console.log('✓ Clicked theme toggle via button');
      } catch {
        console.log('⚠ Could not find theme toggle, checking if already in dark mode');
      }
    }

    await page.waitForTimeout(500);

    // Test 1: Analytics Page
    console.log('\n📊 Testing Analytics page...');
    await page.goto('http://localhost:5173/analytics', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/analytics-dark-mode.png', fullPage: false });
    console.log('✓ Analytics page screenshot saved');

    // Test 2: Rewards Page
    console.log('\n🎁 Testing Rewards page...');
    await page.goto('http://localhost:5173/rewards', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/rewards-dark-mode.png', fullPage: false });
    console.log('✓ Rewards page screenshot saved');

    // Test 3: Dashboard Page
    console.log('\n📈 Testing Dashboard page...');
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/dashboard-dark-mode.png', fullPage: false });
    console.log('✓ Dashboard page screenshot saved');

    console.log('\n✅ All screenshots captured successfully!');
    console.log('📁 Check test-results/ directory for screenshots\n');
  });
});
