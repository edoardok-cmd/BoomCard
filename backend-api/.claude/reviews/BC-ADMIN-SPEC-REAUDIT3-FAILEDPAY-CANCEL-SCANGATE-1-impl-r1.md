# Implementation Review: BC-ADMIN-SPEC-REAUDIT3-FAILEDPAY-CANCEL-SCANGATE-1

**Task:** Admin-cancelling a FAILED_PAYMENT subscription can re-open the receipt-scanning gate. The fix stamps `currentPeriodEnd: now` in the FAILED_PAYMENT branch of PATCH /:userId/cancel only.

**Verdict:** `approve`

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminSubscribers.routes.ts` (lines 1-1505, with focus on lines 850-923)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/bc-admin-spec-reaudit3-failedpay-cancel-scangate.test.ts` (full file)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/subscriptionGate.ts` (full file, to verify gate logic)

---

## Integration points checked

1. **adminSubscribers.routes.ts:859-898 → subscriptionGate.ts:140-159** — FAILED_PAYMENT cancel now stamps `currentPeriodEnd: now`, which causes `findEligibleSubscription()` to return null because the subscription no longer matches `{ status: 'CANCELLED', currentPeriodEnd: { gt: now } }`. Verified end-to-end in test case line 364-398.

2. **adminSubscribers.routes.ts:859-898 → subscriptionGate.ts:36-79** — `subscriptionAllowsEarning()` correctly blocks post-period CANCELLED subscriptions. The fix ensures a cancelled FAILED_PAYMENT subscription is immediately post-period, so earning is blocked. Verified in test cases line 131-197 and 400-446.

3. **adminSubscribers.routes.ts:899-923 (Active/Stripe branches) → subscriptionGate.ts:36-79** — The ACTIVE cancel branches correctly use `cancelAtPeriodEnd: true` and preserve `currentPeriodEnd`, leaving the subscription eligible during its paid period. Verified in regression test line 280-322.

---

## Findings

### ✅ Requirement 1: FAILED_PAYMENT branch stamps currentPeriodEnd: now
**Status:** PASS

Implementation (adminSubscribers.routes.ts:881):
```typescript
currentPeriodEnd: now,
```
- The fix is present and correctly positioned in the FAILED_PAYMENT branch only (lines 859-898).
- Line 875-880 includes detailed inline documentation explaining the fix and its purpose.
- The stamp is within the conditional `if (subscription.status === 'FAILED_PAYMENT')` guard, so it does not affect other statuses.
- The timestamp ensures the subscription immediately becomes ineligible for earning (gate logic requires `currentPeriodEnd > now` to allow CANCELLED subscriptions).

### ✅ Requirement 2: Active cancel branch unchanged
**Status:** PASS

Implementation (adminSubscribers.routes.ts:899-923):
- Line 899: `else if` statement correctly excludes FAILED_PAYMENT (already handled above).
- Lines 902-907: Non-Stripe ACTIVE subscriptions use `cancelAtPeriodEnd: true` and set `cancelAt` to the existing `currentPeriodEnd` without modifying it.
- Lines 910-922: Stripe-backed ACTIVE subscriptions call `stripeService.stripe.subscriptions.update(...{ cancel_at_period_end: true })` and preserve `currentPeriodEnd`.
- Neither branch stamps `currentPeriodEnd`, so ACTIVE subscriptions remain eligible until the paid period ends.
- Verified by regression test (line 280-322): ACTIVE subscriptions preserve `currentPeriodEnd` and remain eligible via `findEligibleSubscription()`.

### ✅ Requirement 3: Regression tests cover all three assertions
**Status:** PASS

Test case 1 (lines 131-197, "should block scanning after admin-cancel..."):
1. **Assertion 1 — currentPeriodEnd stamped to now:** Lines 179-184 verify `updatedSub.currentPeriodEnd` matches `now` within 1 second.
   ```typescript
   const timeDiff = Math.abs(
     (updatedSub.currentPeriodEnd?.getTime() ?? 0) - now.getTime()
   );
   expect(timeDiff).toBeLessThan(1000);
   ```

2. **Assertion 2 — findEligibleSubscription returns null:** Lines 187-188 directly verify the gate is blocked.
   ```typescript
   const eligible = await findEligibleSubscription(subscriber.id, now);
   expect(eligible).toBeNull();
   ```

3. **Assertion 3 — subscriptionAllowsEarning returns false:** Lines 191-196 verify earning is blocked.
   ```typescript
   const afterCancel = subscriptionAllowsEarning(
     updatedSub.status,
     updatedSub.currentPeriodEnd,
     now,
   );
   expect(afterCancel).toBe(false);
   ```

**Additional validation:**
- Test case at lines 364-398 performs an **end-to-end HTTP integration test**, calling the actual `PATCH /api/admin/subscribers/{userId}/cancel` endpoint via `request(app)` and then verifying `findEligibleSubscription()` returns null. This confirms the fix works through the full handler pipeline.
- Test case at lines 199-236 verifies `failedPaymentClearedAt` is stamped, preventing false "open failure" state in projections.
- Test case at lines 238-276 verifies `retryAttempt` is reset, preventing contradictory payment-failure notifications.
- Regression test at lines 280-322 confirms ACTIVE subscriptions are not affected (currentPeriodEnd preserved, subscription remains eligible).
- Edge case test at lines 400-446 verifies the fix applies only to FAILED_PAYMENT, not to ACTIVE.

---

## Verdict reasoning

**Correctness:** The implementation exactly matches the spec. The FAILED_PAYMENT branch writes `currentPeriodEnd: now`, making the cancelled subscription immediately post-period and ineligible for earning. The Active cancel branches are unchanged. All three required test assertions are present and verified end-to-end.

**Tests:** Coverage is comprehensive. Unit-level tests verify gate logic (findEligibleSubscription, subscriptionAllowsEarning), and integration tests (HTTP endpoint calls) verify the fix works through the full handler pipeline. Regression tests confirm ACTIVE subscriptions are unaffected. Edge cases (exact boundary, multi-status verification) are covered.

**Security:** No security concerns. The fix operates within existing auth/permission boundaries (authenticate, authorize, requirePermission). No input validation issues. The `now` timestamp is captured securely within the handler.

**Data integrity:** The fix correctly updates the subscription row atomically via Prisma's update. No race condition concerns (Stripe cancel is called first, DB update follows). The failedPaymentClearedAt and retryAttempt resets prevent cascading side effects (phantom payment-failure notifications). 

**Scope:** The change is minimal and focused. Only the FAILED_PAYMENT branch is modified. No other handlers, services, or interfaces are changed. No scope creep.

---

## Verdict

**`approve`**

All assigned files have been read. The implementation correctly stamps `currentPeriodEnd: now` in the FAILED_PAYMENT branch only, leaves the ACTIVE cancel branch unchanged, and includes comprehensive regression tests covering all three required assertions (gate blocked, scanning blocked, currentPeriodEnd stamped). Integration tests verify the fix works end-to-end. No CRITICAL, HIGH, MEDIUM, or LOW issues found.
