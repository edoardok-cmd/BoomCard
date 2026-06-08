# BoomCard — User-Facing Platform & Mobile App Reference Specification

**Extracted from:** `05-consolidated-unified-spec.md` (Unified Spec v1.2, 2026-05-29) and `03-user-module-final.md`  
**Scope:** All requirements that apply to the mobile app, subscriber account, and user-facing platform  
**This document is self-contained.** A reader does not need the source specs to understand any rule here.  
**Source notes:** Where `03-user-module-final.md` and `05-consolidated-unified-spec.md` conflict, the conflict is noted inline. Sections that appear only in `03-user-module-final.md` are marked *(Source: 03 only)*.

---

## Table of Contents

1. [User Account Entity — Fields and Status Lifecycle](#1-user-account-entity--fields-and-status-lifecycle)
2. [Registration Flow and Trial Period](#2-registration-flow-and-trial-period)
3. [Subscription Plans and Status Lifecycle](#3-subscription-plans-and-status-lifecycle)
4. [Cashback Lifecycle — State Machine and Timing Rules](#4-cashback-lifecycle--state-machine-and-timing-rules)
5. [60-Day Rolling Validity Rule](#5-60-day-rolling-validity-rule)
6. [Wallet and Balance Computation](#6-wallet-and-balance-computation)
7. [Payout Flow and Threshold Rules](#7-payout-flow-and-threshold-rules)
8. [QR Code Scanning Flow](#8-qr-code-scanning-flow)
9. [Receipt Upload and OCR Flow](#9-receipt-upload-and-ocr-flow)
10. [Earned-Rights Model](#10-earned-rights-model)
11. [User-Facing Notifications](#11-user-facing-notifications)
12. [Help Requests — User Visibility](#12-help-requests--user-visibility)
13. [Access Control, Permissions, and Profile Deletion](#13-access-control-permissions-and-profile-deletion)
14. [Archived Account Reactivation](#14-archived-account-reactivation)
15. [Favorites (Любими)](#15-favorites-любими)
16. [Deferred Features](#16-deferred-features)
17. [Currency Display Rules](#17-currency-display-rules)
18. [Canonical Field Names and Terminology](#18-canonical-field-names-and-terminology)
19. [Data Integrity Atomic Rules (User Domain)](#19-data-integrity-atomic-rules-user-domain)

---

## 1. User Account Entity — Fields and Status Lifecycle

### 1.1 Fields

| Field | Notes |
|-------|-------|
| Name | Required at registration |
| Email | Required at registration |
| Phone | Required at registration |
| Password | Required at registration; self-service reset via email |
| IBAN | **Optional at registration; required before payout initiation** |
| Address | Profile data |
| Risk profile | Internal-only; not visible to user |
| Subscription reference | Links to subscription record |
| Cashback history | All cashback records |

### 1.2 Status Enum

`Active | Inactive | Archived`

| Status | Definition | Login Access | Scan Receipts | View History | App Behaviour |
|--------|-----------|:---:|:---:|:---:|---|
| **Active** | Normal operation. User can subscribe, scan, transact, and manage account. | Yes | Yes | Yes | No special UI state. User can scan any active QR code at partner locations. |
| **Inactive** | Temporary pause. User can log in, view history, and submit support requests, but cannot scan receipts or generate new cashback. | Yes | No | Yes | App shows "Account paused" UI and a CTA to resume the account. Support request submission is allowed. |
| **Archived** | Historical status. No operational access. Data retained for history and accounting. | No | No | No | Full access blocked. QR codes at partner locations remain operational for other users. |

### 1.3 Key Behavioural Rules

- **Inactive is distinct from Archived.** Inactive preserves read-only access and is reversible. Archived is terminal for operational purposes but retains all history.
- User account status controls only that user's ability to scan. QR codes at partner locations are managed at the location level by admin and remain active for other users regardless of any individual user's account status.
- Inactive account status **blocks scanning regardless of subscription status** — even if the subscription is Active.

### 1.4 Status Transitions

```
Active → Inactive  (admin action)
Inactive → Active  (admin action, or user self-reactivation path)
Active → Archived  (admin action)
Inactive → Archived (admin action)
Archived → (no forward transitions for operational use)
```

Archived reactivation path: user-initiated password reset link + new subscription purchase (see §14).

---

## 2. Registration Flow and Trial Period

| Step | Action | Notes |
|------|--------|-------|
| **1. Account Creation** | User enters email, password, name, phone | IBAN is optional at this stage |
| **2. Plan Selection** | User chooses a subscription plan (Basic, Premium Weekly, Premium Monthly) | |
| **3. Payment** | Payment processed via card | Subscription becomes Active on successful charge |
| **4. Profile Creation** | User completes remaining profile data | |
| **5. Test Period** | 24-hour verification period; email link sent | User **can scan before or after** email verification — email verification does **not** block scanning |

**Post-registration state:**
- `user_account_status` = Active
- `subscription_status` = Active
- User is immediately ready to scan QR codes

> **Step order conflict:** `03-user-module-final.md` §1 specifies that no profile is created before successful payment, making the order Plan Selection → Payment → Profile Creation. `05-consolidated-unified-spec.md` §5.1 places Account Creation (step 1) before payment. This document follows the consolidated spec step order as the authoritative sequence. Implementors should be aware of the discrepancy; the constraint "no profile created before successful payment" from `03-user-module-final.md` should nonetheless be respected at the implementation level.

### 2.1 Trial Period and Cashback Rules

A 24-hour trial period begins immediately after a new subscription is created.

| Scenario | What Happens | Cashback Effect |
|----------|-------------|-----------------|
| User cancels within 24 hours | Subscription cancelled; amount refunded per the applicable refund policy. | All Pending cashback from the trial period is **Voided**. Voided trial cashback is excluded from the payout threshold and is not paid out. |
| User does not cancel within 24 hours | Profile remains active. | Pending trial cashback progresses through the normal lifecycle (Pending → Cleared) subject to risk review. The 60-day rolling validity then applies from the Cleared date. |

**Spec requirement on visibility:** The source spec (`03 §2` and `03 §3.1`) treats all Pending cashback — including trial-period cashback — as visible to the user ("Чакащ / In Review"; "Показва ли се на потребителя: Да"). Any implementation that introduces a hidden intermediate state for trial-period cashback (holding records away from the user balance until the trial window closes) is a departure from the source spec and requires explicit product sign-off before implementation.

> **Product decision (2026-06-04, signed off — ref BC-USER-SPEC-FIX-001 / gap finding F-004):** Trial-period cashback is held in the `TRIAL_PENDING` state and surfaced to the user as part of the **"In Review / Pending verification"** (pending) balance — it is fully visible and is therefore **not** a "hidden intermediate state." It is intentionally **excluded from the spendable/withdrawable available balance** until the 24-hour trial-refund window closes, because a trial refund within that window voids this exact cashback; counting it as spendable would allow a user to withdraw cashback and then reclaim the trial refund, driving the wallet negative. This "visible-as-Pending, not-yet-spendable" behaviour is the **approved interpretation** of the visibility requirement and is the canonical implementation. It is no longer treated as a departure requiring further sign-off.

---

## 3. Subscription Plans and Status Lifecycle

### 3.1 Plans

| Plan | Notes |
|------|-------|
| Basic | Entry-level plan |
| Premium Weekly | Weekly billing cycle |
| Premium Monthly | Monthly billing cycle |

Each plan has a **plan-specific payout threshold** (minimum Cleared cashback balance required to trigger an automatic payout). The exact thresholds are set by engineering defaults and signed off by the product owner at go-live.

### 3.2 Subscription Status Enum

`Active | Expired | Cancelled | Failed Payment`

| Status | Definition | Receipt Scanning Blocked? | Payout Gate Open? | New Cashback Generated? |
|--------|-----------|:---:|:---:|:---:|
| **Active** | Current valid subscription. | No | Yes | Yes |
| **Expired** | Previous subscription ended naturally (no auto-renewal or manual renewal). | Yes | No (new); Yes (in-flight) | No |
| **Cancelled (within paid period)** | User cancelled but paid period has not yet ended. Access continues through the last paid day. | No — scanning allowed through period end | Yes | Yes |
| **Cancelled (post period end)** | Paid period has elapsed. Auto-transitions to Expired. | Yes | No | No |
| **Failed Payment** | Automatic renewal failed (declined card, insufficient funds, etc.). One-time attempt; no retry period. | Yes — immediately | No (new records) | No |

*In-flight payouts always continue regardless of subsequent subscription status changes (earned-rights model — see §10).*

**Marketing communications on manual cancellation:** When a subscription is manually cancelled, payment retries and payment reminders stop. Marketing communications continue only if valid marketing consent exists at the time of cancellation. *(Source: `03-user-module-final.md` §6.6)*

### 3.3 Critical Scanning and Cashback Rule

New cashback records are **never** generated while subscription status blocks receipt scanning (Expired, Cancelled post-period, Failed Payment). Cancelled-within-paid-period allows scanning and new cashback generation until the last paid day.

### 3.4 Renewal Behaviour

- One renewal attempt at the scheduled renewal date.
- If it fails → status transitions immediately to **Failed Payment** (no retry period).
- Failed Payment blocks receipt scanning immediately.
- User must fix their payment method to resume.

### 3.5 User-Visible Display

The Subscription and Payments screen shows:
- Current plan name
- `subscription_status` (Active / Expired / Cancelled / Failed Payment)
- Next renewal or expiry date
- Auto-renewal toggle (on/off)
- Current card on file (masked card number)
- Payment history

*(Source: `03-user-module-final.md` §6.6)*

**When subscription fails (Failed Payment):**
- App shows: "Subscription payment failed"
- CTA: "Update payment method" or "Renew subscription"
- Receipt scanning is blocked until resolved

**When account is Inactive:**
- App shows: "Account paused"
- CTA: "Resume account"
- Receipt scanning is blocked

**Dashboard upsell block:** For users on the Basic or Premium Weekly plan, the dashboard may show an upsell block promoting upgrade to Premium Monthly. This is a conditional UI element only — it does not affect subscription status, scanning rights, or cashback calculation. *(Source: `03-user-module-final.md` §6.1)*

### 3.5.1 Dashboard Screen Elements

*(Source: `03-user-module-final.md` §6.1)*

| Block | Elements |
|-------|----------|
| Subscription block | Current plan, status, next payment or expiry date, auto-renewal status. |
| Cashback block | Available cashback (Cleared), pending cashback (Pending), expiring cashback (Cleared records approaching the 60-day deadline). |
| Recent transactions | Last 3 transactions — partner name, date, status, cashback amount. |
| Primary CTA | "Upload receipt" button — navigates to the Upload Receipt screen. |
| Upsell block | Conditionally shown for Basic and Premium Weekly subscribers; promotes upgrade to Premium Monthly. |

### 3.6 User Actions — Subscription and Payments Screen

*(Source: `03-user-module-final.md` §6.6)*

| Action | Available When | Effect |
|--------|---------------|--------|
| Change payment card | Any active account | Replaces the card on file for future renewal charges. |
| Toggle auto-renewal off | Subscription Active | Disables automatic renewal; access continues through last paid day. |
| Toggle auto-renewal on | Subscription Active | Re-enables automatic renewal. |
| Cancel subscription | Subscription Active | Cancels future renewal. Scanning access continues through the already-paid period, then transitions to Expired. Payment retries and payment reminders stop. Marketing continues only with valid consent. |
| Upgrade plan | Basic or Premium Weekly, Active subscription | Initiates upgrade flow to Premium Monthly. |

---

## 4. Cashback Lifecycle — State Machine and Timing Rules

### 4.1 Status Enum

`Pending | Cleared | Locked | Paid | Expired | Voided`

| Status | Definition | Visible to User | Expiry Countdown | Counts Toward Payout Threshold | Notes |
|--------|-----------|:---:|:---:|:---:|---|
| **Pending** | Awaiting automatic approval or manual risk review. | Yes ("In Review / Pending verification") | No | No | 60-day rolling timer does NOT start. |
| **Cleared** | Approved and valid. 60-day rolling validity starts from Cleared date. | Yes ("Available" with "Valid until" countdown) | Yes — 60 days | Yes | Visible in available balance and payout threshold calculations. |
| **Locked** | In payout processing pipeline. Intermediate state, NOT terminal. | Yes ("Sent to payout" / "В обработка за плащане") | No | No (already counted in Cleared) | Represents the operational state during payout, not after. |
| **Paid** | Payout initiated. Does NOT mean funds received; means payout process started. | Yes ("Paid" in history) | No | No | Paid records continue payout process even if subscription status changes post-Paid. |
| **Expired** | 60-day rolling validity elapsed without transitioning to Paid. Terminal. | Yes ("Expired") | N/A | No | Only Cleared records can expire; Pending records do NOT expire. |
| **Voided** | Annulled by manual admin decision. Terminal. | Yes ("Cancelled" + reason visible) | N/A | No | Visible in history with reason category and optional internal note. Risk level is NOT shown to user. |

### 4.2 State Transitions

```
Pending → {Cleared, Voided}
Cleared → {Locked, Expired, Voided}
Locked  → {Paid}
Paid    → Paid (terminal for operational flow; can be investigated for disputes)
Expired → Expired (terminal)
Voided  → Voided (terminal)
```

**Why Locked exists:** The "Locked" status resolves the contradiction between "Paid is terminal" and "Paid records may need re-review" — Locked is the intermediate state during payout, allowing Paid records to persist in the system for further investigation without reverting cashback status.

### 4.3 Transition Triggers

| Transition | Trigger |
|------------|---------|
| Pending → Cleared | Automatic approval (Low **and Medium** risk, within 24 hours — amended 2026-06-04, see §9.4) OR manual admin approval (High risk) |
| Pending → Voided | Manual admin rejection (with reason category + internal note) |
| Cleared → Locked | Payout threshold reached; payout process initiated |
| Cleared → Expired | 60 days elapsed from Cleared date without Paid transition |
| Cleared → Voided | Manual admin annulment |
| Locked → Paid | Payout process completed |

### 4.4 Transaction and Receipt Statuses (Distinct from Cashback Statuses)

*(Source: `03-user-module-final.md` §3.2)*

Transactions and receipts have their own status layer, separate from the cashback state machine. A "Rejected" transaction or receipt is **not** a cashback status — it affects the transaction record, not the cashback balance.

| User Label | Where Shown | Meaning |
|------------|-------------|---------|
| Чака проверка / Pending Review | Cashback & Transactions screen | Transaction or receipt is still under review. |
| Одобрена / Approved | Cashback & Transactions screen | Transaction accepted; can generate a cashback entry. |
| Отхвърлена / Rejected | Cashback & Transactions screen | Receipt or transaction not accepted. **This is not a cashback state.** |
| Рискова проверка / Risk Review | Transaction detail only | Transaction held for risk control. Visible in detail view; not in list. |

**Critical distinction:** "Rejected" appears only at the transaction/receipt level. There is no "Rejected cashback" state — if a transaction is rejected, the associated cashback record is Voided, not "Rejected."

---

## 5. 60-Day Rolling Validity Rule

- The 60-day countdown applies **only** to cashback records in **Cleared** status.
- The countdown starts from the **Cleared date** (the date the record transitions from Pending to Cleared).
- **Pending cashback never expires.** No countdown runs while a record is Pending.
- If a Cleared record has not transitioned to Paid within 60 days, it automatically moves to **Expired** (terminal).
- Expired cashback is visible to the user in history as "Expired."
- The user sees the "Valid until" countdown on all Cleared (Available) cashback records.
- A 7-day warning notification is sent before Cleared cashback expires (see §11).

---

## 6. Wallet and Balance Computation

### 6.1 Available Balance

- The available balance shown to the user **includes only Cleared cashback records.**
- Pending cashback is displayed separately as "In Review" and is **not** included in the available balance.
- Locked cashback is displayed as "Sent to payout" and is **not** included in the available balance.
- Paid and Expired cashback appear in history only.

### 6.2 Payout Threshold Calculation

- The payout threshold is calculated from **Cleared cashback only.**
- Pending records do not count toward the threshold.
- Locked records (already in payout pipeline) do not count toward the threshold; they were already counted when they were Cleared.

### 6.3 Credit Events

- A new cashback record (status: Pending) is created when:
  - The user scans a valid QR code
  - The user uploads a receipt photo
  - OCR processing completes and the transaction record is created

### 6.4 Debit Events

- Cleared → Expired: balance reduced (record no longer Available)
- Cleared → Locked: balance reduced (record moved to payout pipeline)
- Cleared → Voided: balance reduced (record annulled)

### 6.5 IBAN Requirement

- IBAN is **not required** to view the wallet or accumulate cashback.
- IBAN **is required** before an automatic payout can proceed. If the user reaches the payout threshold without an IBAN on file, the system sends a notification prompting them to add one; the payout is held until IBAN is saved, then triggered automatically.

### 6.6 Dashboard Cashback Block Display Requirement

*(Source: `03-user-module-final.md §4`)*

The dashboard cashback block must display **available (Cleared), pending (Pending), and expiring (Cleared with ≤7 days remaining) cashback simultaneously** when those states exist. All three states appear as distinct line items — they are not collapsed or aggregated into a single total.

| Dashboard Cashback Line | Condition for Display | Underlying State |
|-------------------------|-----------------------|-----------------|
| Available cashback | At least one Cleared record exists | Cleared records |
| Pending cashback | At least one Pending record exists | Pending records |
| Expiring cashback | At least one Cleared record has ≤7 days remaining before its 60-day expiry | Cleared records nearing expiry |

See §3.5.1 for the full dashboard layout including subscription block, recent transactions, and primary CTA.

### 6.7 Cashback & Transactions Screen Detail

*(Source: `03-user-module-final.md §6.2`)*

| Element | Detail |
|---------|--------|
| Period filters | Last 7 days / Last 30 days / All |
| Status filters | All / Pending (Чакащ) / Available (Наличен) / Locked (Заключен за плащане) / Paid (Изплатен) / Expired (Изтекъл) / Voided/Cancelled (Анулиран). "Rejected" is a transaction/receipt status only — not a cashback filter option. |
| List columns | Partner name, date, purchase amount, cashback amount, status, valid until |
| Transaction detail view | Receipt image, QR session reference, location, timestamp, rejection reason (if transaction was rejected) |
| User constraint | User cannot modify transactions, receipt data, amounts, or statuses from this screen. |

---

## 7. Payout Flow and Threshold Rules

> **There is no user-initiated payout action.** Payouts are triggered automatically by the system when the threshold is reached. The only payout-related action available to the user is saving their bank account details (IBAN + beneficiary name) via the profile screen.

### 7.1 Trigger

An automatic payout is triggered by the nightly scheduler when the user's Cleared cashback balance reaches the **plan-specific payout threshold.** The user does not initiate this; there is no "Request Payout" button or endpoint.

### 7.2 Payout Eligibility Matrix

| Condition | New Payouts Allowed? |
|-----------|:---:|
| `subscription_status` = Active | Yes |
| `subscription_status` = Cancelled (within paid period) | Yes |
| `subscription_status` = Cancelled (post period end) | No |
| `subscription_status` = Expired | No |
| `subscription_status` = Failed Payment | No |
| In-flight payouts (already Locked or in process) | Yes — always continue |

### 7.3 Step-by-Step Payout Process

**If IBAN is missing when threshold is reached:**
1. System prompts the user: "Enter bank account to receive payout"
2. User enters IBAN
3. System initiates payout automatically
4. User notified: "Payout sent"

**If IBAN is present when threshold is reached:**
1. System automatically initiates payout
2. User notified: "Payout sent"

In both paths: Cleared records move to Locked status while the payout is in processing, then to Paid when the payout process completes.

### 7.4 Failed Payout Handling

| Failure | Action | User Notified? |
|---------|--------|:---:|
| First failure (invalid IBAN) | Notification sent to user requesting IBAN correction | Yes |
| Second failure | Record flagged High risk; routed to manual admin review | No — user sees cashback status remain as "Sent to payout" |

The user is NOT informed that a second failure triggered manual review. The cashback record remains visible as "Sent to payout" (Locked status) during this process.

---

## 8. QR Code Scanning Flow

### 8.1 Prerequisites (All Must Be Met)

| Condition | Required State |
|-----------|---------------|
| `user_account_status` | Active |
| `subscription_status` | Active, OR Cancelled within the paid period |
| IBAN | Not required for scanning (only for payouts) |

### 8.2 Blocked Scenarios

Scanning is blocked when any of the following is true:
- `user_account_status` = Inactive — app shows "Account paused" CTA
- `user_account_status` = Archived — full access blocked
- `subscription_status` = Failed Payment — app shows "Subscription payment failed" CTA
- `subscription_status` = Expired
- `subscription_status` = Cancelled (post period end)

### 8.3 Allowed Edge Case

**Cancelled-within-paid-period:** Scanning continues through the last paid day; new cashback records can be generated during this window.

### 8.4 Full Scan Flow (Happy Path)

1. User opens the mobile app and initiates a QR scan.
2. App verifies prerequisites (§8.1). If any are unmet, scanning is blocked with appropriate UI feedback (§8.2).
3. User points camera at the QR code at the partner location.
4. App reads the QR token.
5. QR token is validated against the backend:
   - QR code must be in **Active** status.
   - If the QR code is Inactive (e.g., partner is Inactive/Archived), the app displays appropriate feedback — the user cannot complete the transaction.
6. A QR session is opened.
7. User uploads a receipt photo (see §9 for OCR flow).
8. OCR processes the receipt and matches it against the partner/location template.
9. Transaction record and cashback record are created with status **Pending**.
10. App confirms: receipt uploaded, cashback pending verification.

### 8.5 Error Paths

| Error | App Behaviour |
|-------|--------------|
| Account Inactive | Show "Account paused" + CTA to resume |
| Subscription Failed Payment | Show "Subscription payment failed" + CTA to update payment |
| Subscription Expired or post-Cancelled | Show subscription expired/blocked message |
| QR code Inactive | Display appropriate feedback; transaction cannot complete |
| QR code In Processing (physical replacement in progress) | Display appropriate feedback; transaction cannot complete *(Source: `05-consolidated-unified-spec.md` §3.6)* |
| QR code not found / invalid token | Display error; transaction cannot complete |

---

## 9. Receipt Upload and OCR Flow

### 9.0 Web Account — "Upload Receipt" Screen (Informational Redirect)

*(Source: `03-user-module-final.md` §6.3)*

The web account "Upload receipt" menu item is **purely informational**. No receipt upload or OCR processing takes place in the web browser. The screen:

- Displays the steps for using the mobile app (Scan QR → Pay → Upload receipt via app).
- Shows a "Download app" button and a QR code link pointing to the mobile app.
- Does **not** accept a receipt file or initiate a QR session.

This is distinct from the mobile OCR/QR flow described in §9.1–§9.5 below.

### 9.1 Upload Trigger

Receipt upload is initiated after a valid QR session is opened (see §8.4, step 6).

### 9.2 OCR Pipeline

1. User uploads a receipt photo within the active QR session.
2. The backend runs OCR on the uploaded image.
3. OCR confidence is computed and compared against the registered receipt template for the partner location.
4. The result feeds into the risk score:
   - OCR confidence **below 60%** → Receipt Match risk signal triggered → **+30 to risk score**
   - OCR confidence **60% or above** → No risk signal from this factor

### 9.3 Risk Assessment

Following OCR, the system computes the full additive risk score:

| Signal | Score Added |
|--------|-------------|
| IBAN changed in last 24h | +40 |
| Receipt match confidence < 60% | +30 |
| QR location mismatch (QR code location vs. geolocation at transaction time) | +20 |
| User has 3+ Voided records | +20 |
| Partner has active risk flag | +10 |

| Total Score | Risk Level |
|-------------|-----------|
| 0–20 | Low |
| 21–50 | Medium |
| 51+ | High |

The **risk level is internal-only and is NOT shown to the user.**

### 9.4 Acceptance and Rejection Paths

| Risk Level | Path | Outcome |
|------------|------|---------|
| **Low** | Automatic approval within 24 hours | Pending → Cleared |
| **Medium** | Automatic approval within 24 hours *(amended 2026-06-04 — see note)* | Pending → Cleared |
| **High** | Mandatory manual admin review | Pending → Cleared (approved) or Pending → Voided (rejected) |

> **Product decision (2026-06-04, signed off — ref BC-USER-SPEC-FIX-001 / gap finding F-010):** **Only High-risk submissions are routed to manual review** ("In Review / Pending verification"). **Low and Medium risk are auto-processed** (automatic approval within 24h). The earlier rule routing Medium to the same manual workflow as High is superseded. Rationale: manual review is reserved for genuinely high-risk receipts; mid-risk volume is auto-cleared to keep the user-facing flow fast. (`requiresManualReview` is therefore `riskLevel === 'High'` only.)

**Approval:** 60-day countdown starts from the Cleared date.  
**Rejection:** Record marked Voided with a reason category + optional internal note. The reason is visible to the user in their cashback history as "Cancelled" + reason.

### 9.5 User-Visible States During and After OCR

- During processing (**High-risk submissions only**, per §9.4 amendment): "In Review / Pending verification"
- After approval: "Available" with 60-day countdown
- After rejection: "Cancelled" + visible reason

> **Product decision (2026-06-04, signed off — ref BC-USER-SPEC-FIX-001 / gap finding F-010):** The "In Review / Pending verification" processing state is shown for **High-risk submissions only**. Low- and Medium-risk submissions are auto-processed (§9.4) and progress directly to "Available" on auto-approval without dwelling in a user-visible "In Review" state. This supersedes the prior reading that *all* submissions must display an "In Review" state.

---

## 10. Earned-Rights Model

**Definition:** Cashback earned during an active subscription period belongs to the user and continues to be payable even if the subscription status subsequently changes.

**Rules:**
- In-flight payouts (records already in Locked or Paid status) **always continue** regardless of subsequent changes to `subscription_status`.
- New payouts are gated by subscription status at the time of initiation (see §7.2).
- The distinction is between *new* payout initiation (subscription-gated) and *in-flight* payouts (subscription-independent).

---

## 11. User-Facing Notifications

### 11.1 Canonical User Notification Categories

| Category | Events Covered | Can User Opt Out? |
|----------|---------------|:---:|
| **Payment** | Subscription charge, payment method updates, payment failures, subscription cancellation confirmation *(Source: 03-user-module-final.md §8)* | No — mandatory |
| **Transactional** | Profile created, QR session confirmation, receipt uploaded, cashback approved, transaction rejected, payout initiated ("Payout sent") *(Source: 03-user-module-final.md §8)* | No — mandatory |
| **Cashback Expiry** | 7-day warning before Cleared cashback expires | No — mandatory |
| **Marketing** | Campaigns, promotions, feature updates | Yes — email and phone consent toggles (separate) |

**Service/transactional notifications are mandatory and cannot be bypassed.** Payment, transactional, and cashback expiry notifications are not subject to marketing consent settings. Only Marketing notifications are consent-gated. *(Source: `03-user-module-final.md` §6.7)*

### 11.2 Specific Notification Triggers

| Trigger | Notification |
|---------|-------------|
| Successful subscription charge | Payment notification |
| Payment method updated | Payment notification |
| Subscription payment failed (Failed Payment status) | Payment failure notification |
| Subscription cancellation confirmed | Payment notification *(Source: 03-user-module-final.md §8)* |
| Profile created | Transactional notification *(Source: 03-user-module-final.md §8)* |
| QR session opened / receipt upload confirmed | Transactional notification |
| Cashback approved (Pending → Cleared) | Transactional notification *(Source: 03-user-module-final.md §8)* |
| Transaction rejected (Pending → Voided) | Transactional notification *(Source: 03-user-module-final.md §8)* |
| Automatic payout triggered (threshold reached + IBAN present) | "Payout sent" notification |
| Threshold reached but IBAN missing | Notification prompting user to add bank account details |
| Cleared cashback with 7 days remaining before expiry | Cashback Expiry warning |
| First payout failure (invalid IBAN) | Notification requesting IBAN correction |
| Auto-renew disabled + subscription approaching expiry | Pre-expiry reminder notification *(Source: `03-user-module-final.md` §7)* |

### 11.3 Intentional Asymmetry — What Users Are NOT Notified About

- **Account status changes** — Users are NOT notified when their `user_account_status` changes (Inactive, Archived). This is an intentional design decision (partners are notified; users are not).
- **Second payout failure escalation to manual review** — User is not informed of this; cashback remains displayed as "Sent to payout."
- **Risk level** — Never exposed to the user in any form.

### 11.4 Help Request Status Updates

Users can view the status of their own help/support requests (New, In Progress, Waiting, Closed, Cancelled) in the app. Email threading is supported — users can reply to request updates via email, and the email conversation is stored as a unified thread in the help system.

**Email threading markers (v1.2):**
- Primary: `X-BoomCard-Request-ID` header
- Fallback: `[#XXXX]` subject line pattern
- Plus-addressing (`request-1234@boomcard.bg`) is **deferred to v1.3** — v1.2 relies solely on the header and subject fallback

---

## 12. Help Requests — User Visibility

### 12.1 Channels

Users can submit support and dispute requests via:
- In-app form
- Email (parsed into a unified request)

**Email address conflict between sources:** `05-consolidated-unified-spec.md` §6.2 specifies `office@boomcard.bg`; `03-user-module-final.md` §6.9 specifies `support@boomcard.bg`. These refer to the same inbound-parsing role. This document follows `05-consolidated-unified-spec.md` as the authoritative source; therefore `office@boomcard.bg` is used wherever an inbound support email address is referenced. Implementors should note the discrepancy and confirm the final address with product before go-live.

### 12.2 Request Types Available to Users

`Support | Dispute | Change | Other`

### 12.3 Status Visibility for Users

| Status | User Can View |
|--------|:---:|
| New | Yes |
| In Progress | Yes |
| Waiting | Yes |
| Closed (history) | Yes |
| Cancelled (history) | Yes |

### 12.4 No SLA

Help requests have no defined SLA. This is distinct from Partner Applications, which have a 24h internal / 2-working-day external SLA.

---

## 13. Access Control, Permissions, and Profile Deletion

### 13.1 Permissions Matrix by Account Status

| Permission | Active | Inactive | Archived |
|------------|:---:|:---:|:---:|
| Log in | Yes | Yes | No |
| Scan QR codes | Yes (subscription permitting) | No | No |
| Generate new cashback | Yes (subscription permitting) | No | No |
| View cashback history | Yes | Yes | No |
| View account and subscription status | Yes | Yes | No |
| Submit support/dispute requests | Yes | Yes | No |
| Enter or update IBAN | Yes | Yes | No |
| View help request status | Yes | Yes | No |

### 13.2 Permissions Matrix by Subscription Status (Active Account)

| Permission | Active | Cancelled (within paid period) | Cancelled (post period end) | Expired | Failed Payment |
|------------|:---:|:---:|:---:|:---:|:---:|
| Scan QR codes | Yes | Yes | No | No | No |
| Generate new cashback | Yes | Yes | No | No | No |
| Receive automatic payout at threshold | Yes | Yes | No | No | No |
| In-flight payout continues | Yes | Yes | Yes | Yes | Yes |
| View history | Yes | Yes | Yes | Yes | Yes |

### 13.3 What the User Never Sees

- Risk level (Low / Medium / High) on any cashback record
- Internal admin notes attached to Voided records (only the reason category is shown)
- Admin identity on any action
- Whether a second payout failure triggered manual review

### 13.4 Profile Deletion

*(Source: `03-user-module-final.md` §6.8 and §10 implementation checklist)*

Profile deletion is a **distinct user-initiated action**, separate from subscription cancellation. Cancelling a subscription does not delete the profile; deleting the profile is a separate explicit step.

**Effects of profile deletion:**
- Account access is deactivated immediately.
- Marketing communication stops.
- Financial history (transactions, cashback records, payout records) is **retained** per applicable legal obligations, regardless of the deletion request.

**UX requirement:** The user must be shown a confirmation warning before the deletion is finalised. The action is not reversible once confirmed.

**Implementation constraint:** Profile deletion must not erase financial history. The deletion deactivates access and stops marketing; it does not remove financial records.

### 13.5 Profile Management — Edit, Email Change, Password Change

*(Source: `03-user-module-final.md` §6.8)*

**Editable profile fields:** First name, last name, email, phone, city, country. Accessed via an "Edit profile data" button.

**Email change flow (4 steps):**
1. User enters new email address.
2. Verification link sent to the new address.
3. User confirms with current password.
4. System checks new email for uniqueness before accepting.

**Password change:** A separate security flow, distinct from email change.

**Profile deletion:** Separate action from subscription cancellation — see §13.4.

### 13.6 Logout

*(Source: `03-user-module-final.md §6.10`)*

- Logout terminates the current session.
- After logout, the user is redirected to the public site or the login screen.
- The Logout action is the **last item** in the account navigation menu.
- No other functionality is available from the Logout item — it performs session termination only.

---

## 14. Archived Account Reactivation

An Archived user account can be reactivated through the following path:

1. User initiates a **password reset** via the email link flow.
2. User purchases a **new subscription**.
3. Account returns to Active status.

There is no self-service "reactivate" button for Archived accounts — the reactivation is gated on both password reset and new subscription purchase.

---

## 15. Favorites (Любими)

*(Source: `03-user-module-final.md` §6.5 — **this feature is not present in `05-consolidated-unified-spec.md`**)*

The user can bookmark partner locations by marking them as Favorites within the platform.

| Element | Requirement |
|---------|-------------|
| List | Displays all partner locations the user has bookmarked with the heart/favorites action. |
| "View" action | Opens the partner's internal location card on the site. |
| Remove action | User can remove a location from their Favorites list from this screen. |
| Empty state | Displays a "Browse BOOM locations" call-to-action button. |
| Constraint | The user cannot edit any partner profile data from this screen. |

---

## 16. Deferred Features

The following features are documented in the source spec or user module as pending a final product decision. They **must not be implemented** without explicit product confirmation.

| Feature | Status | Source |
|---------|--------|--------|
| **Nearby (Наблизо)** | Pending final product decision. Options: (A) dynamic list by user geolocation, (B) fallback to a static list of BOOM partner locations, (C) menu hidden until decision is made. | `03-user-module-final.md` §6.4 |
| **Plus-addressing email routing** (`request-1234@boomcard.bg`) | Deferred to v1.3. v1.2 uses `X-BoomCard-Request-ID` header + `[#XXXX]` subject pattern only. | `05-consolidated-unified-spec.md` §6.2 |

---

## 17. Currency Display Rules

- During the **BGN → EUR transition window**: all amounts are displayed in **both BGN and EUR simultaneously.**
- **After the transition window closes**: BGN display is hidden; amounts shown in **EUR only.**
- This rule applies to all monetary amounts visible to the user (cashback balances, payout amounts, transaction history).

---

## 18. Canonical Field Names and Terminology

### 18.1 Status Field Names

| Entity | Field Name | Values |
|--------|-----------|--------|
| User Account | `user_account_status` | Active, Inactive, Archived |
| Subscription | `subscription_status` | Active, Expired, Cancelled, Failed Payment |
| Cashback | `cashback_status` | Pending, Cleared, Locked, Paid, Expired, Voided |

### 18.2 Key Term Definitions

| Term | Definition |
|------|-----------|
| **IBAN** | International Bank Account Number. Optional at registration; required before payout initiation. |
| **QR** | Quick Response code. Location-specific token used to initiate a transaction at a partner location. |
| **OCR** | Optical Character Recognition. Used to process and match uploaded receipts against partner templates. |
| **Payout Threshold** | Plan-specific minimum Cleared cashback balance that triggers an automatic payout. |
| **Risk Level** | Internal-only classification (Low, Medium, High). Never shown to the user. |
| **Earned-Rights Model** | Principle that cashback earned during an active subscription period remains payable even after that subscription changes status. |
| **In-flight Payout** | A payout that has already been initiated (cashback record is Locked or Paid). Always continues regardless of subsequent subscription status changes. |

### 18.3 UI Localisation Note

Display names shown to end-users are translated (e.g., "Account paused" for Inactive status, "В обработка за плащане" for Locked cashback). The backend database uses the English qualified names listed above.

**Default language:** Bulgarian. English is used only if explicitly selected by the user. All notifications and UI defaults to Bulgarian unless the user has changed their language preference. *(Source: `03-user-module-final.md` §6.7)*

---

## 19. Data Integrity Atomic Rules (User Domain)

The following rules are non-negotiable constraints for any implementation:

1. **Scanning gate:** Receipt scanning is blocked if `subscription_status` is Expired, Cancelled (post period end), or Failed Payment. Scanning is also blocked if `user_account_status` is Inactive or Archived, regardless of subscription status.

2. **Cashback generation gate:** New cashback records are **never** created while scanning is blocked.

3. **Cancelled-within-period exception:** A user whose subscription is Cancelled but whose paid period has not yet ended retains full scanning rights and can generate new cashback through the last paid day.

4. **Cashback expiry applies only to Cleared records:** Only Cleared cashback has a 60-day countdown. Pending cashback never expires. Voided and Expired are terminal.

5. **Payout new vs. in-flight distinction:** New payout initiation requires Active or Cancelled-within-paid-period subscription status. In-flight payouts (Locked/Paid records) always continue regardless of subscription status.

6. **IBAN required at payout, not at signup:** A user without an IBAN can accumulate Cleared cashback but is prompted to enter an IBAN when the payout threshold is reached.

7. **Voided records require reason:** Every Voided cashback record requires a reason category, the responsible admin identity, and a timestamp. Voided is terminal — it cannot be reverted to Pending or Cleared.

8. **Risk level is internal-only:** Risk classification (Low, Medium, High) is never surfaced to the user in any UI or notification.

9. **Second payout failure is silent to user:** The user is not informed that a second payout failure has been escalated to manual review. Cashback remains displayed as "Sent to payout."

10. **Account status does not affect other users' QR access:** An individual user's account status change has no effect on QR codes at partner locations; those codes remain operational for all other users.

11. **Currency transition:** During the BGN→EUR transition window, all amounts are shown in both currencies simultaneously. After the window, BGN is hidden and EUR is shown exclusively.

12. **Password reset rate-limit:** The system alerts at 3 password reset attempts within 24 hours. At 5 reset attempts within 24 hours, the account is suspended pending Super Admin review.

13. **Trial period cashback voiding:** If a user cancels the subscription within the 24-hour trial period, all Pending cashback from that trial period is Voided. Voided trial cashback is excluded from the payout threshold and is not paid out. *(Source: `03-user-module-final.md` §2)*

14. **Profile deletion does not erase financial history:** Profile deletion deactivates account access and stops marketing. Transaction, cashback, and payout records are retained per applicable legal obligations. *(Source: `03-user-module-final.md` §6.8)*

15. **Dashboard upsell display:** For users on Basic and Premium Weekly plans, the dashboard may display a upsell prompt to upgrade to Premium Monthly. This is a conditional UI element, not a subscription gate. *(Source: `03-user-module-final.md` §6.1)*

---

*Extracted from BoomCard Unified Specification v1.2 (2026-05-29) and User Account Module Final. Source files: `05-consolidated-unified-spec.md`, `03-user-module-final.md`. Do not modify the source files.*
