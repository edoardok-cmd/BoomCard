#!/usr/bin/env node

const playwright = require('playwright');

async function debugOffersSection() {
  console.log('🔍 Debugging offers section...\n');

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(20000);

    // Check for offers section
    const offersSection = await page.$('section:has-text("Top Offers")');
    if (offersSection) {
      console.log('✅ Offers section found');

      // Get section HTML
      const sectionHTML = await offersSection.innerHTML();
      console.log('\n📄 Section HTML length:', sectionHTML.length);

      // Check for carousel
      const carousel = await offersSection.$('[class*="Carousel"]');
      console.log('🎠 Carousel found:', !!carousel);

      // Check for offer cards
      const offerCards = await offersSection.$$('[class*="OfferCard"]');
      console.log('🎴 Offer cards found:', offerCards.length);

      // Check for any divs in section
      const allDivs = await offersSection.$$('div');
      console.log('📦 Total divs in section:', allDivs.length);

      // Print a snippet of the HTML
      console.log('\n📝 Section HTML preview (first 500 chars):');
      console.log(sectionHTML.substring(0, 500) + '...');

    } else {
      console.log('❌ Offers section not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugOffersSection()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
