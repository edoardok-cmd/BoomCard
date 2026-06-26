# Task-level Audit: BC-ADMIN-SPEC-REAUDIT2-SCANGATE-SELECTION-1

**Verdict:** `request-changes`

## Files read

- src/services/subscriptionGate.ts (lines 1–160)
- src/middleware/auth.middleware.ts (lines 1–504)
- src/services/sticker.service.ts (lines 1–2996, selective reading of key sections: 1–60, 236–306, 314–330, 852–1025, 1021–1154, 1393–1520)
- tests/unit/subscriptionGate.test.ts (lines 1–396)

## Integration points checked

1. **Middleware → findEligibleSubscription → Service alignment (lines 479 → 260)**
   - `auth.middleware.ts:479` calls `findEligibleSubscription(req.user.id, now)` 
   - `sticker.service.ts:260` calls identical `findEligibleSubscription(userId, now)`
   - Both receive same return type: `{ id, status, currentPeriodEnd } | null`
   - **Status:** ALIGNED ✓

2. **Subscription allow-list consistency (subscriptionGate.ts:36–79 → auth.middleware.ts:479 → sticker.service.ts:260)**
   - `subscriptionAllowsEarning()` (lines 36–79) defines allow-list: ACTIVE, TRIALING, CANCELLED-within-period
   - Both middleware and service layer evaluate subscriptions against this exact list via `findEligibleSubscription`
   - **Status:** ALIGNED ✓

3. **Error messaging preservation (auth.middleware.ts:482–489 vs sticker.service.ts:262–305)**
   - Middleware (line 483–488): blocks with 402 SUBSCRIPTION_REQUIRED, bilingual message directing to payment menu
   - Service (lines 263–305): blocks with specific codes (SUBSCRIPTION_INACTIVE, SUBSCRIPTION_EXPIRED, SUBSCRIPTION_CANCELLED_EXPIRED, SUBSCRIPTION_FAILED_PAYMENT), each with Bulgarian + English direction
   - Both are user-facing and actionable; distinct error codes allow mobile client pattern-matching per spec §4.2
   - **Status:** ALIGNED ✓

4. **Race-condition defense (sticker.service.ts:269–305)**
   - Secondary check at line 272: `if (!subscriptionAllowsEarning(eligible.status, eligible.currentPeriodEnd, now))`
   - Catches cases where subscription status changed between `findEligibleSubscription()` query and validation
   - Defensive check prevents silent permission escalation if subscription expired milliseconds after the select
   - **Status:** PRESENT ✓

5. **Critical edge case: newer EXPIRED + older CANCELLED-within-period (test lines 210–271)**
   - Test creates EXPIRED sub 50h ago, CANCELLED-within-period sub 100h ago
   - `findEligibleSubscription` returns CANCELLED sub (via `createdAt: 'asc'` line 157)
   - Both `requireActiveSubscription` and `assertSubscriptionAllowsScanning` would permit this scenario
   - **Status:** TEST VALIDATES FIX ✓

6. **CRITICAL MISALIGNMENT FOUND: Cashback tier selection uses different ordering strategy**
   - **Scanning gate** (`findEligibleSubscription` line 157): `orderBy: { createdAt: 'asc' }` → EARLIEST eligible
   - **Cashback tier** (`resolveCashbackTier` line 324): `orderBy: { currentPeriodEnd: 'desc' }` → LATEST-by-expiry eligible
   - **Impact:** When a user has multiple eligible subscriptions, the scanning gate and cashback tier may resolve DIFFERENT subscriptions
   - **Example scenario:**
     - User has two CANCELLED subscriptions, both within period
     - Sub A: created 100h ago, currentPeriodEnd=2026-07-01, plan=BASIC
     - Sub B: created 50h ago, currentPeriodEnd=2026-06-30, plan=PREMIUM_MONTHLY
     - Scanning gate selects Sub A (earliest), allows scan ✓
     - `resolveCashbackTier` selects Sub B (latest-by-expiry), assigns PREMIUM cashback
     - User scans with BASIC subscription's gate but earns PREMIUM tier cashback
     - **Spec §8.1 rule 1 violation:** "Cashback gate ≡ Scanning gate" — both must evaluate the SAME subscription
   - **Status:** INTEGRATION BROKEN ✗

