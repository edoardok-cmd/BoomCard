import { test, expect } from '@playwright/test';

test.describe('Mobile Menu - Content Debug', () => {
  test('Check menu panel content and children', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3005/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    console.log('\n=== MOBILE MENU CONTENT DEBUG ===\n');

    const hamburgerButton = page.locator('[aria-label="Toggle menu"]');
    await hamburgerButton.click();
    await page.waitForTimeout(1000);

    const menuPanel = page.locator('[data-testid="mobile-menu-panel"]');

    // Check if menu has content
    const innerHTML = await menuPanel.evaluate((el) => {
      return {
        hasChildren: el.children.length,
        childrenCount: el.children.length,
        innerHTML: el.innerHTML.substring(0, 500),
        firstChildTag: el.children[0]?.tagName,
        backgroundColor: window.getComputedStyle(el).backgroundColor,
        color: window.getComputedStyle(el).color
      };
    });

    console.log('\nMenu Panel Content:');
    console.log(JSON.stringify(innerHTML, null, 2));

    // Check for specific elements that should be in the menu
    const languageToggle = menuPanel.locator('button:has-text("EN")');
    const themeButtons = menuPanel.locator('button');
    
    console.log(`\nLanguage toggle found: ${await languageToggle.count()}`);
    console.log(`Total buttons in menu: ${await themeButtons.count()}`);

    // Try to get text content
    const textContent = await menuPanel.textContent();
    console.log(`\nMenu text content (first 200 chars):`);
    console.log(textContent?.substring(0, 200));

    console.log('\n✅ Content debug complete\n');
  });
});
