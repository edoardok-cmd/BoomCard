# Backend Quick Start - Get Your API Running in 10 Minutes

## 🎯 What You Have Now

I've created a complete backend foundation for you in `/backend-api/`:

```
backend-api/
├── package.json           ✅ All dependencies defined
├── tsconfig.json          ✅ TypeScript configured
├── .env.example           ✅ Environment template
├── README.md              ✅ Complete API documentation
└── src/
    ├── server.ts          ✅ Express server with routing
    ├── middleware/        ✅ Auth & error handling
    ├── routes/            ✅ All Phase 5 routes
    ├── websocket/         ✅ Real-time messaging server
    └── utils/             ✅ Logger setup
```

**Status:**
- ✅ Server foundation complete
- ✅ WebSocket server ready
- ✅ Mock payment endpoints working
- ✅ Auth middleware ready
- 🚧 Database integration needed
- 🚧 Real Stripe integration needed

---

## 🚀 Get Started Now (10 Minutes)

### Step 1: Install Dependencies (2 min)

```bash
cd /Users/administrator/Documents/BoomCard/backend-api
npm install
```

This installs:
- Express.js (web server)
- Socket.io (WebSocket)
- JWT (authentication)
- Stripe SDK (payments)
- Winston (logging)
- TypeScript & dev tools

### Step 2: Configure Environment (2 min)

```bash
cp .env.example .env
```

Edit `.env` and set minimum required values:
```bash
PORT=3000
NODE_ENV=development
JWT_SECRET=your-temporary-secret-change-later
CORS_ORIGIN=http://localhost:5173
```

### Step 3: Start the Server (1 min)

```bash
npm run dev
```

You should see:
```
🚀 BoomCard API Server started on port 3000
📡 WebSocket server ready on port 3000
🌍 Environment: development
🔗 CORS enabled for: http://localhost:5173
```

### Step 4: Test It Works (2 min)

Open a new terminal and test:

```bash
# Health check
curl http://localhost:3000/health

# Should return:
# {"status":"ok","timestamp":"...","uptime":0.123}

# Test mock payment endpoint (will need auth later)
curl http://localhost:3000/api/payments/transactions

# Should return 401 (auth required) - that's correct!
```

### Step 5: Update Frontend API URL (3 min)

In your frontend `.env`:
```bash
# partner-dashboard/.env
REACT_APP_API_URL=http://localhost:3000
```

