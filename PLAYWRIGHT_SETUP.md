# BoomCard Playwright Setup & Screenshot Guide

## Overview

BoomCard now includes Playwright integration for automated visual testing and screenshot capture. This allows you to:
- Take screenshots of any page for documentation
- Capture the entire application state for visual regression testing
- Generate screenshots for QA and design review
- Test UI changes across different viewports

## Installation

### 1. Install Dependencies

```bash
cd /Users/administrator/Documents/BoomCard
npm install
```

This will install Playwright and all necessary dependencies.

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

This downloads the Chromium browser that Playwright uses for screenshots.

## Quick Start

### Take a Single Screenshot

```bash
# Screenshot of homepage
npm run screenshot http://localhost:3001

# Screenshot of a specific page
npm run screenshot http://localhost:3001/dashboard
```

### Take Compressed Screenshot (Recommended for Long Pages)

```bash
# Compressed screenshot with default quality (70%)
npm run screenshot:compressed http://localhost:3001

# Heavy compression for very long pages
npm run screenshot:compressed http://localhost:3001/dashboard -- --quality 50
```

### Run Full Workflow (Capture All Pages)

```bash
# Capture all major BoomCard pages
npm run screenshot:workflow

# Capture specific pages only
npm run screenshot:workflow -- --pages home,login,dashboard
```

## Available Scripts

### `npm run screenshot`

Takes high-quality PNG screenshots of individual pages.

**Options:**
- `--output <path>` - Where to save the screenshot
- `--width <pixels>` - Viewport width (default: 1440)
- `--height <pixels>` - Viewport height (default: 900)
- `--full-page` - Capture entire page (not just viewport)
- `--element <selector>` - Capture specific element only
- `--wait <ms>` - Wait time after load (default: 2000)

**Examples:**
```bash
# Viewport screenshot
npm run screenshot http://localhost:3001

# Full page screenshot
npm run screenshot http://localhost:3001 -- --full-page

# Mobile viewport
npm run screenshot http://localhost:3001 -- --width 375 --height 812

# Specific element
npm run screenshot http://localhost:3001 -- --element "main"

# Custom output location
npm run screenshot http://localhost:3001 -- --output ./my-screenshot.png
```

### `npm run screenshot:compressed`

Takes compressed JPEG screenshots - ideal for long pages or when file size matters.

**Options:**
- `--quality <0-100>` - JPEG quality (default: 70)
- All options from `screenshot` command

**Examples:**
```bash
# Standard compression
npm run screenshot:compressed http://localhost:3001

# Heavy compression (smaller file)
npm run screenshot:compressed http://localhost:3001 -- --quality 50

# Light compression (better quality)
npm run screenshot:compressed http://localhost:3001 -- --quality 85

# Full page with compression
npm run screenshot:compressed http://localhost:3001 -- --full-page --quality 60
```

### `npm run screenshot:workflow`

Captures screenshots of all major BoomCard pages automatically.

