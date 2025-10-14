import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Backdrop Test', () => {
  test('Check backdrop existence and click handling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== BACKDROP TEST ===\n');

    const hamburgerButton = page.locator('[aria-label="Toggle menu"]');
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');

    await hamburgerButton.click();
    await page.waitForTimeout(800);

    console.log('1. Menu is open');

    const backdrop = page.locator('.fixed.inset-0').first();
    const backdropCount = await page.locator('.fixed.inset-0').count();
    
    console.log('Backdrop count:', backdropCount);

    if (backdropCount > 0) {
      const backdropVisible = await backdrop.isVisible();
      console.log('Backdrop visible:', backdropVisible);

      const backdropStyles = await backdrop.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          zIndex: computed.zIndex,
          position: computed.position,
          width: rect.width,
          height: rect.height,
          backgroundColor: computed.backgroundColor,
          pointerEvents: computed.pointerEvents
        };
      });

      console.log('Backdrop styles:', JSON.stringify(backdropStyles, null, 2));

      console.log('\n2. Clicking backdrop directly...');
      await backdrop.click({ force: true });
      await page.waitForTimeout(500);

      const menuStillVisible = await menuPanel.isVisible().catch(() => false);
      console.log('Menu visible after backdrop click:', menuStillVisible);
    }

    console.log('\n✓ Test complete\n');
  });
});
