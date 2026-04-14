# BoomCard Cashback QA Test Design

> **Purpose:** Comprehensive QA test scenarios for all cashback flows, covering functional correctness, edge cases, and security.
> **Status:** Design document only — no test code written yet.

---

## System Under Test — Quick Reference

| Component | Path |
|-----------|------|
| Admin cashback routes | `backend-api/src/routes/adminCashback.routes.ts` |
| Wallet routes | `backend-api/src/routes/` (wallet endpoints) |
| Receipt service | `backend-api/src/services/receipt.service.ts` |
| Wallet service | `backend-api/src/services/wallet.service.ts` |
| Fraud detection | `backend-api/src/services/fraudDetection.service.ts` |
| Admin cashback service | `backend-api/src/services/adminCashback.service.ts` |
| Sticker service | `backend-api/src/services/sticker.service.ts` |
| Payment service | `backend-api/src/services/payment.service.ts` |
| Constants | `backend-api/src/constants/receipt.constants.ts` |
| Schema | `backend-api/prisma/schema.prisma` |

---

## Cashback Matrix (reference)

| Partner Discount | BASIC cashback | LIGHT/PREMIUM cashback |
|-----------------|---------------|----------------------|
| 5% | 5% | 5% |
| 10% | 5% | 8% |
| 15% | 8% | 12% |
| 20% | 10% | 16% |
| 25% | 10% | 20% |

Payout thresholds: BASIC €20 · LIGHT €10 · PREMIUM €15. Cashback validity: 60 days.

---

## Part 1 — Functional Tests

### F-REC: Receipt-Based Cashback

#### F-REC-01 Happy Path — Receipt Approved, Cashback Credited
**Given** a verified user with a BASIC card submits a valid receipt image for a venue with 15% partner discount  
**When** an admin approves the receipt without amount correction  
**Then** `receipt.status = APPROVED`, `receipt.cashbackPercent = 8`, `walletTransaction.type = CASHBACK_CREDIT`, `walletTransaction.amount = totalAmount × 0.08`, `wallet.availableBalance` increases by that amount, `walletTransaction.cashbackExpiresAt` is ~60 days from now, user receives in-app notification.

#### F-REC-02 PREMIUM User Gets Higher Cashback Rate
**Given** a PREMIUM user submits a receipt at a venue with 15% partner discount  
**When** admin approves  
**Then** `cashbackPercent = 12` (not 8).

#### F-REC-03 LIGHT User Gets Same Rate as PREMIUM
**Given** a LIGHT user submits a receipt at a venue with 20% partner discount  
**When** admin approves  
**Then** `cashbackPercent = 16`.

#### F-REC-04 Partner Discount Below Matrix Floor → Zero Cashback
**Given** a venue whose partner discount rate is 3% (below the 5% matrix floor)  
**When** a receipt is approved  
**Then** `cashbackPercent = 0`, no `WalletTransaction` created.

#### F-REC-05 Admin Corrects Amount — Cashback Recalculated
**Given** user submitted receipt with `totalAmount = 100 BGN` but OCR read 80 BGN  
**When** admin approves with `verifiedAmount = 100`  
**Then** cashback is calculated on 100 (not 80).

#### F-REC-06 Admin Rejects Receipt — No Cashback Credited
**Given** an admin rejects a receipt  
**Then** `receipt.status = REJECTED`, no `WalletTransaction` created, user receives rejection notification with reason.

#### F-REC-07 Refund Reverses Cashback (Full)
**Given** a receipt that was approved and cashback credited (100 BGN, 8% = 8 BGN)  
**When** the linked payment is fully refunded  
**Then** a `CASHBACK_CREDIT` wallet transaction is CANCELLED, `wallet.availableBalance` decreases by 8 BGN, a reversal `WalletTransaction` record (type ADJUSTMENT) is created.

#### F-REC-08 Partial Refund Reverses Proportional Cashback
**Given** a 100 BGN receipt with 8 BGN cashback credited  
**When** a 50 BGN partial refund is issued  
**Then** 4 BGN cashback is reversed (pro-rated).

#### F-REC-09 Payment Cancellation Reverses Cashback
**Given** a receipt was approved and cashback credited  
**When** the underlying payment transaction is cancelled  
**Then** cashback wallet transaction is reversed atomically.

