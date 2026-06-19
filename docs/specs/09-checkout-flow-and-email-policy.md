# BoomCard Checkout Flow & Email Policy Specification
**Version 1.0**  
**Date:** 2026-06-19  
**Status:** Authoritative — governs BC-025 (email dedup), BC-026 (pre-payment account gate), and all checkout-adjacent implementations.

---

## Overview

This document specifies:
1. The **pre-payment account gate** — validating email before redirecting to Paysera (BC-026).
2. The **full plan-purchase flow** from plan selection to account-active — including the payment-first (anonymous checkout) onboarding path.
3. The **consolidated email policy** — what emails fire, when, and under what conditions (BC-025).
4. The **language and reply-to policy** for all transactional emails.

---

## Part 1: Pre-Payment Account Gate

### 1.1 Endpoint Contract

Before redirecting the user to the Paysera payment page, the frontend MUST call:

```
GET /api/auth/check-email?email=<url-encoded-email>
```

**Auth:** None required (public endpoint).  
**Rate limit:** Shares the auth rate limiter.

**Response body:**
```json
{
  "exists": boolean,
  "hasActivePlan": boolean,
  "currentPlan": "BASIC" | "PREMIUM_MONTHLY" | "PREMIUM_WEEKLY" | null,
  "subscriptionStatus": "ACTIVE" | "TRIALING" | "PAUSED" | null
}
```

- `exists` — `true` if any `User` record with this email already exists (regardless of role).
- `hasActivePlan` — `true` if the user has a `Subscription` with `status IN ('ACTIVE', 'TRIALING', 'PAUSED')`.
- `currentPlan` — plan code string of the matching subscription, or `null` if none.
- `subscriptionStatus` — status of the matching subscription (`"ACTIVE"`, `"TRIALING"`, or `"PAUSED"`), or `null` if none. Required for the frontend to detect the PAUSED case in the §1.2 decision tree.

**No sensitive data is returned** (no name, no IBAN, no payment history).

---

### 1.2 Decision Tree

After calling `/check-email`, the frontend applies the following decision tree before proceeding to checkout:

```
email entered by user
        │
        ▼
GET /check-email
        │
   ┌────┴────┐
   │ exists? │
   └────┬────┘
        │
      false ──────────────────────────────► proceed to Paysera checkout (new account flow)
        │
      true
        │
   ┌────┴────────────┐
   │ hasActivePlan?  │
   └────┬────────────┘
        │
      false ──────────────────────────────► show "Re-subscribe" banner
        │                                   User confirms → redirect to login
        │                                   (existing account, no active plan)
      true
        │
   ┌────┴──────────────────────────────────┐
   │ subscriptionStatus == 'PAUSED'?       │
   └────┬──────────────────────────────────┘
        │
      true ───────────────────────────────► BLOCK. Show:
        │                                   "Your plan is currently paused. Contact support to resume."
        │                                   No checkout allowed (backend initiate also blocks PAUSED).
      false
        │
   ┌────┴──────────────────────────────┐
   │ selectedPlan == currentPlan?      │
   └────┬──────────────────────────────┘
        │
      true ───────────────────────────────► BLOCK. Show:
        │                                   "You already have this plan. Log in to manage."
        │                                   No checkout allowed.
      false
        │
   ┌────┴───────────────────────────┐
   │ Is selectedPlan an upgrade or  │
   │ downgrade vs currentPlan?      │
   └────┬───────────────────────────┘
        │
        ▼
    Show plan-change confirmation modal:
    "You are currently on [currentPlan]. Switching to [selectedPlan] will [upgrade/downgrade] your plan."
    User confirms → redirect to login + authenticated plan-change flow
```

**Plan tier ordering for upgrade/downgrade detection:**

| Plan Code | Tier rank |
|---|---|
| `BASIC` | 1 |
| `PREMIUM_MONTHLY` | 2 |
| `PREMIUM_WEEKLY` | 3 |

`selectedRank > currentRank` → upgrade; `selectedRank < currentRank` → downgrade.

---

### 1.3 Implementation Notes

