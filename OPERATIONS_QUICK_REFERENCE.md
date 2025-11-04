# BoomCard Platform - Operations Quick Reference

**Version:** 1.0.0
**Last Updated:** November 4, 2025
**For:** DevOps, SRE, On-Call Engineers

---

## 🚨 Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| **On-Call Engineer** | [Slack: #on-call] | 24/7 |
| **DevOps Lead** | [Phone/Email] | 08:00-24:00 |
| **Tech Lead** | [Phone/Email] | 08:00-20:00 |
| **Emergency Escalation** | [CEO Phone] | 24/7 |

**Escalation Path:** On-Call → DevOps Lead (15 min) → Tech Lead (30 min) → CEO (60 min)

---

## 🔗 Critical URLs

### Production
```
Backend API:    https://api.boomcard.bg
Frontend:       https://dashboard.boomcard.bg
Database:       [Render PostgreSQL Dashboard]
Monitoring:     https://uptimerobot.com
Error Tracking: https://sentry.io
```

### Dashboards
```
Render:         https://dashboard.render.com
Vercel:         https://vercel.com/dashboard
App Store:      https://appstoreconnect.apple.com
Play Console:   https://play.google.com/console
```

---

## 🏥 Health Checks (Production)

### Quick Health Check
```bash
curl https://api.boomcard.bg/api/health
```
**Expected:** `{"status":"ok",...}`

### Detailed System Health
```bash
curl https://api.boomcard.bg/api/health/detailed | jq
```
**Check:** All `status` fields should be `"ok"` or `"configured"`

### Database Connectivity
```bash
curl https://api.boomcard.bg/api/health/ready
```
**Expected:** `{"status":"ready"}`

### Full Verification
```bash
./scripts/verify-all.sh production
```

---

## 🔍 Common Issues & Quick Fixes

### Issue 1: API Returns 503

**Symptoms:** API health check fails, frontend can't connect

**Quick Check:**
```bash
curl https://api.boomcard.bg/api/health/detailed
```

