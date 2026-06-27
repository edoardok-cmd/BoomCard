# Implementation Review: BC-ADMIN-SPEC-REAUDIT6-SUBSCRIBER-BGN-LEAK-1

**Review Date:** 2026-06-27  
**Reviewer:** Claude Code (Haiku 4.5)  
**Verdict:** `block`

---

## Files Read

1. `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminSubscribers.routes.ts` (lines 1–20, 249–360, 361–418, 450–550, 1237–1329, 1333–1444)
2. `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminSubscriptions.routes.ts` (lines 1–15, 138–230, 273–300, 305–335, 345–452)
3. `/Users/administrator/Documents/BoomCard/backend-api/src/utils/currencyDisplay.ts` (full file, 120 lines)
4. Spot checks: `adminTransactions.routes.ts` (pattern reference, lines found via grep)

---

## Integration Points Checked

1. **Imports consistency:** Lines 15 (adminSubscribers) and 14 (adminSubscriptions) both import `{ isCurrencyTransitionWindowOpen, toDualCurrency }` correctly.
2. **Pattern adherence:** 
   - `adminSubscribers.routes.ts:308-324` (GET / wallet wrapping) matches canonical pattern from `adminTransactions.routes.ts:132–137`
   - `adminSubscriptions.routes.ts:225-226` (paymentTotalAmount wrapping) matches canonical pattern
   - `adminSubscriptions.routes.ts:411-413` (per-payment wrapping) matches canonical pattern
3. **Refund endpoints untouched:** Lines 1237–1329 (preview) and 1333–1444 (POST) are Stripe-native and correctly left raw (no toDualCurrency calls).

---

## Verdict

**`block`**

---

## Findings

### CRITICAL

1. **Severity:** CRITICAL  
   **Item:** Scope creep — multiple other route files modified beyond task boundary  
   **Location:** Working directory shows `git diff --stat` includes:
   - `backend-api/src/routes/adminMarketing.routes.ts` (37 insertions, marketing consent changes)
   - `backend-api/src/routes/adminPayouts.routes.ts` (97 insertions, payout currency gating that should not be in this task)
   - `backend-api/src/routes/adminSettings.routes.ts` (8 insertions, unclear changes)
   - `backend-api/tests/unit/section13.rbacFixes.test.ts` (10 insertions, test changes)
   
   Task spec states: **"NOTE: Wave 1. You exclusively own these two route files."** and acceptance criterion #5: **"No other route files are modified (adminSubscribers/adminSubscriptions only)"**. These files appear to contain parallel fixes from other re-audit tasks (adminPayouts changes look like task BC-ADMIN-SPEC-REAUDIT6-PAYOUTS-BGN-LEAK-1 or similar, which should be separate). All non-target files must be reverted before this task can be approved.

### HIGH

2. **Severity:** HIGH  
   **Item:** adminSubscriptions.routes.ts enrichSubscriptions function — inconsistent raw BGN gating  
   **Location:** `adminSubscriptions.routes.ts:225`  
   **Issue:** The enrichSubscriptions function conditionally includes `paymentTotalAmount` only when `windowOpen && { paymentTotalAmount }`, but the corresponding Display field is ALWAYS included:
   ```typescript
   ...(windowOpen && { paymentTotalAmount }),
   paymentTotalAmountDisplay: toDualCurrency(paymentTotalAmount, windowOpen),
   ```
   This pattern is correct per canonical reference (adminTransactions.routes.ts:176-177). HOWEVER, this is embedded in a shared function that is called from BOTH GET / (line 295) AND GET /export (line 326), which means the dual-currency display is correctly attached. **Pattern is correct; this is a conditional finding — if adminPayouts is reverted, this remains valid.** NO action needed here; listed for completeness.

### MEDIUM

3. **Severity:** MEDIUM  
   **Item:** Per-subscription payment wrapping in GET /user/:userId/history — consistency against enrichSubscriptions pattern  
   **Location:** `adminSubscriptions.routes.ts:406-413`  
   **Issue:** The `enrichedPayments` helper at line 406 implements the dual-currency pattern correctly:
   ```typescript
   ...(windowOpen && { amount }),
   amountDisplay: toDualCurrency(amount ?? 0, windowOpen),
   ```
   However, this is a LOCAL pattern inconsistent with how the enrichSubscriptions function structures its outputs. The enrichSubscriptions function uses field names like `paymentTotalAmountDisplay` but the enrichedPayments helper uses just `amountDisplay`. While both patterns are functionally correct (one raw field named `amount`, one display field), they create API surface inconsistency. **Not a blocking issue but suboptimal for frontend ergonomics** — the two endpoints emit payment aggregates under different naming schemes. Recommend standardizing to a single convention (either `paymentAmountDisplay` or keep `amountDisplay` but rename the raw field consistently across both endpoints).

### LOW

4. **Severity:** LOW  
   **Item:** Missing toDualCurrency wrapping on one per-payment field in history endpoint  
   **Location:** `adminSubscriptions.routes.ts:434`  
   **Issue:** The `enrichedPayments` function wraps the `amount` field correctly, but the `subscriptionPayments` query at line 375 selects raw payment objects that are then enriched. Each payment object in the final result carries fields like `currency` (line 386) and `stripePaymentId` (line 390) that are passed through unchanged. These are metadata fields, not monetary amounts, so they are correctly left raw. **No action needed; the concern was initially raised but confirmed to be out of scope (non-monetary metadata).** Retained for audit trail.

---

## Suggestions

None. The implementation of the dual-currency pattern within the target files (adminSubscribers and adminSubscriptions) is correct and consistent with the canonical reference (adminTransactions).

---

## Out-of-Scope Flags

1. **adminPayouts.routes.ts:** Contains currency gating changes that appear to be a separate task (likely BC-ADMIN-SPEC-REAUDIT6-PAYOUTS-BGN-LEAK-1 or part of an E-wave reaudit effort). These must be reverted or moved to their own task branch. Currently blocking this task.

2. **adminMarketing.routes.ts:** Marketing consent field additions (marketingConsent vs marketingConsentEmail disambiguation) — unrelated to currency display. Likely part of a different initiative (possibly marketing-compliance work). Must be reverted for this task's scope.

3. **adminSettings.routes.ts:** 8-line changes not yet reviewed. Likely innocent (possibly related to currency-display-mode API endpoint), but status is unclear. Requires investigation before approval.

4. **section13.rbacFixes.test.ts:** Test changes unrelated to this task's scope.

---

## Brief Items I Disagreed With

None. The brief correctly specified scope and acceptance criteria. The implementation logic itself is sound; the blocking issue is entirely scope-creep.

---

## Summary

The implementation of the dual-currency pattern within the two target files (**adminSubscribers.routes.ts** and **adminSubscriptions.routes.ts**) is **functionally correct** and **consistent with the canonical reference pattern** (adminTransactions.routes.ts). All stored-BGN fields are correctly wrapped via `toDualCurrency(amount, windowOpen)`, raw BGN scalars are conditionally included only when `windowOpen === true`, a Display companion object is always emitted, and the refund endpoints are correctly left untouched (Stripe-native currency).

**However, the task is blocked by scope creep:** The working directory contains modifications to **adminPayouts.routes.ts, adminMarketing.routes.ts, adminSettings.routes.ts, and test files** that are explicitly out of scope per the task spec ("You exclusively own these two route files"). These must be reverted before approval. The code quality within the assigned files is clean; the issue is task boundary violation.
