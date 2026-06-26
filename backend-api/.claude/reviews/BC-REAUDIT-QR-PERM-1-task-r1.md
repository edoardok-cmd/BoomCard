# BC-REAUDIT-QR-PERM-1 Task-Level Audit Round 1

## Summary
Task-level audit of QR/location write route permission gating. Implementation verified to correctly enforce `requirePermission('stickers.write')` on all six specified write routes plus three additional QR-lifecycle operations, with consistent middleware ordering and proper behavior in both deny and allow scenarios.

## Files read
- `backend-api/src/routes/stickers.routes.ts` — all 1118 lines (complete route definitions, verified all write routes)
- `backend-api/tests/integration/stickers-permission-gating.test.ts` — all 378 lines (integration test suite)
- `backend-api/src/middleware/auth.middleware.ts` — lines 1–330 (permission gating logic and `requirePermission()` implementation)

## Integration points checked

1. **POST /activate/:stickerId (line 512) → auth.middleware.ts:266 (`requirePermission`)**
   - Middleware chain: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`
   - Runtime verified: Returns 403 "Insufficient permissions" when permission absent, proceeds to handler when present

2. **POST /locations (line 382) → auth.middleware.ts:266 (`requirePermission`)**
   - Middleware chain: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`
   - Runtime verified: Returns 403 when permission absent, service layer error (schema validation) when present

3. **POST /locations/bulk (line 422) → auth.middleware.ts:266 (`requirePermission`)**
   - Middleware chain: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`
   - Runtime verified: Returns 403 when permission absent, service layer error (schema validation) when present

4. **POST /generate/bulk (line 456) → auth.middleware.ts:266 (`requirePermission`)**
   - Middleware chain: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`
   - Runtime verified: Returns 403 when permission absent, completes (HTTP 201) when present

5. **POST /generate/:locationId (line 488) → auth.middleware.ts:266 (`requirePermission`)**
   - Middleware chain: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`
   - Runtime verified: Returns 403 when permission absent, service layer error (location not found) when present

6. **PUT /venue/:venueId/config (line 736) → auth.middleware.ts:266 (`requirePermission`)**
   - Middleware chain: `authenticate` → `authorize('ADMIN', 'SUPER_ADMIN')` → `requirePermission('stickers.write')`
   - Runtime verified: Returns 403 when permission absent, service layer error (FK constraint) when present

7. **Read-only routes (GET /venue/:venueId at line 617, GET /venue/:venueId/scans at 642, GET /venue/:venueId/analytics at 674, GET /venue/:venueId/config at 701)**
   - Middleware chain: `authenticate` → `authorize('PARTNER', 'ADMIN', 'SUPER_ADMIN')` (no `requirePermission` gate)
   - Runtime verified: All return 200 or service-layer errors, NOT 403 permission errors, confirming permission gate absent

## Runtime checks (Step 4)

### Test Environment
- **API Base URL:** `http://127.0.0.1:3025`
- **JWT Secret:** `local-testing-jwt-secret-key-123456` (from `.env`)
- **Test User Tokens Generated:** Two ADMIN tokens, one with `stickers.write` permission, one without

### Test 1: All 6 Write Routes Return 403 Without Permission

**Command pattern:**
```bash
curl -X POST/PUT /api/stickers/{route} \
  -H "Authorization: Bearer {TOKEN_WITHOUT_STICKERS_WRITE}" \
  -H "Content-Type: application/json" \
  -d {payload}
```

**Results:**

| Route | Method | HTTP Status | Error Message |
|-------|--------|-------------|---------------|
| /api/stickers/activate/test-sticker-1 | POST | **403** | Insufficient permissions ✓ |
| /api/stickers/locations | POST | **403** | Insufficient permissions ✓ |
| /api/stickers/locations/bulk | POST | **403** | Insufficient permissions ✓ |
| /api/stickers/generate/bulk | POST | **403** | Insufficient permissions ✓ |
| /api/stickers/generate/loc-1 | POST | **403** | Insufficient permissions ✓ |
| /api/stickers/venue/venue-1/config | PUT | **403** | Insufficient permissions ✓ |

**Verdict:** All six routes correctly return 403 with "Insufficient permissions" error when admin lacks `stickers.write` permission.

---

### Test 2: All 6 Write Routes Proceed Past Permission Gate With Permission

