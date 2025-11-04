# BoomCard Platform - Launch Day Runbook

**Version:** 1.0.0
**Launch Date:** [TBD]
**War Room:** Slack #launch
**Emergency Contact:** [Phone Number]

---

## 🚀 Launch Timeline

### T-24 Hours (Day Before)

**14:00** - Pre-Launch Meeting
```
Attendees: Full team
Duration: 30 minutes
Agenda:
  - Final checklist review
  - Role assignments
  - Launch timeline walkthrough
  - Emergency procedures review
```

**16:00** - Final System Verification
```bash
# Run complete health check
./scripts/check-health.sh

# Verify all services
✓ Backend API: https://api.boomcard.bg/api/health
✓ Frontend: https://dashboard.boomcard.bg
✓ Database: Connected
✓ S3: Accessible
✓ Paysera: Configured
```

**17:00** - Create Fresh Database Backup
```bash
# Render Dashboard → PostgreSQL → Create Backup
# Verify backup completed successfully
```

**18:00** - Monitoring Final Check
```bash
# Verify all monitors active
- UptimeRobot: 4 monitors green
- Sentry: Receiving test events
- Slack: Notifications working
```

**19:00** - Team Standdown
```
Get rest! Launch day starts early.
```

---

### T-2 Hours (Launch Day Morning)

**08:00** - War Room Opens
```
Slack: #launch channel active
Zoom: War room open (optional)
Team: All hands on deck
```

**08:15** - System Status Check
```bash
# Backend
curl https://api.boomcard.bg/api/health/detailed | jq

# Frontend
curl -I https://dashboard.boomcard.bg

# Database
psql $DATABASE_URL -c "SELECT 1;"

Expected: All systems operational
```

**08:30** - Mobile App Verification
```
iOS App Store:
  - App status: Ready for Sale
  - Version: 1.0.0
  - All countries enabled

Google Play Store:
  - App status: Published
  - Version: 1.0.0
  - Production track active
```

**08:45** - End-to-End Test
```
Test Account: test@boomcard.bg
Actions:
  1. Register new user ✓
  2. Login ✓
  3. View wallet ✓
  4. Top-up 10 BGN ✓
  5. Payment completes ✓
  6. Balance updates ✓
  7. Submit test receipt ✓
  8. Scan test QR sticker ✓

Result: ALL PASS = GO FOR LAUNCH
```

---

### T-0 (Launch!)

**10:00** - GO/NO-GO Decision

```
Team Poll:
  Tech Lead: GO / NO-GO
  DevOps: GO / NO-GO
  Product: GO / NO-GO
  CEO: GO / NO-GO

Decision: ____________

If NO-GO: Follow postponement procedure
If GO: Proceed to launch!
```

**10:05** - Publish Mobile Apps

**iOS:**
```
1. App Store Connect
2. Select "BoomCard" app
3. Click "Release This Version"
4. Confirm release
5. Status changes to "Pending Developer Release" → "Ready for Sale"
6. Wait 15-30 minutes for App Store propagation
```

**Android:**
```
1. Google Play Console
2. Select "BoomCard" app
3. Production → Release
4. Confirm release
5. Status: "Pending publication" → "Published"
6. Wait 1-2 hours for Play Store propagation
```

**10:10** - Announce Launch (Internal)
```
Slack: #general
Message: "🚀 BoomCard is live! iOS and Android apps are publishing now."
```

**10:15** - Verify App Store Listings
```
# iOS
https://apps.apple.com/app/boomcard/[APP-ID]

# Android
https://play.google.com/store/apps/details?id=bg.boomcard.mobile

Status: Apps visible and downloadable
```

**10:30** - Launch Marketing Campaign
```
Actions:
  - Post on social media (Facebook, Instagram, Twitter)
  - Send email to beta testers
  - Publish blog post
  - Update website with download links
  - Press release (if applicable)
```

---

### T+0 to T+4 Hours (Critical Monitoring Period)

**10:00-14:00** - Intensive Monitoring

**Every 15 Minutes:**
```bash
# Check system health
curl https://api.boomcard.bg/api/health/detailed

# Check for errors
# Sentry dashboard: https://sentry.io

# Check metrics
curl https://api.boomcard.bg/api/health/metrics | jq '{
  users: .database.users,
  transactions: .database.transactions
}'

# Monitor logs
# Render dashboard → Logs (real-time)
```

**Track Key Metrics:**
```
Time | Users | Downloads | Registrations | Payments | Errors
-----+-------+-----------+---------------+----------+-------
10:00|   0   |     0     |       0       |    0     |   0
10:30|       |           |               |          |
11:00|       |           |               |          |
11:30|       |           |               |          |
12:00|       |           |               |          |
12:30|       |           |               |          |
13:00|       |           |               |          |
13:30|       |           |               |          |
14:00|       |           |               |          |
```