- The check must happen **before** the Paysera redirect, not after payment is captured.
- The check is **advisory** — the backend must also enforce account-existence at profile-completion time (`POST /api/auth/complete-profile`) to prevent race conditions.
- Email matching is **case-insensitive** (stored lowercase, compared lowercase).

---

## Part 2: Full Plan-Purchase Flow

### 2.1 New Account (Payment-First Onboarding)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as BoomCard API
    participant Paysera
    participant Email as Resend (email)

    User->>FE: Select plan, enter email
    FE->>API: GET /api/auth/check-email?email=
    API-->>FE: {exists: false}
    FE->>API: POST /api/checkout/initiate\n{planId, billingPeriod, email, language?}
    API->>API: Create PendingSubscription\nstatus=CREATED, expires 24h
    API-->>FE: {success:true, data:{orderId, paymentUrl, plan, amount, currency, billingPeriod}}
    Note over FE,API: (diagram shows logical fields; actual responses\nwrapped in {success:true, data:{...}})
    FE->>Paysera: Redirect to paymentUrl
    Paysera->>User: Payment page
    User->>Paysera: Completes payment
    Paysera->>API: GET/POST /api/checkout/callback\n{data, ss1}
    API->>API: Verify signature (MD5)
    API->>API: Update PendingSubscription\nstatus=PAID, token (30-min TTL)
    API->>Email: sendCompleteProfileEmail with token (fire-and-forget)
    Paysera->>FE: Redirect to /checkout/success?orderId=
    FE->>API: GET /api/checkout/status/:orderId (poll)
    API-->>FE: {success:true, data:{status:"PAID", token, tokenExpiresAt,\nisReadyForRegistration:true, plan:{code,nameBg}, billingPeriod, language}}
    FE->>User: Show complete-profile form
    User->>FE: Enter password (+ optional name, phone, marketing consent)
    FE->>API: POST /api/auth/complete-profile\n{token, password, firstName?, lang?, ...}
    API->>API: Atomic transaction:\n  create User (emailVerified=true)\n  create Subscription (ACTIVE)\n  create Card\n  create Wallet\n  create LoyaltyAccount\n  PendingSubscription → COMPLETED, token=null
    API->>Email: sendWelcomeEmail (fire-and-forget)
    API-->>FE: {success:true, message:"Account created successfully",\ndata:{user:{id,email,firstName,lastName,role},\naccessToken, refreshToken}}
    FE->>User: Logged in, home screen
