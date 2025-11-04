# BoomCard Wallet & Subscription API Documentation

## Overview

This document describes the complete Wallet and Subscription API endpoints implemented as part of the backend payment systems.

**Base URL:** `http://localhost:3001/api`

**Authentication:** All endpoints require Bearer token authentication
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Wallet API

### GET /api/wallet/balance

Get the current wallet balance for the authenticated user.

**Response:**
```json
{
  "balance": 125.50,
  "availableBalance": 125.50,
  "pendingBalance": 0.00,
  "currency": "BGN",
  "isLocked": false,
  "lastUpdated": "2025-01-04T12:00:00.000Z"
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

---

### GET /api/wallet/transactions

Get wallet transaction history with optional filtering.

**Query Parameters:**
- `type` (optional) - Filter by transaction type: `TOP_UP`, `WITHDRAWAL`, `CASHBACK_CREDIT`, `PURCHASE`, `REFUND`, `TRANSFER`, `ADJUSTMENT`
- `limit` (optional) - Number of transactions to return (default: 50, max: 100)
- `offset` (optional) - Pagination offset (default: 0)

**Example Request:**
```
GET /api/wallet/transactions?type=CASHBACK_CREDIT&limit=20&offset=0
```

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "walletId": "uuid",
      "type": "CASHBACK_CREDIT",
      "amount": 5.00,
      "balanceBefore": 100.00,
      "balanceAfter": 105.00,
      "currency": "BGN",
      "status": "COMPLETED",
      "description": "Cashback from receipt scan",
      "metadata": null,
      "stripePaymentIntentId": null,
      "receiptId": "uuid",
      "stickerScanId": null,
      "createdAt": "2025-01-04T12:00:00.000Z",
      "receipt": { /* receipt details */ },
      "transaction": null,
      "stickerScan": null
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

---

### POST /api/wallet/topup

Top up wallet using Stripe payment.

**Request Body:**
```json
{
  "amount": 50.00
}
```

**Validation:**
- `amount`: Required, positive number, max 10,000 BGN

**Response:**
```json
{
  "paymentIntent": {
    "id": "pi_xxxxxxxxxxxxx",
    "clientSecret": "pi_xxxxxxxxxxxxx_secret_xxxxxxxxxxxxx",
    "amount": 5000,
    "currency": "bgn"
  },
  "transaction": {
    "id": "uuid",
    "walletId": "uuid",
    "type": "TOP_UP",
    "amount": 50.00,
    "balanceBefore": 100.00,
    "balanceAfter": 100.00,
    "status": "PENDING",
    "description": "Wallet top-up",
    "stripePaymentIntentId": "pi_xxxxxxxxxxxxx",
    "createdAt": "2025-01-04T12:00:00.000Z"
  }
}
```

**Status Codes:**
- `200` - Payment intent created successfully
- `400` - Invalid request body
- `401` - Unauthorized
- `500` - Stripe error

**Note:** After payment is confirmed, a Stripe webhook will update the transaction status and credit the wallet.

---

### GET /api/wallet/statistics

Get wallet usage statistics and aggregated data.

**Response:**
```json
{
  "totalCashback": 125.50,
  "totalTopups": 500.00,
  "totalSpent": 350.00,
  "currentBalance": 275.50,
  "availableBalance": 275.50,
  "pendingBalance": 0.00,
  "transactionsByType": [
    {
      "type": "CASHBACK_CREDIT",
      "_sum": { "amount": 125.50 },
      "_count": 25
    },
    {
      "type": "TOP_UP",
      "_sum": { "amount": 500.00 },
      "_count": 10
    },
    {
      "type": "PURCHASE",
      "_sum": { "amount": -350.00 },
      "_count": 15
    }
  ]
}
```

---

## Subscription API

### GET /api/subscriptions/plans

Get all available subscription plans with their benefits.

**Response:**
```json
{
  "plans": [
    {
      "plan": "STANDARD",
      "cashbackRate": 0.05,
      "monthlyFee": 0,
      "features": [
        "5% cashback on all purchases",
        "Basic receipt scanning",
        "Transaction history",
        "Email support"
      ]
    },
    {
      "plan": "PREMIUM",
      "cashbackRate": 0.07,
      "monthlyFee": 9.99,
      "features": [
        "7% cashback on all purchases",
        "+2% bonus on BOOM-Sticker scans",
        "Priority receipt processing",
        "Advanced analytics",
        "Priority support",
        "No ads"
      ]
    },
    {
      "plan": "PLATINUM",
      "cashbackRate": 0.10,
      "monthlyFee": 19.99,
      "features": [
        "10% cashback on all purchases",
        "+5% bonus on BOOM-Sticker scans",
        "Instant receipt approval",
        "Premium analytics & insights",
        "24/7 priority support",
        "Exclusive partner offers",
        "No ads",
        "Early access to new features"
      ]
    }
  ]
}
```

---

### GET /api/subscriptions/current

Get the authenticated user's current subscription.

**Response (with active subscription):**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "plan": "PREMIUM",
  "status": "ACTIVE",
  "stripeSubscriptionId": "sub_xxxxxxxxxxxxx",
  "stripePriceId": "price_xxxxxxxxxxxxx",
  "stripeCustomerId": "cus_xxxxxxxxxxxxx",
  "currentPeriodStart": "2025-01-01T00:00:00.000Z",
  "currentPeriodEnd": "2025-02-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "cancelAt": null,
  "canceledAt": null,
  "trialStart": null,
  "trialEnd": null,
  "metadata": null,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "benefits": {
    "cashbackRate": 0.07,
    "monthlyFee": 9.99,
    "features": [...]
  }
}
```

