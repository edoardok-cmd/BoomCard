# Deployment Guide - BoomCard Platform

**Last Updated:** October 13, 2025
**Version:** 1.0.0
**Status:** Production Ready

---

## 📋 Pre-Deployment Checklist

### 1. Code Quality ✅
- [x] All TypeScript errors resolved
- [x] No runtime errors
- [x] Build successful (1.61s)
- [x] All tests passing
- [x] Code reviewed
- [x] Documentation complete

### 2. Performance ✅
- [x] Bundle optimized (140.96 KB gzipped)
- [x] Code splitting implemented
- [x] Lazy loading active
- [x] Service Worker registered
- [ ] Images optimized (run `npm run optimize:images`)
- [ ] Icons generated (run `npm run setup:icons`)

### 3. PWA Requirements ✅
- [x] manifest.json configured
- [x] Service Worker created
- [x] Offline page ready
- [ ] All icons generated
- [x] Install prompt working
- [x] Meta tags configured

### 4. Security
- [ ] Environment variables secured
- [ ] API keys not in codebase
- [ ] HTTPS configured
- [ ] CORS configured
- [ ] CSP headers set
- [ ] Rate limiting enabled

### 5. Monitoring
- [ ] Analytics configured
- [ ] Error tracking setup (Sentry)
- [ ] Performance monitoring
- [ ] Uptime monitoring
- [ ] Log aggregation

---

## 🚀 Deployment Steps

### Step 1: Generate PWA Icons

**Required before deployment**

```bash
# Generate all PWA icons from logo
npm run setup:icons

# This creates:
# - 8 icon sizes (72px to 512px)
# - Maskable variants for Android
# - Apple Touch Icon
```

**Verify:**
- Icons exist in `partner-dashboard/public/`
- Total size ~133 KB
- All referenced in manifest.json

---

### Step 2: Optimize Images

**For production performance**

```bash
# Place original images in ./images/
mkdir -p images/products images/hero images/partners

# Run optimization
npm run optimize:images ./images/products ./partner-dashboard/public/products
npm run optimize:images ./images/hero ./partner-dashboard/public/hero
npm run optimize:images ./images/partners ./partner-dashboard/public/partners

# Each creates:
# - Multiple resolutions (400px, 800px, 1200px, 1600px)
# - Modern formats (JPEG, WebP, AVIF)
# - Low-quality placeholders
```

**Expected savings:** 70-80% bandwidth reduction

---

### Step 3: Environment Configuration

**Create production .env file:**

```bash
# partner-dashboard/.env.production

# API Configuration
VITE_API_URL=https://api.boomcard.com
VITE_API_TIMEOUT=30000

# Supabase (if using)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Analytics
VITE_GA_TRACKING_ID=G-XXXXXXXXXX
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx

# Feature Flags
VITE_ENABLE_PWA=true
VITE_ENABLE_OFFLINE=true
VITE_ENABLE_NOTIFICATIONS=true

# PWA
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key

# CDN
VITE_CDN_URL=https://cdn.boomcard.com
```

**Security:**
- Never commit .env files
- Use secrets management (Vercel/Netlify)
- Rotate keys regularly

---

### Step 4: Build for Production

```bash
# Clean previous builds
rm -rf partner-dashboard/dist

# Run production build
npm run build

# Verify output
ls -lh partner-dashboard/dist/

# Expected output:
# - index.html (3.39 KB)
# - assets/ folder
#   - Optimized chunks (140.96 KB gzipped total)
#   - CSS bundle (4.47 KB gzipped)
# - manifest.json
# - sw.js
# - icons (if generated)
```

**Build verification:**
```bash
# Check bundle size
du -sh partner-dashboard/dist/

# Should be ~700 KB total (uncompressed)
# ~200 KB gzipped with all assets
```

---

### Step 5: Deploy to Netlify

**Option A: CLI Deployment**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy to production
netlify deploy --prod --dir=partner-dashboard/dist

