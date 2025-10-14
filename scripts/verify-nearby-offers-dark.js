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
    // Set dark mode
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
    });

    console.log('🌐 Navigating to Nearby Offers page in dark mode...');
    await page.goto('http://localhost:5173/nearby', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('📸 Capturing dark mode...');
    await page.screenshot({ path: path.join(outputDir, 'nearby-offers-dark.png'), fullPage: false });

    console.log(`\n✅ Screenshot saved to: ${outputDir}/nearby-offers-dark.png`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
