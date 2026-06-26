# BC-ADMIN-SPEC-REAUDIT-IMP-AUDIT-AWAIT-1 — Mutation Ordering Fix

## Summary
Fixed two MEDIUM-severity mutation ordering issues in the impersonation audit trail where refresh token revocation/deletion could occur before the audit write was awaited. If the audit write failed, tokens would be orphaned and the audit trail incomplete.

## Changes Made

### 1. File: `/src/services/auth.service.ts`

#### Fix 1A: `impersonate()` method (~line 2703-2752)
**Before (incorrect order):**
```
revoke admin refresh token → generate new tokens → await audit write
```

**After (correct order):**
```
generate new tokens → await audit write → revoke admin refresh token
```

**Reason:** Ensures the audit record is committed before any irreversible mutations. If `writeAudit()` throws, no token is revoked, and the operation is fully rolled back.

**Code location:** Lines 2742-2752 now come after the `await writeAudit()` call (line 2730).

#### Fix 1B: `stopImpersonate()` method (~line 2805-2863)
**Before (incorrect order):**
```
delete impersonation refresh token → generate new admin tokens → await audit write
```

**After (correct order):**
```
generate new admin tokens → await audit write → delete impersonation refresh token
```

**Reason:** Same as Fix 1A—ensures audit commitment before token deletion.

**Code location:** Lines 2853-2863 now come after the `await writeAudit()` call (line 2842).

### 2. File: `/tests/integration/impersonation.test.ts`

#### Enhancement: Audit failure rollback verification

**New test: `'rolls back impersonate start if audit write fails — no token revoked, no impersonation artifact'`**
- Mocks `prisma.auditLog.create` to throw an error
- Verifies HTTP 500 response
- **CRITICAL ASSERTIONS:**
  - Admin's refresh token is NOT revoked (still queryable in DB)
  - Admin's refresh token still works (can call `/auth/refresh`)
  - No audit log was written
  - Operation fully rolled back

**New test: `'rolls back stop-impersonate if audit write fails — no token deleted, impersonation session survives'`**
- Successfully creates impersonation session first
- Mocks `prisma.auditLog.create` to throw on the stop-impersonate call
- Verifies HTTP 500 response
- **CRITICAL ASSERTIONS:**
  - Impersonation refresh token is NOT deleted
  - No audit log was written
  - Impersonation session still works (can call authenticated endpoints as partner)
  - Operation fully rolled back

## Testing Strategy

The new tests verify:
1. HTTP 500 response when audit write fails (basic error handling)
2. No state was persisted (the critical rollback verification):
   - Refresh tokens remain in DB
   - No audit log entries created
   - Sessions remain functional for retry

## Transaction Semantics

The fixes ensure **write-audit-first semantics**:
- Generate/validate all state ✓
- Write immutable audit record ✓
- Apply irreversible mutations (token deletion) ✓

If any step fails:
- Audit record missing → safe to retry without doubling audit entries
- Token still valid → retry operations can succeed
- No partial state → clean rollback

## Verification Checklist

- [x] Both `impersonate()` and `stopImpersonate()` reordered
- [x] Comments explain the ordering requirement
- [x] Test cases verify rollback behavior
- [x] No syntax errors in reordered code
- [x] All assertions check for actual rollback (not just HTTP response)
- [x] Existing tests continue to pass (happy path unchanged)
