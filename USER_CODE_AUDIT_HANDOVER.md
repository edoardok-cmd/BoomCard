# BC-USER-CODE-AUDIT — Handover Note

**Completed:** 2026-06-02  
**Task:** BC-USER-CODE-AUDIT (re-audit.md workflow)  
**Spec reference:** `/Users/administrator/Documents/BoomCard/docs/specs/08-user-spec-extracted.md`  
**Review files:** `/Users/administrator/Documents/AI Projects/Agent X/.claude/reviews/BC-USER-CODE-AUDIT-audit-r1-impl-r1.md` (approve), `BC-USER-CODE-AUDIT-audit-r1-task-r1.md` (approve)

---

## What was audited

**Backend (fully clean):**
- User account lifecycle (auth.routes.ts, auth.service.ts, auth.middleware.ts)
- Subscription & plans (subscriptions.routes.ts, subscription.service.ts, payments.routes.ts, payment.service.ts, plans.routes.ts)
- Cashback lifecycle (cashbackLifecycle.service.ts)
- Wallet & payout (wallet.routes.ts, wallet.service.ts)
- Cards (cards.routes.ts, card.service.ts)
- QR scanning (stickers.routes.ts, sticker.service.ts)
- Receipts & OCR (receipts.routes.ts, receipts.enhanced.routes.ts, receipt.service.ts)
- Notifications (notification.service.ts, payments.paysera.routes.ts)
- Venues (venue.service.ts, venues.routes.ts)
- Offers (offers.service.ts)
- Reviews (reviews.routes.ts, reviews.service.ts)
- Help tickets (help.routes.ts)
- Fraud detection (fraudDetection.service.ts)
- Risk scoring (userRisk.service.ts, userActivity.service.ts)
- Permissions (permission.service.ts)
- Misc: dashboard.routes.ts, favorites.routes.ts, loyalty.routes.ts, help.routes.ts, mobileConfig.routes.ts

**Schema (fully clean):**
- Prisma schema.prisma — all user-domain models and enums
- Migrations: 20260602200000_bc_user_code_audit_fixes, 20260602300000_review_vote_model (both applied)

---

## Critical issues found and fixed

### User account status gate (CRITICAL)
- `sticker.service.ts` — `assertSubscriptionAllowsScanning()` had no `user.status` check. An INACTIVE/ARCHIVED user with an active subscription could scan QR codes and earn cashback. Fixed: user.status gate now fires BEFORE subscription check (spec §1.3).
- Same root cause affected receipt scanning (fixed identically).
- TRIALING subscriptions were incorrectly blocked from scanning (added to allowed statuses).

### Auth security (CRITICAL/HIGH)
- `auth.service.ts` — `exportUserData()` used a broad `include` exposing `totpSecret`, `passwordResetToken`, `emailVerificationToken`, `riskScore`, `riskBucket`, `stripeCustomerId`, and others. Fixed: explicit `select` returns only user-visible fields per spec §1.1.
- `forgotPassword()` silently skipped ARCHIVED users, making spec §14 reactivation path dead. Fixed: ARCHIVED users now receive the OTP reset email.
- Password-reset suspension rate-limit was gated on ADMIN/SUPER_ADMIN only; fixed to apply to all roles.
- `/change-email/verify` had no rate limiting; added `authRateLimiter`.
- `auth.middleware.ts` — per-request `user.status` check added for USER/PARTNER roles (blocks ARCHIVED/DELETED/PENDING_* on every request within 24h JWT lifetime).

### Fraud fields leaking to users (HIGH)
- `stickers.routes.ts` — POST /scan response included `fraudScore`, `fraudReasons`, `specRiskLevel`, `ipAddress`, `deviceFingerprint`, etc. Fixed: explicit strip via destructuring.
- POST /scan response message was conditional on `fraudScore < 10`, leaking fraud routing. Fixed: single unconditional message.
- POST /scan/:scanId/receipt response also leaked fraud fields. Fixed.
- `receipt.service.ts` — `submitReceipt()` (dead-code path) returned `riskLevel` and `flagsTriggered`. Fixed: removed from return.
- `sticker.service.ts` — `getScansByVenue` leaked fraud fields to partners. Fixed: explicit select.

### Cashback lifecycle (HIGH/MEDIUM)
- `sticker.service.ts:resolveCashbackTier()` — type guard checked `plan === 'PREMIUM'` which never matched DB value `'PREMIUM_MONTHLY'` after the K2 rename. All PREMIUM_MONTHLY subscribers earned 0% cashback. Fixed.
- `receipt.service.ts:resolveCashbackTier()` — same bug. Fixed.
- `fraudDetection.service.ts:calculateCashback()` — same `'PREMIUM'` type check. Fixed.
- `cashbackLifecycle.service.ts:expireStalePendingCashback()` — disabled with throw per spec §5 (Pending cashback never expires). Dead code removed.
- Trial-period cashback on manual-review path created PENDING (not TRIAL_PENDING). Fixed.

