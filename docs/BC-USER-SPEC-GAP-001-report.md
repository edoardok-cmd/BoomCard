# BC-USER-SPEC-GAP-001 Gap Report

**Date:** 2026-06-03  
**Auditor:** QA Agent (claude-sonnet-4-6)  
**Scope:** User-facing backend — spec vs code gap audit  
**Spec ref:** `/Users/administrator/Documents/BoomCard/docs/specs/08-user-spec-extracted.md`

---

## Summary

- **Total findings:** 22 (**Resolved: 21** | **Open: 1**)
- **Full breakdown (all 22) by severity:** CRITICAL 3 | HIGH 5 | MEDIUM 8 | LOW 6
- **Full breakdown (all 22) by type:** GAP 7 | DIVERGENCE 6 | PARTIAL 9
- **Open by severity:** CRITICAL 0 | HIGH 0 | MEDIUM 1 | LOW 0
- **Open by type:** GAP 1 | DIVERGENCE 0 | PARTIAL 0
- **Open finding IDs:** F-005 (MEDIUM, GAP)

> The single remaining OPEN finding (F-005) is **approved for implementation** per the 2026-06-04 product decisions — a backend code task to enforce the spec §2 registration sequence is queued (it is not sign-off-blocked, just not yet built). The 21 RESOLVED findings include F-004 and F-010, both **closed by the 2026-06-04 product decisions** (spec amended — see revision note), plus the 19 already-remediated findings carrying `// F-0XX fix` comments at the fixing call sites.

> **Revision note (2026-06-04, product decisions on the 3 open deviations):** The product owner reviewed the three open deviations and signed off, amending the spec (`docs/specs/08-user-spec-extracted.md`) accordingly:
> - **F-004 → RESOLVED (product sign-off):** The "visible-as-Pending, not-yet-spendable" treatment of trial cashback is the **approved** interpretation of §2.1 — trial cashback IS visible (in `pendingBalance` / "In Review"), and is intentionally excluded from spendable `availableBalance` until the 24h trial-refund window closes (to prevent withdraw-then-refund clawback). Spec §2.1 amended with a signed-off product-decision note. No code change required.
> - **F-010 → RESOLVED (spec amended):** Spec §9.4/§9.5/§4.3 amended — **only High-risk submissions show "In Review"; Low and Medium auto-process.** The fast-path that creates Low-risk cashback directly as CLEARED is now spec-compliant, closing the original divergence. **Code follow-up (new task):** `requiresManualReview` must be narrowed to `riskLevel === 'High'` so Medium also auto-processes (currently Medium still routes to manual review) — tracked as backend task `BC-USER-SPEC-FIX-010-CODE`.
> - **F-005 → OPEN, approved for implementation:** Product confirmed the spec §2 sequence (payment → subscription Active → full access) should be enforced. This is a breaking change to the registration/client token contract; tracked as backend task `BC-USER-SPEC-FIX-005-CODE`. Remains OPEN until that code lands.
>
> **Revision note (2026-06-04, reconciliation refresh — earlier this day):** Re-verified every finding F-001…F-022 against the current backend HEAD (`http://localhost:3025`, source under `backend-api/src/` + `prisma/schema.prisma`). **19 of 22 findings have been remediated in code since the report was authored** and are now marked **RESOLVED** with the fixing `file:line`: F-001, F-002, F-003, F-006, F-007, F-008, F-009, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-018, F-019, F-020, F-021, F-022. The 3 still-OPEN findings are F-004, F-005, F-010 (all product-sign-off deviations). **B2 fix:** F-008 severity cross-reference contradiction resolved — body header now reads **LOW** (matching the consolidated table and the §19 rule-7 classification; the free-text-vs-category gap is a low-impact data-integrity enforcement concern), so body, table, and Summary counts all agree at LOW. F-008's underlying concern is itself now RESOLVED (a `VOID_REASON_CATEGORIES` controlled vocabulary is enforced in `cashbackLifecycle.service.ts`). Verified `POST /api/wallet/payout` is gone via source (`wallet.routes.ts` has no `router.post('/payout')`) and runtime (no 200 response).
>
> **Prior revision note (2026-06-03):** F-002 severity corrected to MEDIUM and description rewritten to accurately reflect the actual gaps (no spec support for a "login-blocking" suspension — `INACTIVE` is the valid status per the enum). Former F-012 (wallet.balance schema concern) removed as a false positive — `wallet.balance` being a DB-level total is not a spec violation; the user-facing API already returns `availableBalance` and `pendingBalance` separately. Remaining findings renumbered accordingly. The §3.2/§3.4 retry-endpoint concern and the §9.0 receipt-upload concern were demoted to informational (no gap found). F-011 severity upgraded to CRITICAL.

---

## Findings by Spec Section

---

### Section 1 — User Account Entity — Fields and Status Lifecycle

