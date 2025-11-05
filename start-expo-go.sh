#!/bin/bash

echo "=========================================="
echo "Starting BoomCard for Expo Go Testing"
echo "=========================================="
echo ""

# Start backend
echo "Starting backend..."
cd /Users/administrator/Documents/BoomCard/backend-api
npm run dev > /tmp/backend-expo.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"
sleep 3

# Start Expo
echo ""
echo "Starting Expo Go..."
echo ""
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npx expo start --clear

# This will show QR code for Expo Go
