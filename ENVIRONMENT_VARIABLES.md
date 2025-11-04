# BoomCard Platform - Environment Variables Guide

**Version:** 1.0.0
**Last Updated:** November 4, 2025
**Purpose:** Complete reference for all environment variables across the platform

---

## Overview

This document provides a comprehensive guide to all environment variables used in the BoomCard platform. Follow this guide to set up your development, staging, or production environment.

**Platform Components:**
1. **Backend API** (`backend-api/`) - Node.js/Express/Prisma
2. **Partner Dashboard** (`partner-dashboard/`) - React/Vite
3. **Mobile App** (`boomcard-mobile/`) - React Native/Expo

---

## 🎯 Quick Setup

### Development Environment

**Backend API:**
```bash
cd backend-api
cp .env.example .env
# Edit .env with your local values
```

**Partner Dashboard:**
```bash
cd partner-dashboard
cp .env.example .env
# Edit .env with your local values
```

**Mobile App:**
```bash
cd boomcard-mobile
cp .env.example .env
# Edit .env with your local values
```

---

## 🔧 Backend API Environment Variables

### Required Variables

#### Database
```bash
# PostgreSQL Connection String
DATABASE_URL="postgresql://username:password@localhost:5432/boomcard"

# Production (Render)
DATABASE_URL="postgresql://username:password@hostname.region.render.com/database_name"
```

**Format:** `postgresql://[user]:[password]@[host]:[port]/[database]`

**Where to find (Production):**
- Render Dashboard → PostgreSQL database → Connection details
- Copy "External Database URL"

---

#### Authentication

```bash
# JWT Secret (Access Tokens)
# Generate: openssl rand -base64 32
JWT_SECRET="your-secret-key-min-32-characters"

# JWT Refresh Secret (Refresh Tokens)
# Generate: openssl rand -base64 32
JWT_REFRESH_SECRET="different-secret-key-min-32-characters"

# Token Expiration
JWT_EXPIRATION="1h"           # Access token lifetime
JWT_REFRESH_EXPIRATION="7d"   # Refresh token lifetime
```

**Security Notes:**
- ⚠️ Secrets must be **different** between dev/staging/prod
- ⚠️ Never commit secrets to Git
- ⚠️ Use strong random values (min 32 characters)
- ✅ Rotate secrets quarterly

---

#### Application

```bash
# Node Environment
NODE_ENV="development"  # Options: development, staging, production

# Server Port
PORT=3001  # Default: 3001, Production: Set by Render automatically

# API Base URL
API_URL="http://localhost:3001"  # Development
API_URL="https://api.boomcard.bg"  # Production

# Frontend URL (for CORS)
FRONTEND_URL="http://localhost:5175"  # Development
FRONTEND_URL="https://dashboard.boomcard.bg"  # Production
```

---

#### AWS S3 (Image Storage)

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID="AKIA..."  # From AWS IAM
AWS_SECRET_ACCESS_KEY="secret..."  # From AWS IAM
AWS_REGION="eu-central-1"  # Frankfurt (closest to Bulgaria)

# S3 Bucket
AWS_S3_BUCKET="boomcard-receipts"  # Production bucket name
AWS_S3_BUCKET="boomcard-receipts-dev"  # Development bucket name
```

**Where to find:**
1. AWS Console → IAM → Users → Create User
2. Attach policy: `AmazonS3FullAccess` (or custom policy)
3. Security credentials → Create access key
4. S3 bucket must allow PutObject and GetObject

**Setup Guide:** See [AWS_S3_SETUP_GUIDE.md](AWS_S3_SETUP_GUIDE.md)

---

#### Paysera (Payment Processing)

```bash
# Paysera Project Configuration
PAYSERA_PROJECT_ID="123456"  # From Paysera dashboard
PAYSERA_SIGN_PASSWORD="your-sign-password"  # From Paysera dashboard

# Paysera URLs
PAYSERA_ACCEPT_URL="https://dashboard.boomcard.bg/payment/success"
PAYSERA_CANCEL_URL="https://dashboard.boomcard.bg/payment/cancel"
PAYSERA_CALLBACK_URL="https://api.boomcard.bg/api/webhooks/paysera"

