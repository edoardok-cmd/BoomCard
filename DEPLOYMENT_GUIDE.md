# BOOM Card - Complete Deployment Guide

## 🚀 Quick Start (15 Minutes to Production)

**Fastest path:**
1. Push to GitHub
2. Deploy backend to Railway (auto-detects from `railway.json`)
3. Deploy frontend to Vercel (uses `vercel.json`)
4. Configure environment variables
5. Done! ✅

---

## Deployment Options

| Platform | Best For | Difficulty | Free Tier |
|----------|----------|------------|-----------|
| Railway + Vercel | **Recommended** | Easy | Yes |
| Render | Good alternative | Easy | Limited |
| Docker | Self-hosted | Medium | N/A |
| AWS/GCP | Enterprise | Hard | Limited |

---

## Railway + Vercel Deployment (Recommended)

### Backend on Railway

1. **Sign up**: https://railway.app
2. **New Project** > Deploy from GitHub
3. **Select repo**: boom card
4. Railway auto-detects and builds!

**Add PostgreSQL:**
- In project, click "+ New"
- Select "PostgreSQL"
- DATABASE_URL automatically linked

**Set Environment Variables:**
```env
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('base64'))">
REFRESH_TOKEN_SECRET=<different 64-byte secret>
CORS_ORIGIN=https://your-vercel-app.vercel.app
STRIPE_SECRET_KEY=sk_live_xxx
```

**Your backend URL:** https://boomcard-backend.up.railway.app

### Frontend on Vercel

```bash
cd partner-dashboard
npm install -g vercel
vercel

# Set environment variable:
VITE_API_URL=https://boomcard-backend.up.railway.app
```

**Deploy to production:**
```bash
vercel --prod
```

**Your frontend URL:** https://boomcard.vercel.app

---

## Docker Deployment

### Local Development

```bash
# Start everything (PostgreSQL, Redis, Backend, Frontend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Production

```bash
# Build
docker build -t boomcard-backend backend-api/

# Run
docker run -d -p 3001:3001 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  boomcard-backend
```

---

## CI/CD Pipeline

**File:** `.github/workflows/ci-cd.yml`

**Automatic on every push:**
- ✅ Run backend tests
- ✅ Run frontend tests  
- ✅ Run E2E tests (Playwright)
- ✅ Security audit
- ✅ Build Docker image
- ✅ Deploy to staging (develop branch)
- ✅ Deploy to production (main branch)

**Setup GitHub Secrets:**
```
DOCKER_USERNAME
DOCKER_PASSWORD
RAILWAY_TOKEN
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

---

## Post-Deployment Checklist

- [ ] Test health endpoint: `curl https://api.boomcard.bg/health`
- [ ] Test login flow
- [ ] Test receipt scanning
- [ ] Test Stripe payment
- [ ] Set up monitoring (Sentry, UptimeRobot)
- [ ] Configure backups
- [ ] Add custom domain
- [ ] Enable SSL (auto with Vercel/Railway)

---

## Troubleshooting

**CORS errors:**
```env
# Backend: Set CORS_ORIGIN to your frontend URL
CORS_ORIGIN=https://boomcard.vercel.app
```

**Database connection failed:**
```bash
# Check DATABASE_URL format
postgresql://user:password@host:5432/database
```

**Migrations not applied:**
```bash
railway run npx prisma migrate deploy
```

---

## Platform URLs

After deployment, you'll have:

- **Backend API:** https://boomcard-backend.up.railway.app
- **Frontend:** https://boomcard.vercel.app  
- **Database:** Managed by Railway
- **Admin:** https://railway.app (backend logs)
- **Frontend Admin:** https://vercel.com (frontend logs)

---

## Files Created

- ✅ `backend-api/Dockerfile` - Production Docker image
- ✅ `backend-api/.dockerignore` - Optimize build
- ✅ `docker-compose.yml` - Local development stack
- ✅ `.github/workflows/ci-cd.yml` - CI/CD pipeline
- ✅ `backend-api/railway.json` - Railway config
- ✅ `backend-api/render.yaml` - Render config
- ✅ `partner-dashboard/vercel.json` - Vercel config

---

## Need Help?

1. Check platform logs (Railway/Vercel dashboard)
2. Review [Security Checklist](SECURITY_CHECKLIST.md)
3. Review [PostgreSQL Migration Guide](POSTGRESQL_MIGRATION_GUIDE.md)
4. Contact platform support

---

**Last Updated:** 2025-01-04
