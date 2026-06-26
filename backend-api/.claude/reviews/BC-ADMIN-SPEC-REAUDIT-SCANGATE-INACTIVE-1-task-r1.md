# Task-Level Audit: BC-ADMIN-SPEC-REAUDIT-SCANGATE-INACTIVE-1

## Files read
- `/Users/administrator/Documents/BoomCard/backend-api/src/middleware/auth.middleware.ts` lines 397–519
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/stickers.routes.ts` lines 1–1138
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/wallet.routes.ts` lines 1–183
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/sticker.service.ts` lines 236–254
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/requireActiveSubscription-account-status-check.test.ts` lines 1–451
- `/Users/administrator/Documents/BoomCard/backend-api/src/middleware/error.middleware.ts` lines 1–136

## Integration points checked

1. **Route → Middleware → Service flow (stickers.session):**
   `stickers.routes.ts:65 (POST /api/stickers/session: authenticate, requireActiveSubscription)` → `auth.middleware.ts:397-519 (requireActiveSubscription checks user.status)` → `sticker.service.ts:873 (assertSubscriptionAllowsScanning redundant check)` — Account status is checked at both middleware and service layer, firing BEFORE subscription checks.

2. **Error response pipeline:**
   `auth.middleware.ts:438-444 (AppError with statusCode=402 for INACTIVE)` → `error.middleware.ts:34-36 (AppError handler extracts statusCode)` → `error.middleware.ts:120 (statusCode in HTTP response)` — Error codes flow correctly from middleware through global handler.

3. **Middleware mounting on all write endpoints:**
   - `stickers.routes.ts:65 (POST /session)` ✓
   - `stickers.routes.ts:124 (POST /scan)` ✓
   - `stickers.routes.ts:232 (POST /scan/:scanId/receipt)` ✓
   - `wallet.routes.ts:75 (POST /topup)` ✓
   - `wallet.routes.ts:106 (PUT /payout-account: NO middleware)` ✓ per spec §1.2 + §13.1

4. **Database safety (P2025 handling):**
   `auth.middleware.ts:421-434 (findUnique().catch detects P2025, returns null gracefully)` — Other DB errors re-throw → 503. Fail-closed design confirmed.

5. **Authenticate middleware pre-check:**
   `auth.middleware.ts:183 (PENDING_VERIFICATION, PENDING_PAYMENT rejected with 401)` vs `auth.middleware.ts:465-472 (requireActiveSubscription checks same statuses, returns 402)` — Overlapping gate; authenticate fires first, making requireActiveSubscription code unreachable for these statuses.

## Runtime checks

**Unable to execute:** Test environment requires database setup (`boomcard_test` database, migrations deployed). The test setup failed at jest startup due to missing `npx` command. Static code analysis performed instead.

**Expected behavior verification (code trace):**
- INACTIVE user → middleware queries freshUser.status (line 421) → matches 'INACTIVE' (line 438) → returns AppError 402 (line 439-445) ✓
- ARCHIVED user → matches 'ARCHIVED' (line 447) → returns AppError 403 (line 448-454) ✓
- DELETED user → matches 'DELETED' (line 456) → returns AppError 403 (line 457-463) ✓
- ACTIVE user + ACTIVE subscription → passes middleware → reaches service → passes assertSubscriptionAllowsScanning → succeeds ✓

**Test file expectations analysis:**
- Line 367-387 (PENDING_VERIFICATION): test expects 402 status
- Line 389-409 (PENDING_PAYMENT): test expects 402 status
- **ISSUE:** These tests will receive 401 from authenticate middleware (line 183) BEFORE requireActiveSubscription is reached, causing test failures.

## Verdict

**block**

## Findings

### CRITICAL

1. **Test expectations mismatch with middleware chain order**
   
   **Severity:** CRITICAL
   
   **Item:** Tests at lines 367-387 (PENDING_VERIFICATION) and 389-409 (PENDING_PAYMENT) expect HTTP status 402, but the authenticate middleware blocks these statuses with 401 at auth.middleware.ts:183 before requireActiveSubscription is ever invoked.
   
   **Evidence:** 
   - stickers.routes.ts:65 mounts `authenticate, requireActiveSubscription` in that order
   - authenticate middleware at auth.middleware.ts:183 checks for PENDING_VERIFICATION and PENDING_PAYMENT and returns `res.status(401).json(...)` 
   - This 401 response is sent immediately; requireActiveSubscription never executes
   - Test assertions at line 383 and line 405 expect `res.status).toBe(402)` which will fail
   
   **Impact:** Test suite will fail on 2 of 12 test cases (requireActiveSubscription account-status tests). These are unit/integration tests that are blocking the implementation from approval.

2. **Dead code in middleware creates false documentation of defense-in-depth**
   
   **Severity:** CRITICAL
   
   **Item:** The requireActiveSubscription middleware contains unreachable code that checks PENDING_VERIFICATION and PENDING_PAYMENT (lines 465-472), with a comment claiming it's "belt-and-suspenders" defense (lines 419-420). However, the authenticate middleware ALWAYS blocks these statuses first (auth.middleware.ts:183), making the requireActiveSubscription checks unreachable.
   
   **Evidence:**
   - auth.middleware.ts:183 is an unconditional check that fires for all USER/PARTNER roles
   - It blocks PENDING_VERIFICATION and PENDING_PAYMENT with 401
   - requireActiveSubscription never executes because the 401 response is sent by authenticate
   - The comment "these should never reach here" contradicts having the code
   
   **Impact:** The defensive check is not actually implemented as documented. If authenticate's 401 block is removed or bypassed in future changes, the code would work, but today it's misleading documentation that masks dead code.

### HIGH

None additional beyond the CRITICAL findings above.

## Suggestions

1. **Fix test expectations:** Change the expected status from 402 to 401 for PENDING_VERIFICATION and PENDING_PAYMENT tests, OR coordinate with authenticate middleware to pass these statuses through so requireActiveSubscription can be the single enforcement point.

2. **Remove dead code:** If the intent is to have requireActiveSubscription as the defense-in-depth gate, remove the PENDING_VERIFICATION/PENDING_PAYMENT check from requireActiveSubscription and rely on authenticate to block them. If the intent is to have requireActiveSubscription be the primary gate, modify authenticate to pass these statuses through (but this contradicts the "Account not accessible" design at line 184).

3. **Clarify spec intent:** The spec references §8.1 rule 1 "belt-and-suspenders" which implies both layers should work independently, but authenticate blocks first. Decide whether requireActiveSubscription is truly defense-in-depth (independent) or supplementary (only for statuses authenticate doesn't catch).

## Out-of-scope flags

None — all changes are within the task scope.

## Brief items I disagreed with

None — the brief's requirements are clear. The implementation is nearly complete but has these test correctness issues that must be fixed.
