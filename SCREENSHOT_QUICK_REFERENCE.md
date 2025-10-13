# BoomCard Screenshot Quick Reference

## Quick Commands

```bash
# Single screenshot
npm run screenshot http://localhost:3001

# Compressed screenshot
npm run screenshot:compressed http://localhost:3001

# All pages workflow
npm run screenshot:workflow

# Help
npm run screenshot:help
```

## Common Use Cases

### 1. Quick Homepage Screenshot
```bash
npm run screenshot http://localhost:3001
```

### 2. Dashboard Screenshot (Full Page)
```bash
npm run screenshot http://localhost:3001/dashboard -- --full-page
```

### 3. Mobile View
```bash
npm run screenshot http://localhost:3001 -- --width 375 --height 812
```

### 4. Compressed for Long Pages
```bash
npm run screenshot:compressed http://localhost:3001/dashboard -- --full-page --quality 60
```

### 5. Capture All Major Pages
```bash
npm run screenshot:workflow
```

### 6. Capture Specific Pages Only
```bash
npm run screenshot:workflow -- --pages home,dashboard,offers
```

## File Locations

- Individual screenshots: `screenshots/screenshot-{timestamp}.png`
- Compressed screenshots: `screenshots/compressed-{timestamp}.jpg`
- Workflow screenshots: `screenshots/workflow-{date}/`

## Viewport Sizes

```bash
# Mobile
--width 375 --height 812    # iPhone

# Tablet
--width 768 --height 1024   # iPad

# Desktop
--width 1440 --height 900   # Default
--width 1920 --height 1080  # Full HD
```

## Quality Settings (for JPEG)

- `--quality 50` - Small file, lower quality
- `--quality 70` - Balanced (default)
- `--quality 85` - High quality
- PNG format - Best quality, larger files

## Authentication Setup

For authenticated pages (dashboard, analytics, etc.):

```bash
export BOOMCARD_TEST_EMAIL="test@example.com"
export BOOMCARD_TEST_PASSWORD="your-password"
```

## Tips

✅ **Use PNG** for documentation and design review
✅ **Use JPEG** with compression for long pages
✅ **Use workflow** to capture multiple pages at once
✅ **Set environment variables** to capture authenticated pages
✅ **Increase --wait** if content loads slowly

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser not found | `npx playwright install chromium` |
| Connection refused | Start app with `npm run dev` |
| Blank screenshots | Use `--wait 5000` |
| File too large | Use `npm run screenshot:compressed` |
| Auth pages fail | Set BOOMCARD_TEST_EMAIL and BOOMCARD_TEST_PASSWORD |

## Full Documentation

See [PLAYWRIGHT_SETUP.md](./PLAYWRIGHT_SETUP.md) for complete documentation.
