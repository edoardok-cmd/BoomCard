import { test } from '@playwright/test';

test('Check z-index layers', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:3005/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Open menu
  const hamburger = page.locator('[aria-label="Toggle menu"]');
  await hamburger.click();
  await page.waitForTimeout(1500);

  // Check backdrop
  const backdrop = page.locator('.fixed.inset-0.bg-black\\/20');
  const backdropStyles = await backdrop.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      zIndex: computed.zIndex,
      background: computed.background,
      backgroundColor: computed.backgroundColor,
      opacity: computed.opacity,
      display: computed.display,
      position: computed.position,
    };
  });

  console.log('\n=== Backdrop Styles ===');
  console.log(JSON.stringify(backdropStyles, null, 2));

  // Check menu panel z-index relative to backdrop
  const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');
  const menuStyles = await menuPanel.evaluate((el) => {
    const computed = window.getComputedStyle(el);
    return {
      zIndex: computed.zIndex,
      opacity: computed.opacity,
      background: computed.background,
    };
  });

  console.log('\n=== Menu Panel Styles ===');
  console.log(JSON.stringify(menuStyles, null, 2));
});
