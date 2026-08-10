# BoomCard Admin Invariant Matrix

**Purpose:** Turn the BoomCard admin re-audit from open-ended sampling into an enumerated, ID'd, trackable coverage surface. Every machine-checkable admin invariant in `06-admin-spec-extracted.md` is one row here. This matrix is the definition of "done" for the audit: the audit is complete only when every row below is `verified` in the coverage ledger (`.claude/reviews/BC-ADMIN-coverage-ledger.md`).

**Audience:** future audit agents (re-audit runs N≥7).

**Source of truth:** `docs/specs/06-admin-spec-extracted.md` (BoomCard Unified Spec v1.2 admin extract). Section refs below (`§x.y`, `Clash n.n`, `Part n`) point into that file.

**Grounding:** each invariant is bound to a real endpoint/service. Router mount prefixes (from `server.ts`):
- cashback → `/api/admin/cashback`
- subscribers → `/api/admin/subscribers`
- subscriptions → `/api/admin/subscriptions`
- payouts → `/api/admin/payouts`
- finance → `/api/admin/finance`
- transactions → `/api/admin/transactions`
- admins → `/api/admin/admins`
- partner requests → `/api/admin/partner-requests` (NOT `/partners` — file is `adminPartners.routes.ts`)
- help → `/api/admin/help`
- marketing → `/api/admin/marketing`
- settings → `/api/admin/settings`
- control → `/api/admin/control`
- dashboard → `/api/admin/dashboard`
- alerts → `/api/admin/alerts`
- menus/venues → `/api/admin/menus`, `/api/admin/venues`
- profile → `/api/admin/me`
- impersonation → `/api/auth/*` (auth router, not an admin router)

---

## ⚙️ Suite-covered classes (verified-by-suite, not row-by-row)

Two exhaustive sweep tests mechanically cover entire invariant classes. When green, every row tagged **[SUITE: CUR]** or **[SUITE: INPUT]** is verified by the suite rather than probed one-by-one. A re-audit still confirms the suite is green and that new endpoints were added to the sweep's route list.

- **`admin-currency-leak-sweep.test.ts`** — flips `currency_transition_window_open=false`, then asserts that NO admin GET/mutation response contains any raw BGN scalar in any field at any nesting depth (top-level `amount`/`balance*`, nested `wallet.*`, summary/`filteredSummary` totals, per-row `display` absence is allowed, raw scalars are not). Covers the entire **CUR** class. (Run-6 Unit E proved this class was still OPEN on `/admin/payouts` — the sweep is the mechanical guard that closes it and keeps it closed.)
- **`admin-uuid-500-sweep.test.ts`** — for every admin route with a `:id`/`:userId`/`:partnerId`/`:tokenId`/`:memberId`/`:overId`/`:roleKey` path param, sends a malformed value (`not-a-uuid`, empty, SQL-ish, overlong) and asserts the response is a clean 4xx (typically 404/400), NEVER a 500 / Prisma `P2023`/`22P02`. Covers the entire **INPUT** class.

---

## CUR — Currency dual-display (Clash 12.1 / §3.7 / §8.1.4)