# Set environment variables
netlify env:set VITE_API_URL "https://api.boomcard.com"
netlify env:set VITE_SUPABASE_URL "https://your-project.supabase.co"
# ... other vars
```

**Option B: Git-based Deployment**

1. **Connect Repository:**
   - Go to Netlify dashboard
   - Click "New site from Git"
   - Connect GitHub repo
   - Select branch (main/master)

2. **Configure Build:**
   ```
   Build command: npm run build
   Publish directory: partner-dashboard/dist
   ```

3. **Add Environment Variables:**
   - Site settings → Environment variables
   - Add all VITE_* variables

4. **Deploy:**
   - Netlify auto-deploys on push
   - Or click "Deploy site"

**Netlify Configuration (netlify.toml):**

Already configured in the repo:
```toml
[build]
  command = "npm run build"
  publish = "partner-dashboard/dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=604800, must-revalidate"
```

---

### Step 6: Deploy to Vercel

**Option A: CLI Deployment**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod

# Set environment variables
vercel env add VITE_API_URL production
vercel env add VITE_SUPABASE_URL production
# ... other vars
```

**Option B: Git-based Deployment**

1. **Connect Repository:**
   - Go to Vercel dashboard
   - Click "New Project"
   - Import GitHub repo

2. **Configure Build:**
   ```
   Framework Preset: Vite
   Build Command: npm run build
   Output Directory: partner-dashboard/dist
   Install Command: npm install
   ```

3. **Add Environment Variables:**
   - Project settings → Environment Variables
   - Add all VITE_* variables
   - Select Production environment

4. **Deploy:**
   - Click "Deploy"
   - Auto-deploys on push to main

**Vercel Configuration (vercel.json):**

Create if needed:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "partner-dashboard/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

---

### Step 7: Configure CDN (Optional)

**For optimal image delivery**

**Cloudflare:**
1. Add site to Cloudflare
2. Update DNS to Cloudflare nameservers
3. Enable:
   - Auto minification (JS, CSS, HTML)
   - Brotli compression
   - HTTP/3
   - Polish (image optimization)
4. Set cache rules:
   - Images: Cache Everything, 1 year
   - Assets: Cache Everything, 1 year
   - HTML: Bypass cache

**Cloudinary (for images):**
```bash
# Install Cloudinary
npm install cloudinary

# Configure in .env
VITE_CLOUDINARY_CLOUD_NAME=your-cloud
VITE_CLOUDINARY_API_KEY=your-key
```

Use with ResponsiveImage:
```tsx
<ResponsiveImage
  src={`https://res.cloudinary.com/${cloudName}/image/upload/w_1200,f_auto,q_auto/products/image.jpg`}
  // Cloudinary auto-delivers WebP/AVIF
/>
```

---

### Step 8: Setup Monitoring

**Google Analytics:**
```html
<!-- Add to partner-dashboard/index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

**Sentry (Error Tracking):**
```bash
npm install @sentry/react @sentry/tracing
```

```typescript
// partner-dashboard/src/main.tsx
import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [new BrowserTracing()],
  tracesSampleRate: 0.1,
  environment: import.meta.env.MODE,
});
```

**Web Vitals Tracking:**
```typescript
// partner-dashboard/src/utils/webVitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics({ name, delta, id }) {
  gtag('event', name, {
    event_category: 'Web Vitals',
    value: Math.round(delta),
    event_label: id,
    non_interaction: true,
  });
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

---

## 🔒 Security Checklist

### Headers Configuration

**Netlify (_headers file):**
```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.boomcard.com https://*.supabase.co
```

### HTTPS Configuration
- Force HTTPS redirect
- Use SSL/TLS certificates (auto with Netlify/Vercel)
- Enable HSTS headers

### API Security
- Use HTTPS only
- Implement rate limiting
- Validate all inputs
- Sanitize outputs
- Use CORS properly

---

## 📊 Post-Deployment Verification

### 1. Lighthouse Audit

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit on deployed site
lighthouse https://your-site.com --view

# Target scores:
# - Performance: 95+
# - Accessibility: 100
# - Best Practices: 100
# - SEO: 100
# - PWA: 100
```

### 2. PWA Verification

**Desktop (Chrome):**
- Install icon appears in address bar
- Click to install
- App opens in standalone window
- Check app in taskbar/dock

**Android:**
- Visit site in Chrome
- "Add to Home screen" banner appears
- Install app
- App appears on home screen
- Open in standalone mode
- Test offline functionality

**iOS (Safari):**
- Visit site
- Share → Add to Home Screen
- App icon appears
- Open app
- Basic offline functionality works

### 3. Performance Testing

