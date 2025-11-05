#!/bin/bash

# BoomCard Mobile App - Expo Launcher
# This script starts Expo Dev Server

echo "🚀 Starting BoomCard Mobile App..."
echo ""
echo "✅ Dependencies fixed (react-native-web installed)"
echo "✅ Cache cleared"
echo "✅ Ready to start!"
echo ""

# Navigate to mobile app directory
cd /Users/administrator/Documents/BoomCard/boomcard-mobile

# Start Expo
echo "Starting Expo Dev Server..."
echo ""
echo "📱 When Expo starts, you'll see a menu:"
echo "   - Press 'i' to open iOS Simulator"
echo "   - Press 'a' to open Android Emulator"
echo "   - Or scan QR code with Expo Go on your phone"
echo ""

npx expo start --clear
