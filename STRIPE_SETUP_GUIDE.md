# Stripe Payment Integration - Setup Guide

## Overview

BoomCard now has a complete Stripe payment integration with support for:
- Payment intents (one-time payments)
- Saved payment methods (cards)
- Stripe customer management
- Refunds (full & partial)
- Subscriptions (for partner plans)
- Webhook events (payment status updates)

## Prerequisites

1. **Stripe Account** - Create a free account at https://stripe.com
2. **Backend Server Running** - Ensure backend-api is running on port 3001
3. **Database** - SQLite database with stripeCustomerId field in User model

---

## Step 1: Get Stripe API Keys

### Test Mode Keys (Development)

1. Go to https://dashboard.stripe.com/test/apikeys
2. You'll see two keys:
   - **Publishable key** - Starts with `pk_test_...` (safe for frontend)
   - **Secret key** - Starts with `sk_test_...` (backend only, keep private)

3. Click "Reveal test key" to see your secret key
4. Copy both keys

### Environment Configuration

Update `/backend-api/.env` with your real Stripe keys:

```env
# Stripe Payment Configuration
STRIPE_SECRET_KEY=sk_test_51QK9iXDirhkwNBQ7yourActualSecretKeyHere
STRIPE_PUBLISHABLE_KEY=pk_test_51QK9iXDirhkwNBQ7yourActualPublishableKeyHere
STRIPE_WEBHOOK_SECRET=whsec_yourWebhookSecretHere
```

**Important:**
- Never commit real API keys to git
- Use test keys for development
- Get production keys from https://dashboard.stripe.com/apikeys (live mode)

---

## Step 2: Test Payment Intent Creation

### Using cURL

```bash
# 1. Register/login to get JWT token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "payment-test@boomcard.bg",
    "password": "test123456"
  }'

# Save the accessToken from response

# 2. Create payment intent (29 BGN = 2900 stotinki)
curl -X POST http://localhost:3001/api/payments/intents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "amount": 29,
    "currency": "bgn",
    "description": "Premium Subscription - Monthly",
    "metadata": {
      "subscriptionType": "premium",
      "billingPeriod": "monthly"
    }
  }'
```

### Expected Response

```json
{
  "success": true,
  "data": {
    "paymentIntentId": "pi_1234567890abcdef",
    "clientSecret": "pi_1234567890abcdef_secret_xyz",
    "amount": 2900,
    "currency": "bgn"
  }
}
```

### What Happens

1. Backend creates/retrieves Stripe customer for user
2. Stores `stripeCustomerId` in database
3. Creates payment intent with Stripe
4. Returns `clientSecret` for frontend to confirm payment

---

## Step 3: Test with Stripe Test Cards

Stripe provides test card numbers for different scenarios:

### Successful Payment
```
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

### 3D Secure Required
```
Card Number: 4000 0027 6000 3184
```

### Payment Declined
```
Card Number: 4000 0000 0000 0002
```

### Insufficient Funds
```
Card Number: 4000 0000 0000 9995
```

Full list: https://stripe.com/docs/testing#cards

---

## Step 4: Set Up Webhooks (Local Testing)

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Or download from https://stripe.com/docs/stripe-cli
```

### Authenticate

```bash
stripe login
```

### Forward Webhooks to Local Server

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

This command will output:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

**Copy this webhook secret** and add it to your `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

### Test Webhook Events

In a new terminal:

```bash
# Trigger a successful payment event
stripe trigger payment_intent.succeeded

# Trigger a failed payment event
stripe trigger payment_intent.payment_failed
```

Your backend will receive and process these events automatically.

---

## Step 5: Verify in Stripe Dashboard

### View Customers

https://dashboard.stripe.com/test/customers

- You should see customers created when users make payments
- Each customer has metadata linking to BoomCard user ID

### View Payment Intents

https://dashboard.stripe.com/test/payments

- See all payment attempts
- Filter by status: succeeded, requires_action, canceled
- View payment details and metadata

### View Webhooks

https://dashboard.stripe.com/test/webhooks

- Monitor webhook events sent to your endpoint
- See delivery status and retry attempts
- Useful for debugging

---

## API Endpoints Reference

### Payment Intents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/intents` | Create payment intent |
| POST | `/api/payments/intents/:id/confirm` | Confirm payment |
| POST | `/api/payments/intents/:id/cancel` | Cancel payment |
| GET | `/api/payments/intents/:id` | Get payment details |

