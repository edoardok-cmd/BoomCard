# BoomCard User (Mobile Subscriber) Invariant Matrix

**Purpose:** Turn the BoomCard user re-audit (scope `BC-USER-SPEC-REAUDIT`) from open-ended sampling into an enumerated, ID'd, trackable coverage surface. Every machine-checkable user invariant in `08-user-spec-extracted.md` is one row here. This matrix is the definition of "done" for the audit: the audit is complete only when every row below is `verified` in the coverage ledger (`.claude/reviews/BC-USER-SPEC-REAUDIT-coverage-ledger.md`).

**Audience:** future user re-audit agents (runs N≥1; this matrix was bootstrapped at run-1, 2026-06-30).

**Source of truth:** `docs/specs/08-user-spec-extracted.md` (BoomCard Unified Spec v1.2 user extract). Section refs below (`§x.y`, rule `R-n`) point into that file.

**Grounding:** each invariant is bound to a real endpoint/service. User-scoped router mount prefixes (from `server.ts`; 158 user-scope routes per `app-route-ownership-manifest.json`):
- auth → `/api/auth/*` (login, register, profile, email/password change, account delete, consent)
- wallet → `/api/wallet/*` (balance, transactions, payout-account, statistics)
- subscriptions → `/api/subscriptions/*` (create, current, history, cancel, auto-renewal, change-card, reactivate, retry-payment, trial-refund, update-plan)
- receipts → `/api/receipts/*` and `/api/receipts/v2/*` (upload, OCR, cashback, list/detail)
- cards → `/api/cards/*`
- notifications → `/api/notifications/*` (list, read, preferences, push)
- help → `/api/help/*` (ticket, tickets, replies)
- favorites → `/api/favorites/*`
- reviews → `/api/reviews/*`
- payments → `/api/payments/*` (history, methods, subscription)
- offers → `/api/offers/*` (mostly public/partner-owned; user GET only)
- loyalty → `/api/loyalty/accounts/me`

---

## ⚙️ Suite-covered classes (verified-by-suite, not row-by-row)

Four sweep tests mechanically cover entire invariant classes for the user surface. When green, every row tagged with the corresponding `[SUITE: X]` is verified by the suite rather than probed one-by-one. A re-audit confirms the suite is green and that new endpoints were added to the sweep's route list.

- **`user-cross-scope-sweep.test.ts`** — `[SUITE: XSCOPE]`. Two real subscribers A and B; asserts A cannot read or mutate B's receipts, help tickets, notifications, subscriptions, reviews, wallet, or favorites (403/404, never B's data in a 200 body). Each test has a positive control (owner CAN access) proving the gate is real.
- **`user-input-500-sweep.test.ts`** — `[SUITE: INPUT]`. For every user route with a `:id`-style path param, sends malformed values (`not-a-uuid`, empty, SQL-ish, overlong) and asserts a clean 4xx, NEVER a 500 / Prisma `P2023`/`22P02`.
- **`user-auth-gate-sweep.test.ts`** — `[SUITE: AUTH]`. Asserts (a) every user endpoint rejects an unauthenticated request (401), and (b) admin/partner-only sub-routes physically mounted under user routers (`/receipts/admin/all`, `/receipts/v2/admin/*`, `/receipts/v2/bulk-approve|reject`, `/reviews/:id/approve|reject|flag|admin-response`, offers mutations) reject a plain subscriber (403).
- **`user-currency-leak-sweep.test.ts`** — `[SUITE: CUR]`. With `currency_transition_window_open=false`, asserts no user-facing money response leaks a raw BGN scalar; with the window open, asserts dual BGN+EUR display. Covers the CUR class on wallet/payments/subscription/receipt money fields.

---

## ACCT — User Account Entity & Status Lifecycle (§1)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-ACCT-001 | `user_account_status` enum is exactly `Active \| Inactive \| Archived` | ENUM | static |
| INV-USER-ACCT-002 | Inactive account: login allowed, view history allowed, but scanning/new-cashback blocked | ACL | static |
| INV-USER-ACCT-003 | Archived account: login fully blocked (no operational access) | AUTH | [SUITE: AUTH] |
| INV-USER-ACCT-004 | Inactive blocks scanning **regardless of subscription status** (even Active subscription) | ACL | static |
| INV-USER-ACCT-005 | A user's account status change does NOT disable QR codes for other users (location-level) | XSCOPE | static |
| INV-USER-ACCT-006 | Status transitions follow the allowed graph; Archived has no forward operational transition | STATE | static |
| INV-USER-ACCT-007 | Risk profile field is internal-only — never returned in any user-facing account/profile response | LEAK | static |

