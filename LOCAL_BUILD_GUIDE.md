# Local APK Build Guide

**Alternative to EAS Build** - Build Android APK directly on your Mac

Since EAS cloud builds are having issues, you can build the APK locally. This is faster and gives you more control.

---

## Prerequisites

You need Android Studio and Android SDK installed.

### Check if Android SDK is installed:

```bash
echo $ANDROID_HOME
# Should show path like: /Users/administrator/Library/Android/sdk
```

### If not installed:

1. Download Android Studio: https://developer.android.com/studio
2. Install Android Studio
3. Open Android Studio → Settings → Appearance & Behavior → System Settings → Android SDK
4. Install Android SDK (API 34 or latest)
5. Add to your `.bash_profile` or `.zshrc`:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   ```
6. Restart terminal

---

## Build APK Locally

### Step 1: Generate Android Project

```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npx expo prebuild --platform android --clean
```

This creates the `android/` directory with native Android project.

### Step 2: Build Release APK

```bash
cd android
./gradlew assembleRelease
```

Or using Expo:
```bash
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npx expo run:android --variant release
```

### Step 3: Find Your APK

The APK will be located at:
```
/Users/administrator/Documents/BoomCard/boomcard-mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## Install APK on Android Device

### Method 1: USB Transfer

1. Connect Android phone via USB
2. Copy APK to phone:
   ```bash
   # Enable USB debugging on phone first
   # Settings → About Phone → Tap "Build Number" 7 times
   # Settings → Developer Options → Enable USB Debugging

   adb install android/app/build/outputs/apk/release/app-release.apk
   ```

### Method 2: Email/Cloud

1. Email yourself the APK
2. Open email on Android phone
3. Download and install

### Method 3: Direct Copy

1. Connect phone via USB
2. Enable File Transfer mode
3. Copy APK to Downloads folder
4. Open file browser on phone
5. Tap APK → Install

---

## Signing the APK

For distribution, the APK needs to be signed.

### Generate Keystore:

```bash
cd android/app
keytool -genkey -v -keystore boomcard-release.keystore \
  -alias boomcard-mobile \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Enter password and details when prompted.

### Configure Gradle:

Create `android/gradle.properties`:
```properties
BOOMCARD_RELEASE_STORE_FILE=boomcard-release.keystore
BOOMCARD_RELEASE_KEY_ALIAS=boomcard-mobile
BOOMCARD_RELEASE_STORE_PASSWORD=your_password_here
BOOMCARD_RELEASE_KEY_PASSWORD=your_password_here
```

Edit `android/app/build.gradle`:
```gradle
android {
    ...
    signingConfigs {
        release {
            if (project.hasProperty('BOOMCARD_RELEASE_STORE_FILE')) {
                storeFile file(BOOMCARD_RELEASE_STORE_FILE)
                storePassword BOOMCARD_RELEASE_STORE_PASSWORD
                keyAlias BOOMCARD_RELEASE_KEY_ALIAS
                keyPassword BOOMCARD_RELEASE_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            ...
            signingConfig signingConfigs.release
        }
    }
}
```

Then build:
```bash
cd android
./gradlew assembleRelease
```

---

## Advantages of Local Build

✅ **Faster** - No queue, no upload time
✅ **More Control** - See full build output
✅ **Debugging** - Easier to fix errors
✅ **No Limits** - Build as many times as you want
✅ **Works Offline** - No internet required

## Disadvantages

❌ Requires Android Studio/SDK (~4GB download)
❌ Need to manage signing keys manually
❌ Mac-only (can't build iOS without Mac)

---

## Troubleshooting

### "ANDROID_HOME not set"

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### "SDK location not found"

Create `android/local.properties`:
```
sdk.dir=/Users/administrator/Library/Android/sdk
```

### "./gradlew: Permission denied"

```bash
chmod +x android/gradlew
```

### "Could not resolve all dependencies"

```bash
cd android
./gradlew clean
./gradlew assembleRelease
```

---

## Quick Commands

```bash
# Navigate to project
cd /Users/administrator/Documents/BoomCard/boomcard-mobile

# Generate Android project
npx expo prebuild --platform android --clean

# Build APK
cd android && ./gradlew assembleRelease

# Find APK
ls -lh android/app/build/outputs/apk/release/

# Install via USB
adb install android/app/build/outputs/apk/release/app-release.apk

# Uninstall old version first
adb uninstall bg.boomcard.mobile
```

---

## Next Steps

After building APK:

1. Install on Android device
2. Test authentication (SecureStore will work!)
3. Test payment flow
4. Test all features
5. Fix any bugs found
6. Build production version
7. Submit to Google Play

---

**Ready to build locally?**

1. Check if Android SDK installed: `echo $ANDROID_HOME`
2. If not, install Android Studio
3. Run: `npx expo prebuild --platform android --clean`
4. Run: `cd android && ./gradlew assembleRelease`
5. APK at: `android/app/build/outputs/apk/release/app-release.apk`
