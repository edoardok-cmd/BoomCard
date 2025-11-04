# BoomCard Platform - Operational Runbook

**Version:** 1.0.0
**Last Updated:** November 4, 2025
**For:** Production Operations Team

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Health Checks & Monitoring](#health-checks--monitoring)
4. [Deployment Procedures](#deployment-procedures)
5. [Incident Response](#incident-response)
6. [Common Issues & Solutions](#common-issues--solutions)
7. [Maintenance Tasks](#maintenance-tasks)
8. [Backup & Recovery](#backup--recovery)
9. [Security Procedures](#security-procedures)
10. [Contacts & Escalation](#contacts--escalation)

---

## System Overview

### Platform Components

**Backend API** (Node.js + Express)
- **URL:** https://api.boomcard.bg
- **Hosting:** Render.com
- **Database:** PostgreSQL (Render)
- **Storage:** AWS S3 (eu-central-1)
- **Port:** 3001

**Frontend Dashboard** (React + Vite)
- **URL:** https://dashboard.boomcard.bg
- **Hosting:** Vercel
- **CDN:** Vercel Edge Network

**Mobile App** (React Native + Expo)
- **iOS:** App Store
- **Android:** Google Play Store
- **Update Mechanism:** EAS Updates (OTA)

### Key Services

- **Payment Gateway:** Paysera (https://www.paysera.com)
- **Email Service:** Resend (when domain configured)
- **Error Tracking:** Sentry (configured)
- **File Storage:** AWS S3

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Users                                │
│  Web Browser          iOS App          Android App          │
└────────────┬──────────────┬──────────────────┬──────────────┘
             │              │                  │
             │              │                  │
             ▼              ▼                  ▼
┌────────────────────┐ ┌──────────────────────────────────┐
│  Frontend Dashboard│ │      Mobile App                  │
│  (Vercel)          │ │      (Expo/React Native)         │
│  dashboard.boomcard│ │                                  │
└────────────┬───────┘ └─────────────┬────────────────────┘
             │                       │
             └───────────┬───────────┘
                         │
                         ▼
           ┌─────────────────────────────┐
           │    Backend API               │
           │    (Render.com)              │
           │    api.boomcard.bg          │
           │    - Express.js             │
           │    - JWT Auth               │
           │    - RESTful API            │
           └──────────┬──────────────────┘
                      │
       ┌──────────────┼──────────────┬──────────────┐
       │              │              │              │
       ▼              ▼              ▼              ▼
┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL │  │  AWS S3  │  │ Paysera  │  │  Resend  │
│ Database  │  │  Images  │  │ Payments │  │  Email   │
│ (Render)  │  │          │  │          │  │          │
└───────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Data Flow

**User Registration:**
```
Mobile/Web → POST /api/auth/register → Database → JWT Token → Client
```

**Receipt Submission:**
```
Mobile → Camera → Image → POST /api/receipts/submit → S3 Upload → Database → Cashback Calculation → Wallet Update
```

**Payment Flow:**
```
Mobile/Web → POST /api/payments/create → Paysera API → Payment URL → User Pays → Webhook → POST /api/payments/callback → Signature Verification → Wallet Update → Email Notification
```

---

## Health Checks & Monitoring

### Health Endpoints

#### Basic Health Check
```bash
curl https://api.boomcard.bg/health
```

**Expected Response (200):**
```json
{
  "status": "ok",
  "message": "BoomCard API is running",
  "timestamp": "2025-11-04T12:00:00.000Z",
  "uptime": 86400,
  "environment": "production"
}
```

#### Detailed Health Check
```bash
curl https://api.boomcard.bg/api/health/detailed
```

**Expected Response (200):**
```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "responseTime": 15 },
    "redis": { "status": "not_configured", "responseTime": 0 },
    "s3": { "status": "configured" },
    "paysera": { "status": "configured" },
    "email": { "status": "configured" }
  }
}
```

**Degraded Response (503):**
```json
{
  "status": "unhealthy",
  "checks": {
    "database": { "status": "error", "error": "Connection timeout" }
  }
}
```

#### Readiness Check
```bash
curl https://api.boomcard.bg/api/health/ready
```

Used by load balancers. Returns 200 when ready to accept traffic.

#### Liveness Check
```bash
curl https://api.boomcard.bg/api/health/live
```

Used by orchestrators. Returns 200 if process is alive.

#### Metrics Endpoint
```bash
curl https://api.boomcard.bg/api/health/metrics
```

**Response:**
```json
{
  "timestamp": "2025-11-04T12:00:00.000Z",
  "uptime": 86400,
  "memory": {
    "rss": 123456789,
    "heapTotal": 98765432,
    "heapUsed": 87654321
  },
  "database": {
    "users": 1250,
    "venues": 150,
    "receipts": 5420,
    "transactions": 8920
  }
}
```

### Monitoring Setup

#### Uptime Monitoring
- **Service:** UptimeRobot / Pingdom
- **URL:** https://api.boomcard.bg/api/health
- **Interval:** Every 5 minutes
- **Alert:** Email/SMS on downtime

#### Performance Monitoring
- **Service:** Sentry Performance Monitoring
- **Configured:** Yes
- **DSN:** In environment variables
- **Alerts:** Slow transactions (>2s), errors

#### Error Tracking
- **Service:** Sentry
- **Configured:** Yes
- **Environment:** Production
- **Alerts:** Email on new issues

### Key Metrics to Monitor

**API Performance:**
- Response time < 500ms (95th percentile)
- Error rate < 1%
- Uptime > 99.9%

**Database:**
- Connection pool utilization < 80%
- Query response time < 100ms (average)
- Active connections < max pool size

**Payment Processing:**
- Payment success rate > 95%
- Payment response time < 2s
- Webhook processing < 200ms

---

## Deployment Procedures

### Backend Deployment (Render.com)

#### Automatic Deployment (Git Push)
```bash
# 1. Make changes
git add .
git commit -m "Your changes"

# 2. Push to master branch
git push origin master

# 3. Render automatically deploys
# Check: https://dashboard.render.com
```

**Deployment Time:** 3-5 minutes

#### Manual Deployment
1. Go to https://dashboard.render.com
2. Select "boomcard-backend-api" service
3. Click "Manual Deploy" → "Clear build cache & deploy"
4. Wait for deployment to complete
5. Verify health checks

#### Rollback Procedure
```bash
# If deployment fails, rollback to previous commit
git revert HEAD
git push origin master

# Or use Render dashboard:
# Dashboard → Service → "Rollback to previous deploy"
```

### Frontend Deployment (Vercel)

#### Automatic Deployment (Git Push)
```bash
# 1. Make changes
cd partner-dashboard
git add .
git commit -m "Your changes"

# 2. Push to master branch
git push origin master

# 3. Vercel automatically deploys
# Check: https://vercel.com/dashboard
```

**Deployment Time:** 1-2 minutes

#### Manual Deployment
```bash
# Using Vercel CLI
npm install -g vercel
cd partner-dashboard
vercel --prod
```

### Mobile App Deployment

#### Over-The-Air (OTA) Updates
For minor changes (JS code, assets):
```bash
cd boomcard-mobile
eas update --branch production
```

**Update Time:** Instant
**Applies to:** Users on next app restart

#### Full App Store Update
For native changes (dependencies, permissions):
```bash
# 1. Update version in app.json
# "version": "1.0.1"

# 2. Build new version
npm run build:prod:all

# 3. Submit to stores
npm run submit:all

# 4. Wait for review (1-7 days)
```

### Database Migrations

#### Run Migration
```bash
cd backend-api
npx prisma migrate deploy

# Or use Render shell:
# Render Dashboard → Service → Shell → npx prisma migrate deploy
```

#### Rollback Migration
```bash
# Restore database backup first
# Then run previous migrations
npx prisma migrate resolve --rolled-back "MIGRATION_NAME"
```

---

## Incident Response

### Severity Levels

**P1 - Critical (Response: Immediate)**
- Complete system outage
- Payment processing down
- Data breach/security incident
- Database corruption

**P2 - High (Response: < 1 hour)**
- Partial system outage
- Payment delays
- Major feature broken
- High error rate (>5%)

**P3 - Medium (Response: < 4 hours)**
- Minor feature broken
- Performance degradation
- Non-critical API errors

**P4 - Low (Response: < 24 hours)**
- Cosmetic issues
- Documentation errors
- Minor UI bugs

### Incident Response Procedure

#### Step 1: Acknowledge & Assess
```
1. Acknowledge incident in monitoring system
2. Assess severity level
3. Check health endpoints:
   - https://api.boomcard.bg/api/health/detailed
4. Check Sentry for errors
5. Check Render logs
```

#### Step 2: Communicate
```
P1/P2: Immediate notification to:
- Development team
- Product owner
- Affected users (if needed)

Status page update (if available)
```

#### Step 3: Investigate
```
1. Check logs:
   - Render logs: https://dashboard.render.com → Logs
   - Sentry: https://sentry.io
2. Check database status
3. Check third-party services (Paysera, AWS)
4. Check recent deployments
```

#### Step 4: Resolve
```
1. Apply fix (hotfix or rollback)
2. Verify fix with health checks
3. Monitor for recurrence
4. Document root cause
```

#### Step 5: Post-Mortem
```
1. Write incident report
2. Identify root cause
3. Plan preventive measures
4. Update runbook if needed
```

---

## Common Issues & Solutions

### Issue 1: API Returns 503 (Service Unavailable)

**Symptoms:**
- Health check fails
- All API requests return 503
- Mobile app shows "Network Error"

**Diagnosis:**
```bash
# Check health endpoint
curl https://api.boomcard.bg/api/health/detailed

# Check database connection
curl https://api.boomcard.bg/api/health/ready

# Check Render service status
# Visit: https://dashboard.render.com
```

**Solutions:**

**A. Database Connection Issue:**
```bash
# Restart database
# Render Dashboard → PostgreSQL → Restart

# Or restart API service
# Render Dashboard → Service → Manual Deploy
```

**B. Out of Memory:**
```bash
# Check memory usage in Render logs
# Upgrade instance size if needed
# Render Dashboard → Service → Settings → Instance Type
```

**C. Deployment Failed:**
```bash
# Rollback to previous deploy
# Render Dashboard → Service → Rollback
```

### Issue 2: Payments Not Processing

**Symptoms:**
- Payment stuck in "Processing"
- Webhook not received
- Balance not updating

**Diagnosis:**
```bash
# Check payment status in database
psql $DATABASE_URL
SELECT * FROM "Transaction" WHERE "orderId" = 'BOOM-XXX' LIMIT 1;

# Check Paysera webhook logs
# Backend logs for POST /api/payments/callback

# Check Sentry for errors
```

**Solutions:**

**A. Webhook Signature Failed:**
```sql
-- Check transaction status
SELECT "id", "orderId", "status", "amount", "createdAt"
FROM "Transaction"
WHERE "orderId" = 'BOOM-XXX';

-- If payment completed on Paysera but not updated:
UPDATE "Transaction"
SET "status" = 'COMPLETED', "updatedAt" = NOW()
WHERE "orderId" = 'BOOM-XXX';

-- Update wallet balance
UPDATE "Wallet"
SET "balance" = "balance" + 20.00
WHERE "userId" = 'USER-ID';
```

**B. Paysera Service Down:**
```bash
# Check Paysera status
curl https://www.paysera.com/

# Contact Paysera support if needed
```

**C. Network Issue:**
```bash
# Test Paysera connectivity from Render
# Render Dashboard → Service → Shell
curl -I https://www.paysera.com/
```

### Issue 3: Mobile App Not Connecting

**Symptoms:**
- "Network Error" in mobile app
- Cannot login
- API calls fail

**Diagnosis:**
```bash
# Check if API is accessible
curl https://api.boomcard.bg/health

# Check CORS settings
curl -H "Origin: https://app.boomcard.bg" https://api.boomcard.bg/health

# Check mobile app API URL
# Should be: https://api.boomcard.bg
```

**Solutions:**

**A. CORS Issue:**
```bash
# Update CORS_ORIGIN environment variable
# Render Dashboard → Service → Environment
# Add mobile app domain if needed
```

**B. API Down:**
```bash
# Restart API service
# Render Dashboard → Service → Manual Deploy
```

**C. Mobile App Cache:**
```bash
# Users should:
# 1. Force quit app
# 2. Clear app cache (iOS: Settings → BoomCard)
# 3. Relaunch app
```

### Issue 4: Receipt Upload Fails

**Symptoms:**
- Upload progress stuck
- "Upload failed" error
- Receipt not appearing in list

**Diagnosis:**
```bash
# Check S3 connectivity
aws s3 ls s3://boomcard-receipts/ --profile boomcard

# Check file size limits
# Max: 10MB configured

# Check logs for S3 errors
```

**Solutions:**

**A. S3 Credentials Expired:**
```bash
# Update AWS credentials
# Render Dashboard → Service → Environment
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
```

**B. File Too Large:**
```bash
# Image compression should happen client-side
# Check mobile app image compression settings
```

**C. S3 Bucket Permission Issue:**
```bash
# Check S3 bucket policy
aws s3api get-bucket-policy --bucket boomcard-receipts
```

### Issue 5: Database Connection Pool Exhausted

**Symptoms:**
- Slow API responses
- "No available connections" errors
- Timeouts

**Diagnosis:**
```sql
-- Check active connections
SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active';

-- Check max connections
SHOW max_connections;
```

**Solutions:**

**A. Increase Connection Pool:**
```bash
# Update DATABASE_URL with connection_limit
DATABASE_URL="postgresql://...?connection_limit=20"

# Restart service
```

**B. Kill Long-Running Queries:**
```sql
-- Find long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query_start < now() - interval '5 minutes';

-- Kill if necessary
SELECT pg_terminate_backend(pid);
```

---

## Maintenance Tasks

### Daily Tasks

**Monitor Health Checks:**
```bash
# Check all health endpoints
curl https://api.boomcard.bg/api/health/detailed
curl https://dashboard.boomcard.bg

# Check Sentry for new errors
# https://sentry.io
```

**Check Metrics:**
```bash
# User growth, transaction volume
curl https://api.boomcard.bg/api/health/metrics
```

### Weekly Tasks

**Database Maintenance:**
```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('boomcard'));

-- Check table sizes
SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Vacuum analyze
VACUUM ANALYZE;
```

**Log Review:**
```bash
# Review error logs
# Render Dashboard → Logs → Filter by "ERROR"

# Review payment logs
# Check for failed payments
```

### Monthly Tasks

**Security Updates:**
```bash
# Update dependencies
cd backend-api
npm outdated
npm update

cd partner-dashboard
npm outdated
npm update

cd boomcard-mobile
npm outdated
npm update
```

**Database Backup Verification:**
```bash
# Verify latest backup exists
# Render Dashboard → PostgreSQL → Backups

# Test restore procedure (staging environment)
```

**Performance Review:**
```bash
# Review slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

# Review API response times
# Sentry → Performance
```

### Quarterly Tasks

**Disaster Recovery Drill:**
```bash
# Test complete system recovery from backups
# Document time to recover
# Update recovery procedures
```

**Security Audit:**
```bash
# Run security scan
npm audit

# Review access logs
# Check for suspicious activity

# Review and rotate secrets
# Update Paysera API keys, AWS keys, etc.
```

**Capacity Planning:**
```bash
# Review growth metrics
# Estimate future resource needs
# Plan upgrades if necessary
```

---

## Backup & Recovery

### Database Backups

**Automatic Backups (Render):**
- **Frequency:** Daily
- **Retention:** 7 days
- **Location:** Render.com managed

**Manual Backup:**
```bash
# Create manual backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Or use Render dashboard
# PostgreSQL → Create Backup
```

**Restore from Backup:**
```bash
# Restore from SQL file
psql $DATABASE_URL < backup_20251104.sql

# Or use Render dashboard
# PostgreSQL → Restore from Backup
```

### File Storage Backups (S3)

**Backup Strategy:**
- S3 Versioning: Enabled
- Lifecycle policy: Archive to Glacier after 90 days
- Cross-region replication: Not enabled (optional)

**Manual Backup:**
```bash
# Sync S3 bucket to local
aws s3 sync s3://boomcard-receipts ./backup/receipts/

# Or to another bucket
aws s3 sync s3://boomcard-receipts s3://boomcard-receipts-backup/
```

### Configuration Backups

**Environment Variables:**
```bash
# Export from Render
# Dashboard → Service → Environment → Export

# Or use CLI
render env list --service boomcard-backend-api > env_backup.txt
```

### Recovery Time Objectives (RTO)

| Component | RTO | RPO | Priority |
|-----------|-----|-----|----------|
| Backend API | 15 minutes | 5 minutes | Critical |
| Frontend | 5 minutes | 0 (Git) | High |
| Database | 30 minutes | 24 hours | Critical |
| File Storage | 1 hour | 0 (S3) | Medium |
| Mobile App | 24 hours | N/A | Low |

### Disaster Recovery Procedure

**Scenario: Complete Backend Failure**

1. **Assess Damage** (5 minutes)
   - Determine cause
   - Check if database intact
   - Check if files intact

2. **Restore Database** (30 minutes)
   - Create new PostgreSQL instance
   - Restore from latest backup
   - Verify data integrity

3. **Deploy Backend** (15 minutes)
   - Create new Render service
   - Configure environment variables
   - Deploy from Git
   - Run migrations if needed

4. **Restore S3 Access** (10 minutes)
   - Verify AWS credentials
   - Test file uploads

5. **Verify System** (10 minutes)
   - Test health checks
   - Test authentication
   - Test payment flow
   - Test receipt upload

6. **Update DNS** (if needed)
   - Point api.boomcard.bg to new instance
   - Wait for DNS propagation (5-30 minutes)

**Total Recovery Time:** ~70 minutes

---

## Security Procedures

### Access Control

**Production Access:**
- **Backend:** Render.com team members only
- **Database:** Via Render dashboard or psql with connection string
- **S3:** AWS IAM users with minimal permissions
- **Frontend:** Vercel team members only

**Principle of Least Privilege:**
- Developers: Read-only access to production logs
- DevOps: Full access to production systems
- Support: Read-only access to user data

### Secret Rotation

**Quarterly Rotation:**
- JWT_SECRET
- JWT_REFRESH_SECRET
- Paysera API credentials
- AWS access keys
- Database passwords

**Rotation Procedure:**
```bash
# 1. Generate new secret
openssl rand -base64 32

# 2. Update in Render environment
# Dashboard → Service → Environment

# 3. Restart service

# 4. Verify health checks

# 5. Document rotation in security log
```

### Security Incident Response

**Step 1: Contain**
- Block compromised accounts
- Revoke leaked credentials
- Enable additional logging

**Step 2: Investigate**
- Review access logs
- Identify scope of breach
- Preserve evidence

**Step 3: Remediate**
- Patch vulnerabilities
- Rotate all secrets
- Notify affected users

**Step 4: Report**
- Document incident
- Notify stakeholders
- Submit breach report (if required by law)

### Security Monitoring

**Alerts:**
- Failed login attempts (>5 in 5 minutes)
- Unusual API traffic patterns
- Database access from unknown IPs
- S3 bucket policy changes

---

## Contacts & Escalation

### Support Contacts

**Development Team:**
- Email: dev@boomcard.bg
- Slack: #dev-team
- On-call: [Phone Number]

**DevOps:**
- Email: devops@boomcard.bg
- Pager: [PagerDuty/OpsGenie]
- On-call: [Phone Number]

**Product Owner:**
- Email: product@boomcard.bg
- Phone: [Phone Number]

### Third-Party Support

**Render.com:**
- Support: https://render.com/docs/support
- Status: https://status.render.com
- Email: support@render.com

**Paysera:**
- Support: https://www.paysera.com/contact
- Email: support@paysera.com
- Phone: [Support Number]

**AWS:**
- Support: https://console.aws.amazon.com/support
- Documentation: https://docs.aws.amazon.com

**Sentry:**
- Support: https://sentry.io/support
- Status: https://status.sentry.io

### Escalation Matrix

| Severity | Initial Response | Escalation (15 min) | Escalation (30 min) |
|----------|------------------|---------------------|---------------------|
| P1 | DevOps On-Call | Development Team Lead | CTO |
| P2 | DevOps On-Call | Development Team Lead | Product Owner |
| P3 | Developer | Development Team Lead | - |
| P4 | Developer | - | - |

---

## Appendix

### Environment Variables Reference

**Backend (Render):**
```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# API
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://dashboard.boomcard.bg,https://app.boomcard.bg

# JWT
JWT_SECRET=xxx
JWT_REFRESH_SECRET=xxx

# Paysera
PAYSERA_PROJECT_ID=xxx
PAYSERA_SIGN_PASSWORD=xxx
PAYSERA_API_URL=https://www.paysera.com/pay
PAYSERA_TEST_MODE=false

# AWS S3
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=eu-central-1
AWS_S3_BUCKET=boomcard-receipts

# Email
RESEND_API_KEY=xxx
RESEND_FROM_EMAIL=noreply@boomcard.bg

# Sentry
SENTRY_DSN=xxx
```

### Useful Commands

```bash
# Check API health
curl https://api.boomcard.bg/api/health/detailed

# Check database connections
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_stat_activity;"

# Tail logs
# Render Dashboard → Service → Logs (real-time)

# Run migration
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Check S3 bucket size
aws s3 ls --summarize --human-readable --recursive s3://boomcard-receipts

# Test email sending (when configured)
curl -X POST https://api.boomcard.bg/api/test/email \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "test@boomcard.bg"}'
```

---

**Document Owner:** DevOps Team
**Review Cycle:** Quarterly
**Last Reviewed:** November 4, 2025

**Generated with [Claude Code](https://claude.com/claude-code)**