## REG — Registration Flow & Trial Period (§2)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-REG-001 | Registration requires name, email, phone, password; IBAN optional at registration | INPUT | static |
| INV-USER-REG-002 | Email verification does NOT block scanning (user can scan before/after verify) | STATE | static |
| INV-USER-REG-003 | Post-registration state: account Active; subscription Active only after successful charge | STATE | static |
| INV-USER-REG-004 | No profile/financial record created before successful payment (03-module constraint) | STATE | static |
| INV-USER-REG-005 | 24h trial: cancel within window → all trial-period Pending cashback Voided | STATE | static |
| INV-USER-REG-006 | Voided trial cashback excluded from payout threshold and not paid out | MONEY | static |
| INV-USER-REG-007 | Trial cashback held `TRIAL_PENDING`, visible as Pending, EXCLUDED from spendable/available balance until trial window closes | MONEY | static |

## SUB — Subscription Plans & Status Lifecycle (§3)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-SUB-001 | `subscription_status` enum: `Active \| Expired \| Cancelled \| Failed Payment` | ENUM | static |
| INV-USER-SUB-002 | Expired blocks scanning & new cashback; in-flight payout continues | STATE | static |
| INV-USER-SUB-003 | Cancelled-within-paid-period: scanning + new cashback allowed through last paid day | STATE | static |
| INV-USER-SUB-004 | Cancelled post-period auto-transitions to Expired; scanning blocked | STATE | static |
| INV-USER-SUB-005 | Failed Payment blocks scanning immediately; no retry period | STATE | static |
| INV-USER-SUB-006 | Renewal: one attempt; on failure → Failed Payment immediately (no retry window) | STATE | static |
| INV-USER-SUB-007 | Cancel subscription stops payment retries & reminders; marketing continues only with valid consent | NOTIF | static |
| INV-USER-SUB-008 | Cancel/auto-renewal/change-card/update-plan operate only on the caller's own subscription | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-SUB-009 | Upgrade plan available only for Basic/Premium-Weekly Active subscriptions | STATE | static |
| INV-USER-SUB-010 | `GET /subscriptions/current` returns caller-scoped subscription only | XSCOPE | [SUITE: XSCOPE] |

## CB — Cashback Lifecycle State Machine (§4)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-CB-001 | `cashback_status` enum: `Pending \| Cleared \| Locked \| Paid \| Expired \| Voided` | ENUM | static |
| INV-USER-CB-002 | Allowed transitions only: Pending→{Cleared,Voided}; Cleared→{Locked,Expired,Voided}; Locked→Paid; Paid/Expired/Voided terminal | STATE | static |
| INV-USER-CB-003 | Pending→Cleared trigger: auto-approval for Low AND Medium risk; manual approval for High | STATE | static |
| INV-USER-CB-004 | Pending→Voided requires reason category (+ internal note); rejection path | STATE | static |
| INV-USER-CB-005 | Cleared→Expired only after 60 days from Cleared date without Paid | STATE | static |
| INV-USER-CB-006 | Voided is terminal — cannot revert to Pending/Cleared | STATE | static |
| INV-USER-CB-007 | "Rejected" is a transaction/receipt status only — there is no "Rejected" cashback state; rejected txn → cashback Voided | STATE | static |
| INV-USER-CB-008 | Voided cashback record shows reason category to user; risk level NOT shown | LEAK | static |

## VAL — 60-Day Rolling Validity (§5)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-VAL-001 | 60-day countdown applies ONLY to Cleared records | STATE | static |
| INV-USER-VAL-002 | Countdown starts from Cleared date | STATE | static |
| INV-USER-VAL-003 | Pending cashback never expires (no countdown while Pending) | STATE | static |
| INV-USER-VAL-004 | Cleared not Paid within 60 days → auto Expired (terminal) | STATE | static |
| INV-USER-VAL-005 | 7-day pre-expiry warning notification sent for Cleared nearing 60-day deadline | NOTIF | static |

## WAL — Wallet & Balance Computation (§6)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-WAL-001 | Available balance includes ONLY Cleared records | MONEY | static |
| INV-USER-WAL-002 | Pending shown separately as "In Review"; NOT in available balance | MONEY | static |
| INV-USER-WAL-003 | Locked shown as "Sent to payout"; NOT in available balance | MONEY | static |
| INV-USER-WAL-004 | Paid & Expired appear in history only (not available balance) | MONEY | static |
| INV-USER-WAL-005 | Payout threshold calculated from Cleared cashback only (Pending & Locked excluded) | MONEY | static |
| INV-USER-WAL-006 | A new Pending cashback record is created on valid scan / receipt upload / OCR-completed transaction | STATE | static |
| INV-USER-WAL-007 | IBAN not required to view wallet or accumulate cashback | STATE | static |
| INV-USER-WAL-008 | `GET /wallet/balance` & `/wallet/transactions` scoped to caller only | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-WAL-009 | Dashboard cashback block shows Available, Pending, Expiring as distinct line items (not aggregated) | STATE | static |
| INV-USER-WAL-010 | User cannot modify transactions/receipt data/amounts/statuses from the cashback screen | AUTH | static |

