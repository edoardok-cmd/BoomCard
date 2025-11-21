# Render Deployment Troubleshooting

## Current Issue: API Returns 404 "Not Found"

The build succeeded, but the API is not responding. Here's how to diagnose:

---

## Quick Checks in Render Dashboard

### 1. Check Service Settings

Go to your service in Render Dashboard and verify:

**Settings Tab:**
- ✅ **Root Directory**: Should be `backend-api`
- ✅ **Build Command**: `npm ci && npx prisma generate && npm run build`
- ✅ **Start Command**: `npx prisma migrate deploy && npm start`

**If Root Directory is empty or wrong:**
1. Click **Edit** on "Root Directory"
2. Enter: `backend-api`
3. Click **Save Changes**
4. Manually redeploy

---

### 2. Check Logs Tab

Click **"Logs"** tab and look for:

**Good Signs:**
```
✅ Database connected successfully
🚀 BoomCard API Server started on port 3000
📡 WebSocket server ready on port 3000
```

**Bad Signs:**
```
❌ Error: Cannot find module
❌ DATABASE_URL is not defined
❌ PORT is not defined
❌ Failed to start server
```

**If you see errors:**
- Check **Environment** tab for missing variables
- Ensure `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET` are set

---

### 3. Check Environment Variables

**Environment Tab → Must have:**

```env
NODE_ENV=production
PORT=<should be blank or 10000> # Render sets this automatically
DATABASE_URL=<from Render database connection string>
JWT_SECRET=<32+ character random string>
REFRESH_TOKEN_SECRET=<32+ character random string>
```

**Generate secrets if missing:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 4. Verify Service URL

In Render Dashboard, find your actual service URL. It should be:
- `https://boomcard-api.onrender.com` (if you named it `boomcard-api`)
- Or something like `https://boomcard-api-XXXXX.onrender.com`

**Try your actual URL:**
```bash
curl https://YOUR-ACTUAL-URL.onrender.com/health
```

---

## Common Issues & Fixes

### Issue 1: Root Directory Not Set

**Symptoms:**
- Build succeeds but app doesn't start
- 404 on all endpoints
- Logs show "Cannot find package.json"

**Fix:**
1. Go to **Settings** → **Root Directory**
2. Set to: `backend-api`
3. **Save Changes**
4. Click **Manual Deploy** → **Deploy latest commit**

---

### Issue 2: Missing Environment Variables

**Symptoms:**
- Build succeeds
- Logs show "DATABASE_URL is not defined" or similar
- App crashes on startup

**Fix:**
1. Go to **Environment** tab
2. Add missing variables (see list above)
3. Redeploy

---

### Issue 3: Database Not Connected

**Symptoms:**
- Logs show "Failed to connect to database"
- 500 errors on login/API calls

**Fix:**
1. Check **Database** in Render
2. Ensure database is "Available"
3. Copy **Internal Database URL**
4. Update `DATABASE_URL` in Environment variables
5. Format should be: `postgresql://user:password@host:port/database`

---

### Issue 4: Wrong Start Command

**Symptoms:**
- Build succeeds
- Nothing appears in logs after "Starting service"
- Service shows as "Live" but doesn't respond

**Fix:**
1. Go to **Settings** → **Start Command**
2. Should be: `npx prisma migrate deploy && npm start`
3. **NOT**: `node dist/server.js` or `npm run dev`
4. Save and redeploy

---

### Issue 5: Port Configuration

**Symptoms:**
- App starts but doesn't respond
- Logs show "Server started on port 3000" but Render can't connect

**Fix:**
Ensure your `server.ts` uses `process.env.PORT`:
```typescript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
```

---

## Alternative: Manual Service Setup (Not Blueprint)

If Blueprint isn't working, create manually:

### Step 1: Delete Current Service
1. Go to your service
2. **Settings** → **Delete Web Service**

### Step 2: Create New Service
1. **New +** → **Web Service**
2. **Repository**: `https://github.com/edoardok-cmd/BoomCard`
3. **Branch**: `master`
4. **Root Directory**: `backend-api` ← IMPORTANT
5. **Runtime**: `Node`
6. **Build Command**: `npm ci && npx prisma generate && npm run build`
7. **Start Command**: `npx prisma migrate deploy && npm start`
8. **Plan**: `Starter`
9. **Advanced** → **Health Check Path**: `/health`

### Step 3: Add Environment Variables
```env
NODE_ENV=production
DATABASE_URL=<get from database>
REDIS_URL=<optional>
JWT_SECRET=<generate>
REFRESH_TOKEN_SECRET=<generate>
STRIPE_SECRET_KEY=<optional for now>
STRIPE_PUBLISHABLE_KEY=<optional>
AWS_ACCESS_KEY_ID=<optional>
AWS_SECRET_ACCESS_KEY=<optional>
SENDGRID_API_KEY=<optional>
CORS_ORIGIN=https://boomcard.vercel.app
```

### Step 4: Create Database
1. **New +** → **PostgreSQL**
2. **Name**: `boomcard-postgres`
3. **Region**: `Frankfurt` (same as web service)
4. **Plan**: `Starter`
5. After creation, copy **Internal Database URL**
6. Add to `DATABASE_URL` in web service environment

### Step 5: Deploy
1. Click **Create Web Service**
2. Wait for build (~5-10 min)
3. Check logs for success messages

---

## Testing After Fix

Once deployed successfully:

```bash
# Health check
curl https://YOUR-URL.onrender.com/health
# Should return: {"status":"ok",...}

# API health
curl https://YOUR-URL.onrender.com/api/health
# Should return detailed health info

# Test login
curl -X POST https://YOUR-URL.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@boomcard.com","password":"YOUR_PASSWORD"}'
```

---

## Still Not Working?

1. **Share the logs**: Copy last 50 lines from Logs tab
2. **Check service status**: Is it "Live" or stuck "Deploying"?
3. **Check events**: Any deployment errors in Events tab?
4. **Check metrics**: Is CPU/Memory usage normal?

---

## Quick Fix Script

If you have Render CLI installed:

```bash
# Install Render CLI
npm install -g @render-com/cli

# Login
render login

# Check service logs
render logs boomcard-api --tail

# Trigger redeploy
render deploy boomcard-api
```

---

## Contact Support

If nothing works:
- Render Community: https://community.render.com
- Render Support: support@render.com
- Include: service ID, logs, error messages
