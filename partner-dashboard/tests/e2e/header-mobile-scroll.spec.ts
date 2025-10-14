import { test } from '@playwright/test';

test.describe('Mobile Menu Panel Content', () => {
  test.use({
    viewport: { width: 375, height: 667 },
  });

  test('should capture mobile menu panel content', async ({ page }) => {
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');

    // Click hamburger
    await page.locator('[aria-label="Toggle menu"]').click();
    await page.waitForTimeout(1000);

    // Find the mobile menu panel
    const menuPanel = page.locator('div').filter({ hasText: /EN.*BG/ }).first();
    
    // Take screenshot of just the menu panel area
    const box = await menuPanel.boundingBox();
    if (box) {
      console.log('Menu panel position:', box);
      await page.screenshot({
        path: 'tests/screenshots/mobile-menu-panel.png',
        clip: { x: box.x, y: box.y, width: Math.min(box.width, 375), height: Math.min(box.height, 667) }
      });
    }

    // Also take a screenshot scrolled to show the top content
    await page.evaluate(() => {
      const panel = document.querySelector('[class*="MobileMenuPanel"]');
      if (panel) panel.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    
    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-scrolled-top.png',
      fullPage: false
    });
  });
});
