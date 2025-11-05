# 📱 BoomCard Mobile App - Expo Go Quick Start

**Status:** ✅ READY TO TEST!
**Date:** November 4, 2025

---

## ✅ All Set Up Complete!

✅ Dependencies installed
✅ Environment configured (IP: 172.20.10.2)
✅ Backend API running on port 3001
✅ Expo Dev Server running on port 8081

---

## 🚀 How to Connect from Your Phone

### Option 1: Direct URL (Easiest)

1. **Install Expo Go** on your phone:
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
   - iOS: https://apps.apple.com/app/expo-go/id982107779

2. **Make sure phone is on same Wi-Fi as computer**

3. **Open Expo Go app**

4. **Enter this URL manually:**
   ```
   exp://172.20.10.2:8081
   ```

5. **App will load!** (takes ~30-60 seconds first time)

---

### Option 2: QR Code

1. **Open browser** on your computer and go to:
   ```
   http://localhost:8081
   ```

2. **You'll see Expo Dev Tools** with a QR code

3. **Scan QR code** with:
   - **Android**: Open Expo Go → Tap "Scan QR Code"
   - **iOS**: Open Camera app → Point at QR code → Tap "Open in Expo Go"

---

## 🧪 Testing Checklist

Once the app loads on your phone:

### First Test: App Loads
- [ ] Splash screen appears
- [ ] Home screen displays
- [ ] No error messages

### Second Test: Navigation
- [ ] Can navigate between tabs
- [ ] Bottom navigation works
- [ ] Screens load smoothly

### Third Test: Registration
- [ ] Tap "Register"
- [ ] Fill in form (email, password)
- [ ] Submit and create account
- [ ] Success message appears

### Fourth Test: Login
- [ ] Enter credentials
- [ ] Login succeeds
- [ ] Dashboard displays

### Fifth Test: API Connection
- [ ] Dashboard shows wallet balance
- [ ] Data loads from backend
- [ ] No "network error" messages

---

## 🔧 Quick Commands

**View Expo Dev Tools:**
```bash
open http://localhost:8081
```

**Check Backend API:**
```bash
curl http://172.20.10.2:3001/api/health
```

**View Backend Logs:**
```bash
# Backend is already running in another terminal
# Check that terminal for logs
```

**View Metro Bundler Logs:**
```bash
# Metro bundler is running in background
# Logs available at: http://localhost:8081
```

---

## 📱 Connection URLs

- **Expo Dev Server:** http://localhost:8081
- **Metro Bundler:** http://localhost:8081/status
- **Backend API:** http://172.20.10.2:3001
- **Backend Health:** http://172.20.10.2:3001/api/health

**Mobile App URL (enter in Expo Go):**
```
exp://172.20.10.2:8081
```

---

## 🐛 Troubleshooting

### "Cannot connect to Metro"
**Solution:** Make sure phone and computer are on same Wi-Fi network

### "Network request failed"
**Solution:** Check backend is running:
```bash
curl http://172.20.10.2:3001/api/health
```

### "Expo Go shows error"
**Solution:**
1. Close Expo Go completely
2. Reopen and re-enter URL: `exp://172.20.10.2:8081`

### "App won't load / stuck loading"
**Solution:**
1. Shake phone to open Expo menu
2. Tap "Reload"
3. Wait 30-60 seconds

### "Need to restart Expo"
```bash
# Kill the background process
pkill -f "expo start"

# Restart
cd /Users/administrator/Documents/BoomCard/boomcard-mobile
npx expo start
```

---

## 📊 What to Test

### Critical Features:

1. **Authentication**
   - Register new account
   - Login with credentials
   - Logout

2. **Dashboard**
   - View wallet balance
   - See transaction history
   - Navigation works

3. **Venues**
   - List loads
   - Can search/filter
   - Venue details display

4. **Receipt Scanner**
   - Camera opens
   - Can take photo
   - Can upload image
   - Success message shows

5. **Sticker Scanner**
   - Camera opens
   - QR code detection works
   - Reward applied

6. **Payments**
   - Add funds button works
   - Paysera opens in browser
   - Returns to app after payment

---

## 🎯 Expected Behavior

**First Load:**
- Takes 30-60 seconds
- Shows bundling progress
- Displays splash screen
- Navigates to home

**Hot Reload:**
- Code changes appear instantly
- No need to reload manually
- Preserves app state

**Performance:**
- Smooth animations
- No lag in navigation
- Quick API responses

---

## 📝 Current Configuration

**Environment Variables:**
```
EXPO_PUBLIC_API_URL=http://172.20.10.2:3001
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_APP_VERSION=1.0.0
EXPO_PUBLIC_TEST_MODE=true
```

**Backend Status:**
- Running on http://localhost:3001
- Health check: http://172.20.10.2:3001/api/health
- All APIs accessible

**Expo Status:**
- Metro Bundler: Running ✅
- Port 8081: Active ✅
- Dev Tools: http://localhost:8081 ✅

---

## 🎉 You're Ready to Test!

**Next Steps:**

1. Open Expo Go on your phone
2. Enter URL: `exp://172.20.10.2:8081`
3. Wait for app to load (~30-60 seconds)
4. Start testing!

**Need Help?**
- Full testing guide: [MOBILE_APP_TESTING_GUIDE.md](MOBILE_APP_TESTING_GUIDE.md)
- Operations guide: [OPERATIONS_QUICK_REFERENCE.md](OPERATIONS_QUICK_REFERENCE.md)

---

**Happy Testing! 🚀**

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**