```

**Key properties of this flow:**
- User is **never required to register before paying** — email is all that is collected pre-payment.
- `emailVerified` is set to `true` at account creation (email was used for payment — proof of ownership).
- The one-time registration `token` has a **30-minute TTL** from payment confirmation. After the token expires, the `PendingSubscription` row is still `PAID` and **is NOT deleted by the cleanup job** (which only removes `CREATED` and `FAILED` rows). Support can regenerate a token at any time by updating `token` + `tokenExpiresAt` on the existing `PAID` row — no refund is needed. The 24-hour `expiresAt` field applies only to `CREATED`/`FAILED` cleanup and has no effect on `PAID` rows.
- `PendingSubscription` records expire after **24 hours** if payment is never completed.
- The Paysera callback accepts both `GET` and `POST` — Paysera may use either.

---

### 2.2 Existing Account — No Active Plan (Re-subscribe)

When `/check-email` returns `{exists: true, hasActivePlan: false}`:

1. Frontend shows a re-subscribe confirmation: *"You already have a BoomCard account. Log in to re-subscribe."*
2. **The anonymous checkout path is blocked at `POST /api/checkout/initiate`** — the endpoint checks for any existing `User` with this email (regardless of role) and immediately returns `409 EMAIL_REGISTERED_NO_ACTIVE_PLAN` before any Paysera redirect. Payment is never captured for a registered email via this path.
3. **Required path (BC-026):** Prompt the user to log in. After login, offer plan purchase through the authenticated subscription endpoint (`POST /api/subscriptions/create` or `POST /:id/change-card`).

### 2.2.1 Existing Account — Active Plan PAUSED

When `/check-email` returns `{exists: true, hasActivePlan: true, subscriptionStatus: "PAUSED"}`:

1. Frontend shows: *"Your plan is currently paused. Contact support to resume."*
2. No checkout is allowed — backend returns `409 EMAIL_ALREADY_HAS_ACTIVE_PLAN` from `POST /api/checkout/initiate` (PAUSED is included in the blocked status set).
3. CTA: direct the user to the support/help flow.

> **Note on `409 Conflict` at `complete-profile`:** `POST /api/auth/complete-profile` also returns `409 Conflict` if a USER with the same email already exists, but this is a **race-condition guard only** — it does not fire in the normal re-subscribe scenario because `initiate` already blocks the flow before payment.

> **Implementation note (BC-026):** The check-email gate + login redirect must cover this case; the `initiate` block is a backend safety net, not the intended UX path for returning users.

---

### 2.3 Existing Account — Plan Change (Upgrade/Downgrade)

When `/check-email` returns `{exists: true, hasActivePlan: true, currentPlan: X}` and the user selects a different plan:

1. Frontend shows plan-change comparison modal (see §1.2).
2. User must be **logged in** to change plans — redirect to login.
3. After login, the plan change proceeds via `POST /api/subscriptions/:id/update-plan` (authenticated).
4. The anonymous checkout path is **not used** for plan changes.

---

### 2.4 Payment Failed / Cancelled

If Paysera returns a `failed` or `cancelled` status in the callback:
- `PendingSubscription.status` is set to `FAILED`.
- A payment-failed notification email is sent to the user.
- The frontend polling endpoint returns `{status: "FAILED", isReadyForRegistration: false}`.
- The user may restart checkout from the beginning (new `POST /api/checkout/initiate`).

---

### 2.5 Abandoned Checkout (Pending Payment Reminders)

> **Note:** The reminder behaviour described here is the **intended target state** for the anonymous checkout flow. The existing `pending-payment-reminders.ts` job targets a legacy `User(status=PENDING_PAYMENT)` + `Subscription(status=INCOMPLETE)` model and does NOT read from `PendingSubscription`. A new job scoped to `PendingSubscription` is required. This is tracked as O-6 in §8.

> **Lifecycle constraint:** The scheduler's `cleanupExpiredPendingSubscriptions` job deletes `CREATED` and `FAILED` `PendingSubscription` rows after `expiresAt` (24 hours from creation). The `1h` reminder fires well within this window. The `24h` reminder fires at the exact boundary and should run before cleanup. The `7d` reminder **cannot run against a row that has been deleted**. Any implementation of the 7d reminder must either (a) extend the cleanup window for `CREATED` rows to at least 8 days by using a separate `reminderExpiry` field or condition, or (b) copy the email address and plan info to a separate reminder-queue table before the 24h deletion, or (c) implement email capture in a separate model at checkout initiation.

When `PendingSubscription.status = 'CREATED'` (payment never completed), a scheduled job should send reminder emails at:

| Reminder | Fires at | Subject (EN) | Feasibility |
|---|---|---|---|
| `1h` | 1 hour after `createdAt` | "Complete Your BoomCard Subscription" | ✅ Record alive |
| `24h` | 24 hours after `createdAt` | "Don't Miss Out on BoomCard Premium Benefits!" | ⚠️ At cleanup boundary — send before deletion |
| `7d` | 7 days after `createdAt` | "Last Chance: Activate Your BoomCard Premium" | ❌ Requires separate reminder queue (see note above) |

- A reminder is sent at most once per interval per record (idempotent via `metadata.remindersSent` on `PendingSubscription`).
- Email language uses `PendingSubscription.language`.

---

## Part 3: Consolidated Email Policy (Target State — BC-025)

### 3.1 Current State (Before BC-025)

A new user completing a plan purchase receives **two BoomCard emails**:
1. Account setup / complete-profile email (`sendCompleteProfileEmail`) — fired at Paysera callback
2. Welcome email (`sendWelcomeEmail`) — fired when the user completes profile creation

Plus a third email from Paysera (not under BoomCard control).

This results in three emails total for a first-time subscriber — two from BoomCard, one from Paysera. `sendPaymentReceiptEmail` is already suppressed in the anonymous checkout callback path (`pending-checkout.routes.ts`) — it does not fire.

---

### 3.2 Target State (After BC-025)

**One BoomCard email per purchase event** (plus the separate welcome email at registration), with the purchase-event email content varying by account type:

| Scenario | BoomCard emails at purchase | BoomCard emails at registration | Total (excl. Paysera) |
|---|---|---|---|
| New account | **1** (combined activation email) | **1** (welcome email) | **2** |
| Existing account, re-subscribe | **1** (subscription confirmation) | none | **1** |
| Payment failed | **1** (payment failed notification) | none | **1** |

Paysera always sends its own payment receipt independently (not suppressed by BoomCard).

**What changes with BC-025:**
- `sendPaymentReceiptEmail` is already suppressed in the anonymous checkout callback path (`pending-checkout.routes.ts`) — this part is done.
- `sendCompleteProfileEmail` already contains enough payment context (plan name, amount, order ID) to inform the user. It is the single notification at payment time.
- `sendWelcomeEmail` at profile-completion is retained as a distinct post-registration event (different trigger, different content).

**Rationale:** The receipt email fires immediately before the setup email in the same callback — from the user's perspective they arrive together and the receipt adds no information the setup email doesn't already provide.

---

### 3.3 Combined Activation Email Spec (New Account Flow)

The merged email MUST contain:

1. **Header:** "Payment confirmed — complete your account setup"
2. **Payment summary block:**
   - Plan name (BG name if language=bg, EN if language=en)
   - Amount paid + currency
   - Order ID
3. **Account setup CTA:**
   - Button: "Complete Account Setup" → `{FRONTEND_URL}/complete-profile?token={token}`
   - Expiry warning: "This link expires in 30 minutes."
4. **Footer:** Support contact, copyright.

**When to fire:** Immediately after `PendingSubscription.status` is set to `PAID` in the Paysera callback handler.

---

### 3.4 Subscription Confirmation Email Spec (Existing Account)

Used when an existing logged-in user purchases or changes a plan (authenticated flow):

1. **Header:** "Subscription activated!"
2. **Plan summary block:**
   - Plan name
   - Order ID
   - Amount paid
   - Next billing date (if available)
3. **CTA:** "Go to Dashboard"
4. **Footer.**

This email is fired from `subscriptionService` or the authenticated payment flow, not from the anonymous checkout callback.

---

## Part 4: Language & Reply-To Policy

### 4.1 Language Selection (§7.1)

All transactional emails are sent in **Bulgarian (`bg`) by default**.

English (`en`) is used **only when**:
1. The user explicitly passed `language: 'en'` in `POST /api/checkout/initiate` (persisted on `PendingSubscription.language`), **OR**
2. The user has `preferredLanguage = 'en'` in their `User` record.

**Rules by role:**
- **Users (subscribers):** Language resolved from checkout `language` field or `user.preferredLanguage`.
- **Partners:** Always Bulgarian. No language toggle in v1.x.
- **Admins:** Always Bulgarian.
- **Pre-registration (PendingSubscription):** Language from checkout `initiate` request body. Falls back to `Accept-Language` header; defaults to `bg`.

The language selected at checkout is preserved through the full registration flow so the welcome email and any other post-registration emails use the same language the user chose at checkout.

**Frontend implementation requirement:** When calling `POST /api/auth/complete-profile`, the frontend MUST pass `lang` using the language from the checkout flow (available in the `PendingSubscription` via `GET /api/checkout/status/:orderId`). If `lang` is omitted from the complete-profile body, it defaults to `'bg'` in the backend, silently discarding the user's language preference.

---

### 4.2 Reply-To Policy (§9.5)

| Audience | Reply-To address | Source |
|---|---|---|
| Subscribers | `reply_to_email` system setting | Default: `support@boomcard.bg` |
| Partners | `partner_reply_to_email` system setting | Fallback: `office_email` setting (`office@boomcard.bg`) |
| Explicit override | Caller-supplied `replyTo` field | Always takes precedence |

If `reply_to_email` is empty (not configured), the `Reply-To` header is omitted entirely for subscriber emails.

---

### 4.3 Sender Identity

| Field | Source | Default |
|---|---|---|
| From address | `from_email` system setting | `noreply@boomcard.bg` |
| From name | `sender_name` system setting | `BoomCard` |
| Provider | Resend (`RESEND_API_KEY`) | — |

Emails are only sent in production (when `RESEND_API_KEY` is set and `NODE_ENV === 'production'`). In development, emails are logged only — no actual delivery.

---

## Part 5: Complete Transactional Email Inventory

### 5.1 Checkout / Subscription Lifecycle

> **Current vs. target:** This inventory reflects the **target state after BC-025**. `sendPaymentReceiptEmail` is already suppressed in the anonymous checkout callback path — O-3 is implemented. The merged activation email template (O-4) remains the outstanding BC-025 work.

| Trigger | Method | Audience | Language |
|---|---|---|---|
| Payment confirmed (new account) | `sendCompleteProfileEmail` (→ merged activation email after BC-025) | New subscriber | From checkout `language` |
| Payment confirmed (existing account) | `sendSubscriptionActivatedEmail` | Existing subscriber | From `user.preferredLanguage` |
| Payment failed / cancelled | `sendPaymentFailedEmail` | Subscriber (pre-registration) | From checkout `language` |
| Account created (complete-profile) | `sendWelcomeEmail` | New subscriber | From `lang` field in complete-profile body |
| Subscription cancelled | `sendSubscriptionCancelledEmail` | Subscriber | From `user.preferredLanguage` |
| Subscription expired (post grace period) | `sendSubscriptionExpiredEmail` | Subscriber | From `user.preferredLanguage` |
| Trial refund requested | `sendTrialRefundPendingEmail` (user) + `sendAdminTrialRefundAlert` (admin) | Subscriber + admin | From `user.preferredLanguage`; admin email always EN |
| Renewal reminder | `sendRenewalReminder` | Subscriber | From `user.preferredLanguage` |
| Pending checkout reminder (1h / 24h / 7d) | `sendPendingPaymentReminder` | Pre-registration email | From `PendingSubscription.language` |

### 5.2 Account & Auth

| Trigger | Method | Audience | Language |
|---|---|---|---|
| Password reset OTP | `sendPasswordResetEmail` | Any user (user/partner/admin) | From `language` param or `bg` |

### 5.3 Receipt & Cashback

| Trigger | Method | Audience | Language |
|---|---|---|---|
| Receipt submitted | `sendReceiptConfirmation` | Subscriber | From `user.preferredLanguage` |
| Receipt approved | (cashback approved email — method TBD) | Subscriber | From `user.preferredLanguage` |
| Receipt rejected | (receipt rejected email — method TBD) | Subscriber | From `user.preferredLanguage` |

### 5.4 Partner

| Trigger | Method | Audience | Language |
|---|---|---|---|
| Contract change approved/rejected | `sendPartnerContractChangeEmail` | Partner | Always `bg` |
| Menu approved/rejected | `sendMenuApprovedEmail` / `sendMenuRejectedEmail` | Partner | Always `bg` |

---

## Part 6: PendingSubscription Data Model

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | string | Lowercase email collected at checkout |
| `planId` | UUID → Plan | FK to Plans table |
| `billingPeriod` | `weekly \| monthly \| yearly` | Billing period selected at checkout. All three values are fully supported. BASIC and PREMIUM both have active yearly prices (`hasYearlyOption=true`). |
| `language` | `bg \| en` | Language selected at checkout (default `bg`) |
| `payseraOrderId` | string | `BOOM-CHK-{timestamp}-{hex}` — used as Paysera order reference |
| `status` | enum | See status transitions below |
| `token` | string? | One-time 64-hex registration token (set on PAID, nullified on COMPLETED) |
| `tokenExpiresAt` | datetime? | Token TTL: 30 minutes from PAID transition |
| `paidAt` | datetime? | Timestamp of PAID transition |
| `completedAt` | datetime? | Timestamp of COMPLETED transition |
| `expiresAt` | datetime | Record expiry: 24 hours from creation |
| `metadata` | JSON? | Reminder tracking: `{remindersSent: {"1h": ISO, "24h": ISO, "7d": ISO}}` |

**Status enum values:** `CREATED | PAID | COMPLETED | EXPIRED | FAILED`

**Status transitions:**
```
CREATED → PAID      (Paysera callback, payment success)
CREATED → FAILED    (Paysera callback, payment failed/cancelled)
PAID    → COMPLETED (POST /api/auth/complete-profile success)
```

`COMPLETED`, `FAILED`, and `EXPIRED` are terminal states.

> **EXPIRED note:** Records past `expiresAt` (24h TTL) are periodically **deleted** by the scheduler cleanup job rather than transitioned to `EXPIRED`. The `EXPIRED` enum value exists in the schema for forward compatibility but the current implementation does not write it. Do not treat the absence of an `EXPIRED` record as evidence of completion — always query by `payseraOrderId` and check `expiresAt` if needed.

---

## Part 7: Security Constraints

1. **Token exposure:** The registration token is exposed **only** via `GET /api/checkout/status/:orderId` when `status === 'PAID'`. It is never returned for `COMPLETED`, `EXPIRED`, or `FAILED` statuses.

2. **Paysera callback verification:** Every callback is verified using an MD5 signature (`ss1`; `ss2` verification is currently skipped in the implementation). The signature is computed as `MD5(data + signPassword)`. Callbacks with invalid or missing signatures are silently acknowledged (200 OK, no 4xx) but not processed — Paysera must not retry indefinitely. **Observability requirement:** Every invalid-signature callback MUST be logged at `warn` level with the failure reason. The `orderId` is unavailable at signature-check time (it is embedded inside the `data` blob that cannot be decoded until the signature is validated), so it MUST NOT be required in the log entry. The current implementation (`paysera.service.ts`) satisfies this requirement — it logs at `warn` with the failure reason string (e.g. `'Invalid MD5 signature (ss1)'`). The raw `data` field (truncated or hashed for production diagnosability) is not currently included in the log entry; this gap is tracked as O-8.

3. **Redirect domain allowlist:** `successUrl` and `cancelUrl` supplied by the client are validated against an allowlist of BoomCard domains. Arbitrary redirect URLs are silently replaced with default redirect URLs.

4. **Account creation idempotency:** `POST /api/auth/complete-profile` returns `409 Conflict` if a `User` with `role='USER'` and the same email already exists. This prevents race conditions from double-submit.

5. **Payment rate limiting:** `POST /api/checkout/initiate` is rate-limited to prevent checkout spam.

---

## Part 8: Open Items (Pending BC-025 / BC-026 Implementation)

| # | Item | Blocking task |
|---|---|---|
| O-1 | `/api/auth/check-email` endpoint does not yet exist | BC-026 |
| O-2 | Frontend plan-selector does not call check-email before checkout | BC-026 |
| O-3 | ~~`sendPaymentReceiptEmail` still fires in checkout callback~~ — **Already implemented.** Receipt email suppression is live in `pending-checkout.routes.ts`. | BC-025 ✓ |
| O-4 | `sendCompleteProfileEmail` needs updated template that includes payment summary inline | BC-025 |
| O-5 | Re-subscribe / plan-change frontend flow (from check-email gate) not yet wired | BC-026 |
| O-6 | No reminder job targets `PendingSubscription` (existing job uses User/Subscription model) | BC-026 or new task |
| O-7 | `GET /api/checkout/status/:orderId` does not yet return `language` in the response — required by §4.1 for the frontend to pass correct `lang` to `complete-profile` | BC-026 |
| O-8 | Invalid-signature callback log entries do not include the raw `data` field (truncated or hashed). Adding it would allow operators to correlate rejected callbacks with Paysera records without decoding unverified input. See §7.2. | BC-025 or new task |

Once BC-025 and BC-026 are complete, the "Current State" notes in §3.1 and §2.2 should be removed and this document updated to reflect the implemented behaviour.

---

*This specification supersedes any inline comments in `pending-checkout.routes.ts`, `auth.routes.ts`, and `email.service.ts` that describe checkout email behaviour. The code comments remain as implementation cross-references (§7.x references) but this document is the authoritative source.*