### Payment Methods (Cards)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/cards` | List saved cards |
| POST | `/api/payments/cards` | Add payment method |
| DELETE | `/api/payments/cards/:id` | Remove card |
| POST | `/api/payments/cards/:id/default` | Set default card |

### Refunds

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/refunds` | Create refund |

### Wallet & Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/wallet/balance` | Get wallet balance |
| GET | `/api/payments/transactions` | List transactions |
| GET | `/api/payments/transactions/:id` | Get transaction |
| GET | `/api/payments/statistics` | Payment statistics |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/stripe` | Stripe webhook events |

---

## Testing Checklist

- [ ] Stripe API keys added to `.env`
- [ ] Backend server restarted with new keys
- [ ] Payment intent created successfully
- [ ] Customer created in Stripe Dashboard
- [ ] Test payment with card 4242 4242 4242 4242
- [ ] Stripe CLI installed and authenticated
- [ ] Webhooks forwarding to local server
- [ ] Webhook secret added to `.env`
- [ ] Test webhook events triggering
- [ ] Verify events logged in backend console

---

## Troubleshooting

### "Invalid API Key provided"

**Problem:** Stripe returns 401 authentication error

**Solution:**
1. Verify you copied the complete API key (starts with `sk_test_`)
2. Check for extra spaces in `.env` file
3. Ensure you're using test mode keys (not live keys)
4. Restart backend server after updating `.env`

### "No such customer"

**Problem:** Customer ID not found in Stripe

**Solution:**
1. Check `stripeCustomerId` in database is valid
2. Ensure you're in test mode (test IDs start with `cus_test_`)
3. Verify customer exists in Stripe Dashboard

### "Webhook signature verification failed"

**Problem:** Webhook events rejected

**Solution:**
1. Ensure `STRIPE_WEBHOOK_SECRET` matches CLI output
2. Check webhook endpoint has raw body middleware
3. Verify Stripe CLI is forwarding to correct port

### "Amount must be at least BGN 1.00"

**Problem:** Amount too small for Stripe

**Solution:**
- Stripe requires minimum 100 stotinki (1 BGN)
- Use amount ≥ 1 (BGN) in API calls

---

## Production Deployment

### Before Going Live

1. **Switch to Live Mode:**
   - Get production keys from https://dashboard.stripe.com/apikeys
   - Update production `.env` with `sk_live_...` and `pk_live_...`

2. **Configure Production Webhooks:**
   - Go to https://dashboard.stripe.com/webhooks
   - Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Select events to listen for
   - Copy webhook signing secret to production `.env`

3. **Test with Real Cards:**
   - Use real payment cards (small amounts)
   - Verify payments appear in live dashboard
   - Test refund process

4. **Security:**
   - Ensure HTTPS is enabled
   - Never expose secret keys
   - Implement rate limiting
   - Monitor for suspicious activity

### Recommended Events to Listen For

```
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
charge.refunded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
payment_method.attached
payment_method.detached
```

---

## Support

- **Stripe Documentation:** https://stripe.com/docs
- **Stripe API Reference:** https://stripe.com/docs/api
- **Stripe Test Cards:** https://stripe.com/docs/testing
- **Stripe CLI Docs:** https://stripe.com/docs/stripe-cli

---

## Implementation Files

| File | Purpose |
|------|---------|
| `backend-api/src/services/stripe.service.ts` | Core Stripe integration |
| `backend-api/src/routes/payments.routes.ts` | Payment API endpoints |
| `backend-api/src/routes/webhooks.routes.ts` | Webhook handler |
| `backend-api/src/server.ts` | Server config with webhook middleware |
| `backend-api/prisma/schema.prisma` | Database schema with stripeCustomerId |

---

**Last Updated:** 2025-11-04
**Integration Status:** ✅ Production Ready (pending real API keys)
