# BoomCard — Admin Panel Reference Specification

**Extracted from:** 05-consolidated-unified-spec.md (Version 1.2, 2026-05-29)  
**Purpose:** Standalone reference for engineers implementing or auditing the Admin Panel.  
**Scope:** All entities, state machines, workflows, permissions, business rules, financial controls, risk management, notification triggers, data integrity constraints, and clash-resolution decisions that the Admin Panel owns, enforces, or acts as the primary actor in.  
**Excluded:** Partner Portal self-service (§4.x), User App experience (§5.x), Implementation priority tiers (§9.x).

---

## Part 1 — Entity State Machines

### Source §1.1 — User Account Lifecycle

**Status Field Name:** `user_account_status`  
**Status Enum (source spec):** `Active | Inactive | Archived`  
**Additional UserStatus values in DB schema** *(implementation extension — not in source spec):* `PENDING_VERIFICATION | PENDING_PAYMENT | DELETED | SUSPENDED`. These values exist in the `UserStatus` Prisma enum. Their admin panel handling is not defined in the source spec.

| Status | Definition | Login Access | Scan Receipts | View History | QR Behavior |
|--------|-----------|------|------|------|------|
| **Active** | Normal operation. User can subscribe, scan, transact, and manage account. | Yes | Yes | Yes | No special behavior. User can scan any active QR code at partner locations. |
| **Inactive** | Temporary pause. User can log in, view history, and submit support requests, but cannot scan receipts or generate new cashback. | Yes | No | Yes | No impact on QR codes. The user's scan access is blocked at the application level. QR codes at partner locations remain operational for other users. Mobile app shows "Account paused" UI and CTA to resume. |
| **Archived** | Historical status. No access. Data retained for history and accounting. | No | No | No | No impact on QR codes. The user's scan access is fully removed. QR codes at partner locations remain operational for other users. |

**Key Behaviors:**

- Inactive is a distinct status from Archived — it preserves read-only access and is reversible.
- Archived is terminal for operational purposes (no login, no transactions) but retains all history.
- User account status controls only that user's ability to scan. QR codes are managed by admin at the location level and remain active for other users regardless of any individual user's account status. (QR auto-deactivation applies to partner accounts — see §1.4.)
- Archived reactivation: Users self-reactivate via password reset link + new subscription purchase (source §9 Tier 2 / Clash 2.4).

**Admin Panel — Editable Fields (User Management):**

- Account status (Active / Inactive / Archived)
- Profile: name, email, phone, address, IBAN
- Risk profile
- Subscription and cashback history (view only)

---

### Source §1.2 — Subscription Status Lifecycle

**Status Field Name:** `subscription_status`  
**Status Enum (source spec):** `Active | Expired | Cancelled | Failed Payment`  
**Additional Stripe-mapped statuses in DB schema** *(implementation extension — not in source spec):* `PAST_DUE | INCOMPLETE | INCOMPLETE_EXPIRED | TRIALING | UNPAID | PAUSED`. These Stripe-derived values exist in the `SubscriptionStatus` enum in the Prisma schema and are stored for audit purposes. Their admin panel handling (display, scanning gate, payout eligibility) is not defined in the source spec and should be confirmed with product before implementing.

| Status | Definition | Receipt Scanning Blocked? | Payout Gate Open? | New Cashback Generated? |
|--------|-----------|------|------|------|
| **Active** | Current valid subscription. User can scan and earn cashback. | No | Yes | Yes |
| **Expired** | Previous subscription ended naturally (no auto-renewal or manual renewal). User cannot scan; cannot initiate new transactions. Existing cashback is unaffected. | Yes | No (new); Yes (in-flight) | No |
| **Cancelled (within paid period)** | User cancelled but period has not yet ended. Access continues through the last paid day. | No (scanning allowed through period end) | Yes | No |
| **Cancelled (post period end)** | Paid period has elapsed. Auto-transitions to Expired. | Yes | No | No |
| **Failed Payment** | Automatic renewal failed (declined card, insufficient funds, etc.). One-time attempt, no retry period. User cannot scan; must fix payment method to resume. | Yes | No (NEW records) | No |

**Critical Rules:**

- One renewal attempt at scheduled date. If it fails, subscription moves to Failed Payment status immediately (no retry period).
- Failed Payment blocks receipt scanning immediately.
- New cashback records are never generated while subscription status blocks receipt scanning (Expired, Cancelled post-period, Failed Payment).
- Cancelled-within-paid-period allows scanning and new cashback generation until the last paid day, after which the subscription auto-transitions to Expired.
- In-flight payouts always continue regardless of subscription status changes (earned-rights model).

**Admin Panel — Display:**

- Plan type (Basic, Premium Weekly, Premium Monthly)
- Subscription status (Active, Expired, Cancelled, Failed Payment)
- Payment history
- Renewal date and auto-renewal setting

---

### Source §1.3 — Cashback State Machine

**Status Field Name:** `cashback_status`  
**Status Enum (source spec §1.3):** `Pending | Cleared | Locked | Paid | Expired | Voided`  
**Additional implementation status (codebase only, not defined in source spec):** `TrialPending`

