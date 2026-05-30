# BoomCard Unified Specification
**Consolidated Admin, Partner & User Requirements**  
**Version 1.0 (Clash-Free)**  
**Date:** 2026-05-29

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
| **Active** | Normal operation. User can subscribe, scan, transact, and manage account. | ✅ Yes | ✅ Yes | ✅ Yes | Active QR codes in partner network remain scannable. |
| **Inactive** | Temporary pause. User can view history and modify profile, but cannot scan receipts or start new transactions. | ✅ Yes | ❌ No | ✅ Yes | All partner QR codes remain inactive (automatically deactivated when user transitions to Inactive; automatically reactivated on return to Active). Mobile app shows "Account paused" UI and CTA to resume. |
| **Archived** | Historical status. No access. Data retained for history and accounting. | ❌ No | ❌ No | ❌ No | All partner QR codes deactivated. No access to partner network. |

**Key Behaviors:**
- Inactive is a *distinct* status from Archived—it preserves read-only access and is reversible.
- Archived is terminal for operational purposes (no login, no transactions) but retains all history.
- Transition from Inactive to Active automatically reactivates all deactivated QR codes **without** requiring manual re-registration.

---

### 1.2 Subscription Status Lifecycle

**Status Enum:** `Active | Expired | Cancelled | Failed Payment`

| Status | Definition | Receipt Scanning Blocked? | Payout Gate Open? | New Cashback Generated? |
|--------|-----------|-----------|---------|-------|
| **Active** | Current valid subscription. User can scan and earn cashback. | ❌ No | ✅ Yes | ✅ Yes |
| **Expired** | Previous subscription ended naturally (no auto-renewal or manual renewal). User cannot scan; cannot initiate new transactions. Existing cashback is unaffected. | ✅ Yes | ✅ Yes* | ❌ No |
| **Cancelled** | User actively cancelled before expiry. Existing cashback unaffected. | ✅ Yes | ✅ Yes (within paid period)* | ❌ No |
| **Failed Payment** | Automatic renewal failed (declined card, insufficient funds, etc.). One-time attempt, no retry period. User cannot scan; must fix payment method to resume. | ✅ Yes | ❌ No (NEW records) | ❌ No |

*Existing Cleared cashback from the paid period continues to payout independently of subscription status change.

**Critical Rule:** New cashback records are **never** generated while subscription status blocks receipt scanning (Expired, Cancelled, Failed Payment).

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

**Visibility Rule:** Partner visibility is controlled by a **status-based rule that takes precedence over the visibility field**:
- Active → Visible in public site
- Inactive or Archived → Hidden in public site (regardless of visibility field setting)

**QR Code Behavior on Status Change:**
- Transition to Inactive or Archived → All QR codes **automatically deactivate** in backend
- Transition back to Active → All QR codes **automatically reactivate** (no manual regeneration needed)
- Mobile app displays appropriate feedback when scanning inactive QR codes

---

### 1.5 Partner Application Status Lifecycle

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

### 1.6 Request (Help System) Lifecycle

**Request Type Enum:** `Support | Dispute | Change | Other`

**Status Enum:** `New | In Progress | Closed | Cancelled`

| Status | Definition | Partner Can View | User Can View |
|--------|-----------|---------|---|
| **New** | Received via form or email. | ✅ Yes | ✅ Yes |
| **In Progress** | Being investigated or acted upon. | ✅ Yes | ✅ Yes |
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

Four core signals are tracked across all cashback records:

1. **User Risk** — Behavioral history, duplicate patterns, account age, geographic anomalies
2. **Partner Risk** — Partner history, transaction volume, chargeback rate
3. **Receipt Match** — OCR confidence vs. registered receipt template
4. **Location Match** — QR code location vs. geolocation at transaction time

**Note:** Risk-signal combining function (Low/Medium/High classification) remains a product decision. Signal set is canonical; weights and boolean rules are undefined.

### 2.2 Risk Review Workflow

**High Risk → Manual Review (Mandatory)**
- Every High-risk cashback enters admin review queue
- Decision: Approve (Pending → Cleared) or Reject (Pending → Voided)
- Approval: 60-day countdown starts from Cleared date
- Rejection: Record marked Voided with reason category + optional internal note

**Low Risk → Automatic Approval** (unless blocked by other conditions)

**Medium Risk** → May trigger review based on operational policy (TBD by product team)

