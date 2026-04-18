<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1a1a2e; font-size: 11pt; line-height: 1.5; }
  h1 { color: #1a1a2e; border-bottom: 2px solid #e74c6f; padding-bottom: 8px; page-break-before: always; margin-top: 40px; font-size: 22pt; }
  h1:first-of-type { page-break-before: avoid; }
  h2 { color: #2563eb; font-size: 16pt; margin-top: 24px; }
  h3 { color: #e74c6f; font-size: 13pt; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
  th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 10pt; }
  pre { background: #1e293b; color: #e2e8f0; padding: 14px; border-radius: 6px; font-size: 9pt; overflow-x: auto; }
  pre code { background: none; color: inherit; padding: 0; }
  .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 10px 14px; margin: 12px 0; border-radius: 0 4px 4px 0; font-size: 10pt; }
  .info { background: #eff6ff; border-left: 4px solid #2563eb; padding: 10px 14px; margin: 12px 0; border-radius: 0 4px 4px 0; font-size: 10pt; }
  .note { background: #fffbeb; border-left: 4px solid #d97706; padding: 10px 14px; margin: 12px 0; border-radius: 0 4px 4px 0; font-size: 10pt; }
  .title-page { text-align: center; padding-top: 180px; page-break-after: always; }
  .title-page h1 { color: #e74c6f; font-size: 42pt; border: none; margin-bottom: 0; page-break-before: avoid; }
  .title-page h2 { color: #1a1a2e; font-size: 28pt; margin-top: 0; }
  .title-page .subtitle { color: #64748b; font-size: 14pt; margin-top: 20px; }
  .title-page .version { color: #64748b; font-size: 12pt; margin-top: 40px; }
  .title-page .confidential { color: #dc2626; font-size: 11pt; margin-top: 10px; }
  .title-page hr { width: 50%; margin: 30px auto; border: 1px solid #e2e8f0; }
  img { max-height: 380px; width: 100%; object-fit: contain; display: block; margin: 12px 0; }
  @page { size: A4; margin: 20mm; @bottom-center { content: counter(page); font-size: 9pt; color: #94a3b8; } }
</style>

<div class="title-page">
<h1>BOOMCARD</h1>
<h2>Admin Operations Handbook</h2>
<hr>
<div class="subtitle">Venue onboarding, receipt templates, verification,<br>fraud detection, and cashback management</div>
<div class="version">Version 2.2 — April 2026</div>
<div class="confidential">CONFIDENTIAL — Internal Use Only</div>
</div>

# 1. Access & Login Credentials

## 1.1 URLs

| Environment | Service | URL |
|---|---|---|
| Production | Partner Dashboard (Vercel) | https://boomcard.bg |
| Production | Admin Login | https://boomcard.bg/login |
| Production | Backend API (Fly.io, Frankfurt) | https://boomcard-api.fly.dev |
| Production | Mobile Web App (Vercel) | https://mobile.boomcard.bg |
| Development | Partner Dashboard | http://localhost:5173 |
| Development | Backend API | http://localhost:3000 |
| Development | Prisma Studio (DB browser) | http://localhost:5555 |

## 1.2 Admin Login

| Field | Value |
|---|---|
| Email | admin@boomcard.bg |
| Password | *(contact system administrator)* |
| Role | SUPER_ADMIN |
| Login URL (production) | https://boomcard.bg/login |
| Login URL (development) | http://localhost:5173/login |

![Login Page](docs/screenshots/00-login.png)

## 1.3 API Login (cURL)

```
POST https://boomcard-api.fly.dev/api/auth/login
Content-Type: application/json
{ "email": "admin@boomcard.bg", "password": "<your-password>", "clientType": "web" }
```

# 2. Deployment Overview

## 2.1 Production Services

| Service | Platform | URL |
|---|---|---|
| Partner Dashboard | Vercel | https://boomcard.bg |
| Backend API | Fly.io (Frankfurt) | https://boomcard-api.fly.dev |
| Mobile Web App | Vercel | https://mobile.boomcard.bg |

## 2.2 Admin Pages

![Admin Dashboard](docs/screenshots/01-admin-dashboard.png)

All admin pages are deployed and accessible at https://boomcard.bg:

| Page | Route |
|---|---|
| Admin Dashboard | /admin |
| Partners Management | /admin/partners |
| Partner Types | /admin/partner-types |
| Partner Onboarding | /admin/partner-onboarding |
| Receipt Review | /admin/receipts |
| Sticker Scan Review | /admin/scan-review |
| Cashback Management | /admin/cashback |
| Offers Management | /admin/offers |
| Top Discounts | /admin/top-discounts |
| Bulk Import | /admin/bulk-import |
| Receipt Templates | /admin/receipt-templates |
| Venue Fraud Config | /admin/venue-fraud-config |
| Merchant Whitelist | /admin/merchant-whitelist |

## 2.3 Environment Variables

The Vercel deployment uses these env vars (set in `vercel.json`):

| Variable | Value |
|---|---|
| VITE_API_URL | https://boomcard-api.fly.dev |
| VITE_API_BASE_URL | https://boomcard-api.fly.dev/api |

# 3. Venue (Partner) Onboarding

BoomCard separates Partners (business entities) from Venues (physical locations). A Partner can own multiple Venues. Partners are assigned a PartnerType (e.g., BASIC, GOLD, VIP) that caps their maximum discount rate.

## 3.1 Onboarding via Admin Wizard (Recommended)

![Partner Onboarding Wizard](docs/screenshots/04-admin-partner-onboarding.png)

Dashboard route: https://boomcard.bg/admin/partner-onboarding

The 5-step wizard collects:

- Step 1 — Business info: legal name, VAT number, contact email
- Step 2 — Primary address, city, GPS coordinates
- Step 3 — Partner type selection & discount rate
- Step 4 — Additional venues (optional, up to 50)
- Step 5 — Social media, contract details, internal notes

On submit, the system creates both a User (PARTNER role) and Partner record in a single DB transaction. A random password is generated; the partner uses 'Forgot Password' to set theirs.

```
POST /api/partners/onboard (admin only)
```

## 3.2 Direct Partner Creation

```
POST /api/partners (admin only)
```

For existing users with PARTNER role. Validates discountRate ≤ PartnerType's maxDiscountRate.

## 3.3 Venue Creation

```
POST /api/venues (partner or admin)
```

Required: partnerId, name, address, city. Partners can only create under their own record.

## 3.4 Venue Menu Upload

```
POST /api/venues/:id/menu (partner owner or admin)
```

- Accepts up to 20 images per request, max 20 MB each
- Formats: JPEG, PNG, WebP
- Uploads to S3 under venue-menus/ folder
- DELETE /api/venues/:id/menu clears all menu images

## 3.5 Partner Profile Edit Approval

When a partner edits their profile, changes are stored in pendingChanges and require admin approval.

- Approve: POST /api/partners/:id/approve
- Reject: POST /api/partners/:id/reject
- Admin direct edits take effect immediately

# 4. Partner & Sticker Status Lifecycle

## 4.1 Partner Statuses

| Status | Effect | Transition |
|---|---|---|
| PENDING | Partner created but not yet verified. Not visible to end users. | Set on creation |
| ACTIVE | Fully operational. Visible to users. verifiedAt auto-set if null. | Admin sets via PUT /api/partners/:id |
| SUSPENDED | Temporarily disabled. Hidden from public views (GET /api/partners returns 404). | Admin sets via PUT /api/partners/:id |
| INACTIVE | Permanently disabled. Hidden from public views. | Admin sets via PUT /api/partners/:id |

<div class="info">INFO: When a partner is SUSPENDED or INACTIVE, their venues and offers remain in the DB but are inaccessible because the partner no longer appears in public queries.</div>

## 4.2 Sticker Statuses

| Status | Meaning | Can Be Scanned? |
|---|---|---|
| PENDING | Created but not yet printed/activated | No |
| ACTIVE | Printed and active (printedAt and activatedAt set) | Yes |
| INACTIVE | Temporarily disabled | No |
| DAMAGED | Needs physical replacement | No |
| RETIRED | Permanently removed from service | No |

<div class="note">NOTE: Only ACTIVE stickers can be scanned. The scan validation rejects non-ACTIVE stickers with the message 'Sticker is [status]'. There is currently no REST endpoint to change sticker status beyond activation — status changes require direct DB operations.</div>

# 5. Subscription Plans & Access Control

## 5.1 Subscription Plans

| Plan | Price | Max Cashback | Payout Threshold |
|---|---|---|---|
| LIGHT (Premium Weekly) | EUR 6.99/week | Up to 20% | EUR 10 |
| BASIC | EUR 8.99/month | Up to 10% | EUR 20 |
| PREMIUM | EUR 13.99/month | Up to 20% | EUR 15 |

![Partner Types](docs/screenshots/03-admin-partner-types.png)

## 5.2 Plan-to-PartnerType Access Control (PlanTypeAccess)

Each subscription plan has configurable access rules per PartnerType. The PlanTypeAccess table defines which plans can view and redeem at which partner types.

| Field | Type | Purpose |
|---|---|---|
| plan | LIGHT / BASIC / PREMIUM | The subscription plan |
| partnerTypeId | UUID | The partner type (e.g., BASIC, GOLD, VIP) |
| canView | Boolean | Can the user see this partner's offers? |
| canRedeem | Boolean | Can the user scan/redeem at this partner? |

## 5.3 Enforcement

At sticker scan time, the system checks if the user's plan can redeem at the partner's type:

```
partnerTypeService.getRedeemableTypeIdsForPlan(userPlan)
```

If the partner's type is not in the result, the scan is rejected with:

```
"Your current subscription does not include access to this partner.
 Upgrade your plan to scan this venue."
```

Admin manages access rules at: https://boomcard.bg/admin/partner-types

```
PUT /api/admin/partner-types/:id (sets PlanTypeAccess rules)
```

## 5.4 Upgrade Credit Rates

When a user upgrades their subscription, a pro-rated wallet credit is issued:

| Upgrade Path | Credit % | Notes |
|---|---|---|
| LIGHT (Weekly) → PREMIUM (Monthly) | 100% | Full remaining weekly value credited |
| BASIC → PREMIUM | 60% | Anti-abuse: only 60% of remaining value credited |
| All other transitions | 0% | No credit issued |

Formula: planPrice × remainingFraction × creditPercentage, converted EUR→BGN at 1.95583.

# 6. Receipt Templates & Multiple Receipt Types

## 6.1 Why Receipt Templates?

Receipt templates are reference images uploaded by the admin for each venue. Submitted receipts are compared against templates using visual hashing, merchant name matching, and keyword detection to catch fraudulent receipts from other establishments.

## 6.2 Multiple Receipt Types Per Venue

A single venue can produce different receipt formats. Each needs its own template:

| Receipt Type | Source | Characteristics |
|---|---|---|
| Fiscal Receipt (Фискален Бон) | Cash register (fiscal printer) | Compact thermal paper; merchant name, EIK, items, ОБЩА СУМА (total), QR code, fiscal memory number. Standard NRA format. |
| POS Terminal Receipt (Бележка от ПОС) | Card payment terminal | Longer format; card type (Visa/MC), masked PAN (XXXX-XXXX), auth code, transaction ID, ОДОБРЕНА/ОТКАЗАНА status. |
| Restaurant System Receipt | Software POS (e.g., Barsy) | Custom format. Table number, server name, items, total in EUR+BGN. No fiscal QR code. |

<div class="info">INFO: Example: Bar "КАФЕ-БАР" (КИТ ЕООД, ул. Аксаков 10А, София) produces both fiscal cash register receipts and POS card payment receipts. Upload a template for each.</div>

## 6.3 Uploading Templates (Admin)

![Receipt Templates](docs/screenshots/11-admin-receipt-templates.png)

Dashboard route: https://boomcard.bg/admin/receipt-templates

Steps:

1. Select the venue from the dropdown
2. Click 'Upload Template'
3. Upload a clear photo of the receipt
4. Enter the Merchant Name as printed (e.g., 'КИТ ЕООД')
5. Add Expected Keywords comma-separated (e.g., 'КАФЕ-БАР, Аксаков, ФИСКАЛЕН БОН')
6. Optionally add a description (e.g., 'Cash register receipt')
7. Submit — perceptual hash (dHash) computed automatically

```
POST /api/receipts/venues/:venueId/templates
Content-Type: multipart/form-data
Fields: image (file), merchantName (required), description,
        expectedKeywords (JSON string[])
```

## 6.4 Template Matching Algorithm

| Component | Default Weight | Method |
|---|---|---|
| Visual similarity | 0.5 (50%) | Perceptual hash (dHash) Hamming distance. 16x16 grid, 240-bit hash. |
| Merchant name | 0.3 (30%) | Jaccard token overlap with Cyrillic support. |
| Keyword presence | 0.2 (20%) | Fraction of expectedKeywords found in OCR text. |

Default minimum similarity threshold: 0.6 (60%). Below = +35 fraud points. All weights configurable per venue.

<div class="note">NOTE: If no templates are configured, or hash unavailable, system fails open — no penalty. Template matching must be explicitly enabled per venue.</div>

# 7. Receipt Scanning & Submission (Mobile App)

## 7.1 Submission Flow (QR Sticker Required)

All receipt submissions require scanning a venue QR sticker first. The direct receipt upload path (Path A) was retired in April 2026 — the legacy endpoints (`POST /api/receipts/upload`, `/submit`, `/ocr`) now return **410 Gone**.

See **Section 18** for the full sticker scanning flow (QR scan → receipt upload → bill amount completion).

## 7.2 Live Photo Enforcement

- EXIF DateTimeOriginal checked; photos older than 30 minutes rejected
- Photos taken before QR session start also rejected (PRE_SESSION check)
- Timezone: Europe/Sofia
- Disable via env: RECEIPT_LIVE_PHOTO_ENFORCEMENT=off

## 7.3 Server-Side Processing

- SHA-256 hash for exact deduplication
- Perceptual hash (dHash) for near-duplicate detection
- Image uploaded to S3 (receipts/ folder)
- Single-use ReceiptUploadToken issued (1-hour TTL) — see Section 8
- Server-side OCR via Tesseract.js (Bulgarian + English, 2 concurrent workers)
- Merchant name verification: token-set overlap, threshold 0.5, mismatch = +40 fraud points
- All receipts go to MANUAL_REVIEW — no auto-approve

## 7.4 Minimum Bill Amount

MinBillAmount is enforced during the sticker scan flow:

| Flow | Behavior | Default |
|---|---|---|
| Sticker scan | Hard reject — scan refused entirely with error: 'Minimum bill amount is X BGN' | 0 (no minimum) |

Configure per venue via VenueStickerConfig.minBillAmount.

# 8. Upload Token Security

The ReceiptUploadToken prevents replay attacks and ensures image integrity:

| Property | Implementation |
|---|---|
| Generation | 256-bit cryptographic random (crypto.randomBytes(32).toString('hex')) |
| TTL | 1 hour (TOKEN_TTL_MS = 3,600,000 ms). Expired tokens purged by nightly cron. |
| One-time use | Atomic consume: UPDATE ... WHERE consumedAt IS NULL. No TOCTOU gap. |
| User binding | consume() requires both token AND userId to match. Cross-user use blocked. |
| Server-side hash binding | Token stores imageHash (SHA-256), perceptualHash (dHash), livePhotoOk, imageUrl, imageKey — all computed server-side. /submit trusts ONLY these bound values. |
| Error opacity | Returns null for any failure (expired, consumed, wrong user, unknown) without distinguishing failure mode. |

# 9. Device Fingerprint Tracking

Device fingerprints detect users switching devices (potential account sharing or fraud).

## 9.1 Fingerprint Components

The client sends a JSON object with 4 fields. The server computes a canonical SHA-256 hash:

```
SHA-256( JSON.stringify({
  installationId: "...",
  platform: "...",
  osVersion: "...",
  appVersion: "..."
}) )
```

Both the hash and raw JSON are stored on Receipt and StickerScan records.

## 9.2 Fraud Scoring

| Scenario | Points | Threshold |
|---|---|---|
| Brand-new device, user has multiple known devices | +25 | Device not seen in 90-day history |
| Brand-new device, first submission or single-device user | +15 | Device not seen in 90-day history |
| Rarely-used device, user has 3+ devices | +15 | Fewer than 3 submissions with this device in 90 days |

Lookback window: 90 days. A device becomes 'familiar' after 3 submissions.

# 10. Verification & Manual Approval

<div class="info">INFO: All receipts and sticker scans require manual admin approval. No auto-approve path. Fraud score thresholds (30/60) are for risk-level labels and alert notifications only.</div>

## 10.1 Receipt Review

![Receipt Review](docs/screenshots/05-admin-receipts.png)

Dashboard: https://boomcard.bg/admin/receipts

Shows fraud score, merchant name, amounts, cashback, status badges. Filterable by status.

### Approve:

- Admin can provide verifiedAmount to override OCR amount
- Cashback recalculated with verified amount + subscription tier
- Wallet credited atomically (rollback on failure)
- Email + in-app notification sent to user

### Reject:

- Requires rejectionReason (mandatory)
- Email + in-app notification sent to user

Concurrency: atomic reviewedBy: null claim prevents double-review.

### Bulk Operations:

```
POST /api/receipts/bulk-approve
POST /api/receipts/bulk-reject
```

## 10.2 Sticker Scan Review

![Sticker Scan Review](docs/screenshots/06-admin-scan-review.png)

Dashboard: https://boomcard.bg/admin/scan-review

- Approve: POST /api/stickers/admin/approve/:scanId
- Reject: POST /api/stickers/admin/reject/:scanId
- Creates Transaction record and credits wallet on approval
- Pre-checks wallet lock status before crediting

# 11. Receipt & Scan Status Reference

## 11.1 Receipt Statuses (ReceiptStatus enum — 7 values)

| Status | Description |
|---|---|
| PENDING | Awaiting OCR processing |
| PROCESSING | OCR in progress |
| VALIDATING | Fraud checks running |
| MANUAL_REVIEW | Flagged for admin review (all receipts land here) |
| APPROVED | Approved by admin; cashback credited to wallet |
| REJECTED | Rejected by admin |
| EXPIRED | Too old to process (exceeded processing window) |

## 11.2 Sticker Scan Statuses (ScanStatus enum — 7 values)

| Status | Description |
|---|---|
| SESSION_ACTIVE | QR scanned, session open, awaiting receipt upload |
| EXPIRED | Session deadline passed (6 AM next day) without receipt submission |
| PENDING | Receipt submitted, waiting for processing |
| VALIDATING | OCR processing in progress |
| MANUAL_REVIEW | Flagged for admin review |
| APPROVED | Approved; cashback credited |
| REJECTED | Rejected (fraud, invalid, etc.) |

# 12. Fraud Detection & Scoring

## 12.1 Per-Venue Fraud Configuration

![Venue Fraud Config](docs/screenshots/12-admin-venue-fraud-config.png)

Dashboard: https://boomcard.bg/admin/venue-fraud-config

| Category | Settings |
|---|---|
| Cashback | cashbackPercent, premiumBonus, platinumBonus, minBillAmount, maxCashbackPerScan |
| Rate Limiting | maxScansPerDay, maxScansPerMonth |
| Fraud Detection | gpsVerificationEnabled, gpsRadiusMeters (100m), ocrVerificationEnabled, autoApproveThreshold (30), autoRejectThreshold (60) |
| Template Matching | templateMatchEnabled (off), visual/merchant/keyword weights, similarity thresholds |

## 12.2 Fraud Score Indicators

| Check | Points | Details |
|---|---|---|
| Duplicate image (SHA-256) | +40 | Exact binary match |
| Near-identical (dHash ≤ 10 bits) | +35 | Perceptual hash very close |
| Similar image (dHash 11-20 bits) | +15 | Perceptual hash moderate |
| Large amount mismatch (>50%) | +30 | OCR vs. user amount |
| Moderate amount mismatch (>20%) | +15 | OCR vs. user amount |
| GPS far (>500m) | +25 | Far from venue |
| GPS outside range (>200m) | +15 | Outside normal range |
| Low OCR confidence (<50%) | +20 | Unreliable OCR |
| Moderate OCR confidence (<70%) | +10 | Somewhat unreliable |
| Daily limit exceeded | +30 | Submission rate exceeded |
| Monthly limit exceeded | +30 | Submission rate exceeded |
| Blacklisted merchant | +50 | On the blocklist |
| Whitelisted merchant | -10 | Trusted merchant |
| Rapid submissions (3+ in 5min) | +15 | Burst fraud attempt |
| Unusual time (2-6 AM) | +10 | Suspicious hours |
| New device (multi-device) | +25 | Brand-new device, user has history |
| New device (single-device) | +15 | First submission or single device |
| Rare device (multi-device) | +15 | Infrequently used device |
| Template mismatch | +35 | Doesn't match venue templates |
| Merchant name mismatch (OCR) | +40 | Server-side OCR merchant ≠ venue |
| Amount too low | +10 | Below venue's minBillAmount |
| Premium card holder | -5 | Score reduction |
| Basic card holder | -3 | Score reduction |

## 12.3 Risk Level Labels

| Score | Label | Admin Action |
|---|---|---|
| 0-29 | Low Risk | Review normally |
| 30-59 | Medium Risk | Check receipt image and GPS carefully |
| 60+ | High Risk | Fraud alert sent to all admins; review with scrutiny |

# 13. Fraud Alert Notifications

When a receipt's fraud score reaches ≥ 60 (FRAUD_ALERT_SCORE_THRESHOLD), notifications are sent automatically:

| Channel | Recipients | Content |
|---|---|---|
| In-app notification | All ADMIN and SUPER_ADMIN users | Receipt ID, user ID, fraud score, fraud reasons. Priority: HIGH. |
| Email | All admins with email addresses | Fraud alert email with receipt details. Sent fire-and-forget. |

<div class="info">INFO: Push notifications are NOT sent for fraud alerts. FCM integration is stubbed but the fraud alert code path only uses in-app notifications + email.</div>

# 14. Cashback Rules & Limitations

## 14.1 Cashback Matrix

Depends on partner's discount rate + user's active subscription. No subscription = zero cashback.

| Partner Discount | Basic Plan | Premium / Light Plan |
|---|---|---|
| 5% | 5% | 5% |
| 10% | 5% | 8% |
| 15% | 8% | 12% |
| 20% | 10% | 16% |
| 25% | 10% | 20% |

Nearest step not exceeding partner's discount is used. <5% = 0%. Basic capped at 10%.

## 14.2 Cashback Validity

- Expires after 60 days from earning
- Estimated credit time: 7 days after admin approval
- Currency: Fixed EUR/BGN rate of 1.95583 (Bulgaria currency board)

## 14.3 Per-User Cashback Caps (Rolling Windows)

Rolling windows (24h / 30 days), not calendar resets:

| Cap | Default | Configurable |
|---|---|---|
| Per scan | Unlimited | VenueFraudConfig.maxCashbackPerScan |
| Per day (24h rolling) | Unlimited | VenueFraudConfig |
| Per month (30-day rolling) | Unlimited | VenueFraudConfig |

<div class="note">NOTE: If cap-check DB query fails, cashback is BLOCKED (zeroed) with CRITICAL log. Never uncapped on error.</div>

## 14.4 Partner Cashback Payments

![Cashback Management](docs/screenshots/07-admin-cashback.png)

Dashboard: https://boomcard.bg/admin/cashback

- Aggregates approved receipts by partner/month
- Tracks PartnerCashbackPayment status: PENDING / PAID / OVERDUE
- Can send reminder emails to partners
- Per-partner monthly receipt reconciliation

# 15. Cashback Rate Admin Override

The hardcoded cashback matrix (Section 14.1) can be overridden with versioned DB rates.

## 15.1 CashbackRate Model

| Field | Type | Purpose |
|---|---|---|
| discountStep | Int (5/10/15/20/25) | Partner discount percentage step |
| basic | Float | User cashback % for Basic plan |
| premium | Float | User cashback % for Light/Premium plans |
| effectiveFrom | DateTime | When this rate set takes effect |
| createdBy | String? | Admin user who created the rate |
| notes | String? | Reason for rate change |

## 15.2 How Override Works

For each discount step, the system queries CashbackRate for the most recent row where effectiveFrom ≤ now. If found, DB rate is used. If not, falls back to hardcoded CASHBACK_MATRIX.

## 15.3 Admin API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/admin/cashback/rates | Full rate history |
| GET | /api/admin/cashback/rates/current | Currently effective rates |
| POST | /api/admin/cashback/rates | Create new versioned rate set (all 5 steps required) |
| GET | /api/admin/cashback/summary | Per-partner monthly summaries |
| GET | /api/admin/cashback/stats | Dashboard stats cards |
| POST | /api/admin/cashback/:partnerId/:month/mark-paid | Mark payment as paid |
| POST | /api/admin/cashback/:partnerId/remind | Send email reminder to partner |

# 16. Receipt Approval Limitations & Rate Limits

## 16.1 Submission Rate Limits

| Limit | Default | Fraud Points |
|---|---|---|
| Daily submission limit | Unlimited | +30 |
| Monthly submission limit | Unlimited | +30 |
| Per-venue daily scans | 999999 | +30 |
| Per-venue monthly scans | 999999 | +30 |

## 16.2 Rapid Submission Detection

3+ receipts in 5 minutes = +15 fraud points.

## 16.3 Sticker Scan Deadline

Receipt must be submitted by 6:00 AM Sofia time the morning after QR scan.

## 16.4 Deduplication

| Method | Scope | Behavior |
|---|---|---|
| SHA-256 hash | Exact duplicate | Checked before S3 upload to save storage |
| Perceptual hash (dHash) | Near-duplicate | ≤ 10 bits = +35 pts; 11-20 bits = +15 pts |
| Receipt SHA-256 | Receipt table | Checks APPROVED/PENDING/MANUAL_REVIEW only (REJECTED excluded for re-submit) |

## 16.5 Other Limits

- Suspicious time window: 2-6 AM = +10 fraud points
- Max receipt file size: 10 MB
- Allowed formats: JPEG, PNG, WebP
- OCR concurrency: 2 workers (configurable via OCR_MAX_CONCURRENT env)

# 17. Merchant Whitelist

![Merchant Whitelist](docs/screenshots/13-admin-merchant-whitelist.png)

Dashboard: https://boomcard.bg/admin/merchant-whitelist

| Status | Effect on Fraud Score |
|---|---|
| APPROVED | -10 points (trusted merchant) |
| BLOCKED | +50 points (blacklisted) |
| PENDING | No effect |

```
GET  /api/receipts/merchants/whitelist
POST /api/receipts/merchants/whitelist
PATCH /api/receipts/merchants/whitelist/:id
```

# 18. Sticker Scanning Flow

## 18.1 Sticker Lifecycle

1. Create locations — POST /api/stickers/locations (TABLE/BAR/COUNTER)
2. Generate stickers — POST /api/stickers/generate/:locationId
3. Activate stickers — POST /api/stickers/activate/:stickerId
4. Print QR codes — JSON: { type, venueId, locationId, stickerId, version }

## 18.2 User Scanning (Two Steps)

### Step 1: QR Scan

```
POST /api/stickers/session
```

- Validates sticker is ACTIVE and venueId matches
- Validates QR version ≥ 1.0
- Checks user's card + subscription access (PlanTypeAccess)
- GPS always mandatory — within gpsRadiusMeters (default 100m)
- Creates StickerScan with status SESSION_ACTIVE

### Step 2: Receipt Upload

```
POST /api/stickers/scan/:scanId/receipt
```

- Live-photo EXIF check against session start
- SHA-256 dedup before S3 upload
- Server-side OCR merchant verification (async)
- Scan moves to MANUAL_REVIEW

## 18.3 Bill Amount Completion

```
POST /api/stickers/scan
```

- Deadline: 6:00 AM Sofia time the morning after
- Hard-rejects if billAmount < minBillAmount
- Calculates cashback via matrix

## 18.4 GPS Configuration

| Setting | Value | Notes |
|---|---|---|
| Client-side (mobile) | 60 meters | Hardcoded GPS_CONFIG.MAX_RADIUS_METERS |
| Server-side (authoritative) | 100m default | Configurable per venue via VenueStickerConfig |

# 19. Wallet Management

## 19.1 Wallet Lock/Unlock

Wallets can be locked to prevent any credits, debits, or payout requests.

| Field | Type | Purpose |
|---|---|---|
| isLocked | Boolean (default false) | Whether the wallet is frozen |
| lockedReason | String? | Why the wallet was locked |
| lockedAt | DateTime? | When the lock was applied |

## 19.2 Auto-Lock Triggers

- Wallet auto-locks when a payout reversal fails
- lockedReason: 'Payout reversal failed: ... Manual review required.'
- Both credit() and debit() throw immediately if wallet is locked

## 19.3 Admin Access

<div class="note">NOTE: There is no admin REST endpoint for wallet lock/unlock. The WalletService has lockWallet(userId, reason) and unlockWallet(userId) methods, but they are not exposed via API. Wallet lock/unlock must be done via Prisma Studio or direct DB operations.</div>

## 19.4 Payout Fields

- payoutIban — user's bank account IBAN
- payoutBeneficiaryName — name on the bank account

# 20. Admin Dashboard Routes Reference

![Partners Management](docs/screenshots/02-admin-partners.png)

| URL Path | Page | Deployed? |
|---|---|---|
| https://boomcard.bg/admin | Dashboard | Yes |
| https://boomcard.bg/admin/partners | Partners Management | Yes |
| https://boomcard.bg/admin/partner-types | Partner Types + Access Control | Yes |
| https://boomcard.bg/admin/partner-onboarding | Partner Onboarding Wizard | Yes |
| https://boomcard.bg/admin/receipts | Receipt Review | Yes |
| https://boomcard.bg/admin/scan-review | Sticker Scan Review | Yes |
| https://boomcard.bg/admin/cashback | Cashback + Rate Management | Yes |
| https://boomcard.bg/admin/offers | Offers Management | Yes |
| https://boomcard.bg/admin/top-discounts | Top Discounts | Yes |
| https://boomcard.bg/admin/bulk-import | Bulk Import | Yes |
| https://boomcard.bg/admin/receipt-templates | Receipt Templates | Yes |
| https://boomcard.bg/admin/venue-fraud-config | Venue Fraud Config | Yes |
| https://boomcard.bg/admin/merchant-whitelist | Merchant Whitelist | Yes |

![Offers Management](docs/screenshots/08-admin-offers.png)

![Top Discounts](docs/screenshots/09-admin-top-discounts.png)

![Bulk Import](docs/screenshots/10-admin-bulk-import.png)

## API Endpoints Quick Reference

Production base: https://boomcard-api.fly.dev  |  Dev: http://localhost:3000

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/auth/login | Admin/partner login |
| POST | /api/partners/onboard | Onboard new partner |
| POST | /api/partners/:id/approve | Approve partner changes |
| POST | /api/partners/:id/reject | Reject partner changes |
| POST | /api/venues | Create venue |
| POST | /api/venues/:id/menu | Upload venue menu images (up to 20) |
| ~~POST~~ | ~~/api/receipts/upload~~ | ~~Retired (410 Gone) — use sticker scan flow~~ |
| ~~POST~~ | ~~/api/receipts/submit~~ | ~~Retired (410 Gone) — use sticker scan flow~~ |
| POST | /api/receipts/:id/review | Approve/reject (action: APPROVE\|REJECT) |
| POST | /api/receipts/bulk-approve | Bulk approve |
| POST | /api/receipts/bulk-reject | Bulk reject |
| POST | /api/receipts/venues/:id/templates | Upload receipt template |
| GET | /api/receipts/venues/:id/templates | List templates |
| POST | /api/stickers/session | Start scan session (QR) |
| POST | /api/stickers/scan/:id/receipt | Upload receipt for scan |
| POST | /api/stickers/scan | Complete with bill amount |
| POST | /api/stickers/admin/approve/:id | Approve scan |
| POST | /api/stickers/admin/reject/:id | Reject scan |
| GET | /api/receipts/merchants/whitelist | List whitelist |
| POST | /api/admin/cashback/rates | Create new cashback rate set |
| GET | /api/admin/cashback/rates/current | Get effective rates |

---

<div style="text-align: center; color: #94a3b8; font-size: 10pt; margin-top: 40px;">
Generated 2026-04-16 — BoomCard Admin Operations Handbook v2.2
</div>
