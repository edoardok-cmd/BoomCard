# 🚀 BoomCard - Quick Deploy to Free Hosting

**5-Minute Setup Guide** - Deploy both frontend and backend to free hosting!

---

## 🎯 What You'll Get

- **Backend API:** Deployed to Render.com (Free tier)
- **PostgreSQL Database:** Free database on Render
- **Frontend Dashboard:** Deployed to Vercel (Free tier)
- **Live URLs:** Both publicly accessible with HTTPS

---

## Part 1: Push to GitHub (2 minutes)

### Create GitHub Repository

```bash
cd /Users/administrator/Documents/BoomCard

# Initialize git
git init
git add .
git commit -m "BoomCard platform - ready for deployment"

# Create repository on GitHub.com:
# 1. Go to: https://github.com/new
# 2. Name: boomcard-platform
# 3. Private or Public
# 4. Don't initialize with README
# 5. Create repository

# Push code (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/boomcard-platform.git
git branch -M main
git push -u origin main
```

---

## Part 2: Deploy Backend to Render (5 minutes)

### 1. Create Account
- Go to: https://render.com
- Click "Get Started for Free"
- Sign up with GitHub (easiest)

### 2. Create PostgreSQL Database
1. Dashboard → Click "New +" → "PostgreSQL"
2. Settings:
   - Name: `boomcard-db`
   - Database: `boomcard_production`
   - Region: Oregon (US West)
   - Plan: **Free**
3. Click "Create Database"
4. **Wait 2-3 minutes** for provisioning
5. **Copy "Internal Database URL"** - you'll need it!

### 3. Deploy Backend Web Service
1. Dashboard → Click "New +" → "Web Service"
2. Connect your `boomcard-platform` repository
3. Settings:
   - Name: `boomcard-api`
   - Region: Oregon
   - Branch: `main`
   - Root Directory: `backend-api`
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run deploy`
   - Plan: **Free**
4. Click "Advanced" → Add Environment Variables:

```bash
NODE_ENV=production
PORT=10000
DATABASE_URL=<paste-the-internal-database-url-from-step-2>
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=*
```

**Generate secure secrets:**
```bash
# Run these to generate random secrets
openssl rand -base64 32
openssl rand -base64 32
```

5. Click "Create Web Service"
6. **Wait 5-10 minutes** for deployment

### 4. Your Backend is Live!

Your API URL: `https://boomcard-api.onrender.com`

Test it:
```bash
curl https://boomcard-api.onrender.com/health
```

---

## Part 3: Deploy Frontend to Vercel (3 minutes)

### 1. Create Production Config

```bash
cd /Users/administrator/Documents/BoomCard/partner-dashboard

# Create production environment
cat > .env.production << 'EOF'
VITE_API_BASE_URL=https://boomcard-api.onrender.com/api
VITE_WS_URL=wss://boomcard-api.onrender.com
VITE_APP_ENVIRONMENT=production
VITE_ENABLE_DEBUG_MODE=false
EOF
```

### 2. Deploy to Vercel

**Option A: Using CLI (Fastest)**
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd partner-dashboard
vercel --prod

# Answer prompts:
# - Setup and deploy? YES
# - Project name: boomcard-dashboard
# - Directory: ./ (just press Enter)
```

**Option B: Using Dashboard**
1. Go to: https://vercel.com
2. Click "Add New" → "Project"
3. Import `boomcard-platform` repository
4. Settings:
   - Project Name: `boomcard-dashboard`
   - Framework: Vite
   - Root Directory: `partner-dashboard`
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Environment Variables (copy from .env.production file above)
6. Click "Deploy"

### 3. Your Frontend is Live!

Your Dashboard URL: `https://boomcard-dashboard.vercel.app`

---

## Part 4: Final Setup (2 minutes)

### Update CORS

1. Go back to Render dashboard
2. Select `boomcard-api` service
3. Environment tab
4. Change `CORS_ORIGIN` from `*` to:
   ```
   https://boomcard-dashboard.vercel.app
   ```
5. Save (service will restart)

### Test Everything

1. Open: `https://boomcard-dashboard.vercel.app`
2. Try to register a new account
3. Login with that account
4. Check if dashboard loads

---

## 🎉 You're Done!

**Your Live URLs:**
- Frontend: `https://boomcard-dashboard.vercel.app`
- Backend API: `https://boomcard-api.onrender.com`
- API Health: `https://boomcard-api.onrender.com/health`

---

## ⚠️ Important Notes

### Free Tier Limitations

**Render.com:**
- Backend sleeps after 15 min of inactivity
- First request takes 30-60 seconds to wake up
- Database expires after 90 days (but free to recreate)

**Vercel:**
- No limitations for your use case!
- 100 GB bandwidth/month
- Unlimited deployments

### Keeping Backend Awake

The backend will sleep on free tier. To keep it awake:

1. **UptimeRobot** (free service):
   - Sign up at: https://uptimerobot.com
   - Add monitor: `https://boomcard-api.onrender.com/health`
   - Check interval: 14 minutes
   - Keeps your backend awake 24/7!

2. **Or Upgrade to Render Starter Plan** ($7/month):
   - Always on (no sleep)
   - Better performance
   - Custom domains

---

## 🔧 Quick Commands

### Update Backend
```bash
cd backend-api
git add .
git commit -m "Update backend"
git push
# Render auto-deploys!
```

### Update Frontend
```bash
cd partner-dashboard
git add .
git commit -m "Update frontend"
git push
# Vercel auto-deploys!
```

### View Logs
- **Render:** Dashboard → Service → Logs tab
- **Vercel:** Dashboard → Deployment → Function Logs

### Database Access
- **Render:** Dashboard → Database → Connect → Use psql command
- **Or use Prisma Studio locally:**
  ```bash
  # Set DATABASE_URL to your Render database URL
  DATABASE_URL="postgresql://..." npx prisma studio
  ```

---

## 🆘 Troubleshooting

### "Backend not responding"
- Free tier sleeps after 15 min
- First request takes 30-60s to wake
- Solution: Wait 60 seconds and try again

### "CORS error"
- Check CORS_ORIGIN in Render matches your Vercel URL exactly
- Make sure it's `https://` not `http://`

### "Database connection failed"
- Verify DATABASE_URL is correct
- Use "Internal Database URL" from Render (not External)

### "Frontend won't load"
- Check build logs in Vercel
- Verify environment variables are set
- Try redeploying

---

## 📞 Need Help?

- **Render Docs:** https://render.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **GitHub Issues:** Create issue in your repo

---

**Last Updated:** October 13, 2025
**Deployment Time:** ~10-15 minutes total
**Cost:** $0/month (100% free!)