**Response (no subscription - defaults to STANDARD):**
```json
{
  "plan": "STANDARD",
  "status": "ACTIVE",
  "benefits": {
    "cashbackRate": 0.05,
    "monthlyFee": 0,
    "features": [...]
  }
}
```

---

### POST /api/subscriptions/create

Create a new subscription for the authenticated user.

**Request Body:**
```json
{
  "plan": "PREMIUM",
  "paymentMethodId": "pm_xxxxxxxxxxxxx"
}
```

**Validation:**
- `plan`: Required, must be one of: `STANDARD`, `PREMIUM`, `PLATINUM`
- `paymentMethodId`: Optional, Stripe payment method ID (required for paid plans)

**Response:**
```json
{
  "subscription": {
    "id": "uuid",
    "userId": "uuid",
    "plan": "PREMIUM",
    "status": "INCOMPLETE",
    "stripeSubscriptionId": "sub_xxxxxxxxxxxxx",
    "stripePriceId": "price_xxxxxxxxxxxxx",
    "stripeCustomerId": "cus_xxxxxxxxxxxxx",
    "currentPeriodStart": "2025-01-04T12:00:00.000Z",
    "currentPeriodEnd": "2025-02-04T12:00:00.000Z",
    "createdAt": "2025-01-04T12:00:00.000Z",
    "updatedAt": "2025-01-04T12:00:00.000Z"
  },
  "clientSecret": "seti_xxxxxxxxxxxxx_secret_xxxxxxxxxxxxx",
  "status": "incomplete"
}
```

**Status Codes:**
- `200` - Subscription created
- `400` - User already has active subscription or invalid plan
- `401` - Unauthorized
- `500` - Stripe error

**Note:** For paid plans (PREMIUM/PLATINUM), the `clientSecret` must be used with Stripe.js to confirm the payment.

---

### POST /api/subscriptions/:id/cancel

Cancel an existing subscription.

**URL Parameters:**
- `id` - Subscription ID

**Request Body:**
```json
{
  "cancelAtPeriodEnd": true
}
```

**Validation:**
- `cancelAtPeriodEnd`: Optional, boolean (default: true)
  - `true`: Cancel at end of current billing period
  - `false`: Cancel immediately

**Response:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "plan": "PREMIUM",
  "status": "ACTIVE",
  "cancelAtPeriodEnd": true,
  "cancelAt": "2025-02-01T00:00:00.000Z",
  "canceledAt": "2025-01-04T12:00:00.000Z",
  "updatedAt": "2025-01-04T12:00:00.000Z"
}
```

**Status Codes:**
- `200` - Subscription cancelled
- `400` - Invalid subscription or cannot cancel STANDARD plan
- `401` - Unauthorized
- `404` - Subscription not found

---

### POST /api/subscriptions/:id/update-plan

Upgrade or downgrade a subscription plan.

**URL Parameters:**
- `id` - Subscription ID

**Request Body:**
```json
{
  "plan": "PLATINUM"
}
```

**Validation:**
- `plan`: Required, must be one of: `STANDARD`, `PREMIUM`, `PLATINUM`

**Response:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "plan": "PLATINUM",
  "status": "ACTIVE",
  "stripePriceId": "price_xxxxxxxxxxxxx",
  "updatedAt": "2025-01-04T12:00:00.000Z"
}
```