#### F-REC-10 Manual Review Flow — All Receipts Require Admin Review
**Given** any receipt is submitted  
**When** the fraud check completes (regardless of score)  
**Then** `receipt.status = MANUAL_REVIEW`, no cashback credited, no notification sent, receipt appears in admin review queue.
> **Note:** `fraudDetectionService.checkReceipt()` always returns `requiresManualReview: true`. The fraud score is advisory only — it informs admin labels and notifications (`FRAUD_ALERT_SCORE_THRESHOLD = 60`) but does not auto-approve or auto-reject receipts.

#### F-REC-11 Manual Review Auto-Expiry (30 Days)
**Given** a receipt has been in `MANUAL_REVIEW` for 30 days with no admin action  
**When** the nightly job runs  
**Then** `receipt.status = REJECTED`, `rejectionReason = "Auto-rejected: no admin decision within 30 days"`.

#### F-REC-12 Transaction Status Validation Before Approval
**Given** a receipt linked to a payment transaction that is NOT `COMPLETED` (e.g. FAILED)  
**When** admin attempts to approve the receipt  
**Then** the system returns a 409 error and does not credit cashback.

#### F-REC-13 Wallet Locked — Cashback Credit Throws
**Given** a user's wallet is locked (`isLocked = true`)  
**When** admin approves a receipt and the system attempts `walletService.credit()`  
**Then** the credit call throws `"Wallet is locked: {lockedReason}"` (enforced inside the Prisma `$transaction`); the caller must handle the error (e.g. leave receipt in MANUAL_REVIEW or surface to admin).

---

### F-STK: Sticker Scan Cashback

#### F-STK-01 Happy Path — Sticker Scan Approved
**Given** user scans a QR sticker at a partner venue, enters 100 BGN bill, and finalizes  
**When** an admin approves the scan  
**Then** cashback is credited, user receives STICKER_SCAN_APPROVED notification.

#### F-STK-02 User Can Edit Amount Before Finalizing
**Given** a `SESSION_ACTIVE` sticker scan  
**When** user changes the bill amount before finalizing  
**Then** the updated amount is stored and cashback is calculated on the final value.

#### F-STK-03 Sticker Scan Rejected — No Cashback
**Given** admin rejects a sticker scan  
**Then** `stickerScan.status = REJECTED`, no cashback credited.

#### F-STK-04 Zero Cashback Amount — No Wallet Transaction
**Given** a sticker scan results in `cashbackAmount = 0` (partner discount below floor)  
**When** admin approves  
**Then** no `WalletTransaction` is created.

#### F-STK-05 Idempotency — Double Approval Rejected
**Given** a sticker scan is already `APPROVED`  
**When** the approval endpoint is called again  
**Then** the system returns a 409 / idempotency guard prevents double credit.

---

### F-WAL: Wallet & Payout Operations

#### F-WAL-01 Payout Request — Happy Path
**Given** a BASIC user has 40 BGN available (above €20 threshold ≈ 39 BGN)  
**When** user requests payout with valid IBAN  
**Then** a `WITHDRAWAL` WalletTransaction is created, Paysera B2C transfer is called with idempotency key `{walletId}-{withdrawalTxId}`, `availableBalance` decreases by withdrawal amount.

#### F-WAL-02 Payout Below Threshold Rejected
**Given** a BASIC user has 20 BGN available (below €20 threshold ≈ 39 BGN)  
**When** user requests payout  
**Then** request is rejected with appropriate error, no WalletTransaction created.

#### F-WAL-03 Payout Threshold Varies by Plan

| Plan | Min BGN | Expected |
|------|---------|---------|
| BASIC | < 39.12 | Rejected |
| LIGHT | < 19.56 | Rejected |
| PREMIUM | < 29.34 | Rejected |

#### F-WAL-04 Paysera Failure — Automatic Reversal
**Given** user requests payout and `walletService.debit()` succeeds  
**When** the Paysera API call fails  
**Then** the debit is atomically reversed, balance is restored, an `ADJUSTMENT` record is created.

#### F-WAL-05 Paysera Reversal Failure — Wallet Locked
**Given** Paysera call fails AND the reversal also fails  
**When** the double-failure occurs  
**Then** wallet is locked (`isLocked = true`, `lockedReason` set), manual intervention is required.

#### F-WAL-06 Pending vs Available Balance Separation
**Given** a receipt is in MANUAL_REVIEW  
**When** checking wallet balance  
**Then** `pendingBalance` reflects unreleased cashback; `availableBalance` does not include it. Only on approval does `approvePending()` move it.

#### F-WAL-07 Cashback Expires After 60 Days — Nightly Job
**Given** a `CASHBACK_CREDIT` transaction with `cashbackExpiresAt` in the past  
**When** the nightly job runs at 2 AM Sofia time  
**Then** the transaction status = CANCELLED, `availableBalance` is reduced, expired transactions are excluded from balance display.

