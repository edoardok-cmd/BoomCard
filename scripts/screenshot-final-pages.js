const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function captureFinalPages() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const outputDir = path.join(__dirname, '..', 'screenshots', 'final-verification');
  await fs.mkdir(outputDir, { recursive: true });

  const pages = [
    { url: 'http://localhost:3001/rewards', name: 'rewards' },
    { url: 'http://localhost:3001/analytics', name: 'analytics' },
    { url: 'http://localhost:3001/settings', name: 'settings' }
  ];

  for (const pageInfo of pages) {
    const page = await context.newPage();

    console.log(`\n🌐 Navigating to ${pageInfo.name} page...`);
    try {
      await page.goto(pageInfo.url, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(2000);

      // Switch to dark mode
      console.log(`🌙 Switching to dark mode - ${pageInfo.name}...`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });
      await page.waitForTimeout(1000);

      // Capture dark mode
      console.log(`📸 Capturing dark mode - ${pageInfo.name}...`);
      await page.screenshot({
        path: path.join(outputDir, `${pageInfo.name}-dark.png`)
      });

      // Capture full page
      console.log(`📸 Capturing full page - ${pageInfo.name}...`);
      await page.screenshot({
        path: path.join(outputDir, `${pageInfo.name}-dark-full.png`),
        fullPage: true
      });

    } catch (error) {
      console.log(`❌ Error capturing ${pageInfo.name}: ${error.message}`);
    }

    await page.close();
  }

  await browser.close();
  console.log(`\n✅ All screenshots saved to: ${outputDir}\n`);
}

captureFinalPages().catch(console.error);
