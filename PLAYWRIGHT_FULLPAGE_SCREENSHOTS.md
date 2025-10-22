# Playwright Full-Page Screenshot Enhancement - BoomCard

## ✅ Summary

The BoomCard project now has **enhanced Playwright screenshot capabilities** to ensure full-page capture, not just viewport-only screenshots.

## 🎯 What Was Done

### 1. Updated Playwright Configuration
**File**: `partner-dashboard/playwright.config.ts`

Added `fullPage: true` to the global configuration:

```typescript
use: {
  screenshot: {
    mode: 'only-on-failure',
    fullPage: true,  // Capture entire scrollable page
  },
}
```

This ensures all failure screenshots automatically capture the complete page.

### 2. Created Screenshot Helper Utility
**File**: `partner-dashboard/tests/utils/screenshot-helper.ts`

A TypeScript utility that:
- ✅ Detects internal scrollable containers (`overflow: auto/scroll`)
- ✅ Scrolls containers to load lazy content
- ✅ Temporarily expands containers to full height
- ✅ Waits for images and charts to render
- ✅ Captures complete page content
- ✅ Includes debug mode for troubleshooting

### 3. Created Example Test
**File**: `partner-dashboard/tests/e2e/fullpage-screenshot-example.spec.ts`

Shows how to use the helper utility in tests.

## 📖 Usage Guide

### Basic Usage (Recommended)

```typescript
import { captureFullPageScreenshot } from '../utils/screenshot-helper';

test('my test', async ({ page }) => {
  await page.goto('/');

  // Capture full-page screenshot with helper
  await captureFullPageScreenshot(
    page,
    'test-results/my-screenshot.png',
    { debug: true }
  );
});
```

### With Debug Output

```typescript
await captureFullPageScreenshot(page, 'screenshot.png', {
  debug: true,           // See what's happening
  scrollWait: 1000,      // Wait after scrolling (default: 1000ms)
  stabilizationWait: 500 // Wait before capture (default: 500ms)
});
```

**Debug output example:**
```
📸 Capturing full-page screenshot: screenshot.png
   📐 Page height: 2400px
   📐 Viewport height: 900px
   📐 Scrollable content: YES
   🖼️  Waiting for 5 images to load...
   ✅ Images loaded
   📊 Waiting for 3 charts to render...
   ✅ Charts rendered
   📜 Found 2 scrollable containers
      1. MAIN: 2400px (visible: 900px)
      2. DIV: 1800px (visible: 1200px)
   ⬇️  Scrolling to bottom...
   📏 Expanding scrollable containers...
   ✅ Expanded 2 containers to full height
   ⬆️  Scrolling to top...
   📷 Taking screenshot...
   ✅ Screenshot saved: screenshot.png
```

### Built-in Playwright fullPage

For pages without internal scroll containers, you can use:

```typescript
await page.screenshot({
  path: 'screenshot.png',
  fullPage: true  // Works if page uses document-level scrolling
});
```

**When to use the helper instead:**
- Page has `overflow: hidden` on body/html
- Content scrolls in a container with `overflow: auto/scroll`
- Screenshot file size seems too small
- Bottom content is missing from screenshots

## 🔍 Verification

### Check if Screenshot Captured Full Page

```bash
# Check dimensions (should be tall, not just viewport height)
file test-results/my-screenshot.png

# Expected full-page: width x 2000+ (not width x 900)
```

### Compare File Sizes

| Type | File Size | Height |
|------|-----------|--------|
| Viewport only | ~50-100 KB | ~900px |
| Full page | ~200-500 KB | 1500-5000px+ |

## 📊 Existing Tests

Your project has **37 test files** with many screenshot calls. Analysis shows:

- ✅ Some already use `fullPage: true` (good!)
- ⚠️ Many don't specify `fullPage` (defaults to `false`)
- ⚠️ Some explicitly use `fullPage: false`

### Examples from Your Tests

**Good** (already using fullPage):
```typescript
// responsive.spec.ts line 39
await page.screenshot({ path: 'test-results/mobile-homepage.png', fullPage: true });

// verify-app.spec.ts line 12
await page.screenshot({ path: 'test-results/homepage-verification.png', fullPage: true });
```