#### F-WAL-08 Expired Cashback Excluded from Balance
**Given** a CANCELLED (expired) CASHBACK_CREDIT transaction  
**When** user views transaction history  
**Then** the expired transaction is hidden from the list (`status = CANCELLED` filtered out).

#### F-WAL-09 Save Payout Account (IBAN Reuse)
**Given** user has never entered a payout account  
**When** user calls `PUT /wallet/payout-account` with valid IBAN and beneficiary  
**Then** `wallet.payoutIban` and `wallet.payoutBeneficiaryName` are saved for future use.

#### F-WAL-10 Transaction History Pagination
**Given** a user with more than 50 wallet transactions  
**When** user fetches transaction history  
**Then** results are paginated (default `limit=50`), `type=CASHBACK_CREDIT` filter works correctly; caller may override limit and offset.

#### F-WAL-11 PREMIUM Payout Threshold — Weekly Billing Period
**Given** a PREMIUM user whose subscription `metadata.billingPeriod = "weekly"`  
**When** `getBalance` or `requestPayout` resolves the threshold  
**Then** threshold = `PAYOUT_THRESHOLD_PREMIUM_WEEKLY_EUR × EUR_TO_BGN_RATE` (10 EUR ≈ 19.56 BGN), not the monthly threshold (15 EUR ≈ 29.34 BGN).

---

### F-ADM: Admin Cashback Management

#### F-ADM-01 Monthly Summary — Pending Partners
**Given** multiple partners have approved receipts in the current month with no payment recorded  
**When** admin fetches `GET /api/admin/cashback/summary?month=YYYY-MM&status=PENDING`  
**Then** each partner appears with the correct aggregated `totalCashbackOwed`.

#### F-ADM-02 Mark Month as Paid
**Given** a partner has PENDING cashback for a month  
**When** admin calls `POST /api/admin/cashback/:partnerId/:month/mark-paid` with optional notes  
**Then** `PartnerCashbackPayment.status = PAID`, `paidAt` is set, `paidBy` stores admin ID.

#### F-ADM-03 Overdue Detection
**Given** a partner has PENDING cashback from a month older than 30 days past month-end  
**When** admin fetches summary  
**Then** the partner appears with `status = OVERDUE` in the response.

#### F-ADM-04 Rate Matrix — Create New Version
**Given** admin posts all 5 discount steps in a single request to `POST /api/admin/cashback/rates`  
**When** the request is valid  
**Then** 5 `CashbackRate` rows are created sharing the same `effectiveFrom`, marked with admin `createdBy`.

#### F-ADM-05 Rate Matrix — Incomplete Submission Rejected
**Given** admin posts only 4 of the 5 required steps  
**When** request is submitted  
**Then** 400 error is returned; no rates are written (all-or-nothing).

#### F-ADM-06 Rate Matrix — DB Fallback to Hardcoded Constants
**Given** no `CashbackRate` rows exist in the database  
**When** cashback is calculated  
**Then** system uses the hardcoded `CASHBACK_MATRIX` constants without error.

#### F-ADM-07 Reconciliation Audit Trail
**Given** a partner-month with several approved receipts  
**When** admin calls `GET /api/admin/cashback/:partnerId/:month/receipts`  
**Then** all approved receipts for that partner-month are returned with: amount, merchant, cashback amount, review metadata.

#### F-ADM-08 Partner Reminder Email
**Given** a partner has overdue cashback and a valid email address  
**When** admin calls `POST /api/admin/cashback/:partnerId/remind`  
**Then** a reminder email is sent to the partner; the action is logged.

#### F-ADM-09 Stats Endpoint — Correct Aggregation
**Given** a known set of approved receipts and payments  
**When** admin calls `GET /api/admin/cashback/stats`  
**Then** response contains correct: `pendingTotal`, `paidThisMonth`, `overdueCount`, `activePartners`.

#### F-ADM-10 Reminder — Partner Has No Email
**Given** a partner record has no email address (`email = null`)  
**When** admin calls `POST /api/admin/cashback/:partnerId/remind`  
**Then** service returns `{ sent: false, reason: "Partner has no email address" }`; no email is attempted.

#### F-ADM-11 Reminder — No Outstanding Cashback
**Given** a partner has no APPROVED receipts in the target month (totalOwed = 0)  
**When** admin calls `POST /api/admin/cashback/:partnerId/remind`  
**Then** service returns `{ sent: false, reason: "No outstanding cashback for this month" }`; no email is sent.

