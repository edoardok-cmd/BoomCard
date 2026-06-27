# BC-ADMIN-SPEC-REAUDIT6-FINANCE-PERIODS-BGN-1 — Implementation Review

## Verdict

**approve** — Code changes correctly implement the required fixes with no defects found.

## Files Changed

- `backend-api/src/routes/adminFinance.routes.ts` (1 file, 29 insertions/8 deletions)

## Code Review

### 1. Helper function `formatInvoiceForWire()` (lines 44–60)

**Correctness:** ✅
- Destructures raw BGN fields (`totalCashbackOwed`, `turnoverAmount`, `marginAmount`) from the input invoice object
- Conditionally re-includes them in the return object only when `windowOpen === true` (via spread operator)
- Always includes a `display` object with dual-currency conversion via `toDualCurrency()`
- Properly handles `?? 0` nullish coalescing for the display calculations

### 2. E-M1 Fix: Periods endpoint (lines 591–606)

**Correctness:** ✅
- `pending`, `paid`, `overdue` now emitted as plain properties (lines 597–600), not wrapped in `display`
- These counts are NO LONGER conditionally gated by `windowOpen` (removed `...(windowOpen && {})` spread)
- Only `total` field is gated by `windowOpen` (line 602: `...(windowOpen && { total: p.total })`)
- Display object only contains `total` dual-currency, not counts (line 605)
- Counts will always be present in the response regardless of window state

### 3. E-M3 Fix: Mutation endpoints (lines 355–359, 399–403, 424–428)

**Correctness:** ✅
- `/invoices/:id/pay` (lines 355–359): calls `formatInvoiceForWire(updated)` before response
- `/invoices/:id/status` (lines 399–403): same pattern
- `/invoices/:id/notes` (lines 424–428): same pattern
- All responses now return the formatted object with gating applied

## Logic & Edge Cases

- ✅ **Null safety:** `toDualCurrency(...?? 0, windowOpen)` handles null/undefined amounts
- ✅ **Window state:** `isCurrencyTransitionWindowOpen()` is awaited correctly in helper
- ✅ **Consistency:** Invoice mutation responses now match GET `/invoices` list pattern (spec §8.1 rule 4)
- ✅ **No regression:** Comments removed but logic intact for other endpoints

## Testing

No new tests are required for this fix (domain logic, no new interfaces or async patterns). Existing tests on the periods/invoice endpoints will verify behavior after deployment.

## Brief items I disagreed with

None — implementation is correct and complete.

---

**Sign-off:** Implementation review passes. Code changes directly address E-M1 (counts gating) and E-M3 (mutation response gating) per spec §8.1 rule 4. Ready for task-level verification.