**Needs Update** (viewport only):
```typescript
// dark-mode-visual-check.spec.ts line 35
await page.screenshot({ path: 'test-results/analytics-dark-mode.png', fullPage: false });

// mobile-layout.spec.ts line 16
await page.screenshot({ path: 'tests/screenshots/mobile-hero.png', fullPage: false });
```

## 🔧 Migration Guide

### Option 1: Use Helper (Recommended)

Replace existing screenshot calls:

```typescript
// Before
await page.screenshot({ path: 'screenshot.png' });

// After
import { captureFullPageScreenshot } from '../utils/screenshot-helper';
await captureFullPageScreenshot(page, 'screenshot.png');
```

### Option 2: Add fullPage Parameter

Simpler option if you don't need the helper's advanced features:

```typescript
// Before
await page.screenshot({ path: 'screenshot.png' });

// After
await page.screenshot({ path: 'screenshot.png', fullPage: true });
```

### When to Keep fullPage: false

Only if you specifically want viewport-only screenshots:
- Testing above-the-fold content specifically
- Performance testing (smaller files)
- Testing specific viewport behaviors

## 🧪 Testing

Run the example test:

```bash
cd partner-dashboard
npx playwright test fullpage-screenshot-example.spec.ts
```

Check the generated screenshots in `test-results/`:
- `homepage-fullpage-example.png` - Should show entire page
- `comparison-helper.png` - Helper utility version
- `comparison-builtin.png` - Built-in version
- `mobile-fullpage-example.png` - Mobile full-page

## 📝 Best Practices

### 1. Always Wait for Content

```typescript
await page.goto('/');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000); // For animations/charts
```

### 2. Use Helper for Complex Pages

Pages with:
- Internal scrollable containers
- Fixed height containers with `overflow: auto`
- Lazy-loaded content
- Dynamic charts that render after load

### 3. Enable Debug Mode During Development

```typescript
await captureFullPageScreenshot(page, 'debug.png', { debug: true });
```

This helps you understand:
- What containers are being expanded
- How tall the actual content is
- If images/charts are loading properly

### 4. Verify Screenshots Manually

After updating tests, manually check a few screenshots to ensure:
- Bottom content is visible (footer, etc.)
- File size increased (indicating more content)
- No layout issues from container expansion

## 🚨 Troubleshooting

### Screenshot Still Only Shows Viewport

**Check 1**: Is `fullPage: true` set?
```typescript
await page.screenshot({ path: 'test.png', fullPage: true });
```

**Check 2**: Does page have internal scroll containers?
```typescript
// Use helper instead
await captureFullPageScreenshot(page, 'test.png', { debug: true });
```

**Check 3**: Verify dimensions
```bash
file test-results/test.png
# Should show height > 1500px for most pages
```

### File Size Too Small

If screenshot is ~50-80 KB:
- ❌ Probably viewport-only
- ✅ Use helper utility with debug mode
- ✅ Check output for "Found X scrollable containers"

### Content Missing from Bottom

- ✅ Use `captureFullPageScreenshot` helper
- ✅ Increase `scrollWait` option (default: 1000ms)
- ✅ Add `await page.waitForTimeout(3000)` before screenshot

## 📚 Additional Resources

### Related Documentation
- `PLAYWRIGHT_ENHANCEMENTS_SUMMARY.md` - Detailed technical summary
- `tests/e2e/fullpage-screenshot-example.spec.ts` - Example usage
- `tests/utils/screenshot-helper.ts` - Helper source code

### Comparison with Other Projects

This implementation matches enhancements applied to:
- ✅ `my-dashboard` project (traditional Playwright with config file)
- ✅ `ai-automation-platform` project (Playwright MCP via Claude)

All three projects now have consistent full-page screenshot capabilities!

## ✨ Quick Reference

| Scenario | Method | Code |
|----------|--------|------|
| **Simple page** | Built-in | `page.screenshot({ fullPage: true })` |
| **Complex page** | Helper | `captureFullPageScreenshot(page, 'file.png')` |
| **Debug/Development** | Helper + debug | `captureFullPageScreenshot(page, 'file.png', { debug: true })` |
| **Mobile/Small viewport** | Helper + wait | `captureFullPageScreenshot(page, 'file.png', { scrollWait: 1500 })` |

---

**Status**: ✅ Enhancement Complete
**Date**: 2025-10-22
**Verified**: Configuration updated, helper created, example test added