#### F-ADM-12 Mark-Paid Idempotency
**Given** a partner-month is already marked PAID  
**When** admin calls `mark-paid` again for the same partner-month  
**Then** the record is updated (upsert) — `paidAt`, `paidBy`, and `notes` are refreshed; no duplicate `PartnerCashbackPayment` row is created.

#### F-ADM-13 Rate Creation — Duplicate Discount Step Rejected
**Given** admin submits a rate array where the same `discountStep` appears twice  
**When** request is submitted  
**Then** 400 error: `"Duplicate discountStep X in input — each step must appear once"`; no rates written.

---

### F-RATE: Cashback Rate Resolution

#### F-RATE-01 Versioned Rate — Latest Rate Used
**Given** two versions of rates with different `effectiveFrom` dates  
**When** cashback is calculated  
**Then** the most recent version (highest `effectiveFrom ≤ now()`) is used.

#### F-RATE-02 Future-Dated Rates Not Applied
**Given** a rate with `effectiveFrom` set 24 hours in the future  
**When** cashback is calculated now  
**Then** the previous (current) rate version is used, not the future one.

#### F-RATE-03 Percentage Bounds Validation
**Given** admin attempts to create a rate with `basic = 105` (over 100%) or `premium = -1` (negative)  
**When** request is submitted  
**Then** 400 validation error: `"Cashback percentages must be between 0 and 100"`; no rows written.

#### F-RATE-04 Partner Discount Exceeds Highest Matrix Step
**Given** a partner whose `discountRate = 30%` (above the highest step of 25%)  
**When** cashback is calculated  
**Then** the highest matching step (25) is used — cashback % is based on step 25, not an out-of-bounds lookup.

---

## Part 2 — Security Tests

### S-AUTH: Authentication & Authorization

#### S-AUTH-01 Wallet Endpoints Require Authentication
**Given** no JWT token in the request  
**When** calling `GET /api/wallet/balance`  
**Then** 401 Unauthorized is returned.

#### S-AUTH-02 Admin Endpoints Reject Regular Users
**Given** a valid JWT for a regular user (non-admin)  
**When** calling `GET /api/admin/cashback/stats`  
**Then** 403 Forbidden is returned.

#### S-AUTH-03 Admin Endpoints Reject ADMIN for SUPER_ADMIN-Only Actions (if any)
**Given** a user with role ADMIN  
**When** calling endpoints restricted to SUPER_ADMIN  
**Then** 403 Forbidden is returned.

#### S-AUTH-04 Tampered JWT Rejected
**Given** a valid JWT whose payload is base64-decoded, modified (e.g. role changed to ADMIN), and re-encoded  
**When** the tampered token is sent  
**Then** signature verification fails → 401 Unauthorized.

#### S-AUTH-05 Expired JWT Rejected
**Given** a JWT whose `exp` is in the past (access token expiry = 1 hour)  
**When** the expired token is sent  
**Then** 401 Unauthorized is returned.

#### S-AUTH-06 User Cannot Access Another User's Wallet
**Given** User A is authenticated  
**When** User A calls `GET /api/wallet/transactions?userId=UserB_id`  
**Then** only User A's transactions are returned (server enforces user ID from JWT, not query param).

---

### S-RATE: Rate Limiting

#### S-RATE-01 Payout Endpoint Rate Limit Enforced
**Given** `paymentRateLimiter` allows 10 requests per 15 minutes  
**When** user submits 11 payout requests within 15 minutes  
**Then** the 11th request returns 429 Too Many Requests with `Retry-After` header.

#### S-RATE-02 Receipt Upload Rate Limit Enforced
**Given** upload endpoints allow 5 requests per minute  
**When** user submits 6 receipt uploads within 60 seconds  
**Then** the 6th request returns 429.

#### S-RATE-03 Auth Endpoints Rate Limit
**Given** auth endpoints allow 5 requests per 15 minutes  
**When** 6 login attempts are made in 15 minutes  
**Then** 429 is returned on the 6th attempt.

#### S-RATE-04 Rate Limit Reset After Window
**Given** the rate limit has been hit  
**When** the window expires and one more request is sent  
**Then** the request succeeds (limit resets correctly).

---

### S-FRAUD: Fraud Detection Security

#### S-FRAUD-01 Exact Duplicate Image Blocked (SHA-256)
**Given** a receipt image with a SHA-256 hash already in the database (any user — check is global, not per-user)  
**When** the same image file is resubmitted  
**Then** `fraudScore` receives +40 points for `DUPLICATE_IMAGE`, receipt goes to MANUAL_REVIEW.

