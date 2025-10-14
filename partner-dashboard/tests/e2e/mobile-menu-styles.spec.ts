import { test } from '@playwright/test';

test('Check mobile menu styles', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:3005/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Open menu
  const hamburger = page.locator('[aria-label="Toggle menu"]');
  await hamburger.click();
  await page.waitForTimeout(1500);

  // Get computed styles of the menu panel
  const styles = await page.locator('[data-testid="mobile-menu-panel"]').evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      position: computed.position,
      top: computed.top,
      right: computed.right,
      bottom: computed.bottom,
      left: computed.left,
      width: computed.width,
      height: computed.height,
      display: computed.display,
      zIndex: computed.zIndex,
      transform: computed.transform,
    };
  });

  console.log('\n=== Mobile Menu Panel Computed Styles ===');
  console.log(JSON.stringify(styles, null, 2));

  // Check inner div styles
  const innerDiv = page.locator('[data-testid="mobile-menu-panel"] > div');
  const innerStyles = await innerDiv.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      padding: computed.padding,
      height: computed.height,
      display: computed.display,
    };
  });

  console.log('\n=== Inner Div Styles ===');
  console.log(JSON.stringify(innerStyles, null, 2));
});
