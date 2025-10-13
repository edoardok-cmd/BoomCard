# 🎯 QR Code Storage: What to Store vs What Not to Store

## Quick Visual Comparison

```
┌─────────────────────────────────────────────────────────────┐
│                    ❌ DON'T STORE                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  QR Code Image (Binary/PNG)                                 │
│  ┌─────────────┐                                            │
│  │ ███ ▄▄▄ ███ │  Size: ~8KB per card                       │
│  │ █ █ ███ █ █ │  Storage: Grows forever                    │
│  │ █▄▄ ▀▀▀ ▄▄█ │  Query: Slows database                     │
│  │ ▄▄▄▄ ▀ ▄▄▄▄ │  Regenerate: Difficult                     │
│  │ ███ ▄▀▀ ███ │  Update: Must update DB                    │
│  └─────────────┘                                            │
│                                                              │
│  Result: ❌ Waste of space, slow, inflexible                │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ✅ DO STORE                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  QR Data String (JWT or Identifier)                         │
│                                                              │
│  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."                  │
│   │                                                          │
│   └─ Size: ~200 bytes                                       │
│   └─ Storage: Minimal                                       │
│   └─ Query: Fast (indexed)                                  │
│   └─ Regenerate: Easy (generate image on-demand)            │
│   └─ Update: Simple string update                           │
│                                                              │
│  Result: ✅ Fast, efficient, flexible                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Storage Impact at Scale

### Scenario: 1 Million Cards

| Storage Type | Per Card | 1M Cards | Cost/Year |
|--------------|----------|----------|-----------|
| **Images in DB** | 8 KB | 8 GB | $960 |
| **Images in S3** | 8 KB | 8 GB | $184 |
| **Data String** | 200 bytes | 200 MB | $24 |

**Savings: 97% less storage with data strings!**

---

## 🔐 How Verification Works (Without Storing Images)

### The Process

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Card Creation                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Signs Up                                               │
│      ↓                                                       │
│  Backend generates JWT:                                      │
│  ┌────────────────────────────────────────────────────┐     │
│  │ const qrData = sign({                              │     │
│  │   cardId: "clx123...",                             │     │
│  │   userId: "user_abc",                              │     │
│  │   type: "PREMIUM",                                 │     │
│  │   exp: 1735689600,                                 │     │
│  │   jti: "unique-id"                                 │     │
│  │ }, SECRET);                                        │     │
│  └────────────────────────────────────────────────────┘     │
│      ↓                                                       │
│  Store in Database:                                          │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Card {                                             │     │
│  │   id: "clx123...",                                 │     │
│  │   qrCode: "eyJhbGciOiJI..." ← Store JWT string    │     │
│  │   status: "ACTIVE"                                 │     │
│  │ }                                                  │     │
│  └────────────────────────────────────────────────────┘     │
│      ↓                                                       │
│  Frontend generates image when needed:                       │
│  <QRCode data={card.qrCode} /> ← Generates PNG on-the-fly  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STEP 2: QR Display (No DB query needed)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User opens "My Cards" page                                 │
│      ↓                                                       │
│  Frontend already has: card.qrCode = "eyJhbG..."           │
│      ↓                                                       │
│  QRCode.toCanvas(canvas, card.qrCode)  ← Generate image    │
│      ↓                                                       │
│  Display QR code to user (instant, no DB call!)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  STEP 3: QR Verification (When Scanned at Venue)            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Venue scans QR → Extracts: "eyJhbGciOiJI..."              │
│      ↓                                                       │
│  Send to Backend API:                                        │
│  POST /api/transactions/verify-qr                           │
│  { qrCode: "eyJhbGciOiJI...", venueId: "venue_789" }       │
│      ↓                                                       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ LAYER 1: Verify JWT Signature                    │       │
│  │ ✅ Signature valid = Real QR code                │       │
│  │ ❌ Invalid = Fake/Forged QR                      │       │
│  └──────────────────────────────────────────────────┘       │
│      ↓                                                       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ LAYER 2: Extract card ID from JWT                │       │
│  │ const { cardId } = verify(qrCode, SECRET)        │       │
│  └──────────────────────────────────────────────────┘       │
│      ↓                                                       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ LAYER 3: Look up card in database                │       │
│  │ const card = await findUnique({ id: cardId })    │       │
│  │ ✅ Found = Check status                          │       │
│  │ ❌ Not found = Invalid                           │       │
│  └──────────────────────────────────────────────────┘       │
│      ↓                                                       │
│  ┌──────────────────────────────────────────────────┐       │
│  │ LAYER 4: Validate card status                    │       │
│  │ if (card.status !== 'ACTIVE') return false       │       │
│  │ if (now > card.validUntil) return false          │       │
│  │ if (usageCount >= limit) return false            │       │
│  └──────────────────────────────────────────────────┘       │
│      ↓                                                       │
│  ✅ All checks passed → Apply discount                      │
│  ❌ Any check failed → Reject                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Security: Why This Works

### The Magic of JWT Signatures

```
┌─────────────────────────────────────────────────────────────┐
│  What's in a JWT?                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9  ← Header            │
│  .                                                           │
│  eyJjYXJkSWQiOiJjbHgxMjMiLCJ1c2VySWQi  ← Payload (Data)    │
│  .                                                           │
│  7xZ8K9mQ2vN4pL1wR6tY5sH3jK0fB9xC     ← Signature (Proof)   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Signature Creation (Backend Only)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Signature = HMAC-SHA256(                                   │
│    base64(header) + "." + base64(payload),                  │
│    SECRET_KEY  ← Only backend knows this!                   │
│  )                                                           │
│                                                              │
│  Result: Unique signature that proves authenticity          │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Why You Can't Fake It                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Attacker tries to create fake QR:                          │
│  1. Creates payload: { cardId: "fake123" }                  │
│  2. Encodes it: "eyJjYXJkSWQiOiJmYWtlMTIzIn0="            │
│  3. Tries to create signature... ❌                         │
│     → Doesn't know SECRET_KEY                               │
│     → Can't create valid signature                          │
│  4. Backend verification:                                    │
│     → verify(fakeJWT, SECRET_KEY)                           │
│     → ❌ Signature mismatch → REJECTED                      │
│                                                              │
│  Attacker modifies existing QR:                             │
│  1. Has valid QR: "eyJhbG...original...signature"          │
│  2. Changes payload to different card ID                     │
│  3. But signature still for old payload... ❌               │
│  4. Backend verification:                                    │
│     → Signature doesn't match new payload                   │
│     → ❌ Tampered → REJECTED                                │
│                                                              │
│  Only way to create valid QR: Have SECRET_KEY 🔐           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎭 Attack Scenarios & Defenses

