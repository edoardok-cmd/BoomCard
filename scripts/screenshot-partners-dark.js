const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function capturePartnersPage() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'partners-dark-mode');
  await fs.mkdir(outputDir, { recursive: true });

  const url = 'http://localhost:3001/partners';

  console.log('🌐 Navigating to Partners page...');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture light mode - full page
  console.log('📸 Capturing light mode - full page...');
  await page.screenshot({
    path: path.join(outputDir, 'partners-light-full.png'),
    fullPage: true
  });

  // Switch to dark mode by directly setting the data-theme attribute
  console.log('🌙 Switching to dark mode...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(1000);

  // Capture dark mode - full page
  console.log('📸 Capturing dark mode - full page...');
  await page.screenshot({
    path: path.join(outputDir, 'partners-dark-full.png'),
    fullPage: true
  });

  // Capture hero section
  console.log('📸 Capturing hero section in dark mode...');
  await page.screenshot({
    path: path.join(outputDir, 'partners-dark-hero.png'),
    clip: { x: 0, y: 0, width: 1920, height: 800 }
  });

  // Scroll to benefits section
  console.log('📸 Capturing benefits section in dark mode...');
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(outputDir, 'partners-dark-benefits.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });

  // Scroll to form section
  console.log('📸 Capturing form section in dark mode...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1200));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(outputDir, 'partners-dark-form.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 }
  });

  await browser.close();

  console.log(`\n✅ Screenshots saved to: ${outputDir}\n`);
}

capturePartnersPage().catch(console.error);
