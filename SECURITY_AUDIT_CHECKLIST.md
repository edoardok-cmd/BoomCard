# BoomCard Platform - Security Audit Checklist

**Version:** 1.0.0
**Last Updated:** November 4, 2025
**Purpose:** Pre-production security audit and ongoing security reviews

---

## Overview

This checklist ensures that the BoomCard platform meets security best practices before launch and during regular security audits. Each item should be verified and documented.

**Audit Frequency:**
- **Pre-Launch:** Complete audit required
- **Post-Launch:** Quarterly reviews
- **Post-Incident:** Immediate review of affected areas
- **After Major Changes:** Targeted review of changed components

---

## 🔐 Authentication & Authorization

### User Authentication
- [ ] **JWT Secret Strength**
  - `JWT_SECRET` is at least 32 characters
  - Generated using cryptographically secure random source
  - Different from `JWT_REFRESH_SECRET`
  - Not committed to version control

- [ ] **Token Security**
  - Access tokens expire within 1 hour
  - Refresh tokens expire within 7 days
  - Token signatures use HMAC-SHA256 or stronger
  - Tokens include `iat` (issued at) and `exp` (expiration) claims

- [ ] **Password Requirements**
  - Minimum 8 characters required
  - Passwords hashed with bcrypt (cost factor ≥ 10)
  - No password strength requirements bypass
  - Password reset requires email verification

- [ ] **Session Management**
  - Sessions stored securely (HttpOnly cookies or secure storage)
  - Concurrent session limits enforced
  - Session invalidation on logout works correctly
  - Old sessions cleaned up automatically

- [ ] **Account Security**
  - Account lockout after 5 failed login attempts
  - Lockout period: 15 minutes
  - Email verification required for new accounts
  - Password reset tokens expire within 1 hour

**Verification:**
```bash
# Check JWT secret length
echo $JWT_SECRET | wc -c  # Should be > 32

# Verify token expiration
curl -X POST https://api.boomcard.bg/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boomcard.bg","password":"testpass"}' \
  | jq '.expiresIn'  # Should be 3600 (1 hour)
```

---

## 🌐 API Security

### Input Validation
- [ ] **Request Validation**
  - All API inputs validated (type, length, format)
  - SQL injection prevention (parameterized queries only)
  - NoSQL injection prevention (sanitized queries)
  - XSS prevention (input sanitization, output encoding)

- [ ] **File Upload Security**
  - File type validation (whitelist only: jpg, png, pdf)
  - File size limits enforced (max 10MB for images, 5MB for receipts)
  - Uploaded files scanned for malware (if applicable)
  - Files stored outside web root
  - No executable file types allowed

- [ ] **Data Sanitization**
  - HTML tags stripped from user input
  - Special characters escaped
  - Unicode validation
  - JSON parsing limits enforced

**Verification:**
```bash
# Test SQL injection
curl -X POST https://api.boomcard.bg/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com OR 1=1--","password":"test"}'
# Should return validation error, not succeed

# Test XSS
curl -X POST https://api.boomcard.bg/api/venues \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"<script>alert(1)</script>"}'
# Should sanitize input
```

### Rate Limiting
- [ ] **API Rate Limits**
  - Global rate limit: 100 requests/minute per IP
  - Auth endpoints: 5 requests/minute per IP
  - Payment endpoints: 10 requests/minute per user
  - Rate limit headers included in responses

- [ ] **DDoS Protection**
  - CloudFlare or similar service configured
  - Rate limiting at edge network
  - Request size limits enforced (max 1MB)

**Verification:**
```bash
# Test rate limiting
for i in {1..20}; do
  curl -w "%{http_code}\n" https://api.boomcard.bg/api/auth/login \
    -d '{"email":"test@test.com","password":"test"}' \
    -s -o /dev/null
done
# Should show 429 (Too Many Requests) after threshold
```

### API Security Headers
- [ ] **Security Headers Present**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000`
  - `Content-Security-Policy` configured

**Verification:**
```bash
curl -I https://api.boomcard.bg/api/health | grep -E "X-Content-Type|X-Frame|X-XSS|Strict-Transport"
```

### CORS Configuration
- [ ] **CORS Properly Configured**
  - Only allowed origins listed
  - Production: `https://dashboard.boomcard.bg` only
  - No wildcard (`*`) in production
  - Credentials allowed only for trusted origins

**Verification:**
```bash
# Check CORS headers
curl -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -I https://api.boomcard.bg/api/health

# Should NOT return Access-Control-Allow-Origin for untrusted origin
```

---

## 💳 Payment Security

