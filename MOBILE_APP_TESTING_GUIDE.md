# BoomCard Mobile App - Testing Guide

**Last Updated:** November 4, 2025

---

## 📱 How to Test the Mobile App

You have **3 options** for testing the BoomCard mobile app, from easiest to most production-like:

1. **Expo Go** (Easiest, 5 minutes) - Quick development testing
2. **Preview APK** (Recommended, 20 minutes) - Standalone APK for testing
3. **Development Build** (Advanced, 30 minutes) - Full native features

---

## Option 1: Quick Testing with Expo Go (Recommended for First Test) ⚡

**Best for:** Quick testing, development, trying out the app immediately

### Step 1: Install Expo Go on Your Phone

**Android:**
- Open Google Play Store
- Search for "Expo Go"
- Install the app
- Download: https://play.google.com/store/apps/details?id=host.exp.exponent

**iOS:**
- Open App Store
- Search for "Expo Go"
- Install the app
- Download: https://apps.apple.com/app/expo-go/id982107779

### Step 2: Set Up Environment Variables

```bash
cd boomcard-mobile

# Create .env file from example
cp .env.example .env

# Edit .env with your local API URL
# For testing with local backend:
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:3001

# Find your computer's IP:
# Mac: System Settings → Wi-Fi → Details → IP Address
# Or run: ipconfig getifaddr en0

# Example .env file:
# EXPO_PUBLIC_API_URL=http://192.168.1.100:3001
# EXPO_PUBLIC_ENV=development
```

### Step 3: Start the Backend API (if testing locally)

```bash
# In a separate terminal
cd backend-api
npm run dev
# Backend should start on http://localhost:3001
```

### Step 4: Start Expo Development Server

```bash
cd boomcard-mobile
npm install  # Install dependencies (first time only)
npm start    # Start Expo dev server
```

You'll see a QR code in the terminal.

### Step 5: Open App on Your Phone

**Android:**
1. Open Expo Go app
2. Tap "Scan QR code"
3. Scan the QR code from terminal
4. App will load in ~30 seconds

**iOS:**
1. Open Camera app
2. Point at QR code
3. Tap notification "Open in Expo Go"
4. App will load in ~30 seconds

### ⚠️ Limitations of Expo Go:
- Some native features may not work (biometric auth)
- Camera and location permissions work fine
- Payment flow works (opens browser)
- Good for testing UI and basic functionality

---

## Option 2: Build a Preview APK (Recommended for Real Testing) 🎯

**Best for:** Testing on actual device with all features, sharing with testers

### Prerequisites

1. **Install EAS CLI:**
```bash
npm install -g eas-cli
```

2. **Login to Expo:**
```bash
eas login
# Use your Expo account credentials
```

3. **Check existing builds:**
```bash
cd boomcard-mobile
eas build:list
```

### Build APK for Android

```bash
cd boomcard-mobile

# Build preview APK
npm run build:preview:android

# Or manually:
eas build --profile preview --platform android
```

**What happens:**
1. EAS Build uploads your code to Expo servers
2. Builds the APK in the cloud (~10-15 minutes)
3. You get a download link when complete

### Download and Install

After build completes:

1. **Check build status:**
```bash
eas build:list
```

2. **Download APK:**
   - Copy the download URL from terminal
   - Or visit: https://expo.dev/accounts/[your-account]/projects/boomcard-mobile/builds
   - Click on the latest "preview" build
   - Download the APK file

3. **Install on Android:**
   - Transfer APK to your phone (AirDrop, email, cloud storage)
   - Open the APK file
   - Tap "Install"
   - You may need to allow "Install from unknown sources"

4. **Test the app!**

### Build for iOS (TestFlight)

```bash
# Build preview for iOS
npm run build:preview:ios

# After build completes, you'll get an .ipa file
# Install via TestFlight or directly on device
```

---

## Option 3: Development Build (For Advanced Testing) 🔧

**Best for:** Testing native features, debugging, development team

