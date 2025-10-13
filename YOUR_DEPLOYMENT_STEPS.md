# 🚀 Your BoomCard Deployment - Ready to Go Live!

**GitHub Repository:** https://github.com/edoardok-cmd/BoomCard
**Status:** ✅ Code pushed and ready for deployment

---

## ✅ Step 1: Code is on GitHub (DONE!)

Your code is now live at: https://github.com/edoardok-cmd/BoomCard

All files including your backend API and frontend dashboard have been pushed successfully!

---

## 🎯 Step 2: Deploy Backend to Render.com (5 minutes)

### A. Create Render Account

1. Go to: **https://render.com**
2. Click **"Get Started for Free"**
3. Sign up with **GitHub** (easiest - it will connect to your repo automatically)
4. Authorize Render to access your GitHub repositories

### B. Create PostgreSQL Database

1. From Render Dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name:** `boomcard-db`
   - **Database:** `boomcard_production`
   - **Region:** Oregon (US West) - free region
   - **PostgreSQL Version:** 16 (latest)
   - **Plan:** Select **"Free"**
3. Click **"Create Database"**
4. **Wait 2-3 minutes** for database to provision
5. Once ready, click on your database and copy the **"Internal Database URL"**
   - It looks like: `postgresql://boomcard_db_user:password@hostname/boomcard_production`
   - **Keep this URL handy - you'll need it in the next step!**

### C. Deploy Backend Web Service

1. From Dashboard, click **"New +"** → **"Web Service"**
2. Click **"Connect a repository"**
3. Find and select: **"edoardok-cmd/BoomCard"**
4. Configure the service:
   - **Name:** `boomcard-api`
   - **Region:** Oregon (US West)
   - **Branch:** `master`
   - **Root Directory:** `backend-api`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run deploy`
   - **Plan:** **Free**

5. Click **"Advanced"** to add environment variables

6. **Add these Environment Variables** (click "Add Environment Variable" for each):

```
NODE_ENV=production
```

```
PORT=10000
```

```
DATABASE_URL=<PASTE YOUR INTERNAL DATABASE URL FROM STEP B.5 HERE>
```

```
JWT_SECRET=boomcard-super-secret-jwt-key-2025-production-v1-change-this
```

```
JWT_REFRESH_SECRET=boomcard-super-secret-refresh-key-2025-production-v1-change-this
```

```
JWT_EXPIRES_IN=1h
```

```
JWT_REFRESH_EXPIRES_IN=7d
```

```
CORS_ORIGIN=*
```

```
RATE_LIMIT_WINDOW_MS=900000
```

```
RATE_LIMIT_MAX_REQUESTS=100
```

**Note:** The JWT secrets above are examples. For better security, you can generate random ones:
```bash
openssl rand -base64 32  # Generate secure random string
```

7. Click **"Create Web Service"**

8. **Wait 5-10 minutes** for deployment
   - You'll see the build logs in real-time
   - Watch for "Build successful" and "Deploy live" messages

9. Once deployed, your API will be at:
   ```
   https://boomcard-api.onrender.com
   ```

### D. Test Your Backend

```bash
# Test health endpoint
curl https://boomcard-api.onrender.com/health

# Expected response:
# {"status":"ok","timestamp":"...","environment":"production"}
```

If you see the response above, **your backend is live! 🎉**

---

## 🌐 Step 3: Deploy Frontend to Vercel (3 minutes)

### A. Create Vercel Account

1. Go to: **https://vercel.com**
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"**
4. Authorize Vercel to access your GitHub account

### B. Deploy Frontend

1. From Vercel Dashboard, click **"Add New..."** → **"Project"**
2. Click **"Import"** next to **"edoardok-cmd/BoomCard"**
3. Configure the project:
   - **Project Name:** `boomcard-dashboard`
   - **Framework Preset:** Vite
   - **Root Directory:** Click **"Edit"** and enter: `partner-dashboard`
   - **Build Command:** `npm run build` (should be auto-detected)
   - **Output Directory:** `dist` (should be auto-detected)
   - **Install Command:** `npm install` (should be auto-detected)

4. **Add Environment Variables** (click "Add" for each):

Click **"Environment Variables"** section and add:

**Key:** `VITE_API_BASE_URL`
**Value:** `https://boomcard-api.onrender.com/api`

**Key:** `VITE_WS_URL`
**Value:** `wss://boomcard-api.onrender.com`

**Key:** `VITE_APP_ENVIRONMENT`
**Value:** `production`

**Key:** `VITE_ENABLE_DEBUG_MODE`
**Value:** `false`

**Key:** `VITE_APP_NAME`
**Value:** `BoomCard`

**Key:** `VITE_ENABLE_ANALYTICS`
**Value:** `true`

5. Click **"Deploy"**

6. **Wait 2-3 minutes** for deployment

7. Once done, Vercel will show you your live URL:
   ```
   https://boomcard-dashboard.vercel.app
   ```

### C. Test Your Frontend

Open in your browser:
```
https://boomcard-dashboard.vercel.app
```

You should see your BoomCard dashboard! 🎉

---

## 🔧 Step 4: Update CORS Settings (1 minute)

Now that you know your frontend URL, update the backend CORS:

1. Go back to **Render Dashboard**
2. Click on your **"boomcard-api"** service
3. Go to **"Environment"** tab
4. Find **"CORS_ORIGIN"**
5. Click **"Edit"** and change from `*` to:
   ```
   https://boomcard-dashboard.vercel.app
   ```
