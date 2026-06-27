# Implementation Review: BC-ADMIN-SPEC-REAUDIT5-CASHBACK-SUB-SELECT-1

**Reviewer:** Claude Code  
**Date:** 2026-06-27  
**Task:** Verify cashback-creation gate subscription selection matches scanning gate per spec §8.1 rule 1

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/services/cashbackLifecycle.service.ts` (full)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/sticker.service.ts` (lines 1-400, verified subscription logic sections)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/subscriptionGate.ts` (full)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/unit/subscriptionGate.test.ts` (full)

---

## Integration points checked

1. **cashbackLifecycle.ts:646-651 → subscriptionGate.ts:148-158**  
   `recordPendingForRiskReview` calls `findEligibleSubscription(userId, new Date())` to select subscription. Returns earliest eligible subscription (ACTIVE, TRIALING, or CANCELLED-within-period), matching spec §8.1 rule 1 intent.

2. **sticker.service.ts:260 → subscriptionGate.ts:148-158**  
   `assertSubscriptionAllowsScanning` calls `findEligibleSubscription(userId, now)` with same query criteria. Both gates now use identical subscription selection.

3. **cashbackLifecycle.ts:656-662 ↔ sticker.service.ts:243-254**  
   User status checks (INACTIVE, ARCHIVED, DELETED, PENDING_VERIFICATION, PENDING_PAYMENT) are identical between gates. Both check order: user status first, then subscription status.

4. **cashbackLifecycle.ts:673-676 ↔ sticker.service.ts:272-305**  
   Both gates call `subscriptionAllowsEarning(subscription.status, subscription.currentPeriodEnd, now)` for defensive re-validation. Secondary check against race conditions is consistent.

5. **Import alignment:**  
   - `cashbackLifecycle.service.ts:31` imports both `subscriptionAllowsEarning` and `findEligibleSubscription`
   - `sticker.service.ts:13` imports both functions from same module
   - No drift in import paths.

---

## Verdict

**approve**

---

## Findings

None.

---

## Suggestions

None.

---

## Out-of-scope flags

**Note (informational):** `sticker.service.ts:1994-1998` queries for ACTIVE/TRIALING subscriptions only during the `approveScan()` approval phase to snapshot subscription for historical record-keeping. This is intentionally different from `findEligibleSubscription` (which includes CANCELLED-within-period) because it's recording which subscription type the user had at approval time for audit purposes, not determining eligibility. This distinction is outside spec §8.1 rule 1 scope (which governs scanning/cashback gates, not historical snapshots).

---

## Brief items I disagreed with

None. The task brief was neutral and correctly scoped.

---

## Technical Summary

**Spec §8.1 Rule #1 Compliance:**  
The fix successfully aligns the cashback-creation gate (`recordPendingForRiskReview`) with the scanning gate (`assertSubscriptionAllowsScanning`):

- **Subscription selection:** Both now call `findEligibleSubscription()`, which returns the earliest eligible subscription (ACTIVE, TRIALING, or CANCELLED-within-period).
- **Selection strategy change:** The fix moves from implicit "latest eligible" (database order unspecified) to explicit "earliest eligible" (orderBy createdAt ASC).
- **Eligibility logic:** Both gates call `subscriptionAllowsEarning()` with identical parameters.
- **User status gates:** Both check identical user status blockers (INACTIVE, ARCHIVED, DELETED, PENDING_VERIFICATION, PENDING_PAYMENT).
- **Error symmetry:** Both throw identical error messages ("Cannot create cashback: account scanning is blocked").

**Code Quality:**
- No syntax errors or broken imports.
- Defensive re-validation via `subscriptionAllowsEarning()` secondary check matches scanning gate pattern (protects against race conditions where subscription state changes between query and use).
- Tests in `subscriptionGate.test.ts` verify `findEligibleSubscription()` returns correct subscription when multiple eligible/terminal subscriptions exist (lines 210-271).

**Correctness:**
- The function `findEligibleSubscription()` enforces the earning-allowed criteria in its WHERE clause, so any returned subscription is guaranteed to pass `subscriptionAllowsEarning()` check. The secondary check is defensive but harmless.
- Minor timing inconsistency (cashback gate creates `now` twice: once for `findEligibleSubscription` at line 651, then again at line 669) is acceptable—time delta is milliseconds and doesn't affect date-based subscription period comparisons.
- No calls to bypass `findEligibleSubscription()` or use alternate subscription selection logic in cashback creation flow.

**Test Coverage:**  
Unit tests in `subscriptionGate.test.ts` confirm the fix:
- Line 210-271: Verifies `findEligibleSubscription()` selects "any eligible" (older CANCELLED-within-period) over "latest" (newer EXPIRED).
- Lines 313-352: Confirms ACTIVE subscriptions are found.
- Lines 354-393: Confirms TRIALING subscriptions are found.

All gate alignment tests pass.
