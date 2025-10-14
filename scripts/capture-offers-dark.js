const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Navigate to login
    console.log('📄 Navigating to login...');
    await page.goto('http://localhost:5173/login');
    await page.waitForTimeout(1000);

    // Login with partner account
    console.log('🔐 Logging in...');
    await page.fill('input[type="email"]', 'partner@boomcard.bg');
    await page.fill('input[type="password"]', 'partner123');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForTimeout(3000);

    // Set dark mode
    console.log('🌙 Setting dark mode...');
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(500);

    // Navigate to offers page
    console.log('📄 Navigating to offers page...');
    await page.goto('http://localhost:5173/partners/offers');
    await page.waitForTimeout(2000);

    // Take screenshot
    console.log('📸 Taking screenshot...');
    await page.screenshot({ 
      path: '/Users/administrator/Documents/BoomCard/screenshots/offers-dark-fixed.png',
      fullPage: false
    });
    
    console.log('✅ Screenshot saved to screenshots/offers-dark-fixed.png');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();
