# Paysera Payment Gateway Setup Guide

Complete guide for integrating Paysera payment gateway with BoomCard platform.

## What is Paysera?

Paysera is a leading payment gateway in Eastern Europe, offering:
- 💳 Multiple payment methods (cards, bank transfers, e-wallets)
- 💰 Lower transaction fees than international gateways
- 🇧🇬 Excellent BGN (Bulgarian Lev) support
- 🌍 Support for 7+ currencies
- 🏦 Direct bank integration with major Bulgarian banks
- 🔒 PCI DSS Level 1 certified security

**Why Paysera for BoomCard?**
- Native Bulgarian market support
- Lower fees (1.5-2.5% vs Stripe's 2.9% + €0.25)
- Local payment methods (Easypay, ePay.bg)
- Better currency conversion rates for BGN

---

## Step 1: Create Paysera Account

### 1.1 Sign Up

1. Go to [https://www.paysera.com/v2/en-US/registration](https://www.paysera.com/v2/en-US/registration)
2. Choose **"Business Account"**
3. Fill in company information:
   - Company name: **BoomCard Ltd.**
   - Country: **Bulgaria**
   - Email: Your business email
   - Phone: +359 XXX XXX XXX

4. Verify your email address
5. Complete KYC (Know Your Customer) verification:
   - Upload company registration documents
   - Provide business owner ID
   - Verify bank account

⏱️ **Account approval takes 1-3 business days**

### 1.2 Choose Account Type

**For BoomCard, we recommend:**
- **Standard Account**: 1.5% + €0.10 per transaction
- Supports cards, bank transfers, wallets
- No monthly fees
- Perfect for startups

**Alternatives:**
- **Premium Account**: 1.2% + €0.08 (for high volume)
- **Enterprise**: Custom pricing (for very high volume)

---

## Step 2: Create Payment Project

### 2.1 Create New Project

1. Log in to Paysera dashboard: [https://bank.paysera.com/en/login](https://bank.paysera.com/en/login)
2. Navigate to **"Services"** → **"Payment Gateway"**
3. Click **"Create Project"**
4. Fill in project details:
   - **Project name**: BoomCard Production
   - **Website URL**: https://boomcard.bg
   - **Description**: QR Discount Card Platform
   - **Payment methods**:
     - ✅ Cards (Visa, Mastercard)
     - ✅ Bank transfers
     - ✅ Paysera wallet
     - ✅ Easypay
     - ✅ ePay.bg

### 2.2 Get Project Credentials

After creating the project:

1. Go to **"Project Settings"**
2. Find and copy:
   - **Project ID** (e.g., `123456`)
   - **Sign Password** (e.g., `a1b2c3d4e5f6g7h8i9j0`)

⚠️ **Keep these credentials secure!** Never commit them to Git.

### 2.3 Configure Project Settings

In Paysera dashboard:

1. **Accepted currencies**: Enable BGN, EUR, USD
2. **Payment methods**: Enable all available methods
3. **Test mode**: Enable for development
4. **Notifications**: Add your email for transaction alerts

---

## Step 3: Configure Backend Environment

### 3.1 Add Environment Variables

Add to `backend-api/.env`:

```env
# Paysera Configuration
PAYSERA_PROJECT_ID=123456
PAYSERA_SIGN_PASSWORD=your_sign_password_from_dashboard
PAYSERA_TEST_MODE=true
PAYSERA_API_URL=https://www.paysera.com/pay

# URLs for payment redirects
FRONTEND_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000
```

### 3.2 Production Environment Variables

For production (Render.com):

```env
# Paysera Production
PAYSERA_PROJECT_ID=123456
PAYSERA_SIGN_PASSWORD=your_production_sign_password
PAYSERA_TEST_MODE=false
PAYSERA_API_URL=https://www.paysera.com/pay

# Production URLs
FRONTEND_URL=https://boomcard.bg
API_BASE_URL=https://api.boomcard.bg
```

### 3.3 Add to Render Dashboard

1. Go to Render dashboard
2. Select your backend service
3. Navigate to **"Environment"**
4. Add environment variables:
   - `PAYSERA_PROJECT_ID`
   - `PAYSERA_SIGN_PASSWORD`
   - `PAYSERA_TEST_MODE=false`
   - `PAYSERA_API_URL`

---

## Step 4: Configure Webhook URL

### 4.1 Set Callback URL in Paysera

1. Go to Paysera dashboard → **"Project Settings"**
2. Find **"Callback URL"** section
3. Add your callback URL:
   - Development: `http://your-ngrok-url.ngrok.io/api/payments/callback`
   - Production: `https://api.boomcard.bg/api/payments/callback`

4. **Important**: Paysera will send POST requests to this URL
5. The callback URL must be publicly accessible
6. Webhook includes payment status updates

### 4.2 Set Accept/Cancel URLs (Optional)

These are dynamic and set per-payment, but you can set defaults:
- **Accept URL**: `https://boomcard.bg/payments/success`
- **Cancel URL**: `https://boomcard.bg/payments/cancel`

---

## Step 5: Test Payment Integration

### 5.1 Enable Test Mode

In `.env`:
```env
PAYSERA_TEST_MODE=true
```

### 5.2 Test with Sandbox

**Test Card Numbers:**
```
Card: 4111 1111 1111 1111
Expiry: Any future date (e.g., 12/25)
CVV: 123
Name: TEST USER
```

**Expected Results:**
- ✅ Success: Payment completes, wallet balance updates
- ❌ Failure: Payment rejected, no balance change
- 🔄 Pending: Payment awaits confirmation

### 5.3 Test Payment Flow

1. **Create payment**:
```bash
curl -X POST http://localhost:3000/api/payments/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 50.00,
    "currency": "BGN",
    "description": "Test wallet top-up"
  }'
```

2. **Response**:
```json
{
  "success": true,
  "data": {
    "orderId": "BOOM-1704368400000-a1b2c3d4",
    "paymentUrl": "https://www.paysera.com/pay/?data=...",
    "amount": 5000,
    "currency": "BGN",
    "status": "pending"
  }
}
```

3. **Redirect user** to `paymentUrl`
4. **Complete payment** on Paysera page
5. **Verify callback** received and wallet updated

### 5.4 Check Payment Status

```bash
curl -X GET http://localhost:3000/api/payments/BOOM-1704368400000-a1b2c3d4/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "BOOM-1704368400000-a1b2c3d4",
    "status": "completed",
    "amount": 50.00,
    "currency": "BGN",
    "createdAt": "2025-01-04T10:30:00.000Z"
  }
}
```

---

## Step 6: Update Frontend for Redirect Flow

### 6.1 Create Payment Button Component

Create `partner-dashboard/src/components/PaymentButton.tsx`:

```typescript
import { useState } from 'react';
import { api } from '@/services/api';

export function PaymentButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/payments/create', {
        amount: 50.00,
        currency: 'BGN',
        description: 'Wallet top-up',
      });

      const { paymentUrl } = response.data.data;

      // Redirect user to Paysera payment page
      window.location.href = paymentUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? 'Processing...' : 'Top Up Wallet (50 BGN)'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

### 6.2 Create Success/Cancel Pages

**Success Page** (`partner-dashboard/src/pages/PaymentSuccessPage.tsx`):

```typescript
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/services/api';

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    const checkPayment = async () => {
      try {
        const response = await api.get(`/payments/${orderId}/status`);
        if (response.data.data.status === 'completed') {
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (err) {
        setStatus('error');
      }
    };

    if (orderId) {
      checkPayment();
    }
  }, [orderId]);

  if (status === 'loading') {
    return <div>Verifying payment...</div>;
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold text-green-600">Payment Successful!</h1>
        <p>Your wallet has been topped up.</p>
        <a href="/dashboard" className="btn-primary">Go to Dashboard</a>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-red-600">Payment Failed</h1>
      <p>Something went wrong. Please try again.</p>
      <a href="/wallet" className="btn-primary">Back to Wallet</a>
    </div>
  );
}
```

**Cancel Page** (`partner-dashboard/src/pages/PaymentCancelPage.tsx`):

```typescript
export function PaymentCancelPage() {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold">Payment Cancelled</h1>
      <p>You cancelled the payment process.</p>
      <a href="/wallet" className="btn-primary">Back to Wallet</a>
    </div>
  );
}
```

### 6.3 Add Routes

In `partner-dashboard/src/App.tsx`:

```typescript
import { PaymentSuccessPage } from './pages/PaymentSuccessPage';
import { PaymentCancelPage } from './pages/PaymentCancelPage';

<Routes>
  {/* ... other routes */}
  <Route path="/payments/success" element={<PaymentSuccessPage />} />
  <Route path="/payments/cancel" element={<PaymentCancelPage />} />
</Routes>
```

---

## Step 7: Security Best Practices

### 7.1 Signature Verification

**Already Implemented** in `paysera.service.ts`:
- MD5 signature verification (ss1)
- SHA-256 signature verification (ss2)
- Both must match for callback to be accepted

### 7.2 Amount Validation

Always verify:
- ✅ Amount matches expected payment
- ✅ Currency is supported
- ✅ Transaction hasn't been processed before

### 7.3 Callback Handling

**Important:**
- Callback URL must respond with **"OK"** text
- Don't return JSON or HTML
- Paysera retries if no "OK" received
- Already implemented in `generateCallbackResponse()`

### 7.4 Environment Separation

Always use separate projects for:
- **Development**: Test mode enabled
- **Staging**: Test mode enabled
- **Production**: Test mode disabled

---

## Step 8: Supported Payment Methods

### 8.1 Available Methods

Paysera supports:

| Method | Description | Countries |
|--------|-------------|-----------|
| **Card** | Visa, Mastercard, Maestro | Global |
| **Bank Transfer** | Direct bank transfer | Bulgaria, Lithuania, Latvia, Estonia |
| **Paysera Wallet** | Paysera account balance | Global |
| **Easypay** | Bulgarian payment system | Bulgaria |
| **ePay.bg** | Bulgarian e-payment | Bulgaria |
| **iDEAL** | Dutch payment method | Netherlands |
| **Sofort** | German bank transfer | Germany, Austria, Switzerland |

### 8.2 Bulgarian Payment Methods

For Bulgarian users, enable:
- ✅ Cards (Visa, Mastercard)
- ✅ Easypay (popular in Bulgaria)
- ✅ ePay.bg (widely used)
- ✅ Bank transfer (local banks)

### 8.3 Currency Support

**Supported by BoomCard:**
- 🇧🇬 BGN - Bulgarian Lev (primary)
- 🇪🇺 EUR - Euro
- 🇺🇸 USD - US Dollar
- 🇬🇧 GBP - British Pound
- 🇵🇱 PLN - Polish Zloty
- 🇨🇿 CZK - Czech Koruna
- 🇷🇴 RON - Romanian Leu

To add more currencies, update `getSupportedCurrencies()` in `paysera.service.ts`.

---

## Step 9: Transaction Fees

### 9.1 Paysera Fee Structure

**Card Payments:**
- Standard: 1.5% + €0.10
- Premium: 1.2% + €0.08
- Enterprise: Custom pricing

**Bank Transfers:**
- SEPA: €0.29
- Bulgarian banks: €0.19

**Paysera Wallet:**
- Internal transfers: FREE
- Top-ups: FREE

### 9.2 Example Calculations

**50 BGN wallet top-up:**
```
Transaction: 50.00 BGN
Fee: 1.5% + €0.10 = 0.75 BGN + 0.20 BGN = 0.95 BGN
User pays: 50.95 BGN
You receive: 50.00 BGN
```

**Compare with Stripe:**
```
Transaction: 50.00 BGN (≈ €25.56)
Fee: 2.9% + €0.25 = 0.74 EUR + 0.25 EUR = 0.99 EUR (≈ 1.94 BGN)
User pays: 51.94 BGN
You receive: 50.00 BGN

💰 Savings with Paysera: 0.99 BGN per transaction (≈ 50% cheaper!)
```

---

## Step 10: Monitoring & Analytics

### 10.1 Paysera Dashboard

Monitor transactions:
1. Go to [https://bank.paysera.com/en/payment-gateway/statistics](https://bank.paysera.com/en/payment-gateway/statistics)
2. View:
   - Total transactions
   - Success rate
   - Revenue
   - Popular payment methods
   - Geographical distribution

### 10.2 Backend Logs

Check logs for payment events:
```bash
# View payment creation logs
grep "Payment created" backend-api/logs/app.log

# View callback logs
grep "Callback result" backend-api/logs/app.log

# View errors
grep "Error creating payment" backend-api/logs/app.log
```

### 10.3 Sentry Integration

All payment errors are automatically sent to Sentry:
- Failed signature verification
- Invalid callback data
- Payment creation errors
- Wallet update failures

---

## Step 11: Testing Checklist

Before going live, test:

- [ ] Create payment in test mode
- [ ] Complete payment with test card
- [ ] Verify callback received
- [ ] Check wallet balance updated
- [ ] Test payment cancellation
- [ ] Test invalid signature handling
- [ ] Test duplicate payment prevention
- [ ] Test unsupported currency rejection
- [ ] Test amount validation
- [ ] Test payment status endpoint
- [ ] Test payment history endpoint
- [ ] Test concurrent payments

---

## Step 12: Go Live!

### 12.1 Pre-Launch Checklist

- [ ] KYC verification complete
- [ ] Production project created
- [ ] Webhook URL set correctly
- [ ] Environment variables updated
- [ ] Test mode disabled (`PAYSERA_TEST_MODE=false`)
- [ ] Frontend routes deployed
- [ ] Success/Cancel pages working
- [ ] Monitoring enabled (Sentry)
- [ ] Error alerts configured

### 12.2 Switch to Production

1. Update environment variables:
```env
PAYSERA_TEST_MODE=false
PAYSERA_PROJECT_ID=your_production_project_id
PAYSERA_SIGN_PASSWORD=your_production_sign_password
```

2. Deploy to Render:
```bash
git add .
git commit -m "Switch to Paysera production mode"
git push
```

3. Verify in Render dashboard:
   - Environment variables updated
   - Service restarted
   - Health check passing

### 12.3 First Real Transaction

1. Make a small test payment (5 BGN)
2. Verify webhook received
3. Check wallet balance
4. Monitor Sentry for errors
5. Check Paysera dashboard

---

## Troubleshooting

### Issue: "Invalid signature" Error

**Cause:** Sign password mismatch

**Solution:**
1. Verify `PAYSERA_SIGN_PASSWORD` matches dashboard
2. Check for trailing spaces
3. Ensure password is correct project password

### Issue: Webhook Not Received

**Cause:** URL not publicly accessible

**Solution:**
1. Use ngrok for local testing:
```bash
ngrok http 3000
# Use: https://xxxxx.ngrok.io/api/payments/callback
```
2. Verify callback URL in Paysera dashboard
3. Check server logs for incoming requests

### Issue: Payment Status Stays "Pending"

**Cause:** Callback not processed successfully

**Solution:**
1. Check webhook URL responds with "OK"
2. Verify signature verification passes
3. Check transaction logs in database
4. Review Sentry errors

### Issue: Amount Mismatch

**Cause:** Cents conversion error

**Solution:**
- Always use `PayseraService.amountToCents(amount)`
- Amount must be in cents (multiply by 100)
- Example: 50 BGN = 5000 cents

### Issue: Duplicate Payments

**Cause:** User clicking "Pay" multiple times

**Solution:**
- Check if orderId already exists before creating
- Use unique orderId format: `BOOM-${timestamp}-${random}`
- Add frontend loading state

---

## API Reference

### POST /api/payments/create

Create new payment.

**Request:**
```json
{
  "amount": 50.00,
  "currency": "BGN",
  "description": "Wallet top-up",
  "metadata": { "source": "mobile" }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "BOOM-1704368400000-a1b2c3d4",
    "transactionId": "clx123456789",
    "paymentUrl": "https://www.paysera.com/pay/?data=...",
    "amount": 5000,
    "currency": "BGN",
    "status": "pending"
  }
}
```

### POST /api/payments/callback

Webhook from Paysera (server-to-server only).

**Request:**
```
data=eyJwcm9qZWN0aWQiOiIxMjM...
ss1=a1b2c3d4e5f6...
ss2=1a2b3c4d5e6f...
```

**Response:**
```
OK
```

### GET /api/payments/:orderId/status

Check payment status.

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "BOOM-1704368400000-a1b2c3d4",
    "status": "completed",
    "amount": 50.00,
    "currency": "BGN",
    "description": "Wallet top-up",
    "createdAt": "2025-01-04T10:30:00.000Z"
  }
}
```

