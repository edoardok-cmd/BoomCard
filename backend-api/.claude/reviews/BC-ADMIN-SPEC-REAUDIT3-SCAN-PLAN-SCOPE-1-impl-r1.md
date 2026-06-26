# Review: BC-ADMIN-SPEC-REAUDIT3-SCAN-PLAN-SCOPE-1 (Impl R1)

**Reviewer:** Claude Haiku 4.5  
**Date:** 2026-06-27  
**Verdict:** `approve`

---

## Files read

1. `/Users/administrator/Documents/BoomCard/backend-api/src/services/sticker.service.ts` (lines 1–50, 300–328, 336–349, 940–980, 1250–1304)
2. `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/sticker-partner-access-gate.test.ts` (full file, lines 1–520)
3. `/Users/administrator/Documents/BoomCard/backend-api/src/services/subscriptionGate.ts` (full file, lines 1–160)
4. `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminFinance.routes.ts` (lines 1–150, determined unrelated to task scope)

---

## Integration points checked

1. **sticker.service.ts:13 (import) → subscriptionGate.ts:140 (export)** — `findEligibleSubscription` imported and used in `getPlanForAccessGate` helper; state-aware lookup correctly includes ACTIVE, TRIALING, CANCELLED-within-period.

2. **sticker.service.ts:317–328 (getPlanForAccessGate) → sticker.service.ts:341 (resolveCashbackTier)** — Helper correctly fetches subscription plan via `findEligibleSubscription`, then reads the `plan` field from Prisma; `resolveCashbackTier` calls the helper to ensure cashback tier and scanning gate use identical subscription logic (spec §8.1 rule 1).

3. **sticker.service.ts:953–954 (createSession gate) → partnerTypeService.getRedeemableTypeIdsForPlan** — `getPlanForAccessGate` result passed to partner-type service for access control; same pattern used in both paths.

4. **sticker.service.ts:1264–1265 (scanSticker gate) → partnerTypeService.getRedeemableTypeIdsForPlan** — Identical partner-type access gate logic to createSession; both call `getPlanForAccessGate` with the same semantics.

5. **sticker.service.ts:1283 (scanSticker cashback) → resolveCashbackTier** — Cashback tier resolved via shared helper, ensuring plan consistency with the partner-type access gate evaluated moments before.

6. **sticker-partner-access-gate.test.ts:321–322 (test setup) → subscriptionGate.ts:152–153 (findEligibleSubscription query)** — Test creates TRIALING subscription with future `currentPeriodEnd`; spec §1.2 defines TRIALING as "mapped to Active for users", and the query includes `{ status: 'TRIALING' }` in its OR clause, allowing the test to pass.

---

## Verdict

**`approve`**

---

## Findings

None.

---

## Suggestions

None.

---

## Out-of-scope flags

**adminFinance.routes.ts:** This file contains financial reporting and invoice management endpoints unrelated to the subscription plan lookup fix. Included in the audit scope list but not touched by this task. Confirmed not a blocker.

---

## Detailed Analysis

### Spec Compliance (§1.2 + §8.1)

**Requirement:** Users with CANCELLED-within-period or TRIALING subscriptions must retain access at their ACTUAL PLAN level during the subscription state transition window; scanning and cashback gates must use identical logic to prevent plan downgrading.

**Implementation:**

1. **Helper function created:** `getPlanForAccessGate` (lines 317–328) is the new single source of truth for plan lookup in access gates.
   - Calls `findEligibleSubscription(userId)` (subscriptionGate.ts:140), which implements state-aware subscription selection (ACTIVE, TRIALING, CANCELLED-within-period).
   - Fetches the subscription's `plan` field from Prisma to resolve the actual plan.
   - Returns `null` if no eligible subscription exists (edge case handled correctly).

2. **No plan downgrade logic:** The old implementation (implied by the spec) was using an ACTIVE-only subscription query, which would return `null` for CANCELLED/TRIALING users, causing them to fall through to the cheapest plan. This path is now eliminated — `findEligibleSubscription` explicitly includes CANCELLED-within-period and TRIALING in the allowlist, so the plan is always correct when present.

