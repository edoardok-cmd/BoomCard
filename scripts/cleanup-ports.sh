#!/bin/bash

# Cleanup script for development ports
# Kills processes on ports 5173, 5174, and 3001

echo "🧹 Cleaning up development ports..."

# Kill processes on port 5173 (Vite)
if lsof -ti:5173 > /dev/null 2>&1; then
  echo "  ✓ Killing processes on port 5173"
  lsof -ti:5173 | xargs kill -9 2>/dev/null
else
  echo "  ℹ Port 5173 is free"
fi

# Kill processes on port 5174 (Vite fallback)
if lsof -ti:5174 > /dev/null 2>&1; then
  echo "  ✓ Killing processes on port 5174"
  lsof -ti:5174 | xargs kill -9 2>/dev/null
else
  echo "  ℹ Port 5174 is free"
fi

# Kill processes on port 3001 (API)
if lsof -ti:3001 > /dev/null 2>&1; then
  echo "  ✓ Killing processes on port 3001"
  lsof -ti:3001 | xargs kill -9 2>/dev/null
else
  echo "  ℹ Port 3001 is free"
fi

echo "✨ Port cleanup complete!"
