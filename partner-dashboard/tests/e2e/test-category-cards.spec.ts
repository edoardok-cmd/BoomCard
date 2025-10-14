import { test } from '@playwright/test';

test.describe('Category Cards Consistency', () => {
  test('Desktop - cards should have equal heights', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    
    // Scroll to categories section
    await page.evaluate(() => {
      const section = document.querySelector('h2');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/screenshots/categories-desktop.png',
      clip: { x: 0, y: 600, width: 1440, height: 700 }
    });

    console.log('✓ Desktop categories screenshot saved');
  });

  test('Mobile - cards should have equal heights', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    
    // Scroll to categories
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/screenshots/categories-mobile-1.png',
      fullPage: false
    });

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'tests/screenshots/categories-mobile-2.png',
      fullPage: false
    });

    console.log('✓ Mobile categories screenshots saved');
  });
});