### Build Development Version

```bash
cd boomcard-mobile

# Android
npm run build:dev:android

# iOS
npm run build:dev:ios
```

Development builds include:
- React Native DevTools
- Hot reloading
- Native debugging
- All native modules

---

## 🧪 What to Test

### Critical Path 1: Registration → Payment (5 minutes)

1. **Open App**
   - App should load splash screen
   - Navigate to home screen

2. **Register New Account**
   - Tap "Register"
   - Enter: Email, Password, Confirm Password
   - Tap "Create Account"
   - ✅ Should receive success message

3. **Login**
   - Enter email and password
   - Tap "Login"
   - ✅ Should navigate to Dashboard

4. **View Wallet**
   - Dashboard shows wallet balance (0.00 BGN initially)
   - Tap "Add Funds"
   - Enter amount: 10.00 BGN
   - Tap "Pay with Paysera"
   - ✅ Browser should open with Paysera payment page

5. **Complete Payment**
   - Use Paysera test card
   - Complete payment
   - ✅ Should redirect back to app
   - ✅ Wallet balance should update

### Critical Path 2: Receipt Submission (3 minutes)

1. **Navigate to Receipts**
   - Tap "Receipts" tab
   - ✅ Should show empty state or previous receipts

2. **Submit New Receipt**
   - Tap "+" or "Submit Receipt"
   - Choose venue from list
   - Tap "Take Photo" or "Choose from Library"
   - Take/select receipt photo
   - ✅ Preview should show

3. **Upload Receipt**
   - Tap "Upload"
   - ✅ Should show loading indicator
   - ✅ Success message should appear
   - ✅ Receipt should appear in list

### Critical Path 3: Sticker Scan (2 minutes)

1. **Navigate to Scanner**
   - Tap "Scan" tab
   - ✅ Camera should open

2. **Scan QR Code**
   - Point camera at BOOM-Sticker QR code
   - (For testing, you can generate a QR code with format: `boomcard://sticker/STICKER-ID`)
   - ✅ Should detect QR code
   - ✅ Reward message should show

3. **Verify Reward**
   - Check wallet balance
   - ✅ Balance should increase by reward amount

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to API"

**Solution:**
```bash
# Check your .env file
cat boomcard-mobile/.env

# Make sure EXPO_PUBLIC_API_URL is correct
# For local backend: http://YOUR_IP:3001
# For production: https://api.boomcard.bg

# Restart Expo dev server
npm start
```

### Issue: "Network request failed"

**Solutions:**
1. Make sure phone and computer are on same Wi-Fi network
2. Check firewall isn't blocking port 3001
3. Verify backend is running: `curl http://localhost:3001/api/health`

### Issue: "Camera permission denied"

**Solution:**
1. Open phone Settings
2. Apps → BoomCard (or Expo Go)
3. Permissions → Camera → Allow

### Issue: "APK won't install"

**Solution:**
1. Enable "Install from unknown sources" in Android settings
2. Settings → Security → Unknown sources → Enable
3. Try installing again

### Issue: "Expo Go shows error screen"

**Solution:**
```bash
# Clear Expo cache
cd boomcard-mobile
npx expo start -c

# Or reset Metro bundler
npx react-native start --reset-cache
```

### Issue: "Build failed on EAS"

**Solution:**
```bash
# Check build logs
eas build:list
# Click on failed build → View logs

# Common fixes:
# 1. Make sure all dependencies are installed
cd boomcard-mobile && npm install

# 2. Check eas.json is valid
cat eas.json

# 3. Try building again
eas build --profile preview --platform android
```

---

## 📊 Testing Checklist

Use this checklist when testing the app:

### Authentication & Navigation
- [ ] App launches without crashing
- [ ] Splash screen displays correctly
- [ ] Can navigate to Register screen
- [ ] Can create new account
- [ ] Can login with credentials
- [ ] Can logout successfully
- [ ] Bottom tab navigation works (Dashboard, Venues, Receipts, Scanner, Profile)

