# BC-ADMIN-SPEC-REAUDIT-PENDING-SUPER-HYGIENE-2 Implementation

## Task Summary

**Title:** Pending-Super-Admin request hygiene: ADMIN-email collision not blocked + expired requests never reaped

**Severity:** LOW  
**Spec Reference:** Source §3.9 (Super-Admin creation; 72h expiry; dual-approval)  
**Wave:** Wave 2 (depends on SA-GUARD-RACES-1, QR-SYNC-DURABILITY-1)

## Defects Fixed

### DEFECT 1: Email-Role Collision (email-role-collision.md)

**Root Cause:**
- User.email is unique per `(email, role)` pair (schema §110), allowing the same email to exist as both ADMIN and SUPER_ADMIN
- The initiation guard (adminAdmins.routes.ts ~628) only checked `role: 'SUPER_ADMIN'`
- A pending SUPER_ADMIN request for an email already existing as ADMIN would pass the initiation check and collide at approval

**Fix Applied:**

1. **Initiation pre-check widened** (lines 627-633):
   - Changed from: `where: { email, role: 'SUPER_ADMIN' }`
   - Changed to: `where: { email, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }`
   - Rejects immediately if any admin (ADMIN or SUPER_ADMIN) exists with that email

2. **Approval pre-check added** (new lines 753-760):
   - Added defensive pre-check before transaction to reject if email exists as ADMIN or SUPER_ADMIN
   - Provides clear error message and avoids ambiguous P2002 conflicts inside transaction
   - Pre-check guards the transaction attempt

3. **Error message updated** (line 812):
   - Changed from: "A SUPER_ADMIN with this email already exists"
   - Changed to: "An admin with this email already exists"
   - Clarifies that ADMIN collision is also blocked

**Decision Documented:**
- Implementation blocks same-email ADMIN+SUPER_ADMIN coexistence (safer default)
- If product requires coexistence, it can be documented on the route and guards widened back

### DEFECT 2: No Expiry Reaper (expiry-reaper.md)

**Root Cause:**
- PendingSuperAdminRequest.email has global `@unique` constraint (schema §118)
- Expired rows are never deleted and occupy the unique slot forever
- 72h expiry is only enforced by query-time filtering in /approve and list endpoints
- A fresh request for an expired-but-undeleted email fails with 409 "already exists" even though re-submission should be allowed

**Fix Applied:**

1. **Reaper job added to scheduler.ts** (new lines 623-638):
   - New async function `reapExpiredPendingSuperAdminRequests()`
   - Queries `where: { expiresAt: { lte: now } }` and deletes all expired rows
   - Logs count of deleted rows
   - Registered as daily cron job at 4:30 AM Sofia time (between QR reconcile at 4 AM and menu-expiry at 5 AM)

2. **Scheduler registration added** (new lines 1973-1982):
   - Schedule: `30 4 * * *` (4:30 AM every day, Europe/Sofia timezone)
   - Error handling via existing `alertSchedulerFailure('pending-super-admin-reaper', err)` pattern
   - Logged at startup

3. **P2002 catch enhanced with delete-then-retry** (lines 656-690):
   - When P2002 fires during initiation create, check if colliding row is expired
   - If expired: delete it and retry the create
   - If not expired: reject with 409 "already exists"
   - Allows re-submission immediately after expiry without waiting for nightly reaper

**Flow:**
- User A initiates SUPER_ADMIN request at email X → expires in 72h
- User A's request expires (request still in DB, occupying unique slot)
- User A re-initiates SUPER_ADMIN request at email X → hits P2002 → detects collision is expired → deletes expired row → retries → succeeds

## Code Changes

### 1. src/routes/adminAdmins.routes.ts

**Lines 627-633 (Initiation guard):**
```typescript
// Changed guard from role: 'SUPER_ADMIN' to role: { in: ['ADMIN', 'SUPER_ADMIN'] }
const existingUser = await prisma.user.findFirst({
  where: { email, role: { in: ['ADMIN', 'SUPER_ADMIN'] as UserRole[] } },
});
if (existingUser) {
  return res.status(409).json({ error: 'An admin (ADMIN or SUPER_ADMIN) with this email already exists' });
}
```

**Lines 656-690 (P2002 catch with delete-then-retry):**
```typescript
catch (err: unknown) {
  const isPrismaConflict = ... code === 'P2002';
  if (isPrismaConflict) {
    // DEFECT 2 fix: delete-then-retry on expired collision
    const now = new Date();
    const expiredCollision = await prisma.pendingSuperAdminRequest.findFirst({
      where: { email, expiresAt: { lte: now } },
    });
    if (expiredCollision) {
      await prisma.pendingSuperAdminRequest.delete({ where: { id: expiredCollision.id } });
      // Retry create...
    } else {
      return res.status(409).json({ error: 'A pending SUPER_ADMIN request for this email already exists' });
    }
  }
}
```

**Lines 753-760 (Approval pre-check):**
```typescript
// DEFECT 1 fix: reject if admin with same email exists
const existingAdminAtApproval = await prisma.user.findFirst({
  where: { email: request.email, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
});
if (existingAdminAtApproval) {
  return res.status(409).json({ error: 'An admin (ADMIN or SUPER_ADMIN) with this email already exists' });
}
```

### 2. src/jobs/scheduler.ts