#### S-FRAUD-02 Perceptually Similar Image Flagged (dHash)
**Given** a receipt image that is visually similar (Hamming distance ≤ 10 bits) to a previously submitted image  
**When** submitted  
**Then** `fraudScore` receives +35 points for `PERCEPTUAL_DUPLICATE_CLOSE`.

#### S-FRAUD-03 GPS Spoofing Detection
**Given** user submits a receipt claiming GPS coordinates >500m from the venue (`GPS_FAR_THRESHOLD_M = 500`)  
**When** fraud check runs  
**Then** `fraudScore` receives +25 points for `GPS_FAR_FROM_VENUE`.

#### S-FRAUD-04 GPS Spoofing — Moderate Distance
**Given** user is between 200m and 500m from venue (`GPS_WARNING_THRESHOLD_M = 200`, `GPS_FAR_THRESHOLD_M = 500`)  
**Then** +15 points for `GPS_OUTSIDE_RANGE` (not `GPS_MODERATE_DISTANCE`).

#### S-FRAUD-05 Rapid Submission Detection
**Given** user submits 3+ receipts within 5 minutes (`RAPID_SUBMISSION_COUNT_THRESHOLD = 3`, `RAPID_SUBMISSION_WINDOW_MS = 5 min`)  
**When** the 3rd submission occurs  
**Then** +15 points for `RAPID_SUBMISSIONS`.

#### S-FRAUD-06 Unusual Hours Detection
**Given** a receipt is submitted between 2:00 AM and 6:00 AM local time (`UNUSUAL_HOUR_START = 2`, `UNUSUAL_HOUR_END = 6`)  
**Then** +10 points for `UNUSUAL_TIME` (not `UNUSUAL_SUBMISSION_TIME`).

#### S-FRAUD-07 Combined Rapid + Unusual Hours
**Given** 3+ submissions within 5 minutes, all submitted between 2–6 AM  
**Then** fraud score includes both +15 (`RAPID_SUBMISSIONS`) and +10 (`UNUSUAL_TIME`) = +25 total (signals are independent and combine).

#### S-FRAUD-08 Daily Submission Limit Exceeded
**Given** venue has a configured daily submission limit and user has already reached it  
**When** another submission is made  
**Then** +30 points for `DAILY_LIMIT_EXCEEDED`.

#### S-FRAUD-09 Monthly Submission Limit Exceeded
**Given** user has reached the monthly submission limit  
**Then** +30 points for `MONTHLY_LIMIT_EXCEEDED`.

#### S-FRAUD-10 Blacklisted Merchant
**Given** the OCR-extracted merchant name matches a `MerchantWhitelist` entry with `status = BLOCKED`  
**Then** +50 points for `MERCHANT_BLACKLISTED` (not `BLACKLISTED_MERCHANT`).

#### S-FRAUD-11 Whitelisted Merchant Reduces Score
**Given** the merchant is on the whitelist  
**Then** -10 points applied to fraud score.

#### S-FRAUD-12 Moderate Amount Mismatch — OCR vs User Entry
**Given** OCR reads 80 BGN but user entered 100 BGN (>20% difference — `AMOUNT_MODERATE_MISMATCH_PCT = 20`)  
**Then** +15 points for `AMOUNT_MISMATCH` (not `AMOUNT_MISMATCH_MODERATE`).

#### S-FRAUD-13 Large Amount Mismatch
**Given** OCR reads 50 BGN but user entered 100 BGN (>50% difference — `AMOUNT_LARGE_MISMATCH_PCT = 50`)  
**Then** +30 points for `LARGE_AMOUNT_MISMATCH` (not `AMOUNT_MISMATCH_HIGH`).

#### S-FRAUD-14 Low OCR Confidence
**Given** OCR confidence < 50% (`OCR_LOW_CONFIDENCE_THRESHOLD = 50`)  
**Then** +20 points for `LOW_OCR_CONFIDENCE`.

#### S-FRAUD-15 Fraud Score Capped at 100
**Given** multiple high-scoring signals that would sum over 100  
**When** score is calculated  
**Then** final `fraudScore` is capped at 100, never exceeds it.

#### S-FRAUD-16 PREMIUM Card Gets Score Reduction
**Given** a PREMIUM cardholder submits a receipt  
**Then** -5 points applied to fraud score (trusted customer discount).

#### S-FRAUD-17 Amount Correction Triggers Fraud Recompute
**Given** admin corrects the amount during review  
**When** the corrected amount differs enough to change OCR mismatch scoring  
**Then** `fraudScore` is recomputed with the new amount before approval.