# Paysera Test Mode
PAYSERA_TEST="1"  # Development/Staging: "1", Production: "0"
```

**Where to find:**
1. Login to [Paysera Business](https://www.paysera.com/business)
2. Project Settings → API
3. Project ID and Sign Password are displayed
4. Configure webhook URL in Paysera dashboard

**Setup Guide:** See [STRIPE_SETUP_GUIDE.md](STRIPE_SETUP_GUIDE.md) (contains Paysera setup)

---

### Optional Variables

#### Email (Resend - for notifications)

```bash
# Resend API Key
RESEND_API_KEY="re_..."  # From resend.com dashboard
RESEND_FROM_EMAIL="noreply@boomcard.bg"

# Email Templates
RESEND_TEMPLATE_WELCOME="template_..."
RESEND_TEMPLATE_RECEIPT="template_..."
```

**Status:** 🚧 Not yet implemented

---

#### Redis (Caching - future)

```bash
# Redis Connection
REDIS_URL="redis://username:password@hostname:6379"
```

**Status:** 🚧 Not yet implemented

---

#### Sentry (Error Tracking)

```bash
# Sentry DSN
SENTRY_DSN="https://...@sentry.io/..."
SENTRY_ENVIRONMENT="production"  # or "development", "staging"

# Sentry Configuration
SENTRY_TRACES_SAMPLE_RATE="0.1"  # 10% of transactions
SENTRY_SAMPLE_RATE="1.0"  # 100% of errors
```

**Where to find:**
1. [Sentry Dashboard](https://sentry.io) → Create Project
2. Project Settings → Client Keys (DSN)

---

#### OCR Service (Receipt Scanning - future)

```bash
# OCR API
OCR_API_KEY="your-ocr-api-key"
OCR_API_URL="https://api.ocr.space/parse/image"
```

**Status:** 🚧 Planned for Phase 6

---

## 🎨 Partner Dashboard Environment Variables

### Required Variables

```bash
# API Endpoint
VITE_API_URL="http://localhost:3001"  # Development
VITE_API_URL="https://api.boomcard.bg"  # Production

# Application Environment
VITE_ENV="development"  # Options: development, staging, production

# Public URL
VITE_PUBLIC_URL="http://localhost:5175"  # Development
VITE_PUBLIC_URL="https://dashboard.boomcard.bg"  # Production
```

**Note:** All environment variables in Vite must start with `VITE_` to be exposed to the browser.

---

### Optional Variables

```bash
# Analytics
VITE_GA_TRACKING_ID="G-XXXXXXXXXX"  # Google Analytics
VITE_HOTJAR_ID="XXXXXXX"  # Hotjar tracking

# Feature Flags
VITE_ENABLE_RECEIPTS="true"  # Enable receipt scanning feature
VITE_ENABLE_ANALYTICS="true"  # Enable analytics dashboard
VITE_ENABLE_PAYMENTS="true"  # Enable payment processing

# Sentry (Frontend Error Tracking)
VITE_SENTRY_DSN="https://...@sentry.io/..."
VITE_SENTRY_ENVIRONMENT="production"
```

---

## 📱 Mobile App Environment Variables

### Required Variables

```bash
# API Configuration
EXPO_PUBLIC_API_URL="http://localhost:3001"  # Development
EXPO_PUBLIC_API_URL="https://api.boomcard.bg"  # Production

# Application Configuration
EXPO_PUBLIC_ENV="development"  # Options: development, staging, production
EXPO_PUBLIC_APP_VERSION="1.0.0"

# Expo Configuration
EXPO_PUBLIC_PROJECT_ID="your-expo-project-id"
```

**Note:** All environment variables in Expo must start with `EXPO_PUBLIC_` to be exposed.

---

### Optional Variables

```bash
# Paysera Mobile
EXPO_PUBLIC_PAYSERA_PROJECT_ID="123456"

# Analytics
EXPO_PUBLIC_FIREBASE_API_KEY="AIza..."
EXPO_PUBLIC_FIREBASE_PROJECT_ID="boomcard-mobile"

# Sentry (Mobile Error Tracking)
EXPO_PUBLIC_SENTRY_DSN="https://...@sentry.io/..."
```

---

## 🌍 Environment-Specific Configurations

### Development

**Purpose:** Local development on your machine

**Backend (.env):**
```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/boomcard_dev
JWT_SECRET=dev-secret-key-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5175

