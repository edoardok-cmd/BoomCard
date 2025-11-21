const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  console.log('📱 Testing mobile view (375x667 - iPhone SE)...\n');

  // Navigate to homepage
  await page.goto('http://localhost:3015', { waitUntil: 'networkidle' });

  // Wait for hero video to finish and content to appear (video is ~8 seconds)
  console.log('⏳ Waiting for hero video animation to complete...');
  await page.waitForTimeout(10000);

  // Get viewport dimensions
  const viewportSize = page.viewportSize();
  console.log(`Viewport: ${viewportSize.width}x${viewportSize.height}`);

  // Check CTA button visibility
  const ctaButton = page.locator('button').filter({ hasText: /Вземи Картата|Get Your Card/i }).first();
  const isCtaVisible = await ctaButton.isVisible().catch(() => false);

  console.log(`\nCTA Button visible: ${isCtaVisible}`);

  if (isCtaVisible) {
    const box = await ctaButton.boundingBox();
    if (box) {
      const inViewport = box.y + box.height <= viewportSize.height;
      console.log(`CTA Button Y position: ${box.y}px`);
      console.log(`CTA Button bottom: ${box.y + box.height}px`);
      console.log(`Is in viewport (without scrolling): ${inViewport ? '✅ YES' : '❌ NO'}`);

      if (!inViewport) {
        console.log(`❌ User needs to scroll ${Math.round(box.y + box.height - viewportSize.height)}px to see the CTA button`);
      }
    }
  } else {
    console.log('❌ CTA Button not found');
  }

  // Check logo/card position
  const logo = page.locator('img[alt*="card" i], img[alt*="boom" i]').first();
  const logoVisible = await logo.isVisible().catch(() => false);

  if (logoVisible) {
    const logoBox = await logo.boundingBox();
    if (logoBox) {
      console.log(`\nLogo/Card Y position: ${logoBox.y}px`);
      console.log(`Space above logo from top of page: ${Math.round(logoBox.y)}px`);

      if (logoBox.y > 150) {
        console.log(`⚠️  Excessive space above logo (${Math.round(logoBox.y)}px)`);
      } else {
        console.log(`✅ Logo spacing looks good`);
      }
    }
  }

  // Take screenshots
  await page.screenshot({ path: 'tests/screenshots/mobile-viewport.png', fullPage: false });
  await page.screenshot({ path: 'tests/screenshots/mobile-full.png', fullPage: true });

  console.log('\n📸 Screenshots saved:');
  console.log('  - tests/screenshots/mobile-viewport.png (what user sees)');
  console.log('  - tests/screenshots/mobile-full.png (full page)');

  // Test other device sizes
  const devices = [
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },
  ];

  for (const device of devices) {
    console.log(`\n📱 Testing ${device.name} (${device.width}x${device.height})...`);

    await page.setViewportSize({ width: device.width, height: device.height });
    await page.reload({ waitUntil: 'networkidle' });
    console.log(`  ⏳ Waiting for animations...`);
    await page.waitForTimeout(10000);

    const deviceCtaButton = page.locator('button').filter({ hasText: /Вземи Картата|Get Your Card/i }).first();
    const isDeviceCtaVisible = await deviceCtaButton.isVisible().catch(() => false);

    if (isDeviceCtaVisible) {
      const deviceBox = await deviceCtaButton.boundingBox();
      if (deviceBox) {
        const inViewport = deviceBox.y + deviceBox.height <= device.height;
        console.log(`  CTA in viewport: ${inViewport ? '✅ YES' : '❌ NO'} (Y: ${Math.round(deviceBox.y)}px)`);
      }
    }

    await page.screenshot({
      path: `tests/screenshots/${device.name.replace(/\s+/g, '-').toLowerCase()}.png`,
      fullPage: false
    });
  }

  console.log('\n✅ Mobile testing complete!');

  // Keep browser open for manual inspection
  console.log('\n👀 Browser kept open for manual inspection. Press Ctrl+C to close.');

  await page.waitForTimeout(300000); // Wait 5 minutes

  await browser.close();
})();
