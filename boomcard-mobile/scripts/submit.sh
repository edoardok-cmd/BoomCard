#!/bin/bash

# BoomCard Mobile - Submit Script
# Usage: ./scripts/submit.sh [platform]
# Example: ./scripts/submit.sh ios

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    print_error "EAS CLI is not installed"
    echo "Install with: npm install -g eas-cli"
    exit 1
fi

# Get platform parameter
PLATFORM=${1:-}

if [ -z "$PLATFORM" ]; then
    print_error "Platform not specified"
    echo "Usage: ./scripts/submit.sh [platform]"
    echo "Valid options: ios, android, all"
    exit 1
fi

# Validate platform
if [[ ! "$PLATFORM" =~ ^(ios|android|all)$ ]]; then
    print_error "Invalid platform: $PLATFORM"
    echo "Valid options: ios, android, all"
    exit 1
fi

# Print submission info
print_info "======================================"
print_info "BoomCard Mobile - App Store Submission"
print_info "======================================"
print_info "Platform: $PLATFORM"
print_info "======================================"

# Check if logged in to EAS
print_info "Checking EAS authentication..."
if ! eas whoami &> /dev/null; then
    print_error "Not logged in to EAS"
    echo "Run: eas login"
    exit 1
fi

print_info "Logged in as: $(eas whoami)"

# iOS Submission
if [ "$PLATFORM" == "ios" ] || [ "$PLATFORM" == "all" ]; then
    print_step "Submitting to Apple App Store..."
    echo ""
    print_warning "You will need:"
    echo "  - Apple ID"
    echo "  - App-specific password (if 2FA enabled)"
    echo "  - App Store Connect app ID"
    echo ""
    read -p "Press Enter to continue..."

    eas submit --profile production --platform ios

    if [ $? -eq 0 ]; then
        print_info "iOS submission successful!"
        print_info "Check status at: https://appstoreconnect.apple.com"
    else
        print_error "iOS submission failed!"
        exit 1
    fi
fi

# Android Submission
if [ "$PLATFORM" == "android" ] || [ "$PLATFORM" == "all" ]; then
    print_step "Submitting to Google Play Store..."
    echo ""
    print_warning "You will need:"
    echo "  - Service account key JSON file"
    echo "  - Play Console access"
    echo ""
    read -p "Press Enter to continue..."

    eas submit --profile production --platform android

    if [ $? -eq 0 ]; then
        print_info "Android submission successful!"
        print_info "Check status at: https://play.google.com/console"
    else
        print_error "Android submission failed!"
        exit 1
    fi
fi

# Final message
print_info "======================================"
print_info "Submission Complete!"
print_info "======================================"
echo ""
print_info "Next steps:"
echo "  1. Check submission status in store consoles"
echo "  2. Monitor for review feedback"
echo "  3. Respond to any rejection reasons"
echo "  4. Wait for approval (1-7 days)"
echo ""
print_warning "Review Times:"
echo "  - iOS: Typically 1-3 days"
echo "  - Android: Typically 1-7 days"
echo ""