| Status | Definition | Visible to User | Expiry Countdown | Counts Toward Payout Threshold | Notes |
|--------|-----------|------|------|------|------|
| **Pending** | Awaiting automatic approval or manual risk review. | Yes ("In Review") | No | No | 60-day rolling timer does NOT start. User sees "Pending verification." |
| **TrialPending** *(implementation extension — not in source spec §1.3; source: `src/jobs/scheduler.ts` `resolveTrialPendingCashback()`)* | Earned during the new-subscriber 24-hour trial window (`trialRefundEligibleUntil`). Held in escrow until the trial window closes. NOT visible to the user as redeemable balance. Admin can see and filter these records. | No (hidden from user balance) | No | No | Automatically resolved by the daily scheduler (5:30 AM): promoted to Cleared once `trialRefundEligibleUntil` has passed and the subscription was not cancelled; Voided if the subscription was cancelled within the trial window. Admin cannot manually approve or reject TrialPending records. |
| **Cleared** | Approved and valid. 60-day rolling validity starts from Cleared date. | Yes ("Available") | Yes (60 days) | Yes | Visible in available balance and payout threshold calculations. |
| **Locked** | In payout processing pipeline. Intermediate state, NOT terminal. | Yes ("Sent to payout") | No | No (already counted in Cleared) | Introduced to resolve the contradiction: Paid can return to manual review because Locked represents the operational state during payout, not after. |
| **Paid** | Payout initiated. (Does NOT mean funds received; means payout process started.) | Yes ("Paid" in history) | No | No | Paid records continue payout process even if subscription status changes post-Paid. |
| **Expired** | 60-day rolling validity elapsed without transitioning to Paid. Terminal. | Yes ("Expired") | N/A | No | Non-Cleared cashback (e.g., Pending forever) does NOT expire; only Cleared records have 60-day timer. |
| **Voided** | Annulled by manual decision. Reason and responsible admin recorded. Terminal. | Yes ("Cancelled" + reason) | N/A | No | Visible in history with reason category and optional internal note. |

**State Transitions (enforced by admin backend):**

```
TrialPending → {Cleared (scheduler, after trial window), Voided (scheduler, if subscription cancelled within window)}
Pending → {Cleared, Voided}
Cleared → {Locked, Expired, Voided}
Locked  → {Paid, Voided (implementation extension — not in source spec §1.3; route accepts "any active state → Voided")}
Paid    → Paid (terminal for operational flow; can be investigated for disputes)
Expired → Expired (terminal)
Voided  → Voided (terminal)
```

**Critical Insight (Clash 3.1/3.2):** The Locked status resolves the contradiction between "Paid is terminal" and "Paid records may need re-review." Locked is the intermediate state during payout, allowing Paid records to persist in the system for further investigation without reverting cashback status.

**Admin Manual Actions:**

- Approve Pending → Cleared (starts 60-day countdown from approval date)
- Reject Pending → Voided (requires reason category + optional internal note; responsible admin and timestamp recorded)
- Cleared → Locked (initiates payout pipeline)
- Locked → Paid (marks payout complete; terminal)
- Void: Pending → Voided or Cleared → Voided *(source spec §1.3)*; also Locked → Voided *(implementation extension — route accepts "any active state → Voided"; not in source spec §1.3)*

**Admin Automation:**

- Pending records with Low **or Medium** risk score (0–50) auto-approve within 24 hours. *(Amended per BC-USER-SPEC-FIX-010 §9.4, 2026-06-04: the Medium band 21–50 now auto-approves the same as Low; only High risk (51+) enters mandatory manual review.)*
- Cleared records automatically expire after 60 days if not transitioned to Paid.
- Locked records have no automatic resolution; admin must manually transition to Paid.

**Constraints on Voiding:**

- Every Voided cashback record requires: reason category + responsible admin identity + timestamp.
- Voided records remain visible to the user in history with the reason displayed.
- Voided is terminal — cannot be reverted to Pending or Cleared.
- *(Implementation conforms):* The structured "reason category" is now enforced via a controlled vocabulary (`cashbackLifecycle.service.ts` `VOID_REASON_CATEGORIES`). Every void reason must start with one of the canonical category codes: `DUPLICATE`, `FRAUD`, `SYSTEM_ERROR`, `ADMIN_CORRECTION`, `PARTNER_DISPUTE`, `OTHER`. The accepted format is `"CATEGORY"` or `"CATEGORY: free-text description"`; an empty reason or a non-canonical category prefix is rejected. The same validation is shared by all void paths (Pending/Cleared→Voided and Locked→Voided).

---

### Source §1.4 — Partner Account Lifecycle

**Status Field Name:** `partner_account_status`  
**Status Enum:** `Active | Inactive | Archived`

| Status | Definition | Login | View Transactions | Submit Support | Visible in Public Site | New Transactions |
|--------|-----------|------|------|------|------|------|
| **Active** | Normal operation. Partner can log in, view transactions, and operate locations. | Yes | Yes | Yes | Yes (status visibility rule applies) | Yes |
| **Inactive** | Temporary pause. Partner retains read-only access to history; cannot operate new transactions. | Yes | Yes (read-only) | Yes | No (status rule overrides visibility field) | No |
| **Archived** | Historical status. No login, no operational access. | No | No | No | No | No |

**Visibility Rule (status takes precedence):**

- Active → Partner visible in public site.
- Inactive or Archived → Partner hidden from public site regardless of any separate visibility field setting.
- This precedence rule is enforced consistently in the admin panel, the API, and the frontend (Clash 9.1).

**The `reason`/`sub_type` field** distinguishes voluntary pause (Пауза) from admin-imposed deactivation (Спрян) within the Inactive status. The canonical enum is not extended; sub-type is a metadata field.

**QR Code Behavior on Partner Status Change (enforced by admin backend):**

- Transition to Inactive or Archived → All QR codes for that partner automatically deactivate.
- Transition back to Active from Inactive → All QR codes automatically reactivate (no manual regeneration needed). Exception (Clash 2.4): reactivation from Archived status requires explicit admin reactivation per QR code — no auto-reactivation.
- QR codes cannot be manually activated while the partner is Inactive or Archived.
- Mobile app displays appropriate feedback when scanning inactive QR codes.

**Archived Reactivation (Clash 2.4):** Partners reactivate via admin action + new onboarding review. QR codes require explicit admin reactivation per code (not auto-reactivated).

**Admin Panel — Active Partner Management:**

- View by status (Active, Inactive, Archived)
- Edit commission rate, business category, visibility field
- Manage locations and QR codes
- View transaction history

---

### Source §1.5 — Admin Account Lifecycle

**Status Field Name:** `admin_account_status`  
**Status Enum:** `Active | Inactive | Archived`