#### S-FRAUD-18 Perceptually Similar Image — Moderate Duplicate
**Given** a receipt image whose dHash Hamming distance is between 11 and 20 bits from a previously submitted image (`PERCEPTUAL_HASH_MODERATE_THRESHOLD = 20`)  
**When** submitted  
**Then** `fraudScore` receives +15 points for `PERCEPTUAL_DUPLICATE_MODERATE` (distinct from the close-duplicate +35 case in S-FRAUD-02).

#### S-FRAUD-19 Moderate OCR Confidence
**Given** OCR confidence is between 50% and 70% (`OCR_LOW_CONFIDENCE_THRESHOLD = 50`, `OCR_MODERATE_CONFIDENCE_THRESHOLD = 70`)  
**Then** +10 points for `MODERATE_OCR_CONFIDENCE` (not `LOW_OCR_CONFIDENCE`).

#### S-FRAUD-20 Bill Amount Below Venue Minimum
**Given** the venue (or global config) has a `minBillAmount` and `userAmount` is below it  
**Then** +10 points for `AMOUNT_TOO_LOW`.

#### S-FRAUD-21 Venue Template Mismatch
**Given** a venue has `templateMatchEnabled = true` and uploaded receipt templates  
**When** a submitted receipt's perceptual hash does not match any template above `templateMinSimilarity`  
**Then** `fraudScore` receives `templateFraudPoints` (default 35) for `TEMPLATE_MISMATCH`.

#### S-FRAUD-22 Fraud Check Internal Error
**Given** a transient DB error occurs inside `fraudDetectionService.checkReceipt()`  
**When** the error is thrown  
**Then** the service catches it, returns `fraudScore = 50` and `fraudReasons = ["FRAUD_CHECK_ERROR"]`, with `requiresManualReview = true`; no unhandled exception propagates.

#### S-FRAUD-23 BASIC Card Tier Gets Minor Score Reduction
**Given** a BASIC cardholder submits a receipt  
**Then** −3 points applied to fraud score (code: `cardTier === 'BASIC' → Math.max(0, score - 3)`), complementing the −5 for PREMIUM (S-FRAUD-16).

---

### S-INJECT: Injection & Input Validation

#### S-INJECT-01 SQL Injection in Amount Fields
**Given** a receipt submission with `totalAmount = "'; DROP TABLE receipts; --"`  
**When** processed  
**Then** Prisma ORM safely parameterizes the query; database is unaffected; 400 validation error returned.

#### S-INJECT-02 XSS in Merchant Name / Notes Fields
**Given** `merchantName = "<script>alert('xss')</script>"`  
**When** stored and later displayed  
**Then** value is stored as plain text (not executed); API responses encode it safely.

#### S-INJECT-03 Oversized File Upload Rejected
**Given** a receipt image file exceeding 10 MB  
**When** submitted  
**Then** 413 Payload Too Large is returned; file is not stored.

#### S-INJECT-04 Invalid File Type Rejected
**Given** a file with `.exe` extension (or non-image magic bytes) is uploaded  
**When** submitted  
**Then** 400 Bad Request; file not processed.

#### S-INJECT-05 Negative Amount Rejected
**Given** `totalAmount = -50`  
**When** submitted  
**Then** 400 validation error; no receipt created.

#### S-INJECT-06 Zero Amount Rejected
**Given** `totalAmount = 0`  
**When** submitted  
**Then** 400 validation error; no receipt created.

#### S-INJECT-07 Extremely Large Amount
**Given** `totalAmount = 9999999999`  
**When** submitted  
**Then** either a configured max-amount limit rejects it, or the fraud detection score reflects the anomaly.

#### S-INJECT-08 Invalid IBAN Format Rejected
**Given** `PUT /wallet/payout-account` with `iban = "NOT_AN_IBAN"`  
**When** submitted  
**Then** 400 validation error; IBAN not saved.

#### S-INJECT-09 Non-Numeric Amount in Receipt
**Given** `totalAmount = "abc"`  
**When** submitted  
**Then** 400 validation error.

#### S-INJECT-10 GPS Coordinates Out of Valid Range
**Given** `latitude = 999, longitude = 999`  
**When** submitted  
**Then** 400 validation error (valid lat: -90 to 90, lon: -180 to 180).

---

### S-RACE: Race Conditions & Concurrency

#### S-RACE-01 Concurrent Payout Requests — Only One Succeeds
**Given** a user with sufficient balance sends two simultaneous `POST /wallet/payout` requests  
**When** both are processed concurrently  
**Then** exactly one succeeds (the other receives 409 due to PROCESSING guard); balance is debited only once; no double-payout.

