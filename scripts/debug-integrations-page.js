const { chromium } = require('playwright');

async function debugPage() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Log console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // Log errors
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    console.log('Navigating to integrations page...');
    await page.goto('http://localhost:5174/integrations');
    await page.waitForLoadState('networkidle');

    console.log('Taking screenshot...');
    await page.screenshot({ path: 'integrations-debug.png', fullPage: true });

    console.log('Checking for elements...');
    const html = await page.content();
    console.log('Page loaded, checking for cards...');

    // Check if IntegrationCard exists in HTML
    const hasCards = html.includes('IntegrationCard');
    console.log('Has "IntegrationCard" in HTML:', hasCards);

    // Check for loading state
    const hasLoader = html.includes('Loading') || html.includes('Loader');
    console.log('Has loading indicator:', hasLoader);

    // Check for API base URL
    const apiBaseUrl = await page.evaluate(() => {
      return window.localStorage.getItem('VITE_API_BASE_URL');
    });
    console.log('API Base URL:', apiBaseURL || 'using default');

    // Wait and check again
    await page.waitForTimeout(5000);
    console.log('Taking second screenshot after 5s...');
    await page.screenshot({ path: 'integrations-debug-after-5s.png', fullPage: true });

    const newHtml = await page.content();
    console.log('Has cards after 5s:', newHtml.includes('IntegrationCard'));

    console.log('\nScreenshots saved: integrations-debug.png and integrations-debug-after-5s.png');

  } catch (error) {
    console.error('Error:', error.message);
  }

  // Keep browser open for manual inspection
  console.log('\nBrowser left open for inspection. Press Ctrl+C to close.');
  await page.waitForTimeout(60000);
  await browser.close();
}

debugPage();
