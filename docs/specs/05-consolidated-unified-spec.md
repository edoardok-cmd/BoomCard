# BoomCard Unified Specification
**Consolidated Admin, Partner & User Requirements**  
**Version 1.2 (Clash-Free, consolidates Admin v1.2 / Partner Final / User Final)**  
**Date:** 2026-05-29

> **Amendment — 2026-06-24:** Product decision confirmed post v1.2: Medium-risk cashback records (score 21–50) auto-approve on the same 24-hour timer as Low-risk records. Only High-risk records (score 51+) require manual review. §2.2, §3.4, and §3.7 updated accordingly.

---

## Overview

This document is the **single authoritative source** for BoomCard's business logic across all three user-facing modules:
- **Admin Panel** — Operational control and oversight
- **Partner Portal** — Partner lifecycle and transaction management
- **User App** — Subscriber account and cashback management

This specification resolves 24 out of 65 identified logic clashes (per Task T-CLASH-001). All terminology is unified, state machines are aligned, and contradictions are eliminated.

---

## Part 1: Core Entities and Status Models

### 1.1 User Account Lifecycle

**Status Enum:** `Active | Inactive | Archived`

| Status | Definition | Login Access | Scan Receipts | View History | QR Behavior |
|--------|-----------|-------|--------|---------|---|
| **Active** | Normal operation. User can subscribe, scan, transact, and manage account. | ✅ Yes | ✅ Yes | ✅ Yes | No special behavior. User can scan any active QR code at partner locations. |
| **Inactive** | Temporary pause. User can log in, view history, and submit support requests, but cannot scan receipts or generate new cashback. | ✅ Yes | ❌ No | ✅ Yes | No impact on QR codes. The user's scan access is blocked at the application level. QR codes at partner locations remain operational for other users. Mobile app shows "Account paused" UI and CTA to resume. |
| **Archived** | Historical status. No access. Data retained for history and accounting. | ❌ No | ❌ No | ❌ No | No impact on QR codes. The user's scan access is fully removed. QR codes at partner locations remain operational for other users. |

**Key Behaviors:**
- Inactive is a *distinct* status from Archived—it preserves read-only access and is reversible.
- Archived is terminal for operational purposes (no login, no transactions) but retains all history.
- User account status controls only that user's ability to scan. QR codes are managed by admin at the location level and remain active for other users regardless of any individual user's account status. (QR auto-deactivation applies to partner accounts — see §1.4.)

---

### 1.2 Subscription Status Lifecycle

**Status Enum:** `Active | Expired | Cancelled | Failed Payment`

| Status | Definition | Receipt Scanning Blocked? | Payout Gate Open? | New Cashback Generated? |
|--------|-----------|-----------|---------|-------|
| **Active** | Current valid subscription. User can scan and earn cashback. | ❌ No | ✅ Yes | ✅ Yes |
| **Expired** | Previous subscription ended naturally (no auto-renewal or manual renewal). User cannot scan; cannot initiate new transactions. Existing cashback is unaffected. | ✅ Yes | ❌ No (new); ✅ Yes (in-flight) | ❌ No |
| **Cancelled (within paid period)** | User cancelled but period has not yet ended. Access continues through the last paid day. | ❌ No (scanning allowed through period end) | ✅ Yes | ❌ No |
| **Cancelled (post period end)** | Paid period has elapsed. Auto-transitions to Expired. | ✅ Yes | ❌ No | ❌ No |
| **Failed Payment** | Automatic renewal failed (declined card, insufficient funds, etc.). One-time attempt, no retry period. User cannot scan; must fix payment method to resume. | ✅ Yes | ❌ No (NEW records) | ❌ No |

*In-flight payouts always continue regardless of subscription status changes (earned-rights model).

**Critical Rule:** New cashback records are **never** generated while subscription status blocks receipt scanning (Expired, Cancelled post-period, Failed Payment). Cancelled-within-paid-period allows scanning and new cashback generation until the last paid day.

---

### 1.3 Cashback State Machine

**Status Enum:** `Pending | Cleared | Locked | Paid | Expired | Voided`

