# BC-ADMIN-SPEC-REAUDIT — Domain E (Financial Management / Payouts / Currency)

**Reviewer:** independent re-auditor (read-only)
**Date:** 2026-06-27
**Base spec:** docs/specs/06-admin-spec-extracted.md — §3.7, §8.1 rules 3 & 4, Clash 4.1 / 12.1
**Live server:** http://127.0.0.1:3025 (auth OK; window state = `eur_only` / `windowOpen:false`)

## Summary

Payout eligibility (earned-rights), the two-strike failure model, no-IBAN holds, riskScore
flooring, IBAN-failure reason classification, the payout-threshold endpoints, the
currency-window helper (fail-CLOSED, single-sourced), and the CSV/xlsx export sweep are all
correct and conform to spec. Those subsystems are clean and well-tested in code.

However, the currency-display sweep (CURRENCY-ADMIN-SWEEP class) is **incomplete on the JSON
side**. Four admin finance/transaction JSON endpoints leak raw BGN scalar amounts AFTER the
transition window has closed, in direct violation of §8.1 rule 4 / Clash 12.1 ("After the
transition window closes: BGN display is hidden; EUR only."). This was verified live with the
window CLOSED — the endpoints returned BGN numbers. The pattern that the wave *did* apply
correctly to `/payouts` and the threshold endpoints (strip raw scalars with
`...(windowOpen && {...})`) was not applied to these four, and `adminTransactions.routes.ts`
was never gated at all (it has no EUR conversion or window read anywhere).

## Findings

### E1 — HIGH — `/api/admin/finance/invoices` leaks raw BGN scalars post-window
**File:** src/routes/adminFinance.routes.ts:104-115
The handler spreads `...inv` (raw `totalCashbackOwed`, `turnoverAmount`, `marginAmount` in BGN)
and merely *adds* a gated `display` object — it never strips/gates the raw top-level fields.
**Live (window CLOSED):**
```
"totalCashbackOwed": 7.5, "marginAmount": 5, "turnoverAmount": 50,
"display": { "totalCashbackOwed": { "bgn": null, "eur": 3.83, ... } }
```
Raw BGN is exposed despite `windowOpen:false`. Spec §8.1 rule 4 / Clash 12.1.
**Fix:** gate the raw scalars (e.g. omit `totalCashbackOwed/turnoverAmount/marginAmount` from
the spread, or null them, when `!windowOpen`) — mirror the `...(windowOpen && {...})` pattern
already used in `/payouts` summary.

### E2 — HIGH — `/api/admin/finance/reports` leaks raw BGN in three sub-blocks post-window
**File:** src/routes/adminFinance.routes.ts:776-780 (`txByType`→`walletTransactions`), 890-892 +
932 (`partnerBreakdown`), 853-865 + 934 (`planBreakdown`).
`cashbackInvoices` and `payoutBreakdown` in the same response ARE correctly gated, but:
- `walletTransactions.{CASHBACK_CREDIT,WITHDRAWAL,TOP_UP}.total` — raw BGN, no display/EUR, no gate.
- `partnerBreakdown[].{cashback,margin,turnover}` — raw BGN, no display/EUR, no gate.
- `planBreakdown[].{cashback,turnover}` — raw BGN, no display/EUR, no gate.
**Live (window CLOSED):** `"walletTransactions":{"CASHBACK_CREDIT":{"total":0,...},"WITHDRAWAL":{"total":0,...}}`
(field is unconditionally BGN; non-zero with data). Spec §8.1 rule 4 / Clash 12.1.
**Fix:** gate these three blocks behind `windowOpen` and emit EUR (via `toDualCurrency`),
consistent with the sibling `cashbackInvoices`/`payoutBreakdown` blocks already in this response.

### E3 — HIGH — `adminTransactions.routes.ts` emits raw BGN with no currency-window handling at all
**File:** src/routes/adminTransactions.routes.ts
This router has zero references to `isCurrencyTransitionWindowOpen` / `toDualCurrency` / EUR.
Every monetary field is raw BGN regardless of window state:
- GET `/` (list): `amount`, `balanceBefore`, `balanceAfter`, `currency:"BGN"` — lines 95-98, 121.
  Live (window CLOSED): `"amount":-10,"balanceBefore":0,"balanceAfter":-10,"currency":"BGN"`.
- GET `/stats`: `totalVolume`, `totalCashback`, `totalWithdrawals` — lines 148-150.
  Live: `{"totalVolume":14.5,...}`.
- GET `/business` (list): `amount`, `marginAmount`, `discountAmount`, `finalAmount`,
  `cashbackAmount`, `netAmount`, derived `margin`, `currency` — lines 366-374, 549-556.
- GET `/business/stats`: `totalVolume`, `averageValue` — lines 671-672.
  Live: `{"totalVolume":50,"averageValue":50,...}`.
These are admin Financial-Management surfaces (§3.7 / §4.3) and fall under the §8.1 rule 4
hide-BGN-after-window invariant the rest of Domain E enforces.
**Fix:** read the window flag and either gate raw BGN + add EUR/dual-currency display, matching
the established `/payouts` and `/finance/*` pattern.

## Non-findings (verified conforming)

- **Payout eligibility / earned-rights (§8.1.3 / Clash 4.1):** `resolvePayoutEligibility`
  (payoutEligibility.service.ts) is the single source of truth; `checkSubscriptionGate`,
  `requestPayout`, `getBalance`, and the credit-time payout-ready prompt all route through it.
  Step A FAILED_PAYMENT latest-sub hard-block + Step B ACTIVE/TRIALING/CANCELLED-in-period are
  consistent across request → approve → in-flight. In-flight payouts are never re-gated
  (executePayoutTransfer only accepts PENDING and never re-checks subscription) — earned-rights holds.
- **Two-strike failure (§3.7):** admin `/fail` and Paysera auto-fail branch identically;
  first failure → FAILED + balance restore + paired ADJUSTMENT reversal + revert LOCKED→CLEARED +
  IBAN-fix notify; second → RISK_HOLD (no restore, cashback stays LOCKED, user NOT notified,
  admin-ops alert). Strike counter excludes manualHold/noIbanHold/legacy-no-IBAN rows and counts
  both FAILED+RISK_HOLD; Serializable tx + P2034→409. riskScore floored at 51
  (RISK_HOLD_FLOOR_SCORE), never downgraded, never unbounded.
- **/fail reversal row (PAYOUT-FAIL-REVERSAL):** first-failure path writes the COMPLETED
  ADJUSTMENT reversal (adminPayouts L889; wallet L1220) so maskUserFacingPayoutStatus surfaces it
  honestly rather than masking as PROCESSING.
- **No-IBAN holds:** bulk-approve + single /approve hold no-IBAN payouts as RISK_HOLD
  (noIbanHold meta) and fire notifyPayoutHeldNoIban; credit-time threshold crossing prompts
  no-IBAN users (wallet L456). maskUserFacingPayoutStatus shows noIbanHold as PENDING (not
  "Sent to payout"). No-IBAN holds excluded from strike count.
- **reasonIndicatesIbanProblem (PAYOUT-FAIL-REASON):** covers Paysera codes
  (invalid_iban/invalid_beneficiary/account_not_found/invalid_account) + EN/Cyrillic keywords;
  shared by both fail paths.
- **Currency window helper (CURRENCY-WINDOW / -FAILOPEN):** isCurrencyTransitionWindowOpen reads
  the single DB SystemSetting, accepts only "true"/"false", and is fail-CLOSED on any unrecognised
  value. Single-sourced across wallet + all admin finance routes.
- **Payout-threshold endpoints:** both GET /cashback/payout-thresholds and
  GET /finance/payout-thresholds return BASIC/PREMIUM_WEEKLY/PREMIUM (+PREMIUM_MONTHLY alias),
  DB-with-fallback, `cashback.read` / `finance.payouts.read`, and correctly STRIP raw BGN +
  null the display.bgn when window closed (verified live: `data:{}`, `bgn:null`).
- **CSV/xlsx export (CURRENCY-ADMIN-SWEEP):** all 5 export types (invoices/periods/reports/
  payouts/cashback-summary) emit EUR columns always and blank BGN columns when window closed
  (verified live: invoices CSV `""` BGN cells, `25.56` EUR cells). The `currency` column in the
  payouts export is a stored currency-code label, not a BGN amount — not a leak.
- **Invoicing to partners (§3.7):** invoice generation aggregates only ScanStatus.APPROVED scans
  (cancelled/voided excluded); period lifecycle Open→Under Review→Closed/Locked→Invoiced enforced
  via isPeriodLocked guard; PAID invoices frozen.
- **IBAN validation (PAYOUT-IBAN-VALIDATE):** validateIBAN enforces structural format
  (CC+2 check digits+11-30 alnum) — matches spec wording "format validated". (mod-97 check-digit
  verification is not performed; spec only requires format, so not a finding.)

## Runtime checks

```
POST /api/auth/login {clientType:"web"}                         → 200, SUPER_ADMIN token (data.accessToken)
GET  /api/admin/settings/currency-display-mode                  → {currencyDisplayMode:"eur_only", windowOpen:false}
GET  /api/admin/cashback/payout-thresholds                      → data:{}, display.*.bgn:null  (CORRECT)
GET  /api/admin/finance/payout-thresholds                       → data:{}, display.*.bgn:null  (CORRECT)
GET  /api/admin/payouts?limit=2                                 → summary raw totals stripped, display.bgn:null (CORRECT)
GET  /api/admin/finance/invoices?limit=1                        → totalCashbackOwed:7.5 / marginAmount:5 / turnoverAmount:50 RAW BGN  (E1 LEAK)
GET  /api/admin/finance/reports                                 → walletTransactions.*.total RAW BGN, no EUR  (E2 LEAK)
GET  /api/admin/transactions?limit=2                            → amount:-10 / balanceBefore / balanceAfter / currency:"BGN" RAW  (E3 LEAK)
GET  /api/admin/transactions/stats                              → totalVolume:14.5 RAW BGN  (E3 LEAK)
GET  /api/admin/transactions/business/stats                    → totalVolume:50 / averageValue:50 RAW BGN  (E3 LEAK)
GET  /api/admin/finance/export?type=invoices&format=csv         → BGN cols "", EUR cols populated  (CORRECT)
GET  /api/admin/finance/export?type=payouts&format=csv          → BGN/EUR headers, BGN blanked  (CORRECT)
GET  /api/admin/finance/export?type=reports&format=csv          → "(лв.)"+"(€)" headers, BGN blanked  (CORRECT)
```

## Integration points checked

- payoutEligibility.service.ts:34-69 → adminPayouts.routes.ts:45 (checkSubscriptionGate) /
  wallet.service.ts:451 (credit prompt) / requestPayout:686-727 — identical FAILED_PAYMENT
  hard-block + ACTIVE/TRIALING/CANCELLED-in-period gate across all callers.
- adminPayouts.routes.ts:863 → wallet.service.ts:958 escalateRiskAfterRepeatedPayoutFailure(tx) —
  shared riskScore-floor helper runs inside the Serializable tx.
- adminPayouts /fail:825-831 ↔ wallet.service.ts executePayoutTransfer:1141-1147 — identical
  strike-count exclusion filter (manualHold/noIbanHold/legacy-desc), both count FAILED+RISK_HOLD.
- utils/payoutFailureReason.ts → adminPayouts:953 + wallet.service.ts:1258 — single classifier
  shared by both first-failure notify paths.
- utils/currencyDisplay.ts:isCurrencyTransitionWindowOpen → wallet.service.ts:201,
  adminPayouts:304, adminFinance (×9 sites), adminCashback:277, adminSettings:532 — single flag
  source. adminTransactions.routes.ts is the only finance surface NOT wired to it (E3).
- adminFinance.routes.ts:104/566/906/1326/1398/1598/1784/1828 (export bgnCell + display gating) —
  all read the same flag; export side complete, JSON side incomplete (E1/E2).

## Verdict

**block**

Three HIGH currency-leak findings (E1, E2, E3): admin Financial-Management JSON endpoints expose
raw BGN amounts after the transition window has closed, violating §8.1 rule 4 / Clash 12.1.
Confirmed live with the window in the CLOSED (eur_only) state.

## Brief items I disagreed with

(none — the brief's "currency leak surface" flag on adminTransactions.routes.ts was accurate and
is confirmed as E3.)