# AWS (use dev bucket)
AWS_S3_BUCKET=boomcard-receipts-dev
AWS_ACCESS_KEY_ID=your-dev-access-key
AWS_SECRET_ACCESS_KEY=your-dev-secret-key
AWS_REGION=eu-central-1

# Paysera (test mode)
PAYSERA_PROJECT_ID=123456
PAYSERA_SIGN_PASSWORD=test-password
PAYSERA_TEST=1
PAYSERA_ACCEPT_URL=http://localhost:5175/payment/success
PAYSERA_CANCEL_URL=http://localhost:5175/payment/cancel
PAYSERA_CALLBACK_URL=http://localhost:3001/api/webhooks/paysera
```

**Frontend (.env):**
```bash
VITE_API_URL=http://localhost:3001
VITE_ENV=development
VITE_PUBLIC_URL=http://localhost:5175
VITE_ENABLE_RECEIPTS=true
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=true
```

**Mobile (.env):**
```bash
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_APP_VERSION=1.0.0
```

---

### Staging

**Purpose:** Pre-production testing environment

**Backend (.env):**
```bash
NODE_ENV=staging
PORT=3001
DATABASE_URL=postgresql://user:pass@staging-db.render.com/boomcard_staging
JWT_SECRET=staging-secret-key-different-from-prod
JWT_REFRESH_SECRET=staging-refresh-secret-different-from-prod
API_URL=https://api-staging.boomcard.bg
FRONTEND_URL=https://dashboard-staging.boomcard.bg

AWS_S3_BUCKET=boomcard-receipts-staging
AWS_ACCESS_KEY_ID=your-staging-access-key
AWS_SECRET_ACCESS_KEY=your-staging-secret-key
AWS_REGION=eu-central-1

PAYSERA_PROJECT_ID=123456
PAYSERA_SIGN_PASSWORD=staging-password
PAYSERA_TEST=1  # Still test mode
PAYSERA_ACCEPT_URL=https://dashboard-staging.boomcard.bg/payment/success
PAYSERA_CANCEL_URL=https://dashboard-staging.boomcard.bg/payment/cancel
PAYSERA_CALLBACK_URL=https://api-staging.boomcard.bg/api/webhooks/paysera

SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=staging
```

**Frontend (.env):**
```bash
VITE_API_URL=https://api-staging.boomcard.bg
VITE_ENV=staging
VITE_PUBLIC_URL=https://dashboard-staging.boomcard.bg
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_SENTRY_ENVIRONMENT=staging
```

---

### Production

**Purpose:** Live production environment serving real users

**Backend (Set in Render Dashboard → Environment):**
```bash
NODE_ENV=production
DATABASE_URL=<provided-by-render>
JWT_SECRET=<strong-random-32-char-secret>
JWT_REFRESH_SECRET=<different-strong-random-32-char-secret>
API_URL=https://api.boomcard.bg
FRONTEND_URL=https://dashboard.boomcard.bg

AWS_S3_BUCKET=boomcard-receipts
AWS_ACCESS_KEY_ID=<production-access-key>
AWS_SECRET_ACCESS_KEY=<production-secret-key>
AWS_REGION=eu-central-1

PAYSERA_PROJECT_ID=<production-project-id>
PAYSERA_SIGN_PASSWORD=<production-sign-password>
PAYSERA_TEST=0  # PRODUCTION MODE
PAYSERA_ACCEPT_URL=https://dashboard.boomcard.bg/payment/success
PAYSERA_CANCEL_URL=https://dashboard.boomcard.bg/payment/cancel
PAYSERA_CALLBACK_URL=https://api.boomcard.bg/api/webhooks/paysera

