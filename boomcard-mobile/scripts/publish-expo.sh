#!/bin/bash

# BoomCard - Publish to Expo Go
# This script publishes the app to Expo Go with the production API URL

set -e

echo "📱 Publishing BoomCard to Expo Go..."
echo ""

# Set the API URL to the Render production server
export EXPO_PUBLIC_API_URL="https://boomcard.onrender.com"

echo "✅ Using API URL: $EXPO_PUBLIC_API_URL"
echo ""

# Publish to Expo Go using EAS Update
echo "🚀 Publishing to Expo Go..."
npx eas update --branch production --message "Update from publish script"

echo ""
echo "✨ Published successfully!"
echo "📱 Open Expo Go and pull down to refresh the app"
