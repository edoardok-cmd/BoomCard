const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 2400 }
  });
  const page = await context.newPage();

  const outputDir = path.join(__dirname, '..', 'screenshots', 'verification');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🌐 Navigating to homepage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('📸 Capturing light mode full page...');
    await page.screenshot({ path: path.join(outputDir, 'homepage-light-full.png'), fullPage: true });

    console.log('📸 Capturing footer in light mode...');
    const footer = await page.locator('footer').first();
    if (footer) {
      await footer.screenshot({ path: path.join(outputDir, 'footer-light.png') });
    }

    console.log('🌙 Switching to dark mode...');
    await page.click('[aria-label="Toggle theme"]');
    await page.waitForTimeout(1000);

    console.log('📸 Capturing dark mode full page...');
    await page.screenshot({ path: path.join(outputDir, 'homepage-dark-full.png'), fullPage: true });

    console.log('📸 Capturing footer in dark mode...');
    if (footer) {
      await footer.screenshot({ path: path.join(outputDir, 'footer-dark.png') });
    }

    // Check Experiences page
    console.log('🌐 Navigating to Experiences page...');
    await page.goto('http://localhost:5173/experiences', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    console.log('📸 Capturing Experiences page dark mode...');
    await page.screenshot({ path: path.join(outputDir, 'experiences-dark.png'), fullPage: false });

    // Try to capture MyOffers page with authentication
    console.log('🔐 Attempting to login...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    
    // Check if already logged in (look for login form)
    const emailInput = await page.locator('input[type="email"]').count();
    
    if (emailInput > 0) {
      console.log('📝 Filling login form...');
      await page.fill('input[type="email"]', 'grandhotel@boomcard.bg');
      await page.fill('input[type="password"]', 'partner123');
      
      // Click the login button
      await page.click('button:has-text("Вход")');
      await page.waitForTimeout(3000);
      
      console.log('🌐 Navigating to My Offers page...');
      await page.goto('http://localhost:5173/partners/offers', { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      console.log('📸 Capturing My Offers page dark mode...');
      await page.screenshot({ path: path.join(outputDir, 'myoffers-dark.png'), fullPage: false });
    }

    console.log(`\n✅ All screenshots saved to: ${outputDir}`);
  } catch (error) {
    console.error('Error:', error.message);
    // Try to capture error state
    try {
      await page.screenshot({ path: path.join(outputDir, 'error-state.png') });
    } catch (e) {}
  } finally {
    await browser.close();
  }
})();