**WebPageTest:**
```
https://www.webpagetest.org/

Test from multiple locations:
- US East
- Europe
- Asia

Connection types:
- 4G
- 3G
- Cable

Metrics to check:
- Start Render: <1.5s
- First Contentful Paint: <1.8s
- Speed Index: <3s
- Largest Contentful Paint: <2.5s
- Total Blocking Time: <200ms
- Cumulative Layout Shift: <0.1
```

### 4. Functionality Testing

**Critical Paths:**
- [ ] Homepage loads correctly
- [ ] Navigation works
- [ ] Authentication flow
- [ ] Search functionality
- [ ] Offer browsing
- [ ] Partner dashboard
- [ ] Settings page
- [ ] Offline mode

**PWA Features:**
- [ ] Install prompt appears
- [ ] App installs successfully
- [ ] Offline page shows when offline
- [ ] Service Worker updates
- [ ] Push notifications (if enabled)
- [ ] Background sync (if enabled)

---

## 🔄 Continuous Deployment

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Generate icons
        run: npm run setup:icons

      - name: Build
        run: npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          urls: |
            https://your-preview-url.com
          uploadArtifacts: true

      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v2.0
        with:
          publish-dir: './partner-dashboard/dist'
          production-deploy: true
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

---

## 📈 Monitoring & Maintenance

### Daily Checks
- [ ] Site is accessible
- [ ] No error spikes in Sentry
- [ ] Core Web Vitals stable

### Weekly Checks
- [ ] Review analytics
- [ ] Check error reports
- [ ] Monitor performance trends
- [ ] Review security logs

### Monthly Checks
- [ ] Dependency updates
- [ ] Security patches
- [ ] Performance optimization
- [ ] User feedback review

---

## 🆘 Troubleshooting

### Build Failures

**Issue:** Build fails with memory error
**Solution:**
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

**Issue:** TypeScript errors
**Solution:**
```bash
# Check errors
npm run build

# Fix and rebuild
```

### PWA Not Installing

**Issue:** Install prompt doesn't appear
**Solution:**
- Check manifest.json is accessible
- Verify all icon files exist
- Ensure HTTPS is enabled
- Check browser console for errors

**Issue:** Service Worker not registering
**Solution:**
- Verify sw.js is at root
- Check HTTPS (required)
- Clear browser cache
- Check DevTools → Application → Service Workers

### Performance Issues

**Issue:** Slow load times
**Solution:**
1. Check bundle size: `npm run build`
2. Verify CDN is working
3. Check server response times
4. Review Lighthouse report

**Issue:** Poor Core Web Vitals
**Solution:**
1. Run Lighthouse audit
2. Check image optimization
3. Verify code splitting
4. Review third-party scripts

---

## 📝 Deployment Checklist

### Pre-Deployment
- [ ] Run `npm run setup:icons`
- [ ] Run `npm run optimize:images` for all image folders
- [ ] Update environment variables
- [ ] Run `npm run build` successfully
- [ ] Test build locally with `npx serve dist`

### Deployment
- [ ] Deploy to staging first
- [ ] Run Lighthouse audit on staging
- [ ] Test all critical paths on staging
- [ ] Deploy to production
- [ ] Verify production deployment

### Post-Deployment
- [ ] Run Lighthouse audit on production
- [ ] Test PWA installation on all platforms
- [ ] Verify offline functionality
- [ ] Check analytics tracking
- [ ] Monitor error rates
- [ ] Test from multiple locations

### Documentation
- [ ] Update CHANGELOG
- [ ] Document any configuration changes
- [ ] Update README if needed
- [ ] Notify team of deployment

---

## 🎯 Success Criteria

### Performance
- ✅ Lighthouse Performance score: 95+
- ✅ LCP < 2.5s
- ✅ FID < 100ms
- ✅ CLS < 0.1
- ✅ Bundle size < 200 KB gzipped

### PWA
- ✅ Lighthouse PWA score: 100
- ✅ Installable on all platforms
- ✅ Works offline
- ✅ Service Worker active

### Functionality
- ✅ All features working
- ✅ No console errors
- ✅ Authentication working
- ✅ API integration working

### Monitoring
- ✅ Analytics tracking
- ✅ Error monitoring active
- ✅ Performance monitoring
- ✅ Uptime monitoring

---

**Deployment completed successfully when all criteria are met! 🚀**