**Alert Thresholds (First 4 Hours):**
```
⚠️  Warning:
  - Error rate > 2%
  - Response time > 1s average
  - Payment failure rate > 10%

🚨 Critical:
  - System down
  - Database unreachable
  - Payment processing broken
  - Error rate > 5%
```

---

### T+4 Hours (Initial Assessment)

**14:00** - 4-Hour Review Meeting
```
Duration: 30 minutes
Attendees: Core team

Discuss:
  - Total downloads
  - Total registrations
  - Total payments
  - Any incidents
  - User feedback
  - Action items
```

**Metrics Snapshot:**
```
Downloads: iOS ___ | Android ___
Registrations: ___
Active users: ___
Payments: ___ (Success rate: ___%)
Receipts submitted: ___
Errors: ___ (Error rate: ___%)
Uptime: ___% (Target: 100%)
```

**Decision:**
```
[ ] Everything nominal - continue monitoring
[ ] Minor issues - create tickets, continue
[ ] Major issues - escalate, emergency meeting
```

---

### T+24 Hours (Day 1 Complete)

**Next Day 10:00** - Launch Retrospective
```
Duration: 1 hour
Attendees: Full team

Agenda:
  1. Launch timeline review (5 min)
  2. Metrics review (10 min)
  3. Incidents review (15 min)
  4. User feedback review (15 min)
  5. What went well (5 min)
  6. What to improve (5 min)
  7. Action items (5 min)
```

**24-Hour Metrics:**
```
Total App Downloads: ___
  - iOS: ___
  - Android: ___

User Registrations: ___
Activation Rate: ___% (registered / downloaded)

Payments:
  - Total: ___
  - Success rate: ___% (target: >95%)
  - Average amount: ___ BGN

Receipts:
  - Submitted: ___
  - Approved: ___
  - Approval rate: ___%

Technical:
  - Uptime: ___% (target: 99.9%)
  - Error rate: ___% (target: <1%)
  - Avg response time: ___ ms (target: <500ms)
  - Incidents: ___
```

**Transition to Normal Operations:**
```
- Reduce monitoring frequency to hourly
- Return to normal on-call rotation
- Continue tracking key metrics daily
```

---

## 🚨 Emergency Procedures

### Critical Issue: System Down

**Severity:** P1 - Critical
**Response Time:** Immediate

**Actions:**
1. **Acknowledge** (30 seconds)
   ```
   Post in #launch: "🚨 CRITICAL: System down - investigating"
   ```

2. **Assess** (2 minutes)
   ```bash
   # Check health endpoint
   curl https://api.boomcard.bg/api/health

   # Check Render service status
   # https://dashboard.render.com

   # Check Sentry for errors
   # https://sentry.io
   ```

3. **Diagnose** (5 minutes)
   ```
   Common causes:
   - Database connection failure
   - Memory exhaustion
   - Deployment issue
   - External service outage (Paysera, AWS)
   ```

4. **Resolve** (10 minutes)
   ```
   If database issue:
     - Restart database (Render dashboard)

   If deployment issue:
     - Rollback to previous deploy (Render dashboard)

   If memory issue:
     - Restart service (Render dashboard)
     - Consider instance upgrade
   ```

5. **Verify** (2 minutes)
   ```bash
   # Test health endpoint
   curl https://api.boomcard.bg/api/health/detailed

   # Test critical path
   # Login → Payment → Receipt submission
   ```

6. **Communicate** (5 minutes)
   ```
   Post in #launch:
   "✅ RESOLVED: System is back online. Root cause: [explanation]"

   If needed, post on status page
   ```

**Total Time Budget:** 25 minutes

---

### High Priority: Payment Processing Failure

**Severity:** P1 - Critical
**Response Time:** <5 minutes

**Actions:**
1. **Verify Issue**
   ```bash
   # Check payment endpoint
   curl https://api.boomcard.bg/api/health/detailed | jq '.checks.paysera'

   # Check recent payments
   psql $DATABASE_URL -c "
   SELECT orderId, status, amount, createdAt
   FROM \"Transaction\"
   WHERE createdAt > NOW() - INTERVAL '1 hour'
   ORDER BY createdAt DESC
   LIMIT 10;
   "
   ```

2. **Check Paysera Status**
   ```bash
   # Check if Paysera is operational
   curl -I https://www.paysera.com

   # Check Paysera status page (if available)
   ```

3. **Verify Configuration**
   ```bash
   # Check environment variables
   # Render → Service → Environment
   # Verify: PAYSERA_PROJECT_ID, PAYSERA_SIGN_PASSWORD
   ```

4. **Test Payment Flow**
   ```
   # Manual test payment
   # Amount: 5 BGN
   # Expected: Success or specific error message
   ```