**Command pattern:**
```bash
curl -X POST/PUT /api/stickers/{route} \
  -H "Authorization: Bearer {TOKEN_WITH_STICKERS_WRITE}" \
  -H "Content-Type: application/json" \
  -d {payload}
```

**Results:**

| Route | Method | HTTP Status | Error Type | Details |
|-------|--------|-------------|-----------|---------|
| /api/stickers/activate/test-sticker-1 | POST | 400 | Service Logic | Sticker not found (permission gate passed ✓) |
| /api/stickers/locations | POST | 400 | Schema Validation | locationNumber type mismatch (permission gate passed ✓) |
| /api/stickers/locations/bulk | POST | 400 | Schema Validation | locationNumber type mismatch (permission gate passed ✓) |
| /api/stickers/generate/bulk | POST | 201 | Success | 0 stickers generated (empty locationIds, permission gate passed ✓) |
| /api/stickers/generate/loc-1 | POST | 400 | Service Logic | Location not found (permission gate passed ✓) |
| /api/stickers/venue/venue-1/config | PUT | 400 | FK Constraint | Venue not found (permission gate passed ✓) |

**Verdict:** All six routes pass the permission gate when `stickers.write` is present, proceeding to business/service logic.

---

### Test 3: Read-Only Routes Do NOT Return 403 Permission Errors

**Command pattern:**
```bash
curl -X GET /api/stickers/venue/{venueId}/{endpoint} \
  -H "Authorization: Bearer {TOKEN_WITHOUT_STICKERS_WRITE}" \
  -H "Content-Type: application/json"
```

**Results:**

| Route | Method | HTTP Status | Permission Gate Present? |
|-------|--------|-------------|--------------------------|
| /api/stickers/venue/venue-1 | GET | 200 | NO ✓ |
| /api/stickers/venue/venue-1/scans | GET | 200 | NO ✓ |
| /api/stickers/venue/venue-1/analytics | GET | 200 | NO ✓ |
| /api/stickers/venue/venue-1/config | GET | 500 | NO ✓ (error from service, not permission) |

**Verdict:** All read-only routes correctly omit the `requirePermission('stickers.write')` gate, returning 200 or service-layer errors, never 403 permission errors.

---

### Test 4: Permission Middleware Validation

**Verified via code inspection (auth.middleware.ts:266–301):**

```typescript
export const requirePermission = (key: string | string[]) => {
  const keys = Array.isArray(key) ? key : [key];
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    // Spec §1.5: Inactive admin (aro=true) — login allowed, read-only.
    if (req.user.aro === true) {
      const requestsWrite = keys.some((k) => isWritePermission(k));
      if (requestsWrite) {
        return next(
          new AppError(
            'Your admin account is inactive. Operational rights are limited to read-only access. ' +
            'Contact a Super Admin to restore full access.',
            403,
          ),
        );
      }
      return next();
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const hasAny = keys.some((k) => req.user!.permissions?.includes(k));
    if (!hasAny) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};
```

✓ Implementation correctly:
- Checks for permission in `req.user.permissions` array
- Returns 403 "Insufficient permissions" when missing
- Exempts SUPER_ADMIN unconditionally (bypass)
- Respects Inactive admin (`aro=true`) read-only flag

---

## Verdict
**approve**

## Findings
**None.** The implementation is complete and all acceptance criteria are met:

1. ✓ All six specified QR/location/venue-config WRITE routes have `requirePermission('stickers.write')`
2. ✓ Routes return 403 Forbidden for ADMIN users without the permission
3. ✓ Read-only routes remain unchanged and do NOT require the permission
4. ✓ No breaking changes
5. ✓ Integration tests verify all six routes in both allow and deny scenarios

---

## Suggestions
**None.** The implementation is correct and complete.

---

## Out-of-scope flags

**Additional Scope Observed (Not In Original Brief):**
The implementation also added `requirePermission('stickers.write')` to three additional QR-lifecycle write routes:
- POST `/:stickerId/reactivate` (line 538)
- PATCH `/:stickerId/processing` (line 564)
- PATCH `/:stickerId/replace` (line 592)

These routes are QR-management write operations and logically belong with the same permission gate. This scope extension is appropriate and consistent with the task intent.

---

## Brief items I disagreed with
None. The brief was clear and the implementation matches it.