SENTRY_DSN=<production-sentry-dsn>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_SAMPLE_RATE=1.0
```

**Frontend (Set in Vercel Dashboard → Environment Variables):**
```bash
VITE_API_URL=https://api.boomcard.bg
VITE_ENV=production
VITE_PUBLIC_URL=https://dashboard.boomcard.bg
VITE_ENABLE_RECEIPTS=true
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=true
VITE_GA_TRACKING_ID=<google-analytics-id>
VITE_SENTRY_DSN=<production-sentry-dsn>
VITE_SENTRY_ENVIRONMENT=production
```

**Mobile (EAS Build Secrets):**
```bash
EXPO_PUBLIC_API_URL=https://api.boomcard.bg
EXPO_PUBLIC_ENV=production
EXPO_PUBLIC_APP_VERSION=1.0.0
EXPO_PUBLIC_PAYSERA_PROJECT_ID=<production-project-id>
EXPO_PUBLIC_SENTRY_DSN=<mobile-sentry-dsn>
```

---

## 🔐 Security Best Practices

### Secret Generation

```bash
# Generate strong JWT secrets
openssl rand -base64 32

# Generate strong database password
openssl rand -base64 24

# Generate API keys
openssl rand -hex 32
```

### Secret Management

✅ **DO:**
- Use different secrets for dev/staging/production
- Store secrets in environment variables
- Use secret management services (AWS Secrets Manager, HashiCorp Vault) for production
- Rotate secrets quarterly
- Use `.env.example` with placeholder values for documentation

❌ **DON'T:**
- Commit `.env` files to Git
- Share secrets in Slack/Email
- Use weak or predictable secrets
- Reuse secrets across environments
- Store secrets in source code

### .gitignore

**Ensure these are in `.gitignore`:**
```
.env
.env.local
.env.*.local
.env.development
.env.staging
.env.production
*.pem
*.key
```

---

## 📋 Environment Variable Checklist

### Pre-Deployment Checklist

#### Backend
- [ ] `DATABASE_URL` is set and connection works
- [ ] `JWT_SECRET` is strong (min 32 chars) and unique
- [ ] `JWT_REFRESH_SECRET` is different from JWT_SECRET
- [ ] `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are valid
- [ ] `AWS_S3_BUCKET` exists and is accessible
- [ ] `PAYSERA_PROJECT_ID` and `PAYSERA_SIGN_PASSWORD` are correct
- [ ] `PAYSERA_TEST` is set to "0" for production
- [ ] `PAYSERA_CALLBACK_URL` is correct and accessible
- [ ] `SENTRY_DSN` is configured (production)
- [ ] `NODE_ENV` is set to "production"

#### Frontend
- [ ] `VITE_API_URL` points to correct backend
- [ ] `VITE_ENV` is set correctly
- [ ] `VITE_SENTRY_DSN` is configured (production)
- [ ] All `VITE_ENABLE_*` flags are set correctly

#### Mobile
- [ ] `EXPO_PUBLIC_API_URL` points to correct backend
- [ ] `EXPO_PUBLIC_ENV` is set correctly
- [ ] `EXPO_PUBLIC_APP_VERSION` matches app version
- [ ] Secrets are configured in EAS (not in code)

---

## 🛠️ How to Set Environment Variables

### Render (Backend API)

