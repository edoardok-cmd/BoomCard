#!/usr/bin/env node

/**
 * BoomCard Screenshot Utility
 *
 * Takes screenshots of BoomCard application pages for visual testing and documentation.
 *
 * Usage:
 *   node scripts/take-screenshot.js <url> [options]
 *
 * Options:
 *   --output <path>     Output file path (default: screenshots/screenshot-{timestamp}.png)
 *   --width <pixels>    Viewport width (default: 1440)
 *   --height <pixels>   Viewport height (default: 900)
 *   --full-page         Take full page screenshot
 *   --element <selector> Screenshot specific element only
 *   --wait <ms>         Wait time after page load (default: 2000)
 */

const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeScreenshot(options) {
  const {
    url,
    output,
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

  const defaultOutput = output || path.join(screenshotsDir, `screenshot-${Date.now()}.png`);

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
      type: 'png',
      path: defaultOutput
    };

    if (elementSelector) {
      console.log(`🎯 Taking screenshot of element: ${elementSelector}`);
      const element = await page.locator(elementSelector);
      await element.screenshot(screenshotOptions);
    } else if (fullPage) {
      console.log('📸 Taking full-page screenshot...');
      screenshotOptions.fullPage = true;
      await page.screenshot(screenshotOptions);
    } else {
      console.log('📸 Taking viewport screenshot...');
      await page.screenshot(screenshotOptions);
    }

    const stats = fs.statSync(defaultOutput);
    console.log(`✅ Screenshot saved: ${defaultOutput}`);
    console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);

    // If large, suggest compression
    if (stats.size > 5 * 1024 * 1024) { // 5MB
      console.warn('⚠️  Warning: Screenshot is large (>5MB). Consider using:');
      console.warn('   npm run screenshot:compressed -- ' + url);
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
BoomCard Screenshot Utility

Usage:
  node scripts/take-screenshot.js <url> [options]

Options:
  --output <path>       Output file path (default: screenshots/screenshot-{timestamp}.png)
  --width <pixels>      Viewport width (default: 1440)
  --height <pixels>     Viewport height (default: 900)
  --full-page           Take full page screenshot
  --element <selector>  Screenshot specific element only
  --wait <ms>           Wait time after page load (default: 2000)

Examples:
  # Take viewport screenshot of homepage
  node scripts/take-screenshot.js http://localhost:3001

  # Take full page screenshot
  node scripts/take-screenshot.js http://localhost:3001 --full-page

  # Screenshot specific element
  node scripts/take-screenshot.js http://localhost:3001 --element "main"

  # Custom viewport size
  node scripts/take-screenshot.js http://localhost:3001 --width 1920 --height 1080

  # Save to specific location
  node scripts/take-screenshot.js http://localhost:3001 --output ./my-screenshot.png

  # Wait longer for slow-loading content
  node scripts/take-screenshot.js http://localhost:3001 --wait 5000
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
  takeScreenshot(options)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { takeScreenshot };
