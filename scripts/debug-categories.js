#!/usr/bin/env node

const playwright = require('playwright');

async function debugCategories() {
  console.log('🔍 Debugging categories page...\n');

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleMessages = [];
  const errors = [];

  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto('http://localhost:3005/categories/restaurants', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Check if page rendered
    const bodyText = await page.textContent('body');
    console.log('📄 Page body text length:', bodyText?.length || 0);

    if (consoleMessages.length > 0) {
      console.log('\n📝 Console messages:');
      consoleMessages.forEach(msg => {
        const icon = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`   ${icon} [${msg.type}] ${msg.text}`);
      });
    }

    if (errors.length > 0) {
      console.log('\n🚨 Page errors:');
      errors.forEach(err => console.log(`   ❌ ${err}`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugCategories()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
