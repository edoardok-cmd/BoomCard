#!/bin/bash

# BoomCard Mobile Development Startup Script
# This script starts both backend API and Expo in separate terminals

echo "🚀 Starting BoomCard Mobile Development Environment"
echo ""

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
killall -9 node npm expo 2>/dev/null
lsof -ti:3001,8081,8082 | xargs kill -9 2>/dev/null
sleep 2

# Clear Expo cache
echo "🗑️  Clearing Expo cache..."
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
rm -rf .expo node_modules/.cache 2>/dev/null

echo ""
echo "✅ Environment cleaned"
echo ""
echo "📋 Next steps:"
echo "1. Open a NEW terminal and run:"
echo "   cd /Users/administrator/Documents/BoomCard/backend-api && npm run dev"
echo ""
echo "2. Wait for backend to show '🚀 BoomCard API Server started on port 3001'"
echo ""
echo "3. Then run in THIS terminal:"
echo "   cd /Users/administrator/Documents/BoomCard/boomcard-mobile && npx expo start --clear"
echo ""
echo "4. On your phone:"
echo "   - FORCE QUIT Expo Go app (swipe up and close it)"
echo "   - Reopen Expo Go"
echo "   - Scan the QR code"
echo ""
echo "🌐 Network: Your phone will connect to backend at http://172.20.10.2:3001"
echo ""