### PCI DSS Compliance
- [ ] **Card Data Handling**
  - ✅ NO card numbers stored in database
  - ✅ NO CVV codes stored anywhere
  - ✅ All payment data handled by Paysera (PCI-compliant provider)
  - Payment forms use HTTPS only
  - Payment webhooks verify signatures

- [ ] **Paysera Integration**
  - Signature verification on all webhooks
  - `PAYSERA_SIGN_PASSWORD` stored securely
  - Webhook endpoints use HTTPS
  - Failed signature checks logged and rejected

- [ ] **Transaction Security**
  - All payment amounts validated (positive, reasonable limits)
  - Currency validation enforced
  - Duplicate transaction prevention
  - Transaction logging (without sensitive data)

**Verification:**
```bash
# Check webhook signature verification
curl -X POST https://api.boomcard.bg/api/webhooks/paysera \
  -H "Content-Type: application/json" \
  -d '{"orderid":"test","status":"1"}' \
  # Should fail without valid signature
```

### Financial Data Protection
- [ ] **Sensitive Data**
  - Transaction amounts encrypted at rest
  - Wallet balances protected by authentication
  - No financial data in logs
  - Audit trail for all financial operations

---

## 🗄️ Database Security

### Access Control
- [ ] **Database Authentication**
  - Strong password (min 32 characters, random)
  - Password not in source code
  - Database user has minimum required privileges
  - No default credentials used

- [ ] **Connection Security**
  - SSL/TLS required for database connections
  - Connection strings use encrypted transport
  - `DATABASE_URL` stored in environment, not code
  - No direct database access from public internet

**Verification:**
```bash
# Check database connection uses SSL
psql "$DATABASE_URL" -c "SHOW ssl;"
# Should return 'on'
```

### Data Protection
- [ ] **Encryption at Rest**
  - Database encryption enabled (Render provides this)
  - Sensitive fields additionally encrypted (if applicable)
  - Backup encryption enabled

- [ ] **Data Access Logging**
  - Database query logs enabled
  - Failed authentication attempts logged
  - Suspicious queries flagged

### Query Security
- [ ] **SQL Injection Prevention**
  - All queries use Prisma (parameterized)
  - No raw SQL with user input
  - Input validation before database queries
  - Stored procedures reviewed for injection risks

**Verification:**
```bash
# Review all raw queries in codebase
grep -r "prisma.\$queryRaw" backend-api/src/
grep -r "prisma.\$executeRaw" backend-api/src/
# Verify all use parameterized queries with template literals
```

---

## 🔒 Data Privacy

### Personal Data (GDPR)
- [ ] **User Data Collection**
  - Privacy policy published and accessible
  - User consent obtained for data collection
  - Clear explanation of data usage
  - Users can request data export
  - Users can request data deletion

- [ ] **Data Minimization**
  - Only necessary data collected
  - Unused fields removed from forms
  - Data retention policy defined
  - Old data automatically purged

- [ ] **Data Access**
  - Users can view their own data
  - Users cannot access others' data
  - Admin access logged and audited
  - Data exports contain only user's own data

**Verification:**
```bash
# Test data access control
# User A should NOT be able to access User B's data
curl -H "Authorization: Bearer $USER_A_TOKEN" \
  https://api.boomcard.bg/api/users/$USER_B_ID
# Should return 403 Forbidden
```

### Sensitive Data Handling
- [ ] **PII Protection**
  - Email addresses hashed in logs
  - Phone numbers masked in logs
  - Addresses encrypted in database (if applicable)
  - Sensitive data redacted in error messages

- [ ] **Receipt Data**
  - Receipt images stored in secure S3 bucket
  - S3 bucket is private (not public)
  - Signed URLs used for access (expire after 1 hour)
  - OCR data sanitized before storage

---

## 🌐 Network Security

### HTTPS/TLS
- [ ] **TLS Configuration**
  - ✅ All endpoints use HTTPS (Render/Vercel provide this)
  - TLS 1.2 or higher required
  - HTTP redirects to HTTPS automatically
  - Valid SSL certificate (not expired, not self-signed)
  - Certificate chain complete

**Verification:**
```bash
# Check TLS version
openssl s_client -connect api.boomcard.bg:443 -tls1_2
# Should succeed

# Check certificate validity
echo | openssl s_client -connect api.boomcard.bg:443 2>/dev/null | openssl x509 -noout -dates
# Should show valid dates
```

### DNS Security
- [ ] **DNS Configuration**
  - DNSSEC enabled (if supported by registrar)
  - SPF records configured for email
  - DKIM records configured for email
  - No wildcard DNS records

### DDoS Protection
- [ ] **DDoS Mitigation**
  - Render/Vercel built-in DDoS protection active
  - Rate limiting configured (see API Security)
  - Geographic restrictions if applicable
  - Traffic monitoring alerts configured

