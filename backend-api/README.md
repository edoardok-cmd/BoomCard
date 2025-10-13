# BoomCard Backend API

Production-ready backend API for BoomCard Partner Dashboard with Phase 5 features (Payments, Loyalty, Messaging).

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env and add your keys

# Start development server
npm run dev
```

The API will start on `http://localhost:3000`

## 📁 Project Structure

```
backend-api/
├── src/
│   ├── server.ts              # Main server entry point
│   ├── middleware/
│   │   ├── auth.middleware.ts # JWT authentication
│   │   └── error.middleware.ts # Error handling
│   ├── routes/
│   │   ├── auth.routes.ts     # Authentication endpoints
│   │   ├── payments.routes.ts # Payment endpoints (mock)
│   │   ├── loyalty.routes.ts  # Loyalty endpoints (stub)
│   │   ├── messaging.routes.ts # Messaging endpoints (stub)
│   │   ├── bookings.routes.ts # Booking endpoints (stub)
│   │   └── venues.routes.ts   # Venue endpoints (stub)
│   ├── websocket/
│   │   └── server.ts          # WebSocket server
│   └── utils/
│       └── logger.ts          # Winston logger
├── package.json
├── tsconfig.json
└── .env.example
```

## 🔧 Available Scripts

```bash
npm run dev       # Start development server with hot reload
npm run build     # Build for production
npm start         # Start production server
npm test          # Run tests
npm run lint      # Lint code
```

## 📡 API Endpoints

### Health Check
- `GET /health` - Server health status

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh token

### Payments (Mock Implementation)
- `GET /api/payments/transactions` - Get transactions
- `POST /api/payments/intents` - Create payment intent
- `POST /api/payments/intents/:id/confirm` - Confirm payment
- `GET /api/payments/cards` - Get saved cards
- `POST /api/payments/cards` - Add payment card
- `GET /api/payments/wallet/balance` - Get wallet balance
- `POST /api/payments/refunds` - Request refund
- `GET /api/payments/statistics` - Payment statistics

### Loyalty (Stub)
- `GET /api/loyalty/accounts/me` - Get loyalty account
- More endpoints to be implemented

### Messaging (Stub)
- `GET /api/messaging/conversations` - Get conversations
- More endpoints to be implemented

### Bookings (Stub)
- `GET /api/bookings` - Get bookings
- More endpoints to be implemented

### Venues (Stub)
- `GET /api/venues` - Get venues
- More endpoints to be implemented

## 🌐 WebSocket Events

Connect to WebSocket: `ws://localhost:3000`

### Authentication
Send token in handshake: `{ auth: { token: 'your-jwt-token' } }`

### Events

**Client → Server:**
- `join_conversation` - Join conversation room
- `send_message` - Send message
- `typing` - User is typing
- `stop_typing` - User stopped typing
- `mark_read` - Mark message as read

**Server → Client:**
- `new_message` - New message received
- `user_typing` - User is typing
- `user_online` - User came online
- `user_offline` - User went offline
- `notification` - New notification

## 🔐 Environment Variables

See `.env.example` for all required environment variables:

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key

# Payment Gateways
STRIPE_SECRET_KEY=sk_test_...
PAYPAL_CLIENT_ID=...

# WebSocket
WS_PORT=4000

# CORS
CORS_ORIGIN=http://localhost:5173
```

## 📚 Implementation Status

### ✅ Complete
- [x] Server foundation
- [x] Middleware (auth, error handling)
- [x] Logger (Winston)
- [x] WebSocket server
- [x] Payment routes (mock implementation)

### 🚧 To Implement
- [ ] Database setup (PostgreSQL + Prisma)
- [ ] Authentication routes (register, login, refresh)
- [ ] Real payment integration (Stripe)
- [ ] Loyalty routes (points, rewards, badges)
- [ ] Messaging routes (conversations, messages)
- [ ] Booking routes (CRUD operations)
- [ ] Venue routes (CRUD operations)
- [ ] Tests (Jest + Supertest)

## 📖 Next Steps

1. **Set up database:**
   - Install PostgreSQL
   - Create database
   - Run Prisma migrations

2. **Implement authentication:**
   - See `BACKEND_IMPLEMENTATION_GUIDE.md`
   - Implement register/login endpoints
   - Test with frontend

3. **Integrate Stripe:**
   - Get Stripe API keys
   - Replace mock payment implementations
   - Set up webhooks

4. **Implement remaining routes:**
   - Follow patterns in `payments.routes.ts`
   - Use Prisma for database operations
   - Add validation and error handling

5. **Write tests:**
   - Set up Jest
   - Write unit tests for routes
   - Write integration tests

6. **Deploy:**
   - Choose hosting (Render, Railway, Heroku)
   - Set up production environment
   - Configure CI/CD

## 📋 API Contract

The frontend expects these exact response formats. See frontend service files for complete contracts:

- `partner-dashboard/src/services/payments.service.ts`
- `partner-dashboard/src/services/loyalty.service.ts`
- `partner-dashboard/src/services/messaging.service.ts`

## 🧪 Testing the API

```bash
# Health check
curl http://localhost:3000/health

# Get transactions (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/api/payments/transactions

# Create payment intent
curl -X POST http://localhost:3000/api/payments/intents \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"amount": 100, "currency": "BGN", "paymentMethod": "card"}'
```

## 📞 Support

- **Implementation Guide:** See `../BACKEND_IMPLEMENTATION_GUIDE.md`
- **Frontend Contract:** Check service files in `partner-dashboard/src/services/`
- **Database Schema:** See Prisma schema in implementation guide

## 🚀 Production Checklist

Before deploying to production:

- [ ] Environment variables secured
- [ ] Database backups configured
- [ ] HTTPS enforced
- [ ] Rate limiting configured
- [ ] Error tracking (Sentry)
- [ ] Logging configured
- [ ] Health checks working
- [ ] Tests passing (>60% coverage)
- [ ] API documentation complete
- [ ] Security audit done

---

**Built with:** Express.js, TypeScript, Socket.io, Stripe, Winston

**License:** MIT