| Status | Definition | Login Access | Operational Rights |
|--------|-----------|------|------|
| **Active** | Normal operation. Admin can perform all actions permitted by their role. | Yes | Full (per assigned role) |
| **Inactive** | Temporary restriction. Admin can log in but operational rights are limited: read-only access; cannot approve, reassign, or modify records. | Yes | Limited (read-only) |
| **Archived** | Departed or decommissioned admin. No login access. All historical actions and audit records are retained. | No | None |

**Key Behaviors:**

- Inactive is reversible; Archived is terminal for operational purposes.
- All admin actions are recorded in the Action History regardless of the admin's current status.
- Only a Super Admin can change another admin's status.
*(Implementation detail — not in source spec §1.5):* Status change to Archived or Suspended stamps `rolesUpdatedAt`, which immediately invalidates all live access tokens for that admin. Status change to Inactive does NOT stamp `rolesUpdatedAt` — existing tokens coast to natural expiry (read-only operational mode per spec §1.5).
*(Implementation detail — not in source spec §1.5):* The system prevents any status change (Inactive, Suspended, or Archived) that would leave zero active Super Admins: the PATCH /status request returns HTTP 409.

**Legacy Status Note** *(implementation extension — not in source spec):* The backend accepts a fourth value `SUSPENDED` for historical records. `SUSPENDED` is functionally equivalent to `Archived` (no login). New decommissions should use `ARCHIVED`. The spec enum (`Active | Inactive | Archived`) is canonical for all new work.

---

### Source §1.6 — Partner Application Status Lifecycle

**Status Field Name:** `partner_application_status`  
**Status Enum:** `New | Communication | Negotiation | Onboarding | Approved | Rejected`

| Status | What Happens | Partner Access | Admin SLA |
|--------|-----------|------|------|
| **New** | Application received from website form. No action taken. | None | 24h (internal) |
| **Communication** | Initial contact established. Responsible admin assigned. | None | 24h (internal) |
| **Negotiation** | Terms and commission discussed. | None | — |
| **Onboarding** | Terms accepted. Partner Account created with Inactive status. Partner gets read-only access to profile data entry. | Read-only | — |
| **Approved** | Onboarding validated for quality. Activation link generated and sent (valid 72h, one-time token). | Read-only; becomes Active on link click | — |
| **Rejected** | Application declined. Cannot be reopened in same record. | None | — |

**SLA Details:**

- External promise: "Response within 2 working days" (stated in form confirmation and auto-reply).
- Internal SLA: 24 hours from creation for admin assignment; an alert is triggered if the deadline is approaching.
- Activation link: 72-hour validity; one-time use; older links are invalidated on resend.

**Key Distinction:** Partner Applications are the pre-sales onboarding process (SLA-tracked). Help Requests are operational support, disputes, and change requests (no SLA; routed by type). These are distinct entity types (Clash 8.1/8.3).

---

### Source §1.7 — Request (Help System) Lifecycle

**Request Type Enum:** `Support | Dispute | Change | Other`  
**Status Field Name:** `request_status`  
**Status Enum:** `New | In Progress | Waiting | Closed | Cancelled`

| Status | Definition | Partner Can View | User Can View |
|--------|-----------|------|------|
| **New** | Received via form or email. | Yes | Yes |
| **In Progress** | Being investigated or acted upon. | Yes | Yes |
| **Waiting** | Response or action sent to requester; awaiting reply, document, or internal/external verification. Set by admin. | Yes | Yes |
| **Closed** | Resolved. | Yes (history) | Yes (history) |
| **Cancelled** | Withdrawn or invalid. | Yes (history) | Yes (history) |

**Inbound Channels:**

- Website form → Creates a unified Help Request (distinct from a Partner Application).
- Email to office@boomcard.bg → Parsed into a unified Help Request (type: Support / Dispute / Change / Other).
- Form submissions create Partner Applications only when submitted via the partner onboarding form. All other inbound forms and emails create Help Requests.

**Admin Routing:**

- Requests assigned to the correct admin team (Support, Finance, Dispute) based on type.
- Assignment is fully manual: all requests go to a shared "Unassigned" queue; any admin can claim; Super Admin can reassign (Clash 7.2).
- Change requests may require approval, potentially with a contract amendment.
- No SLA applies to Help Requests.

**Visibility:**

- Admin: Full view of all requests and responses.
- Partner / User: Can view their own requests and status updates.
- All requests become part of support history (even Closed and Cancelled ones).

---

## Part 2 — Risk Management and Compliance

### Source §2.1 — Risk Signals (Canonical Set)

Five risk signals are tracked across all cashback records:

1. **IBAN Change** — IBAN changed in last 24h
2. **Receipt Match** — OCR confidence vs. registered receipt template
3. **Location Match** — QR code location vs. geolocation at transaction time
4. **User Risk** — User has 3 or more Voided records
5. **Partner Risk** — Partner has active risk flag

**Risk Score Combining Function (Additive):**

| Signal | Score |
|--------|-------|
| IBAN changed in last 24h | +40 |
| Receipt match confidence < 60% | +30 |
| QR location mismatch | +20 |
| User has 3+ Voided records | +20 |
| Partner has active risk flag | +10 |

**Risk Level Thresholds:**

| Total Score | Risk Level |
|-------------|-----------|
| 0–20 | Low |
| 21–50 | Medium |
| 51+ | High |

The combining function is additive (Clash 5.1). All five signals are confirmed as tracked (Clash 5.2, confirming IBAN-change signal). Risk Level is an internal-only classification — NOT visible to end-users.

*(Implementation conforms):* `adminSubscribers.routes.ts` now filters subscribers by risk level using the spec-canonical thresholds — Low `riskScore ≤ 20`, Medium `21–50`, High `> 50` — consistent with the additive risk scores stored in the DB. The earlier 30/60 breakpoints have been corrected.