5. **Resolution Options**
   ```
   If Paysera issue:
     - Contact Paysera support immediately
     - Post user notification about temporary payment issues

   If configuration issue:
     - Fix environment variables
     - Restart service
     - Test again

   If webhook issue:
     - Check webhook endpoint logs
     - Verify signature validation
   ```

---

### Medium Priority: High Error Rate

**Severity:** P2 - High
**Response Time:** <15 minutes

**Actions:**
1. **Check Sentry Dashboard**
   ```
   Identify:
   - Error type
   - Frequency
   - Affected endpoints
   - User impact
   ```

2. **Assess Impact**
   ```
   Questions:
   - How many users affected?
   - Which features broken?
   - Can users still complete core actions?
   ```

3. **Quick Fix or Mitigation**
   ```
   Options:
   - Apply hotfix if trivial
   - Rollback if recent deployment
   - Disable non-critical feature temporarily
   - Add error handling to fail gracefully
   ```

4. **Monitor**
   ```
   Track error rate after fix
   Target: <1% within 30 minutes
   ```

---

### Low Priority: Performance Degradation

**Severity:** P3 - Medium
**Response Time:** <1 hour

**Actions:**
1. **Identify Bottleneck**
   ```
   Check:
   - Database query performance
   - API response times (Sentry)
   - Memory usage
   - CPU usage
   ```

2. **Quick Optimizations**
   ```
   - Restart service (clears memory)
   - Check database connection pool
   - Review recent code changes
   - Check external service response times
   ```

3. **If Persists**
   ```
   - Create ticket for detailed investigation
   - Monitor closely
   - Plan optimization in next sprint
   ```

---

## 📊 Success Criteria

### Technical Success
- ✅ **Uptime:** >99.5% in first 24 hours
- ✅ **Error Rate:** <1%
- ✅ **Response Time:** <500ms average
- ✅ **Payment Success:** >95%
- ✅ **Zero P1 incidents** lasting >15 minutes

### Business Success
- ✅ **Downloads:** [Target number] in first 24 hours
- ✅ **Registrations:** [Target number]
- ✅ **Payments:** [Target number]
- ✅ **Positive user feedback:** >80%

---

## 👥 Team Roles

### Launch Day Roles

**Incident Commander:** [Name]
- Overall coordination
- Go/No-Go decision
- Communication with stakeholders

**Technical Lead:** [Name]
- Backend monitoring
- Performance analysis
- Incident response

**DevOps Engineer:** [Name]
- Infrastructure monitoring
- Deployment management
- Emergency fixes

**Product Manager:** [Name]
- User feedback monitoring
- Business metrics tracking
- External communication

**Customer Support:** [Name]
- User inquiries
- Bug reports
- FAQ updates

**Marketing:** [Name]
- Social media monitoring
- Launch announcements
- Press coordination

---

## 📞 Emergency Contacts

| Role | Name | Phone | Email | Availability |
|------|------|-------|-------|--------------|
| Incident Commander | [Name] | [Phone] | [Email] | 24/7 |
| Technical Lead | [Name] | [Phone] | [Email] | 08:00-24:00 |
| DevOps | [Name] | [Phone] | [Email] | 24/7 |
| Product | [Name] | [Phone] | [Email] | 08:00-20:00 |
| CEO/Founder | [Name] | [Phone] | [Email] | 24/7 |

**Escalation Chain:**
1. DevOps → Technical Lead (for technical issues)
2. Technical Lead → Incident Commander (if unresolved in 15 min)
3. Incident Commander → CEO (if business-critical)

---

## 📝 Launch Day Checklist

### Pre-Launch (T-2 hours)
- [ ] War room opened
- [ ] All systems green
- [ ] Mobile apps ready
- [ ] End-to-end test passed
- [ ] Team briefed
- [ ] Monitoring confirmed
- [ ] Emergency contacts shared

### Launch (T-0)
- [ ] Go/No-Go decision: GO
- [ ] iOS app released
- [ ] Android app released
- [ ] Internal announcement
- [ ] Marketing campaign launched
- [ ] Intensive monitoring started

### Post-Launch (T+4 hours)
- [ ] 4-hour review completed
- [ ] Metrics captured
- [ ] Incidents logged
- [ ] User feedback reviewed
- [ ] Decision: Continue / Escalate / Rollback

### Day 1 Complete (T+24 hours)
- [ ] 24-hour retrospective
- [ ] Metrics analysis
- [ ] Action items created
- [ ] Transition to normal operations
- [ ] Team celebration! 🎉

---

## 🎉 Celebration!

Once T+24 hours is complete and all systems are stable:

```
🚀 BoomCard has officially launched!

Congratulations to the entire team for bringing this vision to life.

Time to celebrate 🍾 and then get ready for the next iteration!
```

---

**Document Owner:** Launch Team
**Launch Date:** [TBD]
**Version:** 1.0.0
**Last Updated:** November 4, 2025

**Generated with [Claude Code](https://claude.com/claude-code)**