| Status | Definition | Visible to User | Expiry Countdown | Counts Toward Payout Threshold | Notes |
|--------|-----------|---------|---|---|---|
| **Pending** | Awaiting automatic approval or manual risk review. | ✅ Yes ("In Review") | ❌ No | ❌ No | 60-day rolling timer does NOT start. User sees "Pending verification." |
| **Cleared** | Approved and valid. 60-day rolling validity starts from Cleared date. | ✅ Yes ("Available") | ✅ Yes (60 days) | ✅ Yes | Visible in available balance and payout threshold calculations. |
| **Locked** | In payout processing pipeline. Intermediate state, NOT terminal. | ✅ Yes ("Sent to payout") | ❌ No | ❌ No (already counted in Cleared) | Added to resolve contradiction: Paid can return to manual review because Locked represents the operational state *during* payout, not after. |
| **Paid** | Payout initiated. (Does NOT mean funds received; means payout process started.) | ✅ Yes ("Paid" in history) | ❌ No | ❌ No | Paid records continue payout process even if subscription status changes post-Paid. |
| **Expired** | 60-day rolling validity elapsed without transitioning to Paid. Terminal. | ✅ Yes ("Expired") | N/A | ❌ No | Non-Cleared cashback (e.g., Pending forever) does NOT expire; only Cleared records have 60-day timer. |
| **Voided** | Anulled by manual decision. Reason and responsible admin recorded. Terminal. | ✅ Yes ("Cancelled" + reason) | N/A | ❌ No | Visible in history with reason category and optional internal note. |

**State Transitions:**
```
Pending → {Cleared, Voided}
Cleared → {Locked, Expired, Voided}
Locked → {Paid}
Paid → Paid (terminal for operational flow, but can be investigated for disputes)
Expired → Expired (terminal)
Voided → Voided (terminal)
```

**Critical Insight:** The "Locked" status resolves the contradiction between "Paid is terminal" and "Paid records may need re-review"—Locked is the intermediate state during payout, allowing Paid records to persist in the system for further investigation without reverting cashback status.

---

### 1.4 Partner Account Lifecycle

**Status Enum:** `Active | Inactive | Archived`

| Status | Definition | Login | View Transactions | Submit Support | Visible in Public Site | New Transactions |
|--------|-----------|-------|---------|---------|---|---|
| **Active** | Normal operation. Partner can log in, view transactions, and operate locations. | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (status visibility rule applies) | ✅ Yes |
| **Inactive** | Temporary pause. Partner retains read-only access to history; cannot operate new transactions. | ✅ Yes | ✅ Yes (read-only) | ✅ Yes | ❌ No (status rule overrides visibility field) | ❌ No |
| **Archived** | Historical status. No login, no operational access. | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

The `reason`/`sub_type` field distinguishes voluntary pause (Пауза) from admin-imposed deactivation (Спрян) within the Inactive status; the canonical enum is not extended.

**Visibility Rule:** Partner visibility is controlled by a **status-based rule that takes precedence over the visibility field**:
- Active → Visible in public site
- Inactive or Archived → Hidden in public site (regardless of visibility field setting)

**QR Code Behavior on Status Change:**
- Transition to Inactive or Archived → All QR codes **automatically deactivate** in backend
- Transition back to Active → All QR codes **automatically reactivate** (no manual regeneration needed)
- Mobile app displays appropriate feedback when scanning inactive QR codes

---

### 1.5 Admin Account Lifecycle

**Status Enum:** `Active | Inactive | Archived`

| Status | Definition | Login Access | Operational Rights |
|--------|-----------|-------|--------|
| **Active** | Normal operation. Admin can perform all actions permitted by their role. | ✅ Yes | Full (per assigned role) |
| **Inactive** | Temporary restriction. Admin can log in but operational rights are limited (read-only access; cannot approve, reassign, or modify records). | ✅ Yes | Limited (read-only) |
| **Archived** | Departed or decommissioned admin. No login access. All historical actions and audit records are retained. | ❌ No | None |

**Key Behaviors:**
- Inactive is reversible; Archived is terminal for operational purposes.
- All admin actions are recorded in the Action History regardless of status.
- Only a Super Admin can change another admin's status.

---

### 1.6 Partner Application Status Lifecycle

**Status Enum:** `New | Communication | Negotiation | Onboarding | Approved | Rejected`

| Status | What Happens | Partner Access | Admin SLA |
|--------|-----------|---------|---|
| **New** | Application received from website form. No action taken. | ❌ None | 24h (internal) |
| **Communication** | Initial contact established. Responsible admin assigned. | ❌ None | 24h (internal) |
| **Negotiation** | Terms and commission discussed. | ❌ None | — |
| **Onboarding** | Terms accepted. Partner Account created with Inactive status. Partner gets read-only access to profile data entry. | ✅ Read-only | — |
| **Approved** | Onboarding validated for quality. Activation link generated and sent (valid 72h, one-time token). | ✅ Read-only, becomes Active on link click | — |
| **Rejected** | Application declined. Cannot be reopened in same record. | ❌ None | — |

