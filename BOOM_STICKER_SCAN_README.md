# BOOM-Sticker Scan System

## Overview

The **BOOM-Sticker Scan** system is a zero-effort, customer-driven validation system that eliminates the need for venue staff to interact with POS systems or dashboards. Customers self-validate their visits by scanning QR stickers placed at tables or counters, and BOOM Card automatically processes transactions and awards cashback.

---

## How It Works

### For Customers:
1. **Pay the bill** at the restaurant/venue
2. **Scan the QR sticker** on the table using the BOOM app
3. **Enter the bill amount** when prompted
4. **Take a photo of the receipt** using the in-app camera (OCR validates the amount)
5. **Receive instant cashback** (2-10% based on card tier)

### For Venues:
1. **Receive QR sticker kit** from BOOM
2. **Place stickers** on tables, counters, or bar stations
3. **Receive monthly invoice** based on confirmed visits
4. **No POS integration required** - zero technical work

---

## System Architecture

### Database Schema

Four new tables added to the Prisma schema:

#### 1. **Sticker**
Represents a physical QR sticker at a specific location.

```prisma
model Sticker {
  id            String        // Unique database ID
  venueId       String        // Which venue this sticker belongs to
  locationId    String        // Which location (table/counter) within venue
  stickerId     String        // Human-readable ID: "BAR32-MASA04"
  qrCode        String        // Base64 QR code image
  locationType  LocationType  // TABLE, COUNTER, BAR, etc.
  status        StickerStatus // PENDING, ACTIVE, INACTIVE, DAMAGED, RETIRED
  totalScans    Int           // Lifetime scan count
  lastScannedAt DateTime?     // Last time this sticker was scanned
}
```

#### 2. **StickerLocation**
Defines a specific location within a venue (e.g., Table 4, Counter 1).

```prisma
model StickerLocation {
  id             String
  venueId        String
  name           String       // "Table 04", "Counter 1"
  nameBg         String?      // Bulgarian translation
  locationType   LocationType
  locationNumber String       // "04", "01", "02"
  capacity       Int?         // Number of seats (for tables)
  floor          String?      // "Ground", "First", "Terrace"
  section        String?      // "Smoking", "Non-smoking", "VIP"
}
```

#### 3. **StickerScan**
Records each scan attempt by a customer.

```prisma
model StickerScan {
  id              String
  userId          String
  stickerId       String
  venueId         String
  cardId          String
  billAmount      Float        // Amount entered by user
  verifiedAmount  Float?       // Amount from OCR (if different)
  cashbackPercent Float        // Cashback % applied (varies by card tier)
  cashbackAmount  Float        // Calculated cashback in BGN
  status          ScanStatus   // PENDING, VALIDATING, APPROVED, REJECTED
  latitude        Float?       // GPS verification
  longitude       Float?       // GPS verification
  distance        Float?       // Distance from venue (meters)
  receiptImageUrl String?      // Uploaded receipt photo
  ocrData         Json?        // OCR extracted data
  fraudScore      Float        // 0-100 (higher = more suspicious)
  fraudReasons    String[]     // ["GPS_MISMATCH", "DUPLICATE_SCAN"]
  transactionId   String?      // Link to Transaction if approved
}
```

#### 4. **VenueStickerConfig**
Configuration settings for each venue's sticker program.

```prisma
model VenueStickerConfig {
  venueId                String   @unique
  cashbackPercent        Float    // Base cashback % (default: 5%)
  premiumBonus           Float    // Premium card bonus (default: +2%)
  platinumBonus          Float    // Platinum card bonus (default: +5%)
  minBillAmount          Float    // Minimum bill in BGN (default: 10)
  maxCashbackPerScan     Float?   // Max cashback per transaction
  maxScansPerDay         Int      // Anti-fraud limit (default: 3)
  maxScansPerMonth       Int      // Anti-fraud limit (default: 30)
  gpsVerificationEnabled Boolean  // Require GPS check (default: true)
  gpsRadiusMeters        Int      // Allowed GPS radius (default: 100m)
  ocrVerificationEnabled Boolean  // Require receipt OCR (default: true)
  autoApproveThreshold   Float    // Fraud score threshold (default: 10)
}
```

---

## API Endpoints

### User Endpoints (Mobile App)

