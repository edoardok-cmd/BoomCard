#!/bin/bash

# BoomCard Screenshot Viewer
# Quick script to view the latest screenshots

SCREENSHOTS_DIR="$(dirname "$0")/../screenshots"

# Check if screenshots directory exists
if [ ! -d "$SCREENSHOTS_DIR" ]; then
  echo "❌ No screenshots directory found"
  echo "   Run a screenshot command first:"
  echo "   npm run screenshot http://localhost:3001"
  exit 1
fi

# Count screenshots
SCREENSHOT_COUNT=$(find "$SCREENSHOTS_DIR" -type f \( -name "*.png" -o -name "*.jpg" \) | wc -l)

if [ "$SCREENSHOT_COUNT" -eq 0 ]; then
  echo "❌ No screenshots found"
  echo "   Run a screenshot command first:"
  echo "   npm run screenshot http://localhost:3001"
  exit 1
fi

echo "📸 Found $SCREENSHOT_COUNT screenshot(s)"
echo ""

# List recent screenshots
echo "Recent screenshots:"
find "$SCREENSHOTS_DIR" -type f \( -name "*.png" -o -name "*.jpg" \) -exec ls -lh {} \; | tail -10

echo ""
echo "📁 Screenshots directory: $SCREENSHOTS_DIR"
echo ""

# Open screenshots directory in Finder (macOS)
if command -v open &> /dev/null; then
  echo "Opening screenshots directory..."
  open "$SCREENSHOTS_DIR"
fi
