import { test, expect } from '@playwright/test';

test.describe('Mobile Hero Section', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE
  });

  test('should display hero section with proper spacing on mobile', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:3015');

    // Wait for the hero section to load
    await page.waitForSelector('[data-testid="hero-section"], .hero, video', {
      timeout: 10000,
    });

    // Wait a bit for animations
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await page.screenshot({
      path: 'tests/screenshots/mobile-hero-full.png',
      fullPage: true,
    });

    // Take viewport screenshot (what user sees initially)
    await page.screenshot({
      path: 'tests/screenshots/mobile-hero-viewport.png',
      fullPage: false,
    });

    // Check if CTA button is visible in viewport
    const ctaButton = page.locator('button:has-text("Вземи Картата"), button:has-text("Get Your Card")').first();
    const isCtaVisible = await ctaButton.isVisible();

    console.log('CTA Button visible:', isCtaVisible);

    // Get button position
    if (isCtaVisible) {
      const box = await ctaButton.boundingBox();
      console.log('CTA Button position:', box);
      console.log('Viewport height:', 667);
      console.log('Is in viewport:', box && box.y < 667);
    }

    // Get logo/card position
    const logo = page.locator('img[alt*="BoomCard"], img[alt*="card"]').first();
    const logoBox = await logo.boundingBox();
    console.log('Logo position:', logoBox);

    // Measure spacing
    if (logoBox) {
      console.log('Space above logo:', logoBox.y);
    }
  });

  test('should display on different mobile sizes', async ({ page }) => {
    const devices = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPhone 12', width: 390, height: 844 },
      { name: 'iPhone 12 Pro Max', width: 428, height: 926 },
      { name: 'Samsung Galaxy S21', width: 360, height: 800 },
    ];

    for (const device of devices) {
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.goto('http://localhost:3015');

      // Wait for content
      await page.waitForTimeout(2000);

      // Take screenshot
      await page.screenshot({
        path: `tests/screenshots/mobile-${device.name.replace(/\s+/g, '-')}.png`,
        fullPage: false,
      });

      console.log(`\n${device.name} (${device.width}x${device.height}):`);

      // Check CTA visibility
      const ctaButton = page.locator('button:has-text("Вземи Картата"), button:has-text("Get Your Card")').first();
      const isVisible = await ctaButton.isVisible();
      const box = await ctaButton.boundingBox();

      console.log('  CTA visible:', isVisible);
      console.log('  CTA in viewport:', box && box.y < device.height);
      if (box) {
        console.log('  CTA Y position:', box.y);
      }
    }
  });
});