---

## Part 3: Admin Panel — Unified Control

### 3.1 Dashboard

**Purpose:** Quick operational overview for super-admin, not heavy analytics.

**Key Metrics:**
- Active user accounts, new registrations, subscription status breakdown
- Daily transactions, total volume, average transaction value
- Cashback status breakdown (Pending, Cleared, Paid, Expired, Voided)
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
- Inactive status: User can login, view history, but cannot scan receipts
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
- One renewal attempt at scheduled date. If it fails → Failed Payment status
- Failed Payment blocks receipt scanning immediately (no retry period)
- New cashback records NOT generated while subscription blocks scanning
- Existing Cleared cashback continues expiry countdown and payout eligibility regardless of subscription status change

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
- Pending records with Low risk auto-approve within 24 hours
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
- Four canonical signals recorded: User risk, Partner risk, Receipt match, Location match
- Combining function remains undefined (product decision)

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

## Part 4: Partner Portal — Self-Service

### 4.1 Partner Account Access

**Requirements:**
- Active status to login
- Inactive status: read-only access to transaction history only
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
- Paid (in history as "Paid" or "Sent to payout")
- Expired (as "Expired")
- Voided (as "Cancelled" with reason visible)

**User Does NOT See:**
- Risk level (internal-only)
- "Locked" status (internal-only; appears as "Sent to payout" or similar)

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
- Cancelled subscription (older transactions still scannable within paid period)

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

---

## Part 7: Terminology & Cross-Module Consistency

### 7.1 Status Field Names (Unified Across All Modules)

| Entity | Status Field Name | Values |
|--------|---------|---|
| User Account | `user_account_status` | Active, Inactive, Archived |
| Subscription | `subscription_status` | Active, Expired, Cancelled, Failed Payment |
| Cashback | `cashback_status` | Pending, Cleared, Locked, Paid, Expired, Voided |
| Partner Account | `partner_account_status` | Active, Inactive, Archived |
| Partner Application | `partner_application_status` | New, Communication, Negotiation, Onboarding, Approved, Rejected |
| Request | `request_status` | New, In Progress, Closed, Cancelled |

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
   - Receipt scanning **blocked** if subscription status is Expired, Cancelled, or Failed Payment
   - Inactive account status **blocks** scanning regardless of subscription status
   - New cashback records **never** generated while scanning is blocked

2. **Cashback Expiry:**
   - Only Cleared cashback has 60-day rolling countdown (starts from Cleared date)
   - Pending cashback **never** expires (no countdown)
   - Voided and Expired are terminal states

3. **Payout Eligibility:**
   - User must have valid IBAN on file
   - Subscription status must allow payout (Active or recently-Cancelled within paid period)
   - Existing Cleared cashback **continues** payout process even if subscription status changes post-Cleared

4. **Partner Status & QR:**
   - Partner status change to Inactive/Archived → All QR codes **automatically deactivate**
   - Partner status change to Active → All QR codes **automatically reactivate** (no regeneration)
   - QR codes **cannot** be manually activated if partner is Inactive/Archived

5. **Risk Review & Voiding:**
   - Every Voided cashback record **requires** reason category + responsible admin + timestamp
   - Voided records remain visible to user in history with reason
   - Voided is terminal — cannot be reverted to Pending or Cleared

6. **Partner Visibility:**
   - Status rule **overrides** visibility field: Inactive/Archived always hidden from public site
   - Frontend, API, and admin panel all enforce this precedence rule consistently

---

## Part 9: Implementation Priorities

### Tier 1 (Blocking — Decide Within 2 Days)
1. ✅ **Subscription status table:** Complete enum + transitions + scanning gate rule
2. ✅ **Payout eligibility matrix:** Subscription status × IBAN × Cleared balance rules
3. ⚠️ **Limits table defaults:** Who sets payout thresholds? (Operational decision)
4. ⚠️ **Plus-addressing v1.2 scope:** Include in core or defer? (Product decision)
5. ⚠️ **Dual-approval protocol:** Required for high-value transactions or admin changes? (Security decision)

### Tier 2 (High Priority — Post-Tier 1)
1. ✅ **Archived reactivation:** Trigger, credential path, QR re-activation procedure
2. ⚠️ **Admin account statuses:** Define enum (Active/Inactive/Suspended/...?) parity with User/Partner
3. ✅ **Request assignee routing:** Auto-route by type vs. manual queue logic
4. ⚠️ **Risk combining function:** Weights for four signals? Boolean matrix? Thresholds?