**Status Codes:**
- `200` - Plan updated successfully
- `400` - Invalid plan
- `401` - Unauthorized
- `404` - Subscription not found
- `500` - Stripe error

**Note:**
- Upgrading to a paid plan from STANDARD will create a new Stripe subscription
- Downgrading to STANDARD will cancel the current Stripe subscription
- Prorations are handled automatically by Stripe

---

## Webhook Events

The following Stripe webhook events are handled automatically:

### payment_intent.succeeded
- Creates/updates Transaction in database
- Credits wallet for `WALLET_TOPUP` type payments
- Updates WalletTransaction status to `COMPLETED`

### payment_intent.payment_failed
- Marks Transaction as `FAILED`
- Updates WalletTransaction status to `FAILED`

### charge.refunded
- Creates REFUND transaction
- Credits wallet for refunded wallet top-ups

### customer.subscription.updated
- Creates/updates Subscription in database
- Syncs subscription status and billing period

### customer.subscription.deleted
- Marks Subscription as CANCELLED

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message here"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `404` - Not Found
- `500` - Internal Server Error

---

## Database Models

### Wallet
- `id` - UUID
- `userId` - UUID (unique)
- `balance` - Float (total balance)
- `availableBalance` - Float (balance minus pending withdrawals)
- `pendingBalance` - Float (pending cashback credits)
- `currency` - String (default: "BGN")
- `isLocked` - Boolean
- `lockedReason` - String (nullable)
- `lockedAt` - DateTime (nullable)

### WalletTransaction
- `id` - UUID
- `walletId` - UUID
- `type` - Enum (TOP_UP, WITHDRAWAL, CASHBACK_CREDIT, PURCHASE, REFUND, TRANSFER, ADJUSTMENT)
- `amount` - Float
- `balanceBefore` - Float
- `balanceAfter` - Float
- `status` - Enum (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)
- `description` - String
- `metadata` - JSON
- `stripePaymentIntentId` - String (nullable)
- `transactionId` - UUID (nullable)
- `receiptId` - UUID (nullable)
- `stickerScanId` - UUID (nullable)

### Subscription
- `id` - UUID
- `userId` - UUID
- `plan` - Enum (STANDARD, PREMIUM, PLATINUM)
- `status` - Enum (ACTIVE, PAST_DUE, CANCELLED, INCOMPLETE, TRIALING, etc.)
- `stripeSubscriptionId` - String (unique, nullable)
- `stripePriceId` - String (nullable)
- `stripeCustomerId` - String (nullable)
- `currentPeriodStart` - DateTime
- `currentPeriodEnd` - DateTime
- `cancelAtPeriodEnd` - Boolean
- `cancelAt` - DateTime (nullable)
- `canceledAt` - DateTime (nullable)
- `trialStart` - DateTime (nullable)
- `trialEnd` - DateTime (nullable)

---

## Testing

### Test Wallet Top-Up

```bash
curl -X POST http://localhost:3001/api/wallet/topup \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50}'
```

### Test Get Balance

```bash
curl -X GET http://localhost:3001/api/wallet/balance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Get Subscription Plans

```bash
curl -X GET http://localhost:3001/api/subscriptions/plans \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Create Subscription

```bash
curl -X POST http://localhost:3001/api/subscriptions/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan": "PREMIUM", "paymentMethodId": "pm_card_visa"}'
```

---

## Stripe Configuration

### Required Environment Variables

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
STRIPE_PREMIUM_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PLATINUM_PRICE_ID=price_xxxxxxxxxxxxx
```

### Create Stripe Products

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/test/products)
2. Click "Add Product"
3. Create **BoomCard Premium**:
   - Name: BoomCard Premium
   - Pricing: 9.99 BGN/month
   - Recurring billing
4. Create **BoomCard Platinum**:
   - Name: BoomCard Platinum
   - Pricing: 19.99 BGN/month
   - Recurring billing
5. Copy the price IDs and add to `.env`

### Setup Webhooks

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "Add endpoint"
3. Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook signing secret and add to `.env`

For local development, use Stripe CLI:
```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

---

## Implementation Status

✅ **Phase 1**: Database Models & Migrations - COMPLETE
✅ **Phase 2**: Wallet Service & API - COMPLETE
✅ **Phase 3**: Stripe Webhook Persistence - COMPLETE
✅ **Phase 4**: Subscription System - COMPLETE

**Total Implementation:**
- 4 new database models
- 4 new enums
- 9 API endpoints
- 4 webhook handlers
- ~1,500 lines of code
