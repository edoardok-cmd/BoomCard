import { test } from '@playwright/test';

test('Check mobile menu attributes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('http://localhost:3005/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Open menu
  const hamburger = page.locator('[aria-label="Toggle menu"]');
  await hamburger.click();
  await page.waitForTimeout(1500);

  // Get all attributes and classes
  const attrs = await page.locator('[data-testid="mobile-menu-panel"]').evaluate((el) => {
    return {
      className: el.className,
      style: el.getAttribute('style'),
      allAttributes: Array.from(el.attributes).map(attr => ({
        name: attr.name,
        value: attr.value
      }))
    };
  });

  console.log('\n=== Mobile Menu Panel Attributes ===');
  console.log('Class:', attrs.className);
  console.log('Inline Style:', attrs.style);
  console.log('\nAll Attributes:');
  attrs.allAttributes.forEach(attr => {
    console.log(`  ${attr.name}: ${attr.value}`);
  });
});
