# BoomCard Mobile App - Deployment Guide

Complete guide for building and deploying the BoomCard mobile app to Apple App Store and Google Play Store.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Testing](#testing)
4. [Building for Production](#building-for-production)
5. [iOS Deployment](#ios-deployment)
6. [Android Deployment](#android-deployment)
7. [Post-Deployment](#post-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts

#### Apple Developer Account (for iOS)
- Cost: $99/year
- Sign up: https://developer.apple.com/programs/
- Required for:
  - iOS app submission
  - TestFlight distribution
  - Push notifications certificates

#### Google Play Console Account (for Android)
- Cost: $25 one-time
- Sign up: https://play.google.com/console/
- Required for:
  - Android app submission
  - App signing
  - Play Store distribution

#### Expo Account
- Free tier available
- Sign up: https://expo.dev
- Required for:
  - EAS Build
  - OTA updates
  - App submissions

### Required Tools

```bash
# Node.js 18+
node --version

# npm or yarn
npm --version

# Expo CLI
npm install -g expo-cli

# EAS CLI
npm install -g eas-cli
```

---

## Development Setup

### 1. Clone and Install

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npm install
```

### 2. Configure Environment

Create `.env.local` for development:

```bash
# .env.local
API_URL=http://localhost:3001
API_TIMEOUT=30000
GPS_MAX_RADIUS_METERS=60
```

### 3. Start Development Server

```bash
# Start Expo dev server
npm start

# Or run on specific platform
npm run ios      # iOS Simulator
npm run android  # Android Emulator
npm run web      # Web browser (testing only)
```

---

## Testing

### Unit Tests

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage
```

### E2E Tests

```bash
# Install Detox (if using)
npm install -g detox-cli

# Build for testing
npm run build:e2e

# Run E2E tests
npm run test:e2e
```

### Manual Testing Checklist

**Critical Features:**
- [ ] User login/registration
- [ ] 🔴 Receipt scanner with GPS validation (60m radius)
- [ ] QR sticker scanner
- [ ] GPS location permissions
- [ ] Camera permissions
- [ ] OCR processing
- [ ] Cashback calculation
- [ ] Digital card display
- [ ] Profile management

**Test on both:**
- [ ] iOS device
- [ ] Android device

---

## Building for Production

### 1. Login to Expo/EAS

```bash
# Login to Expo account
eas login

# Verify login
eas whoami
```

### 2. Configure Project

```bash
# Initialize EAS in project
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas build:configure
```

This creates/updates:
- `eas.json` - Build configuration ✅ Already created
- `app.json` - App metadata ✅ Already configured

### 3. Update Version Numbers

Edit `app.json`:

```json
{
  "expo": {
    "version": "1.0.0",  // Increment for each release
    "ios": {
      "buildNumber": "1"  // Increment for each iOS build
    },
    "android": {
      "versionCode": 1   // Increment for each Android build
    }
  }
}
```

---

## iOS Deployment

### Step 1: Apple Developer Setup

#### A. Create App ID
1. Go to https://developer.apple.com/account/
2. Navigate to Certificates, IDs & Profiles
3. Create new App ID:
   - **Description:** BoomCard
   - **Bundle ID:** `bg.boomcard.mobile`
   - **Capabilities:** Enable:
     - Push Notifications
     - App Groups (if needed)

#### B. Create Provisioning Profile
1. In Certificates, IDs & Profiles
2. Create new Provisioning Profile:
   - **Type:** App Store
   - **App ID:** bg.boomcard.mobile
   - **Certificates:** Select your distribution certificate

#### C. App Store Connect Setup
1. Go to https://appstoreconnect.apple.com/
2. Click "+ New App"
3. Fill in details:
   - **Name:** BoomCard
   - **Primary Language:** English (or Bulgarian)
   - **Bundle ID:** bg.boomcard.mobile
   - **SKU:** bg.boomcard.mobile
   - **User Access:** Full Access

### Step 2: Build iOS App

```bash
# Build for iOS production
eas build --platform ios --profile production

# Or build for TestFlight
eas build --platform ios --profile preview
```

**Build Process:**
- Duration: ~10-20 minutes
- Cloud-based build (no Mac required)
- Outputs: `.ipa` file

### Step 3: Submit to App Store

#### Option A: Automatic Submission (via EAS)

```bash
# Submit to App Store Connect
eas submit --platform ios

# Or during build
eas build --platform ios --auto-submit
```

#### Option B: Manual Submission

1. Download `.ipa` from EAS Build dashboard
2. Open Transporter app (macOS)
3. Drag and drop `.ipa` file
4. Wait for upload to complete

### Step 4: App Store Listing

In App Store Connect, configure:

**App Information:**
- **Category:** Finance or Business
- **Subcategory:** Personal Finance
- **Content Rights:** Own or licensed rights

**Pricing:**
- **Price:** Free
- **Availability:** Select countries

**App Privacy:**
- **Location:** Used for receipt verification (60m radius requirement)
- **Camera:** Used for receipt and QR code scanning
- **Photos:** Used for receipt upload

**Screenshots Required:**
- iPhone 6.7" Display (1290 x 2796 pixels) - 3-10 screenshots
- iPhone 6.5" Display (1242 x 2688 pixels) - 3-10 screenshots
- iPhone 5.5" Display (1242 x 2208 pixels) - 3-10 screenshots
- iPad Pro 12.9" Display (2048 x 2732 pixels) - 3-10 screenshots

**App Description:**
```
BoomCard - Your Digital Loyalty Card

Earn cashback on every purchase with BoomCard! Scan receipts, collect points, and redeem rewards at partner venues across Bulgaria.

FEATURES:
• 📸 Scan receipts instantly with OCR technology
• 💥 Scan QR stickers at venues for instant cashback
• 🎯 GPS-verified receipt validation for security
• 💳 Digital loyalty card - no physical card needed
• 🎁 Exclusive offers and promotions
• 📊 Track your cashback and spending analytics

SECURITY:
• Location-based receipt verification (within 60 meters of venue)
• Secure encrypted data storage
• Biometric authentication support

Download BoomCard today and start earning cashback on every purchase!
```

**Keywords:**
`cashback,loyalty,rewards,receipts,qr code,bulgaria,bgn,discounts,offers,savings`

### Step 5: Submit for Review

1. Complete all required fields
2. Add app rating (complete questionnaire)
3. Submit for review
4. Typical review time: 24-48 hours

---

## Android Deployment

### Step 1: Google Play Console Setup

#### A. Create Application
1. Go to https://play.google.com/console/
2. Click "Create app"
3. Fill in details:
   - **App name:** BoomCard
   - **Default language:** English
   - **App or game:** App
   - **Free or paid:** Free

#### B. Configure App Signing
1. In Google Play Console → Setup → App signing
2. Let Google Play manage signing key (recommended)
3. Download upload certificate

### Step 2: Build Android App

```bash
# Build for Android production (AAB)
eas build --platform android --profile production

# Or build APK for testing
eas build --platform android --profile preview
```

**Build Process:**
- Duration: ~10-15 minutes
- Outputs: `.aab` (for Play Store) or `.apk` (for testing)

### Step 3: Submit to Google Play

#### Option A: Automatic Submission (via EAS)

```bash
# Submit to Google Play Console
eas submit --platform android

# You'll need to provide:
# - Service account JSON key
# - Track (production, beta, alpha, internal)
```

#### Option B: Manual Submission

1. Download `.aab` from EAS Build dashboard
2. In Google Play Console:
   - Production → Create new release
   - Upload `.aab` file
   - Add release notes

### Step 4: Store Listing

In Google Play Console, configure:

**Main Store Listing:**

**App name:** BoomCard

**Short description** (80 chars max):
```
Earn cashback on purchases! Scan receipts & QR codes for rewards.
```

**Full description** (4000 chars max):
```
BoomCard - Your Digital Loyalty Card

Turn every purchase into rewards with BoomCard! The smartest way to earn cashback in Bulgaria.

🎯 HOW IT WORKS:
1. Scan your receipt after shopping
2. Our GPS technology verifies you're at the venue (within 60 meters)
3. Earn instant cashback on your purchase
4. Redeem rewards at partner venues

💥 KEY FEATURES:
• Receipt Scanner - Automatically extract purchase details with OCR
• QR Code Scanning - Scan stickers at venues for instant rewards
• GPS Verification - Secure, location-based validation
• Digital Card - No physical card needed
• Loyalty Points - Earn and track points across all purchases
• Exclusive Offers - Access special deals from partners
• Analytics Dashboard - Track your savings and spending

🔒 SECURITY & PRIVACY:
• Advanced GPS verification (60-meter radius requirement)
• Bank-level encryption for all data
• Biometric authentication (fingerprint/face recognition)
• Secure payment processing

🏪 ACCEPTED AT:
Restaurants, cafes, hotels, spas, retail stores, and hundreds of partner venues across Bulgaria.

📱 EASY TO USE:
1. Create your free account
2. Activate your digital BoomCard
3. Start scanning receipts
4. Watch your cashback grow!

💰 START SAVING TODAY!
Download BoomCard now and join thousands of users earning cashback on every purchase!

Support: support@boomcard.bg
Website: www.boomcard.bg
```

**App category:** Business or Finance

**Tags:**
- cashback
- loyalty program
- rewards
- receipts
- savings

**Graphics Required:**
- **Icon:** 512 x 512 pixels (PNG, 32-bit, no alpha)
- **Feature Graphic:** 1024 x 500 pixels
- **Screenshots:**
  - Phone: 320-3840 pixels (min 2, max 8)
  - 7-inch tablet: Optional
  - 10-inch tablet: Optional

### Step 5: Content Rating

Complete the questionnaire:
- **Violence:** None
- **Sexual Content:** None
- **Profanity:** None
- **Controlled Substances:** None
- **User Interaction:** Users can interact
- **Location:** Yes (for receipt verification)
- **Personal Info:** Email, location

Expected rating: **Everyone** or **PEGI 3**

### Step 6: Release

1. Complete all required sections (check progress bar)
2. Countries: Select target countries
3. Review and rollout:
   - **Internal testing** → Small team (optional)
   - **Closed testing** → Selected users (optional)
   - **Open testing** → Public beta (optional)
   - **Production** → Full release

**Review time:** Typically faster than iOS (few hours to 1-2 days)

---

## Post-Deployment

### Monitor App Performance

**iOS:**
- App Store Connect → Analytics
- TestFlight feedback
- Crash reports
- User reviews

**Android:**
- Google Play Console → Statistics
- Crash reports (Play Console)
- User reviews and ratings
- Pre-launch reports

### Over-the-Air (OTA) Updates

For minor updates that don't require app store review:

```bash
# Publish OTA update
eas update --branch production --message "Bug fixes and improvements"

# Or for specific platforms
eas update --platform ios --branch production
eas update --platform android --branch production
```

**Note:** OTA updates only work for JavaScript/assets, not native code changes.

### App Store Updates

For major updates or native changes:

1. Increment version in `app.json`
2. Build new version
3. Submit to stores
4. Wait for review

---

## Troubleshooting

### Build Failures

**iOS Build Failed - Provisioning Profile Error:**
```bash
# Clear credentials
eas credentials -p ios

# Regenerate
eas build --platform ios --clear-cache
```

**Android Build Failed - Gradle Error:**
```bash
# Clean and rebuild
eas build --platform android --clear-cache
```

### GPS Not Working

**iOS:**
- Check `Info.plist` has location permissions
- Verify `NSLocationWhenInUseUsageDescription`
- Test on real device (not simulator)

**Android:**
- Check `AndroidManifest.xml` has location permissions
- Verify `ACCESS_FINE_LOCATION` permission
- Enable location services in device settings

### Camera Not Working

**iOS:**
- Check `NSCameraUsageDescription` in `Info.plist`
- Verify camera permissions granted

**Android:**
- Check `CAMERA` permission in manifest
- Verify camera permissions granted

### OCR Not Processing

**Backend OCR endpoint not responding:**
1. Verify backend is running
2. Check API_URL in environment config
3. Test endpoint manually: `curl https://api.boomcard.bg/api/receipts/ocr`

**Fallback to manual entry:**
- OCR service automatically falls back if backend fails
- Users can manually enter receipt data

---

## Build Commands Cheat Sheet

```bash
# Development
npm start                    # Start dev server
npm run ios                  # iOS simulator
npm run android              # Android emulator

# Production Builds
eas build -p ios            # iOS production
eas build -p android        # Android production
eas build --platform all    # Both platforms

# Submit to Stores
eas submit -p ios           # Submit to App Store
eas submit -p android       # Submit to Google Play
eas submit --platform all   # Submit to both

# OTA Updates
eas update                   # Update all platforms
eas update -p ios           # Update iOS only
eas update -p android       # Update Android only

# Build Status
eas build:list              # List all builds
eas build:view [buildId]    # View specific build
```

---

## Security Checklist

Before deploying:

- [ ] API keys are not hardcoded
- [ ] Environment variables configured for production
- [ ] GPS validation is enabled (60m radius)
- [ ] SSL/HTTPS enforced for all API calls
- [ ] Sensitive data encrypted in storage
- [ ] Biometric authentication tested
- [ ] Rate limiting implemented
- [ ] Error messages don't expose sensitive data
- [ ] Logging doesn't include user data

---

## Compliance

**GDPR (Europe):**
- [ ] Privacy policy link in app
- [ ] User consent for location tracking
- [ ] Data export functionality
- [ ] Account deletion option

**CCPA (California):**
- [ ] Privacy policy disclosure
- [ ] Opt-out mechanism
- [ ] Data deletion requests

**App Store Guidelines:**
- [ ] No crashes or bugs
- [ ] All features work as described
- [ ] No misleading content
- [ ] Appropriate content rating

---

## Support

**Build Issues:**
- Expo Forum: https://forums.expo.dev/
- EAS Build Docs: https://docs.expo.dev/build/introduction/

**App Store Issues:**
- Apple Developer Forum: https://developer.apple.com/forums/
- App Store Connect Help: https://developer.apple.com/support/app-store-connect/

**Google Play Issues:**
- Play Console Help: https://support.google.com/googleplay/android-developer/

---

## Deployment Timeline

**First Release:**
- Development: 2-4 weeks
- Testing: 1 week
- iOS Review: 1-3 days
- Android Review: 1-2 days
- **Total: 3-5 weeks**

**Updates:**
- Minor OTA Update: Minutes (no review)
- Bug Fix Update: 1-3 days (review required)
- Feature Update: 1-5 days (review required)

---

**Ready to deploy!** 🚀

The BoomCard mobile app is production-ready with all critical features implemented, including the GPS-based receipt validation (60-meter radius requirement).