6. Click **"Save Changes"**
7. Service will automatically redeploy (takes ~2 minutes)

---

## ✅ Step 5: Test Everything Works

### Test Backend API
```bash
# Health check
curl https://boomcard-api.onrender.com/health

# Register a test user
curl -X POST https://boomcard-api.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234","firstName":"Test"}'
```

### Test Frontend
1. Open: https://boomcard-dashboard.vercel.app
2. Try to register a new account
3. Login with that account
4. Check if the dashboard loads
5. Open browser console (F12) - should have no errors

---

## 🎉 You're Live!

**Your BoomCard Platform URLs:**

- **Frontend Dashboard:** https://boomcard-dashboard.vercel.app
- **Backend API:** https://boomcard-api.onrender.com
- **API Health:** https://boomcard-api.onrender.com/health
- **API Docs:** https://boomcard-api.onrender.com (shows available endpoints)

---

## 💡 Important: Keep Backend Awake (Free Tier)

**Problem:** Free tier backends sleep after 15 minutes of inactivity. First request takes 30-60 seconds to wake up.

**Solution:** Use UptimeRobot (free) to ping your backend every 14 minutes:

1. Go to: **https://uptimerobot.com**
2. Sign up (free account)
3. Click **"Add New Monitor"**
4. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** BoomCard API
   - **URL:** `https://boomcard-api.onrender.com/health`
   - **Monitoring Interval:** 5 minutes (free tier) or 1 minute (paid)
5. Click **"Create Monitor"**

Now your backend stays awake 24/7! 🎉

---

## 🔄 How to Update Your Deployment

### Update Backend
```bash
cd /Users/administrator/Documents/BoomCard
# Make changes to backend-api/

git add .
git commit -m "Update backend"
git push origin master

# Render automatically deploys! (~2 minutes)
```

### Update Frontend
```bash
cd /Users/administrator/Documents/BoomCard
# Make changes to partner-dashboard/

git add .
git commit -m "Update frontend"
git push origin master

# Vercel automatically deploys! (~1 minute)
```

Both platforms have **automatic deployment** from GitHub! Just push and it deploys.

---

## 📊 View Logs & Monitor

### Backend Logs (Render)
1. Go to: https://dashboard.render.com
2. Click on **"boomcard-api"**
3. Click **"Logs"** tab
4. See real-time logs

### Frontend Logs (Vercel)
1. Go to: https://vercel.com/dashboard
2. Click on **"boomcard-dashboard"**
3. Click on latest deployment
4. Click **"Functions"** or **"Build Logs"**

### Database Management (Render)
1. Go to: https://dashboard.render.com
2. Click on **"boomcard-db"**
3. Click **"Connect"** to get connection string
4. Use with Prisma Studio:
   ```bash
   DATABASE_URL="postgresql://..." npx prisma studio
   ```

---

## 🚨 Troubleshooting

### "Backend not responding"
- Free tier sleeps after 15 minutes
- Wait 30-60 seconds for first request
- Solution: Set up UptimeRobot (see above)

### "CORS error in browser"
- Check CORS_ORIGIN matches your Vercel URL exactly
- Should be: `https://boomcard-dashboard.vercel.app` (no trailing slash)
- Update in Render dashboard → Environment

### "Database connection failed"
- Verify DATABASE_URL is correct in Render
- Use "Internal Database URL" from your PostgreSQL database page
- Should start with `postgresql://`

### "Build failed on Render"
- Check build logs in Render dashboard
- Make sure all dependencies are in package.json
- Check TypeScript errors

### "Build failed on Vercel"
- Check build logs in Vercel dashboard
- Verify Root Directory is `partner-dashboard`
- Check all environment variables are set

---

## 💰 Free Tier Limits

### Render Free Tier
- **Web Service:** 750 hours/month (enough for 1 service)
- **Database:** 0.1 GB storage, expires after 90 days (can recreate)
- **Limitation:** Sleeps after 15 min (use UptimeRobot to fix)

### Vercel Free Tier
- **Bandwidth:** 100 GB/month
- **Deployments:** Unlimited
- **Limitation:** None for your use case!

### Upgrade When Ready
- **Render Starter:** $7/month (always on, no sleep)
- **Vercel Pro:** $20/month (more bandwidth, analytics)

---

## ✅ Deployment Checklist

- [x] Code pushed to GitHub
- [ ] Render account created
- [ ] PostgreSQL database created on Render
- [ ] Backend web service deployed on Render
- [ ] Backend health check passes
- [ ] Vercel account created
- [ ] Frontend deployed on Vercel
- [ ] CORS updated with Vercel URL
- [ ] Full registration/login flow tested
- [ ] UptimeRobot monitor set up (optional but recommended)

---

## 🎊 Congratulations!

You've successfully deployed your BoomCard platform to production!

**Share your live URLs:**
- Frontend: https://boomcard-dashboard.vercel.app
- Backend: https://boomcard-api.onrender.com

**Next steps:**
- Set up UptimeRobot to keep backend awake
- Add real Stripe keys for payments
- Add custom domain (optional)
- Monitor usage and upgrade when needed

---

**Need Help?**
- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Your detailed guides: `QUICK_DEPLOY.md`, `DEPLOYMENT_GUIDE.md`

**Deployed:** October 13, 2025
**Cost:** $0/month (free tier)
**Status:** 🟢 Ready to deploy!
