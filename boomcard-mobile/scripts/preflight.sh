#!/bin/bash

# BoomCard Mobile - Pre-flight Checklist
# Run before building for production
# Usage: ./scripts/preflight.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to print colored output
print_check() {
    echo -n "  [CHECKING] $1... "
}

print_pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
}

print_fail() {
    echo -e "${RED}✗ FAIL${NC}"
    echo -e "    ${RED}$1${NC}"
    ((FAILED++))
}

print_warn() {
    echo -e "${YELLOW}⚠ WARNING${NC}"
    echo -e "    ${YELLOW}$1${NC}"
    ((WARNINGS++))
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_header "BoomCard Mobile - Pre-flight Checklist"

# ============================================================================
# Environment Checks
# ============================================================================
print_header "Environment"

# Check Node.js version
print_check "Node.js version (>= 18)"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 18 ]; then
    print_pass
else
    print_fail "Node.js version $NODE_VERSION is too old. Requires >= 18"
fi

# Check npm
print_check "npm installed"
if command -v npm &> /dev/null; then
    print_pass
else
    print_fail "npm is not installed"
fi

# Check EAS CLI
print_check "EAS CLI installed"
if command -v eas &> /dev/null; then
    print_pass
else
    print_fail "EAS CLI is not installed. Run: npm install -g eas-cli"
fi

# Check EAS authentication
print_check "EAS authentication"
if eas whoami &> /dev/null; then
    print_pass
else
    print_fail "Not logged in to EAS. Run: eas login"
fi

# ============================================================================
# Project Configuration Checks
# ============================================================================
print_header "Project Configuration"

# Check dependencies installed
print_check "Dependencies installed"
if [ -d "node_modules" ]; then
    print_pass
else
    print_fail "Dependencies not installed. Run: npm install"
fi

# Check app.json exists
print_check "app.json exists"
if [ -f "app.json" ]; then
    print_pass
else
    print_fail "app.json not found"
fi

# Check eas.json exists
print_check "eas.json exists"
if [ -f "eas.json" ]; then
    print_pass
else
    print_fail "eas.json not found. Run: eas init"
fi

# Check package.json version
print_check "package.json version matches app.json"
PKG_VERSION=$(node -p "require('./package.json').version")
APP_VERSION=$(node -p "require('./app.json').expo.version")
if [ "$PKG_VERSION" == "$APP_VERSION" ]; then
    print_pass
else
    print_fail "Version mismatch: package.json ($PKG_VERSION) vs app.json ($APP_VERSION)"
fi

# Check bundle identifiers
print_check "Bundle identifiers configured"
IOS_BUNDLE=$(node -p "require('./app.json').expo.ios.bundleIdentifier" 2>/dev/null)
ANDROID_PACKAGE=$(node -p "require('./app.json').expo.android.package" 2>/dev/null)
if [ "$IOS_BUNDLE" == "bg.boomcard.mobile" ] && [ "$ANDROID_PACKAGE" == "bg.boomcard.mobile" ]; then
    print_pass
else
    print_fail "Bundle identifiers not correctly configured"
fi

# ============================================================================
# Code Quality Checks
# ============================================================================
print_header "Code Quality"

# Check TypeScript compilation
print_check "TypeScript compilation"
if npx tsc --noEmit &> /dev/null; then
    print_pass
else
    print_fail "TypeScript compilation errors found"
fi

# Check for console.log (warning only)
print_check "No console.log statements"
LOG_COUNT=$(grep -r "console.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -eq 0 ]; then
    print_pass
else
    print_warn "Found $LOG_COUNT console.log statements. Consider removing for production"
fi

# Check for TODO comments (warning only)
print_check "No TODO comments"
TODO_COUNT=$(grep -r "TODO" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -eq 0 ]; then
    print_pass
else
    print_warn "Found $TODO_COUNT TODO comments"
fi

# ============================================================================
# Assets Checks
# ============================================================================
print_header "Assets"

# Check app icon
print_check "App icon (icon.png)"
if [ -f "assets/icon.png" ]; then
    print_pass
else
    print_fail "App icon not found at assets/icon.png"
fi

# Check splash screen
print_check "Splash screen (splash-icon.png)"
if [ -f "assets/splash-icon.png" ]; then
    print_pass
else
    print_fail "Splash screen not found at assets/splash-icon.png"
fi

# Check adaptive icon (Android)
print_check "Adaptive icon (adaptive-icon.png)"
if [ -f "assets/adaptive-icon.png" ]; then
    print_pass
else
    print_fail "Adaptive icon not found at assets/adaptive-icon.png"
fi

# ============================================================================
# Deep Linking Checks
# ============================================================================
print_header "Deep Linking"

# Check URL scheme
print_check "URL scheme configured"
SCHEME=$(node -p "require('./app.json').expo.scheme" 2>/dev/null)
if [ "$SCHEME" == "boomcard" ]; then
    print_pass
else
    print_fail "URL scheme not configured or incorrect"
fi

# Check iOS associated domains
print_check "iOS associated domains"
DOMAINS=$(node -p "require('./app.json').expo.ios.associatedDomains" 2>/dev/null)
if [[ "$DOMAINS" == *"app.boomcard.bg"* ]]; then
    print_pass
else
    print_warn "iOS associated domains not configured. Universal Links may not work"
fi

# Check Android intent filters
print_check "Android intent filters"
INTENT_FILTERS=$(node -p "JSON.stringify(require('./app.json').expo.android.intentFilters)" 2>/dev/null)
if [[ "$INTENT_FILTERS" == *"payment-result"* ]]; then
    print_pass
else
    print_warn "Android intent filters not configured. App Links may not work"
fi

# ============================================================================
# Environment Configuration Checks
# ============================================================================
print_header "Environment Configuration"

# Check .env.example exists
print_check ".env.example exists"
if [ -f ".env.example" ]; then
    print_pass
else
    print_warn ".env.example not found. Create as template"
fi

# Check production API URL
print_check "Production API URL configured"
PROD_API_URL=$(node -p "require('./eas.json').build.production.env.API_URL" 2>/dev/null)
if [ "$PROD_API_URL" == "https://api.boomcard.bg" ]; then
    print_pass
else
    print_fail "Production API URL not configured in eas.json"
fi

# ============================================================================
# Security Checks
# ============================================================================
print_header "Security"

# Check for hardcoded secrets
print_check "No hardcoded API keys"
if grep -r "api[_-]key\s*=\s*['\"]" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "example" | grep -v "placeholder" &> /dev/null; then
    print_fail "Found hardcoded API keys in source code"
else
    print_pass
fi

# Check .gitignore
print_check ".gitignore includes sensitive files"
if grep -q ".env" .gitignore && grep -q "google-play-service-account.json" .gitignore; then
    print_pass
else
    print_warn ".gitignore may not include all sensitive files"
fi

# ============================================================================
# Summary
# ============================================================================
print_header "Summary"

TOTAL=$((PASSED + FAILED + WARNINGS))
echo ""
echo -e "  ${GREEN}Passed:${NC}   $PASSED / $TOTAL"
echo -e "  ${RED}Failed:${NC}   $FAILED / $TOTAL"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS / $TOTAL"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Pre-flight check PASSED${NC}"
    echo ""
    echo "Ready to build for production!"
    echo ""
    echo "Build commands:"
    echo "  npm run build:ios:prod      # Build for iOS"
    echo "  npm run build:android:prod  # Build for Android"
    echo "  npm run build:all:prod      # Build for both"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Pre-flight check FAILED${NC}"
    echo ""
    echo "Please fix the failed checks before building for production."
    echo ""
    exit 1
fi