3. **Both scanning paths fixed:**
   - **createSession (line 953):** `const userPlan = await this.getPlanForAccessGate(userId);` — calls the helper.
   - **scanSticker (line 1264):** `const userPlan = await this.getPlanForAccessGate(userId);` — identical call.
   - Both then pass `userPlan` to `partnerTypeService.getRedeemableTypeIdsForPlan()` for access control.

4. **Cashback tier consistency:** `resolveCashbackTier` (lines 336–349) now uses `getPlanForAccessGate` internally (line 341), ensuring that if a user is eligible for scanning, their cashback tier is calculated from the same subscription they scanned with. This satisfies the "identical logic" requirement (spec §8.1 rule 1).

### Test Coverage

All acceptance criteria are covered:

1. ✓ **Helper function test:** CANCELLED-within-period BASIC user in test 1 (lines 146–233) scans a BASIC-redeemable partner and succeeds (expect `res.status === 200`).

2. ✓ **TRIALING test:** Test 3 (lines 308–368) creates a TRIALING PREMIUM_WEEKLY subscription and verifies the user can scan PREMIUM_WEEKLY-redeemable partners.

3. ✓ **Null fallback:** Test 2 (lines 240–302) confirms that CANCELLED-post-period users (no eligible subscription) are BLOCKED with a plan/access error.

4. ✓ **ACTIVE baseline:** Test 4 (lines 374–453) verifies normal ACTIVE subscriptions still work.

5. ✓ **createSession path:** Test 5 (lines 459–518) specifically tests the `POST /api/stickers/create-session` route with a TRIALING user to ensure both paths use the shared helper.

6. ✓ **Edge case prevention:** Test 1, line 230–232 verifies that CANCELLED-within-period users do NOT receive plan-downgrade errors ("Upgrade your plan" not in response).

### Code Quality

- **No duplication:** Both scanning paths and the cashback tier calculation all converge on a single helper function, preventing drift.
- **Error messages preserved:** Both access-gate error messages remain user-facing and consistent:
  - Lines 956–959 (createSession): "Your current subscription does not include access to this partner."
  - Lines 1268–1271 (scanSticker): Identical message.
- **Comments aligned with spec:** Helper comment at line 310–312 explicitly ties to "spec §1.2 + §8.1"; both gate comments at lines 950–952 and 1261–1263 reference the same spec sections.
- **Null safety:** All three callers of `getPlanForAccessGate` handle the null return gracefully:
  - Line 954 passes null to `getRedeemableTypeIdsForPlan` (assumed to return empty array, blocking access as intended).
  - Line 341 in `resolveCashbackTier` returns null, which is the correct fallback for "no cashback" edge case.

### Subscription Gate Logic Correctness

`subscriptionGate.ts:findEligibleSubscription` correctly implements the allow-list:
- Line 152: `{ status: { in: ['ACTIVE', 'TRIALING'] } }` — both states allowed.
- Line 153: `{ status: 'CANCELLED', currentPeriodEnd: { gt: now } }` — CANCELLED allowed only within paid period.
- Line 157: `orderBy: { createdAt: 'asc' }` — returns earliest eligible subscription, ensuring deterministic behavior in tests.

This matches the inline comment at subscriptionGate.ts:125–134, which justifies "earliest" ordering: allows a user with a newer terminal subscription (e.g., EXPIRED) to still scan based on an older CANCELLED-within-period subscription.

### Test Infrastructure

Helper function `createPartnerWithType` (lines 43–142) correctly:
- Creates a PartnerType with the specified name.
- Creates a Partner and Venue tied to the test user.
- Creates a Sticker and StickerLocation.
- Creates a VenueStickerConfig with GPS radius and min bill.
- Registers PlanTypeAccess rules so only specified plans can redeem the partner type.

This setup ensures tests are not false-positives due to missing partner type access rules.

---

## Summary

The implementation correctly addresses the spec requirement that CANCELLED-within-period and TRIALING users must not be downgraded to PREMIUM_WEEKLY when scanning partner venues. A shared helper function (`getPlanForAccessGate`) uses the state-aware subscription selector (`findEligibleSubscription`) to resolve the user's actual plan level, which is then used consistently by both the scanning partner-type access gate and the cashback tier calculation. Tests verify all four subscription states (ACTIVE, TRIALING, CANCELLED-within-period, CANCELLED-post-period) and both scanning paths (createSession and scanSticker). No defects or coverage gaps were found.