### GET /api/payments/history

Get user payment history.

**Query Params:**
- `limit` (default: 20)
- `offset` (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123456789",
      "orderId": "BOOM-1704368400000-a1b2c3d4",
      "amount": 50.00,
      "currency": "BGN",
      "status": "completed",
      "description": "Wallet top-up",
      "createdAt": "2025-01-04T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 20,
    "offset": 0
  }
}
```

### GET /api/payments/methods

Get supported payment methods and currencies.

**Response:**
```json
{
  "success": true,
  "data": {
    "methods": ["card", "wallet", "bank_transfer", "easypay", "epay"],
    "currencies": ["BGN", "EUR", "USD", "GBP", "PLN", "CZK", "RON"]
  }
}
```

---

## Useful Links

- [Paysera Website](https://www.paysera.com)
- [Paysera API Documentation](https://developers.paysera.com/en/payments/current)
- [Paysera Dashboard](https://bank.paysera.com/en/login)
- [Paysera Support](https://www.paysera.com/v2/en-US/contacts)
- [Paysera Fee Calculator](https://www.paysera.com/v2/en-US/payment-gateway/pricing)

---

## Support

**Paysera Support:**
- Email: support@paysera.com
- Phone: +370 5 2042632 (Lithuania)
- Live chat: Available in dashboard

**BoomCard Team:**
- GitHub Issues: your-repo/issues
- Email: support@boomcard.bg

---

**Setup Date:** _____________________
**Configured By:** _____________________
**Project ID:** _____________________
**Test Mode:** Enabled / Disabled
**Production Ready:** Yes / No