## Runtime checks (Step 4)

Not applicable for Step 4 task-level audit per protocol — runtime checks on the working app would be performed via curl against the running server. However, the integration gap between scanning gate and cashback tier is structural and does not depend on runtime state.

## Verdict

`request-changes` — One MEDIUM-severity integration defect must be fixed before approval.

## Findings

### Severity: MEDIUM — Cashback Tier Selection Misalignment

**Item:** `sticker.service.ts:resolveCashbackTier()` (lines 314–330) uses `orderBy: { currentPeriodEnd: 'desc' }` while the scanning gate (`findEligibleSubscription()` line 157) uses `orderBy: { createdAt: 'asc' }`.

**Why this is a defect:** Spec §8.1 rule 1 requires: "New cashback records are never generated while scanning is blocked." The task brief further specifies: "Both gates must agree" and "a user with a newer terminal subscription (EXPIRED) + an older still-within-period CANCELLED subscription can scan and earn cashback... **Both gates must agree.**"

The current implementation ensures both gates PERMIT a user with multiple eligible subscriptions (neither blocks). However, they may select DIFFERENT subscriptions when multiple are eligible:
- Scanning gate: "Do you have ANY eligible subscription?" (EARLIEST by creation) → Yes → Allow
- Cashback calculation: "What plan are you on?" (LATEST by expiry) → determines tier from a different subscription

This creates a race where cashback is calculated from a subscription that did NOT gate the scanning operation. While the user is not blocked (spec §8.1 satisfied in isolation), the symmetry requirement ("Both gates must agree") is broken.

**Fix:** Align `resolveCashbackTier()` to use the same selection logic as the scanning gate. Either:
1. (Preferred) Refactor `resolveCashbackTier` to call `findEligibleSubscription()` + then read the plan from the returned subscription, OR
2. Change line 324 from `orderBy: { currentPeriodEnd: 'desc' }` to `orderBy: { createdAt: 'asc' }` to match `findEligibleSubscription()`

Option 1 is cleaner (single source of truth); Option 2 is a minimal diff if `resolveCashbackTier` is not called elsewhere.

## Suggestions

**Note:** These are genuinely optional observations, not gating issues:

1. **Docstring clarity:** The comment at line 128 in `subscriptionGate.ts` ("The choice to return 'any eligible' rather than 'latest'...") is excellent for context. Consider adding a similar comment to `resolveCashbackTier` explaining why it MUST use the same selection logic, so future maintainers don't accidentally re-align to "latest" on refactors.

2. **Test expansion:** While the critical test (lines 210–271) is strong, consider adding a test that verifies `resolveCashbackTier()` returns the same subscription that `findEligibleSubscription()` would select. This would have caught the misalignment in code review.

## Out-of-scope flags

None. The misalignment is within the assigned task scope.

## Brief items I disagreed with

None. The brief correctly identified the need to verify integration alignment, and the discovered MEDIUM issue is a genuine violation of "Both gates must agree."

---

## Summary

The implementation successfully:
- ✓ Unifies middleware and service layer via shared `findEligibleSubscription()` helper
- ✓ Correctly handles the edge case (newer EXPIRED + older CANCELLED-within-period)
- ✓ Preserves error messaging and user-facing error codes
- ✓ Includes race-condition defense (secondary check)
- ✓ Comprehensive test coverage for the critical scenario

However, one integration gap remains:
- ✗ `resolveCashbackTier()` uses a different subscription selection strategy, creating the potential for cashback to be calculated from a different subscription than the one that gated the scan

This violates the spec §8.1 symmetry requirement and must be fixed before approval.