**Quick Fix:**
1. Login to [Render Dashboard](https://dashboard.render.com)
2. Find "boomcard-backend" service
3. Click "Manual Deploy" → "Deploy latest commit"
4. Wait 2-3 minutes
5. Verify: `curl https://api.boomcard.bg/api/health`

**If still failing:** Restart the service (Render Dashboard → Settings → Manual Deploy → Restart)

---

### Issue 2: Database Connection Errors

**Symptoms:** `/api/health/detailed` shows database status `"error"`

**Quick Check:**
```bash
curl https://api.boomcard.bg/api/health/detailed | jq '.checks.database'
```

**Quick Fix:**
1. Login to Render Dashboard
2. Navigate to PostgreSQL database
3. Check connection count and status
4. If stuck: Click "Suspend" then "Resume"
5. Verify: `curl https://api.boomcard.bg/api/health/ready`

---

### Issue 3: High Error Rate

**Symptoms:** Sentry alerts, increased 500 errors

**Quick Check:**
1. Open [Sentry Dashboard](https://sentry.io)
2. View recent errors
3. Check error frequency and affected endpoints

**Quick Fix:**
- If error is in latest deploy: **Rollback immediately**
  ```
  Render Dashboard → Deployments → Find last good deploy → "Rollback to this version"
  ```
- If error is in specific feature: Disable feature flag (if applicable)
- If error is external (Paysera, S3): Check service status, wait for recovery

---

### Issue 4: Slow Performance

**Symptoms:** Response times > 1000ms

**Quick Check:**
```bash
time curl https://api.boomcard.bg/api/health
```

**Quick Fix:**
1. Check memory usage:
   ```bash
   curl https://api.boomcard.bg/api/health/metrics | jq '.memory'
   ```
2. If memory > 90%: Restart service (Render Dashboard)
3. If database slow: Check query performance (Render → PostgreSQL → Metrics)
4. Consider upgrading instance size if persistent

---

### Issue 5: Payment Processing Failure

**Symptoms:** Payments failing, user reports

**Quick Check:**
```bash
curl https://api.boomcard.bg/api/health/detailed | jq '.checks.paysera'
```

**Quick Fix:**
1. Verify Paysera status: `curl -I https://www.paysera.com`
2. Check environment variables (Render → Service → Environment):
   - `PAYSERA_PROJECT_ID` - should be set
   - `PAYSERA_SIGN_PASSWORD` - should be set
3. Check recent payment transactions in database
4. If Paysera is down: Post user notification
5. Contact Paysera support if config is correct

---

## 🔄 Common Operations

### Deployment

#### Backend (Automatic via Git Push)
```bash
git push origin master
# Render automatically deploys in ~2-3 minutes
```

**Verify:**
```bash
./backend-api/scripts/verify-deployment.sh production
```

#### Frontend (Automatic via Git Push)
```bash
git push origin master
# Vercel automatically deploys in ~1-2 minutes
```

**Verify:**
```bash
./scripts/verify-frontend.sh production
```

#### Mobile Apps (Manual via EAS)
```bash
cd boomcard-mobile

# Build
eas build --profile production --platform all

# Submit (after build completes)
eas submit --platform ios
eas submit --platform android
```

---

### Rollback

#### Backend Rollback
1. Render Dashboard → "boomcard-backend" service
2. Click "Deployments" tab
3. Find last working deployment
4. Click "Rollback to this version"
5. Wait 2-3 minutes
6. Verify: `curl https://api.boomcard.bg/api/health`

#### Frontend Rollback
1. Vercel Dashboard → "boomcard-dashboard" project
2. Click "Deployments"
3. Find last working deployment
4. Click "⋯" → "Promote to Production"
5. Verify: `curl https://dashboard.boomcard.bg`

---

### View Logs

#### Backend Logs (Real-time)
1. Render Dashboard → "boomcard-backend"
2. Click "Logs" tab
3. Enable "Auto-scroll"
4. Use search to filter errors

#### Frontend Logs
1. Vercel Dashboard → "boomcard-dashboard"
2. Click "Deployments" → Select deployment
3. Click "View Function Logs"

#### Database Logs
1. Render Dashboard → PostgreSQL database
2. Click "Logs" tab
3. Filter by log level (ERROR, WARNING, INFO)

---

### Database Operations

#### Create Backup
1. Render Dashboard → PostgreSQL database
2. Click "Backups" tab
3. Click "Create Backup"
4. Wait for completion
5. Download backup file (optional)

#### Restore from Backup
1. Render Dashboard → PostgreSQL database
2. Click "Backups" tab
3. Find backup to restore
4. Click "Restore" → Confirm
5. Wait for restoration (5-10 minutes)
6. Verify data integrity

#### Connect to Database
```bash
# Get connection string from Render Dashboard
psql "postgresql://user:pass@host:5432/database"

# Or use DATABASE_URL from environment
psql $DATABASE_URL
```

---

### Restart Services

#### Backend Service
```bash
# Via Render Dashboard
Render Dashboard → "boomcard-backend" → Manual Deploy → "Restart"
```

#### Database (Use with caution!)
```bash
# Via Render Dashboard
Render Dashboard → PostgreSQL → Settings → "Suspend" → "Resume"
```

---

## 📊 Monitoring

### UptimeRobot Monitors
- **API Health:** https://api.boomcard.bg/api/health (5 min interval)
- **Frontend:** https://dashboard.boomcard.bg (5 min interval)
- **Database Readiness:** https://api.boomcard.bg/api/health/ready (5 min interval)

### Sentry (Error Tracking)
- **Dashboard:** https://sentry.io/organizations/boomcard
- **Alert Threshold:** > 10 errors/hour = Warning, > 50 errors/hour = Critical

### Key Metrics to Watch
```bash
# Get current metrics
curl https://api.boomcard.bg/api/health/metrics | jq '{
  uptime: .uptime,
  memory_pct: (.memory.heapUsed / .memory.heapTotal * 100),
  users: .database.users,
  transactions: .database.transactions
}'
```

---

## 🔐 Security

### Rotate Secrets (Emergency)

#### JWT Secret Rotation
1. Generate new secret: `openssl rand -base64 32`
2. Render Dashboard → "boomcard-backend" → Environment
3. Update `JWT_SECRET` and `JWT_REFRESH_SECRET`
4. Click "Save Changes"
5. Service auto-restarts
6. ⚠️ **All users will be logged out**

#### Database Password Rotation
1. Render Dashboard → PostgreSQL → Settings
2. Click "Rotate Password"
3. Copy new password
4. Update `DATABASE_URL` in backend service
5. Click "Save Changes"
6. Service auto-restarts

---

## 🧪 Testing

### Quick Smoke Test
```bash
# Run all verification checks
./scripts/verify-all.sh production
```

### Manual Smoke Test
1. Open https://dashboard.boomcard.bg
2. Click "Login"
3. Enter test credentials: `test@boomcard.bg` / [test password]
4. Verify dashboard loads
5. Check wallet balance displays
6. Test navigation (Venues, Receipts, Analytics)
7. Logout

### Performance Test
```bash
# Measure API response time
time curl https://api.boomcard.bg/api/health

# Should be < 500ms
```

---

## 📞 On-Call Procedures

### When You Receive an Alert

**1. Acknowledge (30 seconds)**
- Post in #incidents channel: "🚨 ACKNOWLEDGED: [Alert name] - investigating"
- Open monitoring dashboards

**2. Assess Severity (2 minutes)**
- **P1 (Critical):** System down, payment processing broken, data loss
- **P2 (High):** Degraded performance, high error rate
- **P3 (Medium):** Non-critical feature broken
- **P4 (Low):** Minor issue, no user impact

**3. Quick Diagnosis (5 minutes)**
```bash
# Check health
curl https://api.boomcard.bg/api/health/detailed | jq

# Check logs
# → Render Dashboard → Logs (filter for ERROR)

# Check Sentry
# → https://sentry.io (view recent errors)
```

**4. Resolve or Escalate (15 minutes)**
- **If you can fix:** Apply fix, verify, communicate resolution
- **If you can't fix:** Escalate to DevOps Lead
- **If P1 and stuck:** Escalate immediately, consider rollback

**5. Post-Incident (After resolution)**
- Post resolution in #incidents
- Update incident log
- Schedule post-mortem (for P1/P2)

---

## 🎯 Quick Command Reference

### Health Checks
```bash
# Basic health
curl https://api.boomcard.bg/api/health

# Detailed health
curl https://api.boomcard.bg/api/health/detailed | jq

# Database readiness
curl https://api.boomcard.bg/api/health/ready

# System metrics
curl https://api.boomcard.bg/api/health/metrics | jq
```

### Database Queries
```bash
# Connect to database
psql $DATABASE_URL

# Count users
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"User\";"

# Recent transactions
psql $DATABASE_URL -c "SELECT * FROM \"Transaction\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size(current_database()));"
```

### Git Operations
```bash
# Deploy to production (auto-deploys via Render/Vercel)
git push origin master

# Create hotfix
git checkout -b hotfix/issue-description
# make changes
git commit -m "hotfix: description"
git push origin hotfix/issue-description
# create PR, review, merge to master

# Revert bad commit
git revert <commit-hash>
git push origin master
```

### Log Viewing
```bash
# Render logs (via Dashboard only - no CLI)
# Vercel logs (via Dashboard or CLI)
vercel logs boomcard-dashboard

# Local logs (if running locally)
tail -f backend-api/logs/app.log
```

---

## 📋 Pre-Deployment Checklist

Before any production deployment:

- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Database migrations tested
- [ ] Environment variables verified
- [ ] Backup created
- [ ] Rollback plan ready
- [ ] Monitoring dashboards open
- [ ] On-call engineer notified
- [ ] Deployment window communicated

---

## 📈 Capacity Planning

### Current Limits (Production)
- **Backend Instance:** Standard (1 GB RAM, 0.5 CPU)
- **Database:** Free tier (1 GB storage, 25MB RAM)
- **Vercel:** Hobby tier (100 GB bandwidth/month)

### Upgrade Triggers
- Memory usage > 80% sustained = Upgrade backend instance
- Database storage > 80% = Upgrade database tier
- Bandwidth > 80 GB/month = Upgrade Vercel plan
- Response time > 1s sustained = Investigate optimization or upgrade

### Cost Estimates
- Backend (Standard): ~$7/month
- Database (Starter): ~$7/month
- Vercel (Pro): ~$20/month
- **Total:** ~$34/month for production infrastructure

---

## 🎓 Training Resources

- **Full Operational Runbook:** [OPERATIONAL_RUNBOOK.md](OPERATIONAL_RUNBOOK.md)
- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Launch Day Procedures:** [LAUNCH_DAY_RUNBOOK.md](LAUNCH_DAY_RUNBOOK.md)
- **Monitoring Setup:** [MONITORING_SETUP.md](MONITORING_SETUP.md)
- **Pre-Launch Checklist:** [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md)

---

## 💡 Pro Tips

1. **Always verify after changes:** Run `./scripts/verify-all.sh production` after any deployment
2. **Check logs first:** 90% of issues can be diagnosed from error logs
3. **Don't guess:** Use monitoring data to make decisions
4. **Document incidents:** Every incident is a learning opportunity
5. **When in doubt, ask:** Better to escalate early than struggle alone
6. **Backup before risky operations:** Always create a database backup before migrations
7. **Test in staging first:** Never try unproven fixes directly in production
8. **Keep calm:** Most issues have simple solutions, take a breath and methodically debug

---

**Document Owner:** DevOps Team
**Last Reviewed:** November 4, 2025
**Next Review:** December 4, 2025

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**
