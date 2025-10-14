const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'language-toggle-verification');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🌐 Navigating to homepage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    console.log('📸 Capturing header with new language toggle...');
    const header = await page.locator('header').first();
    await header.screenshot({ path: path.join(outputDir, 'header-language-icon.png') });

    console.log('🌙 Switching to dark mode...');
    const themeButton = await page.locator('[aria-label="Toggle theme"]').first();
    await themeButton.click();
    await page.waitForTimeout(500);

    console.log('📸 Capturing header in dark mode...');
    await header.screenshot({ path: path.join(outputDir, 'header-language-icon-dark.png') });

    console.log(`\n✅ Screenshots saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
