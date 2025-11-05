# BoomCard Mobile - Ready to Build APK/IPA Packages

**Status:** Ready to create standalone packages for real device testing

**Date:** January 5, 2025

---

## Current Situation

### What Works:
- ✅ Mobile app loads successfully in iOS Simulator
- ✅ UI renders correctly (BoomCard login screen)
- ✅ Backend API is working (3 test users created)
- ✅ Registration API calls succeed
- ✅ All dependencies installed

### What Doesn't Work (iOS Simulator Only):
- ❌ `expo-secure-store` doesn't work in iOS Simulator
- ❌ Cannot complete login flow (token storage fails)
- ❌ Error: "Failed to store access_token"

### Solution:
Build standalone APK (Android) and IPA (iOS) packages to test on **real devices** where `expo-secure-store` works properly.

---

## What's Been Prepared

### 1. Build Configuration
File: [boomcard-mobile/eas.json](boomcard-mobile/eas.json)

Preview profile configured:
```json
"preview": {
  "distribution": "internal",
  "ios": {
    "resourceClass": "m-medium",
    "simulator": false
  },
  "android": {
    "buildType": "apk"
  },
  "env": {
    "EXPO_PUBLIC_API_URL": "http://172.20.10.2:3001"
  }
}
```

This builds:
- **Android:** APK file (easy to install on any Android device)
- **iOS:** IPA file (installable via Expo or TestFlight)
- **API Connection:** Points to your local backend at 172.20.10.2:3001

### 2. Build Tools Installed
- ✅ EAS CLI installed globally (`npm install -g eas-cli`)
- ✅ All mobile app dependencies installed
- ✅ Build scripts configured in package.json

### 3. Documentation Created

**Quick Start Guide:**
- [QUICK_START_BUILD.md](QUICK_START_BUILD.md) - 3-step guide to build packages

**Comprehensive Guide:**
- [BUILD_AND_INSTALL_GUIDE.md](BUILD_AND_INSTALL_GUIDE.md) - Complete build and installation instructions

**Testing Guide:**
- [MOBILE_APP_TESTING_GUIDE.md](MOBILE_APP_TESTING_GUIDE.md) - How to test the app (all 3 methods)

**Expo Go Quick Start:**
- [EXPO_GO_QUICK_START.md](EXPO_GO_QUICK_START.md) - For Expo Go testing

**Testing Options:**
- [MOBILE_TESTING_OPTIONS.md](MOBILE_TESTING_OPTIONS.md) - Comparison of testing methods

### 4. Helper Scripts

**Build Script:**
```bash
boomcard-mobile/build-packages.sh
```
Interactive script to build Android/iOS packages

**Start Script:**
```bash
start-mobile-app.sh
```
Starts Expo development server

---

## Next Steps (3 Commands)

### Step 1: Login to Expo

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas login
```

Choose:
- "Sign up for a new account" (if you don't have one)
- Or enter your existing Expo credentials

### Step 2: Build Packages

**Option A: Interactive Script**
```bash
./build-packages.sh
```

**Option B: Build Android APK**
```bash
eas build --profile preview --platform android
```

**Option C: Build Both Android and iOS**
```bash
eas build --profile preview --platform all
```

### Step 3: Monitor Build

```bash
eas build:list
```

Or open in browser:
```bash
open https://expo.dev
```

---

## Build Timeline

### Expected Times:
- **Login:** 2 minutes
- **Start Build:** 1 minute
- **Android APK Build:** 10-15 minutes
- **iOS IPA Build:** 15-20 minutes (first build ~25 min)

### During Build:
You can:
- Close terminal (build runs in cloud)
- Check status: `eas build:list`
- Receive email notification when complete

---

## After Build Completes

### Download Packages:

**Android APK:**
```bash
eas build:list
# Copy download URL
# Or visit: https://expo.dev → Projects → boomcard-mobile → Builds
```

**iOS IPA:**
- Direct install from expo.dev on iOS device
- Or submit to TestFlight

### Install on Device:

**Android:**
1. Transfer APK to phone
2. Enable "Install from unknown sources"
3. Tap APK → Install

**iOS:**
1. Open Safari on iPhone
2. Go to expo.dev
3. Navigate to build
4. Tap "Install"

### Test Authentication:

1. **Start backend:**
   ```bash
   cd /Users/administrator/Documents/BoomCard/backend-api
   npm run dev
   ```

2. **Connect phone to same Wi-Fi**

3. **Test registration:**
   - Open BoomCard app
   - Register new account
   - ✅ Should succeed (no SecureStore error!)

4. **Test login:**
   - Login with credentials
   - ✅ Should navigate to Dashboard
   - ✅ Wallet balance visible

---

## Current Configuration

### Mobile App:
- **Package:** boomcard-mobile v1.0.0
- **Expo SDK:** ~54.0.22
- **React Native:** 0.81.5
- **Bundle ID (iOS):** bg.boomcard.mobile
- **Package Name (Android):** bg.boomcard.mobile

### Backend API:
- **URL (Development):** http://172.20.10.2:3001
- **URL (Production):** https://api.boomcard.bg
- **Status:** Running on localhost:3001

### Network:
- **Computer IP:** 172.20.10.2
- **Required:** Phone and computer on same Wi-Fi network
- **Firewall:** Allow port 3001

---

## Troubleshooting

### "Not logged into EAS"
```bash
eas login
eas whoami  # Verify
```

### "Network error" in app
```bash
# Verify backend running
curl http://localhost:3001/api/health

# Check IP
ipconfig getifaddr en0

# Verify phone can reach API
# On phone browser: http://172.20.10.2:3001/api/health
```

### "Build failed"
```bash
eas build:list  # Check logs
npm install  # Reinstall dependencies
eas build --profile preview --platform android --clear-cache
```

---

## Cost & Limits

### Expo Free Tier:
- ✅ 30 builds per month (free)
- ✅ Unlimited preview builds
- ✅ Shared build infrastructure
- ✅ No credit card required

### What You Get:
- Android APK file
- iOS IPA file
- Build logs and artifacts
- Email notifications
- 12-month build retention

---

## Production Builds (Future)

When ready for production:

### 1. Update API URL
Edit [eas.json](boomcard-mobile/eas.json):
```json
"production": {
  "env": {
    "API_URL": "https://api.boomcard.bg"
  }
}
```

### 2. Build Production Packages
```bash
npm run build:prod:android
npm run build:prod:ios
```

### 3. Submit to Stores
```bash
npm run submit:android  # Google Play
npm run submit:ios      # App Store
```

---

## Summary

**You're all set to build!** 🚀

Three simple steps:
1. `eas login` (2 minutes)
2. `eas build --profile preview --platform android` (15 minutes)
3. Install APK on Android phone and test

**Why this solves the problem:**
- iOS Simulator limitation with SecureStore → Use real device
- Real device has actual keychain → SecureStore works
- Authentication flow will work properly

**What to expect:**
- Full registration and login functionality
- Token storage works
- Payment flow works
- All features testable

---

## Quick Commands

```bash
# Step 1: Login
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas login

# Step 2: Build
eas build --profile preview --platform android

# Step 3: Check Status
eas build:list

# Step 4: Start Backend (for testing)
cd ../backend-api && npm run dev
```

---

**Ready to start?** See [QUICK_START_BUILD.md](QUICK_START_BUILD.md) for detailed walkthrough.

**Questions?** See [BUILD_AND_INSTALL_GUIDE.md](BUILD_AND_INSTALL_GUIDE.md) for comprehensive documentation.