Rule: window OPEN → both BGN+EUR shown; window CLOSED → BGN hidden, EUR only. Every admin GET (and mutation response) that returns money is a CUR row. Window read via `currencyDisplay.isCurrencyTransitionWindowOpen()` (fail-CLOSED on missing/garbage flag). **All CUR rows are [SUITE: CUR].** Verify each by: window-flip runtime probe OR the sweep test.

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-CUR-001 | Window CLOSED → no raw BGN scalar in `GET /admin/cashback/stats` (totalAccrued/Cleared/Pending/Locked/Paid/Expired/Voided/expiringTotal); only `display` EUR. | §8.1.4 | `adminCashback.routes.ts` GET /stats | runtime probe (flip window) / [SUITE: CUR] |
| INV-CUR-002 | Window CLOSED → no raw BGN in `GET /admin/cashback/summary` (totalOwed). | §8.1.4 | GET /cashback/summary | runtime / [SUITE: CUR] |
| INV-CUR-003 | Window CLOSED → `GET /admin/cashback/payout-thresholds` omits raw BGN per plan; `display` only. | §3.7, §7.3 | GET /cashback/payout-thresholds | runtime / [SUITE: CUR] |
| INV-CUR-004 | Window CLOSED → `GET /admin/cashback/:partnerId/:month/receipts` omits raw cashbackAmount + totalCashbackOwed BGN. | §8.1.4 | GET /cashback/:partnerId/:month/receipts | runtime / [SUITE: CUR] |
| INV-CUR-005 | Window CLOSED → `GET /admin/subscribers` list omits raw wallet.availableBalance/balance/pendingBalance BGN. | §8.1.4 | GET /subscribers | runtime / [SUITE: CUR] |
| INV-CUR-006 | Window CLOSED → `GET /admin/subscribers/export` omits raw wallet BGN scalars. | §8.1.4 | GET /subscribers/export | runtime / [SUITE: CUR] |
| INV-CUR-007 | Window CLOSED → `GET /admin/subscribers/:userId` detail omits raw wallet BGN. | §8.1.4 | GET /subscribers/:userId | runtime / [SUITE: CUR] |
| INV-CUR-008 | Window CLOSED → `GET /admin/subscribers/:userId/cashback` omits raw BGN. | §8.1.4 | GET /subscribers/:userId/cashback | runtime / [SUITE: CUR] |
| INV-CUR-009 | Window CLOSED → `GET /admin/subscriptions` list omits raw paymentTotalAmount BGN. | §8.1.4 | GET /subscriptions | runtime / [SUITE: CUR] |
| INV-CUR-010 | Window CLOSED → `GET /admin/subscriptions/export` omits raw payment BGN. | §8.1.4 | GET /subscriptions/export | runtime / [SUITE: CUR] |
| INV-CUR-011 | Window CLOSED → `GET /admin/subscriptions/user/:userId/history` omits per-sub + summary BGN. | §8.1.4 | GET /subscriptions/user/:userId/history | runtime / [SUITE: CUR] |
| INV-CUR-012 | Window CLOSED → `GET /admin/payouts` omits raw amount/balanceBefore/balanceAfter AND nested wallet.availableBalance/pendingBalance BGN. *(Run-6 E-H1: nested wallet balances LEAKED — open.)* | §8.1.4 | GET /payouts | runtime / [SUITE: CUR] |
| INV-CUR-013 | Window CLOSED → `GET /admin/payouts` summary/filteredSummary totals (pending/processing/completed/failedTotal) are gated, not raw BGN. *(Run-6 E-H2: leaked — open.)* | §8.1.4 | GET /payouts | runtime / [SUITE: CUR] |
| INV-CUR-014 | Window CLOSED → payout mutation responses (`/approve`,`/reject`,`/complete`,`/hold`,`/release`,`/fail`,`/reset-stuck`,`/bulk-approve`) omit raw BGN in echoed amount/balance fields. *(Run-6 E: mutation-response leaks — open.)* | §8.1.4 | PATCH /payouts/:id/* | runtime / [SUITE: CUR] |
| INV-CUR-015 | Window CLOSED → `GET /admin/finance/invoices` omits raw totalCashbackOwed/turnoverAmount/marginAmount BGN. | §8.1.4 | GET /finance/invoices | runtime / [SUITE: CUR] |
| INV-CUR-016 | Window CLOSED → `GET /admin/finance/periods` omits raw monthly total BGN. | §8.1.4 | GET /finance/periods | runtime / [SUITE: CUR] |
| INV-CUR-017 | Window CLOSED → `GET /admin/finance/reports` omits raw BGN across walletTransactions/cashbackInvoices/partnerBreakdown/planBreakdown/payoutBreakdown. | §8.1.4 | GET /finance/reports | runtime / [SUITE: CUR] |
| INV-CUR-018 | Window CLOSED → `GET /admin/finance/payout-thresholds` omits raw BGN. | §3.7 | GET /finance/payout-thresholds | runtime / [SUITE: CUR] |
| INV-CUR-019 | Window CLOSED → `GET /admin/transactions` list omits raw amount/balanceBefore/balanceAfter BGN. | §8.1.4 | GET /transactions | runtime / [SUITE: CUR] |
| INV-CUR-020 | Window CLOSED → `GET /admin/transactions/stats` omits raw totalVolume/totalCashback/totalWithdrawals BGN. | §8.1.4 | GET /transactions/stats | runtime / [SUITE: CUR] |
| INV-CUR-021 | Window CLOSED → `POST /admin/transactions/adjust` response omits raw amount/balanceBefore/balanceAfter BGN. | §8.1.4 | POST /transactions/adjust | runtime / [SUITE: CUR] |
| INV-CUR-022 | Window CLOSED → `GET /admin/transactions/business` omits raw amount/margin/cashback/discount/final/netAmount BGN. | §8.1.4 | GET /transactions/business | runtime / [SUITE: CUR] |
| INV-CUR-023 | Window CLOSED → `GET /admin/transactions/business/stats` omits raw totalVolume/averageValue/totalCashback BGN. | §8.1.4 | GET /transactions/business/stats | runtime / [SUITE: CUR] |
| INV-CUR-024 | Window CLOSED → `GET /admin/dashboard` finance.display (payoutsDue/partnerReceivables/margin) returns null BGN, not raw scalars; cashback amount blocks (accrued/approved/pending/expiringSoon) gated. | §3.1, §8.1.4 | GET /dashboard | runtime / [SUITE: CUR] |
| INV-CUR-025 | Window CLOSED → `GET /admin/settings/payout-thresholds` + `/history` omit raw BGN minAmount where rendered. | §3.7 | GET /settings/payout-thresholds | runtime / [SUITE: CUR] |
| INV-CUR-026 | `GET /admin/settings/currency-display-mode` returns `dual` iff window open, `eur_only` iff closed (the single contract the FE & all gates derive from); PUT to the flag invalidates the display cache immediately. | Clash 12.1 | GET /settings/currency-display-mode; PUT /settings/system | runtime probe |
| INV-CUR-027 | Window OPEN → both BGN and EUR present (dual) on every money GET (regression guard: gating must not hide BGN while OPEN). | Clash 12.1 | all CUR surfaces | runtime / [SUITE: CUR] |
| INV-CUR-028 | Window flag missing/garbage → treated as CLOSED (fail-closed), not OPEN. | §8.1.4 | `currencyDisplay.isCurrencyTransitionWindowOpen` | static read + unit test |

---

## SM — State machines (Part 1, §1.1–§1.7; §1.3 transitions; §3.x). One row per legal/illegal transition.

### SM-CASH — Cashback (§1.3, §3.4)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-CASH-001 | Pending → Cleared is allowed via approve; stamps 60-day countdown from approval date. | §1.3, §3.4 | POST /cashback/entries/:id/approve | executable test |
| INV-SM-CASH-002 | Pending → Voided is allowed via void (requires canonical reason). | §1.3 | POST /cashback/entries/:id/void | executable test |
| INV-SM-CASH-003 | Cleared → Locked is allowed via lock; restricted to SUPER_ADMIN. | §3.4 | POST /cashback/entries/:id/lock | runtime probe (403 for non-SA) |
| INV-SM-CASH-004 | Cleared → Voided is allowed via void. | §1.3 | POST /cashback/entries/:id/void | executable test |
| INV-SM-CASH-005 | Cleared → Expired allowed via 60-day auto-timer (scheduler), not manual-only. | §1.3, §8.1.2 | scheduler expiry job | static read + test |
| INV-SM-CASH-006 | Locked → Paid is allowed via pay; terminal. | §1.3, §3.4 | POST /cashback/entries/:id/pay | executable test |
| INV-SM-CASH-007 | Locked → Voided is allowed (impl extension "any active → Voided"); for admin-locked (status=CANCELLED) only; user-payout-locked (status=COMPLETED) refused 409. | §1.3 impl-ext | POST /cashback/entries/:id/void | executable test |
| INV-SM-CASH-008 | Manual lock→pay path MUST debit wallet.availableBalance so the same cashback cannot also be paid by a later user payout (double-pay guard). *(Run-6 C-H1: NOT debited — open.)* | §1.3, §3.7 | lock/pay service + wallet.service.requestPayout | executable test + runtime |
| INV-SM-CASH-009 | Paid → Paid only (terminal for operational flow; may be investigated, not reverted). | §1.3, Clash 3.6 | service guard | executable test (reject transition) |
| INV-SM-CASH-010 | Expired → Expired only (terminal; no transition out). | §1.3, §8.1.2 | service guard | executable test (reject) |
| INV-SM-CASH-011 | Voided → Voided only (terminal; cannot revert to Pending/Cleared). | §1.3, §8.1.6 | service guard | executable test (reject) |
| INV-SM-CASH-012 | TrialPending → Cleared via scheduler after trial window closes (subscription not cancelled). | §1.3 impl-ext | scheduler `resolveTrialPendingCashback` | static read + test |
| INV-SM-CASH-013 | TrialPending → Voided via scheduler if subscription cancelled within trial window. | §1.3 impl-ext | scheduler | static read + test |
| INV-SM-CASH-014 | TrialPending cannot be manually approved/rejected by admin. | §1.3 impl-ext | route rejects manual action on TrialPending | executable test |
| INV-SM-CASH-015 | Manual expire (`/expire`) is admin-override of auto-expiry; allowed from any active state. | §3.4 impl-ext | POST /cashback/entries/:id/expire | executable test |
| INV-SM-CASH-016 | Pending cashback never starts a 60-day countdown (only Cleared has the timer). | §1.3, §8.1.2 | derivation + scheduler | static read + test |
| INV-SM-CASH-017 | Every Voided record stores reason category + responsible admin id + timestamp; empty/non-canonical category rejected. | §1.3, §8.1.6 | void route + `VOID_REASON_CATEGORIES` | executable test |
| INV-SM-CASH-018 | Void reason must begin with a canonical code (DUPLICATE/FRAUD/SYSTEM_ERROR/ADMIN_CORRECTION/PARTNER_DISPUTE/OTHER); same validation on all void paths. | §1.3 | `assertVoidReasonCategory` | executable test |
| INV-SM-CASH-019 | Locked has no automatic resolution (no auto Locked→Paid); requires manual admin action. | §3.4 | scheduler does NOT auto-pay Locked | static read |
| INV-SM-CASH-020 | Locked is entered automatically by nightly scheduler when wallet Cleared balance reaches plan threshold (no user action). | §3.4 | scheduler lock job | static read + test |

### SM-USER — User account (§1.1)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-USER-001 | Account status accepts only Active/Inactive/Archived via admin PATCH; others (e.g. DELETED) → 400. | §1.1, §7.1 | PATCH /subscribers/:userId/status | runtime probe (400 on DELETED) |
| INV-SM-USER-002 | Inactive user: login allowed, scanning blocked, support requests allowed, history read-only. | §1.1, Clash 2.3, Gap 12 | status gate / scan gate | executable test |
| INV-SM-USER-003 | Archived user: no login, no scan, no history access; data retained. | §1.1 | status gate | executable test |
| INV-SM-USER-004 | Lifting SUSPENDED user status requires SUPER_ADMIN (non-SA → 403). | §1.1 impl-ext | PATCH /subscribers/:userId/status | runtime probe |
| INV-SM-USER-005 | Archived → Active reactivation is self-service only (password reset + new subscription), not an admin status flip. | §1.1, Clash 2.4 | reactivation flow | static read |
| INV-SM-USER-006 | Inactive user_account_status blocks scanning regardless of subscription_status. | §8.1.1 | scan gate | executable test |
| INV-SM-USER-007 | Restore-after-soft-delete revives to the prior status (round-trips statusBeforeDelete), not a blanket ACTIVE. | §1.1 impl | restore route | runtime probe |

### SM-SUB — Subscription (§1.2)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-SUB-001 | Active subscription → scanning allowed, payout gate open, new cashback generated. | §1.2 | scan/payout gate | executable test |
| INV-SM-SUB-002 | Expired → scanning blocked, no new payouts (in-flight continue), no new cashback. | §1.2, §8.1.1 | scan/payout gate | executable test |
| INV-SM-SUB-003 | Cancelled-within-paid-period → scanning + new cashback allowed through last paid day; payout gate open. | §1.2, §2.1/2.2, §8.1.3 | scan/payout gate | executable test |
| INV-SM-SUB-004 | Cancelled post-period auto-transitions to Expired; scanning blocked, payout blocked. | §1.2, §2.1/2.2 | scheduler/gate | executable test |
| INV-SM-SUB-005 | Failed Payment → scanning blocked immediately; no retry period; one renewal attempt only. | §1.2, §3.3 | gate + billing | executable test |
| INV-SM-SUB-006 | New cashback never generated while scanning is blocked (Expired/Cancelled-post/Failed Payment). | §8.1.1 | cashback creation gate | executable test |
| INV-SM-SUB-007 | In-flight payouts always continue regardless of later subscription status change (earned-rights). | §1.2, §8.1.3, Clash 4.1 | payout gate | executable test |
| INV-SM-SUB-008 | Subscription cancel route distinguishes FAILED_PAYMENT immediate cancel vs deferred cancelAtPeriodEnd. | §1.2 impl | PATCH /subscribers/:userId/cancel | executable test |
| INV-SM-SUB-009 | Subscription cancel/reactivate/resume/auto-renewal routes only act on valid current statuses (no illegal jumps). | §1.2 | POST /subscriptions/:id/{cancel,reactivate,resume}, PATCH .../auto-renewal | executable test |

### SM-PART — Partner account (§1.4) + QR (§3.6, §8.1.5)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-PART-001 | Partner → Inactive: all QR codes auto-deactivate atomically (same transaction). | §1.4, §8.1.5 | PATCH /partner-requests/:id/partner-status → `setPartnerStatus`→`syncQrCodesForPartnerTx` | executable test |
| INV-SM-PART-002 | Partner → Archived: all QR codes auto-deactivate. | §1.4, §8.1.5 | setPartnerStatus | executable test |
| INV-SM-PART-003 | Partner Inactive → Active: all QR codes auto-reactivate (no regeneration). | §1.4, §8.1.5 | setPartnerStatus | executable test |
| INV-SM-PART-004 | Partner Archived → Active: NO bulk QR reactivation; each QR requires explicit per-code admin reactivation (Clash 2.4). Archived→Active re-enters onboarding (status=PENDING, verifiedAt=null). | §1.4, Clash 2.4, §3.6 | setPartnerStatus (clears autoDeactivatedAt path skipped) | executable test |
| INV-SM-PART-005 | QR cannot be manually activated while partner is Inactive or Archived. | §3.6, §8.1.5 | venue/QR activation gate | executable test |
| INV-SM-PART-006 | Inactive/Archived partner always hidden from public site regardless of visibility field (status precedence). | §1.4, §8.1.7, Clash 9.1 | public listing + visibility field | executable test |
| INV-SM-PART-007 | `/visibility` and `/category` edits are ACTIVE-partner-only. | §3.5, §8.1.7 | PATCH /partner-requests/:id/{visibility,category} | runtime probe |
| INV-SM-PART-008 | Partner status change emits a partner status-change notification (operational requirement). | §6.1, Clash 6.6 | setPartnerStatus → notification | executable test |
| INV-SM-PART-009 | ARCHIVED→non-ACTIVE transition is blocked (archived is terminal for operational purposes). | §1.4 | setPartnerStatus guard | executable test |

### SM-APP — Partner application (§1.6, §3.5)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-APP-001 | Application pipeline: New→Communication→Negotiation→Onboarding→Approved is the legal forward path. | §1.6, §3.5 | PATCH /partner-requests/:id/status | executable test |
| INV-SM-APP-002 | Cannot transition directly to Rejected via PATCH /status; must use POST /reject. | §1.6 impl | PATCH /status vs POST /reject | runtime probe |
| INV-SM-APP-003 | Onboarding creates Partner Account with Inactive status + read-only access. | §1.6 | status route | executable test |
| INV-SM-APP-004 | Approve issues exactly one 72h one-time activation link; prior links invalidated. | §1.6, §3.5, §6.1 | POST /partner-requests/:id/approve → activationLink.service | executable test |
| INV-SM-APP-005 | Approve does NOT itself flip partner.status to Active; activation occurs only when link is consumed. | §1.6 | approve route + consumeOnce | executable test |
| INV-SM-APP-006 | Activation link is single-use (consumedAt/invalidatedAt guard) and expires at 72h. | §1.6, §3.5 | activationLink.consumeOnce | executable test |
| INV-SM-APP-007 | Resend activation rate-limited (≤1 link/partner/60s → 429); blocks ARCHIVED/REJECTED. | §3.5 impl | POST /partner-requests/:id/resend-activation | runtime probe |
| INV-SM-APP-008 | Rejected application is terminal (cannot be reopened in same record); blocks post-onboarding statuses. | §1.6 | POST /partner-requests/:id/reject | executable test |
| INV-SM-APP-009 | Reject invalidates all unconsumed activation links. | §3.5 | reject route | executable test |
| INV-SM-APP-010 | Internal SLA = 24h for admin assignment; alert fires when deadline approaches. Help Requests have NO SLA (distinct entity). | §1.6, §7.2 | partnerSla.helper | executable test |

### SM-HELP — Help request (§1.7, §3.8) — see also HELP class

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-HELP-001 | Status flow: New/Open → In Progress(IN_REVIEW) → Waiting → Resolved → Closed; terminal = Closed/Rejected/Cancelled. | §1.7 | adminHelp routes | executable test |
| INV-SM-HELP-002 | Assignment moves New/Open → In Progress (IN_REVIEW). | §1.7, §3.8 | POST /help/:id/assign | executable test |
| INV-SM-HELP-003 | Support reply on unassigned/New → Open (first contact, not Waiting). | §1.7 impl | POST /help/:id/reply | executable test |
| INV-SM-HELP-004 | Support reply on Open/In Progress/Resolved → Waiting. | §1.7 | POST /help/:id/reply | executable test |
| INV-SM-HELP-005 | Creator reply on Waiting/Resolved → Open (reopen; stamps reopenedAt). | §1.7 | POST /help/:id/reply | executable test |
| INV-SM-HELP-006 | Terminal states (Closed/Rejected/Cancelled) block further PATCH/reply transitions. | §1.7 | PATCH /help/:id, /reply | executable test |
| INV-SM-HELP-007 | Reject and Cancel are distinct terminal endpoints (not reachable via PATCH /status). | §1.7 impl | POST /help/:id/{reject,cancel} | runtime probe |
| INV-SM-HELP-008 | Resolved transition stamps resolvedAt; exit from Resolved (except to Closed) clears resolvedAt. | §1.7 impl | PATCH /help/:id | executable test |

### SM-ADMIN — Admin account (§1.5) — see also ROLE/AUTH classes

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-ADMIN-001 | Admin status accepts Active/Inactive/Archived (SUSPENDED legacy-only, rejected as new input). | §1.5, Clash 2.6 | PATCH /admins/:id/status | runtime probe |
| INV-SM-ADMIN-002 | Inactive admin: login allowed, read-only; cannot approve/reassign/modify records. | §1.5, Part 4 | requireActiveAdmin middleware | executable test |
| INV-SM-ADMIN-003 | Archived admin: no login; all historical actions/audit retained. | §1.5 | auth + audit | executable test |
| INV-SM-ADMIN-004 | Status change to Archived/Suspended stamps rolesUpdatedAt → invalidates live tokens; Inactive does NOT stamp (tokens coast to expiry). | §1.5 impl | PATCH /admins/:id/status | executable test |
| INV-SM-ADMIN-005 | INACTIVE/ARCHIVED status change requires a reason. | §1.5 impl | PATCH /admins/:id/status | runtime probe |
| INV-SM-ADMIN-006 | Admin cannot change own status (self-guard). | §1.5 | PATCH /admins/:id/status | runtime probe |

### SM-QR — QR code status (§3.6, Clash 9.4)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-QR-001 | All four QR statuses (Active/Inactive/In Processing/Replaced) have defined transitions; only Active is scannable. | §3.6, Clash 9.4 | sticker/venue status | static read + test |
| INV-SM-QR-002 | Venue activation blocked if no active stickerConfig (QR) exists. | §3.6 impl | PATCH /venues/:id/status | runtime probe |
| INV-SM-QR-003 | Partner has read-only QR visibility (cannot generate/deactivate/reactivate/see raw token). | §3.6 | partner portal scope | static read |

### SM-INV — Invoice / reporting period (§3.7)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-INV-001 | Reporting period cycles Open → Under Review → Closed → Invoiced. | §3.7 | finance reporting-periods | executable test |
| INV-SM-INV-002 | Invoice marked PAID cannot be undone (no PAID→PENDING/OVERDUE). | §3.7 impl | PATCH /finance/invoices/:id/status | executable test |
| INV-SM-INV-003 | Partners invoiced on approved outturn only (cancelled + voided excluded). | §3.7 | invoice generation | executable test |
| INV-SM-INV-004 | Invoice generation is idempotent per month (re-run does not duplicate). | §3.7 impl | POST /finance/invoices/generate | executable test |

### SM-DISP — Dispute case (§7.3 control)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-DISP-001 | Dispute case advances one step at a time Open→In Review→Resolved→Closed (no skipping). | §7.3 impl | PATCH /control/dispute-cases/:id | executable test |
| INV-SM-DISP-002 | Resolved requires a non-empty decision. | §7.3 impl | PATCH /control/dispute-cases/:id | runtime probe |
| INV-SM-DISP-003 | Closed dispute cannot be modified / no new notes. | §7.3 impl | PATCH + POST /notes | executable test |
| INV-SM-DISP-004 | No second open dispute for the same subject (409). | §7.3 impl | POST /control/dispute-cases | runtime probe |

### SM-CAMP — Marketing campaign (§3.x marketing impl)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-CAMP-001 | Campaign cannot be created directly in SENT/PAUSED (POST resolves to DRAFT). | impl | POST /marketing/campaigns | runtime probe |
| INV-SM-CAMP-002 | SCHEDULED requires future scheduledAt (400) + non-empty audience (422). | impl | POST/PUT/PATCH campaigns | runtime probe |
| INV-SM-CAMP-003 | SENT transition requires template + list + audience>0; fires dispatchCampaign. | impl | PATCH /marketing/campaigns/:id/status | executable test |

### SM-MENU — Venue menu (§3.6 impl)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-SM-MENU-001 | Menu approve promotes pendingMenuUrl→menuUrl (APPROVED); optional expectedUrl guard 409 on stale. | impl | POST /venues/:id/menu/approve | executable test |
| INV-SM-MENU-002 | Menu reject requires reason (10–1000), leaves pendingMenuUrl for partner visibility. | impl | POST /venues/:id/menu/reject | runtime probe |

---

## ROLE — Role capability / who-can-do-what (Part 4, §1.5, §3.9). One row per role × gated capability.

Roles in play: SUPER_ADMIN, ADMIN (Normal-Admin), RISK_REVIEW, SUPPORT, FINANCE, PARTNER_MANAGER, plus Inactive/Archived admin states. Permission keys gate via `requirePermission(...)`; SUPER_ADMIN has bypass.

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-ROLE-001 | Only SUPER_ADMIN can change another admin's status. | §1.5, Part 4 | PATCH /admins/:id/status (SA gate) | runtime probe |
| INV-ROLE-002 | Only SUPER_ADMIN can reset another admin's 2FA. | Part 4 impl | POST /admins/:id/reset-2fa | runtime probe |
| INV-ROLE-003 | Only SUPER_ADMIN can approve/reject critical-action requests. | Part 4 impl | POST /admins/critical-actions/:id/{approve,reject} | runtime probe |
| INV-ROLE-004 | Only SUPER_ADMIN can set/clear per-user permission overrides + view permission catalog/effective permissions. | Part 4 impl | GET/PUT /admins/:id/permissions* , /permissions/catalog | runtime probe |
| INV-ROLE-005 | Cashback lock (`/lock`) restricted to SUPER_ADMIN (not regular admin with cashback.write). | §3.4 | POST /cashback/entries/:id/lock | runtime probe (403) |
| INV-ROLE-006 | Voiding a Locked entry requires SUPER_ADMIN. | §3.4 impl | POST /cashback/entries/:id/void | runtime probe |
| INV-ROLE-007 | RISK_REVIEW may adjust fraud-rule thresholds only within FRAUD_RULE_BOUNDS; only SUPER_ADMIN may exceed bounds. | §2.1, Clash 5.4 | POST/PATCH /settings/fraud-rules | executable test |
| INV-ROLE-008 | Fraud-rule deactivation (DELETE) requires full control.rules.write (not the bounded variant). | impl | DELETE /settings/fraud-rules/:id | runtime probe |
| INV-ROLE-009 | Fraud-rule override list/add/remove is SUPER_ADMIN-only AND blocks inactive admins. | impl | GET/POST/DELETE /settings/fraud-rules/:id/overrides | runtime probe |
| INV-ROLE-010 | Partner discount-rate direct override (`/discount-rate`) is ADMIN/SUPER_ADMIN only (requires partners.write); PARTNER_MANAGER must use `/propose-discount-rate` → CriticalActionRequest. | Part 4 impl | PATCH vs POST partner discount routes | runtime probe |
| INV-ROLE-011 | Alerts endpoint gated on control.risk.read → PARTNER_MANAGER/SUPPORT (dashboard-only) excluded. | §3.1 impl | GET /admin/alerts | runtime probe |
| INV-ROLE-012 | Inactive admin: write/approve/reassign/modify endpoints blocked (read-only); self-service profile exempt. | §1.5, Part 4 | requireActiveAdmin | executable test |
| INV-ROLE-013 | Archived admin: no login (token invalidated via rolesUpdatedAt). | §1.5 | auth middleware | runtime probe |
| INV-ROLE-014 | Each money/data endpoint enforces its scoped permission key (cashback.read/write, finance.*, subscribers.*, transactions.*, partners.*, help.*, marketing.*, settings.*, control.*, dashboard.read) — a token lacking the key gets 403. | Part 4 | requirePermission on every admin route | executable test (per-key 403 sweep) |
| INV-ROLE-015 | Help self-claim allowed only on unassigned/own ticket; explicit assigneeId/null reassignment is SUPER_ADMIN-only. | §3.8, Clash 7.2 | POST /help/:id/assign | runtime probe |
| INV-ROLE-016 | Help reject/cancel restricted to ticket assignee or SUPER_ADMIN. | §3.8 impl | POST /help/:id/{reject,cancel} | runtime probe |
| INV-ROLE-017 | Cannot assign the ticket creator as assignee unless creator is also an admin. | §3.8 impl | POST /help/:id/assign | runtime probe |
| INV-ROLE-018 | Ticket creator may only mark own ticket Resolved and cannot change priority. | §3.8 impl | PATCH /help/:id | runtime probe |
| INV-ROLE-019 | RoleKey=SUPER_ADMIN on admin-create restricted to SUPER_ADMIN callers (and routes to dual-approval, not direct create). | §3.9 | POST /admins | runtime probe |
| INV-ROLE-020 | Partner risk-flag set/clear requires control.risk.write and blocks inactive admins. | §2.1 | PATCH /partner-requests/:id/risk-flag | runtime probe |
| INV-ROLE-021 | PARTNER_MANAGER `pending-all`/`critical-actions` views scoped to own requests only (no role/SA queues). | Part 4 impl | GET /admins/pending-all, /critical-actions | runtime probe |

---

## AUTH — Impersonation, dual-approval, last-active-SA (§3.9, Part 4 impersonation)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-AUTH-001 | Creating a new SUPER_ADMIN requires 2-of-N approval; initiation enters Pending Approvals queue. | §3.9, Clash 13.3 | POST /admins (roleKey=SUPER_ADMIN) | executable test |
| INV-AUTH-002 | Second approval from a DIFFERENT SUPER_ADMIN actually mints the new SUPER_ADMIN account. *(Run-6 A-H1: 500 — SUPER_ADMIN AdminRole row never seeded; approval cannot complete — open.)* | §3.9 | POST /admins/pending-super/:id/approve | runtime probe |
| INV-AUTH-003 | Initiator cannot approve own request when >1 non-archived SA exists (anti-self-approval). | §3.9 | approve route | runtime probe |
| INV-AUTH-004 | Bootstrap exception: when exactly one non-archived SA exists, that sole SA may self-approve. | §3.9 | approve route | executable test |
| INV-AUTH-005 | Pending super request expires after 72h. | §3.9 | TTL on pending-super list | executable test |
| INV-AUTH-006 | Only the initiating SA may cancel/withdraw the pending request (DELETE); another SA → 403. | §3.9 | DELETE /admins/pending-super/:id | runtime probe |
| INV-AUTH-007 | Approve re-validates initiator is still SUPER_ADMIN + ACTIVE before minting. | §3.9 impl | approve route | static read + test |
| INV-AUTH-008 | Quorum counts non-archived SAs (INACTIVE/SUSPENDED count toward quorum so a sole ACTIVE SA cannot self-approve while others exist). | §3.9 | approve quorum logic | executable test |
| INV-AUTH-009 | Status/role change that would leave zero ACTIVE SUPER_ADMINs returns 409 (last-active-SA guard); wrapped in Serializable tx (TOCTOU-safe). | §1.5 impl | PATCH /admins/:id/status, DELETE /admins/:id/roles/:roleKey | runtime probe |
| INV-AUTH-010 | Partner impersonation allowed for ADMIN or SUPER_ADMIN; user (role USER) impersonation SUPER_ADMIN-only (ADMIN targeting USER → 403). | Part 4 impl | GET /auth/impersonatable-{partners,users}, POST /auth/impersonate | runtime probe |
| INV-AUTH-011 | Impersonation token carries imp:true + acting-admin id (impBy) and NO account-group/agency claim. | Part 4 impl | impersonate token claims | static read + runtime |
| INV-AUTH-012 | `/switch-account` refused while impersonating (400); nested impersonation refused (403). | Part 4 impl | POST /auth/switch-account, /impersonate | runtime probe |
| INV-AUTH-013 | Impersonation refused on mobile and for self-targets. | Part 4 impl | POST /auth/impersonate | runtime probe |
| INV-AUTH-014 | Every impersonation start AND stop is audit-logged with the acting-admin id. | Part 4 impl | impersonate/stop-impersonate → audit | static read + runtime |
| INV-AUTH-015 | impersonatable-users listing uses an explicit column allowlist (no IBAN/password hash/token exposure). | Part 4 impl | GET /auth/impersonatable-users | static read |
| INV-AUTH-016 | stop-impersonate restores the original admin session without re-auth; exit gated ACTIVE-only (per-request acting-admin re-check). | Part 4 impl | POST /auth/stop-impersonate; auth.middleware | runtime probe |
| INV-AUTH-017 | Email-change for own admin account is SUPER_ADMIN-only and 2-step (request code → confirm with password). | impl | POST /me/email-change/{request,confirm} | runtime probe |
| INV-AUTH-018 | Admin cannot reset own 2FA via the SA reset route (must use self-service disable/regenerate). | impl | POST /admins/:id/reset-2fa | runtime probe |

---

## CONSENT — Marketing / push / email consent matrix (§6.1, Clash 6.6)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-CONSENT-001 | Marketing campaign dispatch to USERS via in-app must honour the channel-agnostic marketingConsent (not only marketingConsentEmail). *(Run-6 G: user in-app branch has NO consent gate — open.)* | §6.1, Clash 6.6 | adminMarketing.dispatchCampaign USER in-app | executable test |
| INV-CONSENT-002 | Marketing PUSH dispatch must gate on push/marketing consent for the right channel (not marketingConsentEmail). *(Run-6 G: PUSH gated on wrong field — open.)* | §6.1 | dispatchCampaign PUSH → webPush | executable test |
| INV-CONSENT-003 | Partner marketing in-app dispatch gates on partner marketingConsent (symmetry with user path). | §6.1 | notifyPartnerMarketing | static read |
| INV-CONSENT-004 | Users are NOT notified of account status changes (intentional). | §6.1, Clash 6.6 | user status change path | static read |
| INV-CONSENT-005 | Partners ARE notified of account status changes (operational). | §6.1, Clash 6.6 | setPartnerStatus → notification | executable test |
| INV-CONSENT-006 | Canonical notification template set = 4 user + 8 partner = 12 (Clash 6.1); admin backend triggers all. | §6.1, Clash 6.1 | notification.service templates | static read |
| INV-CONSENT-007 | Cashback Expiry notification fires 7 days before a Cleared record expires (not at other statuses). | §6.1 | scheduler / notification | executable test |
| INV-CONSENT-008 | Transactional notifications fire on QR session confirm / receipt uploaded / payout initiated only. | §6.1 | notification triggers | static read |
| INV-CONSENT-009 | DispatchRecipient USER shape must SELECT marketingConsent so the dispatcher can honour it (root cause of CONSENT-001/002). | §6.1 impl | dispatchCampaign select | static read |

---

## RISK — Risk signals (§2.1, §2.2, Clash 5.1/5.2/5.4)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-RISK-001 | Combining function is additive: IBAN change +40, receipt<60% +30, QR mismatch +20, 3+ Voided +20, partner risk flag +10. | §2.1, Clash 5.1 | userRisk.service / scan risk | executable test |
| INV-RISK-002 | Thresholds: 0–20 Low, 21–50 Medium, 51+ High (no 30/60 breakpoints). | §2.1 | subscriber riskLevel filter | runtime probe |
| INV-RISK-003 | Subscriber list riskLevel filter uses canonical thresholds (Low ≤20, Medium 21–50, High >50). | §2.1 impl | GET /subscribers?riskLevel= | runtime probe |
| INV-RISK-004 | Signal 4 (3+ Voided) is evaluated on the SUMMED per-user voided total, not per-wallet count. | §2.1 | userRisk.service | static read + test |
| INV-RISK-005 | IBAN-change signal (+40) is genuinely tracked (changed in last 24h). | §2.1, Clash 5.2 | risk signal compute | static read + test |
| INV-RISK-006 | Only High (51+) enters mandatory manual review; Low AND Medium auto-approve within 24h (Medium amended §9.4). | §2.2 | scheduler auto-approve | executable test |
| INV-RISK-007 | Risk Level is internal-only — never returned to end-users (not in user-facing payloads). | §2.1, §7.3 | user-facing endpoints | static read |
| INV-RISK-008 | Partner active risk flag set/cleared updates the +10 signal (Signal 5). | §2.1 | PATCH /partner-requests/:id/risk-flag | executable test |
| INV-RISK-009 | Risk-queue gate is dual: fraudScore ≥31 OR specRiskLevel Medium/High enters review. | §2.2 impl | GET /control/risk-queue | static read + test |
| INV-RISK-010 | Second failed payout escalates the user to HIGH risk + routes to manual review (user not notified). | §3.2, §3.7 | PATCH /payouts/:id/fail | executable test |
| INV-RISK-011 | Stale risk scores converge via the daily user-risk-sweep cron (genuinely registered, not dead). | §2.1 impl | user-risk-sweep job | static read |

---

## HELP — Help lifecycle + shortRef + email threading (§1.7, §3.8, §6.2, Clash 7.1/8.1/8.3)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-HELP-001 | Website contact form creates a Help Request (not a Partner Application). *(Run-6 F CRITICAL: `POST /api/contact` returns 502 on every submission — shortRef null-selector — open.)* | §3.8, Clash 8.1/8.3 | POST /api/contact → helpTicketIntake | runtime probe |
| INV-HELP-002 | Inbound email to office@boomcard.bg is parsed into a Help Request. *(Run-6 F CRITICAL: same shortRef defect breaks inbound email — open.)* | §6.2, Clash 8.1/8.3 | emailWebhook → ticketInbound | runtime probe |
| INV-HELP-003 | shortRef is minted with collision-retry on a UNIQUE selector (not `where:{shortRef:null}`, which is non-unique and throws). | §6.2 impl | persistShortRefWithCollisionRetry | static read + executable test |
| INV-HELP-004 | shortRef format is `[#XXXXXXXX]` derived from ticket id; same length/derivation across all reply paths (admin/help/partner) and intake. | §6.2, Clash 7.1 | ticketEmail.computeShortRef | static read |
| INV-HELP-005 | Threading primary marker = `X-BoomCard-Request-ID` header; fallback = `[#XXXX]` subject pattern. | §6.2, Clash 7.1 | outbound email headers | static read |
| INV-HELP-006 | Plus-addressing (`request-1234@`) is NOT required in v1.2 (deferred to v1.3). | Clash 7.1 | inbound matching | static read |
| INV-HELP-007 | Replies emit RFC 5322 In-Reply-To + References; inbound replies matched to TicketReply.messageId. | §6.2 impl | ticketEmail / ticketInbound | static read |
| INV-HELP-008 | Help Requests routed by type (Support/Dispute/Change/Other) to a shared Unassigned queue; any admin claims; SA reassigns; NO SLA. | §1.7, §3.8, Clash 7.2 | assign route | executable test |
| INV-HELP-009 | All requests (incl. Closed/Cancelled) retained in support history. | §1.7, §3.8 | help list filters | runtime probe |
| INV-HELP-010 | Inbound reply spoof guard + reopen guard exclude CANCELLED/REJECTED from reopen. | §6.2 impl | ticketInbound | static read + test |
| INV-HELP-011 | Partner-applicable ticket events emit partner in-app notification (notifyPartnerRequestUpdate). | §6.1 | adminHelp reply/reject/cancel | static read |
| INV-HELP-012 | Заявка disambiguation: "Партньори > Заявки" = Applications; "Помощ > Заявки" = Help Requests (distinct entities). | §7.2, Clash 8.1/10.1 | routing/menus | static read |

---

## FIN — Payout / invoice / finance math (§3.7, §8.1.3)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-FIN-001 | Payout requires a valid IBAN on file; no-IBAN payouts are HELD (RISK_HOLD) with user notification, not paid. | §3.7, §8.1.3 | PATCH /payouts/bulk-approve, /:id/approve | executable test |
| INV-FIN-002 | First failed payout (invalid IBAN) notifies user to correct IBAN. | §3.2, §3.7 | PATCH /payouts/:id/fail | executable test |
| INV-FIN-003 | Second failed payout → HIGH risk + manual review escalation; user NOT notified; record still shows "Sent to payout". | §3.2, §3.7 | PATCH /payouts/:id/fail | executable test |
| INV-FIN-004 | Payout approve enforces subscription gate (Active or Cancelled-within-period); FAILED_PAYMENT-latest hard-blocked. | §3.7, §8.1.3 | checkSubscriptionGate → /:id/approve | executable test |
| INV-FIN-005 | Payout state machine: PENDING→PROCESSING (approve), PROCESSING→COMPLETED (complete, cashback LOCKED→PAID), PENDING|RISK_HOLD→CANCELLED (reject, balance restored). | §3.7 impl | PATCH /payouts/:id/* | executable test |
| INV-FIN-006 | Release refuses escalated second-failure RISK_HOLD rows (metadata.escalatedSecondFailure) with 409. | §3.7 impl | PATCH /payouts/:id/release | runtime probe |
| INV-FIN-007 | reset-stuck only recovers crash-stuck PROCESSING (no payseraTransferId, not manualHold, >2min) → PENDING. | impl | PATCH /payouts/:id/reset-stuck | executable test |
| INV-FIN-008 | Payout fail path uses Serializable isolation (P2034 → 409), no lost-update. | impl | PATCH /payouts/:id/fail | static read + test |
| INV-FIN-009 | Payout threshold is plan-specific minimum Cleared balance (BASIC/PREMIUM_WEEKLY/PREMIUM); DB-sourced with hardcoded fallback. | §3.7, §7.3 | GET /cashback/payout-thresholds, /settings/payout-thresholds | runtime probe |
| INV-FIN-010 | Transaction adjustment validates availableBalance within a Serializable tx; creates ADJUSTMENT row. | impl | POST /transactions/adjust | executable test |
| INV-FIN-011 | Invoice number generation is serializable + unique (P2002/P2034 handled). | impl | POST /finance/invoices/generate | static read + test |
| INV-FIN-012 | Бизнес формула split = partner commission % + cashback % + margin % (three-way). | §7.3, Clash 10.6 | rate/business calc | static read |

---

## DATA — Canonical field names + entity disambiguation (§7.1–§7.3, Clash 10.3)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-DATA-001 | Each entity uses its qualified status field name (user_account_status, subscription_status, cashback_status, partner_account_status, admin_account_status, partner_application_status, request_status). | §7.1, Clash 10.3 | schema + serializers | static read |
| INV-DATA-002 | Cashback status enum = Pending/Cleared/Locked/Paid/Expired/Voided (+ TrialPending impl-ext); dashboard breakdown zero-fills all 7. | §7.1, §3.1 | GET /dashboard | runtime probe |
| INV-DATA-003 | Subscription status surface = Active/Expired/Cancelled/Failed Payment (Stripe-mapped values stored for audit only). | §7.1 | subscription serialization | static read |
| INV-DATA-004 | Partner Application vs Partner Account are distinct entity types/tables (not conflated). | §7.2, Clash 8.1 | partner routes | static read |
| INV-DATA-005 | Help Request vs Partner Application are distinct entity types (form→App via onboarding form; all other inbound→Help). | §7.2, Clash 8.1/8.3 | intake routing | static read |
| INV-DATA-006 | UI display names are translated but DB uses English qualified names. | §7.1 | serializers | static read |
| INV-DATA-007 | IBAN authority is Wallet.payoutIban; User.iban is a legacy mirror (writes go to the authoritative column). | §7.3 impl | PATCH /subscribers/:userId/profile | static read |

---

## INPUT — UUID / param boundary → never 500 (input-boundary class). Every `:param` admin route is one row.

Rule: a malformed/garbage path param MUST yield a clean 4xx (404/400), never a 500 / Prisma `P2023`/`22P02`. **All INPUT rows are [SUITE: INPUT].** String `@default(uuid())` ids make `findUnique` return null→404 cleanly, but each must be confirmed (some routes parse/cast params, e.g. ISO dates, month strings). Verify each by: garbage-param runtime probe OR the sweep test.

| ID | Param route | Surface | How to verify |
|----|-------------|---------|---------------|
| INV-INPUT-001 | `:userId` | GET/PATCH /subscribers/:userId(/cashback,/status,/profile,/cancel,/plan) | [SUITE: INPUT] |
| INV-INPUT-002 | `:userId` | GET /subscriptions/user/:userId/history | [SUITE: INPUT] |
| INV-INPUT-003 | `:id` | POST/PATCH /subscriptions/:id/{cancel,reactivate,resume,auto-renewal} | [SUITE: INPUT] |
| INV-INPUT-004 | `:id` | POST/DELETE /subscriptions/pending/:id(/resend-token) | [SUITE: INPUT] |
| INV-INPUT-005 | `:userId` | GET /cashback/subscriber/:userId | [SUITE: INPUT] |
| INV-INPUT-006 | `:partnerId/:month` | GET /cashback/:partnerId/:month/receipts; POST .../mark-paid | [SUITE: INPUT] |
| INV-INPUT-007 | `:partnerId` | POST /cashback/:partnerId/remind | [SUITE: INPUT] |
| INV-INPUT-008 | `:iso` | DELETE /cashback/rates/snapshot/:iso (ISO parse → must 400 not 500 on garbage) | runtime probe / [SUITE: INPUT] |
| INV-INPUT-009 | `:id` | POST /cashback/entries/:id/{approve,lock,expire,pay,void} | [SUITE: INPUT] |
| INV-INPUT-010 | `:id` | PATCH /payouts/:id/{approve,reject,complete,hold,release,fail,reset-stuck} | [SUITE: INPUT] |
| INV-INPUT-011 | `:id` | POST/PATCH /finance/invoices/:id(/pay,/status,/notes) | [SUITE: INPUT] |
| INV-INPUT-012 | `:partnerId` | GET /transactions/business/partner-risk/:partnerId | [SUITE: INPUT] |
| INV-INPUT-013 | `:id` | GET/PATCH /admins/:id(/status,/approve,/reset-2fa,/permissions*) | [SUITE: INPUT] |
| INV-INPUT-014 | `:id` | POST /admins/pending-super/:id/approve; DELETE /admins/pending-super/:id | [SUITE: INPUT] |
| INV-INPUT-015 | `:id` | POST /admins/critical-actions/:id/{approve,reject} | [SUITE: INPUT] |
| INV-INPUT-016 | `:id/:roleKey` | DELETE /admins/:id/roles/:roleKey | [SUITE: INPUT] |
| INV-INPUT-017 | `:id` | GET/PATCH/POST partner-requests/:id/* (status,assign,notes,contract,discount-rate,approve,resend-activation,reject,category,visibility,partner-status,risk-flag,onboarding-readiness,activation-links,status-history,audit,propose-discount-rate) | [SUITE: INPUT] |
| INV-INPUT-018 | `:id` | GET/PATCH/POST /help/:id(/assign,/reject,/cancel,/reply,/replies) | [SUITE: INPUT] |
| INV-INPUT-019 | `:id`,`:memberId` | marketing templates/campaigns/lists/automations/:id; lists/:id/members/:memberId | [SUITE: INPUT] |
| INV-INPUT-020 | `:id`,`:overId` | settings/fraud-rules/:id(/overrides/:overId) | [SUITE: INPUT] |
| INV-INPUT-021 | `:id` | control/disputes/:id/*; control/risk-queue/:id/*; control/dispute-cases/:id(/notes); control/receipt-templates/:id | [SUITE: INPUT] |
| INV-INPUT-022 | `:id` | venues/:id/{menu,menu/approve,menu/reject,status,status-history}; marketing template/list detail | [SUITE: INPUT] |
| INV-INPUT-023 | `:tokenId` | DELETE /me/sessions/:tokenId | [SUITE: INPUT] |
| INV-INPUT-024 | non-uuid query (`riskLevel=bogus`, `dateFrom=notadate`) | list endpoints must 200-ignore or 400, never 500 | runtime probe / [SUITE: INPUT] |
| INV-INPUT-025 | subscriber with NULL wallet row | GET /api/admin/subscribers/ + /export + /:userId must 200 (treat null wallet as zero balances), never 500 on the destructure | [SUITE: INV-INPUT-025 in adminSubscribers-audit-fix.test.ts — covers list, export, detail routes] |

---

## IMPORT — Bulk data import (§9 admin file upload)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-IMPORT-001 | POST /api/admin/bulk-import/ requires `spreadsheet` field (CSV or XLSX); missing field → 400, not 500 | impl | POST /bulk-import | runtime probe (no field) |
| INV-IMPORT-002 | POST /api/admin/bulk-import/ rejects file >50 MB (multer limit); 413 or error message, never 500 | impl | POST /bulk-import | runtime probe (50MB+ file) |
| INV-IMPORT-003 | POST /api/admin/bulk-import/ rejects unsupported MIME type (allows CSV/XLSX/images only); returns 400 | impl | POST /bulk-import | runtime probe (application/json) |
| INV-IMPORT-004 | POST /api/admin/bulk-import/ success returns 200 (full) or 207 (partial errors); 207 iff errors.length > 0 | impl | POST /bulk-import | executable test (happy path, error path) |
| INV-IMPORT-005 | POST /api/admin/bulk-import/ audit-logs admin ID and import kind ('discounts') via fire-and-forget notification (non-blocking) | impl | POST /bulk-import | static read (detach + notifyAdminBulkImportComplete) |
| INV-IMPORT-006 | GET /api/admin/bulk-import/template returns XLSX buffer with proper Content-Type header; 200 no params | impl | GET /bulk-import/template | runtime probe |
| INV-IMPORT-007 | POST /api/admin/bulk-import/partners requires `spreadsheet` field; same multipart guards as discount import (file size, MIME type, field presence) | impl | POST /bulk-import/partners | runtime probe (no field, 50MB+) |
| INV-IMPORT-008 | GET /api/admin/bulk-import/template/partners returns XLSX buffer; 200 no params | impl | GET /bulk-import/template/partners | runtime probe |
| INV-IMPORT-009 | All 4 bulk-import routes require ADMIN or SUPER_ADMIN; non-admin → 403 | Part 4 impl | all 4 routes | runtime probe (token without admin role) |

---

## PTYPE — Partner Types (maxDiscountRate constraint)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-PTYPE-001 | GET /api/admin/partner-types/ lists all types; 200 | impl | GET /partner-types | runtime probe |
| INV-PTYPE-002 | POST /api/admin/partner-types/ requires `name` and `maxDiscountRate`; missing either → 400 | impl | POST /partner-types | runtime probe (missing name, missing maxDiscountRate) |
| INV-PTYPE-003 | POST /api/admin/partner-types/ rejects `maxDiscountRate` not in CASHBACK_MATRIX_STEPS; must be one of [5, 10, 15, 20, 25] (receipt.constants.ts:70) → 400 | §3.7, impl | POST /partner-types | runtime probe (invalid rate like 7 if not in steps) |
| INV-PTYPE-004 | POST /api/admin/partner-types/ returns 409 (not 500) if name already exists (P2002 duplicate-key guard) | impl | POST /partner-types | runtime probe (duplicate name) |
| INV-PTYPE-005 | PUT /api/admin/partner-types/:id validates `maxDiscountRate` same as POST (in CASHBACK_MATRIX_STEPS if provided); 400 on invalid | impl | PUT /partner-types/:id | runtime probe (invalid rate) |
| INV-PTYPE-006 | PUT /api/admin/partner-types/:id returns 404 if type not found; 409 if update would create duplicate name | impl | PUT /partner-types/:id | runtime probe (nonexistent id; duplicate name update) |
| INV-PTYPE-007 | DELETE /api/admin/partner-types/:id returns 404 if not found; 409 if partners are assigned to type (cannot delete) | impl | DELETE /partner-types/:id | runtime probe (nonexistent id; type with partners) |
| INV-PTYPE-008 | GET /api/admin/partner-types/:id/plan-access retrieves access rules; 404 if type not found | impl | GET /partner-types/:id/plan-access | runtime probe (nonexistent id) |
| INV-PTYPE-009 | PUT /api/admin/partner-types/:id/plan-access requires `rules` array; validates each rule.plan against SubscriptionPlan enum → 400 on invalid plan | impl | PUT /partner-types/:id/plan-access | runtime probe (invalid plan like 'BOGUS') |
| INV-PTYPE-010 | All partner-types routes require ADMIN or SUPER_ADMIN; non-admin → 403 | Part 4 impl | all routes | runtime probe |

---

## MOBILE — Mobile app settings & error logs (Spec §9)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-MOBILE-001 | GET /api/admin/settings/mobile-app returns all MOBILE_APP_KEYS as structured object; null for unset keys; 200 | §9 impl | GET /settings/mobile-app | runtime probe |
| INV-MOBILE-002 | PUT /api/admin/settings/mobile-app requires `settings` object with at least one key; empty object → 400 | §9 impl | PUT /settings/mobile-app | runtime probe (empty settings) |
| INV-MOBILE-003 | PUT /api/admin/settings/mobile-app rejects unknown key (not in MOBILE_APP_KEYS); → 400 | §9 impl | PUT /settings/mobile-app | runtime probe (bogus key) |
| INV-MOBILE-004 | PUT /api/admin/settings/mobile-app version fields (`mobile_app.min_ios_version`, `min_android_version`) must match SEMVER_RE (`^\d+\.\d+(\.\d+)?$`); empty string allowed (no minimum); invalid format → 400 | §9 impl | PUT /settings/mobile-app | runtime probe (invalid version like 'latest') |
| INV-MOBILE-005 | PUT /api/admin/settings/mobile-app platform status fields (`mobile_app.ios_status`, `android_status`) must be one of ['active', 'maintenance', 'deprecated']; → 400 if not | §9 impl | PUT /settings/mobile-app | runtime probe (invalid status like 'suspended') |
| INV-MOBILE-006 | PUT /api/admin/settings/mobile-app boolean fields (`feature_*`, `push_notifications_enabled`) must be 'true' or 'false' strings; → 400 otherwise | §9 impl | PUT /settings/mobile-app | runtime probe (boolean=1 instead of 'true') |
| INV-MOBILE-007 | PUT /api/admin/settings/mobile-app `mobile_app.error_log_url` if provided must be valid HTTPS or HTTP URL; empty string allowed; invalid URL → 400 | §9 impl | PUT /settings/mobile-app | runtime probe (invalid URL, ftp://...) |
| INV-MOBILE-008 | PUT /api/admin/settings/mobile-app writes SystemSettingHistory only for keys whose value actually changed (idempotent); cache invalidated per key | impl | PUT /settings/mobile-app | static read (currentMobileMap comparison, invalidateSystemSettingCache loop) |
| INV-MOBILE-009 | GET /api/admin/settings/mobile-app/history returns last 30 changes, ordered by createdAt DESC; 200 | §9 impl | GET /settings/mobile-app/history | runtime probe |
| INV-MOBILE-010 | GET /api/admin/settings/mobile-errors returns last 50 most recent error log entries; 200; null values must not expose internal stack traces to non-admin queries | §9 impl | GET /settings/mobile-errors | runtime probe |
| INV-MOBILE-011 | DELETE /api/admin/settings/mobile-errors is a truncate (deleteMany with no filter); returns count of deleted entries; **DESTRUCTIVE — no undo, no confirmation flow** | §9 impl | DELETE /settings/mobile-errors | runtime probe (verify all logs cleared) |
| INV-MOBILE-012 | All mobile-settings routes require `settings.read` (GET) or `settings.write` (PUT/DELETE); non-permitted → 403 | Part 4 impl | all mobile-settings routes | runtime probe |

---

## CASH-BACKFILL — Cashback expiry backfill (maintenance operation)

| ID | Invariant | Spec ref | Surface | How to verify |
|----|-----------|----------|---------|---------------|
| INV-CASH-BACKFILL-001 | POST /api/admin/cashback/backfill-expiry requires `cashback.write` permission; non-permitted → 403 | impl | POST /cashback/backfill-expiry | runtime probe |
| INV-CASH-BACKFILL-002 | POST /api/admin/cashback/backfill-expiry takes no body parameters; calls `backfillCashbackExpiry()` service → idempotent (safe to re-run) | impl | POST /cashback/backfill-expiry | static read + test idempotency |
| INV-CASH-BACKFILL-003 | POST /api/admin/cashback/backfill-expiry returns 200 with `{ success: true, message: 'Backfilled N entries' }` on success | impl | POST /cashback/backfill-expiry | runtime probe (inspect response format) |
| INV-CASH-BACKFILL-004 | POST /api/admin/cashback/backfill-expiry sets `cashbackExpiresAt` only on entries with null expiry (legacy); does not modify already-set dates | impl | POST /cashback/backfill-expiry | executable test (verify only null → expiresAt, set dates unchanged) |
| INV-CASH-BACKFILL-005 | POST /api/admin/cashback/backfill-expiry is audit-logged with action='cashback.backfill-expiry' via auditMiddleware; req.auditAction set before response | impl | POST /cashback/backfill-expiry | static read (req.auditAction = ...) |

---

## Notes for re-audit agents

- **Independence:** when re-auditing, do NOT import a prior run's verdict or finding text. Use only the row skeleton above to know WHAT to check; reach your own conclusion on each.
- **Suite first:** run `admin-currency-leak-sweep.test.ts` and `admin-uuid-500-sweep.test.ts`. Green → all `[SUITE: CUR]` and `[SUITE: INPUT]` rows are verified for this run. Red → the specific failing rows are `open`.
- **Then the non-suite rows:** SM-/ROLE-/AUTH-/CONSENT-/RISK-/HELP-/FIN-/DATA- rows are runtime-probe or executable-test or static-read; check them directly.
- **New invariants:** if a run discovers a machine-checkable admin invariant not represented here, ADD a row (new ID in the right class) and re-seed the ledger. The audit cannot exit while the matrix is still growing (see exit criteria in the ledger).
- **Open-at-run-6 markers** above (e.g. INV-CUR-012/013/014, INV-SM-CASH-008, INV-AUTH-002, INV-CONSENT-001/002, INV-HELP-001/002/003) are recorded for grounding only; a fresh run must re-derive the result independently and not assume they are still open.