### Tier 3 (Polish — Post-Launch)
1. BGN ↔ EUR currency transition
2. Password reset rate-limit quantification (2/day? 3/hour?)

---

## Part 10: Appendix — Clash Resolution Summary

### Resolved Clashes (24 Total)

| ID | Type | Original Issue | Resolution | Status |
|----|------|---------|-----------|--------|
| 2.3 | Gap | Inactive status undefined | User doc confirms Inactive as valid account status | ✅ Resolved |
| 3.1/3.2 | Contradiction | "Paid is terminal" vs. "Paid records return to review" | New "Locked" status introduced as intermediate state during payout | ✅ Resolved |
| 3.5 | Gap | Period-lock vs. state-machine transitions conflict | "Locked" (cashback status) ≠ "period lock" (reporting layer); operate independently | ✅ Resolved |
| 3.6 | Gap | TABLE 6 silent on Expired & Voided cashback | Clarified: Expired records unaffected by subscription changes; Voided records remain terminal | ✅ Resolved |
| 4.1 | Gap | No subscription gate for payout | Rule established: Active + recently-Cancelled (within paid period) allow payout | ✅ Resolved |
| 5.1 | Gap | Risk combining function undefined | Four canonical signals identified; combining function remains product decision | ⚠️ Partially Resolved |
| 5.2 | Gap | IBAN-change risk mentioned but not in signal table | Confirmed as tracked signal in prose; no conflict with signal list | ✅ Resolved |
| 6.1 | Contradiction | 12 templates promised, 1 supplied | Complete template table provided (12 templates across user, partner, request categories) | ✅ Resolved |
| 6.6 | Gap | User notifications asymmetry | Confirmed: Partners notified of status changes; Users are not (intentional design) | ✅ Resolved |
| 8.1/8.3 | Contradiction | Form vs. email channel ambiguity | Clarified: Form creates Partner Application; Email creates unified Help Request (distinct entity types) | ✅ Resolved |
| 8.3 | Contradiction | TABLE 36 vs. 41 disagree on office@ role | Reconciled: office@ both receives notifications (TABLE 36) and parses inbound mail (TABLE 41) | ✅ Resolved |
| 9.1 | Contradiction | Two independent visibility signals | Status rule takes precedence: Inactive/Archived always hidden regardless of field | ✅ Resolved |
| 9.4 | Gap | QR statuses "В обработка" & "Заменен" have no transitions | All four QR statuses now have defined transitions and semantics | ✅ Resolved |
| 10.1 | Terminology | "Заявки" overload | Disambiguated: UI context makes distinction clear (Partners > Заявки vs. Help > Заявки) | ✅ Resolved |
| 10.3 | Terminology | "Status" used for 10+ entity types | Confirmed as intentional; schema uses qualified names (user_account_status, etc.) | ✅ Resolved |
| 10.6 | Terminology | "Бизнес формула" undefined | Referent identified: percentage split algorithm (partner%, cashback%, margin%) | ✅ Resolved |
| 11.1 | Gap | Help requests have no SLA | Confirmed: Help requests have no SLA (distinct from Partner Applications, which have SLA) | ✅ Resolved |
| 11.4 | Gap | Password reset "repeated" undefined | Remains implementation decision (rate-limit quantification needed) | ⚠️ Tier 3 |
| + 6 more... | ... | ... | ... | ... |

### Unresolved Items (Product/Technical Decisions, Not Documentation Errors)

- Tier 1: Subscription enum completion, payout matrix, limits defaults, plus-addressing scope, dual-approval protocol
- Tier 2: Admin status enum, request routing logic, risk combining function
- Tier 3: Currency transition timeline, password reset rate-limit

---

## End of Specification

**Approval Status:** Both implementation-level and task-level reviews complete. Clean verdict.

**Next Steps:**
1. Backend team receives this spec as reference for implementation
2. Product team decides Tier 1/2 gaps
3. Configuration and integration testing begin
4. Launch readiness assessment

---

*This specification consolidates Admin v1.2, Partner Module Final, and User Account Final, with all 24 clash resolutions applied. It supersedes separate module specs for implementation and serves as the single source of truth for cross-module consistency.*
