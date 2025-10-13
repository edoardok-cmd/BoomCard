# 🔧 Render Deployment Fix Guide

**Issue:** Deployment is timing out and using wrong repository structure

**Current Problem:**
- Render is deploying from: `github.com/edoardok-cmd/BOOM-Card` ❌
- Should be deploying from: `github.com/edoardok-cmd/BoomCard` ✅
- Looking for wrong directory structure (backend/ instead of backend-api/)

---

## ✅ Quick Fix (5 minutes)

### Step 1: Go to Render Dashboard

1. Open: https://dashboard.render.com
2. Log in with your account
3. Find your failing web service (the one with timeout errors)

### Step 2: Update Service Settings

Click on the failing service, then go to **"Settings"** tab.

**Update these settings:**

1. **Repository:**
   - Current: `BOOM-Card` ❌
   - Change to: `BoomCard` ✅
   - Click "Connect" and reauthorize if needed

2. **Branch:**
   - Set to: `master`

3. **Root Directory:**
   - Current: `backend` ❌
   - Change to: `backend-api` ✅

4. **Build Command:**
   ```bash
   npm install && npm run build
   ```

5. **Start Command:**
   ```bash
   npm run deploy
   ```

6. **Docker Configuration:**
   - Remove/disable any Dockerfile settings
   - We're using Node.js native deployment, not Docker

### Step 3: Environment Variables

Make sure these are set (in "Environment" tab):

```
NODE_ENV=production
PORT=10000
DATABASE_URL=<your-postgresql-internal-database-url>
JWT_SECRET=<your-32-char-random-string>
JWT_REFRESH_SECRET=<your-32-char-random-string>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Don't have DATABASE_URL yet?**
- You need to create a PostgreSQL database first
- See "Create Database First" section below

### Step 4: Save and Deploy

1. Scroll down and click **"Save Changes"**
2. Service will automatically redeploy
3. Wait 3-5 minutes for deployment
4. Check logs for success

---

## 🗄️ Create Database First (If Needed)

**If you haven't created the PostgreSQL database yet:**

1. In Render dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - Name: `boomcard-db`
   - Database: `boomcard_production`
   - Region: Oregon (US West)
   - Plan: **Free**
3. Click **"Create Database"**
4. Wait 2-3 minutes for provisioning
5. Copy the **"Internal Database URL"**
6. Go back to your web service → Environment tab
7. Update `DATABASE_URL` with the copied URL

---

## 🆕 Alternative: Create Fresh Service

**If updating doesn't work, start fresh:**

### 1. Delete Current Service
- Go to Settings → scroll to bottom
- Click "Delete Service"
- Confirm deletion

### 2. Create New Service
1. Click **"New +"** → **"Web Service"**
2. Connect repository: `edoardok-cmd/BoomCard`
3. Configure:
   - Name: `boomcard-api`
   - Region: Oregon
   - Branch: `master`
   - Root Directory: `backend-api`
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run deploy`
   - Plan: **Free**
4. Add environment variables (see above)
5. Click **"Create Web Service"**

---

## 🚨 Common Issues & Solutions

### Issue 1: "Timed Out" Error

**Cause:** Service taking too long to start
**Solution:**
- Check that Root Directory is `backend-api` (not `backend`)
- Verify Build Command is correct
- Make sure DATABASE_URL is set and valid

### Issue 2: "Cannot find module" Error

**Cause:** Dependencies not installed
**Solution:**
- Build Command must be: `npm install && npm run build`
- Check package.json exists in backend-api folder

### Issue 3: Database Connection Failed

**Cause:** Wrong DATABASE_URL or database not created
**Solution:**
- Use **Internal Database URL** from PostgreSQL service
- Format: `postgresql://user:pass@host/dbname`
- Make sure PostgreSQL service is running

### Issue 4: Port Binding Error

**Cause:** Wrong PORT environment variable
**Solution:**
- PORT must be exactly `10000` for Render free tier
- Check it's set in environment variables

---

## ✅ Correct Configuration Summary

**Repository Structure:**
```
github.com/edoardok-cmd/BoomCard/
├── backend-api/              ← Deploy this directory
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   └── ...
└── partner-dashboard/        ← Deploy to Vercel separately
```

**Render Settings:**
```yaml
Repository: edoardok-cmd/BoomCard
Branch: master
Root Directory: backend-api
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run deploy
Plan: Free
```

**Required Environment Variables:**
```bash
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://... (from your PostgreSQL service)
JWT_SECRET=<32+ character random string>
JWT_REFRESH_SECRET=<32+ character random string>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=*
```

---

## 🎯 Expected Deployment Logs (Success)

When it works, you'll see:
```
==> Cloning from https://github.com/edoardok-cmd/BoomCard
==> Checking out commit ... in branch master
==> Running npm install
added 627 packages in 15s
==> Running npm run build
Build successful
==> Running npm run deploy
Running Prisma migrations...
Migrations complete
Starting server...
✓ BoomCard API Server started on port 10000
```

---

## 📞 Need Help?

**If deployment still fails:**

1. **Check Logs:**
   - Render Dashboard → Your Service → Logs tab
   - Look for specific error messages

2. **Common Error Messages:**
   - "Cannot find package.json" → Wrong root directory
   - "Database connection failed" → Check DATABASE_URL
   - "Port already in use" → Restart service
   - "Module not found" → Check dependencies in package.json

3. **Verify Your Setup:**
   ```bash
   # Test locally first
   cd /Users/administrator/Documents/BoomCard/backend-api
   npm install
   npm run build
   # Should complete without errors
   ```

---

## 🎊 After Successful Deployment

Your backend will be live at:
```
https://boomcard-api.onrender.com
```

**Test it:**
```bash
curl https://boomcard-api.onrender.com/health
# Should return: {"status":"ok",...}
```

**Update Frontend:**
- Go to Vercel dashboard
- Update `VITE_API_BASE_URL` to point to your Render URL
- Redeploy frontend

---

## 📋 Deployment Checklist

Before deploying:
- [ ] PostgreSQL database created on Render
- [ ] Database URL copied (Internal URL)
- [ ] Repository is correct: `BoomCard` (no hyphen)
- [ ] Root directory is: `backend-api`
- [ ] All environment variables are set
- [ ] Build command is: `npm install && npm run build`
- [ ] Start command is: `npm run deploy`

During deployment:
- [ ] Watch logs for errors
- [ ] Deployment completes in 3-5 minutes
- [ ] No timeout errors
- [ ] Service shows "Live"

After deployment:
- [ ] Health endpoint responds
- [ ] Can register a test user
- [ ] Database migrations ran successfully

---

**Created:** October 13, 2025
**Status:** Ready to fix deployment
**Estimated Time:** 5-10 minutes
