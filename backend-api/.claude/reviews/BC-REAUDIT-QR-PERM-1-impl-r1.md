# BC-REAUDIT-QR-PERM-1 Implementation Review Round 1

## Files read
- `backend-api/src/routes/stickers.routes.ts` — all route definitions (lines 1–1118)
- `backend-api/tests/integration/stickers-permission-gating.test.ts` — integration tests (lines 1–361)
- `backend-api/src/middleware/auth.middleware.ts` — authentication/authorization middleware (lines 1–300+)

## Integration points checked
- `stickers.routes.ts:10 → auth.middleware.ts:266` — `requirePermission` import and function signature match; middleware accepts `string | string[]` and returns a NextFunction-compatible function
- `stickers.routes.ts:382, 422, 456, 488, 512, 736 → auth.middleware.ts:176` — middleware chain ordering verified: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')` consistent across all six routes
- `stickers.routes.ts:538, 564, 592 → auth.middleware.ts:266` — reference routes (already fixed) confirm pattern; all three have identical middleware chain
- `stickers-permission-gating.test.ts:59–64 → auth.middleware.ts:294–296` — test mock `requirePermission` behavior matches real implementation (403 on missing permission; `next()` on grant)
- `stickers.routes.ts:617, 642, 674, 701, 766, 958 → no requirePermission` — read-only routes verified untouched (GET routes unaffected)

## Verdict
**request-changes**

## Findings

### MEDIUM: Test placeholder does not validate read-only route immunity
**Location:** `tests/integration/stickers-permission-gating.test.ts:346–358`

The test suite includes a placeholder assertion on line 357:
```javascript
expect(true).toBe(true); // Placeholder for documentation
```

This test purports to verify "Read routes remain unchanged (no requirePermission gate)", but the assertion always passes and provides zero validation. The comments indicate manual inspection of `stickers.routes.ts:617` confirmed no `requirePermission`, which is true per my own grep verification. However, a test that always passes is a false sense of coverage.

**Why this matters:** If a future developer accidentally adds `requirePermission('stickers.write')` to a read-only route (e.g., GET /venue/:venueId), this test would not catch it. The test suite should actively verify this.

**Fix:** Replace the placeholder with a real integration test that:
1. Makes an unauthenticated or non-admin request to GET /venue/:venueId
2. Expects a 2xx or specific auth error (not 403 "Missing permission")
3. Verifies the response does not indicate the permission was checked

Alternatively, if full integration setup is not feasible, add a simple sync test that reads `stickers.routes.ts`, parses route definitions, and verifies no GET route has `requirePermission` in its middleware chain.

---

### MEDIUM: Test mock for `authorize` middleware does not validate role arguments
**Location:** `tests/integration/stickers-permission-gating.test.ts:58`

The mock is:
```javascript
authorize: () => (_req: any, _res: any, next: any) => next(),
```

The real `authorize` function signature (line 176 of `auth.middleware.ts`):
```javascript
export const authorize = (...roles: string[]) => { ... }
```

The mock does not accept role arguments, so it ignores them. This means a route with `authorize('PARTNER')` would pass the test with the same mock behavior as `authorize('ADMIN', 'SUPER_ADMIN')`.

**Why this matters:** The test verifies that `requirePermission` gates are present, but it does NOT verify that the role gates (`authorize('ADMIN', 'SUPER_ADMIN')`) are also present and correct. If someone accidentally removed the `authorize()` call from a route, the test would still pass (because the mock always calls `next()`).

**Actual risk:** Low — the role gates are present and correct in all six modified routes (verified via grep). However, the test suite is weaker than it should be and would not catch this error.

**Fix:** Update the mock to preserve role arguments:
```javascript
authorize: (...roles: string[]) => (_req: any, _res: any, next: any) => {
  // For testing, just verify roles were provided and call next()
  // or optionally validate roles match expectations
  next();
}
```

This ensures the test will fail loudly if someone removes the `authorize()` call or changes its arguments.

---

## Findings (continued)

### No CRITICAL or HIGH issues found
All six targeted routes have been correctly updated with `requirePermission('stickers.write')`:
- POST /locations (line 382) ✓
- POST /locations/bulk (line 422) ✓
- POST /generate/bulk (line 456) ✓
- POST /generate/:locationId (line 488) ✓
- POST /activate/:stickerId (line 512) ✓
- PUT /venue/:venueId/config (line 736) ✓

All routes follow the correct middleware ordering: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`.

The three reference routes (POST /:stickerId/reactivate, PATCH /:stickerId/processing, PATCH /:stickerId/replace) already had this permission correctly applied.

Read-only routes remain unchanged:
- GET /my-scans ✓
- GET /validate/:stickerId ✓
- GET /venue/:venueId ✓
- GET /venue/:venueId/scans ✓
- GET /venue/:venueId/analytics ✓
- GET /venue/:venueId/config ✓
- GET /admin/pending-review ✓
- GET /admin/stats ✓

All admin write routes (approve, reject, bulk-approve, bulk-reject) do NOT have `requirePermission('stickers.write')` — these remain unarmed per spec (they may have a different permission model or rely on role alone). This is correct and unchanged.

Middleware import is correct: `requirePermission` is imported from `auth.middleware` on line 10 and is the correct function (verified via middleware inspection).

---

## Suggestions

1. **Test robustness:** Consider adding a simple static test that parses route definitions and verifies:
   - All routes with WRITE verbs have `requirePermission`
   - All routes with GET have no `requirePermission`
   - No accidental duplicate permissions (e.g., `requirePermission('stickers.write'), requirePermission('stickers.write')`)

2. **Documentation:** Add a JSDoc comment above the six modified routes (or in a shared block at the top) explaining the permission model:
   ```javascript
   // Spec §3.6 / §5.4: All QR-lifecycle WRITE routes require stickers.write permission.
   // Permission check: authenticate → authorize(ADMIN|SUPER_ADMIN) → requirePermission('stickers.write')
   ```

3. **Test coverage for boundary cases:** Add a test for SUPER_ADMIN role with missing `stickers.write` permission, to verify the real middleware behavior (SUPER_ADMIN should bypass requirePermission per auth.middleware.ts:290–291). The current test only covers ADMIN role.

---

## Out-of-scope flags
None identified.

---

## Brief items I disagreed with
None. The brief accurately describes the task and acceptance criteria.
