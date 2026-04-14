# Cashback System Audit

_Date: 2026-04-07_
_Implementation completed: 2026-04-07 (all 13 items)_

---

## Status legend
- ✅ **Fixed** — implemented and audited
- 🔍 **Audited** — original audit note, included for reference

---

## Critical (Financial Loss Risk)

### 1. No cashback clawback on refunds ✅
- **File:** `backend-api/src/services/payment.service.ts` — `createRefund()`
- **Problem:** When a transaction is refunded, loyalty points are deducted but cashback was **never reversed**.
- **Fix implemented:** After loyalty-point deduction, `createRefund()` now looks up any `WalletTransaction` of type `CASHBACK_CREDIT` linked to the approved receipt for that transaction and calls `walletService.debit()` to reverse it. Partial refunds are pro-rated: `reversalAmount = cashbackTx.amount × refundedAmount / transaction.amount`.
- **Insufficient-balance handling:** If the user already spent the cashback, `debit()` throws "Insufficient wallet balance". The catch block now locks the wallet (`isLocked = true`, `lockedReason` set) so no further payouts can occur until an admin reconciles.
- **New imports:** `WalletTransactionType`, `WalletTransactionStatus` from `@prisma/client`; `walletService` from `./wallet.service`.

### 2. No cashback reversal on payment cancellation ✅
- **File:** `backend-api/src/routes/payments.paysera.routes.ts` — cancellation callback handler
- **Problem:** The `failed`/`cancelled` callback branch updated the transaction status but did not reverse cashback if a receipt had already been approved for that transaction.
- **Fix implemented:** The `else if (result.status === 'failed' || result.status === 'cancelled')` branch now finds any approved receipt linked to the transaction, looks up its `CASHBACK_CREDIT` wallet transaction, and calls `walletService.debit()` to reverse it.
- **Insufficient-balance handling:** Same wallet-lock logic as fix #1 — if the user spent the cashback, the wallet is locked for manual review.

### 3. Transaction status not validated before cashback approval ✅
- **Files:** `backend-api/src/services/receipt.service.ts`
- **Problem:** Cashback could be credited even if the linked transaction had since been cancelled or failed.
- **Fix implemented — `applyCashback()`:** After the `APPROVED` status check, added: `if (receipt.transactionId && receipt.transaction?.status !== 'COMPLETED') throw 409`. The receipt is fetched with `include: { transaction: true }` so no extra query is needed. Removed `(receipt as any)` casts — the Prisma-inferred type already includes both fields.
- **Fix implemented — `reviewReceipt()`:** Added the same guard **before** `claimResult.updateMany()`. Placing it before the claim is critical: if the guard threw after the claim, the receipt would be left permanently `APPROVED` with `cashbackAmount > 0` but no wallet credit (the admin claim would be consumed and the receipt could never be re-reviewed).

---

## High Priority

### 4. No daily/monthly cashback caps per user ✅
- **Files:** `backend-api/src/services/fraudDetection.service.ts`, `backend-api/src/constants/receipt.constants.ts`
- **Problem:** Only a per-scan cap was enforced; a user could submit many receipts in one day to accumulate unlimited cashback.
- **Fix implemented:** Added two new constants to `receipt.constants.ts`:
  - `DEFAULT_MAX_CASHBACK_PER_DAY = 200` (BGN, rolling 24 h)
  - `DEFAULT_MAX_CASHBACK_PER_MONTH = 1000` (BGN, rolling 30 d)
- `calculateCashback()` now accepts an optional `userId`. When provided, it aggregates `CASHBACK_CREDIT` wallet transactions for the rolling windows and reduces `cashbackAmount` to stay within the remaining allowance.
- All callers that have a `userId` in scope (`submitReceipt`, `reviewReceipt` ×2, `scanSticker`, `uploadReceipt`) now pass it.
- **Enum fix (audit bug B):** `WalletTransactionType` and `WalletTransactionStatus` are now properly imported from `@prisma/client` in `fraudDetection.service.ts` instead of raw string literals.

### 5. Wallet locked + auto-approval = silent failure ✅
- **File:** `backend-api/src/services/receipt.service.ts` — `submitReceipt()`
- **Problem:** If the wallet was locked at auto-approval time, `credit()` would throw and the receipt would be left `APPROVED` with `cashbackAmount > 0` but no wallet balance update.
- **Fix implemented:** Before setting status to `APPROVED`, `submitReceipt()` now reads `wallet.isLocked`. If the wallet is locked, status is set to `MANUAL_REVIEW` instead, preventing the discrepancy. An admin can approve after the lock is lifted.

### 6. Fraud score not recomputed on admin amount correction ✅
- **File:** `backend-api/src/services/receipt.service.ts` — `reviewReceipt()`
- **Problem:** When admin corrected a receipt amount, cashback was recalculated but the original fraud score remained unchanged on the record.
- **Fix implemented:** When `params.verifiedAmount` is set, `reviewReceipt()` calls `fraudDetectionService.checkReceipt()` with the corrected amount and stores the result in `fraudScore` via the `claimResult` updateMany. If the recomputed score exceeds `DEFAULT_AUTO_APPROVE_THRESHOLD`, a `logger.warn` is emitted (admin override is still honoured).
- **Audit bug C fix:** `checkReceipt()` is called with `excludeReceiptId: params.receiptId` so the receipt is not flagged against its own hash in `checkDuplicate()`. Without this, the recomputed score would always be inflated by 40 points (the `DUPLICATE_IMAGE` penalty).
- `FraudCheckParams` now has an optional `excludeReceiptId` field; `checkDuplicate()` accepts an optional second argument and excludes the given ID from its query.

---

## Medium Priority

### 7. No idempotency key for Paysera payout transfers ✅
- **Files:** `backend-api/src/services/paysera.service.ts`, `backend-api/src/services/wallet.service.ts`
- **Problem:** The Paysera B2C Transfer API call had no idempotency key; a network timeout followed by a retry would create a duplicate bank transfer.
- **Fix implemented:**
  - `CreateTransferParams` has a new optional `idempotencyKey?: string` field.
  - `transferApiRequest()` accepts an optional `extraHeaders` parameter and includes the key as `Idempotency-Key: <value>` when present.
  - `requestPayout()` generates `idempotencyKey = \`${wallet.id}-${withdrawalTxId}\`` — stable across retries for the same withdrawal attempt.

### 8. Cashback expiry runs on every balance read ✅
- **Files:** `backend-api/src/services/wallet.service.ts`, `backend-api/src/jobs/cashback-expiry.ts` *(new)*
- **Problem:** `expireOldCashback()` was called on every `getBalance()` invocation, adding a DB write to every read path.
- **Fix implemented:** Removed the `expireOldCashback()` call from `getBalance()`. Created `backend-api/src/jobs/cashback-expiry.ts` — a standalone script that runs nightly (`0 2 * * *`). It:
  1. Finds all wallets with expired `CASHBACK_CREDIT` entries in a single query.
  2. Processes them in **concurrent batches of 10** (`Promise.allSettled`) so the job completes quickly without overwhelming the DB connection pool.
  3. Reports totals and per-wallet failures.
- `expireOldCashback()` is intentionally retained in `requestPayout()` so the balance is accurate before computing payout amounts.