### Dashboard
- [ ] Wallet balance displays correctly
- [ ] Recent transactions show
- [ ] "Add Funds" button works
- [ ] Stats/charts display (if any)

### Payment Flow
- [ ] Can enter payment amount
- [ ] "Pay with Paysera" opens browser
- [ ] Can complete test payment
- [ ] Redirects back to app after payment
- [ ] Wallet balance updates after successful payment

### Venues
- [ ] Venue list loads
- [ ] Can search venues
- [ ] Can filter venues by category
- [ ] Can view venue details
- [ ] Map shows venue location (if on phone)

### Receipt Scanner
- [ ] Camera permission requested
- [ ] Camera opens successfully
- [ ] Can take photo of receipt
- [ ] Can select photo from gallery
- [ ] Photo preview displays
- [ ] Can submit receipt
- [ ] Receipt appears in list after upload

### Sticker Scanner
- [ ] Camera permission requested
- [ ] QR code scanner opens
- [ ] Can scan QR code
- [ ] Reward message displays
- [ ] Wallet balance updates

### Profile
- [ ] User info displays correctly
- [ ] Can edit profile information
- [ ] Can change password
- [ ] Can logout

### Error Handling
- [ ] Shows error message for invalid login
- [ ] Shows error message for network issues
- [ ] Shows loading states during API calls
- [ ] Handles offline mode gracefully

### Performance
- [ ] App loads in < 3 seconds
- [ ] Navigation is smooth (no lag)
- [ ] Images load quickly
- [ ] No memory leaks or crashes

---

## 🚀 Quick Start Commands

```bash
# 1. Install dependencies
cd boomcard-mobile
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your API URL

# 3. Start Expo (for Expo Go testing)
npm start

# 4. Build APK (for standalone testing)
eas build --profile preview --platform android

# 5. Check build status
eas build:list

# 6. View builds in browser
open https://expo.dev
```

---

## 📞 Getting Help

**EAS Build Documentation:**
https://docs.expo.dev/build/introduction/

**Expo Go Documentation:**
https://docs.expo.dev/get-started/expo-go/

**React Native Debugging:**
https://reactnative.dev/docs/debugging

**Common Issues:**
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) (if available)
- Check Expo forums: https://forums.expo.dev/
- Check React Native issues: https://github.com/facebook/react-native/issues

---

## 🎯 Recommended Testing Flow

**Day 1: Quick Validation**
1. Use Expo Go to test basic functionality
2. Test on 1-2 Android devices
3. Verify API connectivity
4. Test registration and login

**Day 2: Comprehensive Testing**
1. Build preview APK
2. Install on multiple Android devices
3. Follow complete testing checklist
4. Document any bugs found

**Day 3: iOS Testing**
1. Build iOS preview
2. Install via TestFlight or directly
3. Test on iPhone models
4. Compare with Android version

**Day 4: Final Testing**
1. Test all critical paths
2. Test edge cases and error scenarios
3. Verify performance on different devices
4. Get feedback from team members

---

## 📱 Test Devices Recommended

### Minimum Testing Matrix

| Device Type | OS Version | Screen Size | Priority |
|-------------|------------|-------------|----------|
| Android Budget | Android 10+ | 5.5" | HIGH |
| Android Mid-Range | Android 12+ | 6.1" | HIGH |
| Android Flagship | Android 13+ | 6.5" | MEDIUM |
| iPhone | iOS 15+ | Various | HIGH |

### Your Test Devices

Document which devices you're testing on:

- [ ] Device 1: ___________________ (Android/iOS version: ___)
- [ ] Device 2: ___________________ (Android/iOS version: ___)
- [ ] Device 3: ___________________ (Android/iOS version: ___)

---

**Happy Testing! 🎉**

If you encounter any issues, refer to the troubleshooting section or check the operational documentation in [OPERATIONS_QUICK_REFERENCE.md](OPERATIONS_QUICK_REFERENCE.md).

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**