**Options:**
- `--base-url <url>` - Base URL (default: http://localhost:3001)
- `--output-dir <path>` - Output directory
- `--quality <0-100>` - JPEG quality (default: 70)
- `--format <png|jpg>` - Screenshot format (default: png)
- `--full-page` - Take full page screenshots
- `--pages <list>` - Comma-separated list of specific pages

**Examples:**
```bash
# Capture all pages
npm run screenshot:workflow

# Capture specific pages
npm run screenshot:workflow -- --pages home,login,dashboard

# Compressed workflow
npm run screenshot:workflow -- --format jpg --quality 60

# Full page workflow
npm run screenshot:workflow -- --full-page

# Production URL
npm run screenshot:workflow -- --base-url https://boomcard.bg
```

**Pages Captured:**
- `home` - Homepage
- `login` - Login Page
- `register` - Registration Page
- `dashboard` - Partner Dashboard (requires auth)
- `offers` - Browse Offers
- `offers-create` - Create Offer (requires auth)
- `analytics` - Analytics Dashboard (requires auth)
- `qr-codes` - QR Code Manager (requires auth)
- `settings` - Settings Page (requires auth)
- `pricing` - Pricing Page

## Authentication for Protected Pages

To capture screenshots of authenticated pages (dashboard, analytics, etc.), set these environment variables:

```bash
export BOOMCARD_TEST_EMAIL="test@example.com"
export BOOMCARD_TEST_PASSWORD="your-password"
```

Or create a `.env.local` file:

```env
BOOMCARD_TEST_EMAIL=test@example.com
BOOMCARD_TEST_PASSWORD=your-password
```

The workflow script will automatically log in before capturing authenticated pages.

## Output Location

All screenshots are saved to the `screenshots/` directory:

```
BoomCard/
├── screenshots/
│   ├── screenshot-{timestamp}.png          # Individual screenshots
│   ├── compressed-{timestamp}.jpg          # Compressed screenshots
│   └── workflow-{date}/                    # Workflow outputs
│       ├── home.png
│       ├── login.png
│       ├── dashboard.png
│       ├── ...
│       └── manifest.json                   # Metadata about captures
```

## Use Cases

### 1. Visual Documentation

Capture screenshots for documentation or presentations:

```bash
# High-quality screenshots for docs
npm run screenshot:workflow -- --format png

# Then use the screenshots from screenshots/workflow-{date}/
```

### 2. QA Testing

Before deploying, capture the current state:

```bash
# Capture production site
npm run screenshot:workflow -- --base-url https://boomcard.bg --output-dir screenshots/production

# Compare with staging
npm run screenshot:workflow -- --base-url https://staging.boomcard.bg --output-dir screenshots/staging
```

### 3. Design Review

Share screenshots with designers:

```bash
# Capture specific pages
npm run screenshot:workflow -- --pages home,dashboard,offers

# Share the screenshots/ folder
```

### 4. Bug Reports

Capture the exact state when reporting bugs:

```bash
# Screenshot the problematic page
npm run screenshot http://localhost:3001/problematic-page -- --full-page

# Include the screenshot with your bug report
```

### 5. Mobile Testing

Test responsive designs:

```bash
# iPhone viewport
npm run screenshot http://localhost:3001 -- --width 375 --height 812

# iPad viewport
npm run screenshot http://localhost:3001 -- --width 768 --height 1024

# Desktop
npm run screenshot http://localhost:3001 -- --width 1920 --height 1080
```

## Best Practices

### When to Use Standard Screenshots (`npm run screenshot`)
- Documentation
- High-quality captures
- Pages with little content
- When file size doesn't matter

### When to Use Compressed Screenshots (`npm run screenshot:compressed`)
- Very long pages
- When file size matters
- Bulk captures
- Quick previews

### Quality Settings Guide

| Quality | Use Case | Typical Size |
|---------|----------|--------------|
| 50-60 | Quick previews, very long pages | 200-800 KB |
| 70-80 | Standard screenshots, good balance | 500 KB - 1.5 MB |
| 85-95 | High-quality documentation | 1-3 MB |
| PNG | Best quality, no compression artifacts | 500 KB - 5 MB |

### Viewport Sizes Reference

```bash
# Mobile devices
--width 375 --height 812    # iPhone 13/14
--width 390 --height 844    # iPhone 14 Pro
--width 412 --height 915    # Android (Pixel)

# Tablets
--width 768 --height 1024   # iPad
--width 820 --height 1180   # iPad Air

# Desktop
--width 1280 --height 720   # Small desktop
--width 1440 --height 900   # Standard desktop (default)
--width 1920 --height 1080  # Full HD
--width 2560 --height 1440  # 2K
```

## Troubleshooting

### "Browser not found" Error

```bash
# Install Playwright browsers
npx playwright install chromium
```

### "Connection refused" Error

Make sure the BoomCard app is running:

```bash
# In another terminal
cd partner-dashboard
npm run dev
```

### Screenshots are Blank

Try increasing the wait time:

```bash
npm run screenshot http://localhost:3001 -- --wait 5000
```

### Screenshots are Too Large

Use compression:

```bash
npm run screenshot:compressed http://localhost:3001 -- --quality 50
```

Or capture specific elements:

```bash
npm run screenshot http://localhost:3001 -- --element "main"
```

### Authentication Not Working in Workflow

Make sure environment variables are set:

```bash
echo $BOOMCARD_TEST_EMAIL
echo $BOOMCARD_TEST_PASSWORD
```

## Advanced Usage

### Programmatic Usage

You can import and use the screenshot functions in your own scripts:

```javascript
const { takeScreenshot } = require('./scripts/take-screenshot');
const { takeCompressedScreenshot } = require('./scripts/take-compressed-screenshot');
const { runScreenshotWorkflow } = require('./scripts/screenshot-workflow');

// Take a single screenshot
await takeScreenshot({
  url: 'http://localhost:3001',
  output: './my-screenshot.png',
  width: 1440,
  height: 900
});

// Run workflow
const results = await runScreenshotWorkflow({
  baseUrl: 'http://localhost:3001',
  format: 'jpg',
  quality: 70
});

console.log(`Captured ${results.success.length} pages`);
```

### Custom Workflow

Create your own workflow script:

```javascript
const { takeScreenshot } = require('./scripts/take-screenshot');

const myPages = [
  { name: 'custom-page-1', url: 'http://localhost:3001/custom' },
  { name: 'custom-page-2', url: 'http://localhost:3001/custom2' }
];

for (const page of myPages) {
  await takeScreenshot({
    url: page.url,
    output: `./screenshots/${page.name}.png`
  });
}
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Visual Testing

on: [push, pull_request]

jobs:
  screenshots:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm install

      - name: Install Playwright
        run: npx playwright install chromium

      - name: Start app
        run: npm run dev &

      - name: Wait for app
        run: npx wait-on http://localhost:3001

      - name: Take screenshots
        run: npm run screenshot:workflow

      - name: Upload screenshots
        uses: actions/upload-artifact@v3
        with:
          name: screenshots
          path: screenshots/
```

## Help

For more options and help:

```bash
npm run screenshot:help

# Or
node scripts/take-screenshot.js --help
node scripts/take-compressed-screenshot.js --help
node scripts/screenshot-workflow.js --help
```

## Summary

Playwright is now fully integrated into BoomCard for screenshot capture and visual testing. Use the provided scripts to:

- ✅ Take screenshots of any page
- ✅ Capture compressed screenshots for long pages
- ✅ Run automated workflows to capture all pages
- ✅ Test responsive designs at different viewports
- ✅ Document visual changes
- ✅ Support QA and design review processes

Happy testing! 📸