#### S-RACE-02 Concurrent Cashback Credits — Both Succeed Without Corruption
**Given** two receipts for the same user are approved simultaneously  
**When** both credit operations run concurrently  
**Then** both credits are applied correctly (Prisma `$transaction` ensures atomic balance updates); final balance = sum of both.

#### S-RACE-03 Double Approval of Same Receipt — Idempotent
**Given** an `APPROVED` receipt  
**When** admin attempts to approve it again  
**Then** 409 Conflict is returned; wallet is not double-credited.

#### S-RACE-04 Payout During Active Cashback Credit
**Given** a cashback credit and a payout request happen simultaneously  
**When** both run concurrently  
**Then** the final balance is consistent (no negative balance, no lost funds).

---

### S-BIZ: Business Logic Abuse

#### S-BIZ-01 User Cannot Manually Set Cashback Amount
**Given** a receipt submission request includes a crafted `cashbackAmount` field  
**When** processed  
**Then** the server-side calculation overrides any client-provided cashback amount.

#### S-BIZ-02 User Cannot Set Their Own cashbackPercent
**Given** a receipt submission request includes `cashbackPercent = 99`  
**When** processed  
**Then** the server resolves cashback % from the partner-discount matrix; client value is ignored.

#### S-BIZ-03 User Cannot Approve Own Receipt
**Given** a regular user sends a request to the admin approval endpoint for their own receipt  
**When** processed  
**Then** 403 Forbidden (admin role check blocks this).

#### S-BIZ-04 Payout to Unverified IBAN
**Given** a payout request with an IBAN that has not been saved/validated  
**When** processed  
**Then** the IBAN is validated before Paysera is called; invalid IBANs are rejected.

#### S-BIZ-05 Payout With No Available Balance
**Given** `wallet.availableBalance = 0` (or only pending balance)  
**When** payout is requested  
**Then** request is rejected; only `availableBalance` (not `pendingBalance`) is withdrawable.

#### S-BIZ-06 Replay Attack on Paysera Payout
**Given** a previously completed payout request is replayed  
**When** the same request body is sent again  
**Then** the idempotency key `{walletId}-{withdrawalTxId}` ensures Paysera processes it only once; debit does not occur twice.

#### S-BIZ-07 Submitting Receipt for Another User's Venue
**Given** a user submits a receipt for a venue ID that does not belong to their registered partner  
**When** processed  
**Then** the receipt is either rejected (venue not found) or flagged for review; cashback is not elevated by using a high-discount venue.

#### S-BIZ-08 Admin Cannot Mark Non-Existent Partner Month as Paid
**Given** admin calls `POST /api/admin/cashback/nonexistent-partner-id/2026-04/mark-paid`  
**When** processed  
**Then** 404 Not Found is returned.

#### S-BIZ-09 Cashback Rate Percentage Cannot Be Negative
**Given** admin submits a rate with `basic = -5`  
**Then** 400 validation error; rate not saved.

#### S-BIZ-10 Locked Wallet Cannot Process Payout
**Given** `wallet.isLocked = true`  
**When** user requests payout  
**Then** 403 or 400 is returned with a locked-wallet message; no debit occurs.

---

### S-AUDIT: Audit Trail & Data Integrity

#### S-AUDIT-01 Every Wallet Debit Records balanceBefore and balanceAfter
**When** any wallet debit occurs  
**Then** the `WalletTransaction` row stores `balanceBefore` and `balanceAfter` matching the actual wallet state change.

#### S-AUDIT-02 Receipt Approval Stamped with Reviewer
**When** admin approves a receipt  
**Then** `receipt.reviewedBy = adminUserId`, `receipt.reviewedAt = timestamp`.

#### S-AUDIT-03 Cashback Rate Creation Stamped with Admin
**When** admin creates a new cashback rate set  
**Then** each `CashbackRate` row has `createdBy = adminUserId`.

#### S-AUDIT-04 Partner Cashback Payment Stamped with Admin
**When** admin marks cashback as paid  
**Then** `PartnerCashbackPayment.paidBy = adminUserId`, `paidAt = timestamp`.

#### S-AUDIT-05 Paysera Idempotency Key Stable Across Retries
**Given** the same withdrawal transaction ID and wallet ID  
**When** the Paysera call is retried (network timeout)  
**Then** the idempotency key `{walletId}-{withdrawalTxId}` is identical on both attempts, preventing double payment.

