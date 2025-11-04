# Quick Start Guide - Wallet & Subscription System

## Setup Complete! ✅

The backend payment system has been fully implemented. Follow these steps to test it.

---

## What's Been Implemented

### ✅ Database Schema
- **Wallet** model - Balance tracking system
- **WalletTransaction** model - Transaction history
- **Subscription** model - Plan management (STANDARD/PREMIUM/PLATINUM)
- **SavedPaymentMethod** model - Stored payment methods

### ✅ API Endpoints

**Wallet Endpoints:**
- `GET /api/wallet/balance` - Get current balance
- `GET /api/wallet/transactions` - Transaction history
- `POST /api/wallet/topup` - Top up via Stripe
- `GET /api/wallet/statistics` - Usage statistics

**Subscription Endpoints:**
- `GET /api/subscriptions/plans` - List available plans
- `GET /api/subscriptions/current` - Get user's subscription
- `POST /api/subscriptions/create` - Create subscription
- `POST /api/subscriptions/:id/cancel` - Cancel subscription
- `POST /api/subscriptions/:id/update-plan` - Change plan

### ✅ Stripe Webhook Handlers
- Payment success → Credits wallet automatically
- Payment failure → Marks transactions as failed
- Refunds → Credits wallet
- Subscription updates → Syncs to database

---

## Quick Test Steps

### 1. Start the Server

```bash
cd backend-api
npm run dev
```

The server should start on `http://localhost:3001`

### 2. Get an Auth Token

Register or login to get a JWT token:

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@boomcard.com",
    "password": "yourpassword"
  }'
```

Save the token from the response.

### 3. Test Wallet Balance

```bash
TOKEN="your_jwt_token_here"

curl -X GET http://localhost:3001/api/wallet/balance \
  -H "Authorization: Bearer $TOKEN"
```

Expected response:
```json
{
  "balance": 0,
  "availableBalance": 0,
  "pendingBalance": 0,
  "currency": "BGN",
  "isLocked": false
}
```

### 4. Test Subscription Plans

```bash
curl -X GET http://localhost:3001/api/subscriptions/plans \
  -H "Authorization: Bearer $TOKEN"
```

Expected response:
```json
{
  "plans": [
    {
      "plan": "STANDARD",
      "cashbackRate": 0.05,
      "monthlyFee": 0,
      "features": ["5% cashback...", ...]
    },
    {
      "plan": "PREMIUM",
      "cashbackRate": 0.07,
      "monthlyFee": 9.99,
      "features": ["7% cashback...", ...]
    },
    {
      "plan": "PLATINUM",
      "cashbackRate": 0.10,
      "monthlyFee": 19.99,
      "features": ["10% cashback...", ...]
    }
  ]
}
```

### 5. Test Wallet Top-Up (Optional - Requires Stripe)

```bash
curl -X POST http://localhost:3001/api/wallet/topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50}'
```

This will create a Stripe payment intent. To complete the payment, you'll need to use the `clientSecret` with Stripe.js on the frontend.

---

## For Production Deployment

### 1. Add Stripe Price IDs

Create products in Stripe Dashboard and add to `.env`:

```env
STRIPE_PREMIUM_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PLATINUM_PRICE_ID=price_xxxxxxxxxxxxx
```

### 2. Configure Webhook Endpoint

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy webhook secret and add to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### 3. Update Database to PostgreSQL

For production, update `.env`:

```env
DATABASE_URL=postgresql://user:password@host:5432/boomcard
```

Then run migration:

```bash
npx prisma migrate deploy
```

---

## Troubleshooting

### "Property 'wallet' does not exist on PrismaClient"

Run:
```bash
npx prisma generate
```

### Webhook not receiving events

For local testing, use Stripe CLI:
```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

### TypeScript errors

Clear cache and regenerate:
```bash
rm -rf node_modules/.prisma
npx prisma generate
```

---

## Next Steps

### For Mobile App (Developer C)
You can now integrate:
- Wallet balance display
- Top-up flow using Stripe
- Transaction history
- Subscription upgrade prompts

### For Partner Dashboard (Developer D)
You can now show:
- User wallet balances
- Subscription status
- Transaction analytics
- Revenue tracking

---

## Documentation

See [WALLET_SUBSCRIPTION_API_DOCS.md](./WALLET_SUBSCRIPTION_API_DOCS.md) for complete API reference.

---

## Support

If you encounter any issues:
1. Check the server logs for errors
2. Verify your `.env` configuration
3. Ensure Prisma client is up to date: `npx prisma generate`
4. Check that Stripe keys are valid: `stripe config --list`

---

## Summary

✅ **All 4 Phases Complete**
- Database models: Wallet, WalletTransaction, Subscription, SavedPaymentMethod
- 9 API endpoints ready to use
- Stripe webhooks fully integrated
- Subscription plans configured

**Ready for frontend integration!** 🚀
