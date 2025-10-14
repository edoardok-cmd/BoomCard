const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 200 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'language-toggle-verification');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🌐 Navigating to homepage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    console.log('📸 Capturing header with new globe icon...');
    const header = await page.locator('header').first();
    await header.screenshot({ path: path.join(outputDir, 'header-globe-icon-new.png') });

    console.log(`\n✅ Screenshot saved to: ${outputDir}/header-globe-icon-new.png`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