---

## Part 3 — Background Jobs

### BJ-EXP: Cashback Expiry Job (2 AM Sofia Time)

#### BJ-EXP-01 Expired Cashback Cancelled
**Given** a `CASHBACK_CREDIT` with `cashbackExpiresAt` yesterday  
**When** nightly job runs  
**Then** `WalletTransaction.status = CANCELLED`, `availableBalance` reduced by that amount.

#### BJ-EXP-02 Non-Expired Cashback Not Touched
**Given** a `CASHBACK_CREDIT` with `cashbackExpiresAt` 30 days from now  
**When** nightly job runs  
**Then** transaction remains COMPLETED, balance unchanged.

#### BJ-EXP-03 Job Processes in Batches of 10
**Given** 25 expired cashback transactions exist  
**When** job runs  
**Then** all 25 are cancelled (processed in 3 batches: 10 + 10 + 5) without timeout or crash.

#### BJ-EXP-04 Single Failure Does Not Halt Batch
**Given** one transaction fails to update (DB transient error)  
**When** job processes the batch  
**Then** the remaining 9 in the batch are still processed; failure is logged.

### BJ-REV: Manual Review Expiry Job (3 AM Sofia Time)

#### BJ-REV-01 Old Manual Reviews Auto-Rejected
**Given** a receipt with `status = MANUAL_REVIEW` and `createdAt = 31 days ago`  
**When** nightly job runs  
**Then** `receipt.status = REJECTED`, `rejectionReason = "Auto-rejected: no admin decision within 30 days"`.

#### BJ-REV-02 Recent Manual Reviews Not Touched
**Given** a receipt with `status = MANUAL_REVIEW` and `createdAt = 15 days ago`  
**When** nightly job runs  
**Then** receipt remains in MANUAL_REVIEW.

---

## Part 4 — End-to-End Scenarios

### E2E-01 Full Cashback Lifecycle (Receipt → Payout)
1. User scans receipt at partner venue with 20% discount, PREMIUM plan.
2. Receipt submitted → `MANUAL_REVIEW` (or auto-approved on low fraud score path).
3. Cashback = 16% of bill credited to wallet with 60-day expiry.
4. User checks wallet: sees CASHBACK_CREDIT in transaction history.
5. User requests payout (balance > €15 threshold for PREMIUM).
6. Paysera transfer initiated with idempotency key.
7. Paysera callback received → transaction marked COMPLETED.
8. Wallet `availableBalance` = 0 after withdrawal.

### E2E-02 Fraud Detection → Manual Review → Admin Rejection
1. User submits a receipt with GPS 300m from venue (+25 pts) at 3 AM (+10 pts) for a blacklisted merchant (+50 pts) = 85 pts.
2. Receipt goes to MANUAL_REVIEW.
3. Admin reviews and rejects with reason.
4. User receives rejection notification.
5. No cashback ever credited.

### E2E-03 Admin Cashback Monthly Cycle
1. Multiple users scan receipts at partner venues throughout the month.
2. Admin reviews and approves receipts.
3. At month-end, admin views `GET /admin/cashback/summary?month=2026-04&status=PENDING`.
4. Admin verifies partner owes correct amount (sum of approved cashbacks).
5. Admin pays partner externally and records: `POST /admin/cashback/:partnerId/2026-04/mark-paid`.
6. Partner's status changes to PAID.
7. Admin pulls reconciliation report to verify receipt-level breakdown.

### E2E-04 Cashback Rate Change Mid-Month
1. Admin creates new cashback rate set effective from today.
2. Receipts approved before today use old rates.
3. Receipts approved today and after use new rates.
4. Verify: rate lookup uses `effectiveFrom ≤ approvalDate` correctly.

---

## Test Coverage Summary

| Area | Test Count |
|------|------------|
| Receipt cashback (F-REC) | 13 |
| Sticker scan cashback (F-STK) | 5 |
| Wallet & payout (F-WAL) | 11 |
| Admin management (F-ADM) | 13 |
| Rate resolution (F-RATE) | 4 |
| Auth & authorization (S-AUTH) | 6 |
| Rate limiting (S-RATE) | 4 |
| Fraud detection (S-FRAUD) | 23 |
| Injection & input validation (S-INJECT) | 10 |
| Race conditions (S-RACE) | 4 |
| Business logic abuse (S-BIZ) | 10 |
| Audit trail (S-AUDIT) | 5 |
| Background jobs (BJ-EXP + BJ-REV) | 6 |
| End-to-end scenarios (E2E) | 4 |
| **Total** | **118** |