**Limits Table Authority (Clash 5.4):** Engineering sets conservative defaults; the product owner signs off as part of the go-live checklist. The Risk Review role can adjust signal thresholds within pre-defined bounds; only a Super Admin can exceed those bounds.

---

### Source §2.2 — Risk Review Workflow

**High Risk (score 51+) → Manual Review (Mandatory)**

- Every High-risk cashback record enters the admin review queue automatically.
- Admin decision: Approve (Pending → Cleared) or Reject (Pending → Voided).
- On Approval: 60-day countdown starts from the Cleared date.
- On Rejection: Record marked Voided with reason category and optional internal note.

**Low Risk (score 0–20) → Automatic Approval** (unless blocked by other conditions).  
Auto-approval occurs within 24 hours of the Pending record being created.

**Medium Risk (score 21–50) → Automatic Approval** (unless blocked by other conditions).  
*(Amended per BC-USER-SPEC-FIX-010 §9.4, 2026-06-04.)* Medium-risk records auto-approve within 24 hours, the same as Low risk. They do NOT enter the mandatory manual-review queue. Only High risk (51+) requires mandatory manual review (see above). The canonical 0–20 / 21–50 / 51+ risk-level thresholds are unchanged; only the manual-review routing for the Medium band changed.

---

## Part 3 — Admin Panel Workflows

### Source §3.1 — Dashboard

**Purpose:** Quick operational overview for Super Admin; not a heavy analytics tool.

**Key Metrics Displayed:**

- Active user accounts, new registrations, subscription status breakdown
- Daily transactions, total volume, average transaction value
- Cashback status breakdown (Pending, Cleared, Locked, Paid, Expired, Voided; TrialPending also exists — implementation extension)
- Active partners, new applications, active locations

**Alert Types and Routing:**

| Alert Type | Examples | Routes To |
|------------|---------|-----------|
| **Critical** | High-risk transactions, failed payouts, system errors, suspicious activity | Control or Finance |
| **Operational** | New partner applications, users reaching payout threshold, pending approvals | Partners, Users, or Finance |
| **Informational** | New registrations, partner activations, completed onboarding | Daily digest |

---

### Source §3.2 — User Management Workflow

**View:** All user accounts filtered by status (Active, Inactive, Archived).

**Editable Fields:**

- Account status (Active / Inactive / Archived)
- Profile: name, email, phone, address, IBAN
- Risk profile
- Subscription and cashback history (view only from this panel)

**Rules Enforced by Admin Backend:**

- Inactive status: User can log in, view history, and submit support requests, but cannot scan receipts or generate new cashback.
- IBAN: Not required at registration but required before an automatic payout can proceed. If the threshold is reached and no IBAN is on file, the system notifies the user; the payout is held until IBAN is saved.
- Failed payouts: First failure notifies the user to check their IBAN; second failure routes the record to manual review.

**Password Reset Rate-Limiting (Clash 11.4):**

- Alert triggered at 3 password resets within 24 hours.
- Account suspension pending Super Admin review triggered at 5 password resets within 24 hours.

---

### Source §3.3 — Subscription Management Workflow

**Display Fields:**

- Plan type (Basic, Premium Weekly, Premium Monthly)
- Subscription status (Active, Expired, Cancelled, Failed Payment)
- Payment history
- Renewal date and auto-renewal setting

**Rules Enforced:**

- One renewal attempt at scheduled date. If it fails, status moves to Failed Payment immediately (no retry period).
- Failed Payment blocks receipt scanning immediately.
- Cancelled subscription: scanning allowed through the last paid day; blocked after the period ends (subscription auto-transitions to Expired).
- New cashback records are not generated while scanning is blocked.
- Payout eligibility: Active and Cancelled-within-paid-period allow new payouts; in-flight payouts always continue (earned-rights model).

---

### Source §3.4 — Cashback Management Workflow

**Dashboard View:**

- Cashback records grouped by status (Pending, TrialPending, Cleared, Locked, Paid, Expired, Voided)
- Filter by user, date range, risk level, status
- Export by status

**Manual Admin Actions:**

| Action | Transition | Conditions | Route |
|--------|-----------|-----------|-------|
| Approve | Pending → Cleared | Starts 60-day countdown from approval date | `POST /cashback/entries/:id/approve` (requires `cashback.write`) |
| Lock | Cleared → Locked | Initiates payout pipeline; Locked persists until paid | `POST /cashback/entries/:id/lock` (requires `cashback.write`) |
| Pay | Locked → Paid | Marks payout complete; terminal state | `POST /cashback/entries/:id/pay` (requires `cashback.write`) |
| Expire | any active → Expired *(implementation extension — not in source spec §1.3; spec defines Cleared→Expired only via 60-day auto-timer; source: `adminCashback.routes.ts` line 353)* | Admin manual override of auto-expiry | `POST /cashback/entries/:id/expire` (requires `cashback.write`) |
| Void | Pending → Voided *(source spec §1.3)*; Cleared → Voided *(source spec §1.3)*; Locked → Voided *(implementation extension — not in source spec §1.3; route accepts "any active state → Voided"; source: `adminCashback.routes.ts` line 374)* | Requires reason from the canonical VOID_REASON_CATEGORIES vocabulary (DUPLICATE / FRAUD / SYSTEM_ERROR / ADMIN_CORRECTION / PARTNER_DISPUTE / OTHER; format `"CATEGORY"` or `"CATEGORY: description"`); responsible admin and timestamp recorded | `POST /cashback/entries/:id/void` (requires `cashback.write`) |

**Automation Rules:**

- Pending records with Low **or Medium** risk score (0–50) auto-approve within 24 hours. *(Amended per BC-USER-SPEC-FIX-010 §9.4, 2026-06-04: the Medium band 21–50 now auto-approves the same as Low; only High risk (51+) enters mandatory manual review.)*
- Cleared records automatically expire after 60 days if not transitioned to Paid.
- Locked state is entered **automatically by the nightly scheduler** when a wallet's Cleared balance reaches the plan-specific threshold — no user action triggers this. Locked → Paid still requires manual admin action; there is no automatic resolution of Locked records.
- TrialPending records are resolved daily by the scheduler (5:30 AM; source: `src/jobs/scheduler.ts` `resolveTrialPendingCashback()`): promoted to Cleared after the trial window, Voided if the subscription was cancelled within the window.