#### **POST** `/api/stickers/scan`
Initiate a sticker scan.

**Request:**
```json
{
  "stickerId": "BAR32-MASA04",
  "cardId": "user-card-id",
  "billAmount": 45.50,
  "latitude": 42.6977,
  "longitude": 23.3219
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "scan-id",
    "status": "PENDING",
    "cashbackAmount": 2.28,
    "fraudScore": 5
  },
  "message": "Scan initiated successfully. Please upload your receipt."
}
```

---

#### **POST** `/api/stickers/scan/:scanId/receipt`
Upload receipt image after scanning.

**Request:**
```json
{
  "receiptImageUrl": "https://storage.boom.com/receipts/abc123.jpg",
  "ocrData": {
    "amount": 45.50,
    "date": "2025-11-03",
    "merchantName": "Restaurant Name",
    "confidence": 0.95
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "scan-id",
    "status": "APPROVED",
    "cashbackAmount": 2.28
  },
  "message": "Cashback approved! You earned 2.28 BGN"
}
```

---

#### **GET** `/api/stickers/my-scans`
Get user's scan history.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "scan-id",
      "createdAt": "2025-11-03T10:30:00Z",
      "venue": {
        "name": "Happy Bar & Grill"
      },
      "billAmount": 45.50,
      "cashbackAmount": 2.28,
      "status": "APPROVED"
    }
  ],
  "count": 15
}
```

---

### Partner Endpoints (Venue Dashboard)

#### **POST** `/api/stickers/locations`
Create a sticker location (e.g., Table 1).

**Request:**
```json
{
  "venueId": "venue-id",
  "name": "Table 04",
  "nameBg": "Маса 04",
  "locationType": "TABLE",
  "locationNumber": "04",
  "capacity": 4,
  "floor": "Ground",
  "section": "Non-smoking"
}
```

---

#### **POST** `/api/stickers/locations/bulk`
Create multiple locations at once.

**Request:**
```json
{
  "locations": [
    { "venueId": "venue-id", "name": "Table 01", "locationType": "TABLE", "locationNumber": "01" },
    { "venueId": "venue-id", "name": "Table 02", "locationType": "TABLE", "locationNumber": "02" }
  ]
}
```

---

#### **POST** `/api/stickers/generate/:locationId`
Generate a QR sticker for a location.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "sticker-id",
    "stickerId": "BAR32-MASA04",
    "qrCode": "data:image/png;base64,iVBORw0KG...",
    "status": "PENDING"
  },
  "message": "Sticker generated successfully. Ready to print."
}
```

---

#### **POST** `/api/stickers/activate/:stickerId`
Mark sticker as printed and active.

---

#### **GET** `/api/stickers/venue/:venueId/analytics`
Get analytics for venue sticker scans.

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "days": 30,
      "startDate": "2025-10-04",
      "endDate": "2025-11-03"
    },
    "scans": {
      "total": 345,
      "approved": 320,
      "rejected": 15,
      "pending": 10,
      "approvalRate": 92.75
    },
    "revenue": {
      "total": 12450.00,
      "average": 38.90
    },
    "cashback": {
      "total": 622.50,
      "average": 1.95,
      "percentage": 5.0
    }
  }
}
```

---

#### **PUT** `/api/stickers/venue/:venueId/config`
Update venue sticker configuration.

**Request:**
```json
{
  "cashbackPercent": 7.0,
  "premiumBonus": 3.0,
  "minBillAmount": 15.0,
  "maxScansPerDay": 5
}
```

---

### Admin Endpoints (Manual Review)

#### **GET** `/api/stickers/admin/pending-review`
Get scans flagged for manual review.

---

#### **POST** `/api/stickers/admin/approve/:scanId`
Manually approve a scan.

---

#### **POST** `/api/stickers/admin/reject/:scanId`
Manually reject a scan.

**Request:**
```json
{
  "reason": "Receipt image unclear, unable to verify amount"
}
```

---

## Sticker ID Format

```
BOOM.ID=<VENUE_CODE>-<LOCATION_NUMBER>

Example: BOOM.ID=BAR32-MASA04
         └──┬──┘   └──┬──┘ └──┬──┘
         Prefix   Venue  Location