---

## 📱 Mobile App Security

### iOS Security
- [ ] **App Store Security**
  - App signed with valid certificate
  - Provisioning profiles up to date
  - No hardcoded secrets in app bundle
  - Debug symbols removed from production build

- [ ] **Code Security**
  - API keys stored in secure storage (Keychain)
  - No sensitive data in UserDefaults
  - Certificate pinning for API calls (if applicable)
  - Biometric authentication for payments

### Android Security
- [ ] **Play Store Security**
  - App signed with release key
  - ProGuard/R8 code obfuscation enabled
  - Debug logs removed from production
  - No exported components without protection

- [ ] **Code Security**
  - API keys stored in secure storage (EncryptedSharedPreferences)
  - No sensitive data in SharedPreferences
  - Certificate pinning for API calls (if applicable)
  - Biometric authentication for payments

### Mobile API Security
- [ ] **API Communication**
  - All API calls use HTTPS
  - Token stored securely (Secure Store / Keychain)
  - Refresh token rotation implemented
  - App version enforcement (block old versions if needed)

**Verification:**
```bash
# Check for hardcoded secrets in mobile app
grep -r "PAYSERA_" boomcard-mobile/
grep -r "JWT_SECRET" boomcard-mobile/
grep -r "DATABASE_URL" boomcard-mobile/
# Should return NO results
```

---

## 🔧 Infrastructure Security

### Server Configuration
- [ ] **Server Hardening**
  - ✅ Managed by Render (automatic updates, firewalls)
  - SSH access disabled (Render is serverless)
  - Only necessary ports open (443 for HTTPS)
  - OS and dependencies auto-updated

### Environment Variables
- [ ] **Secret Management**
  - All secrets in environment variables
  - No secrets in source code
  - No secrets in logs
  - Different secrets for dev/staging/production
  - Secret rotation procedure documented

**Verification:**
```bash
# Check for hardcoded secrets
grep -r "PAYSERA_SIGN_PASSWORD" backend-api/src/
grep -r "JWT_SECRET" backend-api/src/
grep -r "postgresql://" backend-api/src/
# Should return NO results (only in .env files)

# Check .env files are gitignored
git ls-files | grep .env
# Should return NO results
```

### Dependency Security
- [ ] **Dependency Management**
  - All dependencies up to date
  - No known vulnerabilities (npm audit)
  - Automated dependency updates (Dependabot)
  - Lock files committed (package-lock.json, yarn.lock)

**Verification:**
```bash
# Check for vulnerabilities
cd backend-api && npm audit
cd partner-dashboard && npm audit
cd boomcard-mobile && npm audit

# Should show 0 vulnerabilities (or only low-severity)
```

### Backup & Recovery
- [ ] **Backup Strategy**
  - Daily automatic database backups
  - Backups encrypted
  - Backup restoration tested
  - Backups retained for 30 days
  - Off-site backup storage

- [ ] **Disaster Recovery**
  - Recovery Time Objective (RTO): < 4 hours
  - Recovery Point Objective (RPO): < 24 hours
  - DR plan documented
  - DR plan tested annually

---

## 📋 Logging & Monitoring

### Security Logging
- [ ] **Log Coverage**
  - All authentication attempts logged
  - All authorization failures logged
  - All payment transactions logged
  - All admin actions logged
  - All errors logged to Sentry

- [ ] **Log Security**
  - No passwords in logs
  - No API keys in logs
  - No PII in logs (emails hashed, phone numbers masked)
  - Log retention: 90 days
  - Logs tamper-proof (write-only)

**Verification:**
```bash
# Check logs for sensitive data
# (Review Render logs manually)
# Should NOT contain: passwords, JWT tokens, card numbers, CVVs
```

### Security Monitoring
- [ ] **Monitoring Alerts**
  - Failed login spikes alert
  - High error rate alert
  - Payment failure rate alert
  - Unusual traffic patterns alert
  - Certificate expiration alert (30 days before)

- [ ] **Incident Response**
  - On-call rotation defined
  - Incident response plan documented
  - Security incident contacts defined
  - Incident communication plan ready

---

## 🧪 Security Testing

### Penetration Testing
- [ ] **Testing Completed**
  - SQL injection testing
  - XSS testing
  - CSRF testing
  - Authentication bypass testing
  - Authorization testing

### Automated Security Scans
- [ ] **SAST (Static Analysis)**
  - Code security scanner configured (e.g., Snyk, SonarQube)
  - Critical issues resolved
  - High issues resolved or documented