**Cashback Rate Management** *(implementation extension — not in source spec §3.4; source spec Clash 10.6 defines the concept but not the mechanism):*

The source spec (Clash 10.6) identifies "Бизнес формула" (Business Formula) as a three-way split (partner%, cashback%, margin%) but does not specify the admin configuration mechanism. The backend implements versioned rate snapshots:

- `GET /cashback/rates` — full history of all rate rows, newest first (requires `cashback.read` permission).
- `GET /cashback/rates/current` — currently effective rate per discount step (requires `cashback.read` permission).
- `POST /cashback/rates` — create a new versioned rate set; body: `{ rates: [{ discountStep, basic, premium }], effectiveFrom?, notes? }`. Optional `effectiveFrom` schedules a future-effective snapshot. Requires `cashback.write` permission.
- `DELETE /cashback/rates/snapshot/:iso` — cancel a future-scheduled snapshot by its `effectiveFrom` timestamp. Returns 409 if the snapshot is already past or currently active. Requires `cashback.write` permission.

Note: The source spec does not define business rules for rate transitions, required approval workflow, or rollback procedures. These are implementation details not covered by the spec.

---

### Source §3.5 — Partner Management Workflow

**Partner Application Workflow (Admin Steps):**

1. Form submission creates an application in "New" status.
2. Admin assigns and updates status: Communication → Negotiation → Onboarding → Approved or Rejected.
3. On Approved: Activation link generated (72h validity, one-time use); link sent to partner.
4. Partner clicks the activation link → Partner Account status becomes Active.
5. SLA Timer: 24h for admin assignment; alert triggered if deadline is approaching.
6. Rejected applications cannot be reopened in the same record.

**Active Partner Management:**

- View partners by status (Active, Inactive, Archived).
- Edit commission rate, business category, and visibility field.
- Manage locations and QR codes (full control).
- View transaction history.

**Automatic Behaviors Enforced by Admin Backend:**

- Status change to Inactive → All QR codes for that partner automatically deactivated.
- Status change to Active from Inactive → All QR codes automatically reactivated (no manual action needed). Exception (Clash 2.4): if partner was Archived, QR codes require explicit per-code admin reactivation — not auto-reactivated.
- Inactive or Archived partners always hidden from public site (regardless of visibility field).

---

### Source §3.6 — Location and QR Code Management

**QR Code Status Enum:** `Active | Inactive | In Processing | Replaced`

| Status | Meaning | Partner Can See | Can Be Scanned |
|--------|---------|------|------|
| **Active** | Operational QR code at location. | Yes | Yes |
| **Inactive** | Temporarily deactivated (e.g., location closed, partner Inactive). | Yes | No |
| **In Processing** | Physical replacement order initiated. | Yes | No |
| **Replaced** | Physical replacement completed. New code in Active status. | Yes (history) | No |

**Rules Enforced by Admin:**

- Admin fully controls QR generation, deactivation, and replacement.
- Partner has read-only visibility in the Partner Portal ("Profile & Locations") — cannot generate, deactivate, manually reactivate, or view the raw token.
- QR codes auto-deactivate when partner status changes to Inactive or Archived.
- QR codes auto-reactivate when partner returns to Active from Inactive (no regeneration required). Exception (Clash 2.4): if partner was Archived, each QR code must be explicitly reactivated by an admin.
- QR codes cannot be manually activated while the partner is Inactive or Archived.
- After Archived reactivation, QR codes require explicit admin reactivation per code (Clash 2.4).

**All four QR statuses have defined transitions and semantics (Clash 9.4).**

---

### Source §3.7 — Financial Management

**Payout to Users:**

- User must have a subscription status that allows payout: Active or Cancelled-within-paid-period.
- Blocked when: Cancelled (post period end), Failed Payment, or Expired.
- IBAN required before automatic payout can proceed (not at registration). Users with no IBAN on file receive a notification when their threshold is reached and are prompted to add their bank details.
- Payout threshold (plan-specific minimum Cleared balance) triggers the automatic payout process.
- First failed payout (invalid IBAN): Notify user to correct IBAN.
- Second failed payout: Record marked High risk + routes to manual review. The user is not notified of the manual review; the payout record remains visible as "Sent to payout" from the user's perspective.

**Payout Eligibility — Earned-Rights Model (Clash 4.1):**

- New payouts: Allowed when subscription is Active or Cancelled-within-paid-period.
- In-flight payouts: Always continue regardless of any subsequent subscription status changes (cashback earned during an active period can be paid out even after cancellation or expiry).

**Invoicing to Partners:**

- Based on approved transactions and negotiated commission rate.
- Monthly reporting periods cycle through: Open → Under Review → Closed → Invoiced.
- Partners invoiced based on approved outturn only (cancelled and voided transactions excluded).

**Risk Signal Tracking in Financial Context:**

- Five canonical signals recorded with additive scores: IBAN change (+40), Receipt match confidence <60% (+30), QR location mismatch (+20), User has 3+ Voided records (+20), Partner active risk flag (+10).
- Thresholds: 0–20 = Low, 21–50 = Medium, 51+ = High.
- Only High-risk (51+) records enter the mandatory manual admin review queue. Low and Medium risk auto-approve within 24h (Medium routing amended per BC-USER-SPEC-FIX-010 §9.4, 2026-06-04 — see §2.2).

**Currency Display Rule (Clash 12.1):**

- During the BGN→EUR transition window: amounts displayed in both BGN and EUR simultaneously.
- After the transition window closes: BGN display is hidden; EUR only.

**Payout Threshold Read Endpoint** *(implementation detail — not in source spec §3.7; concept referenced in source §7.3 and Clash 5.4):*

