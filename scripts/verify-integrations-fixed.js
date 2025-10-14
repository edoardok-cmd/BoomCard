/**
 * Verification Script: Integrations Page CORS Fix
 * Tests that the integrations page now loads with API data
 */

const { chromium } = require('playwright');

async function verify() {
  console.log('🧪 Testing Integrations Page CORS Fix\n');
  console.log('='.repeat(50));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let apiCalls = {
    available: 0,
    connected: 0,
    stats: 0,
    corsErrors: 0
  };

  // Monitor network
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/integrations/available')) {
      apiCalls.available++;
      console.log(`✅ API Call: GET /api/integrations/available - ${response.status()}`);
    }
    if (url.includes('/api/integrations/connected')) {
      apiCalls.connected++;
      console.log(`ℹ️  API Call: GET /api/integrations/connected - ${response.status()} (expected 401)`);
    }
    if (url.includes('/api/integrations/stats')) {
      apiCalls.stats++;
      console.log(`ℹ️  API Call: GET /api/integrations/stats - ${response.status()} (expected 401)`);
    }
  });

  page.on('console', (msg) => {
    if (msg.text().includes('CORS') || msg.text().includes('Access-Control')) {
      apiCalls.corsErrors++;
      console.log(`❌ CORS Error: ${msg.text()}`);
    }
  });

  try {
    console.log('\n📍 Test 1: Load integrations page');
    await page.goto('http://localhost:5173/integrations', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded successfully\n');

    console.log('📍 Test 2: Wait for integrations to render');
    await page.waitForTimeout(3000); // Give React Query time

    const title = await page.locator('h1').first().textContent();
    console.log(`✅ Page title: "${title}"\n`);

    console.log('📍 Test 3: Check for integration cards');
    const cards = await page.locator('[class*="IntegrationCard"]').count();
    console.log(`${cards > 0 ? '✅' : '❌'} Found ${cards} integration cards\n`);

    console.log('📍 Test 4: Check button text for unauthenticated users');
    const buttons = await page.locator('button').allTextContents();
    const hasLearnMore = buttons.some(b => b.includes('Learn More') || b.includes('Научи Повече'));
    console.log(`${hasLearnMore ? '✅' : '⚠️ '} Button shows "${hasLearnMore ? 'Learn More' : 'other text'}" for unauthenticated users\n`);

    console.log('📍 Test 5: Open integration modal');
    const firstCard = page.locator('[class*="IntegrationCard"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await page.waitForTimeout(500);

      const modalVisible = await page.locator('[class*="Modal"]').first().isVisible();
      console.log(`${modalVisible ? '✅' : '❌'} Modal opened successfully\n`);

      if (modalVisible) {
        const loginPrompt = await page.getByText(/Login Required|Изисква се вход/i).isVisible().catch(() => false);
        console.log(`${loginPrompt ? '✅' : '⚠️ '} Login prompt ${loginPrompt ? 'is displayed' : 'not found (may be authenticated)'}\n`);
      }
    }

    // Summary
    console.log('='.repeat(50));
    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`API Calls (available): ${apiCalls.available} ${apiCalls.available > 0 ? '✅' : '❌'}`);
    console.log(`API Calls (connected): ${apiCalls.connected} (401 is OK)`);
    console.log(`API Calls (stats): ${apiCalls.stats} (401 is OK)`);
    console.log(`CORS Errors: ${apiCalls.corsErrors} ${apiCalls.corsErrors === 0 ? '✅' : '❌'}`);
    console.log(`Integration Cards: ${cards} ${cards > 0 ? '✅' : '❌'}`);
    console.log('='.repeat(50));

    if (apiCalls.corsErrors === 0 && apiCalls.available > 0 && cards > 0) {
      console.log('\n🎉 SUCCESS! Integrations page is working correctly!');
      console.log('   - No CORS errors');
      console.log('   - API calls successful');
      console.log('   - Integration cards rendered');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some issues detected:');
      if (apiCalls.corsErrors > 0) console.log('   - CORS errors present');
      if (apiCalls.available === 0) console.log('   - No successful API calls');
      if (cards === 0) console.log('   - No integration cards rendered');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verify();
