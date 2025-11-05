# BoomCard Mobile - Build and Installation Guide

**Last Updated:** January 5, 2025

This guide walks you through building APK (Android) and IPA (iOS) packages and installing them on real devices.

---

## Prerequisites

- EAS CLI installed (already done: `npm install -g eas-cli`)
- Expo account (you'll create one in Step 1 if needed)
- Android device for APK testing
- iOS device for IPA testing (optional)

---

## Step 1: Login to EAS

You need to login to Expo Application Services (EAS) to build packages.

### Option A: Create New Expo Account (Recommended)

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas login
```

When prompted:
1. Choose "Sign up for a new account"
2. Enter email address (use your work email)
3. Enter username (e.g., "boomcard-admin")
4. Enter password
5. Confirm your email (check your inbox)

### Option B: Use Existing Expo Account

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas login
```

When prompted:
1. Enter your Expo email
2. Enter your password

### Verify Login

```bash
eas whoami
```

Should show your username.

---

## Step 2: Configure EAS Project

Link this project to your Expo account:

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas build:configure
```

This will:
- Create a project ID
- Link it to your account
- Update app.json with project ID

---

## Step 3: Build Android APK

Start the Android build:

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npm run build:preview:android
```

Or manually:
```bash
eas build --profile preview --platform android
```

### What Happens:

1. **Upload** - Code uploads to Expo servers (~30 seconds)
2. **Queue** - Build enters queue (wait time varies)
3. **Build** - APK builds in the cloud (~10-15 minutes)
4. **Complete** - You get a download URL

### Monitor Build Progress:

```bash
# Check build status
eas build:list

# Or visit in browser
open https://expo.dev
```

### Build Configuration:

The `preview` profile in eas.json is configured to:
- Build an APK (not AAB)
- Use internal distribution
- Connect to API at: `http://172.20.10.2:3001`
- Medium resource class for faster builds

---

## Step 4: Build iOS Package (Optional)

Start the iOS build:

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npm run build:preview:ios
```

Or manually:
```bash
eas build --profile preview --platform ios
```

### What Happens:

1. **Credentials** - EAS may ask to create iOS credentials (automatic)
2. **Upload** - Code uploads to Expo servers
3. **Build** - IPA builds in the cloud (~15-20 minutes)
4. **Complete** - You get a download URL

### iOS Build Notes:

- First build takes longer (creating certificates)
- EAS automatically handles provisioning profiles
- The build will work on any iOS device you authorize

---

## Step 5: Download APK/IPA

### Check Build Status:

```bash
eas build:list
```

Output will show:
```
Platform  Status    Build ID           Created
────────────────────────────────────────────────
Android   finished  abc123...          2 minutes ago
iOS       finished  def456...          5 minutes ago
```

### Download Methods:

#### Method 1: Command Line
```bash
# List builds with URLs
eas build:list --limit 5

# Copy the download URL from the output
```

#### Method 2: Web Dashboard
```bash
# Open Expo dashboard
open https://expo.dev

# Navigate to:
# Projects → boomcard-mobile → Builds
# Click on the latest build → Download
```

#### Method 3: Direct Download
The build completion message will include a direct download URL like:
```
https://expo.dev/accounts/[username]/projects/boomcard-mobile/builds/[build-id]
```

---

## Step 6: Install APK on Android

### Transfer APK to Phone:

**Option A: Direct Download**
1. Email yourself the APK download link
2. Open email on Android phone
3. Tap download link
4. APK downloads to phone

**Option B: USB Transfer**
1. Download APK to computer
2. Connect Android phone via USB
3. Copy APK to phone's Downloads folder
4. Disconnect phone

**Option C: Cloud Transfer**
1. Upload APK to Google Drive/Dropbox
2. Download from phone

### Install APK:

1. **Enable Unknown Sources**
   - Open Settings
   - Security → Unknown sources → Enable
   - Or: Apps → Special access → Install unknown apps → Enable for your file browser

2. **Install**
   - Open file browser (Files/My Files)
   - Navigate to Downloads
   - Tap the APK file (boomcard-mobile-preview.apk)
   - Tap "Install"
   - Wait for installation (~10 seconds)
   - Tap "Open"

3. **First Launch**
   - App will request permissions (Camera, Location)
   - Grant permissions
   - You'll see the BoomCard login screen

---

## Step 7: Install IPA on iOS

### Method A: Install via Expo Dashboard (Easiest)

1. **On your iOS device:**
   - Open Safari
   - Go to: https://expo.dev
   - Login with your Expo account
   - Navigate to: Projects → boomcard-mobile → Builds
   - Tap the latest iOS build
   - Tap "Install" button
   - Follow iOS installation prompts

2. **Trust Developer:**
   - Settings → General → VPN & Device Management
   - Tap your developer profile
   - Tap "Trust"

### Method B: TestFlight (Recommended for Production)

1. **Configure TestFlight:**
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas submit --platform ios --profile preview
```

2. **Install from TestFlight:**
   - Install TestFlight app from App Store
   - Open invitation email
   - Install BoomCard from TestFlight

---

## Step 8: Configure Backend Connection

Your phone needs to connect to the backend API running on your computer.

### For Local Testing:

1. **Ensure Backend is Running:**
```bash
cd /Users/administrator/Documents/BoomCard/backend-api
npm run dev
# Should start on http://localhost:3001
```

2. **Connect Phone to Same Wi-Fi:**
   - Your phone must be on the same Wi-Fi network as your computer
   - Network: The one your Mac is connected to

3. **Check API URL in App:**
   - The preview build uses: `http://172.20.10.2:3001`
   - This is your computer's IP address

### Verify Connection:

1. Open BoomCard app
2. Tap "Register"
3. Fill in registration form
4. Tap "Create Account"
5. If successful → API connection works
6. If "Network error" → Check backend and Wi-Fi

### Troubleshooting Connection:

**Problem: "Network error" when registering**

Solution 1: Verify your computer's IP hasn't changed
```bash
ipconfig getifaddr en0
# Should show: 172.20.10.2
# If different, rebuild with new IP
```

Solution 2: Check firewall
```bash
# Temporarily disable firewall or allow port 3001
# System Settings → Network → Firewall → Options
```

Solution 3: Test API from phone browser
- Open Safari/Chrome on phone
- Go to: `http://172.20.10.2:3001/api/health`
- Should see: `{"status":"ok"}`

---

## Step 9: Test the App

### Critical Test Path:

1. **Registration**
   - Open BoomCard app
   - Tap "Register"
   - Enter email, password
   - Tap "Create Account"
   - Should see: "Registration successful"

2. **Login**
   - Enter your credentials
   - Tap "Login"
   - Should navigate to Dashboard

3. **View Wallet**
   - Dashboard shows: Balance 0.00 BGN
   - This confirms authentication works

4. **Add Funds (Payment Flow)**
   - Tap "Add Funds"
   - Enter amount: 10.00
   - Tap "Pay with Paysera"
   - Browser should open with Paysera test page
   - Complete payment
   - Should redirect back to app
   - Wallet balance should update

5. **Submit Receipt**
   - Tap "Receipts" tab
   - Tap "Submit Receipt"
   - Choose venue
   - Take photo of receipt
   - Upload
   - Should see success message

6. **Scan Sticker (if available)**
   - Tap "Scan" tab
   - Camera opens
   - Scan QR code
   - Reward should appear

---

## Build Times & Costs

### Expected Build Times:

- Android APK: 10-15 minutes
- iOS IPA: 15-20 minutes (first build ~25 min for credentials)

### Expo Free Tier:

- 30 builds per month (free)
- Unlimited preview/development builds
- Shared build infrastructure

### Costs:

- Free tier is sufficient for development
- Production builds may require paid plan
- See: https://expo.dev/pricing

---

## Common Build Errors

### Error: "Not configured for EAS Build"

Solution:
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas build:configure
```

### Error: "Invalid credentials"

Solution:
```bash
eas login
eas whoami  # Verify login
```

### Error: "Build failed: Missing dependencies"

Solution:
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npm install
eas build --profile preview --platform android --clear-cache
```

### Error: "iOS build failed: Missing certificates"

Solution:
```bash
# Let EAS create credentials automatically
eas credentials -p ios
# Choose "Set up new credentials"
```

---

## Next Steps

After successful testing on real devices:

1. **Production Builds**
   ```bash
   # Build for production (uses https://api.boomcard.bg)
   npm run build:prod:android
   npm run build:prod:ios
   ```

2. **Submit to Stores**
   ```bash
   # Submit to Google Play
   npm run submit:android

   # Submit to App Store
   npm run submit:ios
   ```

3. **Update Documentation**
   - Document any issues found during testing
   - Update test results in testing checklist

---

## Quick Reference Commands

```bash
# Login to EAS
eas login

# Check who's logged in
eas whoami

# Build Android APK
npm run build:preview:android

# Build iOS IPA
npm run build:preview:ios

# Check build status
eas build:list

# View builds in browser
open https://expo.dev

# Start backend for testing
cd ../backend-api && npm run dev

# Check computer IP
ipconfig getifaddr en0
```

---

## Support

**EAS Build Documentation:**
https://docs.expo.dev/build/introduction/

**Installing Apps:**
- Android: https://docs.expo.dev/build/internal-distribution/
- iOS: https://docs.expo.dev/build/internal-distribution/

**Troubleshooting:**
- https://docs.expo.dev/build/troubleshooting/
- https://expo.dev/blog

---

**Ready to build?** Start with Step 1: Login to EAS