## PAY — Payout Flow & Threshold (§7)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-PAY-001 | No user-initiated payout action exists (no "Request Payout" endpoint) | AUTH | static |
| INV-USER-PAY-002 | Payout triggered automatically by nightly scheduler at plan threshold | STATE | static |
| INV-USER-PAY-003 | Payout eligibility: Active or Cancelled-within-period = Yes; Expired/Cancelled-post/Failed = No | STATE | static |
| INV-USER-PAY-004 | In-flight payouts (Locked/Paid) always continue regardless of subscription status | STATE | static |
| INV-USER-PAY-005 | IBAN missing at threshold → payout held + prompt notification; auto-triggers once IBAN saved | STATE | static |
| INV-USER-PAY-006 | Cleared→Locked→Paid during payout processing | STATE | static |
| INV-USER-PAY-007 | Second payout failure is SILENT to user; record stays "Sent to payout" (Locked) | LEAK | static |
| INV-USER-PAY-008 | `PUT /wallet/payout-account` updates only the caller's IBAN/beneficiary | XSCOPE | [SUITE: XSCOPE] |

## QR — QR Code Scanning Flow (§8)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-QR-001 | Scan prerequisites: account Active AND (subscription Active OR Cancelled-within-period) | ACL | static |
| INV-USER-QR-002 | Scan blocked for account Inactive/Archived | ACL | static |
| INV-USER-QR-003 | Scan blocked for subscription Failed Payment / Expired / Cancelled-post-period | ACL | static |
| INV-USER-QR-004 | QR token must be Active; Inactive/In-Processing/not-found → transaction cannot complete | STATE | static |
| INV-USER-QR-005 | On success a QR session + Pending transaction & cashback are created | STATE | static |
| INV-USER-QR-006 | A user can only scan/redeem under their own identity (no cross-user scan attribution) | XSCOPE | [SUITE: XSCOPE] |

## OCR — Receipt Upload & OCR / Risk (§9)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-OCR-001 | Web "Upload receipt" is informational only — no upload/OCR in browser | STATE | static |
| INV-USER-OCR-002 | OCR confidence <60% → +30 risk; ≥60% → no signal | RISK | static |
| INV-USER-OCR-003 | Additive risk signals exactly: IBAN-changed-24h +40, receipt<60% +30, QR-geo-mismatch +20, 3+ Voided +20, partner-flag +10 | RISK | static |
| INV-USER-OCR-004 | Risk bands: 0–20 Low, 21–50 Medium, 51+ High | RISK | static |
| INV-USER-OCR-005 | Only High risk routed to manual review (`requiresManualReview === riskLevel==='High'`); Low+Medium auto-approve within 24h | RISK | static |
| INV-USER-OCR-006 | Risk level internal-only — never in any user-facing receipt/cashback response | LEAK | static |
| INV-USER-OCR-007 | Receipt upload succeeds only for the caller's own QR session/scan | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-OCR-008 | OCR/receipt processing is a REAL implementation, not a stub/log-only/conf=0 placeholder | MOCK | static |

## ER — Earned-Rights Model (§10)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-ER-001 | Cashback earned during active subscription remains payable after subscription status change | STATE | static |
| INV-USER-ER-002 | New payout initiation is subscription-gated; in-flight payout is subscription-independent | STATE | static |

## NOTIF — User-Facing Notifications (§11)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-NOTIF-001 | Payment, Transactional, Cashback-Expiry categories are mandatory — cannot be opted out | NOTIF | static |
| INV-USER-NOTIF-002 | Only Marketing is consent-gated (separate email + phone toggles) | NOTIF | static |
| INV-USER-NOTIF-003 | Notification preferences endpoint cannot disable mandatory categories | NOTIF | static |
| INV-USER-NOTIF-004 | Users NOT notified on account_status change (Inactive/Archived) — intentional asymmetry | NOTIF | static |
| INV-USER-NOTIF-005 | Second payout failure escalation not notified to user | NOTIF | static |
| INV-USER-NOTIF-006 | `GET /notifications` and per-id read/archive/delete scoped to caller only | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-NOTIF-007 | Notification delivery is a REAL implementation, not log-only/stub | MOCK | static |

## HELP — Help Requests Visibility (§12, §11.4)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-HELP-001 | User can view own help request statuses (New/In Progress/Waiting/Closed/Cancelled) | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-HELP-002 | `GET /help/tickets/:id` + replies scoped to caller — cannot read another user's ticket | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-HELP-003 | Request types limited to Support \| Dispute \| Change \| Other | INPUT | static |
| INV-USER-HELP-004 | Email threading via `X-BoomCard-Request-ID` header + `[#XXXX]` subject; plus-addressing NOT implemented (deferred v1.3) | STATE | static |
| INV-USER-HELP-005 | Help requests have no SLA enforcement | STATE | static |