- `GET /cashback/payout-thresholds` — returns per-plan minimum Cleared balance required to trigger payout, for plans: BASIC, PREMIUM_WEEKLY, PREMIUM. Values sourced from DB with fallback to hardcoded constants. Requires `cashback.read` permission.

---

### Source §3.8 — Request Management (Unified Help System)

**Inbound Channels:**

- Website form → Creates a unified Help Request.
- Email to office@boomcard.bg → Parsed into a unified Help Request (type: Support / Dispute / Change / Other).

**Admin Routing:**

- Requests assigned to the correct admin team based on type (Support, Finance, Dispute).
- Assignment is fully manual: all requests go to the shared "Unassigned" queue; any admin can claim; Super Admin can reassign.
- Change requests require approval; may involve contract amendment.
- No SLA for Help Requests (distinct from Partner Applications, which have a 24h internal / 2 working day external SLA).

**Visibility Rules:**

- Admin: Full view of all requests and responses.
- Partner / User: Can view their own requests and status updates.
- All requests become part of support history (even Closed and Cancelled ones).

---

### Source §3.9 — Super Admin Creation — Dual-Approval Protocol

**Rule:** Creating a new Super Admin requires approval from any two existing Super Admins (2-of-N).

| Step | Description |
|------|-------------|
| 1. Initiation | Any Super Admin initiates a "Create Super Admin" request. |
| 2. Pending approval | Request enters the Pending Approvals queue. Any other existing Super Admin can approve. |
| 3. Expiry | Request expires after 72 hours if not approved. |
| 4. Cancellation | The initiating Super Admin can cancel the request at any time before approval. *(Implementation conforms: the DELETE /admin/admins/pending-super/:id route enforces that only the initiating Super Admin may cancel/withdraw their own pending request; another Super Admin attempting to cancel receives HTTP 403. The separate /approve action remains available to other Super Admins as the second-actor step.)* |
| 5. Approval | On second approval from any other Super Admin, the new Super Admin account is created. |

**Bootstrap Exception (spec rule):** If only one Super Admin exists in the system, a single approval from that Super Admin is sufficient to create the first new Super Admin. *(Implementation conforms: the /pending-super/:id/approve route counts non-archived Super Admins (the quorum counts every Super Admin whose status is not ARCHIVED, so a single genuinely-active SA cannot self-approve while INACTIVE/SUSPENDED SAs still exist) and, when exactly one such Super Admin exists, permits that sole Super Admin to self-approve their own request. When more than one non-archived Super Admin exists, the anti-self-approval check still blocks the initiator from approving their own request.)*

**Anti-Fraud Constraint:** The initiator cannot approve their own request. The same individual cannot act as both initiator and approver.

---

## Part 4 — Permissions and Role Rules

### Role Capabilities (synthesised from §1.5, §3.7, §3.9, and Clash resolutions)

**Super Admin:**

- Can perform all actions permitted by their role.
- Can change any admin's status (Active / Inactive / Archived) — only Super Admin has this authority.
- Must approve new Super Admin creation requests (2-of-N dual approval), with the anti-fraud constraint that the initiator cannot self-approve.
- Can adjust risk/limit parameters beyond the bounds available to the Risk Review role.
- Can exceed pre-defined bounds on limits table values (Risk Review role can only adjust within bounds).
- Triggers account suspension review when 5 password resets occur in 24 hours for a user.
- Can reassign Help Requests to different admin teams.

**Standard Admin:**

- Can perform all actions permitted by their assigned role.
- Cannot change another admin's status.
- Can claim unassigned Help Requests from the shared queue.
- Cannot exceed bounds on limits table adjustments.

**Inactive Admin:**

- Can log in.
- Read-only access only.
- Cannot approve, reassign, or modify records.

**Archived Admin:**

- No login access.
- All historical actions and audit records retained.

**Risk Review Role:**

- Can adjust risk signal thresholds and limits table values within pre-defined bounds.
- Cannot exceed those bounds (Super Admin authority required to exceed bounds).

**Additional roles in DB schema** *(implementation extension — not in source spec):* The `UserRole` Prisma enum includes `SUPPORT`, `FINANCE`, and `PARTNER_MANAGER` beyond the ADMIN/SUPER_ADMIN roles defined in the source spec. Their permissions and admin panel behavior are not specified in the source spec.

**Admin impersonation ("представяне като партньор" / "Влез като потребител")** *(implementation extension — not in source spec; confirm with product):* The admin panel lets an operator assume another account's authenticated session:

- **Partner impersonation** — ADMIN or SUPER_ADMIN may impersonate a PARTNER account (`GET /api/auth/impersonatable-partners`, `POST /api/auth/impersonate` with `targetPartnerUserId`).
- **User impersonation** — SUPER_ADMIN **only** may impersonate a regular end-user (role USER) (`GET /api/auth/impersonatable-users` — SUPER_ADMIN-gated, `POST /api/auth/impersonate` with `targetUserId`; target role is resolved server-side and an ADMIN attempting a USER target receives HTTP 403). Gating the most invasive impersonation to Super Admin is consistent with the §1.5/§3.9 Super-Admin authority model.

Invariants enforced by the implementation: the impersonation token carries `imp:true` + the acting admin id (`impBy`) and **no** account-group/agency claim (so the impersonated session cannot pivot to siblings via account-switch); nested impersonation is refused; `/switch-account` is refused while impersonating; impersonation is refused on mobile and for self-targets; **every start and stop is audit-logged with the acting admin id** (consistent with the "all historical actions and audit records retained" expectation), and the impersonatable-users listing uses an explicit column allowlist so no sensitive field (IBAN, password hash, tokens) is exposed. `POST /api/auth/stop-impersonate` restores the original admin/super-admin session without re-authentication. This capability is **not defined in the source spec** and should be confirmed with product, particularly the end-user impersonation path (a privacy-sensitive operator power).

