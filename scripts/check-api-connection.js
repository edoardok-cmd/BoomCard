const { chromium } = require('playwright');

async function checkAPIConnection() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const logs = [];
  const errors = [];
  const requests = [];

  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => requests.push(`${req.method()} ${req.url()}`));
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes(':3001')) {
      console.log(`API Response: ${res.status()} ${res.url()}`);
      if (res.status() >= 400) {
        try {
          const body = await res.text();
          console.log(`  Body: ${body.substring(0, 200)}`);
        } catch (e) {}
      }
    }
  });

  try {
    console.log('Loading integrations page...\n');
    await page.goto('http://localhost:5174/integrations', { timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('\n=== Console Logs ===');
    logs.forEach(log => console.log(log));

    console.log('\n=== Errors ===');
    if (errors.length > 0) {
      errors.forEach(err => console.log(err));
    } else {
      console.log('No errors');
    }

    console.log('\n=== Network Requests (API only) ===');
    const apiRequests = requests.filter(r => r.includes('/api/') || r.includes(':3001'));
    if (apiRequests.length > 0) {
      apiRequests.forEach(req => console.log(req));
    } else {
      console.log('No API requests found');
    }

  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    await browser.close();
  }
}

checkAPIConnection();
