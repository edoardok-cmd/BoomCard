#!/usr/bin/env node

/**
 * Debug script to capture console logs and network errors from homepage
 */

const playwright = require('playwright');

async function debugHomepage() {
  console.log('🔍 Starting homepage debug...\n');

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleMessages = [];
  const networkErrors = [];

  // Capture console messages
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Capture network errors
  page.on('requestfailed', request => {
    networkErrors.push({
      url: request.url(),
      failure: request.failure()?.errorText || 'Unknown error'
    });
  });

  try {
    console.log('📄 Navigating to http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('⏳ Waiting 15 seconds for page to fully load...');
    await page.waitForTimeout(15000);

    // Check if offers section exists
    const offersSection = await page.$('text=Top Offers');
    console.log(`\n📊 Offers section found: ${offersSection ? 'YES' : 'NO'}`);

    if (offersSection) {
      const offerCards = await page.$$('[class*="OfferCard"]');
      console.log(`🎴 Offer cards found: ${offerCards.length}`);
    }

    // Print console messages
    console.log(`\n📝 Console Messages (${consoleMessages.length}):`);
    consoleMessages.forEach(msg => {
      const icon = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`   ${icon} [${msg.type}] ${msg.text}`);
    });

    // Print network errors
    if (networkErrors.length > 0) {
      console.log(`\n🌐 Network Errors (${networkErrors.length}):`);
      networkErrors.forEach(err => {
        console.log(`   ❌ ${err.url}`);
        console.log(`      ${err.failure}`);
      });
    } else {
      console.log('\n✅ No network errors');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugHomepage()
  .then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
