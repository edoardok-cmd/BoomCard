import { test } from '@playwright/test';

test.describe('Debug Actual Current State', () => {
  test('iPhone SE - exact user viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Screenshot exactly what user sees
    await page.screenshot({
      path: 'tests/screenshots/debug-current-header.png',
      clip: { x: 0, y: 0, width: 375, height: 200 }
    });

    await page.screenshot({
      path: 'tests/screenshots/debug-current-hero-full.png',
      clip: { x: 0, y: 0, width: 375, height: 667 }
    });

    // Scroll down to see cards
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(1000);
    
    await page.screenshot({
      path: 'tests/screenshots/debug-current-cards.png',
      clip: { x: 0, y: 0, width: 375, height: 667 }
    });

    // Check what's actually in the header
    const allButtons = await page.locator('header button').all();
    console.log('\n=== ALL BUTTONS IN HEADER ===');
    for (let i = 0; i < allButtons.length; i++) {
      const text = await allButtons[i].textContent();
      const visible = await allButtons[i].isVisible();
      console.log(`Button ${i}: "${text}" - visible: ${visible}`);
    }

    // Check for DU dropdown
    const duDropdown = page.locator('text=DU').first();
    console.log('\n=== DU DROPDOWN ===');
    console.log('DU visible:', await duDropdown.isVisible());

    // Check hero section for black overlay
    const heroSection = page.locator('[class*="HeroBlast"]').first();
    if (await heroSection.isVisible()) {
      console.log('\n=== HERO SECTION FOUND ===');
    }
  });
});
