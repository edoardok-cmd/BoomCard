const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'footer-verification');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🌐 Navigating to homepage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Scroll to footer
    console.log('📜 Scrolling to footer...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(500);

    console.log('📸 Capturing footer...');
    const footer = await page.locator('footer').first();
    if (footer) {
      await footer.screenshot({ path: path.join(outputDir, 'footer-fixed.png') });
    }

    console.log('📸 Capturing full page bottom...');
    await page.screenshot({ path: path.join(outputDir, 'footer-fullpage.png'), fullPage: false });

    console.log(`\n✅ Screenshots saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