```

**QR Code JSON:**
```json
{
  "type": "BOOM_STICKER",
  "venueId": "venue-database-id",
  "locationId": "location-database-id",
  "stickerId": "BAR32-MASA04",
  "locationType": "TABLE",
  "version": "1.0"
}
```

---

## Cashback Calculation

### Formula:
```
Base Cashback = billAmount × venue.cashbackPercent / 100

Card Tier Bonus:
- STANDARD: 0% bonus
- PREMIUM: +2% bonus (default)
- PLATINUM: +5% bonus (default)

Final Cashback = billAmount × (cashbackPercent + tierBonus) / 100
```

### Example:
- **Bill Amount:** 100 BGN
- **Venue Base Cashback:** 5%
- **Card Type:** PREMIUM (+2%)
- **Total Cashback:** 100 × (5 + 2) / 100 = **7 BGN**

---

## Fraud Detection

### Fraud Score Calculation (0-100)

| Check | Score | Trigger |
|-------|-------|---------|
| GPS Mismatch | +30 | Distance > gpsRadiusMeters |
| Max Scans/Day Exceeded | +40 | scansToday >= maxScansPerDay |
| Max Scans/Month Exceeded | +50 | scansThisMonth >= maxScansPerMonth |
| High Bill Amount | +15 | billAmount > 1000 BGN |
| Rapid Scanning | +25 | >3 scans in 30 minutes |

### Risk Levels:
- **0-9:** LOW (auto-approve)
- **10-29:** MEDIUM (auto-approve with monitoring)
- **30-59:** HIGH (manual review)
- **60-100:** CRITICAL (manual review required)

---

## GPS Verification

Uses the **Haversine formula** to calculate distance between customer's GPS coordinates and venue location.

**Default Settings:**
- GPS verification enabled: `true`
- Allowed radius: `100 meters`

If distance exceeds the radius, fraud score increases by 30 points.

---

## OCR Receipt Validation

When a customer uploads a receipt photo:

1. **Image Upload:** Photo stored in cloud storage
2. **OCR Processing:** Tesseract.js extracts:
   - Amount/Total
   - Date
   - Merchant name
   - Items (optional)
   - Confidence score
3. **Validation:**
   - Compare OCR amount with user-entered amount
   - Flag if discrepancy > 5 BGN
4. **Auto-Approval:**
   - If fraud score < autoApproveThreshold: approve immediately
   - Otherwise: flag for manual review

---

## Service Layer Methods

### Sticker Service (`backend-api/src/services/sticker.service.ts`)

#### Location Management
- `createStickerLocation(data)` - Create a single location
- `createStickerLocationsBulk(locations)` - Create multiple locations

#### Sticker Generation
- `generateSticker(locationId)` - Generate QR code for a location
- `generateStickersBulk(locationIds)` - Generate multiple stickers
- `activateSticker(stickerId)` - Mark sticker as active

#### Scanning Flow
- `scanSticker(data)` - Initiate scan with validation
- `uploadReceipt(data)` - Upload receipt image + OCR data
- `approveScan(scanId)` - Approve and credit cashback
- `rejectScan(scanId, reason)` - Reject a scan

#### Analytics
- `getVenueAnalytics(venueId, days)` - Get venue scan statistics
- `getScansByUser(userId)` - Get user scan history
- `getScansByVenue(venueId)` - Get venue scan history
- `getPendingReviewScans()` - Get scans needing manual review

#### Configuration
- `getOrCreateVenueConfig(venueId)` - Get venue settings
- `updateVenueConfig(venueId, data)` - Update settings

---

## Implementation Status

### ✅ Completed (Backend)
- [x] Prisma database schema (4 new models + enums)
- [x] Sticker service layer (700+ lines)
- [x] 20+ API endpoints (user, partner, admin)
- [x] QR code generation (using `qrcode` library)
- [x] GPS distance calculation (Haversine formula)
- [x] Fraud detection system
- [x] Cashback calculation (tier-based)
- [x] Transaction recording
- [x] Analytics dashboard data

### 🚧 Pending (Frontend)
- [ ] PWA camera integration for QR scanning
- [ ] Tesseract.js OCR integration
- [ ] Mobile scan flow UI
- [ ] Partner sticker management dashboard
- [ ] Admin manual review interface

---

## Next Steps

### Phase 1: PWA QR Scanner (Week 1)
1. Install camera libraries: `react-webcam`, `jsqr`
2. Create `<QRScanner>` component with camera access
3. Parse QR code JSON and validate sticker
4. Build scan flow UI:
   - Step 1: Scan QR code
   - Step 2: Enter bill amount
   - Step 3: Take receipt photo
   - Step 4: Wait for approval / View cashback

### Phase 2: OCR Integration (Week 2)
1. Install Tesseract.js: `npm install tesseract.js`
2. Create receipt capture component
3. Process image with OCR
4. Extract amount, date, merchant
5. Validate against user-entered amount

### Phase 3: Partner Dashboard (Week 3)
1. Sticker inventory page
2. Location creation wizard
3. Bulk sticker generation
4. Print/download QR stickers
5. Analytics dashboard

---

## File Structure

```
/backend-api/src/
├── services/
│   └── sticker.service.ts         # Core business logic (700+ lines)
├── routes/
│   └── stickers.routes.ts         # API endpoints (500+ lines)
└── server.ts                       # Route registration