**SLA Details:**
- **External promise:** "Response within 2 working days" (stated in form confirmation and auto-reply)
- **Internal SLA:** 24 hours from creation for admin assignment (triggers alert if approaching deadline)
- **Activation link:** 72-hour validity; one-time use; older links invalidated on resend

---

### 1.7 Request (Help System) Lifecycle

**Request Type Enum:** `Support | Dispute | Change | Other`

**Status Enum:** `New | In Progress | Waiting | Closed | Cancelled`

| Status | Definition | Partner Can View | User Can View |
|--------|-----------|---------|---|
| **New** | Received via form or email. | ✅ Yes | ✅ Yes |
| **In Progress** | Being investigated or acted upon. | ✅ Yes | ✅ Yes |
| **Waiting** | Response or action sent to requester; awaiting reply, document, or internal/external verification. Set by admin. | ✅ Yes | ✅ Yes |
| **Closed** | Resolved. | ✅ Yes (history) | ✅ Yes (history) |
| **Cancelled** | Withdrawn or invalid. | ✅ Yes (history) | ✅ Yes (history) |

**Channels:**
- **Inbound channels:** Website form + email (office@boomcard.bg) → creates unified request
- **Admin assignment:** Requests routed to correct team (Support, Finance, Dispute) based on type
- **SLA:** No SLA defined (distinct from Partner Applications, which have 24h/2-day SLA)

**Key Distinction:**
- **Partner Applications** = pre-sales onboarding process (SLA-tracked)
- **Help Requests** = operational support, disputes, change requests (no SLA; routed by type)

---

## Part 2: Risk Management & Compliance

### 2.1 Risk Signals (Canonical Set)

Five risk signals are tracked across all cashback records:

1. **IBAN Change** — IBAN changed in last 24h
2. **Receipt Match** — OCR confidence vs. registered receipt template
3. **Location Match** — QR code location vs. geolocation at transaction time
4. **User Risk** — User has 3+ Voided records
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

### 2.2 Risk Review Workflow

**Low Risk → Automatic Approval** (unless blocked by other conditions)

**Medium Risk (score 21–50) → Automatic Approval** — Medium-risk records auto-approve on the same 24-hour timer as Low-risk records. No manual review queue entry.

**High Risk (score 51+) → Manual Review (Mandatory)**
- Every High-risk cashback enters admin review queue
- Decision: Approve (Pending → Cleared) or Reject (Pending → Voided)
- Approval: 60-day countdown starts from Cleared date
- Rejection: Record marked Voided with reason category + optional internal note

---

## Part 3: Admin Panel — Unified Control

### 3.1 Dashboard

**Purpose:** Quick operational overview for super-admin, not heavy analytics.

**Key Metrics:**
- Active user accounts, new registrations, subscription status breakdown
- Daily transactions, total volume, average transaction value
- Cashback status breakdown (Pending, Cleared, Locked, Paid, Expired, Voided)
- Active partners, new applications, active locations

**Alert Types:**
- **Critical:** High-risk transactions, failed payouts, system errors, suspicious activity → Routes to Control or Finance
- **Operational:** New partner applications, users reaching payout threshold, pending approvals → Routes to Partners, Users, or Finance
- **Informational:** New registrations, partner activations, completed onboarding → Daily digest

---

### 3.2 User Management

**View:** All user accounts by status (Active, Inactive, Archived)

**Editable Fields:**
- Account status (Active/Inactive/Archived)
- Profile: name, email, phone, address, IBAN
- Risk profile
- Subscription and cashback history

**Rules:**
- Inactive status: User can log in, view history, and submit support requests, but cannot scan receipts or generate new cashback
- IBAN: Not required on registration but required for payout initiation
- Failed payouts: First failure notifies user to check IBAN; second failure routes to manual review

---

### 3.3 Subscription Management

**Display:**
- Plan type (Basic, Premium Weekly, Premium Monthly)
- Subscription status (Active, Expired, Cancelled, Failed Payment)
- Payment history
- Renewal date and auto-renewal setting

**Rules:**
- One renewal attempt at scheduled date. If it fails → Failed Payment status (no retry period)
- Failed Payment blocks receipt scanning immediately
- Cancelled subscription: scanning allowed through last paid day; blocked after period ends (auto-transitions to Expired)
- New cashback records NOT generated while scanning is blocked
- Payout eligibility: Active and Cancelled-within-paid-period allow new payouts; in-flight payouts always continue (earned-rights model)

