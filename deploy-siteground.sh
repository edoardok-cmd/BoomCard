#!/bin/bash
# BoomCard SiteGround Deployment Script
# Usage: ./deploy-siteground.sh
#
# Prerequisites:
#   - SSH key configured at ~/.ssh/id_siteground_boomcard
#   - SSH config entry "siteground-boomcard" in ~/.ssh/config
#
# What this does:
#   1. Builds the partner-dashboard
#   2. Syncs the dist/ folder to SiteGround public_html via rsync

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/partner-dashboard"
DIST_DIR="$DASHBOARD_DIR/dist"
REMOTE_HOST="siteground-boomcard"
REMOTE_PATH="~/www/boomcard.eu/public_html/"

echo "=== BoomCard SiteGround Deploy ==="

# Step 1: Build
echo ""
echo "[1/2] Building partner-dashboard..."
cd "$DASHBOARD_DIR"
npm run build

if [ ! -d "$DIST_DIR" ]; then
    echo "ERROR: Build failed - dist/ directory not found"
    exit 1
fi

# Step 2: Deploy via rsync
echo ""
echo "[2/2] Deploying to SiteGround..."
rsync -avz --delete \
    --exclude='.DS_Store' \
    --exclude='boomcard-deploy.zip' \
    "$DIST_DIR/" "$REMOTE_HOST:$REMOTE_PATH"

echo ""
echo "=== Deploy complete! ==="
echo "Site: https://boomcard.eu"
