const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1200 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'nearby-offers-verification');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🌐 Navigating to Nearby Offers page...');
    await page.goto('http://localhost:5173/nearby', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Toggle to dark mode using the theme button
    console.log('🌙 Switching to dark mode...');
    const themeButton = await page.locator('[aria-label="Toggle theme"]').first();
    await themeButton.click();
    await page.waitForTimeout(500);

    // Click the Filters button to expand the filters panel
    console.log('🔍 Expanding filters...');
    await page.click('button:has-text("Filters")');
    await page.waitForTimeout(500);

    console.log('📸 Capturing dark mode with filters expanded...');
    await page.screenshot({ path: path.join(outputDir, 'nearby-offers-dark-filters.png'), fullPage: false });

    console.log(`\n✅ Screenshot saved to: ${outputDir}/nearby-offers-dark-filters.png`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