- [ ] **DAST (Dynamic Analysis)**
  - OWASP ZAP or similar tool run
  - Findings reviewed and resolved
  - Regular scans scheduled (monthly)

### Third-Party Audits
- [ ] **External Security Audit**
  - Professional security audit completed (recommended)
  - Findings documented
  - Critical findings resolved
  - Report available for compliance

---

## 📝 Compliance & Documentation

### Legal Compliance
- [ ] **Privacy Policy**
  - Privacy policy published
  - GDPR compliant (if serving EU users)
  - CCPA compliant (if serving California users)
  - Cookie policy published

- [ ] **Terms of Service**
  - Terms of Service published
  - User agreement required
  - Clear data usage explanation
  - Contact information for privacy concerns

### Security Documentation
- [ ] **Documentation Complete**
  - Security policies documented
  - Incident response plan documented
  - Secret rotation procedures documented
  - Security audit results documented
  - Compliance certifications documented

### Employee Security
- [ ] **Team Security**
  - All team members use 2FA on critical accounts
  - Password manager used for shared credentials
  - Access revoked for departed team members
  - Security awareness training completed

---

## ✅ Pre-Launch Security Sign-Off

### Critical Items (MUST be completed before launch)
- [ ] All passwords/secrets are strong and unique
- [ ] HTTPS enforced on all endpoints
- [ ] Database backups configured and tested
- [ ] No secrets in source code
- [ ] Authentication and authorization working correctly
- [ ] Payment integration security verified
- [ ] npm audit shows 0 critical/high vulnerabilities
- [ ] Security headers configured
- [ ] Rate limiting configured
- [ ] Monitoring and alerting configured

### High Priority (Should be completed before launch)
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Security incident response plan ready
- [ ] Log aggregation configured
- [ ] Failed login attempts logged
- [ ] CORS properly configured
- [ ] Input validation on all endpoints
- [ ] File upload security implemented

### Medium Priority (Can be completed post-launch)
- [ ] External security audit scheduled
- [ ] Automated security scanning configured
- [ ] Employee security training completed
- [ ] Disaster recovery plan tested
- [ ] Certificate pinning for mobile apps

---

## 📊 Security Scorecard

Track your security posture:

| Category | Items | Completed | % |
|----------|-------|-----------|---|
| Authentication & Authorization | 20 | ___ | ___ |
| API Security | 15 | ___ | ___ |
| Payment Security | 12 | ___ | ___ |
| Database Security | 14 | ___ | ___ |
| Data Privacy | 16 | ___ | ___ |
| Network Security | 10 | ___ | ___ |
| Mobile App Security | 14 | ___ | ___ |
| Infrastructure Security | 12 | ___ | ___ |
| Logging & Monitoring | 12 | ___ | ___ |
| Security Testing | 9 | ___ | ___ |
| Compliance & Documentation | 11 | ___ | ___ |
| **TOTAL** | **145** | ___ | ___ |

**Target:** 100% of Critical items, >90% of High Priority, >80% overall

---

## 🚨 Emergency Security Procedures

### If You Discover a Security Breach

**1. Immediate Actions (First 5 minutes)**
- Notify security lead immediately
- Do NOT attempt to fix without authorization
- Document what you found (screenshots, logs)
- Do NOT share details publicly

**2. Containment (5-15 minutes)**
- If breach is ongoing: Isolate affected systems
- If data exposed: Identify scope of exposure
- If credentials compromised: Rotate immediately

**3. Communication (15-30 minutes)**
- Notify CEO/CTO
- Notify affected users (if PII compromised)
- Notify authorities (if required by law)
- Prepare public statement (if needed)

**4. Recovery (30 minutes - 24 hours)**
- Apply security fix
- Verify fix is effective
- Restore from backup if needed
- Monitor for continued attacks

**5. Post-Incident (24-72 hours)**
- Complete incident report
- Conduct post-mortem
- Update security procedures
- Implement preventive measures

---

## 📅 Ongoing Security Reviews

### Monthly
- [ ] Review access logs for anomalies
- [ ] Check npm audit for new vulnerabilities
- [ ] Review Sentry for security-related errors
- [ ] Verify all monitoring alerts working

### Quarterly
- [ ] Full security audit (this checklist)
- [ ] Rotate non-critical secrets
- [ ] Review and update security policies
- [ ] Test disaster recovery procedures

### Annually
- [ ] External security audit
- [ ] Penetration testing
- [ ] Update privacy policy and ToS
- [ ] Security training for all team members

---

**Audit Completed By:** _______________
**Date:** _______________
**Overall Score:** ___% (___/145 items)
**Status:** ☐ PASS ☐ NEEDS WORK ☐ FAIL
**Next Audit Date:** _______________

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**
