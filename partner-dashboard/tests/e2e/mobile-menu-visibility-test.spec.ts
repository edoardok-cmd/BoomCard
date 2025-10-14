import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Visibility and Interaction Test', () => {
  test('Test hamburger menu visibility, open, and close functionality', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== MOBILE MENU VISIBILITY TEST ===\n');

    // Step 1: Check hamburger button is visible
    const hamburgerButton = page.locator('[aria-label="Toggle menu"]');
    const isHamburgerVisible = await hamburgerButton.isVisible();
    console.log(`1. Hamburger button visible: ${isHamburgerVisible}`);
    expect(isHamburgerVisible).toBe(true);

    // Step 2: Open the menu
    await hamburgerButton.click();
    await page.waitForTimeout(800);

    // Step 3: Check if menu panel is visible
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
    const isMenuVisible = await menuPanel.isVisible();
    console.log(`2. Menu panel visible after click: ${isMenuVisible}`);

    if (!isMenuVisible) {
      console.log('\n❌ MENU PANEL IS NOT VISIBLE!\n');

      // Debug information
      const menuCount = await menuPanel.count();
      console.log(`   Menu panel count: ${menuCount}`);

      if (menuCount > 0) {
        const computedStyle = await menuPanel.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            transform: styles.transform,
            zIndex: styles.zIndex,
            position: styles.position,
            top: styles.top,
            right: styles.right
          };
        });
        console.log('   Computed styles:', JSON.stringify(computedStyle, null, 2));
      }
    } else {
      console.log('\n✅ MENU PANEL IS VISIBLE!\n');

      // Check menu content
      const languageToggle = page.locator('text=EN');
      const nearbyLink = page.locator('text=header.nearby');
      const favoritesLink = page.locator('text=header.favorites');

      console.log(`3. Language toggle visible: ${await languageToggle.isVisible()}`);
      console.log(`4. Nearby link visible: ${await nearbyLink.isVisible()}`);
      console.log(`5. Favorites link visible: ${await favoritesLink.isVisible()}`);

      // Test closing via backdrop
      console.log('\n6. Testing backdrop close...');
      const backdrop = page.locator('.fixed.inset-0.bg-black\\/20');
      const isBackdropVisible = await backdrop.isVisible();
      console.log(`   Backdrop visible: ${isBackdropVisible}`);

      if (isBackdropVisible) {
        // Click backdrop to close
        await backdrop.click({ position: { x: 10, y: 10 } });
        await page.waitForTimeout(500);

        const isMenuStillVisible = await menuPanel.isVisible();
        console.log(`   Menu visible after backdrop click: ${isMenuStillVisible}`);

        if (!isMenuStillVisible) {
          console.log('\n✅ BACKDROP CLOSE WORKS!\n');
        }
      }

      // Reopen to test hamburger button close
      console.log('\n7. Testing hamburger button close...');
      await hamburgerButton.click();
      await page.waitForTimeout(500);

      const isMenuVisibleAgain = await menuPanel.isVisible();
      console.log(`   Menu visible after reopening: ${isMenuVisibleAgain}`);

      if (isMenuVisibleAgain) {
        // Click hamburger again to close
        await hamburgerButton.click();
        await page.waitForTimeout(500);

        const isFinallyGone = await menuPanel.isVisible();
        console.log(`   Menu visible after hamburger close: ${isFinallyGone}`);

        if (!isFinallyGone) {
          console.log('\n✅ HAMBURGER CLOSE WORKS!\n');
        }
      }
    }

    // Take final screenshot
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-visibility-test.png',
      fullPage: false
    });

    console.log('\n✓ Screenshot saved: mobile-menu-visibility-test.png\n');
  });
});
