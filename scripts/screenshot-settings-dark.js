const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1200 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'settings-fix');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🌐 Navigating to Settings page...');
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('📸 Capturing light mode...');
    await page.screenshot({ path: path.join(outputDir, 'settings-light.png'), fullPage: true });

    console.log('🌙 Switching to dark mode...');
    await page.click('[aria-label="Toggle theme"]');
    await page.waitForTimeout(500);

    console.log('📸 Capturing dark mode...');
    await page.screenshot({ path: path.join(outputDir, 'settings-dark.png'), fullPage: true });

    console.log(`\n✅ Screenshots saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
