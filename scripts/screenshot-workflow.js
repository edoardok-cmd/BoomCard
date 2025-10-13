#!/usr/bin/env node

/**
 * BoomCard Screenshot Workflow
 *
 * Automated workflow to capture screenshots of all major BoomCard pages.
 * Useful for visual regression testing, documentation, and QA.
 *
 * Usage:
 *   node scripts/screenshot-workflow.js [options]
 *
 * Options:
 *   --base-url <url>    Base URL (default: http://localhost:3001)
 *   --output-dir <path> Output directory (default: screenshots/workflow-{timestamp})
 *   --quality <0-100>   JPEG quality for compression (default: 70)
 *   --format <png|jpg>  Screenshot format (default: png)
 *   --full-page         Take full page screenshots
 *   --pages <list>      Comma-separated list of pages (default: all)
 */

const playwright = require('playwright');
const fs = require('fs');
const path = require('path');

// Define BoomCard pages to capture
const BOOMCARD_PAGES = [
  {
    name: 'home',
    path: '/',
    description: 'Homepage',
    wait: 2000
  },
  {
    name: 'login',
    path: '/login',
    description: 'Login Page',
    wait: 1500
  },
  {
    name: 'register',
    path: '/register',
    description: 'Registration Page',
    wait: 1500
  },
  {
    name: 'dashboard',
    path: '/dashboard',
    description: 'Partner Dashboard',
    wait: 2500,
    requiresAuth: true
  },
  {
    name: 'offers',
    path: '/offers',
    description: 'Browse Offers',
    wait: 2000
  },
  {
    name: 'offers-create',
    path: '/offers/create',
    description: 'Create Offer',
    wait: 2000,
    requiresAuth: true
  },
  {
    name: 'analytics',
    path: '/analytics',
    description: 'Analytics Dashboard',
    wait: 2500,
    requiresAuth: true
  },
  {
    name: 'qr-codes',
    path: '/qr-codes',
    description: 'QR Code Manager',
    wait: 2000,
    requiresAuth: true
  },
  {
    name: 'settings',
    path: '/settings',
    description: 'Settings Page',
    wait: 1500,
    requiresAuth: true
  },
  {
    name: 'pricing',
    path: '/pricing',
    description: 'Pricing Page',
    wait: 2000
  }
];

async function runScreenshotWorkflow(options) {
  const {
    baseUrl = 'http://localhost:3001',
    outputDir,
    quality = 70,
    format = 'png',
    fullPage = false,
    pages = null
  } = options;

  // Setup output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const defaultOutputDir = outputDir || path.join(__dirname, '..', 'screenshots', `workflow-${timestamp}`);

  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  console.log('🚀 Starting BoomCard Screenshot Workflow');
  console.log(`📁 Output directory: ${defaultOutputDir}`);
  console.log(`🌐 Base URL: ${baseUrl}`);
  console.log('');

  // Filter pages if specified
  const pagesToCapture = pages
    ? BOOMCARD_PAGES.filter(p => pages.includes(p.name))
    : BOOMCARD_PAGES;

  console.log(`📸 Capturing ${pagesToCapture.length} pages...\n`);

  const browser = await playwright.chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  const results = {
    success: [],
    failed: [],
    timestamp: new Date().toISOString()
  };

  // Optional: Login if credentials provided
  const shouldLogin = pagesToCapture.some(p => p.requiresAuth);
  if (shouldLogin && process.env.BOOMCARD_TEST_EMAIL && process.env.BOOMCARD_TEST_PASSWORD) {
    console.log('🔐 Logging in for authenticated pages...');
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', process.env.BOOMCARD_TEST_EMAIL);
      await page.fill('input[type="password"]', process.env.BOOMCARD_TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
      console.log('✅ Login successful\n');
    } catch (error) {
      console.warn('⚠️  Login failed, skipping authenticated pages\n');
    }
  }

  for (const pageConfig of pagesToCapture) {
    const url = `${baseUrl}${pageConfig.path}`;
    const filename = `${pageConfig.name}.${format}`;
    const filepath = path.join(defaultOutputDir, filename);

    try {
      console.log(`📄 Capturing: ${pageConfig.description}`);
      console.log(`   URL: ${url}`);

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for page-specific content
      await page.waitForTimeout(pageConfig.wait);

      // Take screenshot
      const screenshotOptions = {
        path: filepath,
        fullPage: fullPage
      };

      if (format === 'jpg' || format === 'jpeg') {
        screenshotOptions.type = 'jpeg';
        screenshotOptions.quality = quality;
      } else {
        screenshotOptions.type = 'png';
      }

      await page.screenshot(screenshotOptions);

      const stats = fs.statSync(filepath);
      console.log(`   ✅ Saved: ${filename} (${(stats.size / 1024).toFixed(2)} KB)`);

      results.success.push({
        name: pageConfig.name,
        description: pageConfig.description,
        url: url,
        file: filename,
        size: stats.size
      });

    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      results.failed.push({
        name: pageConfig.name,
        description: pageConfig.description,
        url: url,
        error: error.message
      });
    }

    console.log('');
  }

  await browser.close();

  // Save results manifest
  const manifestPath = path.join(defaultOutputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));

  // Print summary
  console.log('═══════════════════════════════════════════════');
  console.log('📊 Screenshot Workflow Complete');
  console.log('═══════════════════════════════════════════════');
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`📁 Output: ${defaultOutputDir}`);
  console.log(`📋 Manifest: ${manifestPath}`);

  if (results.failed.length > 0) {
    console.log('\n❌ Failed pages:');
    results.failed.forEach(f => {
      console.log(`   - ${f.description}: ${f.error}`);
    });
  }

  console.log('');

  return results;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: 'http://localhost:3001',
    quality: 70,
    format: 'png',
    fullPage: false,
    pages: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--base-url':
        options.baseUrl = args[++i];
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--quality':
        options.quality = parseInt(args[++i]);
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--full-page':
        options.fullPage = true;
        break;
      case '--pages':
        options.pages = args[++i].split(',');
        break;
      case '--help':
        console.log(`
BoomCard Screenshot Workflow

Usage:
  node scripts/screenshot-workflow.js [options]

Options:
  --base-url <url>      Base URL (default: http://localhost:3001)
  --output-dir <path>   Output directory (default: screenshots/workflow-{timestamp})
  --quality <0-100>     JPEG quality for compression (default: 70)
  --format <png|jpg>    Screenshot format (default: png)
  --full-page           Take full page screenshots
  --pages <list>        Comma-separated list of pages (default: all)

Available Pages:
  ${BOOMCARD_PAGES.map(p => `${p.name.padEnd(18)} - ${p.description}`).join('\n  ')}

Examples:
  # Capture all pages
  node scripts/screenshot-workflow.js

  # Capture specific pages
  node scripts/screenshot-workflow.js --pages home,login,dashboard

  # Capture with compression
  node scripts/screenshot-workflow.js --format jpg --quality 60

  # Full page screenshots
  node scripts/screenshot-workflow.js --full-page

  # Custom base URL
  node scripts/screenshot-workflow.js --base-url https://boomcard.bg

Environment Variables (for authenticated pages):
  BOOMCARD_TEST_EMAIL     - Email for test account
  BOOMCARD_TEST_PASSWORD  - Password for test account
        `);
        process.exit(0);
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  runScreenshotWorkflow(options)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runScreenshotWorkflow, BOOMCARD_PAGES };
