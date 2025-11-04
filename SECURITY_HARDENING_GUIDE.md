# Security Hardening Guide - BOOM Card Platform

## Overview

This guide covers all security measures implemented in the BOOM Card platform to protect user data, prevent attacks, and ensure production readiness.

---

## Table of Contents

1. [Security Architecture](#security-architecture)
2. [Authentication & Authorization](#authentication--authorization)
3. [Data Protection](#data-protection)
4. [API Security](#api-security)
5. [Input Validation & Sanitization](#input-validation--sanitization)
6. [Rate Limiting](#rate-limiting)
7. [Security Headers](#security-headers)
8. [Monitoring & Logging](#monitoring--logging)
9. [Production Checklist](#production-checklist)
10. [Incident Response](#incident-response)

---

## Security Architecture

### Defense in Depth

The platform implements multiple layers of security:

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Network Security (CloudFlare, Firewall)   │
├─────────────────────────────────────────────────────┤
│ Layer 2: TLS/SSL Encryption (HTTPS)                 │
├─────────────────────────────────────────────────────┤
│ Layer 3: Security Headers (Helmet.js, CSP)          │
├─────────────────────────────────────────────────────┤
│ Layer 4: Rate Limiting (Express Rate Limit)         │
├─────────────────────────────────────────────────────┤
│ Layer 5: Input Validation & Sanitization            │
├─────────────────────────────────────────────────────┤
│ Layer 6: Authentication (JWT, bcrypt)               │
├─────────────────────────────────────────────────────┤
│ Layer 7: Authorization (Role-Based Access Control)  │
├─────────────────────────────────────────────────────┤
│ Layer 8: Database Security (Prisma, Parameterized)  │
├─────────────────────────────────────────────────────┤
│ Layer 9: Audit Logging & Monitoring (Winston)       │
└─────────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### JWT Token Strategy

**File:** [backend-api/src/middleware/auth.middleware.ts](backend-api/src/middleware/auth.middleware.ts)

#### Access Tokens
- **Purpose:** Short-lived tokens for API access
- **Expiry:** 1 hour
- **Storage:** LocalStorage (frontend)
- **Algorithm:** HS256 (HMAC with SHA-256)

#### Refresh Tokens
- **Purpose:** Long-lived tokens for obtaining new access tokens
- **Expiry:** 7 days
- **Storage:** HttpOnly cookie (recommended) or LocalStorage
- **Rotation:** New refresh token issued on each refresh

#### Token Security

```typescript
// Generate access token
const accessToken = jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET!,
  { expiresIn: '1h', algorithm: 'HS256' }
);

// Generate refresh token
const refreshToken = jwt.sign(
  { id: user.id },
  process.env.REFRESH_TOKEN_SECRET!,
  { expiresIn: '7d', algorithm: 'HS256' }
);
```

**Security Requirements:**
- JWT secrets must be at least 64 bytes (512 bits)
- Different secrets for access and refresh tokens
- Secrets must be generated using cryptographically secure random
- Rotate secrets every 90 days in production

**Generate Secure Secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### Password Security

**File:** [backend-api/src/utils/password.util.ts](backend-api/src/utils/password.util.ts) (if exists)

#### Requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Special characters recommended but not required

#### Hashing:
```typescript
import bcrypt from 'bcryptjs';

// Hash password (salt rounds = 12)
const hashedPassword = await bcrypt.hash(password, 12);

// Verify password
const isValid = await bcrypt.compare(password, hashedPassword);
```

**Why bcrypt?**
- Adaptive function (can increase cost over time)
- Built-in salt generation
- Resistant to rainbow table attacks
- Computationally expensive (prevents brute force)

### Role-Based Access Control (RBAC)

**Roles:**
```typescript
enum UserRole {
  USER           // Regular users
  PARTNER        // Business partners
  ADMIN          // System administrators
  SUPER_ADMIN    // Full system access
}
```

**Permission Checks:**
```typescript
// Middleware example
const requireRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Usage
router.delete('/users/:id', authenticate, requireRole([UserRole.ADMIN]), deleteUser);
```

---

## Data Protection

### Encryption

#### In Transit
- **TLS 1.3** for all HTTPS connections
- **Certificate:** Let's Encrypt or commercial SSL
- **Enforcement:** HSTS header forces HTTPS

```typescript
// HSTS Configuration
hsts: {
  maxAge: 31536000,        // 1 year
  includeSubDomains: true,
  preload: true
}
```

#### At Rest
- **Database:** PostgreSQL with encryption enabled
- **Files:** S3/R2 server-side encryption (AES-256)
- **Backups:** Encrypted with separate keys

### Sensitive Data Handling

**Never Log:**
- Passwords (plain or hashed)
- JWT tokens
- Credit card numbers
- API keys
- Personal identification numbers

**Masking Example:**
```typescript
logger.info('User login', {
  email: user.email,
  // Mask password - never log it
  ip: req.ip
});
```

### Data Minimization

Only collect and store data that's necessary:
- ✅ Email, name, phone (for account)
- ✅ Transaction amounts (for receipts)
- ❌ Don't store full credit card numbers
- ❌ Don't store plain-text passwords
- ❌ Don't store unnecessary personal data

---

## API Security

### Security Headers

**File:** [backend-api/src/middleware/security.middleware.ts](backend-api/src/middleware/security.middleware.ts)

#### Content Security Policy (CSP)

```typescript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://js.stripe.com"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.stripe.com"],
    frameSrc: ["'self'", "https://js.stripe.com"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: [],
  }
}
```

**Purpose:** Prevents XSS attacks by controlling resource loading

#### Other Headers

| Header | Purpose | Value |
|--------|---------|-------|
| `X-Frame-Options` | Prevent clickjacking | `DENY` |
| `X-Content-Type-Options` | Prevent MIME sniffing | `nosniff` |
| `X-XSS-Protection` | Enable browser XSS protection | `1; mode=block` |
| `Strict-Transport-Security` | Force HTTPS | `max-age=31536000` |
| `Referrer-Policy` | Control referer header | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Disable unnecessary features | `geolocation=(self)` |

### CORS Configuration

**File:** [backend-api/src/config/security.config.ts](backend-api/src/config/security.config.ts)

```typescript
cors({
  origin: ['https://yourdomain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400  // 24 hours
})
```

**Production Setup:**
```env
CORS_ORIGIN=https://boomcard.bg,https://www.boomcard.bg,https://app.boomcard.bg
```

**Important:** Never use `*` (wildcard) in production!

---

## Input Validation & Sanitization

### Request Validation

**Using express-validator:**

```typescript
import { body, validationResult } from 'express-validator';

// Validation rules
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

// Route with validation
router.post('/login', loginValidation, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Process login
});
```

### Input Sanitization

**File:** [backend-api/src/middleware/security.middleware.ts](backend-api/src/middleware/security.middleware.ts)

```typescript
// Automatic sanitization middleware
app.use(sanitizeInput);
```

**What it does:**
- Removes `<script>` tags
- Removes `javascript:` protocols
- Removes inline event handlers (`onclick=`, etc.)
- Trims whitespace
- Prevents XSS injection

### SQL Injection Protection

**Using Prisma ORM:**
```typescript
// ✅ SAFE - Prisma uses parameterized queries
const user = await prisma.user.findUnique({
  where: { email: req.body.email }
});

// ❌ DANGEROUS - Raw SQL (avoid unless necessary)
const users = await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;
```

**Prisma automatically:**
- Parameterizes all queries
- Escapes special characters
- Prevents SQL injection

---

## Rate Limiting

**File:** [backend-api/src/middleware/security.middleware.ts](backend-api/src/middleware/security.middleware.ts)

### Strategy by Endpoint

| Endpoint Type | Window | Max Requests | Purpose |
|--------------|--------|--------------|---------|
| Authentication | 15 min | 5 | Prevent brute force |
| Payments | 15 min | 10 | Prevent fraud |
| File Upload | 1 min | 5 | Prevent DoS |
| General API | 1 min | 30 | Fair usage |

### Implementation

```typescript
// Auth rate limiter
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // 5 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to routes
app.use('/api/auth/login', authRateLimiter);
app.use('/api/auth/register', authRateLimiter);
```

### Configuration

```env
# .env.production
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX_REQUESTS=5

API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX_REQUESTS=30
```

### Advanced: Redis-Based Rate Limiting

For distributed systems:

```typescript
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });

const limiter = rateLimit({
  store: new RedisStore({
    client,
    prefix: 'rl:',
  }),
  windowMs: 15 * 60 * 1000,
  max: 100,
});
```

---

## Security Headers

### Helmet.js Configuration

**Production Config:**

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com"],
      // ... other directives
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));
```

### Custom Headers

```typescript
// Additional security headers
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=()');
  next();
});
```

---

## Monitoring & Logging

### Winston Logger Setup

**File:** [backend-api/src/utils/logger.ts](backend-api/src/utils/logger.ts)

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

### Security Audit Logging

**File:** [backend-api/src/middleware/security.middleware.ts](backend-api/src/middleware/security.middleware.ts)

```typescript
// Log all security-relevant events
export const securityAuditLog = (req, res, next) => {
  const sensitiveEndpoints = ['/api/auth', '/api/payments', '/api/admin'];

  if (sensitiveEndpoints.some(ep => req.path.startsWith(ep))) {
    logger.info('Security Audit', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};
```

### Events to Log

**Always log:**
- ✅ Authentication attempts (success & failure)
- ✅ Authorization failures
- ✅ Payment transactions
- ✅ Data modifications (create, update, delete)
- ✅ Admin actions
- ✅ Rate limit violations
- ✅ Validation failures
- ✅ Server errors (500)

**Never log:**
- ❌ Passwords
- ❌ JWT tokens
- ❌ Credit card numbers
- ❌ API keys
- ❌ Personal identification numbers

### Error Tracking (Sentry)

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

---

## Production Checklist

### Pre-Deployment

- [ ] Generate new secure JWT secrets
- [ ] Change all default passwords and API keys
- [ ] Configure CORS for production domain
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/TLS
- [ ] Configure proper environment variables
- [ ] Test rate limiting is working
- [ ] Verify security headers are set
- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Enable database connection pooling
- [ ] Configure PostgreSQL with SSL
- [ ] Set up error tracking (Sentry)
- [ ] Configure logging to external service
- [ ] Set up monitoring and alerts
- [ ] Test authentication flow
- [ ] Test payment flow with Stripe test mode
- [ ] Review and minimize CORS origins
- [ ] Enable firewall rules
- [ ] Configure DDoS protection
- [ ] Set up automated backups
- [ ] Document all secrets in secure vault

### Post-Deployment

- [ ] Monitor error logs for first 24 hours
- [ ] Verify all endpoints are accessible
- [ ] Test rate limiting under load
- [ ] Monitor database performance
- [ ] Check SSL certificate validity
- [ ] Verify security headers with SSL Labs
- [ ] Run penetration testing
- [ ] Monitor for unusual traffic patterns
- [ ] Set up on-call rotation
- [ ] Document incident response procedures

---

## Incident Response

### Security Incident Types

1. **Data Breach**
2. **DDoS Attack**
3. **SQL Injection Attempt**
4. **Brute Force Attack**
5. **XSS/CSRF Attack**
6. **Unauthorized Access**

### Response Protocol

#### 1. Detection
- Monitor logs for suspicious activity
- Set up alerts for:
  - Multiple failed login attempts
  - Rate limit violations
  - 500 errors spike
  - Unusual traffic patterns

#### 2. Containment
- Block malicious IP addresses
- Disable compromised accounts
- Rotate affected credentials
- Enable maintenance mode if necessary

#### 3. Investigation
- Review audit logs
- Identify attack vector
- Assess damage scope
- Document timeline

#### 4. Recovery
- Restore from clean backup
- Patch vulnerabilities
- Reset affected passwords
- Re-enable services

#### 5. Post-Incident
- Write incident report
- Update security measures
- Notify affected users (if required by GDPR)
- Conduct lessons-learned meeting

### Emergency Contacts

```
Security Team Lead: [email/phone]
DevOps On-Call: [email/phone]
Database Admin: [email/phone]
Legal/Compliance: [email/phone]
```

---

## Security Testing

### Tools

1. **npm audit** - Dependency vulnerabilities
   ```bash
   npm audit
   npm audit fix
   ```

2. **OWASP ZAP** - Web application scanner
3. **Burp Suite** - Security testing
4. **SSL Labs** - SSL/TLS configuration
   - https://www.ssllabs.com/ssltest/
5. **Security Headers** - Check headers
   - https://securityheaders.com/

### Regular Security Tasks

| Task | Frequency | Owner |
|------|-----------|-------|
| Dependency updates | Weekly | DevOps |
| Security audit | Monthly | Security Team |
| Penetration testing | Quarterly | External Firm |
| Secret rotation | Every 90 days | DevOps |
| Access review | Quarterly | Admin |
| Backup testing | Monthly | DevOps |
| Incident drill | Quarterly | All Teams |

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0
**Maintained By:** Security Team
