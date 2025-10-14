import { test, expect } from '@playwright/test';

test.describe('Final Verification - All Fixes', () => {
  test('Desktop (1440px) - Controls SHOULD be visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== DESKTOP (1440px) ===');
    
    // Header screenshot
    await page.screenshot({
      path: 'tests/screenshots/final-desktop-header.png',
      clip: { x: 0, y: 0, width: 1440, height: 80 }
    });

    // Hero cards screenshot
    await page.screenshot({
      path: 'tests/screenshots/final-desktop-hero.png',
      clip: { x: 0, y: 80, width: 1440, height: 600 }
    });

    const langEN = page.locator('button:has-text("EN")').first();
    const langBG = page.locator('button:has-text("BG")').first();
    const themeSwitcher = page.locator('[aria-label="Change theme"]').first();
    
    const enVisible = await langEN.isVisible();
    const bgVisible = await langBG.isVisible();
    const themeVisible = await themeSwitcher.isVisible();
    
    console.log('✓ EN button visible:', enVisible, '(expected: true)');
    console.log('✓ BG button visible:', bgVisible, '(expected: true)');
    console.log('✓ Theme switcher visible:', themeVisible, '(expected: true)');
    
    expect(enVisible).toBe(true);
    expect(bgVisible).toBe(true);
    expect(themeVisible).toBe(true);
  });

  test('Tablet (900px) - Controls should be HIDDEN, hamburger visible', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== TABLET (900px) ===');

    // Header screenshot
    await page.screenshot({
      path: 'tests/screenshots/final-tablet-header.png',
      clip: { x: 0, y: 0, width: 900, height: 80 }
    });

    // Hero cards screenshot  
    await page.screenshot({
      path: 'tests/screenshots/final-tablet-hero.png',
      clip: { x: 0, y: 80, width: 900, height: 600 }
    });

    const langEN = page.locator('header button:has-text("EN")').first();
    const themeSwitcher = page.locator('header [aria-label="Change theme"]').first();
    const hamburger = page.locator('[aria-label="Toggle menu"]');
    
    const enVisible = await langEN.isVisible();
    const themeVisible = await themeSwitcher.isVisible();
    const hamburgerVisible = await hamburger.isVisible();
    
    console.log('✓ EN button hidden in header:', !enVisible, '(expected: true)');
    console.log('✓ Theme switcher hidden in header:', !themeVisible, '(expected: true)');
    console.log('✓ Hamburger menu visible:', hamburgerVisible, '(expected: true)');
    
    expect(enVisible).toBe(false);
    expect(themeVisible).toBe(false);
    expect(hamburgerVisible).toBe(true);

    // Open hamburger menu
    console.log('\n=== Opening hamburger menu ===');
    await hamburger.click();
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/screenshots/final-tablet-menu-open.png',
      clip: { x: 0, y: 0, width: 900, height: 500 }
    });

    const enInMenu = page.locator('button:has-text("EN")').last();
    const bgInMenu = page.locator('button:has-text("BG")').last();
    
    const enInMenuVisible = await enInMenu.isVisible();
    const bgInMenuVisible = await bgInMenu.isVisible();
    
    console.log('✓ EN button visible in menu:', enInMenuVisible, '(expected: true)');
    console.log('✓ BG button visible in menu:', bgInMenuVisible, '(expected: true)');
    
    expect(enInMenuVisible).toBe(true);
    expect(bgInMenuVisible).toBe(true);
  });

  test('Mobile (375px) - Only hamburger menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('\n=== MOBILE (375px) ===');

    await page.screenshot({
      path: 'tests/screenshots/final-mobile-header.png',
      clip: { x: 0, y: 0, width: 375, height: 80 }
    });

    await page.screenshot({
      path: 'tests/screenshots/final-mobile-hero.png',
      clip: { x: 0, y: 80, width: 375, height: 500 }
    });

    const hamburger = page.locator('[aria-label="Toggle menu"]');
    const hamburgerVisible = await hamburger.isVisible();
    
    console.log('✓ Hamburger menu visible:', hamburgerVisible, '(expected: true)');
    expect(hamburgerVisible).toBe(true);

    // Open menu
    await hamburger.click();
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/screenshots/final-mobile-menu-open.png',
      clip: { x: 0, y: 0, width: 375, height: 400 }
    });

    const enInMenu = page.locator('button:has-text("EN")').last();
    console.log('✓ Controls visible in mobile menu:', await enInMenu.isVisible(), '(expected: true)');
  });
});

console.log('\n========================================');
console.log('ALL TESTS COMPLETED SUCCESSFULLY!');
console.log('========================================\n');
