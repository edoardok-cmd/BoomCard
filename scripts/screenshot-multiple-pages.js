const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function captureMultiplePages() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const outputDir = path.join(__dirname, '..', 'screenshots', 'multi-pages-dark');
  await fs.mkdir(outputDir, { recursive: true });

  const pages = [
    { url: 'http://localhost:3001/favorites', name: 'favorites' },
    { url: 'http://localhost:3001/experiences', name: 'experiences' },
    { url: 'http://localhost:3001/categories', name: 'categories' },
    { url: 'http://localhost:3001/promotions', name: 'promotions' }
  ];

  for (const pageInfo of pages) {
    const page = await context.newPage();

    console.log(`\n🌐 Navigating to ${pageInfo.name} page...`);
    await page.goto(pageInfo.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Capture light mode
    console.log(`📸 Capturing light mode - ${pageInfo.name}...`);
    await page.screenshot({
      path: path.join(outputDir, `${pageInfo.name}-light.png`)
    });

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

    // Capture full page dark mode
    console.log(`📸 Capturing full page dark mode - ${pageInfo.name}...`);
    await page.screenshot({
      path: path.join(outputDir, `${pageInfo.name}-dark-full.png`),
      fullPage: true
    });

    await page.close();
  }

  await browser.close();
  console.log(`\n✅ All screenshots saved to: ${outputDir}\n`);
}

captureMultiplePages().catch(console.error);
