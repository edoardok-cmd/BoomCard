# ⚡ Stripe Setup - Quick Start (2 minutes)

## 🎯 Goal
Create PREMIUM and PLATINUM subscription prices in Stripe

---

## 📝 Steps

### 1️⃣ Open Stripe Dashboard
👉 https://dashboard.stripe.com
- Switch to **Test Mode** (toggle top-right)

### 2️⃣ Go to Products
Click **Products** in left sidebar → **+ Add product**

### 3️⃣ Create Premium Product

```
Name: BoomCard Premium
Price: 9.99 BGN
Billing: Monthly
```

**Copy the Price ID** (e.g., `price_1Nxxx...`)

### 4️⃣ Create Platinum Product

```
Name: BoomCard Platinum
Price: 19.99 BGN
Billing: Monthly
```

**Copy the Price ID** (e.g., `price_1Nyyy...`)

### 5️⃣ Update .env File

```bash
# Add these lines to backend-api/.env
STRIPE_PREMIUM_PRICE_ID=price_1Nxxx...    # Paste your Premium ID
STRIPE_PLATINUM_PRICE_ID=price_1Nyyy...   # Paste your Platinum ID
```

### 6️⃣ Test

```bash
cd backend-api
node scripts/test-stripe-prices.js
```

You should see ✅ for both prices!

---

## ✅ Done!

You're ready to accept subscriptions!

**For detailed guide**: See [STRIPE_SETUP_GUIDE_DETAILED.md](STRIPE_SETUP_GUIDE_DETAILED.md)

---

## 🆘 Troubleshooting

**Can't find Price ID?**
- Click on your product in dashboard
- Look under "Pricing" section
- Price ID is shown like: `price_1NxxxxxxxxxxxxxxxxxxxXXX`

**Currency not available?**
- If BGN isn't available, use EUR or USD for testing
- Contact Stripe support to enable BGN

**Test script fails?**
- Make sure `STRIPE_SECRET_KEY` is set in `.env`
- Check you're using the correct Price IDs (test mode vs live mode)
