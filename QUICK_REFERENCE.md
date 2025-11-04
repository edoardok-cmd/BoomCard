# BOOM Card - Quick Reference Card

## ⚡ Deploy in 15 Minutes

```bash
# 1. Secrets
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# 2. Database Migration
npm run migrate:export && npm run migrate:import

# 3. Deploy Backend (Railway)
railway login && railway up

# 4. Deploy Frontend (Vercel)  
cd partner-dashboard && vercel --prod
```

---

## 📦 What's Included

| Feature | Files | Status |
|---------|-------|--------|
| PostgreSQL | 4 files | ✅ |
| E2E Tests | 115+ tests | ✅ |
| Security | 6 files | ✅ |
| Deployment | 7 configs | ✅ |
| CI/CD | GitHub Actions | ✅ |

---

## 🔑 Critical Files

```
.env.production.template   → Production environment
docker-compose.yml         → Local development
Dockerfile                 → Backend container
railway.json               → Railway deploy
vercel.json                → Vercel deploy
.github/workflows/ci-cd.yml → CI/CD pipeline
```

---

## 🧪 Run Tests

```bash
# All E2E tests
npx playwright test

# Specific suite
npx playwright test auth-flow.spec.ts

# With UI
npx playwright test --ui
```

---

## 🔒 Security Checklist

- [ ] Generate 64-byte JWT secrets
- [ ] Configure CORS_ORIGIN
- [ ] Enable HTTPS/SSL
- [ ] Set NODE_ENV=production  
- [ ] Run `npm audit`
- [ ] Test at securityheaders.com

---

## 🌐 Platform URLs

**After deployment:**
- Backend: https://boomcard-api.up.railway.app
- Frontend: https://boomcard.vercel.app
- Health: https://boomcard-api.up.railway.app/health

---

## 📖 Documentation

| Guide | Purpose |
|-------|---------|
| COMPLETE_PRODUCTION_GUIDE.md | Start here |
| DEPLOYMENT_GUIDE.md | Deploy steps |
| SECURITY_CHECKLIST.md | Security items |
| E2E_TESTING_GUIDE.md | Testing guide |

---

## 🚨 Troubleshooting

**CORS error?**
```env
CORS_ORIGIN=https://your-frontend.vercel.app
```

**Database error?**
```bash
railway run npx prisma migrate deploy
```

**Tests failing?**
```bash
npx playwright install --with-deps
```

---

## 📞 Get Help

1. Check `/health` endpoint
2. View platform logs (Railway/Vercel dashboard)
3. Review error tracking (Sentry)
4. Check documentation guides

---

**Status:** ✅ PRODUCTION READY  
**Version:** 1.0.0  
**Updated:** 2025-01-04
