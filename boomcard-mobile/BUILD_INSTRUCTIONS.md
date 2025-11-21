# Building Android APK for Testing

## Option 1: Build Preview APK (Recommended for Testing)

This creates a standalone APK file that can be shared with colleagues.

### Steps:

1. **Login to EAS** (if not already logged in):
   ```bash
   cd /Users/administrator/Documents/BoomCard/boomcard-mobile
   npx eas login
   ```

2. **Build the Android APK**:
   ```bash
   npx eas build --profile preview --platform android
   ```

3. **What happens**:
   - EAS will build your app in the cloud
   - Build takes ~10-15 minutes
   - You'll get a download link when complete

4. **Share with your colleague**:
   - Download the APK from the link provided
   - Send the APK file via email, Slack, Google Drive, etc.
   - Your colleague installs it on their Android phone
   - They need to enable "Install from Unknown Sources" in Android settings

### Important Notes:
- The preview build uses your production backend: `https://boomcard-api.onrender.com`
- Make sure your Render backend is deployed and running
- Push notifications will work (unlike Expo Go)
- All features including camera, location, biometric auth will work

---

## Option 2: Development Build (For Active Development)

If your colleague needs to test frequently with live updates:

```bash
npx eas build --profile development --platform android
```

This creates a development build that can connect to your local Metro bundler.

---

## Option 3: Expo Go (Quick but Limited)

Simplest option but has limitations (no push notifications in SDK 53+):

1. Have your colleague install **Expo Go** from Google Play Store
2. Start your dev server: `npm start`
3. Share the QR code or URL from the terminal
4. They scan it with Expo Go

**Limitations**:
- No push notifications
- Must be on same network OR use `npx expo start --tunnel`

---

## Checking Build Status

After running the build command, you can check status at:
- **EAS Dashboard**: https://expo.dev/accounts/edoardok/projects/boomcard-mobile/builds
- Or run: `npx eas build:list`

---

## Troubleshooting

### "Build failed"
- Check the build logs in the EAS dashboard
- Common issues: missing credentials, configuration errors

### "APK won't install"
- Enable "Install from Unknown Sources" on Android
- Check if your colleague's Android version is compatible (min SDK 23)

### "App crashes on startup"
- Check if the backend URL is correct and accessible
- Review logs with: `npx react-native log-android` (if USB debugging enabled)

---

## Quick Command Reference

```bash
# Build preview APK (recommended)
npx eas build --profile preview --platform android

# Check build status
npx eas build:list

# Download latest build
# (Go to: https://expo.dev and find your build)

# Build for both platforms
npx eas build --profile preview --platform all
```
