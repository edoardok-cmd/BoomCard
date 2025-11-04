#!/bin/bash

###############################################################################
# BoomCard Frontend - Deployment Verification Script
#
# This script verifies that a frontend deployment was successful by:
# 1. Checking homepage accessibility
# 2. Verifying all static assets load
# 3. Testing critical pages
# 4. Validating SEO meta tags
# 5. Checking performance metrics
#
# Usage:
#   ./scripts/verify-frontend.sh [environment]
#
# Environment: production, staging, or development (default: production)
###############################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment
ENV=${1:-production}

# Frontend URLs
if [ "$ENV" = "production" ]; then
    FRONTEND_URL="https://dashboard.boomcard.bg"
elif [ "$ENV" = "staging" ]; then
    FRONTEND_URL="https://dashboard-staging.boomcard.bg"
else
    FRONTEND_URL="http://localhost:5175"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BoomCard Frontend Deployment Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}$ENV${NC}"
echo -e "Frontend URL: ${YELLOW}$FRONTEND_URL${NC}"
echo ""

# Track failures
FAILURES=0

###############################################################################
# Function: Check page
###############################################################################
check_page() {
    local name=$1
    local path=$2
    local expected_status=${3:-200}
    local expected_content=$4

    echo -n "Checking $name... "

    # Make request and capture status code
    response=$(curl -s -w "\n%{http_code}" -L "$FRONTEND_URL$path")
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # Check status code
    if [ "$status_code" != "$expected_status" ]; then
        echo -e "${RED}FAILED${NC} (HTTP $status_code, expected $expected_status)"
        FAILURES=$((FAILURES + 1))
        return 1
    fi

    # Check content if provided
    if [ -n "$expected_content" ]; then
        if echo "$body" | grep -q "$expected_content"; then
            echo -e "${GREEN}OK${NC}"
        else
            echo -e "${RED}FAILED${NC} (content '$expected_content' not found)"
            FAILURES=$((FAILURES + 1))
            return 1
        fi
    else
        echo -e "${GREEN}OK${NC}"
    fi

    return 0
}

###############################################################################
# 1. Core Pages
###############################################################################
echo -e "${BLUE}=== Core Pages ===${NC}"
check_page "Homepage" "/" 200 "BoomCard"
check_page "Login Page" "/login" 200
check_page "Register Page" "/register" 200
check_page "Dashboard" "/dashboard" 200
check_page "Venues Page" "/venues" 200
check_page "Receipts Page" "/receipts" 200
check_page "Analytics Page" "/analytics" 200
echo ""

###############################################################################
# 2. Static Assets
###############################################################################
echo -e "${BLUE}=== Static Assets ===${NC}"