---

### 3.4 Cashback Management

**Dashboard:**
- Cashback records grouped by status (Pending, Cleared, Locked, Paid, Expired, Voided)
- Filter by user, date range, risk level
- Export by status

**Manual Actions:**
- Approve Pending → Cleared (starts 60-day countdown)
- Reject Pending → Voided (with reason category + internal note)
- View Locked records during payout (informational)

**Automation:**
- Pending records with Low or Medium risk auto-approve within 24 hours
- Cleared records automatically expire after 60 days if not Paid
- Locked status persists throughout payout process; cannot be manually changed

---

### 3.5 Partner Management

**Partner Application Workflow:**
1. Form submission creates application in "New" status
2. Admin assigns and updates status (Communication → Negotiation → Onboarding → Approved/Rejected)
3. On Approved: Activation link generated (72h, one-time use)
4. Partner clicks link → Account becomes Active
5. SLA Timer: 24h for admin assignment (alert if approaching)

**Active Partner Management:**
- View by status (Active, Inactive, Archived)
- Edit commission rate, business category, visibility field
- Manage locations and QR codes
- View transaction history

**Automatic Behaviors:**
- Status change to Inactive → All QR codes automatically deactivated
- Status change to Active → All QR codes automatically reactivated (no manual action needed)
- Status visibility rule: Inactive/Archived partners always hidden from public site (regardless of visibility field)

---

### 3.6 Location & QR Code Management

**QR Code Status Enum:** `Active | Inactive | In Processing | Replaced`

| Status | Meaning | Partner Can See | Can Be Scanned |
|--------|---------|---------|---|
| **Active** | Operational QR code at location. | ✅ Yes | ✅ Yes |
| **Inactive** | Temporarily deactivated (e.g., location closed, partner Inactive). | ✅ Yes | ❌ No |
| **In Processing** | Physical replacement order initiated. | ✅ Yes | ❌ No |
| **Replaced** | Physical replacement completed. New code in Active status. | ✅ Yes (history) | ❌ No |

**Rules:**
- Admin fully controls QR generation, deactivation, and replacement
- Partner has read-only visibility in Partner Portal ("Profile & Locations")
- QR codes auto-deactivate when partner status changes to Inactive/Archived
- QR codes auto-reactivate when partner returns to Active (no regeneration required)

---

### 3.7 Financial Management

**Payout to Users:**
- User must have subscription status that allows payout (Active or recently-Cancelled within paid period)
- IBAN required at payout initiation (not at signup)
- Payout threshold triggers automatic payout process
- First failed payout (bad IBAN) → Notify user
- Second failed payout → Manual review with High risk + internal note

**Invoicing to Partners:**
- Based on approved transactions and negotiated commission rate
- Monthly reporting periods: Open → Under Review → Closed → Invoiced
- Partners invoiced based on approved outturn (not cancelled/voided transactions)

**Risk Signal Tracking:**
- Five canonical signals recorded with additive scores: IBAN change (+40), Receipt match confidence <60% (+30), QR location mismatch (+20), User has 3+ Voided records (+20), Partner active risk flag (+10)
- Risk level thresholds: 0–20 = Low, 21–50 = Medium, 51+ = High
- Only High-risk records (score 51+) enter the manual admin review queue; Low and Medium risk records auto-approve within 24 hours (see §2.2 amendment)

---

### 3.8 Request Management (Unified Help System)

**Inbound Channels:**
- Website form → Creates unified request
- Email to office@boomcard.bg → Parsed into unified request (type: Support/Dispute/Change/Other)

**Routing:**
- Requests assigned to admin team based on type
- Change requests require approval (potentially with contract amendment)
- No SLA for help requests (distinct from Partner Applications, which have SLA)

**Visibility:**
- Admin: Full view of all requests and responses
- Partner/User: Can view their own requests and status updates
- All requests become part of support history (even closed ones)

---

### 3.9 Super Admin Creation — Dual-Approval Protocol

**Rule:** Creating a new Super Admin requires approval from any two existing Super Admins (2-of-N).

| Step | Description |
|------|-------------|
| 1. Initiation | Any Super Admin initiates a "Create Super Admin" request. |
| 2. Pending approval | Request enters the Pending Approvals queue (§10.3). Any other existing Super Admin can approve. |
| 3. Expiry | Request expires after 72 hours if not approved. |
| 4. Cancellation | The initiating Super Admin can cancel the request at any time before approval. |
| 5. Approval | On second approval, the new Super Admin account is created. |

