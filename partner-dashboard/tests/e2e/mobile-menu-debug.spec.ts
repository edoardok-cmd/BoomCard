import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Debug Positioning', () => {
  test('Debug menu panel position and transform', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== MOBILE MENU DEBUG TEST ===\n');

    const hamburgerButton = page.locator('[aria-label="Toggle menu"]');
    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');

    // Open menu
    await hamburgerButton.click();
    await page.waitForTimeout(1000);

    console.log('1. Getting computed styles...');
    const styles = await menuPanel.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        position: computed.position,
        top: computed.top,
        right: computed.right,
        width: computed.width,
        height: computed.height,
        maxWidth: computed.maxWidth,
        zIndex: computed.zIndex,
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        transform: computed.transform,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right
        }
      };
    });

    console.log('\nComputed Styles:');
    console.log(JSON.stringify(styles, null, 2));

    const viewport = await page.viewportSize();
    console.log('\nViewport:', viewport);

    console.log(`\nMenu rect.left: ${styles.rect.left}`);
    console.log(`Menu rect.right: ${styles.rect.right}`);
    console.log(`Viewport width: ${viewport?.width}`);

    await page.screenshot({
      path: 'tests/screenshots/mobile-menu-DEBUG.png',
      fullPage: true
    });

    console.log('\n✓ Screenshot saved\n');
  });
});
