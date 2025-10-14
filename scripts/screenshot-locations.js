const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function captureLocationsPage() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'locations-page');
  await fs.mkdir(outputDir, { recursive: true });

  const url = 'http://localhost:3001/locations';

  console.log('🌐 Navigating to Locations page...');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture light mode - full page
  console.log('📸 Capturing light mode - full page...');
  await page.screenshot({
    path: path.join(outputDir, 'locations-light-full.png'),
    fullPage: true
  });

  // Capture viewport in light mode
  console.log('📸 Capturing light mode - viewport...');
  await page.screenshot({
    path: path.join(outputDir, 'locations-light-viewport.png')
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
    path: path.join(outputDir, 'locations-dark-full.png'),
    fullPage: true
  });

  // Capture viewport in dark mode
  console.log('📸 Capturing dark mode - viewport...');
  await page.screenshot({
    path: path.join(outputDir, 'locations-dark-viewport.png')
  });

  // Switch to color mode
  console.log('🎨 Switching to color mode...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'color');
  });
  await page.waitForTimeout(1000);

  // Capture color mode - viewport
  console.log('📸 Capturing color mode - viewport...');
  await page.screenshot({
    path: path.join(outputDir, 'locations-color-viewport.png')
  });

  await browser.close();

  console.log(`\n✅ Screenshots saved to: ${outputDir}\n`);
}

captureLocationsPage().catch(console.error);
