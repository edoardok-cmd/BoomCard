# BoomCard Platform - Monitoring Setup Guide

**Version:** 1.0.0
**Last Updated:** November 4, 2025
**Estimated Setup Time:** 2-3 hours

---

## 📋 Overview

This guide provides step-by-step instructions for setting up comprehensive monitoring for the BoomCard platform.

**Monitoring Stack:**
- ✅ **Sentry** - Error tracking & performance (already configured)
- 🔄 **UptimeRobot** - Uptime monitoring (to setup)
- 🔄 **Better Stack** - Log management (optional)
- 🔄 **PostHog** - Analytics (optional)

---

## 1. Uptime Monitoring (UptimeRobot)

### Step 1: Create Account
1. Go to https://uptimerobot.com
2. Sign up for free account (50 monitors included)
3. Verify email

### Step 2: Add Backend Health Monitor

**Monitor 1: API Health Check**
```
Monitor Type: HTTP(s)
Friendly Name: BoomCard API - Health
URL: https://api.boomcard.bg/api/health
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
HTTP Method: GET
Expected Status Code: 200
```

**Monitor 2: API Detailed Health**
```
Monitor Type: HTTP(s)
Friendly Name: BoomCard API - Detailed Health
URL: https://api.boomcard.bg/api/health/detailed
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
HTTP Method: GET
Expected Status Code: 200
Keyword: "status":"ok"
```

**Monitor 3: Database Readiness**
```
Monitor Type: HTTP(s)
Friendly Name: BoomCard API - Database
URL: https://api.boomcard.bg/api/health/ready
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
HTTP Method: GET
Expected Status Code: 200
Keyword: "status":"ready"
```

### Step 3: Add Frontend Monitor

**Monitor 4: Frontend Dashboard**
```
Monitor Type: HTTP(s)
Friendly Name: BoomCard Dashboard
URL: https://dashboard.boomcard.bg
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
HTTP Method: GET
Expected Status Code: 200
```

### Step 4: Configure Alerts

**Alert Contacts:**
1. Add email: devops@boomcard.bg
2. Add SMS: [Phone number] (optional, paid feature)
3. Add Slack webhook (optional):
   - Slack → Add Apps → Incoming Webhooks
   - Copy webhook URL
   - Paste in UptimeRobot

**Alert Settings:**
```
Send alerts when: Monitor goes down
Reminder interval: Every 15 minutes until up
Alert threshold: 1 failed check (immediate alert)
```

### Step 5: Create Status Page (Optional)

1. UptimeRobot → Status Pages → Add New
2. Configure:
   ```
   Page Name: BoomCard Platform Status
   Custom Domain: status.boomcard.bg (optional)
   Select Monitors: All 4 monitors
   Show Response Times: Yes
   Show Uptime: Yes (90 days)
   ```
3. Publish status page
4. Share URL: https://stats.uptimerobot.com/[your-id]

---

## 2. Sentry Configuration (Already Integrated)

### Verify Sentry Integration

```bash
# Check Sentry is configured
curl https://api.boomcard.bg/api/health/detailed | jq '.checks'

# Should show Sentry DSN configured
```

### Step 1: Access Sentry Dashboard

1. Go to https://sentry.io
2. Login with team account
3. Select "boomcard-backend" project

### Step 2: Configure Alerts

**Alert 1: High Error Rate**
```
Alert Rule: When error count is more than 10 in 1 minute
Actions:
  - Send email to: dev@boomcard.bg
  - Send Slack notification (if configured)
Conditions:
  - Environment: production
  - Level: error or fatal
```

**Alert 2: Payment Failures**
```
Alert Rule: When error count is more than 5 in 5 minutes
Conditions:
  - Tags: payment:failed
  - Environment: production
Actions:
  - Send email to: devops@boomcard.bg, product@boomcard.bg
  - High priority
```

**Alert 3: New Issue First Seen**
```
Alert Rule: When a new issue is first seen
Conditions:
  - Environment: production
  - First seen
Actions:
  - Send email to: dev@boomcard.bg
```

### Step 3: Configure Performance Monitoring

**Transaction Thresholds:**
```
API Endpoints:
  - POST /api/auth/login: 500ms threshold
  - POST /api/auth/register: 1000ms threshold
  - POST /api/payments/create: 2000ms threshold
  - POST /api/receipts/submit: 3000ms threshold
  - GET /api/wallet/balance: 200ms threshold
```

**Alert on Slow Transactions:**
```
Alert Rule: When p95 duration is more than 2x threshold
Actions:
  - Send email to: devops@boomcard.bg
  - Attach transaction sample
```

### Step 4: Source Maps (Frontend)

