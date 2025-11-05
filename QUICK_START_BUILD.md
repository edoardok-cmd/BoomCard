# Quick Start: Build APK and IPA

**Goal:** Create APK (Android) and IPA (iOS) packages to test on real devices

**Why:** The iOS Simulator has limitations with `expo-secure-store`, so we need real device packages for full testing.

---

## Three Simple Steps

### Step 1: Login to Expo (2 minutes)

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas login
```

**If you don't have an Expo account:**
- Choose "Sign up for a new account"
- Use your work email
- Choose username: `boomcard-admin` (or similar)
- Check your email to confirm

**If you have an account:**
- Enter your email and password

**Verify login:**
```bash
eas whoami
```

---

### Step 2: Build the Packages (15-20 minutes)

#### Option A: Use the Build Script (Easiest)

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
./build-packages.sh
```

This will:
1. Check you're logged in
2. Ask which platform (Android, iOS, or both)
3. Start the builds

#### Option B: Manual Commands

**Build Android APK:**
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas build --profile preview --platform android
```

**Build iOS IPA:**
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas build --profile preview --platform ios
```

**Build Both:**
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas build --profile preview --platform all
```

---

### Step 3: Monitor Build Progress

**Check build status:**
```bash
eas build:list
```

**Or open in browser:**
```bash
open https://expo.dev
```

Navigate to: Projects → boomcard-mobile → Builds

---

## What Happens Next?

### During Build (15-20 minutes)

You'll see:
```
✔ Build credentials set up
✔ Project archived
✔ Uploading to EAS Build
✔ Queued... Waiting for a worker
✔ Building...
```

The build runs in the cloud, so you can:
- Close the terminal
- Work on other tasks
- Check status anytime with `eas build:list`

### When Build Completes

You'll receive:
1. Email notification
2. Download URL for the package
3. QR code (for direct install on device)

---

## Download and Install

### For Android APK:

**Download:**
```bash
# Check builds
eas build:list

# Copy the download URL from the output
# Or visit: https://expo.dev → Projects → boomcard-mobile → Builds
```

**Install:**
1. Transfer APK to Android phone
2. Open file browser
3. Tap APK file
4. Enable "Install from unknown sources" if prompted
5. Tap "Install"
6. Open BoomCard app

### For iOS IPA:

**Install Method 1: Direct from Expo**
1. On iOS device, open Safari
2. Go to: https://expo.dev
3. Login with your Expo account
4. Navigate to: Projects → boomcard-mobile → Builds
5. Tap latest iOS build
6. Tap "Install"
7. Settings → General → VPN & Device Management → Trust

**Install Method 2: TestFlight**
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
eas submit --platform ios --profile preview
```

Then install via TestFlight app.

---

## Test the App

### Before Testing:

1. **Start backend:**
```bash
cd /Users/administrator/Documents/BoomCard/backend-api
npm run dev
```

2. **Connect phone to same Wi-Fi** as your computer

3. **Verify backend access:**
   - Open phone browser
   - Go to: `http://172.20.10.2:3001/api/health`
   - Should see: `{"status":"ok"}`

### Test Registration:

1. Open BoomCard app
2. Tap "Register"
3. Enter email and password
4. Tap "Create Account"
5. ✅ Should see: "Registration successful"

### Test Login:

1. Enter credentials
2. Tap "Login"
3. ✅ Should navigate to Dashboard
4. ✅ Wallet balance should show

**This confirms:** SecureStore works on real device! 🎉

---

## Troubleshooting

### "Not logged into EAS"

```bash
eas login
eas whoami
```

### "Network error" in app

```bash
# Check backend is running
curl http://localhost:3001/api/health

# Check your IP hasn't changed
ipconfig getifaddr en0
# Should show: 172.20.10.2

# If IP changed, rebuild with new IP in eas.json
```

### "Build failed"

```bash
# Check build logs
eas build:list
# Click failed build → View logs

# Common fixes:
npm install
eas build --profile preview --platform android --clear-cache
```

---

## Quick Reference

```bash
# Login
eas login

# Check who's logged in
eas whoami

# Build Android
eas build --profile preview --platform android

# Build iOS
eas build --profile preview --platform ios

# Build both
eas build --profile preview --platform all

# Check status
eas build:list

# View in browser
open https://expo.dev

# Start backend
cd ../backend-api && npm run dev
```

---

## Next Steps After Testing

Once the app works on real devices:

1. **Fix any bugs found during testing**
2. **Build production packages:**
   ```bash
   npm run build:prod:android
   npm run build:prod:ios
   ```
3. **Submit to app stores:**
   ```bash
   npm run submit:android
   npm run submit:ios
   ```

---

**Ready? Start with Step 1:** `eas login`

For detailed information, see: [BUILD_AND_INSTALL_GUIDE.md](BUILD_AND_INSTALL_GUIDE.md)
