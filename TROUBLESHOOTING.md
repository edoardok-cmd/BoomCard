# 🔧 BoomCard Troubleshooting Guide

## Issue: Pages Showing "You're Offline" Instead of Content

### Symptoms
- Visiting `/promotions`, `/experiences`, `/integrations`, or `/locations` shows the offline fallback page
- Pages show purple gradient with "You're Offline" message
- Browser console shows no errors
- Dev server is running correctly

### Root Cause
The **Service Worker** is still active in your browser from a previous session and is serving the cached offline page for routes that aren't in its cache yet.

---

## ✅ Solution 1: Use the Automated Clearing Tool (RECOMMENDED)

### Steps:
1. Open your browser to: **http://localhost:3001/clear-sw.html**
2. Click the **"Unregister Service Worker"** button
3. Click the **"Clear All Caches"** button
4. Click the **"Reload Page"** button
5. All pages should now load with content!

### What this does:
- Unregisters all Service Workers
- Clears all cached content
- Provides real-time status updates
- Shows you exactly what's being removed

---

## ✅ Solution 2: Manual Browser DevTools Method

### Chrome / Edge:
1. Press **F12** to open DevTools
2. Go to **Application** tab
3. In the left sidebar, click **Service Workers**
4. Find the BoomCard service worker
5. Click **Unregister**
6. Go to **Cache Storage** in the left sidebar
7. Right-click each cache and select **Delete**
8. Close DevTools
9. Press **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac) to hard refresh

### Firefox:
1. Press **F12** to open DevTools
2. Go to **Storage** tab
3. Expand **Service Workers** in the left sidebar
4. Right-click and select **Unregister**
5. Expand **Cache Storage**
6. Right-click each cache and select **Delete**
7. Close DevTools
8. Press **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac) to hard refresh

### Safari:
1. Open **Safari** → **Preferences** → **Advanced**
2. Check **"Show Develop menu in menu bar"**
3. **Develop** → **Empty Caches**
4. **Develop** → **Service Workers** → Select BoomCard → **Unregister**
5. Press **Cmd+Shift+R** to hard refresh

---

## ✅ Solution 3: Private/Incognito Mode (Quick Test)

Open a **Private/Incognito window**:
- Chrome: `Ctrl+Shift+N` (Windows) or `Cmd+Shift+N` (Mac)
- Firefox: `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
- Safari: `Cmd+Shift+N`

Navigate to `http://localhost:3001/promotions` - it should work immediately.

**Note:** This is only for testing. You'll need to clear the SW in your regular browser for permanent fix.

---

## 🔍 Verification

After applying any solution, verify these pages load correctly:

| Page | URL | Expected Content |
|------|-----|------------------|
| **Promotions** | http://localhost:3001/promotions | 6 promotional offers with filtering tabs |
| **Experiences** | http://localhost:3001/experiences | 6 unique experiences with category chips |
| **Integrations** | http://localhost:3001/integrations | 8 integration partners (Stripe, etc.) |
| **Locations** | http://localhost:3001/locations | 6 partner locations across Bulgaria |

---

## 🛠️ Technical Details

### Why This Happens

The Service Worker (SW) was designed to:
1. Cache pages for offline viewing
2. Serve cached content when the network fails
3. Show a fallback offline page if content isn't cached

**The Problem:**
- New routes (`/promotions`, `/experiences`, etc.) weren't in the SW's pre-cache list
- When SW intercepted these routes, it thought they "failed" (since they weren't cached)
- SW served the offline fallback page instead

### The Fix

Modified `src/main.tsx` to **only register the Service Worker in production**:

```typescript
// Only enable Service Worker in production builds
if (import.meta.env.PROD) {
  serviceWorkerRegistration.register({...});
} else {
  // Development: Unregister to avoid caching issues
  serviceWorkerRegistration.unregister();
}
```

**Result:**
- ✅ Development: No SW interference, all routes work immediately
- ✅ Production: Full PWA capabilities with offline support
- ✅ HMR (Hot Module Replacement) works perfectly
- ✅ New routes load instantly

---

## 📋 Quick Checklist

If pages still don't load, check:

- [ ] Dev server is running (`npm run dev`)
- [ ] Service Worker is unregistered (check DevTools → Application)
- [ ] All caches are cleared
- [ ] Browser has been hard-refreshed (Ctrl+Shift+R)
- [ ] No browser extensions interfering (test in Incognito mode)
- [ ] Correct URL (http://localhost:3001, not 3000 or other port)

---

## 🆘 Still Having Issues?

### Check Dev Server Output:
```bash
npm run dev
```

Look for:
- ✅ `ready in XX ms`
- ✅ `Local: http://localhost:3001/`
- ❌ Any error messages

### Test Routes Directly:
```bash
curl -I http://localhost:3001/promotions
curl -I http://localhost:3001/experiences
curl -I http://localhost:3001/integrations
curl -I http://localhost:3001/locations
```

All should return `HTTP/1.1 200 OK`

### Check Browser Console:
1. Open DevTools (F12)
2. Go to **Console** tab
3. Look for errors (red messages)
4. Look for Service Worker messages

---

## 🚀 Prevention

To avoid this issue in the future:

1. **Always clear SW when switching branches**
2. **Use the `/clear-sw.html` tool before testing new features**
3. **Work in Incognito mode when developing new routes**
4. **Remember:** Service Worker only runs in production builds now

---

## 📞 Support

If you're still experiencing issues:
1. Share the browser console output
2. Share the DevTools → Application → Service Workers status
3. Confirm which browser and version you're using
4. Try a different browser to isolate the issue

---

**All routes are working correctly in the codebase.** The issue is purely browser cache-related and can be resolved by following the solutions above. 🎉