**Bootstrap Exception:** If only one Super Admin exists in the system, a single approval from that Super Admin is sufficient to create the first new Super Admin.

**Anti-Fraud Note:** The initiator cannot approve their own request. The same individual cannot act as both initiator and approver.

---

## Part 4: Partner Portal — Self-Service

### 4.1 Partner Account Access

**Requirements:**
- Active status: full login and operational access
- Inactive status: login allowed; read-only access to transaction history; support request submission allowed; no new transactions
- Archived: No access

**Read-Only Views:**
- Transaction history (all transactions, with filters by date/amount/location)
- Location and QR code list (QR code status only; cannot generate/edit)
- Commission and payout history
- Profile (view only; edits via Change Request through Help system)

**Editable Fields:**
- Notification preferences (email, SMS)
- Password (self-service reset via email)

**Actions Requiring Help System Request:**
- Change commission or business parameters
- Update location details or add new locations
- Deactivate or modify QR codes
- Change payment or contact information

---

### 4.2 QR Code Visibility

**Read-Only Display:**
- List of all locations with corresponding QR codes
- Status of each QR code (Active, Inactive, In Processing)
- History of status changes

**Partner Cannot:**
- Generate new QR codes
- Deactivate QR codes
- Manually reactivate QR codes
- View the raw token (only admin can see)

---

### 4.3 Help Requests (Change Requests)

**Partner can submit:**
- Change requests for commission, location, or business terms
- Support inquiries
- Dispute notifications

**Submitted via:** Form in Partner Portal or email to office@boomcard.bg

**Tracked in:** Unified request system (visible in Help > My Requests section)

---

## Part 5: User App — Subscriber Experience

### 5.1 Registration Flow

**Step 1: Account Creation**
- Email, password, name, phone
- IBAN: Optional at registration

**Step 2: Plan Selection**
- Choose plan (Basic, Premium Weekly, Premium Monthly)

**Step 3: Payment**
- Process payment via card
- Subscription becomes Active on successful charge

**Step 4: Profile Creation**
- Profile data completion

**Step 5: Test Period**
- 24-hour verification period via email link
- User can scan before or after email verification (no blocking)

**Post-Registration:**
- Account status: Active
- Subscription status: Active
- Ready to scan QR codes

---

### 5.2 Account Status & Subscription Display

**User Sees:**
- Account status (Active/Inactive/Archived)
- Subscription status (Active/Expired/Cancelled/Failed Payment)
- Current plan name and renewal date
- Auto-renewal toggle

**When Subscription Fails:**
- App shows: "Subscription payment failed"
- CTA: "Update payment method" or "Renew subscription"
- Receipt scanning blocked until resolved

**When Account is Inactive:**
- App shows: "Account paused"
- CTA: "Resume account"
- Receipt scanning blocked

---

### 5.3 Cashback Visibility

**User Sees:**
- Pending (as "In Review / Pending verification")
- Cleared (as "Available" with "Valid until" countdown)
- Locked (as "В обработка за плащане" / "Sent to payout" — shown in cashback history while payout is in progress)
- Paid (in history as "Paid" / "Sent to payout")
- Expired (as "Expired")
- Voided (as "Cancelled" with reason visible)

**User Does NOT See:**
- Risk level (internal-only)

**Available Balance:**
- Only includes Cleared cashback
- Countdown: 60 days from Cleared date
- Does NOT include Pending or Locked

---

### 5.4 Payout Flow

**Trigger:** User reaches payout threshold (plan-specific minimum)

**If IBAN Missing:**
- System prompts: "Enter bank account to receive payout"
- User enters IBAN
- System initiates payout automatically

**If IBAN Present:**
- System automatically initiates payout
- User notified: "Payout sent"

**Failed Payout Handling:**
- First failure (invalid IBAN): Notification to user, request to correct
- Second failure: Record marked High risk + manual review (user is NOT notified of manual review; visibility remains as "Sent to payout")

---

### 5.5 QR Code Scanning

**Prerequisites:**
- Account status: Active
- Subscription status: Active (or valid period of recently-Cancelled)
- Valid IBAN on file (for future payouts, not for scanning)

**Blocked Scenarios:**
- Inactive account
- Failed Payment subscription status
- Expired subscription
- Cancelled subscription post period end

**Allowed during Cancelled (within paid period):** Scanning continues through last paid day; new cashback can be generated during this window.

**Scan Result:**
- QR opens session
- User uploads receipt photo
- OCR processes receipt
- Receipt matched against location/partner template
- Transaction and cashback record created (status: Pending)