**For Vercel (Already configured via environment):**
```bash
# Verify source maps are uploaded
# Check Sentry releases in dashboard
# Should see commit SHA and source maps

# If not configured:
cd partner-dashboard
npm install --save-dev @sentry/vite-plugin
# Add to vite.config.ts (already done)
```

### Step 5: Mobile App Integration

**iOS:**
```bash
cd boomcard-mobile
# Install Sentry SDK
npm install @sentry/react-native

# Configure in App.tsx (optional for later)
```

**Android:**
```bash
# Same as iOS
# Source maps automatically uploaded by EAS Build
```

---

## 3. Log Management (Better Stack / Logtail)

### Step 1: Create Account (Optional)

1. Go to https://betterstack.com/logtail
2. Sign up for free account (1GB/month free)
3. Create new source: "BoomCard Backend"

### Step 2: Configure Backend Logging

**Install Winston Logtail Transport:**
```bash
cd backend-api
npm install @logtail/node @logtail/winston
```

**Update Logger Configuration:**
```typescript
// backend-api/src/utils/logger.ts
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN!);

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new LogtailTransport(logtail), // Add this
  ],
});
```

**Add Environment Variable:**
```bash
# Render → Environment
LOGTAIL_SOURCE_TOKEN=your_token_here
```

### Step 3: Configure Alerts

**Log-based Alerts:**
- High error rate (>10 errors/minute)
- Payment failures (tag: payment)
- Database errors (tag: database)
- Authentication failures (>5/minute from same IP)

---

## 4. Application Performance Monitoring (Optional)

### New Relic (Alternative to Sentry Performance)

**Step 1: Create Account**
1. Go to https://newrelic.com
2. Sign up for free account
3. Create new application: "BoomCard API"

**Step 2: Install Agent**
```bash
cd backend-api
npm install newrelic
```

**Step 3: Configure**
```javascript
// backend-api/newrelic.js
'use strict'

exports.config = {
  app_name: ['BoomCard API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  },
  distributed_tracing: {
    enabled: true
  }
}
```

**Step 4: Import in Server**
```typescript
// backend-api/src/server.ts (first line)
import 'newrelic'; // Must be first import
```

---

## 5. Database Monitoring

### PostgreSQL Monitoring (Render Built-in)

**Step 1: Access Render Dashboard**
1. Go to https://dashboard.render.com
2. Select PostgreSQL instance
3. Click "Metrics" tab

**Monitor:**
- Connection count
- Database size
- Query performance
- Memory usage
- CPU usage

**Set Alerts:**
```
Alert when:
  - Connection count > 80% of max
  - Database size > 90% of plan limit
  - CPU usage > 80% for 5 minutes
```

### Custom Database Monitoring

**Script to Monitor Database:**
```bash
#!/bin/bash
# scripts/monitor-database.sh

# Database metrics endpoint
curl -s https://api.boomcard.bg/api/health/metrics | jq '{
  users: .database.users,
  venues: .database.venues,
  receipts: .database.receipts,
  transactions: .database.transactions,
  memory: .memory.heapUsed
}'
```

---

## 6. Payment Monitoring

### Paysera Transaction Monitoring

**Custom Dashboard Queries:**
```sql
-- Payment success rate (last 24 hours)
SELECT
  COUNT(*) FILTER (WHERE status = 'COMPLETED') * 100.0 / COUNT(*) as success_rate,
  COUNT(*) as total_payments,
  COUNT(*) FILTER (WHERE status = 'FAILED') as failed_payments
FROM "Transaction"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
  AND type = 'TOP_UP';

-- Average payment amount
SELECT
  AVG(amount) as avg_amount,
  SUM(amount) as total_amount,
  currency
FROM "Transaction"
WHERE status = 'COMPLETED'
  AND "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY currency;

-- Payment processing time
SELECT
  AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))) as avg_seconds
FROM "Transaction"
WHERE status = 'COMPLETED'
  AND "createdAt" > NOW() - INTERVAL '24 hours';
```

**Create Alerts:**
- Payment success rate < 95%
- Average processing time > 120 seconds
- Failed payment spike (>10 in 1 hour)

---

## 7. Mobile App Monitoring

### Crash Reporting (Sentry)

**Configure Sentry for Mobile:**
```typescript
// boomcard-mobile/App.tsx
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 1.0,
});
```

### App Store Connect (iOS)

**Monitor:**
1. Crash Rate
2. App Hangs
3. Battery Usage
4. Launch Time

**Access:**
- App Store Connect → Analytics → Crashes

### Google Play Console (Android)

**Monitor:**
1. Crash Rate (ANRs)
2. Stability Metrics
3. Performance Metrics

