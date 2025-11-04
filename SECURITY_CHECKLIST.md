# Security Checklist - Quick Reference

## 🔐 Pre-Production Security Checklist

Use this checklist before deploying to production. Check off each item as you complete it.

---

## Environment & Configuration

- [ ] **Generate secure JWT secrets** (64+ bytes, base64 encoded)
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
  ```

- [ ] **Set NODE_ENV=production** in production environment

- [ ] **Configure production .env file** (use .env.production.template)

- [ ] **Never commit .env.production** to git (check .gitignore)

- [ ] **Use PostgreSQL** (not SQLite) for production database

- [ ] **Enable database SSL/TLS** connections

- [ ] **Configure CORS_ORIGIN** to specific production domains (no wildcards!)

- [ ] **Set secure cookie flags** (httpOnly, secure, sameSite)

- [ ] **Configure session secrets** (different from JWT secrets)

- [ ] **Set up environment variable validation** (runs on startup)

---

## Authentication & Authorization

- [ ] **JWT secrets are at least 64 bytes** (512 bits)

- [ ] **Different secrets** for access tokens and refresh tokens

- [ ] **Access token expiry: 1 hour** or less

- [ ] **Refresh token expiry: 7 days** or less

- [ ] **Password hashing** uses bcrypt with 12+ salt rounds

- [ ] **Password requirements** enforced (8+ chars, uppercase, lowercase, number)

- [ ] **Failed login attempts** are rate limited (5 attempts per 15 min)

- [ ] **Role-based access control** (RBAC) implemented

- [ ] **Token validation** on all protected routes

- [ ] **Token refresh** mechanism implemented

---

## API Security

- [ ] **Helmet.js installed** and configured for production

- [ ] **Content Security Policy** (CSP) configured

- [ ] **HSTS enabled** (max-age: 31536000, includeSubDomains, preload)

- [ ] **X-Frame-Options: DENY** (prevent clickjacking)

- [ ] **X-Content-Type-Options: nosniff** (prevent MIME sniffing)

- [ ] **Referrer-Policy** set to strict-origin-when-cross-origin

- [ ] **Permissions-Policy** configured (disable unnecessary features)

- [ ] **CORS** properly configured for production domains only

- [ ] **Rate limiting** enabled on all API endpoints

- [ ] **Auth endpoints** have stricter rate limits (5 per 15 min)

- [ ] **Payment endpoints** have strict rate limits (10 per 15 min)

- [ ] **Upload endpoints** rate limited (5 per minute)

---

## Input Validation & Sanitization

- [ ] **Input sanitization middleware** enabled

- [ ] **express-validator** used for all user inputs

- [ ] **SQL injection protection** (Prisma handles this)

- [ ] **XSS prevention** (sanitize HTML, remove script tags)

- [ ] **Parameter pollution prevention** enabled

- [ ] **File upload validation** (type, size, mime type)

- [ ] **Max file size** set and enforced (5MB for receipts)

- [ ] **Allowed MIME types** whitelisted

- [ ] **Email validation** and normalization

- [ ] **Phone number validation** (if applicable)

---

## Data Protection

- [ ] **HTTPS/TLS enabled** on all connections

- [ ] **SSL certificate** installed and valid

- [ ] **Database encryption** at rest enabled

- [ ] **File storage encryption** (S3/R2 server-side encryption)

- [ ] **Backup encryption** with separate keys

- [ ] **Passwords never logged** (in any logs or errors)

- [ ] **JWT tokens never logged**

- [ ] **Credit card data** never stored (use Stripe tokens)

- [ ] **PII data minimization** (only collect necessary data)

- [ ] **Sensitive data masking** in logs

---

## Logging & Monitoring

- [ ] **Winston logger** configured for production

- [ ] **Log level** set to 'info' or 'warn' (not 'debug')

- [ ] **Structured logging** (JSON format)

- [ ] **Error tracking** (Sentry or similar) configured

- [ ] **Security audit logging** for sensitive operations

- [ ] **Failed login attempts** logged

- [ ] **Rate limit violations** logged

- [ ] **Payment transactions** logged

- [ ] **Admin actions** logged

- [ ] **Log rotation** configured (prevent disk fill)

- [ ] **Logs sent to external service** (CloudWatch, Datadog, etc.)

- [ ] **Alerts configured** for critical errors

---

## Database Security

- [ ] **Database uses strong password** (20+ characters)

- [ ] **Database not exposed** to public internet

- [ ] **Database firewall rules** configured

- [ ] **Database backups** automated and tested

- [ ] **Database connection pooling** configured

- [ ] **Prisma migrations** all applied

- [ ] **Database user** has minimum necessary permissions

- [ ] **No default/test accounts** in production database

- [ ] **Database SSL/TLS** required for connections

- [ ] **Regular security updates** scheduled

---

## Third-Party Services

- [ ] **Stripe API keys** are LIVE keys (not test keys)

- [ ] **Stripe webhook secret** configured

- [ ] **Stripe webhook signature** verification enabled

- [ ] **AWS/S3 credentials** rotated regularly

- [ ] **Third-party API keys** stored in environment variables

- [ ] **2FA enabled** on all critical service accounts

- [ ] **Service accounts** use least privilege

- [ ] **API keys** never committed to git

- [ ] **Secrets stored** in secure vault (AWS Secrets Manager, etc.)

---

## Infrastructure

- [ ] **Firewall configured** (allow only necessary ports)

- [ ] **DDoS protection** enabled (CloudFlare, AWS Shield)

- [ ] **Load balancer** configured (if using multiple servers)

- [ ] **Auto-scaling** configured based on load

- [ ] **Health checks** configured (/health endpoint)

- [ ] **Readiness checks** configured (/ready endpoint)

- [ ] **Graceful shutdown** implemented

- [ ] **Process manager** (PM2, systemd) configured

- [ ] **Reverse proxy** (nginx) configured with security headers

- [ ] **Trust proxy** setting enabled if behind load balancer

---

## Monitoring & Alerts

- [ ] **Uptime monitoring** configured (UptimeRobot, Pingdom)

- [ ] **Performance monitoring** (APM tool like New Relic)

- [ ] **Error rate alerts** configured

- [ ] **Response time alerts** configured

- [ ] **Database performance monitoring**

- [ ] **Disk space alerts** configured

- [ ] **Memory usage alerts** configured

- [ ] **CPU usage alerts** configured

- [ ] **SSL certificate expiry alerts**

- [ ] **On-call rotation** set up

---

## Compliance & Privacy

- [ ] **Privacy policy** published

- [ ] **Terms of service** published

- [ ] **Cookie consent** implemented (if EU users)

- [ ] **GDPR compliance** (if applicable)

- [ ] **Data retention policy** documented

- [ ] **Right to deletion** implemented

- [ ] **Data export** functionality implemented

- [ ] **User consent** for data collection

- [ ] **Third-party data sharing** disclosed

- [ ] **Security incident response plan** documented

---

## Testing & Validation

- [ ] **Security headers tested** (securityheaders.com)

- [ ] **SSL configuration tested** (ssllabs.com)

- [ ] **Dependency vulnerabilities** checked (`npm audit`)

- [ ] **E2E tests** passing

- [ ] **Load testing** completed

- [ ] **Penetration testing** conducted (if budget allows)

- [ ] **Security audit** completed

- [ ] **Code review** completed

- [ ] **Database migration** tested

- [ ] **Backup restoration** tested

---

## Deployment

- [ ] **Deployment checklist** documented

- [ ] **Rollback procedure** documented

- [ ] **Database migration strategy** planned

- [ ] **Zero-downtime deployment** configured (if needed)

- [ ] **Blue-green deployment** or canary releases (if needed)

- [ ] **CI/CD pipeline** configured with security checks

- [ ] **Automated tests** in CI/CD

- [ ] **Security scanning** in CI/CD

- [ ] **Staging environment** matches production

- [ ] **Production deployment** tested in staging first

---

## Documentation

- [ ] **API documentation** updated

- [ ] **Security documentation** reviewed

- [ ] **Runbook** created for common issues

- [ ] **Incident response plan** documented

- [ ] **Contact information** updated (on-call, security team)

- [ ] **Architecture diagrams** updated

- [ ] **Network diagrams** updated

- [ ] **Secrets location** documented (in secure location)

---

## Post-Deployment

- [ ] **Monitor logs** for first 24 hours

- [ ] **Monitor error rates** for anomalies

- [ ] **Monitor performance** metrics

- [ ] **Test critical user flows** in production

- [ ] **SSL certificate** validated

- [ ] **Security headers** verified

- [ ] **Rate limiting** verified working

- [ ] **Error tracking** verified working

- [ ] **Backups** verified running

- [ ] **Alerts** verified sending

---

## Regular Maintenance (Ongoing)

### Weekly
- [ ] Review error logs
- [ ] Review security audit logs
- [ ] Check for dependency updates
- [ ] Monitor resource usage

### Monthly
- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Review access logs for suspicious activity
- [ ] Test backup restoration
- [ ] Review and update firewall rules
- [ ] Check SSL certificate expiry

### Quarterly
- [ ] Rotate JWT secrets (if needed)
- [ ] Rotate API keys
- [ ] Review user permissions
- [ ] Conduct security audit
- [ ] Penetration testing (if budget allows)
- [ ] Review and update security policies
- [ ] Incident response drill

### Annually
- [ ] Full security audit
- [ ] Review compliance requirements
- [ ] Update privacy policy and ToS
- [ ] Review disaster recovery plan
- [ ] Conduct tabletop exercises

---

## Quick Commands

### Generate Secure Secret
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### Check Dependency Vulnerabilities
```bash
npm audit
npm audit fix
```

### Test Security Headers
```bash
curl -I https://yourdomain.com
```

### Run E2E Tests
```bash
cd partner-dashboard
npx playwright test
```

### Export Database (SQLite)
```bash
cd backend-api
npm run migrate:export
```

### Check SSL Certificate
```bash
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com
```

---

## Emergency Contacts

```
Security Team: security@yourdomain.com
On-Call DevOps: [phone]
Database Admin: [email/phone]
Legal/Compliance: [email]
```

---

## Useful Links

- Security Headers Test: https://securityheaders.com/
- SSL Test: https://www.ssllabs.com/ssltest/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Security Best Practices: [Your internal wiki]

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0
**Review Frequency:** Monthly
