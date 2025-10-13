#!/usr/bin/env node

/**
 * BoomCard Compressed Screenshot Utility
 *
 * Takes screenshots with automatic compression to avoid API size limits.
 * Use this for very long pages or when you need smaller file sizes.
 *
 * Usage:
 *   node scripts/take-compressed-screenshot.js <url> [options]
 *
 * Options:
 *   --output <path>     Output file path (default: screenshots/compressed-{timestamp}.jpg)
 *   --quality <0-100>   JPEG quality (default: 70)
 *   --width <pixels>    Viewport width (default: 1440)
 *   --height <pixels>   Viewport height (default: 900)
 *   --full-page         Take full page screenshot (will be compressed)
 *   --element <selector> Screenshot specific element only
 *   --wait <ms>         Wait time after page load (default: 2000)
 */

const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeCompressedScreenshot(options) {
  const {
    url,
    output,
    quality = 70,
    width = 1440,
    height = 900,
    fullPage = false,
    elementSelector = null,
    waitTime = 2000
  } = options;

  // Ensure screenshots directory exists
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const defaultOutput = output || path.join(screenshotsDir, `compressed-${Date.now()}.jpg`);

  console.log('🚀 Launching browser...');
  const browser = await playwright.chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width, height }
  });

  const page = await context.newPage();

  try {
    console.log(`📄 Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for any animations or dynamic content
    console.log(`⏳ Waiting ${waitTime}ms for page to settle...`);
    await page.waitForTimeout(waitTime);

    const screenshotOptions = {
      type: 'jpeg',
      quality: quality,
      path: defaultOutput
    };

    if (elementSelector) {
      console.log(`🎯 Taking screenshot of element: ${elementSelector}`);
      const element = await page.locator(elementSelector);
      await element.screenshot(screenshotOptions);
    } else if (fullPage) {
      console.log('📸 Taking full-page screenshot (compressed)...');
      screenshotOptions.fullPage = true;
      await page.screenshot(screenshotOptions);
    } else {
      console.log('📸 Taking viewport screenshot (compressed)...');
      await page.screenshot(screenshotOptions);
    }

    const stats = fs.statSync(defaultOutput);
    console.log(`✅ Screenshot saved: ${defaultOutput}`);
    console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`🎨 Quality: ${quality}%`);

    // If still too large, warn
    if (stats.size > 5 * 1024 * 1024) { // 5MB
      console.warn('⚠️  Warning: Screenshot is still large (>5MB). Consider:');
      console.warn('   - Reducing --quality (current: ' + quality + ')');
      console.warn('   - Using --element to capture specific sections');
      console.warn('   - Taking viewport screenshots instead of full-page');
    }

    return defaultOutput;
  } catch (error) {
    console.error('❌ Error taking screenshot:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    quality: 70,
    width: 1440,
    height: 900,
    fullPage: false,
    waitTime: 2000
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('--')) {
      if (!options.url) {
        options.url = arg;
      }
      continue;
    }

    switch (arg) {
      case '--output':
        options.output = args[++i];
        break;
      case '--quality':
        options.quality = parseInt(args[++i]);
        break;
      case '--width':
        options.width = parseInt(args[++i]);
        break;
      case '--height':
        options.height = parseInt(args[++i]);
        break;
      case '--full-page':
        options.fullPage = true;
        break;
      case '--element':
        options.elementSelector = args[++i];
        break;
      case '--wait':
        options.waitTime = parseInt(args[++i]);
        break;
      case '--help':
        console.log(`
BoomCard Compressed Screenshot Utility

Usage:
  node scripts/take-compressed-screenshot.js <url> [options]

Options:
  --output <path>       Output file path (default: screenshots/compressed-{timestamp}.jpg)
  --quality <0-100>     JPEG quality (default: 70)
  --width <pixels>      Viewport width (default: 1440)
  --height <pixels>     Viewport height (default: 900)
  --full-page           Take full page screenshot (will be compressed)
  --element <selector>  Screenshot specific element only
  --wait <ms>           Wait time after page load (default: 2000)

Examples:
  # Viewport screenshot with default compression
  node scripts/take-compressed-screenshot.js http://localhost:3001

  # Full page with heavy compression
  node scripts/take-compressed-screenshot.js http://localhost:3001 --full-page --quality 50

  # Specific element with medium compression
  node scripts/take-compressed-screenshot.js http://localhost:3001 --element "main" --quality 80

  # Custom viewport size
  node scripts/take-compressed-screenshot.js http://localhost:3001 --width 1920 --height 1080
        `);
        process.exit(0);
    }
  }

  if (!options.url) {
    console.error('❌ Error: URL is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  takeCompressedScreenshot(options)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { takeCompressedScreenshot };
