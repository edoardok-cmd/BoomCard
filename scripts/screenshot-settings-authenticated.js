const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 2000 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'settings-fix');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🔐 Logging in...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    
    // Fill login form
    await page.fill('input[type="email"]', 'test@boomcard.bg');
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation after login
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Set dark mode
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
    });

    console.log('🌐 Navigating to Settings page in dark mode...');
    await page.goto('http://localhost:5173/settings', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('📸 Capturing dark mode...');
    await page.screenshot({ path: path.join(outputDir, 'settings-dark-auth.png'), fullPage: true });

    console.log(`\n✅ Screenshot saved to: ${outputDir}/settings-dark-auth.png`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
