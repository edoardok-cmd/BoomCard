# BoomCard Backend API - Quick Reference

**Status:** 🟢 Production-Ready
**Backend URL:** http://localhost:3000
**Process ID:** 92261

---

## 📋 Quick Commands

### Start/Stop Server
```bash
# Start backend
cd backend-api
npm run dev

# Check if running
curl http://localhost:3000/health

# Stop server
kill $(pgrep -f "ts-node-dev.*backend-api")
```

### Run Tests
```bash
# Authentication tests
bash backend-api/test-auth.sh

# Database UI
npx prisma studio
```

### View Logs
```bash
# Live logs
tail -f /tmp/backend-api.log

# Recent errors
tail -100 /tmp/backend-api.log | grep error

# Recent info
tail -100 /tmp/backend-api.log | grep info
```

---

## 🔐 Authentication API

### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123"
}

Response: { accessToken, refreshToken, user }
```

### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer <accessToken>
```

### Update Profile
```bash
PUT /api/auth/profile
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "firstName": "Updated",
  "lastName": "Name",
  "phone": "+359888123456"
}
```

### Refresh Token
```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

### Change Password
```bash
POST /api/auth/change-password
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword123"
}
```

### Logout
```bash
POST /api/auth/logout
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

---

## 💳 Payment API

### Create Payment Intent
```bash
POST /api/payments/intents
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "amount": 150.00,
  "currency": "BGN",
  "description": "Restaurant booking"
}

Response: { paymentIntentId, clientSecret }
```

### Get Transactions
```bash
GET /api/payments/transactions?page=1&limit=20&status=COMPLETED
Authorization: Bearer <accessToken>
```

### Get Transaction Statistics
```bash
GET /api/payments/statistics
Authorization: Bearer <accessToken>

Response: { monthly, yearly, lifetime, transactionCount }
```

---

## 🎁 Loyalty System

**Automatic Features:**
- Loyalty account created on registration
- Points awarded on transaction completion (1 BGN = 10 points)
- Cashback calculated based on tier (2%-10%)

**Tiers:**
- BRONZE: 2% cashback
- SILVER: 3% cashback
- GOLD: 5% cashback
- PLATINUM: 7% cashback
- DIAMOND: 10% cashback

---

## 📊 Dashboard API

### Sidebar Statistics
```bash
GET /api/sidebar/stats

Response:
{
  "revenue": { "today": 1245.5, "week": 8734.2, "month": 34567.8 },
  "bookings": { "today": 23, "week": 145, "month": 567 },
  "loyalty": { "activeMembers": 3456, "newThisWeek": 234 },
  "notifications": { "unread": 5, "total": 47 }
}
```

---

## 🗄️ Database

### Location
`backend-api/prisma/dev.db` (SQLite)

### Schema
`backend-api/prisma/schema.prisma` (628 lines)

### Models (20+)
- User, RefreshToken
- Partner, Venue
- Offer
- Transaction
- LoyaltyAccount, LoyaltyTransaction, Reward, Badge
- Booking
- Review
- Conversation, Message
- Notification
- Favorite

### Commands
```bash
# Open Prisma Studio (Database UI)
npx prisma studio

# Create migration
npx prisma migrate dev --name migration_name

# Reset database (⚠️ deletes all data)
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate

# View schema
cat prisma/schema.prisma
```

---

## 🔧 Configuration

### Environment Variables
File: `backend-api/.env`

**Required:**
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `CORS_ORIGIN` - Frontend URL

**Optional (for real payments):**
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

### To Use Real Stripe:
1. Get keys from https://dashboard.stripe.com/apikeys
2. Update `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. Restart server

---

## 🧪 Testing

### Manual Testing
```bash
# Test registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234"}'

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234"}'

# Test protected route
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Automated Testing
```bash
bash backend-api/test-auth.sh
```

---

## 🚨 Troubleshooting

### Server Won't Start
```bash
# Check if port is in use
lsof -ti:3000

# Kill process on port 3000
kill -9 $(lsof -ti:3000)

# Restart
cd backend-api && npm run dev
```

### Database Issues
```bash
# Reset database
npx prisma migrate reset

# Regenerate Prisma Client
npx prisma generate
```

### Authentication Fails
```bash
# Check JWT secret is set
cat backend-api/.env | grep JWT_SECRET

# Check logs
tail -50 /tmp/backend-api.log | grep -i error
```

### Can't Connect from Frontend
```bash
# Check CORS_ORIGIN in .env
cat backend-api/.env | grep CORS_ORIGIN

# Should be: CORS_ORIGIN=http://localhost:5173

# Restart backend after changing .env
```

---

## 📝 File Structure

```
backend-api/
├── src/
│   ├── server.ts              # Main entry point
│   ├── lib/
│   │   └── prisma.ts          # Database client
│   ├── services/
│   │   ├── auth.service.ts    # Authentication logic
│   │   └── payment.service.ts # Payment logic
│   ├── routes/
│   │   ├── auth.routes.ts     # Auth endpoints
│   │   ├── payments.routes.ts # Payment endpoints
│   │   └── sidebar.routes.ts  # Dashboard endpoints
│   ├── middleware/
│   │   ├── auth.middleware.ts # JWT verification
│   │   └── error.middleware.ts # Error handling
│   ├── websocket/
│   │   └── server.ts          # WebSocket handlers
│   └── utils/
│       └── logger.ts          # Winston logger
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── migrations/            # Database migrations
│   └── dev.db                 # SQLite database
├── package.json
├── tsconfig.json
├── .env                       # Environment variables
└── test-auth.sh               # Test suite
```

---

## 🔗 Useful Links

- **Database UI:** Run `npx prisma studio` then visit http://localhost:5555
- **Stripe Dashboard:** https://dashboard.stripe.com/test/payments
- **Backend Logs:** `/tmp/backend-api.log`
- **Health Check:** http://localhost:3000/health

---

## 📖 Full Documentation

- **[PRODUCTION_BACKEND_COMPLETE.md](PRODUCTION_BACKEND_COMPLETE.md)** - Complete implementation guide
- **[BACKEND_IMPLEMENTATION_GUIDE.md](BACKEND_IMPLEMENTATION_GUIDE.md)** - Original 4-week plan
- **[API_SETUP_COMPLETE.md](API_SETUP_COMPLETE.md)** - Initial setup guide
- **[SERVER_STATUS.md](SERVER_STATUS.md)** - Server status monitoring

---

**Last Updated:** October 13, 2025, 10:57 AM
**Status:** 🟢 All Systems Operational