**Request Assignee Routing (Clash 7.2):**

- All requests go to a shared "Unassigned" queue.
- Any admin can claim a request.
- Super Admin can reassign a claimed request.

---

## Part 5 — Notification Templates (Admin-Triggered)

### Source §6.1 — Canonical Notification Templates

The admin backend is responsible for triggering all of the following notifications.

**User Notifications:**

| # | Template | Trigger |
|---|----------|---------|
| 1 | **Payment** | Subscription charge, payment method updates, payment failures |
| 2 | **Transactional** | QR session confirmation, receipt uploaded, payout initiated |
| 3 | **Cashback Expiry** | 7-day warning before a Cleared cashback record expires |
| 4 | **Marketing** | Campaigns, promotions, feature updates |

**Users are NOT notified of account status changes (intentional design — Clash 6.6).**

**Partner Notifications:**

| # | Template | Trigger |
|---|----------|---------|
| 1 | **Activation Link** | Sent after onboarding approval (72h validity link) |
| 2 | **Onboarding Follow-Up** | Reminder to complete profile data entry |
| 3 | **New Transaction** | Daily/weekly digest of transactions |
| 4 | **Monthly Financial Summary** | Payout and invoice summary |
| 5 | **Request Updates** | Status updates on Help Requests or Change Requests |
| 6 | **Status Changes** | Notification when partner account status changes (Active / Inactive / Archived) |
| 7 | **Contract Changes** | Notification of commission or terms updates |
| 8 | **Marketing** | Campaigns, feature updates, product news |

**Partners ARE notified of status changes (operational requirement — Clash 6.6).**

---

## Part 6 — Email Threading and Office@ Channel Rules

### Source §6.2 — Email Threading and Office@ Channel

**Office@ Dual Role:**

- **Outbound:** Sends Partner Application notifications, status updates, and marketing.
- **Inbound:** Email parser creates unified Help Requests from mail sent to office@boomcard.bg. (This is distinct from the website form flow, which creates Partner Applications directly — Clash 8.1/8.3.)

**Reconciled office@ behavior (Clash 8.3):** office@boomcard.bg both receives outbound notifications (as sender) and parses inbound mail (as receiver). Both roles are active simultaneously.

**Email Threading:**

- All Help Requests have email threading capability.
- Users and partners can reply to request updates via email.
- Email conversation is stored as a unified thread in the Help system.

**Threading Markers (v1.2 scope — Clash 7.1):**

- Primary: `X-BoomCard-Request-ID` header.
- Fallback: `[#XXXX]` subject pattern.
- Plus-addressing (`request-1234@boomcard.bg`) is deferred to v1.3. v1.2 does not require email-server routing of `+suffixed` addresses. All threading in v1.2 relies on the header and subject-pattern fallback only.

---

## Part 7 — Data Integrity and Cross-Module Consistency Rules

### Source §7.1 — Status Field Names (Canonical Schema)

The admin backend must use these qualified field names in the database schema to avoid ambiguity:

| Entity | Status Field Name | Values |
|--------|---------|------|
| User Account | `user_account_status` | Active, Inactive, Archived |
| Subscription | `subscription_status` | Active, Expired, Cancelled, Failed Payment |
| Cashback | `cashback_status` | Pending, Cleared, Locked, Paid, Expired, Voided (source spec); TrialPending (implementation extension — see §1.3) |
| Partner Account | `partner_account_status` | Active, Inactive, Archived |
| Admin Account | `admin_account_status` | Active, Inactive, Archived |
| Partner Application | `partner_application_status` | New, Communication, Negotiation, Onboarding, Approved, Rejected |
| Request | `request_status` | New, In Progress, Waiting, Closed, Cancelled |

UI display names are translated for end-users (e.g., "Account paused" for Inactive user status), but the backend database uses the English qualified names above.

---

### Source §7.2 — Terminology Distinctions (Admin Navigation Disambiguation)

The following terms have distinct meanings in the admin panel context and must not be conflated:

| Term | Definition | Used In |
|------|-----------|---------|
| **Partner Application** | Pre-sales onboarding record created from website form. Status-tracked separately from Partner Account. | Admin > Partners > Applications |
| **Partner Account** | Operational account after onboarding approval. Represents active/inactive/archived partner. | Admin > Partners > Active Partners; Partner Portal |
| **Help Request** (Unified Requests) | Support, dispute, or change request created via form or email. Routed to correct team. No SLA. | Admin > Help > All Requests; User/Partner portals |
| **Заявка (Bulgarian)** | Overloaded term; disambiguated by context: "Партньори > Заявки" = Partner Applications; "Помощ > Заявки" = Help Requests | Admin menus |

---

### Source §7.3 — Canonical Acronyms and Field Names

- **IBAN:** International Bank Account Number (required for payouts; optional at registration)
- **QR:** Quick Response code (location-specific token for transaction initiation)
- **OCR:** Optical Character Recognition (receipt scanning and matching)
- **SLA:** Service Level Agreement (24h internal / 2 working days external for Partner Applications; no SLA for Help Requests)
- **Risk Level:** Internal-only classification (Low, Medium, High) — NOT visible to end-users
- **Payout Threshold:** Plan-specific minimum Cleared cashback balance required to trigger payout
- **Бизнес формула (Business Formula):** The percentage-split algorithm that divides transaction value into: partner commission %, cashback %, and margin % (Source §10 Clash 10.6)

---

### Source §8.1 — Atomic Rules (Admin Backend Must Enforce All)

**1. Subscription Status and Scanning Gate:**

- Receipt scanning blocked if `subscription_status` is Expired, Cancelled (post period end), or Failed Payment.
- Receipt scanning allowed during Cancelled (within paid period) — user retains access through last paid day.
- Inactive `user_account_status` blocks scanning regardless of subscription status.
- New cashback records are never generated while scanning is blocked.

**2. Cashback Expiry:**