**Lines 623-638 (New reaper function):**
```typescript
async function reapExpiredPendingSuperAdminRequests(): Promise<void> {
  const now = new Date();
  logger.info(`[pending-super-admin-reaper] Starting run at ${now.toISOString()}`);

  try {
    const deleted = await prisma.pendingSuperAdminRequest.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    if (deleted.count > 0) {
      logger.info(`[pending-super-admin-reaper] Deleted ${deleted.count} expired PendingSuperAdminRequest row(s)`);
    } else {
      logger.info('[pending-super-admin-reaper] No expired pending requests to clean up');
    }
  } catch (err) {
    logger.error('[pending-super-admin-reaper] Failed to reap expired pending requests:', err);
    throw err;
  }
}
```

**Lines 1973-1982 (Job registration):**
```typescript
cron.schedule('30 4 * * *', () => {
  reapExpiredPendingSuperAdminRequests().catch((err) => alertSchedulerFailure('pending-super-admin-reaper', err));
}, { timezone: 'Europe/Sofia' });

logger.info('[scheduler] Registered: pending-super-admin-reaper (30 4 * * *)');
```

### 3. tests/bc-admin-spec-reaudit-pending-super-hygiene.test.ts (NEW)

Comprehensive test file with 8 tests covering:

**DEFECT 1 Tests:**
1. POST /pending-super blocks initiation if email exists as ADMIN
2. POST /pending-super blocks initiation if email exists as SUPER_ADMIN
3. POST /pending-super/:id/approve blocks approval if email exists as ADMIN
4. Successful flow when no collision exists

**DEFECT 2 Tests:**
1. Re-submission fails if live pending request exists
2. Re-submission succeeds after expiry with automatic cleanup
3. Reaper job deletes only expired pending requests
4. P2002 catch on expired collision correctly handles delete-then-retry

## Spec Compliance

### §3.9 — Super-Admin Creation (Dual Approval)
✅ **FIXED:** Preventing same-email ADMIN+SUPER_ADMIN coexistence closes the collision vulnerability.

### §3.9 — 72h Expiry Window
✅ **FIXED:** Reaper job ensures expired requests don't block re-submission indefinitely.

### User.email Unique Per (email, role)
✅ **FIXED:** Guards now check both ADMIN and SUPER_ADMIN roles.

## Testing Strategy

### Unit / Integration Tests
- File: `tests/bc-admin-spec-reaudit-pending-super-hygiene.test.ts`
- Coverage: Both defects with edge cases
- Run: `npm test -- tests/bc-admin-spec-reaudit-pending-super-hygiene.test.ts`

### Runtime Verification

**Setup:**
```bash
# Start backend in test mode (suppresses startServer)
NODE_ENV=test DATABASE_URL=postgres://... npm run dev
# On alt port (not 5174, which is Agent X dashboard)
```

**Test 1: Email-role collision block**
```
1. Create admin with email x@test.local (role ADMIN)
2. POST /api/admin/admins/pending-super (email: x@test.local) → expect 409
3. Verify response error mentions "admin" or "already exists"
```

**Test 2: Expiry re-submission**
```
1. Create expired pending request for email y@test.local (expiresAt in past)
2. POST /api/admin/admins/pending-super (email: y@test.local) → expect 202
3. Verify request was created (expired row was deleted + retry succeeded)
4. Query PendingSuperAdminRequest for y@test.local → verify only new row exists
```

**Test 3: Reaper job**
```
1. Manually create expired pending request
2. Call reaper directly (for testing): await reapExpiredPendingSuperAdminRequests()
3. Query expired request → verify deleted
4. Create new request for same email → verify succeeds
```

## Files Modified

1. **src/routes/adminAdmins.routes.ts**
   - Initiation guard (lines 627-633): Check both ADMIN and SUPER_ADMIN
   - P2002 catch (lines 656-690): Delete-then-retry on expired collision
   - Approval pre-check (lines 753-760): Guard before transaction
   - Approval P2002 catch (line 812): Updated error message

2. **src/jobs/scheduler.ts**
   - New function (lines 623-638): `reapExpiredPendingSuperAdminRequests()`
   - Job registration (lines 1973-1982): Cron schedule + logger

3. **tests/bc-admin-spec-reaudit-pending-super-hygiene.test.ts** (NEW)
   - 8 comprehensive tests covering both defects

## Backward Compatibility

- Public API unchanged (same endpoints, same request/response format)
- New reaper job runs silently if no expired requests exist
- Pre-checks in approval are defensive (don't change transaction isolation or SA guard logic)
- Delete-then-retry pattern is transparent to caller (same 202 or 409 response)

## Defense-in-Depth

| Layer | Mechanism | Timing |
|-------|-----------|--------|
| Initiation guard | Check both ADMIN and SUPER_ADMIN roles | Real-time |
| Approval pre-check | Defensive check before transaction | Real-time |
| Reaper job | Delete expired rows | 4:30 AM daily |
| Delete-then-retry | Immediate cleanup on P2002 collision | On re-submission |

## Risk Assessment

**Defect 1 (Email-role collision):**
- Risk: Same email as both ADMIN and SUPER_ADMIN → privilege escalation
- Mitigation: Widened guards block coexistence at initiation and approval
- Impact: Safe, non-breaking

**Defect 2 (Expiry reaper):**
- Risk: Expired rows block re-submission indefinitely
- Mitigation: Dual approach (reaper + delete-then-retry)
- Impact: UX improvement, safe

---

**Task:** BC-ADMIN-SPEC-REAUDIT-PENDING-SUPER-HYGIENE-2  
**Spec:** §3.9, User.email unique per (email, role)  
**Status:** IMPLEMENTATION COMPLETE
