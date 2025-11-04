# Sentry Error Tracking Setup Guide

Complete guide for setting up Sentry error tracking for both frontend and backend.

## What is Sentry?

Sentry is a real-time error tracking and monitoring platform that helps you:
- 🐛 Track and fix bugs faster
- 📊 Monitor application performance
- 🔍 Debug production issues
- 📈 Analyze error trends
- 👥 Track which users are affected

---

## Step 1: Create Sentry Account

### 1.1 Sign Up

1. Go to [https://sentry.io/signup/](https://sentry.io/signup/)
2. Sign up with your GitHub account or email
3. Choose the **Free Developer Plan** (10,000 errors/month)

### 1.2 Create Organization

1. Enter your organization name: **BoomCard**
2. Select your primary language/framework: **JavaScript**

---

## Step 2: Create Projects

You need **TWO** Sentry projects:

### 2.1 Frontend Project

1. Click **"Create Project"**
2. Select platform: **React**
3. Set alert frequency: **On every new issue**
4. Project name: **boomcard-frontend**
5. Click **"Create Project"**
6. **Copy the DSN** (looks like: `https://xxxxx@yyy.ingest.sentry.io/zzzzz`)
7. Save this as `VITE_SENTRY_DSN` for later

### 2.2 Backend Project

1. Click **"Create Project"** again
2. Select platform: **Node.js / Express**
3. Set alert frequency: **On every new issue**
4. Project name: **boomcard-backend**
5. Click **"Create Project"**
6. **Copy the DSN** (different from frontend!)
7. Save this as `SENTRY_DSN` for later

---

## Step 3: Configure Frontend (Partner Dashboard)

### 3.1 Frontend is Already Configured! ✅

The Sentry configuration is already set up in:
- File: `partner-dashboard/src/lib/monitoring/sentry.ts`
- Initialization: Automatic on app start
- Features: Browser tracing, session replay, error filtering

### 3.2 Add Environment Variables

Create or update `partner-dashboard/.env.production`:

```env
# Sentry Configuration
VITE_SENTRY_DSN=https://YOUR_FRONTEND_DSN@sentry.io/YOUR_PROJECT_ID
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_APP_ENVIRONMENT=production
VITE_APP_VERSION=2.0.0
```

### 3.3 Verify Frontend Setup

In your browser console (production only), you should see:
```
[Sentry] Initialized successfully
```

---

## Step 4: Configure Backend API

### 4.1 Backend is Already Configured! ✅

The Sentry configuration is already set up in:
- File: `backend-api/src/config/sentry.config.ts`
- Integration: Express middleware in `server.ts`
- Features: Request tracking, performance profiling, error capture

### 4.2 Install Dependencies

```bash
cd backend-api
npm install @sentry/node@^7.109.0 @sentry/profiling-node@^7.109.0
```

### 4.3 Add Environment Variables

Add to your `.env` or Render environment variables:

```env
# Sentry Configuration
SENTRY_DSN=https://YOUR_BACKEND_DSN@sentry.io/YOUR_PROJECT_ID
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
NODE_ENV=production
```

### 4.4 Verify Backend Setup

In your server logs, you should see:
```
[Sentry] Initialized successfully (production)
```

---

## Step 5: Test Error Tracking

### 5.1 Test Frontend Errors

Add this temporary code to any React component:

```typescript
const TestError = () => {
  const handleClick = () => {
    throw new Error('Test error from frontend!');
  };

  return <button onClick={handleClick}>Trigger Test Error</button>;
};
```

Click the button and check Sentry dashboard for the error.

### 5.2 Test Backend Errors

Add a test route in `server.ts`:

```typescript
// Test Sentry error tracking
app.get('/api/test-error', (req, res) => {
  throw new Error('Test error from backend!');
});
```

Visit `https://your-api.com/api/test-error` and check Sentry dashboard.

### 5.3 Verify in Sentry Dashboard

1. Go to Sentry dashboard
2. Click on your project
3. You should see the test errors in **Issues**
4. Click on the error to see:
   - Stack trace
   - User context
   - Request details
   - Breadcrumbs (events leading up to error)

---

## Step 6: Configure Alerts & Notifications

### 6.1 Email Alerts

1. Go to **Settings** → **Projects** → **boomcard-frontend** (or backend)
2. Click **Alerts** → **Alert Rules**
3. Click **"Create Alert Rule"**
4. Set conditions:
   - When: **An event is seen**
   - If: **The event's level is equal to error**
   - Then: **Send a notification via email**
5. Click **"Save Rule"**

### 6.2 Slack Integration (Optional)

1. Go to **Settings** → **Integrations**
2. Find **Slack** and click **"Install"**
3. Authorize Sentry to access your Slack workspace
4. Select channel: **#alerts** or **#errors**
5. Configure which errors to send:
   - New issues
   - Escalating issues
   - Resolved issues

### 6.3 Discord Integration (Optional)

1. Create a webhook in Discord:
   - Server Settings → Integrations → Webhooks
   - Copy webhook URL
2. In Sentry: **Settings** → **Integrations** → **Webhooks**
3. Add webhook URL
4. Select events to send

---

## Step 7: Advanced Configuration

### 7.1 Release Tracking

Track which version of your app has which errors:

**Frontend (in `vite.config.ts`):**
```typescript
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    sentryVitePlugin({
      org: 'boomcard',
      project: 'boomcard-frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

**Backend (in build script):**
```bash
npx @sentry/cli releases new "boomcard-api@1.0.0"
npx @sentry/cli releases finalize "boomcard-api@1.0.0"
```

### 7.2 Source Maps (Frontend)

Automatically upload source maps on build:

```bash
npm install --save-dev @sentry/vite-plugin
```

Add to `vite.config.ts`:
```typescript
build: {
  sourcemap: true,
},
```

### 7.3 User Context

Track which users experience errors:

**Frontend:**
```typescript
import { setUser } from '@/lib/monitoring/sentry';

// After user logs in
setUser({
  id: user.id,
  email: user.email,
  username: user.name,
});

// After logout
clearUser();
```

**Backend:**
```typescript
import { setUser } from '@/config/sentry.config';

// In authentication middleware
req.user && setUser({
  id: req.user.id,
  email: req.user.email,
  role: req.user.role,
});
```

### 7.4 Custom Tags & Context

Add custom data to error reports:

```typescript
import * as Sentry from '@sentry/node';

Sentry.setTag('payment_method', 'stripe');
Sentry.setContext('order', {
  id: '12345',
  amount: 99.99,
  currency: 'BGN',
});
```

---

## Step 8: Performance Monitoring

### 8.1 Enable Performance Tracking

Already enabled with sample rates:
- Frontend: 10% of transactions
- Backend: 10% of transactions

### 8.2 Custom Transactions

**Frontend:**
```typescript
import * as Sentry from '@sentry/react';

const transaction = Sentry.startTransaction({
  name: 'Receipt Upload',
  op: 'upload',
});

try {
  await uploadReceipt(file);
  transaction.setStatus('ok');
} catch (error) {
  transaction.setStatus('error');
  throw error;
} finally {
  transaction.finish();
}
```

**Backend:**
```typescript
import { startTransaction } from '@/config/sentry.config';

const transaction = startTransaction('Process Payment', 'payment');

try {
  const result = await processPayment(data);
  transaction.setStatus('ok');
  return result;
} finally {
  transaction.finish();
}
```

### 8.3 Monitor Performance

1. Go to Sentry → **Performance**
2. View:
   - Transaction duration (p50, p95, p99)
   - Throughput (requests/min)
   - Failure rate
   - Slow transactions

---

## Step 9: Session Replay (Frontend)

### 9.1 What is Session Replay?

Records user sessions (DOM interactions, clicks, scrolls) leading up to errors.

### 9.2 Already Configured! ✅

Session Replay is enabled in `sentry.ts`:
- Records 10% of normal sessions
- Records 100% of error sessions
- Privacy: Masks all text and blocks all media

### 9.3 View Replays

1. Go to error in Sentry dashboard
2. Click **"Replay"** tab
3. Watch video of user's session before error

---

## Step 10: Security & Privacy

### 10.1 PII Scrubbing

Both frontend and backend automatically:
- Remove authorization headers
- Mask passwords in URLs
- Filter out sensitive query params
- Scrub credit card numbers

### 10.2 GDPR Compliance

1. Update Privacy Policy to mention Sentry
2. Add data retention policy (90 days default)
3. Configure Data Scrubbing: **Settings** → **Security & Privacy**

### 10.3 IP Address Handling

Both configs set `sendDefaultPii: false` to not track IP addresses.

---

## Troubleshooting

### Issue: No Errors Appearing in Sentry

**Solutions:**
1. Check DSN is correct
2. Verify `NODE_ENV=production`
3. Check browser/server console for Sentry errors
4. Verify internet connectivity from server
5. Check Sentry service status: [status.sentry.io](https://status.sentry.io)

### Issue: Too Many Errors

**Solutions:**
1. Add error filtering in `beforeSend`
2. Reduce sample rate
3. Upgrade Sentry plan
4. Add `ignoreErrors` patterns

### Issue: Source Maps Not Working

**Solutions:**
1. Verify source maps are generated: `build.sourcemap: true`
2. Upload source maps: `@sentry/vite-plugin`
3. Check release matches
4. Verify auth token is valid

### Issue: Performance Overhead

**Solutions:**
1. Reduce `tracesSampleRate` to 0.05 (5%)
2. Reduce `profilesSampleRate` to 0.05
3. Disable session replay for normal sessions
4. Use `beforeSend` to filter noisy errors

---

## Monitoring Checklist

After setup, verify:

- ✅ Frontend DSN configured
- ✅ Backend DSN configured
- ✅ Test errors appear in dashboard
- ✅ Email alerts working
- ✅ Slack/Discord notifications (optional)
- ✅ User context tracking
- ✅ Performance monitoring enabled
- ✅ Session replay working (frontend)
- ✅ Release tracking configured
- ✅ Source maps uploaded

---

## Cost Optimization

### Free Plan (Developer)
- 10,000 errors/month
- 10,000 performance transactions/month
- 50 session replays/month
- **Cost: $0/month**

### Team Plan
- 50,000 errors/month
- 100,000 performance transactions/month
- 500 session replays/month
- **Cost: $26/month**

### Business Plan
- 250,000 errors/month
- 500,000 performance transactions/month
- 5,000 session replays/month
- **Cost: $80/month**

**Recommended for BoomCard:** Start with **Free plan**, upgrade to **Team plan** ($26/month) when you exceed limits.

---

## Best Practices

### 1. Error Grouping

Use `fingerprints` to group related errors:
```typescript
Sentry.captureException(error, {
  fingerprint: ['payment-failure', paymentMethod],
});
```

### 2. Environment Separation

Use different projects or environments:
- Production: `production`
- Staging: `staging`
- Development: `development`

### 3. Error Filtering

Filter out client-side errors you can't fix:
```typescript
ignoreErrors: [
  'ResizeObserver loop limit exceeded',
  'Non-Error promise rejection',
  'Network request failed',
]
```

### 4. Sensitive Data

Always scrub:
- Credit card numbers
- Passwords
- API keys
- Personal identifiers

### 5. Alert Fatigue

Avoid too many alerts:
- Set thresholds (only alert if >10 errors/min)
- Group similar errors
- Mute known issues
- Use digest emails (daily summaries)

---

## Useful Links

- [Sentry Docs](https://docs.sentry.io/)
- [React SDK Docs](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Node.js SDK Docs](https://docs.sentry.io/platforms/node/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Session Replay](https://docs.sentry.io/product/session-replay/)
- [Best Practices](https://docs.sentry.io/product/best-practices/)

---

## Support

**Sentry Support:**
- Documentation: docs.sentry.io
- Community: forum.sentry.io
- Email: support@sentry.io (paid plans)

**BoomCard Team:**
- GitHub Issues: your-repo/issues
- Email: support@boomcard.bg

---

**Setup Date:** _____________________
**Configured By:** _____________________
**Frontend DSN:** sentry://xxxxx
**Backend DSN:** sentry://xxxxx
**Plan:** Free / Team / Business
