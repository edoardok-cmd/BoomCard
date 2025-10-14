const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1200 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'myoffers-fix');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🔐 Logging in as partner...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    
    // Fill login form with partner account
    await page.fill('input[type="email"]', 'grandhotel@boomcard.bg');
    await page.fill('input[type="password"]', 'partner123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation after login
    await page.waitForTimeout(3000);

    // Set dark mode
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
    });

    console.log('🌐 Navigating to My Offers page in dark mode...');
    await page.goto('http://localhost:5173/partners/offers', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('📸 Capturing dark mode...');
    await page.screenshot({ path: path.join(outputDir, 'myoffers-dark.png'), fullPage: false });

    console.log(`\n✅ Screenshot saved to: ${outputDir}/myoffers-dark.png`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