---

## Part 6: Notification System

### 6.1 Notification Templates (Canonical List)

**User Notifications (§8.2 Admin Spec):**
1. **Payment** — Subscription charge, payment method updates, payment failures
2. **Transactional** — QR session confirmation, receipt uploaded, payout initiated
3. **Cashback Expiry** — 7-day warning before Cleared cashback expires
4. **Marketing** — Campaigns, promotions, feature updates

**Partner Notifications (§8.2 Admin Spec):**
1. **Activation Link** — Sent after onboarding approval (72h validity)
2. **Onboarding Follow-Up** — Reminder to complete profile data entry
3. **New Transaction** — Daily/weekly digest of transactions
4. **Monthly Financial Summary** — Payout and invoice summary
5. **Request Updates** — Status updates on help requests or change requests
6. **Status Changes** — Notification when account status changes (Active/Inactive/Archived)
7. **Contract Changes** — Notification of commission or terms updates
8. **Marketing** — Campaigns, feature updates, product news

**Key Distinction:**
- Users are NOT notified of account status changes (intentional asymmetry)
- Partners ARE notified of status changes (operational requirement)

---

### 6.2 Email Threading & Office@ Channel

**Office@ Dual Role:**
- **Outbound:** Sends Partner Application notifications, status updates, marketing
- **Inbound:** Email parser creates unified requests from mail sent to office@boomcard.bg

**Email Threading:**
- All help requests have email threading capability
- User/Partner can reply to request updates via email
- Email conversation stored as unified thread in help system

**Threading Markers in v1.2:**
- Primary: `X-BoomCard-Request-ID` header
- Fallback: `[#XXXX]` subject pattern
- Plus-addressing (`request-1234@boomcard.bg`) is **deferred to v1.3**. v1.2 does not require email-server routing of `+suffixed` addresses. All threading relies on the header + subject fallback.

---

## Part 7: Terminology & Cross-Module Consistency

### 7.1 Status Field Names (Unified Across All Modules)

| Entity | Status Field Name | Values |
|--------|---------|---|
| User Account | `user_account_status` | Active, Inactive, Archived |
| Subscription | `subscription_status` | Active, Expired, Cancelled, Failed Payment |
| Cashback | `cashback_status` | Pending, Cleared, Locked, Paid, Expired, Voided |
| Partner Account | `partner_account_status` | Active, Inactive, Archived |
| Admin Account | `admin_account_status` | Active, Inactive, Archived |
| Partner Application | `partner_application_status` | New, Communication, Negotiation, Onboarding, Approved, Rejected |
| Request | `request_status` | New, In Progress, Waiting, Closed, Cancelled |

**UI Localization:** Display names are translated for end-users (e.g., "Account paused" for Inactive), but backend database uses English qualified names.

### 7.2 Terminology Distinctions

| Term | Definition | Used In |
|------|-----------|---------|
| **Partner Application** | Pre-sales onboarding record created from website form. Status-tracked separately from Partner Account. | Admin > Partners > Applications |
| **Partner Account** | Operational account after onboarding approval. Represents active/inactive/archived partner. | Admin > Partners > Active Partners; Partner Portal |
| **Help Request** (Unified Requests) | Support, dispute, or change request created via form or email. Routed to correct team. No SLA. | Admin > Help > All Requests; User/Partner portals |
| **Заявка (Bulgarian)** | Overloaded term; disambiguated by context: "Партньори > Заявки" = Partner Applications; "Помощ > Заявки" = Help Requests | Admin menus |

---

### 7.3 Acronyms & Field Names (Canonical)

- **IBAN:** International Bank Account Number (required for payouts)
- **QR:** Quick Response code (location-specific token for transaction initiation)
- **OCR:** Optical Character Recognition (receipt scanning & matching)
- **SLA:** Service Level Agreement (24h internal / 2 working days external for Partner Applications)
- **Risk Level:** Internal-only classification (Low, Medium, High) — NOT visible to end-users
- **Payout Threshold:** Plan-specific minimum Cleared cashback balance required to trigger payout

---

## Part 8: Data Integrity & Constraints

### 8.1 Atomic Rules

1. **Subscription Status & Scanning:**
   - Receipt scanning **blocked** if subscription status is Expired, Cancelled (post period end), or Failed Payment
   - Receipt scanning **allowed** during Cancelled (within paid period) — user retains access through last paid day
   - Inactive account status **blocks** scanning regardless of subscription status
   - New cashback records **never** generated while scanning is blocked