**Access:**
- Play Console → Quality → Android Vitals

---

## 8. User Analytics (Optional)

### PostHog (Open Source Analytics)

**Step 1: Create Account**
1. Go to https://posthog.com
2. Sign up (self-hosted or cloud)
3. Create new project: "BoomCard"

**Step 2: Install SDK**

**Backend:**
```bash
npm install posthog-node
```

```typescript
// Track events
posthog.capture({
  distinctId: user.id,
  event: 'receipt_submitted',
  properties: {
    amount: receipt.amount,
    venue: receipt.venueId,
  },
});
```

**Mobile:**
```bash
npm install posthog-react-native
```

**Track Key Events:**
- User registration
- Receipt submission
- Payment completion
- QR sticker scan
- Cashback earned

---

## 9. Monitoring Scripts

### Health Check Script

```bash
#!/bin/bash
# scripts/check-health.sh

echo "🏥 BoomCard Platform Health Check"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Backend API
echo "Checking Backend API..."
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.boomcard.bg/api/health)
if [ "$BACKEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Backend API: OK${NC}"
else
    echo -e "${RED}✗ Backend API: DOWN (HTTP $BACKEND_STATUS)${NC}"
fi

# Check Database
echo "Checking Database..."
DB_STATUS=$(curl -s https://api.boomcard.bg/api/health/ready | jq -r '.status')
if [ "$DB_STATUS" = "ready" ]; then
    echo -e "${GREEN}✓ Database: Connected${NC}"
else
    echo -e "${RED}✗ Database: Disconnected${NC}"
fi

# Check Frontend
echo "Checking Frontend..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://dashboard.boomcard.bg)
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Frontend: OK${NC}"
else
    echo -e "${RED}✗ Frontend: DOWN (HTTP $FRONTEND_STATUS)${NC}"
fi

# Get Metrics
echo ""
echo "System Metrics:"
curl -s https://api.boomcard.bg/api/health/metrics | jq '{
  uptime: .uptime,
  users: .database.users,
  receipts: .database.receipts,
  transactions: .database.transactions
}'

echo ""
echo "===================================="
echo "Health check complete!"
```

### Monitoring Dashboard Script

```bash
#!/bin/bash
# scripts/monitoring-dashboard.sh

# Install: npm install -g blessed blessed-contrib

node << 'DASHBOARD_EOF'
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const axios = require('axios');

const screen = blessed.screen();
const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

// Line chart for response times
const responseTimeLine = grid.set(0, 0, 4, 6, contrib.line, {
  label: 'API Response Time (ms)',
  showLegend: true,
});

// Bar chart for request counts
const requestBar = grid.set(4, 0, 4, 6, contrib.bar, {
  label: 'Requests/min by Endpoint',
  barWidth: 4,
  barSpacing: 6,
  maxHeight: 9,
});

// Table for recent errors
const errorTable = grid.set(8, 0, 4, 12, contrib.table, {
  keys: true,
  label: 'Recent Errors',
  columnWidth: [10, 40, 20],
});

// Donut for system health
const healthDonut = grid.set(0, 6, 4, 6, contrib.donut, {
  label: 'System Health',
  radius: 8,
  arcWidth: 3,
});

// Gauge for memory usage
const memoryGauge = grid.set(4, 6, 4, 3, contrib.gauge, {
  label: 'Memory Usage',
});

// Gauge for database connections
const dbGauge = grid.set(4, 9, 4, 3, contrib.gauge, {
  label: 'DB Connections',
});

// Refresh data every 5 seconds
async function refreshData() {
  try {
    const metrics = await axios.get('https://api.boomcard.bg/api/health/metrics');
    const health = await axios.get('https://api.boomcard.bg/api/health/detailed');

    // Update memory gauge
    const memPercent = (metrics.data.memory.heapUsed / metrics.data.memory.heapTotal) * 100;
    memoryGauge.setPercent(Math.round(memPercent));

    // Update health donut
    const healthData = health.data.checks;
    const okCount = Object.values(healthData).filter(c => c.status === 'ok').length;
    const totalCount = Object.values(healthData).length;
    healthDonut.setData([
      {percent: (okCount/totalCount) * 100, label: 'Healthy', color: 'green'},
      {percent: ((totalCount-okCount)/totalCount) * 100, label: 'Issues', color: 'red'},
    ]);

    screen.render();
  } catch (error) {
    console.error('Failed to fetch data:', error.message);
  }
}

// Initial load
refreshData();

// Refresh every 5 seconds
setInterval(refreshData, 5000);

// Quit on Escape, q, or Control-C
screen.key(['escape', 'q', 'C-c'], function() {
  process.exit(0);
});

screen.render();
DASHBOARD_EOF
```

