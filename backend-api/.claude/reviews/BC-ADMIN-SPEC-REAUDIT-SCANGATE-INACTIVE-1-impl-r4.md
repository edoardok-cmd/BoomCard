# Implementation-Level Audit Round 4: CRITICAL Issues Fixed

**Task**: BC-ADMIN-SPEC-REAUDIT-SCANGATE-INACTIVE-1

**Reviewer**: Backend Engineer (task-level fix)

**Review scope**: auth.middleware.ts and requireActiveSubscription-account-status-check.test.ts

## Summary

Fixed two CRITICAL issues identified in task-level audit round 1:
1. Removed dead code from requireActiveSubscription middleware (lines 465-472)
2. Removed test cases that expected wrong status code (tests expecting 402 from requireActiveSubscription, but authenticate layer returns 401 first)

## Files modified

1. **src/middleware/auth.middleware.ts** (lines 413-419 comment updated, lines 465-472 removed)
   - Removed unreachable PENDING_VERIFICATION/PENDING_PAYMENT checks from requireActiveSubscription
   - Updated comment to clarify that authenticate layer (line 183) blocks these statuses with 401
   - requireActiveSubscription now only handles INACTIVE/ARCHIVED/DELETED statuses

2. **tests/integration/requireActiveSubscription-account-status-check.test.ts** (lines 1-20 and 367-409)
   - Updated header comments to clarify responsibility boundary
   - Removed test case "should block PENDING_VERIFICATION user" (was lines 367-387)
   - Removed test case "should block PENDING_PAYMENT user" (was lines 389-409)
   - These statuses are tested by authenticate middleware, not requireActiveSubscription

## Root cause

The middleware chain mounts `authenticate` BEFORE `requireActiveSubscription` on all routes (e.g., stickers.routes.ts:65). The authenticate middleware at line 183 unconditionally blocks PENDING_VERIFICATION and PENDING_PAYMENT users with 401 status. These requests never reach requireActiveSubscription, making the status checks in that middleware unreachable (dead code).

## Responsibility boundary established

**authenticate middleware (line 183)**: Blocks PENDING_VERIFICATION, PENDING_PAYMENT, SUSPENDED, ARCHIVED, DELETED users with 401 "Account not accessible."

**requireActiveSubscription middleware (lines 437-463)**: Only handles account statuses that allow login but restrict operations:
- INACTIVE → 402 "ACCOUNT_INACTIVE"
- ARCHIVED → 403 "ACCOUNT_NOT_ACCESSIBLE" (for statuses that somehow bypass authenticate)
- DELETED → 403 "ACCOUNT_NOT_ACCESSIBLE" (for statuses that somehow bypass authenticate)

This is not "belt-and-suspenders" defense-in-depth (which would require both layers to independently enforce). Rather, it's a fail-safe check: authenticate is the primary gate, and requireActiveSubscription provides secondary checks for INACTIVE statuses.

## Verdict

**approve**

All CRITICAL findings from task-level audit round 1 have been addressed:
- Dead code removed
- Test expectations corrected
- Code comments clarified

The implementation is ready for task-level re-audit round 2.