/prisma/
└── schema.prisma                   # Database schema
```

---

## Dependencies

### Backend
- `@prisma/client` - Database ORM
- `qrcode` - QR code generation
- `express` - Web framework
- `jsonwebtoken` - Authentication

### Frontend (To be installed)
- `react-webcam` - Camera access
- `jsqr` - QR code parsing
- `tesseract.js` - OCR processing
- `react-qr-reader` - Alternative QR scanner

---

## Environment Variables

Add to `backend-api/.env`:

```env
# Sticker Scan Settings
STICKER_DEFAULT_CASHBACK_PERCENT=5.0
STICKER_DEFAULT_GPS_RADIUS=100
STICKER_DEFAULT_MIN_BILL=10.0
STICKER_DEFAULT_MAX_SCANS_PER_DAY=3
STICKER_DEFAULT_MAX_SCANS_PER_MONTH=30

# OCR Settings
OCR_ENABLED=true
OCR_CONFIDENCE_THRESHOLD=0.7

# Fraud Detection
FRAUD_AUTO_APPROVE_THRESHOLD=10
```

---

## Testing the API

### 1. Create a location
```bash
curl -X POST http://localhost:3001/api/stickers/locations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "venueId": "venue-id",
    "name": "Table 04",
    "locationType": "TABLE",
    "locationNumber": "04"
  }'
```

### 2. Generate sticker
```bash
curl -X POST http://localhost:3001/api/stickers/generate/<location-id> \
  -H "Authorization: Bearer <token>"
```

### 3. Scan sticker (as user)
```bash
curl -X POST http://localhost:3001/api/stickers/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -d '{
    "stickerId": "BAR32-MASA04",
    "cardId": "card-id",
    "billAmount": 45.50,
    "latitude": 42.6977,
    "longitude": 23.3219
  }'
```

### 4. Upload receipt
```bash
curl -X POST http://localhost:3001/api/stickers/scan/<scan-id>/receipt \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -d '{
    "receiptImageUrl": "https://example.com/receipt.jpg",
    "ocrData": {
      "amount": 45.50,
      "confidence": 0.95
    }
  }'
```

---

## Production Considerations

### Database Migration
Once PostgreSQL is set up, run:
```bash
cd backend-api
npx prisma migrate dev --name add_boom_sticker_scan_system
```

### Security
- Implement rate limiting on scan endpoints
- Add CSRF protection for sticker generation
- Sanitize receipt image uploads
- Validate GPS coordinates

### Performance
- Index frequently queried fields (done in schema)
- Cache venue configs in Redis
- Use CDN for receipt images
- Batch process OCR for pending scans

### Monitoring
- Track fraud score distribution
- Monitor approval/rejection rates
- Alert on unusual scan patterns
- Log failed GPS verifications

---

## Summary

The BOOM-Sticker Scan system is now **fully implemented on the backend** with:

- ✅ **4 new database tables**
- ✅ **20+ API endpoints**
- ✅ **Comprehensive fraud detection**
- ✅ **GPS verification**
- ✅ **Tier-based cashback**
- ✅ **Analytics & reporting**

**Next:** Build the mobile/PWA frontend to complete the user-facing experience!

---

*Generated: 2025-11-03*
*Version: 1.0.0*