---

## 10. Alert Notification Channels

### Slack Integration

**Step 1: Create Slack Webhook**
1. Slack → Apps → Incoming Webhooks
2. Add to channel: #alerts
3. Copy webhook URL

**Step 2: Configure Notifications**

**UptimeRobot:**
- Add Alert Contact → Webhook
- Paste Slack webhook URL

**Sentry:**
- Project Settings → Integrations → Slack
- Connect workspace
- Select channel: #alerts

**Custom Alerts (from backend):**
```typescript
// utils/slack.ts
import axios from 'axios';

export async function sendSlackAlert(message: string, severity: 'info' | 'warning' | 'error') {
  const colors = {
    info: '#36a64f',
    warning: '#ff9900',
    error: '#ff0000',
  };

  await axios.post(process.env.SLACK_WEBHOOK_URL!, {
    attachments: [{
      color: colors[severity],
      title: 'BoomCard Alert',
      text: message,
      footer: 'BoomCard Monitoring',
      ts: Math.floor(Date.now() / 1000),
    }],
  });
}

// Usage:
sendSlackAlert('Payment success rate dropped below 95%', 'error');
```

### Email Alerts

**Configure Email Alerts:**
- UptimeRobot → Alert Contacts → Email
- Sentry → Project Settings → Alerts → Email
- Render → Service Settings → Notifications

**Email Recipients:**
- devops@boomcard.bg (all alerts)
- dev@boomcard.bg (errors only)
- product@boomcard.bg (critical only)

### PagerDuty / OpsGenie (Optional)

**For 24/7 On-Call:**
1. Create PagerDuty account
2. Create service: "BoomCard Production"
3. Configure escalation policy
4. Integrate with:
   - UptimeRobot (via email)
   - Sentry (native integration)
   - Custom webhooks

---

## 11. Monitoring Checklist

### Initial Setup (One-time)

- [ ] UptimeRobot account created
- [ ] 4 monitors configured (API health, detailed, ready, frontend)
- [ ] Alert contacts added (email, Slack)
- [ ] Status page created (optional)
- [ ] Sentry alerts configured (3+ rules)
- [ ] Sentry performance thresholds set
- [ ] Database monitoring enabled (Render dashboard)
- [ ] Health check script created and tested
- [ ] Monitoring dashboard script created (optional)
- [ ] Slack webhook configured
- [ ] Email alerts configured

### Daily Checks

- [ ] Check UptimeRobot dashboard (uptime %)
- [ ] Review Sentry errors (any new issues?)
- [ ] Check database metrics (connection count, size)
- [ ] Review payment success rate
- [ ] Check API response times

### Weekly Checks

- [ ] Review Sentry performance trends
- [ ] Check log volume (Better Stack)
- [ ] Review slow transactions
- [ ] Check mobile app crash rates
- [ ] Review alert accuracy (false positives?)

### Monthly Checks

- [ ] Review monitoring costs
- [ ] Update alert thresholds if needed
- [ ] Archive old logs
- [ ] Review incident reports
- [ ] Update monitoring documentation

---

## 12. Monitoring Costs

| Service | Plan | Cost | Features |
|---------|------|------|----------|
| **UptimeRobot** | Free | $0 | 50 monitors, 5-min intervals |
| **Sentry** | Team | $26/month | Error tracking, performance |
| **Better Stack** | Free | $0 | 1GB logs/month |
| **Render Monitoring** | Included | $0 | Built-in metrics |
| **New Relic** | Free | $0 | 100GB/month (optional) |
| **PostHog** | Free | $0 | 1M events/month (optional) |

**Total Estimated Cost:** $26-50/month

---

## 13. Next Steps After Setup

1. **Test All Alerts**
   ```bash
   # Trigger test alert by stopping backend
   # Verify UptimeRobot sends notification
   # Verify Slack receives message
   ```

2. **Create Monitoring Dashboard**
   - Aggregate all metrics in one place
   - Share with team
   - Display on office screen (optional)

3. **Document Baseline Metrics**
   - Current response times
   - Current error rate
   - Current uptime %
   - Use as comparison for future

4. **Train Team**
   - Show team where to check status
   - Explain alert severity levels
   - Practice incident response

5. **Schedule Review**
   - Weekly monitoring review meeting
   - Monthly metrics report
   - Quarterly cost/benefit analysis

---

**Setup Guide Owner:** DevOps Team
**Last Updated:** November 4, 2025
**Next Review:** December 4, 2025

**Generated with [Claude Code](https://claude.com/claude-code)**