### 9. Cashback rate matrix is hardcoded ✅
- **Files:** `backend-api/prisma/schema.prisma`, `backend-api/src/services/fraudDetection.service.ts`, `backend-api/src/services/adminCashback.service.ts`, `backend-api/src/routes/adminCashback.routes.ts`
- **Problem:** `CASHBACK_MATRIX` was a compile-time constant. Changing rates required a code change and redeploy with no versioning or audit trail.
- **Fix implemented:** Added a `CashbackRate` model to the schema with fields `discountStep`, `basic`, `premium`, `effectiveFrom`, `createdBy`, and `notes`. Each row is one step in the matrix; a full rate "version" is a set of rows sharing the same `effectiveFrom` timestamp.
- **Runtime lookup in `calculateCashback()`:** Loads all rows where `effectiveFrom ≤ now()`, ordered by `effectiveFrom DESC`, takes the most recent entry per step, and falls back to the hardcoded `CASHBACK_MATRIX` constant if no DB row exists. Falls back silently on DB error (non-fatal).
- **Admin API:** Added three routes to `GET /api/admin/cashback/rates` (full history), `GET /api/admin/cashback/rates/current` (one effective row per step, showing whether it's from DB or default), and `POST /api/admin/cashback/rates` (create a new versioned rate set for all steps, validated).
- **Seed script:** `backend-api/prisma/seed-cashback-rates.ts` populates the initial matrix from the docx (back-dated to 2024-01-01) and is idempotent (skips if rows exist). Run: `npx tsx prisma/seed-cashback-rates.ts`
- **Migration:** Run `prisma db push` (or generate a migration) to create the `cashback_rates` table, then run the seed script once.

---

## Low Priority

### 10. Missing notification on sticker scan approval ✅
- **Files:** `backend-api/src/services/notification.service.ts`, `backend-api/src/services/sticker.service.ts`
- **Problem:** `approveScan()` had a `// TODO: Send notification` comment; no notification was sent when a sticker scan was approved. The original workaround (`notifyReceiptApproved`) also used the wrong notification type and wording ("Your receipt was approved") for a sticker scan event.
- **Fix implemented:** Added `notifyStickerScanApproved()` to `NotificationService`. It creates an in-app notification with type `STICKER_SCAN_APPROVED` and sends a push notification with scan-specific wording ("Your visit to X was confirmed"), distinct from the receipt flow's `RECEIPT_APPROVED` type. `approveScan()` now calls this method (non-fatal, errors are caught and logged).

### 11. Perceptual hash not used for duplicate detection ✅
- **File:** `backend-api/src/services/fraudDetection.service.ts`
- **Problem:** Perceptual hash was stored but not used for receipt-level duplicate detection. A user could re-upload the same receipt as a slightly different image file to bypass the SHA-256 check.
- **Fix implemented:** Added check **1b** in `checkReceipt()` (runs when `perceptualHash` is present) that queries all the user's existing approved receipts with a non-null `perceptualHash`, computes the Hamming distance between each and the submitted hash using character-by-character nibble XOR, and applies fraud points:
  - **≤ 10 bits different** (close match) → +35 points, reason `PERCEPTUAL_DUPLICATE_CLOSE`
  - **11–20 bits different** (moderate match) → +15 points, reason `PERCEPTUAL_DUPLICATE_MODERATE`
- **Constants:** `PERCEPTUAL_HASH_CLOSE_THRESHOLD = 10` and `PERCEPTUAL_HASH_MODERATE_THRESHOLD = 20` added to `receipt.constants.ts`.
- **Self-check protection:** Respects `excludeReceiptId` — the same receipt is excluded when re-checking during admin correction flow.
- **New helpers:** Private `hexHammingDistance()` and `popcount4()` methods on `FraudDetectionService`.

### 12. MANUAL_REVIEW receipts never auto-expire ✅
- **File:** `backend-api/src/jobs/manual-review-expiry.ts` *(new)*
- **Problem:** Receipts in `MANUAL_REVIEW` could sit indefinitely with no timeout or auto-rejection.
- **Fix implemented:** Created `backend-api/src/jobs/manual-review-expiry.ts` — a standalone script that runs nightly (`0 3 * * *`). It:
  1. Finds all receipts with `status = MANUAL_REVIEW` and `createdAt < now − MANUAL_REVIEW_EXPIRY_DAYS`.
  2. Processes them in **concurrent batches of 20** (`Promise.allSettled`).
  3. Sets `status = REJECTED`, `rejectionReason = "Auto-rejected: no admin decision within 30 days"`, and stamps `reviewedAt`. `reviewedBy` is intentionally left null (system action).
  4. Reports totals and per-receipt failures.
- **Constant:** `MANUAL_REVIEW_EXPIRY_DAYS = 30` added to `receipt.constants.ts` (configurable without touching job code).

### 13. Partner cashback audit trail is incomplete ✅
- **Files:** `backend-api/src/services/adminCashback.service.ts`, `backend-api/src/routes/adminCashback.routes.ts`
- **Problem:** Admins could mark a partner-month as paid but had no way to list exactly which receipts were included in that period.
- **Fix implemented:** Added `getReceiptsByPartnerMonth(partnerId, month)` to `AdminCashbackService`. Returns all approved receipts for the partner-month with individual `totalAmount`, `cashbackAmount`, `merchantName`, `receiptDate`, `reviewedAt`, `reviewedBy`. Added route `GET /api/admin/cashback/:partnerId/:month/receipts` (admin-only, validates `YYYY-MM` format).

---

## Audit Session 29 — Bugs Found and Fixed (cashback calculation, auto-approval, job scheduling, rolling caps)

### Bug BE — `calculateCashback` resolved partner by `venueId` instead of `partnerId` — receipt cashback always 0 (Critical) ✅

- **File:** `backend-api/src/services/fraudDetection.service.ts` — `calculateCashback()`, step 1
- **Problem:** Step 1 did `prisma.partner.findUnique({ where: { id: params.venueId } })`. `Venue.id` and `Partner.id` are UUIDs from different tables and never coincide. The lookup always returned `null` → `partnerDiscountPct = 0` → the minimum step guard (`partnerDiscountPct < 5`) fired immediately → `calculateCashback` returned `{ cashbackAmount: 0, cashbackPercent: 0 }` for every receipt submission. The sticker service already did this correctly (it resolves `partner.id` from the venue and passes that), but the receipt service passed the raw `venueId`.
- **Fix:** Replaced `partner.findUnique({ id: venueId })` with `venue.findUnique({ id: venueId, select: { partner: { discountRate, partnerType } } })` so the partner is reached via its `Venue → partner` relation. The `getVenueConfig()` call in step 4 (fraud config, keyed by `VenueFraudConfig.venueId`) was already correct and required no change.

### Bug BF — Auto-approved receipts never credited the wallet (High) ✅

- **File:** `backend-api/src/services/receipt.service.ts` — `submitReceipt()`
- **Problem:** When a receipt passed fraud scoring (`isApproved = true`), `submitReceipt()` stamped `status = APPROVED` and `cashbackAmount > 0` on the receipt record but **never called `walletService.credit()`**. The user's wallet balance was never updated. Cashback could only reach the wallet if an admin later called `reviewReceipt()` or the legacy `applyCashback()` endpoint manually — there was no automatic path. Audit doc fix #5 added a wallet-lock pre-check before setting `APPROVED`, which only made sense if a credit was supposed to follow, but the credit call was absent.
- **Fix:** Added a `walletService.credit()` call immediately after `receipt.create()` when `status === 'APPROVED' && cashbackAmount > 0`. If the credit fails (e.g. wallet locked between the pre-check and the actual credit), the receipt is downgraded to `MANUAL_REVIEW` and `cashbackAmount` is zeroed on the record so an admin can re-approve cleanly.
- **Cap double-count fix:** The rolling-cap check in `calculateCashback` step 5 previously counted auto-approved receipts **twice** — once via `walletTransaction` aggregate and again via a `receipt.aggregate({ status: APPROVED, reviewedBy: null })` query intended to capture "credits not yet issued". With Bug BF fixed, auto-approved receipts immediately produce a wallet transaction, so the pending-receipt aggregate was removed to prevent double-counting.

### Bug BG — Nightly expiry jobs were never scheduled (High) ✅

- **Files:** `backend-api/src/jobs/cashback-expiry.ts`, `backend-api/src/jobs/manual-review-expiry.ts`, `backend-api/src/jobs/scheduler.ts` *(new)*, `backend-api/src/server.ts`
- **Problem:** Both job files were standalone scripts (each calls its run function at the bottom of the file), designed to be executed via `npx tsx`. No in-process cron library was used, and no OS-level crontab or external scheduler was configured anywhere in the repo. The `wallet.service.ts` comment even referenced a non-existent `cashbackExpiry.cron.ts`. As a result: cashback never expired (user wallet balances were permanently overstated) and MANUAL_REVIEW receipts never auto-rejected after 30 days.
- **Fix:** Created `backend-api/src/jobs/scheduler.ts`, which inlines the same expiry logic from both job files and registers two `node-cron` schedules:
  - `0 2 * * *` (Europe/Sofia) — cashback expiry
  - `0 3 * * *` (Europe/Sofia) — manual-review expiry
- `registerScheduledJobs()` is called in `server.ts` inside the `startServer()` callback, after the HTTP server is bound. The standalone job files are retained for one-off manual runs (`npx tsx src/jobs/cashback-expiry.ts`).
- `node-cron` and `@types/node-cron` were added to `backend-api/package.json`.

### Bug BH — Daily/monthly cashback caps used calendar reset, not rolling 24 h / 30 d windows (Medium) ✅

- **File:** `backend-api/src/services/fraudDetection.service.ts` — `calculateCashback()`, step 5
- **Problem:** The audit doc specified "rolling 24 h" and "rolling 30 d" caps, but the implementation used:
  ```ts
  dayStart.setHours(0, 0, 0, 0);                              // midnight reset
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of month
  ```
  A user could earn 200 BGN just before midnight and another 200 BGN just after (400 BGN within minutes). Same exploit at month boundaries.
- **Fix:** Replaced with true rolling lookbacks:
  ```ts
  const dayStart   = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  ```

---

## Audit Session 28 — Bugs Found and Fixed (payments routes: ownership checks and admin gate)

### Bug BB — POST /payments/refunds had no authorization (High) ✅

- **File:** `backend-api/src/routes/payments.routes.ts` — `POST /refunds`
- **Problem:** Any authenticated user could POST a `{ paymentIntentId, amount, reason }` body and trigger a Stripe refund on any payment intent, regardless of who owns it. No ownership check and no admin gate.
- **Fix:** Added `authorize('ADMIN', 'SUPER_ADMIN')` — issuing Stripe refunds is an admin-only operation. Customer-facing refund flows go through `PaymentService.createRefund()` which is already admin-gated.

### Bug BC — DELETE /payments/cards/:id had no ownership check (High) ✅

- **File:** `backend-api/src/routes/payments.routes.ts` — `DELETE /cards/:id`
- **Problem:** Any authenticated user who knew a Stripe payment method ID could detach it — even if it belonged to another user's Stripe customer. `stripeService.detachPaymentMethod(id)` accepts any PM ID unconditionally.
- **Fix:** Added a pre-check: look up the calling user's `stripeCustomerId`, list their payment methods via `stripeService.listPaymentMethods()`, and return 403 if the PM ID is not in their list.

### Bug BD — POST /payments/intents/:id/cancel had no ownership check (Moderate) ✅

- **File:** `backend-api/src/routes/payments.routes.ts` — `POST /intents/:id/cancel`
- **Problem:** Any authenticated user could cancel any Stripe payment intent by ID (used as a URL param), potentially disrupting another user's in-flight payment.
- **Fix:** Added a `Transaction` DB lookup: `findFirst({ where: { paymentIntentId: id, userId: req.user!.id } })` — returns 403 if no matching record exists for the calling user.

---

## Audit Session 27 — Bugs Found and Fixed (venues routes missing authorization)

### Bug BA — POST/PUT/DELETE /venues and POST/DELETE /venues/:id/menu had no role or ownership checks (Critical) ✅

- **File:** `backend-api/src/routes/venues.routes.ts`
- **Problem:** Five write endpoints only required `authenticate` with no role or ownership verification:
  - `POST /` — any logged-in user could create a venue for any `partnerId` in the request body
  - `PUT /:id` — any logged-in user could update any venue's name, address, contact info, etc.
  - `DELETE /:id` — any logged-in user could permanently delete any venue and all associated stickers/scans
  - `POST /:id/menu` — any logged-in user could upload menu images to any venue
  - `DELETE /:id/menu` — any logged-in user could wipe all menu images from any venue
  The `venueService` has no ownership checks either.
- **Fixes:**
  - `POST /` — added `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` + PARTNER ownership check: looks up `partner.userId` for the requested `partnerId` and returns 403 if it doesn't match the caller
  - `PUT /:id` — added `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` + PARTNER ownership check via venue→partner→userId
  - `DELETE /:id` — added `authorize('ADMIN', 'SUPER_ADMIN')` only (venue deletion is too destructive for partner self-service)
  - `POST /:id/menu` and `DELETE /:id/menu` — added `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` + PARTNER ownership check

---

## Audit Session 26 — Bugs Found and Fixed (stickers venue route authorization)

### Bug AY — PUT /stickers/venue/:venueId/config had no role check or ownership guard (Critical) ✅

- **File:** `backend-api/src/routes/stickers.routes.ts` — `PUT /venue/:venueId/config`
- **Problem:** The route only had `authenticate`. Any logged-in user (regular consumer) could PUT arbitrary sticker configuration for any venue — e.g., set `cashbackPercent` to 0 for a competitor, disable bonus cashback, corrupt expiry settings. No role check, no ownership check.
- **Fix:** Added `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` as Express middleware, and added an inline PARTNER ownership guard that looks up the venue's `partner.userId` and compares it to `req.user!.id`. ADMINs and SUPER_ADMINs bypass the ownership check.

### Bug AZ — GET /stickers/venue/:venueId/(stickers|scans|analytics|config) were open to all users (High) ✅

- **File:** `backend-api/src/routes/stickers.routes.ts`
- **Problem:** Four GET endpoints only required `authenticate`:
  - `GET /venue/:venueId` — sticker list (business layout intel)
  - `GET /venue/:venueId/scans` — **all scan records including user PII** (email, name, scan time, GPS coordinates, fraud scores)
  - `GET /venue/:venueId/analytics` — venue revenue and scan volume trends
  - `GET /venue/:venueId/config` — cashback percentage and bonus settings
  Any authenticated consumer user could read this data for any venue.
- **Fix:** Added `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` to all four GET route definitions.

---

## Audit Session 25 — Bugs Found and Fixed (missing ownership checks in subscription and card routes)

### Bug AW — POST /subscriptions/:id/cancel and /update-plan had no ownership check (High) ✅

- **File:** `backend-api/src/routes/subscriptions.routes.ts`
- **Problem:** Both `POST /:id/cancel` and `POST /:id/update-plan` retrieved the subscription ID from the URL path and passed it directly to the service with no check that `subscription.userId === req.user!.id`. Any authenticated user who knew another user's subscription ID could:
  - Cancel their subscription, cutting off their access immediately or at period end
  - Change their plan — downgrade them to LIGHT (triggering a wallet credit to the victim and cancelling their Stripe subscription), or upgrade their Stripe subscription (which would bill the victim's payment method)
- **Fix:** Added ownership guard in both routes before calling the service:
  ```ts
  const subscription = await subscriptionService.getSubscription(id);
  if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
  if (subscription.userId !== req.user!.id) {
    return res.status(403).json({ error: 'You do not have permission to ...' });
  }
  ```
  `subscriptionService.getSubscription()` already exists — it fetches by ID including the `userId` field.

### Bug AX — POST /cards/:id/(upgrade|deactivate|activate) and GET /:id/statistics had no ownership check (High) ✅

- **File:** `backend-api/src/routes/cards.routes.ts`
- **Problem:** Four card-ID endpoints did no ownership verification:
  - `POST /upgrade` — any user could upgrade any card (relies on card owner's subscription, not attacker's)
  - `POST /deactivate` — any user could suspend any other user's card (DoS)
  - `POST /activate` — any user could re-activate a suspended/fraud-flagged card belonging to someone else
  - `GET /statistics` — any user could read receipt/sticker counts for any card (privacy leak)
  The card service methods (`upgradeCardTier`, `deactivateCard`, `activateCard`, `getCardStatistics`) do not check ownership either.
- **Fix:** Added a `prisma.card.findUnique({ select: { userId } })` ownership check inline in each of the four route handlers, returning 403 if `card.userId !== req.user!.id`. Admins who need to deactivate/activate cards for fraud management should use a dedicated admin route.

---

## Audit Session 24 — Bugs Found and Fixed (authorization gaps in receipts routes)

### Bug AT — POST /analytics/update had no admin authorization and used wrong userId (High) ✅

- **File:** `backend-api/src/routes/receipts.enhanced.routes.ts` — `POST /analytics/update`
- **Problem (1):** The route was protected only by `authenticate`. Any authenticated user could POST `{ receiptId, status, cashbackAmount, totalAmount }` and call `receiptAnalyticsService.updateAnalytics()` with arbitrary values for their own `userId`, corrupting receipt analytics data (e.g. falsely marking submissions as approved, inflating cashback figures in dashboards).
- **Problem (2):** The handler passed `userId: req.user!.id` — the *caller's* ID — to `updateAnalytics()`. Even with admin auth, an admin calling this would update their own analytics record, not the receipt owner's.
- **Fix:** Added `authorize('ADMIN', 'SUPER_ADMIN')` as the second middleware. Also added a `prisma.receipt.findUnique({ where: { id: receiptId }, select: { userId: true } })` lookup and replaced `userId: req.user!.id` with `userId: receipt.userId`, so analytics are always updated for the correct receipt owner.

### Bug AV — GET /venues/:venueId/config exposed fraud thresholds to all users (Low-Medium) ✅

- **File:** `backend-api/src/routes/receipts.enhanced.routes.ts` — `GET /venues/:venueId/config`
- **Problem:** The route was protected only by `authenticate`. Any logged-in user could read the per-venue fraud detection config for any venue: auto-approve score threshold, template-matching enabled flag, max-scans-per-day/month, max cashback per scan. Knowing these thresholds is actionable intel for a fraudster calibrating their submissions to stay below detection.
- **Fix:** Added `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` — restricts visibility to business users and admins only.

### Bug AU — PUT /venues/:venueId/config had a TODO instead of an ownership check (High) ✅

- **File:** `backend-api/src/routes/receipts.enhanced.routes.ts` — `PUT /venues/:venueId/config`
- **Problem:** The route had `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` but a `// TODO: Check if user is partner of this venue` comment — the ownership check was never implemented. Any PARTNER could call `PUT /receipts/venues/<competitor_venueId>/config` and modify the fraud detection configuration for a venue they don't own: raise auto-approve score threshold, disable template matching, lower max-cashback-per-scan for competitors.
- **Fix:** Added an ownership guard before calling `updateVenueConfig()`:
  ```ts
  if (req.user!.role === 'PARTNER') {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.venueId },
      select: { userId: true },
    });
    if (!partner || partner.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this venue configuration',
      });
    }
  }
  ```
  ADMINs and SUPER_ADMINs bypass the ownership check and can configure any venue.

---

## Audit Session 23 — Bugs Found and Fixed (payment callback: TOP_UP reversal, transactionId collision)

### Bug AR — failed/cancelled payment callback never reverses an existing wallet TOP_UP (High) ✅

- **File:** `backend-api/src/routes/payments.paysera.routes.ts` — `handlePaymentCallback()`, `else if (result.status === 'failed' || result.status === 'cancelled')` branch
- **Problem:** Paysera can send a `success` callback (status=1 or status=4) that credits the wallet via `walletService.credit()` (`TOP_UP`), and then later send a `cancelled` callback (status=5 = refunded) when the payment is reversed. The `failed/cancelled` branch only marked the `Transaction` record as FAILED/CANCELLED and reversed cashback for linked receipts — it never reversed the `TOP_UP` wallet credit. The user permanently retained the wallet balance from the Paysera-refunded payment.
- **Fix:** Added a TOP_UP reversal step in the `failed/cancelled` branch:
  1. Look for an existing `WalletTransaction` with `type=TOP_UP, transactionId=payment.id`.
  2. If found, debit the same amount with idempotency key `'topup-rev-<payment.id>'` — distinct from the TOP_UP's own key so `@unique` is not violated.
  3. Same wallet-lock fallback as the cashback reversal path for the insufficient-balance case.

---

### Bug AS — cashback reversal ADJUSTMENT and TOP_UP shared the same transactionId, causing a @unique constraint collision (Moderate) ✅

- **File:** `backend-api/src/routes/payments.paysera.routes.ts` — same branch
- **Problem A:** `walletService.credit()` (TOP_UP) and the cashback reversal `walletService.debit()` (ADJUSTMENT) both used `transactionId: transaction.id`. `WalletTransaction.transactionId` has a `@unique` constraint — only one record can hold a given value. If both ran for the same payment (success callback then failure callback on a receipt-linked payment), the second `debit()` would throw a unique constraint violation, causing the cashback reversal to silently fail.
- **Problem B:** The `alreadyCredited` guard in the success branch queried `{ transactionId: transaction.id }` without a type filter. An ADJUSTMENT created by the failure branch (if it ran first, sharing the same `transactionId`) would falsely match, suppressing the TOP_UP credit.
- **Fix (Problem A):** Cashback reversal ADJUSTMENT now uses `transactionId: 'cashback-rev-<payment.id>'` as its idempotency key — guaranteed unique and distinct from the TOP_UP key.
- **Fix (Problem B):** Added `type: WalletTransactionType.TOP_UP` to the `alreadyCredited` guard so it only matches actual TOP_UP credits, not ADJUSTMENT records.

---

## Audit Session 22 — Bugs Found and Fixed (subscription guard, fraud scoring)

### Bug AP — Subscription creation endpoint overwrites ACTIVE user status to PENDING_PAYMENT (Moderate) ✅

- **File:** `backend-api/src/routes/payments.paysera.routes.ts` — `POST /api/payments/subscription`
- **Problem:** The endpoint had no guard for users who already have an `ACTIVE` or `TRIALING` subscription. For an authenticated user who clicks "subscribe" again (accidentally or to switch plans):
  1. A new `INCOMPLETE` subscription record is created.
  2. `prisma.user.update({ status: PENDING_PAYMENT })` unconditionally fires — overwriting their current `ACTIVE` status.
  3. Any feature gated on `user.status === ACTIVE` immediately stops working.
  4. If the new payment completes: `ACTIVE` is restored at callback time.
  5. If the payment fails or is abandoned: the user is stuck as `PENDING_PAYMENT` indefinitely with no automated recovery path.
- **Fix (two parts):**
  - Added an upfront check: if the user already has an `ACTIVE`/`TRIALING` subscription, return 400 `"You already have an active subscription"`. This also prevents duplicate `INCOMPLETE` records from piling up.
  - The `PENDING_PAYMENT` status update is now conditional on `userDetails.status !== PENDING_PAYMENT`, avoiding a redundant write for users who abandoned a previous checkout session.

---

### Bug AQ — checkTimePattern() early return prevents RAPID_SUBMISSIONS + UNUSUAL_TIME from combining (Minor) ✅

- **File:** `backend-api/src/services/fraudDetection.service.ts` — `checkTimePattern()`
- **Problem:** The function checked `RAPID_SUBMISSIONS` first and immediately returned if it triggered. The `UNUSUAL_TIME` check was then skipped entirely. A user submitting many receipts at 3 AM would score 15 points (rapid only) instead of 25 (rapid + unusual hour). The early-return design also meant only one `reason` string was ever pushed per submission — the combined-signal audit trail was impossible.
- **Fix:** Refactored `checkTimePattern()` to return an array of all signals that fire (previously returned a single object). Both checks always run. Updated `checkReceipt()` call site to iterate over the array and accumulate score + reasons for each signal. The maximum time-pattern contribution is now 25 points (up from 15) for the worst-case pattern.

---

## Audit Session 21 — Bugs Found and Fixed (route shadowing, partial refund reversal, receipt deletion)

### Bug AL — GET /analytics shadowed by GET /:id in receipts.enhanced.routes.ts (High) ✅

- **File:** `backend-api/src/routes/receipts.enhanced.routes.ts`
- **Problem:** The `GET /analytics` route was defined at line 377, after the `GET /:id` wildcard at line 213. Express matches routes in definition order. `/:id` is a single-segment wildcard, so it matches `/analytics` before the explicit `/analytics` handler is reached. Any `GET /api/receipts/analytics` request resolves to `receiptService.getReceiptById('analytics', userId)`, returns 404. The user analytics dashboard feature is completely inaccessible.
- **Fix:** Moved `GET /analytics` to before `GET /:id`. Single-segment explicit routes must always appear before wildcard `/:id` or they will never be reached.
- **Pattern:** In Express, wildcard routes (`/:id`) shadow any single-segment routes defined after them. All explicit single-segment routes must precede `/:id` in the file.

---

### Bug AM — createRefund() second partial refund silently skips cashback reversal (Moderate) ✅

- **File:** `backend-api/src/services/payment.service.ts` — `createRefund()`
- **Problem:** The cashback reversal `walletService.debit()` call was passing the payment `transactionId` as the `transactionId` argument. `WalletTransaction.transactionId` has a `@unique` constraint. The first partial refund creates an ADJUSTMENT with `transactionId = payment_tx_id`. For a second partial refund on the same payment:
  1. `stripe.refunds.create()` succeeds (real money returned to user).
  2. `walletService.debit()` fails with a Prisma unique constraint violation.
  3. The constraint error doesn't match `'Insufficient wallet balance'`, so the catch block just logs and continues.
  4. Net result: user gets the Stripe refund money AND keeps the second portion of cashback they shouldn't keep.
- **Fix:** Pass `refund.id` (the Stripe refund ID) as the `transactionId` for the ADJUSTMENT. Each Stripe refund has a unique ID, so:
  - Multiple partial refunds: each creates a separate ADJUSTMENT with a unique `transactionId` ✓
  - Retry of the same refund (same `refund.id`): unique constraint prevents double debit ✓

---

### Bug AN — deleteReceipt() allows deleting APPROVED receipts with zero cashback (Low) ✅

- **File:** `backend-api/src/services/receipt.service.ts` — `deleteReceipt()`
- **Problem:** The deletion guard checked `receipt.cashbackAmount > 0` instead of `receipt.status`. The code comment correctly states "Only allow deletion of PENDING or REJECTED receipts" but the implementation didn't enforce it. An APPROVED receipt with 0 cashback (cap exhaustion at submission time, or zero-value purchase) passed the guard, allowing users to:
  1. Delete approved receipts from the fraud detection history — enabling re-submission of the same receipt.
  2. Corrupt `ReceiptAnalytics.approvedReceipts` counter (was decremented in analytics but never reconciled).
- **Fix:** Replaced the `cashbackAmount > 0` guard with a status check: only `PENDING` or `REJECTED` receipts may be deleted.

---

## Audit Session 20 — Bugs Found and Fixed (subscription callback, legacy cashback route)

### Bug AK — handleSubscriptionCallback() success path has TOCTOU race — duplicate card sync + emails (Moderate) ✅

- **File:** `backend-api/src/routes/payments.paysera.routes.ts` — `handleSubscriptionCallback()`, success branch
- **Problem:** The method used a two-step idempotency pattern:
  1. Pre-check: `if (subscription.status === ACTIVE) return early`
  2. Activation: `prisma.subscription.update(...)` → user update → card sync → emails

  Paysera retries callbacks until it receives "OK". Two concurrent retries can both pass step 1 (both see `status = INCOMPLETE`), then both execute step 2. Each callback independently calls `cardService.syncCardTypeWithSubscription()` and sends the payment confirmation + activation emails. The user receives duplicate emails and the card service is called twice — both calls may win since `syncCardTypeWithSubscription` is not guarded by an idempotency key.

- **Fix:** Replace the pre-check + `update()` with an atomic `updateMany()` that includes a status guard:
  ```ts
  const activationResult = await prisma.subscription.updateMany({
    where: { id: subscription.id, status: { not: SubscriptionStatus.ACTIVE } },
    data: { status: SubscriptionStatus.ACTIVE, metadata: ... },
  });
  if (activationResult.count === 0) {
    logger.info(`Subscription ${subscription.id} already activated — skipping`);
    return res.send(payseraService.generateCallbackResponse());
  }
  // user update, card sync, emails only if count === 1
  ```
  The database serialises the two concurrent `updateMany` calls. Exactly one wins (returns `count = 1`); the other sees `count = 0` and returns early before touching the user record, card service, or email service.

---

### Bug AJ — Legacy applyCashback() route bypasses daily/monthly caps (Low)

- **File:** `backend-api/src/routes/receipts.routes.ts` — `POST /:id/cashback`; `backend-api/src/services/receipt.service.ts` — `applyCashback()`
- **Status:** Documented — no fix applied (route is admin-only; low risk)
- **Problem:** `applyCashback()` is a legacy admin endpoint that credits cashback for a receipt using an amount passed directly in the request body. It performs the `updateMany` atomic claim guard (prevents double-credit) and validates transaction status, but it does **not** call `fraudDetectionService.calculateCashback()`. This means:
  1. The daily and monthly rolling caps added in fix #4 are completely bypassed.
  2. An admin can credit an arbitrary amount — the only upper bound is the request body value.
- **Risk:** Admin-only route; not reachable by end users. Requires deliberate admin action. Accepted risk for now. Future mitigation: deprecate in favour of `reviewReceipt()` which goes through the full cap pipeline.

---

## Audit Session 19 — Bugs Found and Fixed (analytics service, notification service)

### Bug AH — updateAnalyticsOnStatusChange() three-query TOCTOU race on successRate (Moderate) ✅

- **File:** `backend-api/src/services/receiptAnalytics.service.ts` — `updateAnalyticsOnStatusChange()`
- **Problem:** The method used three sequential DB calls:
  1. `prisma.receiptAnalytics.update(...)` — applies counter deltas (`approvedReceipts`, etc.)
  2. `prisma.receiptAnalytics.findUnique(...)` — reads back the updated row
  3. `prisma.receiptAnalytics.update({ data: { successRate: ... } })` — writes the recomputed rate
  
  Between writes 1 and 3, a concurrent `updateAnalyticsOnStatusChange` (another receipt review landing simultaneously) could increment `approvedReceipts` and `totalReceipts`. The `successRate` in write 3 is therefore computed from an intermediate state that doesn't correspond to any single point in time, producing a permanently wrong rate. This fires on every admin receipt review, including bulk approvals.

- **Fix:** Fold `successRate` into the initial delta update — no second DB read needed. `totalReceipts` is never modified by this method, so it's a stable denominator. `newApproved = analytics.approvedReceipts + approvedDelta` gives the correct post-update count without an extra round-trip. The result: a single atomic DB write instead of three, with no TOCTOU window.

### Bug AI — getAdminUsers() silently excludes SUPER_ADMIN from fraud alerts (Minor) ✅

- **File:** `backend-api/src/services/notification.service.ts` — `getAdminUsers()`
- **Problem:** `getAdminUsers()` queried `where: { role: 'ADMIN' }`. All other admin-level logic in the codebase checks both `'ADMIN'` and `'SUPER_ADMIN'` (auth middleware, route guards, etc.). Fraud alert notifications were therefore never delivered to SUPER_ADMIN users — they couldn't receive in-app alerts or fraud alert emails even though their role grants full platform access.
- **Fix:** Changed to `where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } }`.

---

## Audit Session 18 — Bugs Found and Fixed (Paysera cancellation callback)

### Bug AG — Failed/cancelled callback cashback reversal had no explicit idempotency guard (Moderate) ✅

- **File:** `backend-api/src/routes/payments.paysera.routes.ts` — `handlePaymentCallback()`, `else if (result.status === 'failed' || result.status === 'cancelled')` branch
- **Problem:** The success callback has an explicit idempotency guard (`alreadyCredited` check on `WalletTransaction`) that returns early if the wallet credit already occurred. The failed/cancelled branch has no equivalent guard. On a Paysera callback retry (Paysera retries until "OK" is received):
  1. The `prisma.transaction.update` re-stamps the already-FAILED/CANCELLED status (harmless but wasteful).
  2. The cashback reversal path finds the same `CASHBACK_CREDIT` (still `COMPLETED` — the ADJUSTMENT debit does not mark it as CANCELLED) and calls `walletService.debit({ transactionId: transaction.id, ... })` again.
  3. This accidentally fails with a Prisma unique constraint violation because the ADJUSTMENT from the first call already holds `transactionId = transaction.id` (`WalletTransaction.transactionId @unique`).
  4. The constraint violation is caught by the outer `try/catch` and logged as an error — misleading, since the first reversal actually succeeded.
- **Fix:** Add an explicit idempotency guard before the cashback reversal, mirroring the success-path pattern:
  ```ts
  const alreadyReversed = await prisma.walletTransaction.findFirst({
    where: { transactionId: transaction.id, type: WalletTransactionType.ADJUSTMENT },
  });
  if (alreadyReversed) {
    logger.info(`Cashback reversal for ${result.orderId} already processed — skipping`);
    // ... early return or skip
  }
  ```
- **Why this matters:** The constraint-violation path logs a spurious error on every retry, masking real errors. An explicit guard avoids the noise and makes the idempotency intentional rather than accidental.

---

## Audit Session 17 — Bugs Found and Fixed (sticker service)

### Bug AF — uploadReceipt() returned stale VALIDATING status — auto-approval message never shown (Moderate) ✅
- **File:** `backend-api/src/services/sticker.service.ts` — `uploadReceipt()`
- **Problem:** The method set `status = VALIDATING` and captured the result as `updated`, then called either `approveScan()` (which sets APPROVED) or updated to MANUAL_REVIEW — but then returned `updated` (the VALIDATING-state snapshot) instead of the final state. The route handler at `stickers.routes.ts` explicitly branches on `scan.status === 'APPROVED'` to show "Cashback approved! You earned X BGN" — but this branch was permanently unreachable because the returned status was always `VALIDATING`. Every auto-approved sticker scan silently showed "Receipt uploaded successfully." with no cashback confirmation.
- **Fix:** Removed the now-dead `updated` variable and the final `return updated`. Both branches now return the actual final state: `return this.approveScan(scanId)` (returns the APPROVED scan with its includes) or `return prisma.stickerScan.update({ status: MANUAL_REVIEW })` (returns the updated scan). The route handler can now correctly branch on the final status.

---

## Audit Session 16 — Bugs Found and Fixed (receipt analytics)

### Bug AE — updateAnalyticsOnStatusChange() overwrites first block's Prisma operation when old and new statuses map to the same field (Moderate) ✅
- **File:** `backend-api/src/services/receiptAnalytics.service.ts` — `updateAnalyticsOnStatusChange()`
- **Problem:** The method built an `updates` object using two sequential if-else blocks — one for the old status (decrement), one for the new status (increment). When both blocks targeted the same property (e.g., `approvedReceipts`), the second assignment silently overwrote the first. Net result: `{ increment: 1 }` applied instead of no-op. This inflated analytics for every case where old and new statuses share a field:
  - **APPROVED → APPROVED** (admin confirming an auto-approved receipt): `approvedReceipts` and `totalCashback` incremented again, doubling the count.
  - **MANUAL_REVIEW → PENDING** or reverse: `pendingReceipts` incremented instead of holding steady.
  - **REJECTED → REJECTED**: `rejectedReceipts` incremented.
  The APPROVED→APPROVED case is the most impactful — it fires on every admin confirmation of an auto-approved receipt, progressively inflating the analytics dashboard.
- **Fix:** Replaced the two-block object-assignment pattern with a delta approach. Each status contributes `±1` to independent numeric deltas (`approvedDelta`, `rejectedDelta`, `pendingDelta`, `cashbackDelta`). The final `updates` object is built only for non-zero deltas, and an early return skips the DB write entirely for true no-ops (delta = 0 for all fields).

---

## Audit Session 15 — Bugs Found and Fixed (sticker service)

### Bug AC — approveScan() claim used { not: APPROVED } — allowed approving REJECTED/EXPIRED scans (High) ✅
- **File:** `backend-api/src/services/sticker.service.ts` — `approveScan()`
- **Problem:** The pre-check only blocked `status === APPROVED`. The atomic claim used `{ not: APPROVED }`, which matches REJECTED, EXPIRED, SESSION_ACTIVE, etc. So if an admin rejected a scan, then `approveScan` was called (system retry or admin error), the pre-check passed (REJECTED ≠ APPROVED) and the claim won, crediting cashback to a rejected scan. The `updateMany` guard was too wide, defeating its own purpose.
- **Fix:** Added an allowlist: `approvableStatuses = [PENDING, VALIDATING, MANUAL_REVIEW]`. Changed the pre-check to `if (!approvableStatuses.includes(scan.status)) throw`. Changed the claim `where` from `{ not: APPROVED }` to `{ in: approvableStatuses }`. Now REJECTED/EXPIRED scans cannot be approved by any code path.

### Bug AD — rejectScan() used bare update() — allowed rejecting already-APPROVED scans (High) ✅
- **File:** `backend-api/src/services/sticker.service.ts` — `rejectScan()`
- **Problem:** `rejectScan` used `prisma.stickerScan.update` with no status guard. If called on an already-approved scan, it set status to REJECTED even though cashback had already been credited to the user's wallet. The user would have funds in their wallet but their scan would show as rejected — an inconsistent state with no automated recovery path.
- **Fix:** Replaced `update` with `updateMany({ where: { id, status: { not: APPROVED } } })`. If `count === 0`, the scan was already approved — throws `'Scan has already been approved and cannot be rejected'`. Follows up with `findUniqueOrThrow` to return the updated record (required since `updateMany` doesn't return records).

---

## Audit Session 14 — Bugs Found and Fixed (notification service)

### Bug AA — RECEIPT_UNDER_REVIEW is not a valid NotificationType enum value (Critical) ✅
- **File:** `backend-api/src/services/notification.service.ts` — `notifyManualReviewRequired()`
- **Problem:** `createNotification()` was called with `type: 'RECEIPT_UNDER_REVIEW'`. The `NotificationType` enum in the Prisma schema uses `RECEIPT_MANUAL_REVIEW`, not `RECEIPT_UNDER_REVIEW`. PostgreSQL validates enum values at write time, so every call to `notifyManualReviewRequired()` silently threw a Prisma runtime error inside the outer try/catch — no MANUAL_REVIEW notification was ever created for any user. Same silent-failure pattern as Bug N.
- **Fix:** Changed `type: 'RECEIPT_UNDER_REVIEW'` → `type: 'RECEIPT_MANUAL_REVIEW'` to match the schema. No schema change needed — `RECEIPT_MANUAL_REVIEW` was already present.

### Bug AB — FRAUD_ALERT is not a valid NotificationType enum value (Critical) ✅
- **File:** `backend-api/src/services/notification.service.ts` — `notifyFraudAlert()`; `backend-api/prisma/schema.prisma`
- **Problem:** `createNotification()` was called with `type: 'FRAUD_ALERT'`. `FRAUD_ALERT` was not in the `NotificationType` enum. PostgreSQL validation at write time silently threw for every high-fraud-score receipt submission. Admins never received in-app fraud alert notifications, defeating the fraud monitoring system. Same silent-failure pattern as Bugs N and AA.
- **Fix:** Added `FRAUD_ALERT` to the `NotificationType` enum in `schema.prisma`. Ran `prisma db push` (enum value addition) and `prisma generate`.

---

## Audit Session 13 — Bugs Found and Fixed (fraud detection)

### Bug Z — Daily/monthly cashback cap bypass via concurrent auto-approved receipts (High) ✅
- **File:** `backend-api/src/services/fraudDetection.service.ts` — `calculateCashback()` step 5
- **Problem:** The rolling cap check aggregated only `WalletTransaction` records with `type = CASHBACK_CREDIT` and `status = COMPLETED`. Auto-approved receipts (from `submitReceipt`) never create wallet transactions at submission time — the wallet is only credited later when an admin runs `reviewReceipt`. So if a user submitted N receipts in rapid succession and all were auto-approved, each cap check saw `earnedToday = 0` (no wallet transactions yet) and assigned each the full `cashbackAmount`. With 10 receipts/day allowed and `DEFAULT_MAX_CASHBACK_PER_SCAN = 50 BGN`, a user could accumulate 500 BGN/day against a cap of 200 BGN — 2.5× the limit.
- **Fix:** Added two more `prisma.receipt.aggregate()` calls to the `Promise.all` block (inside the existing non-fatal try/catch): one for the daily window, one for the monthly window. Both sum `cashbackAmount` for receipts that are `APPROVED`, `reviewedBy: null` (auto-approved, wallet credit pending), and `cashbackAmount > 0`. The pending totals are added to the wallet-transaction totals before computing `remainingDaily` and `remainingMonthly`, so subsequent submissions correctly see the cashback already promised to earlier auto-approved receipts.

---

## Audit Session 12 — Bugs Found and Fixed (fraud detection)

### Bug Y — getUserStats() computed averagePerDay via 2 extra DB queries but nothing used it (Minor) ✅
- **File:** `backend-api/src/services/fraudDetection.service.ts` — `getUserStats()`
- **Problem:** The method ran `findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })` to find the user's first-ever receipt, then `count({ where: { userId } })` to get their total receipt count — two extra DB round-trips on every single receipt submission — to compute `averagePerDay`. The returned object included `averagePerDay` but not one of the 10 fraud checks in `checkReceipt()` referenced it.
- **Fix:** Removed the `findFirst`, the `count`, and the `averagePerDay` computation entirely. The return type now only exposes `submissionsToday` and `submissionsThisMonth`, both of which are actively used by the rate-limiting checks (checks 1 and 2).

---

## Audit Session 11 — Bugs Found and Fixed (wallet service)

### Bug W — actualExpired computed but never used in expireOldCashback() (Minor) ✅
- **File:** `backend-api/src/services/wallet.service.ts` — `expireOldCashback()`
- **Problem:** Lines 88–90 (introduced in Bug U fix) computed `actualExpired` via `.filter(t => t).reduce(...)` but it was never referenced. The `.filter(t => t)` was also vacuous (no element in the array is ever falsy). Pure dead code.
- **Fix:** Removed the variable entirely. `totalExpired` (computed before the `updateMany`) is used directly, which is correct since partial overlap is structurally impossible (see Bug X).

### Bug X — expired.slice(0, cancelledCount) is wrong for identifying partially-cancelled rows (Moderate) ✅
- **File:** `backend-api/src/services/wallet.service.ts` — `expireOldCashback()`
- **Problem:** The fallback path in Bug U's fix used `expired.slice(0, cancelledCount)` to determine which transactions were cancelled and re-sum their amounts. This assumes `updateMany` processes rows in the same order as the `expired` array — a guarantee that does not exist. If ever reached, it would produce an incorrect `actualTotal` based on wrong rows.
- **However:** This path is structurally unreachable. Both `expireOldCashback` and `expireWallet` operate inside transactions that atomically update all COMPLETED expired rows for a wallet in one `updateMany`. The result is always either `count === 0` (all already done) or `count === expired.length` (we did them all) — never partial.
- **Fix:** Removed the conditional re-sum entirely. `totalExpired` (the full pre-computed sum) is used unconditionally once `count > 0`, which is always correct. Added a comment explaining why partial overlap cannot occur.

---

## Audit Session 10 — Bugs Found and Fixed (wallet service, cashback-expiry job)

### Bug U — expireOldCashback() description and amount used expired.length/totalExpired after status-guard fix (Moderate) ✅
- **File:** `backend-api/src/services/wallet.service.ts` — `expireOldCashback()`
- **Problem:** Bug S added the `updateResult.count === 0` early-return guard, but the ADJUSTMENT description and `totalExpired` still used `expired.length` and the pre-filter sum. In the (rare) partial-overlap case where the nightly job cancelled a subset of rows between the outer `findMany` and the `updateMany`, the wallet decrement and the audit record would both overstate the actual expired amount.
- **Fix:** Captured `cancelledCount = updateResult.count`. When `cancelledCount < expired.length`, the actual total is re-summed from the first `cancelledCount` rows. The description, log line, decrement, and ADJUSTMENT amount all now use the accurate figures.

### Bug V — Dead cancelledIds Set in expireWallet() (Minor) ✅
- **File:** `backend-api/src/jobs/cashback-expiry.ts` — `expireWallet()`
- **Problem:** Bug T introduced a `cancelledIds` Set (lines 69-71) that was never referenced anywhere. Dead code left from an intermediate draft.
- **Fix:** Removed the unused Set; `cancelledCount` and the full `expired` array are sufficient.

---

## Audit Session 9 — Bugs Found and Fixed (wallet service, cashback-expiry job)

### Bug S — expireOldCashback() in wallet.service.ts had no status guard on updateMany (Moderate) ✅
- **File:** `backend-api/src/services/wallet.service.ts` — `expireOldCashback()`
- **Problem:** Bug Q fixed the nightly job's `updateMany` to guard `status: COMPLETED`, but the symmetric fix was never applied to `expireOldCashback()` in `wallet.service.ts`. Its own comment claimed it was "idempotent — transactions already CANCELLED are skipped", which was false. The exact same double-decrement race still existed on the service-side path: if the nightly job ran first, `expireOldCashback()` would re-cancel the already-CANCELLED rows (harmless) but still decrement the wallet balance a second time.
- **Fix:** Added `status: WalletTransactionStatus.COMPLETED` to the `updateMany` where clause and an early return on `updateResult.count === 0`, mirroring the fix applied to the nightly job in Bug Q.

### Bug T — expireWallet() ADJUSTMENT description used pre-filter expired.length (Minor) ✅
- **File:** `backend-api/src/jobs/cashback-expiry.ts` — `expireWallet()`
- **Problem:** After the Bug Q status-guard fix, the ADJUSTMENT record description and the log line still used `expired.length` (the count from the outer `findMany`, before the status filter). In a partial-overlap scenario this would overstate the number of transactions actually cancelled in this run, producing misleading audit trail entries like "Cashback expired (5 transactions)" when only 3 were actually cancelled.
- **Fix:** Capture `cancelledCount = updateResult.count` and use it in both the description string and the log line.

---

## Audit Session 8 — Bugs Found and Fixed (cashback-expiry job, admin summary)

### Bug Q — Cashback expiry job could double-decrement wallet under concurrent payout (Moderate) ✅
- **File:** `backend-api/src/jobs/cashback-expiry.ts` — `expireWallet()`
- **Problem:** The nightly `expireWallet()` and `wallet.service.ts`'s `expireOldCashback()` (called from `requestPayout()`) both follow the same pattern: `findMany` expired COMPLETED transactions → `updateMany` by ID → `wallet.update { decrement }`. Under Neon's `READ COMMITTED` isolation, if both run concurrently on the same wallet, `expireOldCashback` can cancel and decrement first, then the nightly job's `updateMany` (which had no status filter) re-cancels the already-CANCELLED IDs and fires its `wallet.update { decrement }` again — resulting in the wallet balance being decremented twice.
- **Fix:** Added `status: WalletTransactionStatus.COMPLETED` to the `updateMany` where clause. `expireOldCashback` processes all IDs atomically, so `updateResult.count === 0` means the concurrent payout already handled everything — skip both the decrement and the ADJUSTMENT record. If `count > 0`, we did the cancellation and proceed normally.

### Bug R — getSummary() returned filtered results unsorted (Minor) ✅
- **File:** `backend-api/src/services/adminCashback.service.ts` — `getSummary()`
- **Problem:** The `sort` call was only on the unfiltered return path. `GET /summary?status=PENDING` returned results in arbitrary DB/groupBy order rather than alphabetically by partner name.
- **Fix:** Sort into `sorted` first, then filter from the sorted array on both return paths.

---

## Audit Session 7 — Bugs Found and Fixed (admin cashback routes)

### Bug O — GET /summary accepted malformed month param, returned 500 (Moderate) ✅
- **File:** `backend-api/src/routes/adminCashback.routes.ts`
- **Problem:** The `:month/receipts` and `:month/mark-paid` routes validate `YYYY-MM` format, but `GET /summary?month=` did not. A malformed value caused `new Date(NaN, NaN, 1)` inside `getSummary()`, making Prisma throw and returning HTTP 500 instead of a 400 with a clear error message.
- **Fix:** Added `if (month !== undefined && !/^\d{4}-\d{2}$/.test(month))` guard returning 400 before calling the service.

### Bug P — Invalid status query param silently returned all records (Minor) ✅
- **File:** `backend-api/src/routes/adminCashback.routes.ts`
- **Problem:** `status` was cast directly to `'PENDING' | 'PAID' | 'OVERDUE' | undefined` with no runtime check. An unrecognised value like `status=UNKNOWN` passed through to `results.filter(r => r.paymentStatus === 'UNKNOWN')`, returning an empty array with HTTP 200 — wrong behaviour that would confuse callers.
- **Fix:** Added an explicit allowlist check against `['PENDING', 'PAID', 'OVERDUE']` returning 400 for any unrecognised value.

---

## Audit Session 6 — Bugs Found and Fixed (item 10)

### Bug N — STICKER_SCAN_APPROVED missing from NotificationType enum (Critical) ✅
- **Files:** `backend-api/prisma/schema.prisma`, `backend-api/src/services/notification.service.ts`
- **Problem:** `notifyStickerScanApproved()` (added in item #10) writes `type: 'STICKER_SCAN_APPROVED'` to the notifications table, but `STICKER_SCAN_APPROVED` was never added to the `NotificationType` enum in the Prisma schema. PostgreSQL validates enum values at write time — every call to `notifyStickerScanApproved()` threw a Prisma runtime error inside the outer `try/catch`, so the in-app notification was silently dropped on every sticker scan approval. The `as any` cast in `createNotification()` suppressed the TypeScript error, masking the problem entirely.
- **Fix:** Added `STICKER_SCAN_APPROVED` to the `NotificationType` enum in `schema.prisma`. Ran `prisma db push` to update the PostgreSQL enum and `prisma generate` to regenerate the client.

---

## Audit Session 5 — Bugs Found and Fixed (item 9)

### Bug M — createCashbackRates() accepted partial snapshots (Moderate) ✅
- **Files:** `backend-api/src/services/adminCashback.service.ts`, `backend-api/src/routes/adminCashback.routes.ts`
- **Problem:** The docstring stated "must cover all 6 steps" but nothing validated this. An admin could POST only 3 steps; `getCurrentRates()` would return 3 DB rows and 3 hardcoded-fallback rows — a mixed effective rate set where it's impossible to reason about what's actually active, defeating the purpose of a versioned snapshot.
- **Fix:** After the per-row validation loop, compute `missingSteps = allowedSteps − seenSteps`. If non-empty, throw `"Missing discount steps: X, Y. All 6 steps must be provided..."` before any `createMany`. Added `'Missing discount steps'` to the route's validation-error pattern list so it correctly returns HTTP 400.

### Cosmetic — Duplicate JSDoc block on rejectReceipt() ✅
- **File:** `backend-api/src/jobs/manual-review-expiry.ts`
- **Problem:** When the function return type was changed from `void` to `boolean`, the new JSDoc was added above the old one instead of replacing it, leaving two stacked JSDoc blocks.
- **Fix:** Merged into a single accurate comment describing the status-guard behaviour and the boolean return value.

---

## Audit Session 4 — Bugs Found and Fixed (items 9, 12)

### Bug K — POST /rates returned HTTP 500 for all but one validation error (Moderate) ✅
- **File:** `backend-api/src/routes/adminCashback.routes.ts` — `POST /rates` catch block
- **Problem:** The route used `error.message?.includes('Invalid')` to decide between 400 and 500. The service throws four distinct validation errors — type mismatch (`"must all be numbers"`), duplicate step (`"Duplicate discountStep"`), out-of-range (`"must be between 0 and 100"`), and invalid step (`"Invalid discount step"`). Only the last contained the word "Invalid", so the other three were returned as HTTP 500.
- **Fix:** Expanded the check to pattern-match all four validation message fragments: `'Invalid'`, `'Duplicate'`, `'must all be numbers'`, `'must be between'`.

### Bug L — Expiry job `rejected` counter included admin-preempted receipts (Minor) ✅
- **File:** `backend-api/src/jobs/manual-review-expiry.ts`
- **Problem:** `rejectReceipt()` returned `void` regardless of whether `updateMany` changed 0 or 1 row. The outer loop incremented `rejected` for every `fulfilled` promise, so the log line "auto-rejected N receipt(s)" overcounted whenever an admin acted on a receipt between the `findMany` and its `updateMany`.
- **Fix:** Changed `rejectReceipt()` to return `boolean` (`true` = actually rejected, `false` = already actioned). The outer loop now increments `rejected` only when `result.value === true`.

---

## Audit Session 3 — Bugs Found and Fixed (items 9, 11, 12)

### Bug H — Race condition: job overwrote admin decisions in rejectReceipt() (Critical) ✅
- **File:** `backend-api/src/jobs/manual-review-expiry.ts`
- **Problem:** `rejectReceipt()` used `prisma.receipt.update()` with no status guard. If an admin approved or rejected a receipt between the job's outer `findMany` and the per-receipt `update`, the admin decision was silently overwritten and the receipt left REJECTED.
- **Fix:** Replaced `update` with `updateMany({ where: { id, status: 'MANUAL_REVIEW' } })`. If `result.count === 0` the receipt was already actioned — no status change occurs and notification is skipped.

### Bug I — checkPerceptualDuplicate excluded MANUAL_REVIEW receipts (Moderate) ✅
- **File:** `backend-api/src/services/fraudDetection.service.ts` — `checkPerceptualDuplicate()`
- **Problem:** The query filtered `status: 'APPROVED'`, inconsistent with `checkDuplicate()` (SHA-256) which has no status filter. A fraudster could submit a slightly-modified image of a receipt already in MANUAL_REVIEW; the second submission would bypass the perceptual hash check because the first wasn't yet APPROVED.
- **Fix:** Changed filter to `status: { in: ['APPROVED', 'MANUAL_REVIEW'] }`, matching the all-statuses behaviour of the SHA-256 check.

### Bug J — Redundant findUnique per receipt in the expiry job (Minor) ✅
- **File:** `backend-api/src/jobs/manual-review-expiry.ts`
- **Problem:** The outer `findMany` selected only `{ id }`, then `rejectReceipt()` did a separate `findUnique` inside each call to fetch `userId` and `merchantName` for the notification — N extra DB round-trips for N receipts.
- **Fix:** Added `userId` and `merchantName` to the outer `findMany` select and updated `rejectReceipt()` to accept the full object, eliminating the inner lookup.

---

## Audit Session 2 — Bugs Found and Fixed (items 9, 11, 12)

### Bug D — Duplicate discountStep allowed in createCashbackRates() (Moderate) ✅
- **File:** `adminCashback.service.ts` — `createCashbackRates()`
- **Problem:** Nothing prevented an admin from submitting two rows with the same `discountStep` in one call. Both would be inserted with the same `effectiveFrom`, making the effective rate for that step non-deterministic (DB row order decides which `findFirst` returns).
- **Fix:** Added a `seenSteps: Set<number>` accumulator inside the validation loop. If a step appears more than once, an error is thrown before any DB writes occur.

### Bug E — No numeric type validation in createCashbackRates() (Moderate) ✅
- **File:** `adminCashback.service.ts` — `createCashbackRates()`
- **Problem:** JS coercion allowed string values like `"10"` to pass the `< 0 || > 100` guard, causing a Prisma runtime error (500) instead of a clean 400 validation error.
- **Fix:** Added explicit `typeof` checks (`typeof r.discountStep !== 'number'` etc.) before the range guards.

### Bug F — calculateCashback() loaded all rate rows instead of just the needed step (Minor) ✅
- **File:** `fraudDetection.service.ts` — `calculateCashback()`
- **Problem:** The DB lookup used `findMany` with no `discountStep` filter, loading every historical rate row across all steps, building a full map, then discarding all entries except one.
- **Fix:** Replaced with `findFirst({ where: { discountStep: step, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: 'desc' } })` — a single targeted query.

### Bug G — manual-review-expiry job silently rejected receipts without notifying users (High) ✅
- **File:** `backend-api/src/jobs/manual-review-expiry.ts`
- **Problem:** The job set `status = REJECTED` but never created a `Notification` record. Users would have their receipt silently disappear from MANUAL_REVIEW with no explanation, unlike admin rejections which call `notifyReceiptRejected()`.
- **Fix:** In `rejectReceipt()`, after the `receipt.update`, a `notification.create` is called (non-fatal, errors are caught and logged) with type `RECEIPT_REJECTED`, a user-friendly message explaining the 30-day expiry, and `data` containing the `receiptId` and `reason` for client-side routing.

---

## Audit Session — Bugs Found and Fixed

The following bugs were found during a self-audit of the initial implementation:

### Bug A — Transaction status guard placed after the admin claim (Critical) ✅
- **File:** `receipt.service.ts` — `reviewReceipt()`
- **Problem:** The `linkedTx.status !== 'COMPLETED'` guard was placed after `claimResult.updateMany()`. If it threw, the receipt was permanently `APPROVED` with `cashbackAmount > 0` but no wallet credit. Because `reviewedBy` was already stamped, the receipt could never be re-reviewed.
- **Fix:** Moved the guard **before** `claimResult.updateMany()`. The check now happens on data from the initial `receipt.findUnique()` (all scalar fields included by default) with no extra DB query.

### Bug B — Prisma enum values not imported in fraudDetection (Moderate) ✅
- **File:** `fraudDetection.service.ts` — `calculateCashback()`
- **Problem:** Rolling-cap aggregate queries used raw string literals `'CASHBACK_CREDIT' as any` and `'COMPLETED' as any` — not type-safe.
- **Fix:** Added `import { WalletTransactionType, WalletTransactionStatus } from '@prisma/client'` and replaced the literals with proper enum references.

### Bug C — Duplicate-image penalty inflated recomputed fraud score (Moderate) ✅
- **File:** `fraudDetection.service.ts` / `receipt.service.ts` — `reviewReceipt()`
- **Problem:** `checkReceipt()` always runs `checkDuplicate()` (40 pts). When called for an existing approved receipt (admin correction flow), it found the receipt's own hash in the DB and added 40 points every time, making the recomputed score wrong.
- **Fix:** Added optional `excludeReceiptId` to `FraudCheckParams`. `checkDuplicate()` accepts an optional second argument and appends `id: { not: excludeReceiptId }` to its query. `reviewReceipt()` passes `excludeReceiptId: params.receiptId`.

---

## What's Working Well

- Race conditions on double-credit are guarded with atomic `updateMany` + rollback in both receipt and sticker scan flows.
- Payout failure properly reverses the wallet debit atomically.
- 60-day cashback expiry is tracked per `WalletTransaction` and enforced (now via nightly cron).
- Fraud detection runs 10+ signal checks before auto-approval.
- Sticker scan session expiry (6 AM cutoff) is enforced.
- Negative amount protection exists in both `credit()` and `debit()`.
- Cashback expiry in `requestPayout()` ensures balance accuracy before payouts.
- All cashback reversals (refund + cancellation) now lock the wallet when the user has insufficient balance, preventing payout of irrecoverable cashback debt.
