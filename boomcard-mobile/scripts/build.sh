#!/bin/bash

# BoomCard Mobile - Build Script
# Usage: ./scripts/build.sh [platform] [profile]
# Example: ./scripts/build.sh ios production

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    print_error "EAS CLI is not installed"
    echo "Install with: npm install -g eas-cli"
    exit 1
fi

# Get parameters
PLATFORM=${1:-all}
PROFILE=${2:-production}

# Validate platform
if [[ ! "$PLATFORM" =~ ^(ios|android|all)$ ]]; then
    print_error "Invalid platform: $PLATFORM"
    echo "Valid options: ios, android, all"
    exit 1
fi

# Validate profile
if [[ ! "$PROFILE" =~ ^(development|preview|production)$ ]]; then
    print_error "Invalid profile: $PROFILE"
    echo "Valid options: development, preview, production"
    exit 1
fi

# Print build info
print_info "======================================"
print_info "BoomCard Mobile - Build"
print_info "======================================"
print_info "Platform: $PLATFORM"
print_info "Profile: $PROFILE"
print_info "======================================"

# Check if logged in to EAS
print_info "Checking EAS authentication..."
if ! eas whoami &> /dev/null; then
    print_error "Not logged in to EAS"
    echo "Run: eas login"
    exit 1
fi

print_info "Logged in as: $(eas whoami)"

# Clear cache (optional)
if [ "$3" == "--clear-cache" ]; then
    print_warning "Clearing build cache..."
    eas build:list --limit 1 --status finished &> /dev/null || true
fi

# Run build
print_info "Starting build..."
eas build --profile "$PROFILE" --platform "$PLATFORM" --non-interactive

# Check build status
if [ $? -eq 0 ]; then
    print_info "======================================"
    print_info "Build started successfully!"
    print_info "======================================"
    print_info "Monitor progress at:"
    print_info "https://expo.dev/accounts/$(eas whoami)/projects/boomcard-mobile/builds"
    echo ""
    print_info "Check build status with:"
    echo "  eas build:list"
    echo ""

    if [ "$PROFILE" == "production" ]; then
        print_warning "After build completes, submit with:"
        echo "  ./scripts/submit.sh $PLATFORM"
    fi
else
    print_error "Build failed!"
    exit 1
fi
