import { test } from '@playwright/test';

test.describe('Final Mobile Test - Card Visibility', () => {
  test('iPhone SE - card should be fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('\n=== TESTING MOBILE CARD VISIBILITY ===');
    
    await page.screenshot({
      path: 'tests/screenshots/FINAL-mobile-hero-complete.png',
      fullPage: false
    });

    console.log('✓ Full viewport screenshot saved');
    
    // Scroll down slightly to capture more of the card if needed
    await page.evaluate(() => window.scrollTo(0, 50));
    await page.waitForTimeout(500);
    
    await page.screenshot({
      path: 'tests/screenshots/FINAL-mobile-hero-scrolled.png',
      fullPage: false
    });

    console.log('✓ Scrolled view screenshot saved');
    console.log('\nCheck: tests/screenshots/FINAL-mobile-*.png');
    console.log('Card should be fully visible without black blocks or cutoff');
  });
});