**F-001**
- **Severity:** HIGH
- **Type:** PARTIAL
- **File:line:** `src/middleware/auth.middleware.ts:90`
- **Spec rule (§1.2):** Inactive user status allows login but blocks scanning. Archived status blocks login entirely. No forward transitions from Archived for operational purposes.
- **Finding:** The authenticate middleware checks `ARCHIVED | DELETED | PENDING_VERIFICATION | PENDING_PAYMENT` and returns 401. However `INACTIVE` users are not blocked at login time (correct), but the middleware does not enforce the "no operational access" semantics for ARCHIVED at a token-fresh-read level — it only checks at JWT decode time (status read from DB). The real issue: when an admin changes a USER's status to `INACTIVE`, the next auth middleware call will NOT block the token (only ARCHIVED/DELETED/PENDING_VERIFICATION are blocked). An INACTIVE user can still call any API endpoint — the scanning block is delegated solely to `assertSubscriptionAllowsScanning` in `sticker.service.ts`. Other endpoints (e.g. receipt history, wallet balance) do not check `INACTIVE` status at the middleware layer; the spec §13.1 requires Inactive users to retain read access which is correct, but there is no enforcement that write-operational paths (payout requests, non-scan write endpoints) are restricted.
- **Impact:** Minor — scanning is gated; payout `requestPayout` does not check `user_account_status == INACTIVE` directly (only subscription status is checked). An INACTIVE user could theoretically request a payout.
- **Status:** RESOLVED (fix: `src/services/wallet.service.ts:516-528` — `requestPayout()` now reads `user.status` and throws `ACCOUNT_INACTIVE` (403) for INACTIVE users, with explicit `// F-001` comment; complemented by F-002's write-path block on `PUT /payout-account`, 2026-06-04)

---

**F-002**
- **Severity:** MEDIUM
- **Type:** PARTIAL
- **File:line:** `src/services/auth.service.ts:1616`
- **Spec rule (§1.4 + §19 rule 12):** At 5 password reset attempts in 24h the account is suspended pending Super Admin review.
- **Finding:** The code correctly suspends the account by setting `status: 'INACTIVE'` (line 1616 in auth.service.ts), which is a valid choice: the user status enum is `Active | Inactive | Archived` and `INACTIVE` blocks scanning per spec §1.2, is reversible (appropriate for a pending-review state), and `ARCHIVED` (the only terminal status) is not appropriate for a temporary suspension pending Super Admin action. Two genuine gaps remain:
  1. **No in-app notification to Super Admins when the suspension fires.** Only an email path is present; there is no `notifySuperAdmin` or equivalent in-app/push notification triggered at the moment of suspension.
  2. **INACTIVE users are not blocked from non-scan write endpoints.** Wallet operations (payout requests), profile changes, and other write paths do not check `user_account_status == INACTIVE`. Scanning is correctly gated via `assertSubscriptionAllowsScanning`, but a suspended user can still submit payout requests or modify profile data.
- **Note:** Do not prescribe using a "login-blocking" status for this suspension — `ARCHIVED` is terminal with no forward transitions and is the reactivation path per spec §14, not the suspension path. `INACTIVE` is the correct and only defensible choice here.
- **Status:** RESOLVED (fix: both gaps closed — sub-item 1 in-app Super Admin notification at `src/services/auth.service.ts:1672-1683` (`notifyAdminOps`, `// F-002` comment); sub-item 2 INACTIVE write-path block at `src/routes/wallet.routes.ts:85-95` on `PUT /payout-account` and at `src/services/wallet.service.ts:516-528` on `requestPayout`, 2026-06-04)

---

**F-003**
- **Severity:** LOW
- **Type:** PARTIAL
- **File:line:** `prisma/schema.prisma:37` (`User.iban` legacy field) — `riskBucket`/`riskScore` at `prisma/schema.prisma:46-47`
- **Spec rule (§1.1):** Risk profile is internal-only; not visible to user.
- **Finding:** `riskBucket` and `riskScore` exist on the User schema. The field is present. The `receiptService.getReceipts()` has an `includeInternal` guard to strip internal fields. However the `getUserById()` in `auth.service.ts` does not select `riskBucket`/`riskScore` so they are not leaked to the user. Clean — no gap for this specific concern, but the IBAN field (`iban: String?`) is included in `exportUserData()` but the primary wallet IBAN (stored on `Wallet.payoutIban`) is only accessible via wallet routes — the schema-level `User.iban` appears to be a legacy/redundant field that may not be kept in sync. Low severity.
- **Status:** RESOLVED (fix: `prisma/schema.prisma:37` — `User.iban` is now explicitly marked `/// F-003: @deprecated` with a doc comment directing all payout and GDPR-export operations to `Wallet.payoutIban` as the authoritative source, closing the sync-ambiguity concern, 2026-06-04)

---

### Section 2 — Registration Flow and Trial Period

**F-004**
- **Severity:** HIGH
- **Type:** DIVERGENCE
- **File:line:** `src/services/wallet.service.ts:190-235` (TRIAL_PENDING credit path + `// F-004 DEVIATION NOTICE` at ~190)
- **Spec rule (§2.1):** All Pending cashback from the trial period is visible to the user. The spec explicitly states: "Any implementation that introduces a hidden intermediate state for trial-period cashback (holding records away from the user balance until the trial window closes) is a departure from the source spec."
- **Finding:** The code introduces exactly this prohibited intermediate state. When a user is within their 24-hour trial refund window (`trialRefundEligibleUntil > now && trialRefundUsed == false`), cashback credits are stored as `WalletTransactionStatus.TRIAL_PENDING` and only `balance` is incremented — `availableBalance` is NOT incremented. The `getBalance()` method aggregates `TRIAL_PENDING` in `computedPendingBalance`. This means trial cashback shows as "pending" in the balance display, not as the "Available" state the spec requires for display to users. The spec says all Pending cashback — including trial — should be visible as "In Review / Pending verification" (not hidden), which the code approximates, but the balance computation keeps trial cashback out of `availableBalance` during the trial window, which is the implementation the spec says "requires explicit product sign-off before implementation."
- **Status:** RESOLVED (product sign-off, 2026-06-04) — The product owner signed off on the current behaviour as the **approved** interpretation of §2.1. Trial cashback IS visible to the user (aggregated into `pendingBalance` and shown as "In Review / Pending verification"), so there is no *hidden* intermediate state. It is intentionally excluded from spendable `availableBalance` until the 24h trial-refund window closes, because a trial refund within that window voids this exact cashback (`voidTrialPendingCashback`, `wallet.service.ts:437-489`); counting it as spendable would allow withdraw-then-refund clawback driving the wallet negative. Spec §2.1 amended with the signed-off product-decision note (`docs/specs/08-user-spec-extracted.md`). No code change required; the `// F-004 DEVIATION NOTICE` comment should be updated to reference the sign-off.

---

**F-005**
- **Severity:** MEDIUM
- **Type:** GAP
- **File:line:** No file — not implemented
- **Spec rule (§2, step 3):** Payment processed via card → Subscription becomes Active on successful charge → user immediately ready to scan.
- **Finding:** The registration flow for USER accounts (POST /api/auth/register) creates the user with `status: PENDING_VERIFICATION` and does NOT set up a subscription. The subscription purchase is handled separately. There is no enforced sequence that prevents a user from scanning before payment (the `assertSubscriptionAllowsScanning` would throw for missing subscription, but the registration endpoint issues JWT tokens immediately upon account creation, allowing a logged-in user to attempt scanning before any subscription purchase). This is an architectural divergence from spec §2 step order, which says subscription/payment must precede profile creation.
- **Status:** OPEN — approved for implementation (product decision, 2026-06-04). The product owner confirmed the spec §2 sequence (payment → subscription Active → full access) should be enforced. The code currently issues JWT tokens immediately on account creation (`src/services/auth.service.ts:419-422`, `// F-005 ARCHITECTURAL NOTICE`) before any subscription/payment. This is a breaking change to the registration/client token contract and requires a deliberate flow redesign — tracked as backend task `BC-USER-SPEC-FIX-005-CODE`. Remains OPEN until that code lands. Scanning itself stays gated by `assertSubscriptionAllowsScanning` (no cashback without an active subscription), so the current user-facing risk is limited to step ordering.

---

### Section 3 — Subscription Plans and Status Lifecycle

**F-006**
- **Severity:** MEDIUM
- **Type:** PARTIAL
- **File:line:** `src/routes/subscriptions.routes.ts:113-150`
- **Spec rule (§3.5):** The Subscription and Payments screen must show: current plan name, subscription_status, next renewal or expiry date, auto-renewal toggle, current card on file (masked card number), payment history.
- **Finding:** The `/subscriptions/current` endpoint returns subscription data and a payment method (brand/last4/expiryMonth/expiryYear). Previously, for Paysera-based subscriptions (`!stripeSubscriptionId`), `paymentMethod` was always null (only `SavedPaymentMethod`, a Stripe-only table, was queried). Paysera subscribers could not see their payment method via this endpoint. This was a PARTIAL implementation of §3.5.
- **Status:** RESOLVED (fix: `src/routes/subscriptions.routes.ts:113-146` — `// F-006` branch now handles both paths: Stripe subscribers read from `SavedPaymentMethod` (with default→first-card fallback), and Paysera subscribers receive a non-null placeholder `{ provider: 'paysera', maskedAccount: '****'+last4 of Wallet.payoutIban }` so the client always has something to display, 2026-06-04)

---

**Informational — §3.2/§3.4 (no gap found)**

- **Spec rule (§3.2 + §3.4):** Failed Payment: one-time attempt; no retry period. Blocks scanning immediately.
- **Note:** The `subscriptionService.retryPayment()` endpoint exists at `POST /api/subscriptions/:id/retry-payment`. The spec §3.4 "no retry period" refers to *automatic* system retries — not user-manual retries. A user-initiated retry endpoint (to fix payment method) is spec-consistent. No gap.

---

**F-007**
- **Severity:** HIGH
- **Type:** DIVERGENCE
- **File:line:** `src/routes/dashboard.routes.ts:45`
- **Spec rule (§3.5.1):** Dashboard upsell block shown for Basic and Premium Weekly subscribers. Premium Monthly subscribers should NOT see the upsell.
- **Finding:** The dashboard logic for `isPremiumWeekly` is incorrect:
  ```typescript
  const isPremiumWeekly = resolvedSubscription?.plan === 'PREMIUM_MONTHLY' && billingPeriod.includes('week');
  ```
  This checks `plan === 'PREMIUM_MONTHLY'` when it should check `plan === 'PREMIUM_WEEKLY'`. A user on the actual `PREMIUM_WEEKLY` plan (plan code `PREMIUM_WEEKLY`) would NOT be identified as "Premium Weekly" by this logic. Only a `PREMIUM_MONTHLY` plan with a weekly billing cycle metadata string would qualify — which is a hybrid case. This means true `PREMIUM_WEEKLY` plan holders may not see the upgrade prompt they should see, depending on their subscription source (Paysera vs Stripe).
- **Status:** RESOLVED (fix: `src/routes/dashboard.routes.ts:50` — now `const isPremiumWeekly = resolvedSubscription?.plan === 'PREMIUM_WEEKLY';` with an explicit `// F-007 fix` comment; the contradictory `PREMIUM_MONTHLY && billingPeriod.includes('week')` clause was removed, 2026-06-04)

---

### Section 4 — Cashback Lifecycle — State Machine and Timing Rules

**F-008**
- **Severity:** LOW
- **Type:** PARTIAL
- **File:line:** `src/services/cashbackLifecycle.service.ts:113-136`
- **Spec rule (§4.2 + §19 rule 7):** Voided records require a reason category, the responsible admin identity, and a timestamp. Voided is terminal.
- **Finding:** `markVoided()` correctly enforces a non-empty reason string and stores `voidedByUserId` (actorUserId). However the spec (§4.2 cashback-state table) says "reason **category**" — implying a controlled vocabulary, not a free-text string. The `voidedReason` field in the schema was `String?` (free text) with no enum or validated category list for voiding reasons at the service layer. This was PARTIAL — the reason was required and stored, but it was not a validated category from a canonical list. (Severity is LOW: the reason was already required and stored; the only gap was canonicalisation of the category, a low-impact data-integrity enforcement concern — this matches the §19 rule-7 LOW classification in the consolidated table.)
- **Status:** RESOLVED (fix: `src/services/cashbackLifecycle.service.ts:34-45` + `113-136` — a `VOID_REASON_CATEGORIES` controlled vocabulary (`// F-008`) is now defined and `markVoided()` validates the reason's category prefix against it, throwing `Invalid voidedReason category` for non-canonical values, 2026-06-04)

---

**F-009**
- **Severity:** LOW
- **Type:** GAP
- **File:line:** `src/services/cashbackLifecycle.service.ts:388-389` (`expireOverdueCashback` def) + `686-705` (service barrel export block)
- **Spec rule (§5 / deprecated export concern):** The `expireOverdueCashback()` function is marked `@deprecated`. The actual expiry runs via `expireWallet()` in the scheduler. However, the deprecated function was still exported in the service index and could be called by test code or future maintainers. The non-production exposure was low risk but created confusion.
- **Note:** The previous citation of §4.4 ("Rejected" as a transaction status) was not relevant to this finding. This finding is about a deprecated exported function; §4.4 does not govern it.
- **Status:** RESOLVED (fix: `src/services/cashbackLifecycle.service.ts:697-699` — `expireOverdueCashback` is now explicitly NOT exported from the service barrel, with a `// F-009` comment ("intentionally NOT exported here ... must not be accessible via any public barrel"); the function remains marked `@deprecated` and production expiry is handled solely by `expireWallet()` in `jobs/scheduler.ts`, 2026-06-04)

---

### Section 5 — 60-Day Rolling Validity Rule

**F-010**
- **Severity:** MEDIUM
- **Type:** PARTIAL
- **File:line:** `src/services/wallet.service.ts:227-235` (`// F-010 DEVIATION NOTICE` + `isClearedCashback` / `cashbackExpiresAt` logic)
- **Spec rule (§5):** The 60-day countdown starts from the Cleared date. Pending cashback never expires.
- **Finding:** For non-trial cashback credits (`isClearedCashback = true`), `cashbackExpiresAt` is set immediately at credit time and `cashbackStatus = CLEARED`. This means the 60-day clock starts at transaction credit time, not at a separate "Pending → Cleared" admin approval step. For the fast-path (Low-risk auto-approval), this is functionally equivalent because spec §4.3 says "Pending → Cleared: Automatic approval (Low risk, within 24 hours)." However for higher-risk cashback that passes through manual admin review and `promotePendingToCleared()`, the 60-day clock correctly starts at promotion time (in cashbackLifecycle.service.ts). The divergence: the non-risk path skips Pending entirely and creates cashback directly as CLEARED — so a user submitting a receipt sees it immediately as "Available" (Cleared) with no "In Review" state. This contradicts spec §9.5 which says "During processing: In Review / Pending verification." The risk-scored path correctly starts as PENDING via `recordPendingForRiskReview`.
- **Status:** RESOLVED (spec amended, 2026-06-04) — The product owner amended the spec: **only High-risk submissions show the "In Review / Pending verification" state; Low and Medium risk auto-process** (§9.4, §9.5, §4.3 in `docs/specs/08-user-spec-extracted.md`). The original divergence — the Low-risk fast path creating cashback directly as CLEARED, "skipping" an In-Review state the spec used to require for *all* submissions — is now spec-compliant, so this finding is closed. **Code follow-up (new, not part of the original 22):** `requiresManualReview` must be narrowed from `riskLevel === 'Medium' || riskLevel === 'High'` to `riskLevel === 'High'` (`fraudDetection.service.ts:989`, `receipt.service.ts:779`) so Medium-risk receipts also auto-process per the amendment — tracked as backend task `BC-USER-SPEC-FIX-010-CODE`.

---

### Section 6 — Wallet and Balance Computation

**F-011**
- **Severity:** CRITICAL
- **Type:** GAP
- **File:line:** `src/services/wallet.service.ts:1046-1114` (`updatePayoutAccount`, auto-trigger block) + `988+` (`notifyPayoutHeldNoIban`)
- **Spec rule (§6.5 + §7.3):** When threshold reached but IBAN is missing, system sends a notification prompting user to add bank account; payout is held until IBAN is saved, then triggered automatically.
- **Finding:** The IBAN-missing notification fired correctly via `notificationService.notifyPayoutHeldNoIban()`. The remaining gap was that `updatePayoutAccount()` saved the IBAN and wrote an audit entry but did NOT read the wallet balance or trigger any payout check. Spec §7.3 requires: "trigger payout automatically when IBAN is later provided." This auto-trigger was not implemented — a user who saved their IBAN after having already crossed the threshold would not have a payout triggered automatically.
- **Status:** RESOLVED (fix: `src/services/wallet.service.ts:1082-1108` — `updatePayoutAccount()` now, after saving the IBAN, checks the available balance against the threshold and enqueues an automatic payout (`// F-011 ... spec §7.3 auto-trigger on IBAN save`, logs "Auto-payout enqueued"). The auto-trigger is non-fatal/async so a failure falls back to the scheduler. This also closes F-018 sub-item (b), 2026-06-04)

---

**F-012**
- **Severity:** MEDIUM
- **Type:** GAP
- **File:line:** `src/routes/wallet.routes.ts:34-48` (transactions endpoint)
- **Spec rule (§6.7):** Cashback & Transactions screen: period filters (Last 7 days / Last 30 days / All), status filters (All / Pending / Available / Locked / Paid / Expired / Voided). "Rejected" is not a cashback filter.
- **Finding:** The `GET /api/wallet/transactions` endpoint accepted a `type` query param but not a `cashbackStatus` filter or a `period` preset. The wallet transaction history endpoint did not expose period filtering or cashback status filtering, forcing a client to implement its own filtering. This was a PARTIAL implementation of §6.7's filter requirements.
- **Status:** RESOLVED (fix: `src/routes/wallet.routes.ts:34-48` (`// F-012`) — the endpoint now destructures `status` and `period` from the query and passes them to `walletService.getTransactions()` as `cashbackStatus` and `period`, exposing both the status filter and the period preset required by §6.7, 2026-06-04)

---

### Section 7 — Payout Flow and Threshold Rules

**F-013**
- **Severity:** CRITICAL
- **Type:** DIVERGENCE
- **File:line:** `src/routes/wallet.routes.ts:113-125` (removal marker comment)
- **Spec rule (§7.1):** "There is no user-initiated payout action. Payouts are triggered automatically by the system when the threshold is reached. The only payout-related action available to the user is saving their bank account details (IBAN + beneficiary name)."
- **Finding:** The endpoint `POST /api/wallet/payout` previously existed and was user-callable — a user-initiated payout request. The spec explicitly states "there is no user-initiated payout action" and "there is no 'Request Payout' button or endpoint." This was a direct DIVERGENCE from spec §7.1.
- **Status:** RESOLVED (fix: `src/routes/wallet.routes.ts:113-125` — the `POST /api/wallet/payout` route handler has been REMOVED, with a `// F-013 ... REMOVED per spec §7.1` marker comment in its place. Verified by source (`grep` for `router.post('/payout'` returns no match; only `GET /balance`, `GET /transactions`, `POST /topup`, `PUT /payout-account`, `GET /statistics` remain) and by runtime against `http://localhost:3025` (no 200 response — endpoint is not served). Payouts now trigger automatically via the scheduler / F-011 auto-trigger; the only user payout action remaining is `PUT /payout-account` (save IBAN), which is spec-allowed, 2026-06-04)

---

**F-014**
- **Severity:** HIGH
- **Type:** GAP
- **File:line:** `src/services/wallet.service.ts:984-1027` (`executePayoutTransfer` failure branch)
- **Spec rule (§7.4):** First payout failure (invalid IBAN) → notification sent to user requesting IBAN correction. Second failure → record flagged High risk, routed to manual admin review, user NOT informed.
- **Finding:** Previously, `executePayoutTransfer()` handled payout failures only by reversing the DB debit, marking the withdrawal FAILED, and logging — no notification was sent to the user on first failure, and the "second failure → flag High risk" escalation path was not implemented.
- **Status:** RESOLVED (fix: `src/services/wallet.service.ts:984-1027` (`// F-014 ... spec §7.4`) — the failure branch now counts prior failures: on the **first** failure it calls `notificationService.notifyPayoutFailedInvalidIban(userId)` (IBAN-correction prompt); on the **second+** failure it increments `riskScore` (+40), flags the record for manual admin review, and notifies admins while deliberately NOT notifying the user (per §7.4). This also closes F-018 sub-item (c), 2026-06-04)

---

### Section 8 — QR Code Scanning Flow

**F-015**
- **Severity:** MEDIUM
- **Type:** PARTIAL
- **File:line:** `src/services/sticker.service.ts:290-304`
- **Spec rule (§8.2 + §8.5):** Scanning blocked when subscription_status = Cancelled (post period end). The app should show "subscription expired/blocked message."
- **Finding:** The `assertSubscriptionAllowsScanning` correctly blocks FAILED_PAYMENT and EXPIRED. For CANCELLED subscriptions, the check allows scanning only when `currentPeriodEnd > now`. Previously, when the paid period had ended, the check fell through to a generic "SUBSCRIPTION_INACTIVE" message rather than a distinct "CANCELLED post-period" message, so the error code surfaced to the mobile client could not distinguish "Cancelled post period end" from other inactive states (spec §8.5 requires specific messages per error type).
- **Status:** RESOLVED (fix: `src/services/sticker.service.ts:290-302` (`// F-015`) — a distinct branch now throws `SUBSCRIPTION_CANCELLED_EXPIRED` (with a Bulgarian "абонаментът Ви е отменен и платеният период е приключил" message) for CANCELLED subscriptions whose paid period has ended, giving the client a distinct error code separate from the generic `SUBSCRIPTION_INACTIVE`, 2026-06-04)

---

### Section 9 — Receipt Upload and OCR Flow

**F-016**
- **Severity:** MEDIUM
- **Type:** DIVERGENCE
- **File:line:** `src/services/fraudDetection.service.ts:61-62` + `920-942` (`computeSpecRiskLevel`); `src/services/receipt.service.ts:730-745`
- **Spec rule (§9.3):** Canonical 5-signal additive risk model: IBAN changed in last 24h (+40), Receipt match confidence < 60% (+30), QR location mismatch (+20), User has 3+ Voided records (+20), Partner has active risk flag (+10). Total: Low 0-20, Medium 21-50, High 51+.
- **Finding:** Two distinct gaps, affecting different code paths:
  1. **Sticker scan path** (`fraudDetection.service.ts` + `computeSpecRiskLevel`): The spec OCR confidence signal adds +30 for "receipt match confidence < 60%". The code added only 20 points. Signal weight diverged from spec §9.3 canonical model.
  2. **Receipt OCR ingestion path** (`receipt.service.ts`): `requiresManualReview` was hardcoded to `true` regardless of the computed risk level, sending ALL receipt submissions to manual review and contradicting spec §9.4 (Low-risk receipts must auto-approve within 24h).
- **Status:** RESOLVED — both sub-items fixed:
  1. `src/services/fraudDetection.service.ts:61-62` defines `const RISK_RECEIPT_MATCH_POINTS = 30; // F-016 ... was incorrectly 20` and `computeSpecRiskLevel()` (line 942) now adds `RISK_RECEIPT_MATCH_POINTS` (30) for the receipt-match-confidence signal, matching the §9.3 canonical weight.
  2. `src/services/receipt.service.ts:730-745` (`// F-016`) now derives `requiresManualReview` from `computeSpecRiskLevel()` (`riskLevel === 'High' || riskLevel === 'Medium'`) and sets receipt status to `PENDING` (auto-approve path) for Low-risk submissions instead of hardcoding manual review. (2026-06-04)

---

**Informational — §9.0 (no gap found)**

- **Spec rule (§9.0):** The web account "Upload receipt" screen is purely informational — it displays the mobile app steps and a download link.
- **Note:** The POST /api/receipts endpoint returns 410 GONE with a message directing users to the sticker scan flow. This is correct — receipt upload is now QR-session-gated. The spec §9.0 requirement for the web "Upload Receipt" screen to show app steps/download button is a frontend concern, not backend. Backend is clean here.

---

### Section 10 — Earned-Rights Model

**F-017**
- **Severity:** LOW
- **Type:** PARTIAL
- **File:line:** `src/services/cashbackLifecycle.service.ts:117-169` (`markVoided` in-flight guard)
- **Spec rule (§10):** In-flight payouts (already Locked or Paid) always continue regardless of subsequent subscription status changes.
- **Finding:** The `requestPayout()` service correctly allows new payouts only for ACTIVE/TRIALING/Cancelled-within-period subscriptions and does NOT halt in-flight payouts (LOCKED/PROCESSING). However, there was no explicit check in the payout pipeline to protect LOCKED cashback entries from admin-side cancellation when a subscription is Expired/Cancelled. The spec's "always continue" guarantee depended on admin discipline — there was no code-level guard preventing an admin from voiding LOCKED entries post-subscription-change.
- **Status:** RESOLVED (fix: `src/services/cashbackLifecycle.service.ts:117-169` (`// F-017`) — `markVoided()` now refuses to void a `LOCKED`/`PROCESSING` (in-flight) entry, throwing "Cannot void in-flight payout (LOCKED/PROCESSING)" unless an explicit `forceVoidLockedEntry=true` override is passed (which is logged as a deliberate admin action per §10 earned-rights model). The earned-rights guarantee is now enforced at the code level, 2026-06-04)

---

### Section 11 — User-Facing Notifications

**F-018**
- **Severity:** CRITICAL
- **Type:** GAP
- **File:line:** `src/services/notification.service.ts:2099-2185` (three new methods) + wiring call sites (below)
- **Spec rule (§11.2):** The following canonical notification triggers are specified but were not found in the codebase:
  1. **QR session opened / receipt upload confirmed** — `notifyQRSession` or equivalent: previously no such method existed; the sticker scan flow did not fire a "QR session opened" / "receipt uploaded" transactional notification.
  2. **Threshold reached but IBAN missing** — `notifyPayoutHeldNoIban()` was already implemented and fires when threshold is hit but IBAN is missing. The remaining gap was the missing auto-trigger in `updatePayoutAccount()` (see F-011 above).
  3. **First payout failure (invalid IBAN)** — notification requesting IBAN correction: was not implemented (see F-014 above).
  4. **Subscription cancellation confirmed** — `sendSubscriptionCancelledEmail` fired in `cancelSubscription()`, but no in-app notification was created; only email was sent.
- **Status:** RESOLVED — all four sub-items now closed:
  1. `notification.service.ts:2106` defines `notifyQRSessionOpened(userId, stickerId)` and it is **wired** into the scan/upload flow at `src/services/sticker.service.ts:1357-1362` (`// F-018`).
  2. Auto-trigger on IBAN save implemented in `updatePayoutAccount()` — see F-011 (`wallet.service.ts:1082-1108`).
  3. `notification.service.ts:2133` defines `notifyPayoutFailedInvalidIban(userId)` and it is **wired** into the first-failure branch at `src/services/wallet.service.ts:1002` — see F-014.
  4. `notification.service.ts:2178` defines `notifySubscriptionCancelledInApp(userId)` and it is **wired** into `cancelSubscription()` at `src/services/subscription.service.ts:289-290`, firing the in-app channel alongside the existing email. (2026-06-04)

- **Note (§11.3 — clean):** Spec §11.3 explicitly states that users are NOT notified when an admin changes their status to INACTIVE or ARCHIVED. The absence of a notification for admin-triggered status changes is correct and spec-compliant. This is documented here to confirm it was checked and is clean.

---

**F-019**
- **Severity:** MEDIUM
- **Type:** PARTIAL
- **File:line:** `src/jobs/scheduler.ts:1025-1090` (`notifyCashbackExpiring`)
- **Spec rule (§11.2):** 7-day warning notification before Cleared cashback expires. Mandatory — cannot be opted out.
- **Finding:** Previously the scheduler fired only `fireAutomation('cashback.expiring', ...)` for each user, dispatching through the automation system rather than calling `notificationService` directly. If the `cashback.expiring` automation template was unconfigured or inactive, users received no warning — a configuration dependency for a mandatory, non-optional transactional notification.
- **Status:** RESOLVED (fix: `src/jobs/scheduler.ts:~1075` (`// F-019: Direct notification via notificationService — mandatory per spec`) — `notifyCashbackExpiring()` now calls `notificationService` directly per wallet so the 7-day warning reaches the user regardless of automation config; the `fireAutomation('cashback.expiring', ...)` call is retained as a belt-and-suspenders supplement rather than the sole delivery path, 2026-06-04)

---

### Section 12 — Help Requests — User Visibility

**✓ Clean** — `help.routes.ts` implements:
- POST /api/help/ticket (submit) with types: SUPPORT, DISPUTE, OTHER, CHANGE
- GET /api/help/tickets (list, paginated)
- GET /api/help/tickets/:id (single ticket detail)
- GET /api/help/tickets/:id/replies
- POST /api/help/tickets/:id/reply

Admin identity is correctly omitted from user-facing ticket/reply responses (§13.3 compliant). No SLA logic present (correct per §12.4). Status visibility matches §12.3.

Minor note: ticket status in the schema includes 'OPEN'/'RESOLVED'/'WAITING'/'CLOSED'/'CANCELLED'/'REJECTED'. The spec §12.3 lists: New / In Progress / Waiting / Closed / Cancelled. The code uses 'OPEN' for what the spec calls 'New', and 'RESOLVED' for an additional state not in the spec. These are surface-label differences that do not affect backend logic.

---

### Section 13 — Access Control, Permissions, and Profile Deletion

**✓ Clean (mostly)** — Key findings already captured in F-001, F-002.

Profile deletion (`AuthService.deleteAccount`) correctly:
- Requires password confirmation
- Anonymizes PII
- Sets status `DELETED` (blocking all access via middleware)
- Cancels active subscriptions
- Revokes all refresh tokens
- Retains financial history (walletTransactions, receipts not deleted — only user PII anonymized)
- Revokes marketing consent

One concern: the deletion sets `status: 'DELETED'` not `status: 'INACTIVE'`. The auth middleware blocks `DELETED` status (line 90). This is correct. However the spec §13.4 says "Account access is deactivated immediately" — the `DELETED` status achieves this.

**§13.5 Email Change Flow — confirmed implemented via runtime check:**  
Both endpoints confirmed present in `auth.routes.ts`: `POST /api/auth/change-email/request` (line 429) — uniqueness check, rate limit, sends OTP to new email; `POST /api/auth/change-email/verify` (line 456) — validates code and password, promotes `pendingEmail` to `email`. Runtime curl check against `http://localhost:3025/api/auth/change-email/request` returned an auth-gated response (not 404), confirming the endpoint is live. Spec §13.5 4-step flow is met. Clean.

---

### Section 14 — Archived Account Reactivation

**✓ Clean** — `forgotPassword()` in auth.service.ts (line 1511) explicitly allows OTP issuance for ARCHIVED accounts: "ARCHIVED is intentionally allowed — it is the reactivation path per spec §14." The password reset does not block ARCHIVED status. Users must then purchase a new subscription to regain scanning rights. The reactivation flow (password reset link + new subscription) is correctly enabled via the existing endpoints.

---

### Section 15 — Favorites (Любими)

**PARTIAL — Medium severity**

The favorites implementation (`favorites.routes.ts`) provides:
- GET /api/favorites — list favorites (entityKind: partner | offer | venue)
- POST /api/favorites — add favorite (idempotent)
- DELETE /api/favorites — remove by entityKind + entityId
- DELETE /api/favorites/all — clear all

**Gaps vs spec §15:**
- The spec requires "View" action (opens internal location card) — this is a frontend concern but the API does not return the full partner location card data inline (only entityKind + entityId). A separate fetch per favorite is needed.
- The spec requires an "empty state" with "Browse BOOM locations" CTA — purely frontend.
- No "edit partner profile data" guard is needed at the backend (read-only by design).
- Spec says "partner locations" specifically, but the favorites schema allows `offer` and `venue` kinds too — this is an extension beyond spec scope (not a violation, just an addition).

Overall the favorites backend is functionally adequate for the spec requirements.

---

### Section 16 — Deferred Features

**F-020**
- **Severity:** LOW
- **Type:** DIVERGENCE
- **Classification:** Informational (no user-facing harm)
- **File:line:** `src/routes/venues.routes.ts:78-91`
- **Spec rule (§16):** "Nearby (Наблизо)" is explicitly deferred — "must not be implemented without explicit product confirmation."
- **Finding:** `GET /api/venues/nearby` endpoint existed and was unconditionally functional (returned nearby venues by GPS coordinates). The spec §16 states this feature is pending final product decision. The always-on implementation was a DIVERGENCE from the deferred status.
- **Status:** RESOLVED (fix: `src/routes/venues.routes.ts:81-91` (`// F-020`) — the `/nearby` handler is now gated behind the `ENABLE_NEARBY_VENUES` env var, which defaults to `false`; when disabled the endpoint returns 501, keeping production spec-compliant (deferred) until product explicitly enables the feature, 2026-06-04)

**Plus-addressing email routing:**
- **Spec rule (§16):** Plus-addressing (`request-1234@boomcard.bg`) is deferred to v1.3; v1.2 uses X-BoomCard-Request-ID header + [#XXXX] subject pattern only.
- **Finding:** The code has plus-addressing partially implemented and gated behind `ENABLE_PLUS_ADDRESS_ROUTING=true` env var (help.routes.ts:121, ticketInbound.service.ts:126-145). When disabled, it correctly falls back to header + subject pattern. When enabled, it uses plus-addressing. This is an acceptable feature-flag-gated implementation; as long as the flag is `false` in production, spec compliance is maintained.

---

### Section 17 — Currency Display Rules

**F-021**
- **Severity:** HIGH
- **Type:** GAP
- **File:line:** `src/services/wallet.service.ts:100-115`
- **Spec rule (§17)** *(as it stood on 2026-06-04; superseded 2026-08-20, BC-QA-031 — see the Update below)*: During BGN→EUR transition window: all amounts displayed in both BGN and EUR simultaneously. After transition: BGN hidden, EUR only.
- **Finding:** The wallet service returned `payoutThresholdEUR` alongside BGN values, but there was no transition-window feature flag or mode switch controlling whether the app shows dual-currency or EUR-only. Display was hardcoded to include both values with no `CURRENCY_TRANSITION_MODE` setting — no mechanism to switch modes without a code deployment, a GAP for the mode-switching requirement.
- **Status:** RESOLVED (fix: `src/services/wallet.service.ts:100-115` (`// F-021`) — a `CURRENCY_TRANSITION_MODE` env var (default `'dual'`) now controls the display mode; when set to dual the balance response includes both BGN and EUR, and the mode can be switched (e.g. to EUR-only after the transition window closes) by configuration rather than a code change, satisfying the §17 conditional-display requirement, 2026-06-04)

- **Update (2026-08-20, BC-QA-031):** SUPERSEDED — neither the spec rule quoted above nor the resolution below it describes the shipped system any more. Bulgaria's BGN→EUR transition window has closed and the dual-currency display feature was removed in full: `CURRENCY_TRANSITION_MODE` no longer exists anywhere in the tree, there is no `currency_transition_window_open` setting, no `currencyDisplay.ts` module, and `wallet.service.ts` returns a single EUR scalar per money field unconditionally. `docs/specs/08-user-spec-extracted.md` §17 was rewritten in the same task and is the current requirement; the text above is kept as the record of what was assessed and decided on 2026-06-04, not as a description of current behaviour. Do not go looking for the env var — it is gone, and re-adding it would reintroduce the feature this task removed.

---

### Section 18 — Canonical Field Names and Terminology

**F-022**
- **Severity:** LOW
- **Type:** DIVERGENCE
- **File:line:** `prisma/schema.prisma:2135` (`SubscriptionStatus` enum) + `1923` (`UserStatus` enum)
- **Spec rule (§18.1):** Subscription status enum values: `Active | Expired | Cancelled | Failed Payment`.
- **Finding:** The schema uses `SubscriptionStatus.FAILED_PAYMENT` (with underscore), which maps to the spec's "Failed Payment." The schema also includes additional states not in the spec (`INCOMPLETE`, `TRIALING`, `PAST_DUE`, `UNPAID`, `PAUSED` — Stripe/operational states). The canonical spec enum values are all present; the extra states are implementation extensions. For `user_account_status`, the schema has extra operational states (`PENDING_VERIFICATION`, `DELETED`, `SUSPENDED`, `PENDING_PAYMENT`) beyond the canonical `ACTIVE | INACTIVE | ARCHIVED`. These are extensions, not violations — but the original concern was that they were undocumented and could leak as user-facing labels.
- **Status:** RESOLVED (fix: `prisma/schema.prisma:1918-1922` (`UserStatus`) and `2130-2155` (`SubscriptionStatus`) — both enums now carry `// F-022` doc comments that explicitly identify the canonical spec values and annotate every extra value as a non-user-facing operational/Stripe extension with a mapping note ("must never be displayed directly to users — always map to a user-friendly label"), closing the documentation/leak-risk concern, 2026-06-04)

---

### Section 19 — Data Integrity Atomic Rules (User Domain)

**Rule 1 (Scanning gate):** Covered by F-001 (now RESOLVED — INACTIVE user payout blocked) and F-015 (now RESOLVED — distinct cancelled-expired error code).

**Rule 2 (Cashback generation gate):** Clean — `assertSubscriptionAllowsScanning` throws before cashback can be created.

**Rule 3 (Cancelled-within-period exception):** Clean — correctly implemented in both sticker.service.ts and wallet.service.ts.

**Rule 4 (Expiry applies only to Cleared):** Clean — `expireStalePendingCashback` correctly disabled; only CLEARED entries are expired.

**Rule 5 (Payout new vs in-flight distinction):** F-011 and F-013 covered the gaps — both now RESOLVED (auto-trigger on IBAN save implemented; user-initiated payout endpoint removed). Related earned-rights guard F-017 also RESOLVED.

**Rule 6 (IBAN required at payout, not at signup):** Clean — IBAN not required at registration; blocked at payout request time.

**Rule 7 (Voided records require reason):** F-008 covered the free-text vs category concern — now RESOLVED (`VOID_REASON_CATEGORIES` controlled vocabulary enforced).

**Rule 8 (Risk level is internal-only):** Clean — risk level/score is not included in any user-facing select statement in receipt.service.ts (guarded by `includeInternal` flag).

**Rule 9 (Second payout failure silent to user):** F-014 covered this — now RESOLVED (second-failure High-risk escalation implemented; user is correctly NOT notified on the second failure).

**Rule 10 (Account status does not affect other users' QR access):** Clean — QR/sticker management is per-venue, not per-user. An individual user status change does not cascade to sticker records.

**Rule 11 (Currency transition):** F-021 covered this — now RESOLVED (`CURRENCY_TRANSITION_MODE` env var added). *(Superseded 2026-08-20, BC-QA-031: the transition window closed, the env var was deleted with the dual-currency feature, and all amounts are EUR-only — see F-021's Update.)*

**Rule 12 (Password reset rate-limit):** F-002 covered the gaps in Super Admin notification and non-scan write endpoint blocking — both now RESOLVED.

**Rule 13 (Trial period cashback voiding):** Clean — `requestTrialRefund()` in subscription.service.ts calls `voidTrialPendingCashback()` which marks TRIAL_PENDING transactions as CANCELLED. However see F-004 for the related spec visibility concern.

**Rule 14 (Profile deletion does not erase financial history):** Clean — `deleteAccount()` anonymizes PII fields but does not delete WalletTransaction, Receipt, or StickerScan records.

**Rule 15 (Dashboard upsell display):** F-007 covered the incorrect `isPremiumWeekly` logic — now RESOLVED (checks `PREMIUM_WEEKLY`).

---

## Consolidated Finding List (by severity)

**Severity note:** the Severity column is the finding's *original* severity at time of audit (used for the full-22 breakdown). The Status column reflects current code as of the 2026-06-04 reconciliation.

| ID | Severity | Type | Section | Status | Summary |
|----|----------|------|---------|--------|---------|
| F-011 | CRITICAL | GAP | §6.5/§7.3 | RESOLVED (`wallet.service.ts:1082-1108`) | Auto-payout on IBAN save now implemented in `updatePayoutAccount()` |
| F-013 | CRITICAL | DIVERGENCE | §7.1 | RESOLVED (`wallet.routes.ts:113-125`) | User-initiated `POST /api/wallet/payout` endpoint removed per spec §7.1 |
| F-018 | CRITICAL | GAP | §11.2 | RESOLVED (`notification.service.ts:2099-2185` + wiring) | QR-session, first-payout-failure, and in-app cancellation notifications added and wired; IBAN auto-trigger via F-011 |
| F-004 | HIGH | DIVERGENCE | §2.1 | RESOLVED (product sign-off 2026-06-04; spec §2.1 amended) | Trial cashback is visible as Pending/"In Review"; held out of spendable balance until 24h trial window closes — approved interpretation, no code change |
| F-007 | HIGH | DIVERGENCE | §3.5.1 | RESOLVED (`dashboard.routes.ts:50`) | Dashboard upsell `isPremiumWeekly` now checks correct `PREMIUM_WEEKLY` plan code |
| F-014 | HIGH | GAP | §7.4 | RESOLVED (`wallet.service.ts:984-1027`) | First-failure IBAN-correction notification + second-failure High-risk escalation implemented |
| F-021 | HIGH | GAP | §17 | RESOLVED, then SUPERSEDED 2026-08-20 (BC-QA-031) | `CURRENCY_TRANSITION_MODE` was added, then deleted with the dual-currency feature; amounts are now EUR-only |
| F-001 | HIGH | PARTIAL | §1.2 | RESOLVED (`wallet.service.ts:516-528`) | INACTIVE users now blocked from `requestPayout` (user_account_status checked) |
| F-002 | MEDIUM | PARTIAL | §1.4/§19r12 | RESOLVED (`auth.service.ts:1672`; `wallet.routes.ts:85`) | In-app Super Admin suspension notification + INACTIVE write-path block both added |
| F-005 | MEDIUM | GAP | §2 | OPEN — approved for impl (`auth.service.ts:419-422`; task `BC-USER-SPEC-FIX-005-CODE`) | Registration issues JWT before subscription/payment — confirmed to implement per spec; breaking client-contract change, code pending |
| F-006 | MEDIUM | PARTIAL | §3.5 | RESOLVED (`subscriptions.routes.ts:113-146`) | Paysera subscribers now get a non-null payment-method placeholder |
| F-010 | MEDIUM | PARTIAL | §5/§9.5 | RESOLVED (spec §9.4/§9.5/§4.3 amended 2026-06-04) | Only High-risk shows "In Review"; Low+Medium auto-process. Low fast-path now compliant. Code follow-up `BC-USER-SPEC-FIX-010-CODE`: narrow `requiresManualReview` to High-only |
| F-012 | MEDIUM | GAP | §6.7 | RESOLVED (`wallet.routes.ts:34-48`) | Wallet transactions endpoint now exposes `status` + `period` filters |
| F-015 | MEDIUM | PARTIAL | §8.2/§8.5 | RESOLVED (`sticker.service.ts:290-302`) | Distinct `SUBSCRIPTION_CANCELLED_EXPIRED` error code for cancelled post-period |
| F-016 | MEDIUM | DIVERGENCE | §9.3/§9.4 | RESOLVED (`fraudDetection.service.ts:61`; `receipt.service.ts:730-745`) | OCR signal weight corrected to +30; `requiresManualReview` now derived from risk level |
| F-019 | MEDIUM | PARTIAL | §11.2 | RESOLVED (`scheduler.ts:~1075`) | 7-day expiry warning now sent directly via notificationService (automation as supplement) |
| F-003 | LOW | PARTIAL | §1.1 | RESOLVED (`schema.prisma:37`) | `User.iban` marked `@deprecated`; `Wallet.payoutIban` is authoritative source |
| F-008 | LOW | PARTIAL | §4.2/§19r7 | RESOLVED (`cashbackLifecycle.service.ts:34-45,113-136`) | `VOID_REASON_CATEGORIES` controlled vocabulary now enforced in `markVoided()` |
| F-009 | LOW | GAP | §5 | RESOLVED (`cashbackLifecycle.service.ts:697-699`) | Deprecated `expireOverdueCashback` no longer exported from service barrel |
| F-017 | LOW | PARTIAL | §10 | RESOLVED (`cashbackLifecycle.service.ts:117-169`) | `markVoided()` guards LOCKED/PROCESSING entries (override requires explicit flag) |
| F-020 | LOW | DIVERGENCE | §16 | RESOLVED (`venues.routes.ts:81-91`) | `/nearby` gated behind `ENABLE_NEARBY_VENUES` (default false, returns 501) |
| F-022 | LOW | DIVERGENCE | §18.1 | RESOLVED (`schema.prisma:1918,2130`) | Enum extensions now documented as non-user-facing with mapping notes |

---

## Top Open Findings (reflecting current code, 2026-06-04)

**All three original CRITICAL findings (F-011, F-013, F-018) are RESOLVED.** Following the 2026-06-04 product decisions, F-004 and F-010 were also closed (spec amended — see revision note). Only **1 finding remains OPEN** and it is MEDIUM:

1. **F-005 (MEDIUM — GAP — §2) — OPEN (approved for implementation):** The registration endpoint issues JWT tokens immediately on account creation, before any subscription/payment, diverging from the spec §2 step order. The product owner confirmed the spec sequence (payment → subscription Active → full access) should be enforced. This is a breaking change to the registration/client token contract — tracked as backend task `BC-USER-SPEC-FIX-005-CODE`. Scanning itself stays gated by `assertSubscriptionAllowsScanning` (no cashback without an active subscription), so current user-facing risk is limited to step ordering.

> **Code follow-ups arising from the 2026-06-04 product decisions (new tasks, not part of the original 22 findings):**
> - `BC-USER-SPEC-FIX-005-CODE` — enforce spec §2 registration sequence (F-005).
> - `BC-USER-SPEC-FIX-010-CODE` — narrow `requiresManualReview` to `riskLevel === 'High'` so Medium-risk receipts auto-process per the §9.4 amendment (F-010).

---

## Appendix: Files Read

| File | Lines Read |
|------|-----------|
| `/Users/administrator/Documents/BoomCard/docs/specs/08-user-spec-extracted.md` | 766 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/auth.service.ts` | 2238 (read in two passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/middleware/auth.middleware.ts` | 239 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/cashbackLifecycle.service.ts` | 661 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/wallet.service.ts` | 1097 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/receipt.service.ts` | 150 (header/init) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/notification.service.ts` | ~1800 (multiple passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/sticker.service.ts` | 600 (two passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/subscription.service.ts` | 200 (header) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/services/fraudDetection.service.ts` | 400 (two passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/wallet.routes.ts` | 181 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/favorites.routes.ts` | 71 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/help.routes.ts` | 330 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/dashboard.routes.ts` | 57 |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/auth.routes.ts` | 200 + 40 (two passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/subscriptions.routes.ts` | 350 (two passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/routes/receipts.routes.ts` | 100 |
| `/Users/administrator/Documents/BoomCard/backend-api/prisma/schema.prisma` | 500 (two passes) |
| `/Users/administrator/Documents/BoomCard/backend-api/src/jobs/scheduler.ts` | grep + sed ~120 lines |
| `/Users/administrator/Documents/BoomCard/backend-api/src/jobs/renewal-reminders.ts` | grep output |

*Additional grep searches across the codebase performed for specific notification methods, flag implementations, and scheduler jobs.*
