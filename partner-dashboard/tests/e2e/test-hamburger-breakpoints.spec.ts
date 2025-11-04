import { test, expect } from '@playwright/test';

test.describe('Hamburger Menu Visibility at Different Resolutions', () => {

  const resolutions = [
    { width: 1920, height: 1080, name: 'Desktop XL' },
    { width: 1440, height: 900, name: 'Desktop Large' },
    { width: 1280, height: 800, name: 'Desktop Medium' },
    { width: 1024, height: 768, name: 'Tablet Landscape (lg breakpoint)' },
    { width: 1023, height: 768, name: 'Just below lg (1023px)' },
    { width: 900, height: 600, name: 'Tablet' },
    { width: 768, height: 1024, name: 'iPad Portrait' },
    { width: 640, height: 1136, name: 'Mobile Large' },
    { width: 375, height: 667, name: 'iPhone SE' },
    { width: 360, height: 640, name: 'Small Mobile' },
  ];

  for (const resolution of resolutions) {
    test(`${resolution.name} (${resolution.width}x${resolution.height})`, async ({ page }) => {
      // Set viewport
      await page.setViewportSize({
        width: resolution.width,
        height: resolution.height
      });

      await page.goto('http://localhost:5175/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      console.log(`\n=== ${resolution.name} (${resolution.width}px) ===`);

      // Check for hamburger button
      const hamburger = page.locator('[aria-label="Toggle menu"], button:has-text("☰"), button:has([class*="hamburger"]), [class*="HamburgerButton"]').first();
      const hamburgerVisible = await hamburger.isVisible().catch(() => false);

      console.log(`Hamburger visible: ${hamburgerVisible}`);

      // Check for navigation links (desktop nav)
      const navLinks = page.locator('nav a, header a').filter({ hasText: /Home|Offers|Partners|Subscriptions/i });
      const navLinksCount = await navLinks.count();
      const firstNavVisible = navLinksCount > 0 ? await navLinks.first().isVisible().catch(() => false) : false;

      console.log(`Nav links visible: ${firstNavVisible} (${navLinksCount} found)`);

      // Take screenshot
      await page.screenshot({
        path: `test-results/screenshots/hamburger-${resolution.width}px.png`,
        fullPage: false
      });

      // Log the issue if hamburger should be visible but isn't
      if (resolution.width <= 1024 && !hamburgerVisible) {
        console.log(`⚠️  ISSUE: Hamburger should be visible at ${resolution.width}px but it's not!`);
      }

      // Check header computed styles
      const header = page.locator('header').first();
      if (await header.count() > 0) {
        const headerBg = await header.evaluate(el => {
          return window.getComputedStyle(el).backgroundColor;
        });
        console.log(`Header background: ${headerBg}`);
      }

      // If hamburger exists, check its computed styles
      if (await hamburger.count() > 0) {
        const hamburgerStyles = await hamburger.evaluate(el => {
          const styles = window.getComputedStyle(el);
          return {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            color: styles.color,
            backgroundColor: styles.backgroundColor,
            position: styles.position,
            zIndex: styles.zIndex
          };
        });
        console.log('Hamburger styles:', JSON.stringify(hamburgerStyles, null, 2));
      }
    });
  }

  test('Summary - Identify problem resolutions', async ({ page }) => {
    console.log('\n========================================');
    console.log('HAMBURGER MENU VISIBILITY TEST COMPLETE');
    console.log('========================================\n');
    console.log('Check the screenshots in test-results/screenshots/');
    console.log('Look for hamburger-*.png files');
    console.log('\nExpected behavior:');
    console.log('- Desktop (>1024px): Desktop nav visible, hamburger hidden');
    console.log('- Tablet/Mobile (<=1024px): Hamburger visible, desktop nav hidden');
    console.log('\n========================================\n');
  });
});
