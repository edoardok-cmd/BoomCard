const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // First, visit the site to set localStorage
    console.log('📄 Setting up authentication...');
    await page.goto('http://localhost:5173/');
    
    // Set mock authentication in localStorage
    await page.evaluate(() => {
      const mockUser = {
        id: '2',
        email: 'partner@boomcard.bg',
        firstName: 'Partner',
        lastName: 'User',
        role: 'partner',
        createdAt: Date.now(),
        emailVerified: true,
      };
      const mockToken = `mock-jwt-token-2-${Date.now()}`;
      
      localStorage.setItem('boomcard_auth', JSON.stringify(mockUser));
      localStorage.setItem('token', mockToken);
      localStorage.setItem('theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Navigate to offers page
    console.log('📄 Navigating to offers page...');
    await page.goto('http://localhost:5173/partners/offers');
    await page.waitForTimeout(3000);

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