Restart your frontend dev server (it's already running).

**✅ Done! Your backend is now running and ready for frontend integration.**

---

## 🧪 Test With Frontend

Now you can test the mock APIs from your frontend:

1. **Open frontend:** `http://localhost:5173`
2. **Try to view payments page** - It will call `http://localhost:3000/api/payments/transactions`
3. **Check browser console** - You'll see 401 errors (auth required)

This is expected! Next step is implementing authentication.

---

## 📝 What Works Right Now

### ✅ Working Features

1. **Server Running**
   - Express server on port 3000
   - CORS configured for frontend
   - Rate limiting enabled
   - Error handling middleware

2. **WebSocket Server**
   - Socket.io server ready
   - Authentication middleware
   - Messaging events configured
   - Typing indicators ready
   - Online/offline status

3. **Mock Payment Endpoints**
   - GET `/api/payments/transactions` - Returns mock data
   - POST `/api/payments/intents` - Creates mock payment
   - GET `/api/payments/cards` - Returns mock cards
   - GET `/api/payments/wallet/balance` - Returns mock balance
   - All other payment endpoints return mock data

4. **Middleware**
   - JWT authentication (ready for use)
   - Error handling (catches all errors)
   - Request logging (Winston)
   - Rate limiting (100 req/15 min)

### 🚧 What Needs Implementation

1. **Database** (Priority 1)
   - PostgreSQL setup
   - Prisma ORM
   - Migrations
   - Models for User, Transaction, Loyalty, etc.

2. **Authentication** (Priority 2)
   - Register endpoint
   - Login endpoint
   - Token refresh
   - Password hashing

3. **Real Stripe Integration** (Priority 3)
   - Replace mock implementations
   - Webhook handling
   - Card tokenization

4. **Loyalty System** (Priority 4)
   - Points tracking
   - Tier management
   - Rewards redemption

5. **Messaging** (Priority 5)
   - Message persistence
   - Conversation management
   - File uploads

---

## 🎯 Next Steps - Choose Your Path

### Path A: Quick Mock Testing (Recommended First)

**Time: 30 minutes**

Keep using mock data to test frontend integration:

1. **Remove auth requirement** temporarily:
   ```typescript
   // src/routes/payments.routes.ts
   // Comment out this line:
   // router.use(authenticate);
   ```

2. **Restart server:** `npm run dev`

3. **Test frontend:** All payment pages should now work with mock data!

4. **Benefit:** You can develop and test frontend without backend complexity

### Path B: Full Backend Implementation

**Time: 2-4 weeks**

Follow the complete implementation guide:

1. **Week 1:** Database + Authentication
   - Follow `BACKEND_IMPLEMENTATION_GUIDE.md`
   - Set up PostgreSQL
   - Implement auth routes
   - Connect to frontend

2. **Week 2:** Stripe Integration
   - Get Stripe API keys
   - Replace mock implementations
   - Set up webhooks
   - Test payments

3. **Week 3:** Loyalty + Messaging
   - Implement loyalty routes
   - Add WebSocket message persistence
   - Test real-time features

4. **Week 4:** Testing + Deployment
   - Write tests
   - Deploy to staging
   - Production deployment

---

## 📚 Documentation Available

All docs are in the `/backend-api/` folder:

1. **`README.md`** - API documentation
   - All endpoints listed
   - WebSocket events
   - Environment variables
   - Testing instructions

2. **`../BACKEND_IMPLEMENTATION_GUIDE.md`** - Step-by-step implementation
   - Database schema
   - Code examples
   - Testing examples
   - Deployment guide

3. **Code Comments** - Every file has detailed comments

---

## 🐛 Troubleshooting

### Issue: "Cannot find module"

```bash
# Make sure you installed dependencies
cd backend-api
npm install
```

### Issue: "Port 3000 already in use"

```bash
# Kill the process
lsof -ti:3000 | xargs kill

# Or change port in .env
PORT=3001
```

### Issue: "CORS error in frontend"

Check your `.env`:
```bash
CORS_ORIGIN=http://localhost:5173  # Must match frontend URL
```

### Issue: "WebSocket connection failed"

The frontend needs to connect with a JWT token. For testing, you can temporarily disable auth in the WebSocket middleware.

---

## 💡 Pro Tips

### Tip 1: Use Mock Data First

Don't rush into database setup. Use mock data to:
- Test frontend integration
- Develop UI components
- Validate API contracts
- Find issues early

### Tip 2: Test Endpoints with curl

```bash
# Save to a file: test-api.sh
#!/bin/bash

# Health check
echo "Testing health endpoint..."
curl http://localhost:3000/health

# Get transactions (mock)
echo "\nTesting transactions endpoint..."
curl http://localhost:3000/api/payments/transactions
```

### Tip 3: Watch the Logs

The server logs everything. Watch them in real-time:
```bash
# Terminal 1: Run server
npm run dev

# Terminal 2: Watch logs
tail -f logs/combined.log
```

### Tip 4: Use Postman or Insomnia

Install Postman to test API endpoints visually:
1. Create new collection
2. Add requests for each endpoint
3. Save auth token
4. Test complete flows

---

## 🎉 You're All Set!

Your backend is now running and ready for:

1. ✅ **Frontend testing** with mock data
2. ✅ **API development** following the guide
3. ✅ **WebSocket testing** for real-time features
4. ✅ **Stripe integration** when ready

**Current Setup:**
- 🟢 Backend server: `http://localhost:3000`
- 🟢 Frontend server: `http://localhost:5173`
- 🟢 WebSocket: Connected to backend
- 🟢 Mock APIs: Ready for testing

**Choose your next action:**
- **Want to test frontend NOW?** → Follow Path A (remove auth temporarily)
- **Want full backend?** → Follow `BACKEND_IMPLEMENTATION_GUIDE.md`
- **Want to deploy?** → Follow deployment section in guide

---

## 📞 Quick Reference

**Backend Commands:**
```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm start        # Run production build
npm test         # Run tests
```

**Check Backend:**
```bash
curl http://localhost:3000/health
```

**Check Frontend Connection:**
```bash
# Open browser console at http://localhost:5173
# Look for API calls to localhost:3000
```

**Logs Location:**
```bash
backend-api/logs/combined.log  # All logs
backend-api/logs/error.log     # Errors only
```

---

**Questions?** Check the implementation guide: `BACKEND_IMPLEMENTATION_GUIDE.md`

**Ready to code!** 🚀