2. **Cashback Expiry:**
   - Only Cleared cashback has 60-day rolling countdown (starts from Cleared date)
   - Pending cashback **never** expires (no countdown)
   - Voided and Expired are terminal states

3. **Payout Eligibility (Earned-Rights Model):**
   - User must have valid IBAN on file
   - New payouts: Allowed when subscription status is Active or Cancelled within paid period. Blocked when Cancelled (post period end), Failed Payment, or Expired.
   - In-flight payouts: **Always continue** regardless of subsequent subscription status changes (cashback earned during an active period can be paid out even after cancellation)

4. **Currency Display (resolved 2026-08-10, BC-QA-031):**
   - The BGN→EUR transition window has closed. Dual-currency display machinery has been removed; all amounts are EUR only.

5. **Partner Status & QR:**
   - Partner status change to Inactive/Archived → All QR codes **automatically deactivate**
   - Partner status change to Active → All QR codes **automatically reactivate** (no regeneration)
   - QR codes **cannot** be manually activated if partner is Inactive/Archived

6. **Risk Review & Voiding:**
   - Every Voided cashback record **requires** reason category + responsible admin + timestamp
   - Voided records remain visible to user in history with reason
   - Voided is terminal — cannot be reverted to Pending or Cleared

7. **Partner Visibility:**
   - Status rule **overrides** visibility field: Inactive/Archived always hidden from public site
   - Frontend, API, and admin panel all enforce this precedence rule consistently

---

## Part 9: Implementation Priorities

