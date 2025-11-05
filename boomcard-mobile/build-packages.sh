#!/bin/bash

# BoomCard Mobile - Build Packages Script
# This script builds APK and IPA packages for testing on real devices

set -e  # Exit on error

echo "=========================================="
echo "BoomCard Mobile - Build Packages"
echo "=========================================="
echo ""

# Navigate to mobile app directory
cd "$(dirname "$0")"

# Check if logged into EAS
echo "Step 1: Checking EAS login status..."
if ! eas whoami &> /dev/null; then
    echo "❌ Not logged into EAS"
    echo ""
    echo "Please login to Expo Application Services:"
    echo "  1. Run: eas login"
    echo "  2. Enter your Expo credentials"
    echo "  3. Run this script again"
    echo ""
    exit 1
fi

EAS_USER=$(eas whoami)
echo "✅ Logged in as: $EAS_USER"
echo ""

# Ask which platform to build
echo "Step 2: Select platform to build"
echo "  1) Android APK only"
echo "  2) iOS IPA only"
echo "  3) Both Android and iOS"
echo ""
read -p "Enter choice (1-3): " PLATFORM_CHOICE

echo ""
echo "Step 3: Starting build(s)..."
echo ""

case $PLATFORM_CHOICE in
    1)
        echo "Building Android APK..."
        eas build --profile preview --platform android --non-interactive
        ;;
    2)
        echo "Building iOS IPA..."
        eas build --profile preview --platform ios --non-interactive
        ;;
    3)
        echo "Building both Android APK and iOS IPA..."
        eas build --profile preview --platform all --non-interactive
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "✅ Build(s) started successfully!"
echo "=========================================="
echo ""
echo "Monitor build progress:"
echo "  1. Run: eas build:list"
echo "  2. Visit: https://expo.dev"
echo ""
echo "Expected build times:"
echo "  - Android APK: 10-15 minutes"
echo "  - iOS IPA: 15-20 minutes"
echo ""
echo "You'll receive an email when builds complete."
echo ""