- Only Cleared cashback has a 60-day rolling countdown (starts from Cleared date).
- Pending cashback never expires (no countdown).
- Voided and Expired are terminal states; no transitions out.
- *(Implementation note — not in source spec):* TrialPending cashback is resolved by the scheduler, not by expiry countdown. It is promoted to Cleared or Voided when the trial window closes.

**3. Payout Eligibility (Earned-Rights Model):**

- User must have a valid IBAN on file.
- New payouts: Allowed when `subscription_status` is Active or Cancelled-within-paid-period. Blocked when Cancelled (post period end), Failed Payment, or Expired.
- In-flight payouts: Always continue regardless of subsequent `subscription_status` changes (cashback earned during an active period can be paid out even after cancellation).

**4. Currency Display:**

- During the BGN→EUR transition window: amounts displayed in both BGN and EUR simultaneously.
- After the transition window closes: BGN display is hidden; EUR only.

**5. Partner Status and QR Codes:**

- Partner status change to Inactive or Archived → All QR codes automatically deactivate (backend-enforced).
- Partner status change to Active from Inactive → All QR codes automatically reactivate (no regeneration required). Exception (Clash 2.4): if partner was Archived, each QR code requires explicit admin reactivation.
- QR codes cannot be manually activated if partner is Inactive or Archived.

**6. Risk Review and Voiding:**

- Every Voided cashback record requires: reason category + responsible admin identity + timestamp.
- Voided records remain visible to the user in history with the reason displayed.
- Voided is terminal — cannot be reverted to Pending or Cleared.

**7. Partner Visibility:**

- Status rule overrides the visibility field: Inactive and Archived partners are always hidden from the public site.
- This precedence rule must be enforced consistently in the frontend, the API, and the admin panel.

---

## Part 8 — Clash Resolution Decisions Affecting Admin Behavior

The following clash resolutions from the Appendix (Source §10) directly constrain or define admin backend behavior. Each is included here as a binding rule.

| Clash ID | Resolution Binding on Admin |
|----------|----------------------------|
| **2.3** | Inactive user status is confirmed as a valid state: login allowed, scanning blocked, support requests allowed. |
| **3.1/3.2** | "Locked" cashback status introduced as the mandatory intermediate state during payout, resolving the contradiction between "Paid is terminal" and "Paid records may need re-review." |
| **3.5** | "Locked" (cashback status) and "period lock" (reporting layer) operate independently. |
| **3.6** | Expired cashback records are unaffected by subscription status changes. Voided records are terminal and unaffected by any other state changes. |
| **4.1** | Earned-rights model: Active + Cancelled-within-paid-period allow new payouts; in-flight payouts always continue regardless of subsequent subscription status. |
| **5.1** | Risk combining function is additive: IBAN change +40, receipt match <60% +30, location mismatch +20, 3+ Voided records +20, partner risk flag +10. Thresholds: 0–20 Low, 21–50 Medium, 51+ High. |
| **5.2** | IBAN-change signal confirmed as a tracked risk signal included in the additive scoring (+40). |
| **5.4** | Limits table defaults set by engineering; product owner signs off at go-live. Risk Review role adjusts within bounds; Super Admin can exceed bounds. |
| **6.1** | Notification template list is canonical: 4 user templates + 8 partner templates = 12 total (see Part 5 above for full list). |
| **6.6** | Users are not notified of account status changes (intentional). Partners are notified of status changes (operational requirement). |
| **7.1** | Plus-addressing deferred to v1.3. v1.2 threading uses only: X-BoomCard-Request-ID header (primary) and [#XXXX] subject pattern (fallback). |
| **7.2** | Request assignment is fully manual: shared "Unassigned" queue; any admin can claim; Super Admin can reassign. |
| **8.1/8.3** | Website form creates Partner Application. Email to office@ creates unified Help Request. These are distinct entity types with different workflows. |
| **8.3** | office@boomcard.bg both sends outbound notifications and parses inbound mail. Both roles active simultaneously. |
| **9.1** | Status rule takes precedence over visibility field: Inactive/Archived partners are always hidden from public site regardless of field value. Enforced in admin panel, API, and frontend. |
| **9.4** | All four QR statuses (Active, Inactive, In Processing, Replaced) have defined transitions and semantics. |
| **11.4** | Password reset rate-limiting: alert at 3 resets in 24h; account suspension pending Super Admin review at 5 resets in 24h. |
| **12.1** | Dual-currency display during BGN→EUR transition window; BGN hidden after window closes. |
| **13.3** | Super Admin creation requires 2-of-N dual approval; 72h expiry; initiator can cancel; initiator cannot self-approve; bootstrap exception for single-SA systems. |
| **2.1/2.2** | Cancelled subscription: scanning allowed through last paid day, then auto-transitions to Expired. |
| **2.4** | Archived user: reactivates via password reset + new subscription. Archived partner: reactivates via admin action + new onboarding review. QR codes require explicit admin reactivation per code (not auto-reactivated after partner Archived reactivation). |
| **2.6** | Admin account status enum: Active / Inactive / Archived — mirrors User and Partner model. |
| **Gap 12** | Inactive user behavior: login allowed, scanning blocked, support requests allowed (mirrors partner model). |
| **10.1** | "Заявки" (Bulgarian) is overloaded. Disambiguate by menu context: "Партньори > Заявки" = Partner Applications; "Помощ > Заявки" = Help Requests. |
| **10.3** | "Status" is used for 10+ entity types in the spec. Each entity uses a qualified schema field name (e.g., `user_account_status`, `cashback_status`) to prevent ambiguity — see §7.1 for the canonical field name table. |
| **10.6** | "Бизнес формула" (Business Formula) refers to the three-way percentage-split algorithm: partner commission %, cashback %, and margin %. |

---

*This document is extracted from 05-consolidated-unified-spec.md (BoomCard Unified Specification v1.2, 2026-05-29) and covers only Admin Panel-owned or Admin Panel-enforced content. It supersedes any earlier standalone Admin spec for implementation and audit purposes.*