1. Login to [Render Dashboard](https://dashboard.render.com)
2. Select "boomcard-backend" service
3. Click "Environment" in left sidebar
4. Click "Add Environment Variable"
5. Enter Key and Value
6. Click "Save Changes"
7. Service will automatically redeploy

**Important:** Changes trigger automatic redeployment (~2-3 minutes)

---

### Vercel (Partner Dashboard)

1. Login to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select "boomcard-dashboard" project
3. Click "Settings" → "Environment Variables"
4. Add variable:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://api.boomcard.bg`
   - **Environments:** Select "Production"
5. Click "Save"
6. Redeploy for changes to take effect

**Important:** Must redeploy after adding variables

---

### EAS Build (Mobile App)

**Option 1: eas.json (Recommended)**
```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.boomcard.bg",
        "EXPO_PUBLIC_ENV": "production"
      }
    }
  }
}
```

**Option 2: EAS Secrets (for sensitive data)**
```bash
# Set secret
eas secret:create --scope project --name EXPO_PUBLIC_PAYSERA_PROJECT_ID --value "123456"

# List secrets
eas secret:list

# Delete secret
eas secret:delete --name EXPO_PUBLIC_PAYSERA_PROJECT_ID
```

---

## 🧪 Testing Environment Variables

### Backend

```bash
# Test all environment variables are loaded
cd backend-api
node -e "
  require('dotenv').config();
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'PAYSERA_PROJECT_ID',
    'PAYSERA_SIGN_PASSWORD'
  ];
  required.forEach(key => {
    if (!process.env[key]) {
      console.error('❌ Missing:', key);
    } else {
      console.log('✅', key, '(set)');
    }
  });
"
```

### Frontend

```bash
# Test Vite environment variables
cd partner-dashboard
npm run dev
# Check browser console for window.env or import.meta.env
```

### Mobile

```bash
# Test Expo environment variables
cd boomcard-mobile
npx expo start
# Check app logs for process.env values
```

---

## 📚 Related Documentation

- **AWS S3 Setup:** [AWS_S3_SETUP_GUIDE.md](AWS_S3_SETUP_GUIDE.md)
- **Paysera Setup:** [STRIPE_SETUP_GUIDE.md](STRIPE_SETUP_GUIDE.md)
- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Security Checklist:** [SECURITY_AUDIT_CHECKLIST.md](SECURITY_AUDIT_CHECKLIST.md)
- **Operations Guide:** [OPERATIONS_QUICK_REFERENCE.md](OPERATIONS_QUICK_REFERENCE.md)

---

## 🆘 Troubleshooting

### Common Issues

**Issue: "DATABASE_URL is not defined"**
```bash
# Solution: Check .env file exists
ls -la backend-api/.env

# If missing, create it
cd backend-api
cp .env.example .env
# Edit .env with your values
```

**Issue: "JWT_SECRET must be at least 32 characters"**
```bash
# Solution: Generate strong secret
openssl rand -base64 32

# Update .env
# JWT_SECRET=<paste-generated-secret-here>
```

**Issue: "Cannot connect to S3 bucket"**
```bash
# Solution: Test AWS credentials
aws s3 ls s3://boomcard-receipts --profile boomcard

# If fails, check:
# 1. AWS_ACCESS_KEY_ID is correct
# 2. AWS_SECRET_ACCESS_KEY is correct
# 3. Bucket name is correct
# 4. IAM user has S3 permissions
```

**Issue: "Paysera signature verification failed"**
```bash
# Solution: Check environment variables
echo $PAYSERA_PROJECT_ID
echo $PAYSERA_SIGN_PASSWORD

# Verify they match Paysera dashboard values
```

**Issue: "CORS error when frontend calls backend"**
```bash
# Solution: Check FRONTEND_URL in backend .env
# Must match the frontend URL exactly (including protocol)

# Backend .env:
FRONTEND_URL=http://localhost:5175  # Development
FRONTEND_URL=https://dashboard.boomcard.bg  # Production
```

---

## 📝 .env.example Templates

### Backend (.env.example)

```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/boomcard

# Authentication
JWT_SECRET=generate-random-32-char-secret-here
JWT_REFRESH_SECRET=generate-different-random-32-char-secret-here
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

# Application
NODE_ENV=development
PORT=3001
API_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5175

# AWS S3
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_REGION=eu-central-1
AWS_S3_BUCKET=boomcard-receipts-dev

# Paysera
PAYSERA_PROJECT_ID=your-project-id
PAYSERA_SIGN_PASSWORD=your-sign-password
PAYSERA_TEST=1
PAYSERA_ACCEPT_URL=http://localhost:5175/payment/success
PAYSERA_CANCEL_URL=http://localhost:5175/payment/cancel
PAYSERA_CALLBACK_URL=http://localhost:3001/api/webhooks/paysera

# Optional: Sentry
# SENTRY_DSN=https://...@sentry.io/...
# SENTRY_ENVIRONMENT=development
```

### Frontend (.env.example)

```bash
# API Configuration
VITE_API_URL=http://localhost:3001
VITE_ENV=development
VITE_PUBLIC_URL=http://localhost:5175

# Feature Flags
VITE_ENABLE_RECEIPTS=true
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_PAYMENTS=true

# Optional: Analytics
# VITE_GA_TRACKING_ID=G-XXXXXXXXXX
# VITE_SENTRY_DSN=https://...@sentry.io/...
```

### Mobile (.env.example)

```bash
# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_APP_VERSION=1.0.0

# Optional: Analytics
# EXPO_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

---

**Document Owner:** DevOps Team
**Last Updated:** November 4, 2025
**Next Review:** December 4, 2025

**🤖 Generated with [Claude Code](https://claude.com/claude-code)**
