import { test, expect } from '@playwright/test';

test.describe('Hamburger Menu Click Functionality', () => {

  test('Hamburger menu should open when clicked at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('\n=== Testing Hamburger Click at 768px ===');

    // Find hamburger button
    const hamburger = page.locator('[aria-label="Toggle menu"], button:has-text("☰"), [class*="HamburgerButton"], [class*="hamburger"]').first();

    const hamburgerExists = await hamburger.count() > 0;
    console.log(`Hamburger exists: ${hamburgerExists}`);

    if (hamburgerExists) {
      const isVisible = await hamburger.isVisible();
      console.log(`Hamburger visible: ${isVisible}`);

      // Take screenshot before click
      await page.screenshot({
        path: 'test-results/screenshots/hamburger-before-click.png'
      });

      // Click the hamburger
      await hamburger.click();
      await page.waitForTimeout(500);

      // Take screenshot after click
      await page.screenshot({
        path: 'test-results/screenshots/hamburger-after-click.png'
      });

      // Check if menu opened - look for mobile menu panel
      const mobileMenu = page.locator('[class*="MobileMenu"], [class*="mobile-menu"], nav[class*="mobile"]').first();
      const mobileMenuVisible = await mobileMenu.isVisible().catch(() => false);

      console.log(`Mobile menu visible after click: ${mobileMenuVisible}`);

      // Check if any navigation links appeared
      const navLinks = page.locator('nav a, [class*="menu"] a').filter({ hasText: /Home|Offers|Partners|Subscriptions/i });
      const navLinksCount = await navLinks.count();
      console.log(`Navigation links count: ${navLinksCount}`);

      if (navLinksCount > 0) {
        for (let i = 0; i < Math.min(navLinksCount, 5); i++) {
          const link = navLinks.nth(i);
          const isVisible = await link.isVisible();
          const text = await link.textContent();
          console.log(`  Link ${i + 1}: "${text}" - Visible: ${isVisible}`);
        }
      }

      // Check for any error messages in console
      const consoleMessages: string[] = [];
      page.on('console', msg => consoleMessages.push(msg.text()));

      console.log('\nConsole messages:', consoleMessages.slice(0, 5));
    }
  });

  test('Test click at 375px (iPhone SE)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('\n=== Testing Hamburger Click at 375px ===');

    const hamburger = page.locator('[aria-label="Toggle menu"], button, [class*="hamburger"]').filter({ hasText: /☰|menu/i }).first();

    if (await hamburger.count() > 0) {
      console.log('Hamburger found, attempting click...');

      await hamburger.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/screenshots/hamburger-mobile-after-click.png'
      });

      // Look for mobile menu with various selectors
      const possibleMenuSelectors = [
        '[role="dialog"]',
        '[role="menu"]',
        '[class*="mobile"]',
        '[class*="MobileMenu"]',
        '[class*="drawer"]',
        '[class*="Drawer"]',
        'nav[class*="open"]'
      ];

      console.log('\nSearching for mobile menu with various selectors:');
      for (const selector of possibleMenuSelectors) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          const isVisible = await element.isVisible();
          console.log(`  ${selector}: Found (Visible: ${isVisible})`);
        }
      }
    }
  });
});
