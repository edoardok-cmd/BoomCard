# 🎫 QR Code System - Quick Reference

## Does Every User Get a Unique QR Code?

### ✅ YES!

Each BoomCard has a **unique QR code** that identifies it.

```
┌─────────────────────────────────────────┐
│         USER: demo@boomcard.bg          │
├─────────────────────────────────────────┤
│                                         │
│  Card 1: Standard                       │
│  ├─ Card Number: BC-2024-000001         │
│  ├─ QR Code: unique_string_001 ← UNIQUE │
│  └─ Status: ACTIVE                      │
│                                         │
│  Card 2: Premium                        │
│  ├─ Card Number: BC-2024-000002         │
│  ├─ QR Code: unique_string_002 ← UNIQUE │
│  └─ Status: ACTIVE                      │
│                                         │
└─────────────────────────────────────────┘
```

---

## How It Works

```
User Signs Up → Card Created → QR Generated → User Downloads
```

### Card Record Structure

```json
{
  "id": "clx1234567890abcdef",
  "userId": "user_123",
  "cardNumber": "BC-2024-000001",
  "qrCode": "unique_qr_string_001",  ← Stored in database
  "type": "STANDARD",
  "status": "ACTIVE",
  "validFrom": "2024-01-01",
  "validUntil": "2025-01-01",
  "usageCount": 15,
  "usageLimit": 100
}
```

---

## Database Uniqueness

```sql
-- QR codes are unique across all cards
CREATE UNIQUE INDEX ON cards(qrCode);
CREATE UNIQUE INDEX ON cards(cardNumber);
```

**Result:** No two cards can have the same QR code!

---

## QR Code Content

What's encoded in the QR:

```
Option 1 (Simple):
"clx1234567890abcdef"

Option 2 (JSON):
{
  "cardId": "clx123...",
  "cardNumber": "BC-2024-000001",
  "userId": "user_123",
  "type": "STANDARD",
  "exp": 1735689600000
}

Option 3 (JWT - Most Secure):
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Validation Flow

```
Venue Scans QR
    ↓
Decode QR Data
    ↓
Look Up Card in Database
    ↓
Check Status (ACTIVE?)
    ↓
Check Validity (Not Expired?)
    ↓
Check Usage Limit (Not Exceeded?)
    ↓
✅ Valid → Apply Discount
❌ Invalid → Show Error
```

---

## QR Component Features

Location: [QRCode.tsx](partner-dashboard/src/components/common/QRCode/QRCode.tsx)

```typescript
<QRCode
  data="card_clx123..."        // Unique card data
  size={256}                    // 256x256 pixels
  logo="/logo.png"              // Optional logo overlay
  downloadable={true}           // Enable download
  title="My BoomCard"
  description="Scan to redeem"
/>
```

**Features:**
- 📥 Download as PNG
- 📤 Share via Web Share API
- 📋 Copy data to clipboard
- 🎨 Custom logo overlay
- ✨ Smooth animations
- 🔒 High error correction (Level H)

---

## Card Types

| Type | Color | QR Theme | Validity | Usage Limit |
|------|-------|----------|----------|-------------|
| **Standard** | Silver | Basic | 1 year | Optional |
| **Premium** | Gold | Enhanced | 1 year | Higher |
| **Platinum** | Black | Premium | 2 years | Unlimited |

**Note:** All use the same QR validation system.

---

## Security

### ✅ Implemented

- Unique database constraints
- Status validation (ACTIVE/EXPIRED/SUSPENDED)
- Time-based validation (validFrom/validUntil)
- Usage tracking (count every scan)
- Usage limits enforcement

### 🟡 Ready for Backend

- JWT signing for QR data
- HMAC signature verification
- Rate limiting on scans
- Fraud detection integration
- Blacklist checking

---

## User Journey

### Getting Your QR Code

1. **Sign Up** → Account created
2. **Auto-Assigned** → Card generated with unique QR
3. **Dashboard** → View QR code
4. **Download** → Save to phone
5. **Show at Venue** → Scan & redeem

### Using Your QR Code

```
Customer → Shows QR
Venue → Scans QR
System → Validates
System → Records Transaction
Customer → Gets Discount
```

---

## Multiple Cards

```
User Account
├─ Standard Card (QR: ABC123)
│  └─ For everyday discounts
├─ Premium Card (QR: XYZ789)
│  └─ For premium venues
└─ Platinum Card (QR: PLT456)
   └─ For VIP access
```

**Each card has its own unique QR code!**

---

## Transaction Tracking

Every scan creates a transaction:

```typescript
{
  "id": "tx_001",
  "userId": "user_123",
  "cardId": "card_001",        ← Links to specific card
  "qrCode": "scanned_qr",      ← QR code that was scanned
  "venueId": "venue_456",
  "amount": 100.00,
  "discount": 20,
  "finalAmount": 80.00,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

---

## Analytics

### Per Card

- Total scans
- Total savings
- Most used venues
- Usage pattern

### Per User

- All cards combined
- Total lifetime savings
- Favorite venues
- Redemption history

---

## Testing

### Create Test Card

```typescript
const testCard = await prisma.card.create({
  data: {
    userId: 'user_123',
    cardNumber: 'BC-TEST-001',
    qrCode: generateUniqueString(),  // ← Unique!
    type: 'STANDARD',
    status: 'ACTIVE',
    validFrom: new Date(),
    validUntil: addYears(new Date(), 1),
  }
});
```

### Validate QR Code

```typescript
const card = await prisma.card.findUnique({
  where: { qrCode: scannedCode }
});

if (card && card.status === 'ACTIVE') {
  // Apply discount
} else {
  // Show error
}
```

---

## Quick Stats

| Metric | Value |
|--------|-------|
| QR Size | 256x256 px |
| Error Correction | Level H (30%) |
| Format | PNG |
| Color | Black & White |
| Logo Size | 20% of QR |
| Database Field | `qrCode` (unique) |
| Index | `@@unique([qrCode])` |
| Generation | On card creation |
| Validation | On scan |

---

## Key Takeaways

1. ✅ **One Card = One QR**: Each card has unique QR code
2. ✅ **Multiple Cards OK**: Users can have many cards
3. ✅ **Database Enforced**: Uniqueness guaranteed
4. ✅ **Fully Tracked**: Every scan recorded
5. ✅ **Frontend Ready**: QR component complete
6. 🟡 **Backend Needed**: Validation API to implement

---

## Related Documentation

- 📚 **[QR_CODE_SYSTEM.md](QR_CODE_SYSTEM.md)** - Full technical guide
- 🔐 **[AUTHENTICATION_SUMMARY.md](AUTHENTICATION_SUMMARY.md)** - Auth system
- 📖 **[README.md](README.md)** - Project overview
- 🗄️ **[schema.prisma](prisma/schema.prisma)** - Database schema

---

**Last Updated:** 2025-10-13
