const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

async function captureExperiences() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const outputDir = path.join(__dirname, '..', 'screenshots', 'experiences-fix');
  await fs.mkdir(outputDir, { recursive: true });

  const page = await context.newPage();

  console.log('🌐 Navigating to Experiences page...');
  await page.goto('http://localhost:5175/experiences', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture light mode
  console.log('📸 Capturing light mode...');
  await page.screenshot({
    path: path.join(outputDir, 'experiences-light.png')
  });

  // Switch to dark mode
  console.log('🌙 Switching to dark mode...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(1000);

  // Capture dark mode
  console.log('📸 Capturing dark mode...');
  await page.screenshot({
    path: path.join(outputDir, 'experiences-dark.png')
  });

  await browser.close();
  console.log(`\n✅ Screenshots saved to: ${outputDir}\n`);
}

captureExperiences().catch(console.error);