### Tier 1 (Blocking — Decided)
1. ✅ **Subscription status table:** Complete enum + transitions + scanning gate rule
2. ✅ **Payout eligibility matrix:** Subscription status × IBAN × Cleared balance rules (earned-rights model)
3. ✅ **Limits table defaults:** Engineering sets conservative defaults; product owner signs off as part of go-live checklist. Risk Review role can adjust within bounds; only Super Admin can exceed bounds.
4. ✅ **Plus-addressing v1.2 scope:** Deferred to v1.3. v1.2 uses X-BoomCard-Request-ID header + [#XXXX] subject pattern only.
5. ✅ **Dual-approval protocol:** Any two existing Super Admins must approve (2-of-N); 72h expiry; initiator can cancel. Bootstrap exception: single Super Admin suffices for the first new Super Admin creation.

### Tier 2 (High Priority — Decided)
1. ✅ **Archived reactivation:** Users self-reactivate via password reset + new subscription purchase; Partners via admin action + new onboarding review; QR codes not auto-reactivated (admin must explicitly reactivate each one).
2. ✅ **Admin account statuses:** Active / Inactive / Archived — mirrors User and Partner model. Inactive = login allowed, limited operational rights. Archived = no login.
3. ✅ **Request assignee routing:** Fully manual. All requests go to shared "Unassigned" queue; any admin can claim; Super Admin can reassign.
4. ✅ **Risk combining function:** Additive score (IBAN change +40, receipt match <60% +30, location mismatch +20, 3+ Voided records +20, partner risk flag +10). Thresholds: 0–20 Low, 21–50 Medium, 51+ High.

### Tier 3 (Decided)
1. ✅ **BGN ↔ EUR currency transition:** Dual-currency display was implemented for the transition window, then REMOVED (2026-08-10, BC-QA-031) once the transition ended. All amounts are now EUR-only.
2. ✅ **Password reset rate-limit:** Alert at 3 resets in 24h; account suspension pending Super Admin review at 5 resets in 24h.

---

## Part 10: Appendix — Clash Resolution Summary

### Resolved Clashes (All)

| ID | Type | Original Issue | Resolution | Status |
|----|------|---------|-----------|--------|
| 2.3 | Gap | Inactive status undefined | User doc confirms Inactive as valid account status; behaviour: login allowed, scanning blocked, support requests allowed | ✅ Resolved |
| 3.1/3.2 | Contradiction | "Paid is terminal" vs. "Paid records return to review" | New "Locked" status introduced as intermediate state during payout | ✅ Resolved |
| 3.5 | Gap | Period-lock vs. state-machine transitions conflict | "Locked" (cashback status) ≠ "period lock" (reporting layer); operate independently | ✅ Resolved |
| 3.6 | Gap | TABLE 6 silent on Expired & Voided cashback | Clarified: Expired records unaffected by subscription changes; Voided records remain terminal | ✅ Resolved |
| 4.1 | Gap | No subscription gate for payout | Earned-rights model: Active + Cancelled-within-paid-period allow new payouts; in-flight payouts always continue | ✅ Resolved |
| 5.1 | Gap | Risk combining function undefined | Additive score: IBAN +40, receipt <60% +30, location mismatch +20, 3+ Voided +20, partner flag +10. Thresholds: 0–20 Low, 21–50 Medium, 51+ High | ✅ Resolved |
| 5.2 | Gap | IBAN-change risk mentioned but not in signal table | Confirmed as tracked signal; included in additive scoring (+40) | ✅ Resolved |
| 6.1 | Contradiction | 12 templates promised, 1 supplied | Complete template table provided (12 templates across user, partner, request categories) | ✅ Resolved |
| 6.6 | Gap | User notifications asymmetry | Confirmed: Partners notified of status changes; Users are not (intentional design) | ✅ Resolved |
| 7.1 | Gap | Plus-addressing scope ambiguous | Deferred to v1.3; v1.2 uses X-BoomCard-Request-ID header + [#XXXX] subject pattern only | ✅ Resolved |
| 7.2 | Gap | Request assignee assignment undefined | Fully manual: shared "Unassigned" queue; any admin can claim; Super Admin can reassign | ✅ Resolved |
| 8.1/8.3 | Contradiction | Form vs. email channel ambiguity | Clarified: Form creates Partner Application; Email creates unified Help Request (distinct entity types) | ✅ Resolved |
| 8.3 | Contradiction | TABLE 36 vs. 41 disagree on office@ role | Reconciled: office@ both receives notifications (TABLE 36) and parses inbound mail (TABLE 41) | ✅ Resolved |
| 9.1 | Contradiction | Two independent visibility signals | Status rule takes precedence: Inactive/Archived always hidden regardless of field | ✅ Resolved |
| 9.4 | Gap | QR statuses "В обработка" & "Заменен" have no transitions | All four QR statuses now have defined transitions and semantics | ✅ Resolved |
| 10.1 | Terminology | "Заявки" overload | Disambiguated: UI context makes distinction clear (Partners > Заявки vs. Help > Заявки) | ✅ Resolved |
| 10.3 | Terminology | "Status" used for 10+ entity types | Confirmed as intentional; schema uses qualified names (user_account_status, etc.) | ✅ Resolved |
| 10.6 | Terminology | "Бизнес формула" undefined | Referent identified: percentage split algorithm (partner%, cashback%, margin%) | ✅ Resolved |
| 11.1 | Gap | Help requests have no SLA | Confirmed: Help requests have no SLA (distinct from Partner Applications, which have SLA) | ✅ Resolved |
| 11.4 | Gap | Password reset "repeated" undefined | Alert at 3 resets in 24h; account suspension pending Super Admin review at 5 resets in 24h | ✅ Resolved |
| 12.1 | Gap | BGN/EUR transition undefined | Dual-currency display was implemented for the transition window, then REMOVED (2026-08-10, BC-QA-031) once the transition ended — feature removed, EUR-only retained | ✅ Resolved (feature removed) |
| 13.3 | Gap | Dual-approval protocol for Super Admin creation undefined | 2-of-N Super Admin approval; 72h expiry; initiator can cancel; bootstrap exception for single-SA systems | ✅ Resolved |
| 2.1/2.2 | Gap | Subscription status table missing Cancelled behaviour | Access ends at period end; Cancelled = scanning allowed through last paid day, then Expired | ✅ Resolved |
| 2.4 | Gap | Archived account reactivation undefined | Users: password reset link + new subscription; Partners: admin action + new onboarding review; QR codes require explicit admin reactivation per code | ✅ Resolved |
| 2.6 | Gap | Admin account status enum undefined | Active / Inactive / Archived — mirrors User and Partner model | ✅ Resolved |
| 5.4 | Gap | Limits table defaults and change authority undefined | Engineering sets defaults; product owner signs off at go-live; Risk Review adjusts within bounds; Super Admin can exceed bounds | ✅ Resolved |
| Gap 12 | Gap | Inactive user behaviour undefined | Login allowed, scanning blocked, support requests allowed (mirrors partner model) | ✅ Resolved |



___


## Design/UI:
Follow the colors and design of the marketing website (Boomcard)

---

## End of Specification

**Next Steps:**
1. Backend team uses this spec as reference for implementation 
2. Engineering proposes anti-fraud limits defaults; product owner signs off as part of go-live checklist
3. Configuration and integration testing begin
4. Launch readiness assessment

---

*This specification consolidates Admin v1.2, Partner Module Final, and User Account Final. It supersedes separate module specs for implementation and serves as the single source of truth for cross-module consistency.*