## ACL — Access Control & Profile Deletion (§13)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-ACL-001 | Permissions-by-account-status matrix enforced (Archived: all No; Inactive: read-only + support + IBAN) | ACL | static |
| INV-USER-ACL-002 | Permissions-by-subscription-status matrix enforced (scan/cashback/new-payout gated; history always Yes) | ACL | static |
| INV-USER-ACL-003 | User never sees: risk level, internal admin notes on Voided, admin identity, 2nd-failure review | LEAK | static |
| INV-USER-ACL-004 | Profile deletion deactivates access + stops marketing but RETAINS financial history | STATE | static |
| INV-USER-ACL-005 | Profile deletion is distinct from subscription cancellation (separate action) | STATE | static |
| INV-USER-ACL-006 | Email change: 4-step flow (new email → verify link → confirm current password → uniqueness check) | STATE | static |
| INV-USER-ACL-007 | `DELETE /auth/account` and profile edits operate only on the caller's own account | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-ACL-008 | Logout terminates session only; no other side effects | STATE | static |

## REACT — Archived Account Reactivation (§14)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-REACT-001 | Archived reactivation gated on BOTH password reset AND new subscription purchase | STATE | static |
| INV-USER-REACT-002 | No self-service "reactivate" button/endpoint for Archived accounts | AUTH | static |

## FAV — Favorites (§15)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-FAV-001 | `GET/POST/DELETE /favorites` scoped to caller — cannot read/mutate another user's favorites | XSCOPE | [SUITE: XSCOPE] |
| INV-USER-FAV-002 | User cannot edit partner profile data via favorites screen | AUTH | static |

## DEF — Deferred Features (§16)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-DEF-001 | Plus-addressing email routing NOT implemented (deferred v1.3) | STATE | static |
| INV-USER-DEF-002 | Nearby (Наблизо) feature behaviour matches a documented deferred-decision option (not a half-built leak) | STATE | static |

## CUR — Currency Display (§17)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-CUR-001 | Transition window OPEN → all user money amounts shown in BOTH BGN and EUR | CUR | [SUITE: CUR] |
| INV-USER-CUR-002 | Transition window CLOSED → BGN hidden, EUR only; no raw BGN scalar leaks | CUR | [SUITE: CUR] |
| INV-USER-CUR-003 | Rule applies to all monetary amounts (cashback balances, payout amounts, transaction history) | CUR | [SUITE: CUR] |

## DI — Data Integrity Atomic Rules (§19) — cross-references

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-DI-001 | Password reset rate-limit: alert at 3/24h; suspend pending Super-Admin review at 5/24h | STATE | static |
| INV-USER-DI-002 | Voided records require reason category + responsible admin identity + timestamp (durably persisted) | STATE | static |
| INV-USER-DI-003 | Default language Bulgarian; English only if explicitly selected (notifications + UI) | STATE | static |

## INPUT — Malformed path-param hardening (cross-cutting)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-INPUT-001 | All user `:id`-style routes return clean 4xx (never 500/P2023/22P02) on malformed id | INPUT | [SUITE: INPUT] |

## AUTH — Authentication & misrouted-admin hardening (cross-cutting)

| Invariant ID | Description | Class | Suite Coverage |
|---|---|---|---|
| INV-USER-AUTH-001 | Every user endpoint rejects unauthenticated requests (401) | AUTH | [SUITE: AUTH] |
| INV-USER-AUTH-002 | Admin-only sub-routes mounted under user routers (`/receipts/admin/all`, `/receipts/v2/admin/*`, `/receipts/v2/bulk-approve\|reject`, `/reviews/:id/approve\|reject\|admin-response`) reject a plain subscriber (403). NOTE: `/reviews/:id/flag` is a legitimate user action (no admin gate) and is excluded. | AUTH | [SUITE: AUTH] |
| INV-USER-AUTH-003 | Partner/owner-only mutations under user routers (offers POST/PUT/DELETE, receipts venue-config/templates) reject a plain subscriber (403) | AUTH | [SUITE: AUTH] |

---

## Exit criteria (audit is DONE only when ALL hold)

1. **Every ledger row is `verified`** — zero `open`, zero `untested`.
2. **All four executable sweeps are green** (`user-cross-scope-sweep`, `user-input-500-sweep`, `user-auth-gate-sweep`, `user-currency-leak-sweep`).
3. **Two consecutive independent passes add ZERO new invariants** to this matrix AND zero new findings — the enumeration has stopped growing.

Until all three hold, the audit continues. A single `open`/`untested` row, a red suite, or a pass that discovers a new invariant resets the "done" claim.