echo -n "Favicon... "
favicon_status=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/favicon.ico")
if [ "$favicon_status" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (HTTP $favicon_status)"
fi

echo -n "Manifest... "
manifest_status=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/manifest.json")
if [ "$manifest_status" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (HTTP $manifest_status)"
fi

echo -n "Service Worker... "
sw_status=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/sw.js")
if [ "$sw_status" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (HTTP $sw_status)"
fi

echo ""

###############################################################################
# 3. SEO & Meta Tags
###############################################################################
echo -e "${BLUE}=== SEO & Meta Tags ===${NC}"

homepage=$(curl -s -L "$FRONTEND_URL/")

echo -n "Title Tag... "
if echo "$homepage" | grep -q "<title>"; then
    title=$(echo "$homepage" | grep -o "<title>[^<]*" | sed 's/<title>//')
    echo -e "${GREEN}OK${NC} ($title)"
else
    echo -e "${RED}FAILED${NC} (no title tag found)"
    FAILURES=$((FAILURES + 1))
fi

echo -n "Meta Description... "
if echo "$homepage" | grep -q 'meta name="description"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (no meta description)"
fi

echo -n "Open Graph Tags... "
if echo "$homepage" | grep -q 'meta property="og:'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (no Open Graph tags)"
fi

echo -n "Viewport Meta Tag... "
if echo "$homepage" | grep -q 'meta name="viewport"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC} (viewport meta tag missing)"
    FAILURES=$((FAILURES + 1))
fi

echo ""

###############################################################################
# 4. Performance
###############################################################################
echo -e "${BLUE}=== Performance ===${NC}"

echo -n "Homepage Load Time... "
start_time=$(date +%s%N)
curl -s -L "$FRONTEND_URL/" > /dev/null
end_time=$(date +%s%N)
load_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

if [ "$load_time" -lt 1000 ]; then
    echo -e "${GREEN}OK${NC} (${load_time}ms)"
elif [ "$load_time" -lt 2000 ]; then
    echo -e "${YELLOW}WARNING${NC} (${load_time}ms - slower than ideal)"
else
    echo -e "${RED}SLOW${NC} (${load_time}ms)"
fi

echo -n "Response Headers... "
headers=$(curl -s -I -L "$FRONTEND_URL/")
if echo "$headers" | grep -q "HTTP.*200"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    FAILURES=$((FAILURES + 1))
fi

echo ""

###############################################################################
# 5. Security Headers
###############################################################################
echo -e "${BLUE}=== Security Headers ===${NC}"

headers=$(curl -s -I -L "$FRONTEND_URL/")

echo -n "HTTPS Redirect... "
if [ "$ENV" = "production" ] || [ "$ENV" = "staging" ]; then
    http_redirect=$(curl -s -o /dev/null -w "%{http_code}" -I "http://dashboard.boomcard.bg")
    if [ "$http_redirect" = "301" ] || [ "$http_redirect" = "308" ]; then
        echo -e "${GREEN}OK${NC} (HTTP redirects to HTTPS)"
    else
        echo -e "${YELLOW}WARNING${NC} (HTTP doesn't redirect properly)"
    fi
else
    echo -e "${YELLOW}SKIPPED${NC} (development environment)"
fi

echo -n "Content-Security-Policy... "
if echo "$headers" | grep -q "Content-Security-Policy"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}INFO${NC} (CSP not configured)"
fi

echo -n "X-Frame-Options... "
if echo "$headers" | grep -q "X-Frame-Options"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}INFO${NC} (X-Frame-Options not set)"
fi

echo ""

###############################################################################
# 6. API Connectivity
###############################################################################
echo -e "${BLUE}=== API Connectivity ===${NC}"

# Extract API URL from the page or use default
if [ "$ENV" = "production" ]; then
    API_URL="https://api.boomcard.bg"
elif [ "$ENV" = "staging" ]; then
    API_URL="https://api-staging.boomcard.bg"
else
    API_URL="http://localhost:3001"
fi

echo -n "API Health Check... "
api_status=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health")
if [ "$api_status" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC} (API unreachable - HTTP $api_status)"
    FAILURES=$((FAILURES + 1))
fi

echo ""

###############################################################################
# 7. PWA Features
###############################################################################
echo -e "${BLUE}=== PWA Features ===${NC}"

manifest=$(curl -s "$FRONTEND_URL/manifest.json" 2>/dev/null)

echo -n "Manifest Name... "
if echo "$manifest" | grep -q '"name"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (manifest name not found)"
fi

echo -n "Manifest Icons... "
if echo "$manifest" | grep -q '"icons"'; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING${NC} (manifest icons not found)"
fi

echo -n "Service Worker Registration... "
if echo "$homepage" | grep -q "navigator.serviceWorker"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}INFO${NC} (service worker registration not detected in HTML)"
fi

echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verification Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo -e "${GREEN}✓ Frontend deployment verified successfully${NC}"
    echo ""
    echo -e "The $ENV frontend is ${GREEN}READY${NC} for use."
    exit 0
else
    echo -e "${RED}✗ $FAILURES critical check(s) failed${NC}"
    echo -e "${RED}✗ Frontend deployment verification failed${NC}"
    echo ""
    echo -e "The $ENV frontend has ${RED}ISSUES${NC} that need attention."
    echo "Please review the failures above and investigate."
    exit 1
fi
