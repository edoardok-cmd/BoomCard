# Render Deployment Guide for BoomCard Backend API

## Step-by-Step Deployment

### 1. Access Render Dashboard

Go to: https://dashboard.render.com/

**If you already have a Render account:**
- Login with your credentials

**If this is your first time:**
- Sign up (free for starter plan)
- Verify your email

---

### 2. Create New Web Service from Blueprint

#### Option A: Use Blueprint (Recommended - Automated Setup)

1. Click **"New +"** → **"Blueprint"**
2. Connect your GitHub repository:
   - Repository: `https://github.com/edoardok-cmd/BoomCard`
   - Branch: `master`
3. Render will detect `render.yaml` automatically
4. Click **"Apply"**

This will create:
- ✅ PostgreSQL Database (`boomcard-postgres`)
- ✅ Redis Cache (`boomcard-redis`)
- ✅ Web Service (`boomcard-api`)

#### Option B: Manual Setup (Alternative)

1. Click **"New +"** → **"Web Service"**
2. Connect repository: `https://github.com/edoardok-cmd/BoomCard`
3. Configure settings:
   - **Name**: `boomcard-api`
   - **Region**: `Frankfurt` (EU)
   - **Branch**: `master`
   - **Root Directory**: `backend-api`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm start`
   - **Instance Type**: `Starter` ($7/month)

---

### 3. Configure Environment Variables

In the Render dashboard, go to **Environment** tab and add these variables:

#### Required Variables (Must Set):

```env
NODE_ENV=production
PORT=3000

# Database (Auto-populated by Render if using Blueprint)
DATABASE_URL=<from Render database>

# Redis (Auto-populated by Render if using Blueprint)
REDIS_URL=<from Render Redis>

# JWT Secrets (IMPORTANT: Generate secure values)
JWT_SECRET=<generate-a-long-random-string-at-least-32-chars>
REFRESH_TOKEN_SECRET=<generate-another-long-random-string>

# Stripe (Get from Stripe Dashboard: https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# AWS S3 (Get from AWS Console)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=eu-west-1
AWS_S3_BUCKET=boomcard-receipts-prod

# CORS (Your frontend URLs)
CORS_ORIGIN=https://boomcard.vercel.app,https://app.boomcard.bg

# Email (Get from SendGrid: https://app.sendgrid.com)
SENDGRID_API_KEY=SG.YOUR_SENDGRID_KEY
SENDGRID_FROM_EMAIL=noreply@boomcard.bg

# Optional: Monitoring
SENTRY_DSN=<your_sentry_dsn>
LOG_LEVEL=info
```

#### How to Generate Secure Secrets:

**For JWT_SECRET and REFRESH_TOKEN_SECRET:**
```bash
# Run in terminal to generate random strings
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 4. Create Database & Redis (If Not Using Blueprint)

#### PostgreSQL Database:
1. **"New +"** → **"PostgreSQL"**
2. **Name**: `boomcard-postgres`
3. **Database**: `boomcard`
4. **User**: `boomcard_user`
5. **Region**: `Frankfurt`
6. **Plan**: `Starter` ($7/month)
7. Click **"Create Database"**
8. Copy the **Internal Database URL**
9. Add to `DATABASE_URL` environment variable

#### Redis:
1. **"New +"** → **"Redis"**
2. **Name**: `boomcard-redis`
3. **Region**: `Frankfurt`
4. **Plan**: `Starter` (25MB - $10/month)
5. Click **"Create Redis"**
6. Copy the **Redis URL**
7. Add to `REDIS_URL` environment variable

---

### 5. Deploy

1. **Save** all environment variables
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Wait for build to complete (~5-10 minutes)

**Monitor the deployment:**
- Click on **"Logs"** tab to see build progress
- Look for: `✅ Database connected successfully`
- And: `🚀 BoomCard API Server started on port 3000`

---

### 6. Verify Deployment

Once deployed, test your API:

```bash
# Health check
curl https://boomcard-api.onrender.com/health

# Should return:
# {"status":"ok","message":"BoomCard API is running",...}

# Detailed health
curl https://boomcard-api.onrender.com/api/health

# Test login
curl -X POST https://boomcard-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boomcard.com","password":"password123"}'
```

---

### 7. Configure Stripe Webhooks

1. Go to: https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. **Endpoint URL**: `https://boomcard-api.onrender.com/api/webhooks/stripe`
4. **Events to send**: Select all payment-related events
5. Copy the **Signing secret**
6. Update `STRIPE_WEBHOOK_SECRET` in Render environment variables

---

### 8. Your Deployed URLs

After successful deployment:

- **API Base URL**: `https://boomcard-api.onrender.com`
- **Health Check**: `https://boomcard-api.onrender.com/health`
- **API Docs**: `https://boomcard-api.onrender.com/api-docs`
- **Stripe Webhook**: `https://boomcard-api.onrender.com/api/webhooks/stripe`

---

## Important Notes

### Security Checklist:
- ✅ Change all default secrets
- ✅ Set strong JWT secrets (32+ characters)
- ✅ Restrict CORS to your actual frontend URLs
- ✅ Enable database backups
- ✅ Set up monitoring (Sentry)
- ✅ Review and restrict database IP allowlist

### Performance:
- **Cold starts**: Starter plan may have 30-60 second cold starts
- **Upgrade to Standard**: For production, upgrade to Standard plan ($25/month) for:
  - No cold starts
  - More RAM/CPU
  - Zero-downtime deploys

### Monitoring:
- Check **"Logs"** tab regularly for errors
- Set up **"Alerts"** in Render dashboard
- Monitor database size and connections

### Costs (Monthly):
- Web Service (Starter): ~$7
- PostgreSQL (Starter): ~$7
- Redis (Starter): ~$10
- **Total**: ~$24/month

---

## Troubleshooting

### Build Fails:
- Check **Logs** for errors
- Verify `package.json` has all dependencies
- Ensure Prisma schema is valid
- Check Node version compatibility

### Database Connection Fails:
- Verify `DATABASE_URL` is set correctly
- Check database is in same region
- Review Prisma connection settings

### 502 Bad Gateway:
- Check if app is listening on correct PORT
- Verify `process.env.PORT` is used in server.ts
- Check logs for startup errors

### Migration Fails:
- Ensure database is empty or migrations are in order
- Try manual migration: `npx prisma migrate deploy`
- Check Prisma schema for errors

---

## Next Steps After Deployment

1. **Update Mobile App**: Change `EXPO_PUBLIC_API_URL` to Render URL
2. **Test All Endpoints**: Login, receipts, payments, etc.
3. **Set Up Monitoring**: Configure Sentry or similar
4. **Create Admin User**: Use Prisma Studio or SQL
5. **Test Stripe Integration**: Make test payments
6. **Configure S3**: Upload test receipts
7. **Set Up CI/CD**: Auto-deploy on git push

---

## Auto-Deploy on Git Push

Render automatically deploys when you push to `master`:

```bash
git add .
git commit -m "Update backend"
git push origin master
```

Render will:
1. Detect the push
2. Build the app
3. Run migrations
4. Deploy new version
5. Health check
6. Switch traffic to new version

---

## Need Help?

- **Render Docs**: https://render.com/docs
- **Render Community**: https://community.render.com
- **Prisma Docs**: https://www.prisma.io/docs
- **BoomCard Issues**: https://github.com/edoardok-cmd/BoomCard/issues