### Wallet (HIGH/MEDIUM)
- `wallet.service.ts:getBalance()` — `pendingBalance` was always 0 (field read from DB, never written). Fixed: computed from PENDING + TRIAL_PENDING aggregate.
- `getBalance()` — `expiringBalance` (CLEARED entries within 7 days of expiry) was missing. Added.
- `canRequestPayout` had no IBAN check. Fixed: returns false when `payoutIban` is missing.
- `requestPayout()` — IBAN gate was at the wrong place (blocked opts.iban callers). Fixed: gate now uses merged value.
- `requestPayout()` — `lockedAt` not set on cashback entries. Fixed.
- `requestPayout()` — `payoutIbanSnapshot` not captured on WITHDRAWAL transaction. Fixed.

### Subscriptions (MEDIUM)
- `getPlanBenefits('PREMIUM_WEEKLY')` returned 0/empty because DB planCode is 'LIGHT'. Fixed: mapping `PREMIUM_WEEKLY → 'LIGHT'`, `PREMIUM_MONTHLY → 'PREMIUM'` in DB lookup.
- `/api/subscriptions/current` fabricated `{ plan: 'PREMIUM_WEEKLY', status: 'ACTIVE' }` for users with no subscription. Fixed: returns `{ hasSubscription: false }`.
- `PRICE_IDS` map used key `PREMIUM` (now `PREMIUM_MONTHLY` post-rename). Fixed system-wide (13 files).

### Notifications (HIGH)
- Paysera subscription success callback called `notifyPaymentFailed()` (wrong method). Fixed.
- Paysera subscription success/failure and wallet top-up callbacks fired only email, no in-app notification. Fixed: `notifyPaymentSuccess()`/`notifyPaymentFailed()` now called on all payment events.
- `notifyPaymentSuccess()` method added to notification.service.ts.

### Venues & Offers (MEDIUM)
- `venue.service.ts` — 6 public query methods did not filter by `venueStatus='ACTIVE'`. Fixed (all 6 including `getVenuesByCity`, `getCities`, `getVenueById`).
- `offers.service.ts` — `getOfferById()` returned non-ACTIVE/expired offers to non-admins. Fixed.

### Reviews (HIGH)
- `reviews.routes.ts` — GET /api/reviews allowed `?status=PENDING` to return non-APPROVED reviews. Fixed: status forced to APPROVED for public callers.
- PATCH /reviews/:id/helpful — no per-user deduplication, self-voting allowed, userId never passed. Fixed: ReviewVote model added, per-user dedup, self-vote blocked.
- `reviews.service.ts` — `getReviewById()` returned any review regardless of status. Fixed: `status: ReviewStatus.APPROVED` added to where clause.

### Help tickets (MEDIUM)
- `USER_REQUEST_TYPES` missing 'CHANGE' (spec §12.2). Added.
- Reply endpoint did not block CANCELLED tickets. Fixed.
- Admin identity (`assignee` firstName/lastName/id) returned in user-facing GET /tickets endpoints. Fixed: stripped per spec §13.3.
- Plus-addressing live despite spec §16 deferral. Gated behind `ENABLE_PLUS_ADDRESS_ROUTING` env flag.

### Schema fixes (HIGH)
Migration `20260602200000_bc_user_code_audit_fixes`:
- `UserStatus.SUSPENDED` removed → use `INACTIVE`
- `SubscriptionPlan.PREMIUM` renamed to `PREMIUM_MONTHLY`
- `User.firstName`, `lastName`, `phone` made NOT NULL
- `@@unique([email, role])` → `@@unique([email])` — one email per platform
- `WalletTransaction.lockedAt DateTime?` added
- `WalletTransaction.payoutIbanSnapshot String?` added
- `User.address String?` added (spec §1.1)
- `Receipt.stickerScanId String?` FK added
- `CashbackEntryStatus.TRIAL_PENDING` added (matches admin audit migration)

Migration `20260602300000_review_vote_model`:
- `ReviewVote` model added for per-user vote deduplication

---

## Schema escalations (all applied)

All schema changes from BC-USER-CODE-AUDIT are in migration `20260602200000_bc_user_code_audit_fixes` and `20260602300000_review_vote_model`, both applied to the Neon DB.

The `firstName`, `lastName`, `phone` NOT NULL constraint backfills existing null rows with `''` (empty string). Any existing PARTNER users created without phone (via bulkImport) needed `phone: ''` added to create calls — fixed in `bulkImport.service.ts`.

---

## Deferred / out of scope

- Mobile app screens (`boomcard-mobile/src/screens`) — not audited in this task; separate frontend audit needed.
- BGN/EUR dual-currency display (spec §17) — implementation deferred per spec §16.
- `LoyaltyAccount`/`LoyaltyTransaction` models — deferred features per spec §16, schema comments added.
- Nearby venues API (`/api/venues/nearby`) — live but deferred per spec §16; not removed as it may be needed for internal testing.