### Scenario 1: Screenshot Sharing

**Attack:**
```
User shares screenshot of valid QR with friend
→ Friend tries to use it at venue
```

**Defense 1: Rate Limiting**
```typescript
// Track recent scans
const recentScans = await prisma.transaction.count({
  where: {
    cardId,
    createdAt: { gte: new Date(Date.now() - 60000) } // Last minute
  }
});

if (recentScans > 3) {
  return { valid: false, error: 'Too many scans, suspicious activity' };
}
```

**Defense 2: Location Tracking**
```typescript
// Flag if used at multiple distant locations
const lastTransaction = await prisma.transaction.findFirst({
  where: { cardId },
  orderBy: { createdAt: 'desc' }
});

if (lastTransaction) {
  const distance = calculateDistance(
    lastTransaction.venue.location,
    currentVenue.location
  );
  const timeDiff = now - lastTransaction.createdAt;

  // Impossible travel (200km in 10 minutes)
  if (distance > 200 && timeDiff < 600000) {
    await flagForFraud(cardId, 'impossible-travel');
    return { valid: false, error: 'Suspicious activity detected' };
  }
}
```

### Scenario 2: Fake QR Generation

**Attack:**
```
Attacker creates fake QR with premium card data
```

**Defense: JWT Signature**
```typescript
try {
  const payload = verify(scannedQR, process.env.QR_SECRET);
  // ✅ Signature valid = Real QR from our system
} catch (error) {
  // ❌ Signature invalid = Fake QR
  await logSecurityIncident('fake-qr-attempt', { scannedQR });
  return { valid: false, error: 'Invalid QR code' };
}
```

### Scenario 3: Old QR Reuse After Cancellation

**Attack:**
```
User cancels card but keeps old QR screenshot
→ Tries to use it later
```

**Defense: Real-time Status Check**
```typescript
const card = await prisma.card.findUnique({
  where: { id: payload.cardId }
});

if (card.status === 'CANCELED') {
  return { valid: false, error: 'Card has been canceled' };
}
```

---

## 💡 Key Insights

### Why Database Lookup is Still Needed

Even with JWT signatures, you need database lookup for:

1. **Real-time Status** - Card could be canceled after QR generated
2. **Usage Tracking** - Increment usage count
3. **Fraud Detection** - Check usage patterns
4. **Feature Updates** - Card type might have changed
5. **Revocation** - Specific QR might be blacklisted

### The Perfect Balance

```
JWT Signature = Proof of authenticity (prevents fakes)
    +
Database Lookup = Current status (prevents misuse)
    =
Maximum Security ✅
```

---

## 📋 Implementation Checklist

### Phase 1: Basic (Current)
- [x] Store QR data string in database
- [x] Generate QR images on frontend
- [x] Database lookup verification
- [ ] Add status checks
- [ ] Add expiration checks

### Phase 2: JWT Security
- [ ] Implement JWT generation on card creation
- [ ] Add JWT verification in API
- [ ] Store JWT string in `qrCode` field
- [ ] Add QR version tracking
- [ ] Implement token rotation

### Phase 3: Advanced Security
- [ ] Token revocation system
- [ ] Fraud detection integration
- [ ] Rate limiting
- [ ] Location-based verification
- [ ] Security event logging

### Phase 4: Optimization
- [ ] Offline verification support
- [ ] QR caching strategy
- [ ] Performance monitoring
- [ ] Secret key rotation
- [ ] Audit trail

---

## 🎯 Final Answer

### What to Store:
```typescript
✅ qrCode: string (JWT or unique identifier)
✅ qrCodeVersion: number
✅ status: CardStatus
✅ validFrom: DateTime
✅ validUntil: DateTime
✅ usageCount: number
```

### What NOT to Store:
```typescript
❌ qrCodeImage: Bytes
❌ qrCodeImageUrl: string
❌ qrCodePNG: Buffer
```

### How to Verify:
```
1. JWT Signature (proves authenticity)
2. Database Lookup (checks current status)
3. Status Validation (active/expired/canceled)
4. Fraud Detection (usage patterns)
5. Record Transaction (track usage)
```

---

**Conclusion:**
Store the **data string** (ideally a JWT), not the image. Generate images on-demand. Verify using **JWT signature + database lookup** for maximum security.

---

**Last Updated:** 2025-10-13
**Recommended:** ✅ JWT + Database Hybrid Approach

---

*Made with ❤️ by the BoomCard Team*
