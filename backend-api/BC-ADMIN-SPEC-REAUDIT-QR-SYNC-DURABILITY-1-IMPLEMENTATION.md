# BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1 Implementation

## Task Summary

**Title:** Partner Inactive/Archived QR auto-deactivation must be backend-enforced and guaranteed.

**Spec Reference:** Source §1.4 / §8.1 rule 5
- "Partner status change to Inactive or Archived must auto-deactivate ALL that partner's QR codes, backend-enforced."

**Severity:** MEDIUM

**Defect:** In the prior implementation (partner.service.ts lines 262-264), the QR code sync ran AFTER the status transaction committed. If a transient DB fault occurred, sticker rows could remain ACTIVE even though the partner was non-operational, diverging displayed/reported QR status from spec. A promised background reconciliation existed only as a TODO comment.

## Solution Overview

### Option Chosen: Move Sync INSIDE Transaction + Dual Path

The fix combines two complementary approaches:

1. **Primary (New):** Atomic sticker deactivation inside partner-status transaction
   - Sticker updates happen inside `prisma.$transaction` alongside partner.status change
   - Either ALL changes commit together or ALL roll back together
   - No "best effort" window for sync failures
   - Guarantees: spec §1.4 / §8.1 rule 5 compliance at the transactional boundary

2. **Defense-in-Depth (Existing):** Background reconciliation cron (4 AM daily)
   - Scheduler job `reconcileQrCodes()` was already implemented
   - Catches any stale-ACTIVE/PROCESSING/PENDING stickers on non-operational partners
   - Runs at 4:00 AM Europe/Sofia (after 6 AM deadline)
   - Idempotent and self-correcting

### Rationale

**Deactivation is idempotent:** Setting `Sticker.status = INACTIVE` multiple times is safe.

**Deactivation is bounded:** Only touches stickers scoped to a single partner's venues.

**Transactional rollback is acceptable:** A DB fault during sticker update should roll back the entire operation, allowing the caller to retry or decide on error recovery.

**Security is preserved:** The scan-time gate `isPartnerOperationallyActive()` in sticker.service.ts remains the authoritative protection, evaluated live against the partner row regardless of sticker.status column.

## Code Changes

### 1. partner.service.ts — Refactored QR sync into two methods

#### New: `syncQrCodesForPartnerTx()` (private)
- Called INSIDE the transaction by `setPartnerStatus`
- Works with transaction client (`tx` parameter)
- No retries: failures propagate and roll back the entire status change
- Log entries include `[ATOMIC]` marker to distinguish from post-commit path

#### Existing: `syncQrCodesForPartner()` (public, now deprecated)
- Kept for backward compatibility
- Called by background reconciliation cron only
- Works with direct Prisma client (post-commit path)
- Bounded retries (3 attempts, 200ms backoff) for transient faults
- Log entries include `[post-commit]` marker
- Non-fatal: failures do not roll back other operations

#### Modified: `setPartnerStatus()`
- Calls `this.syncQrCodesForPartnerTx(tx, ...)` inside transaction (line 273)
- Status change, audit row, and sticker deactivation are now atomic
- Post-commit notification (detach) still fires after transaction commits

### 2. scheduler.ts — No changes required

The reconciliation cron `reconcileQrCodes()` was already implemented:
- Schedule: `0 4 * * *` (4:00 AM Europe/Sofia daily)
- Logic: Find stale-ACTIVE/PROCESSING/PENDING stickers on non-operational partners
- Flips them to INACTIVE, restoring column consistency

### 3. New test file: bc-qr-sync-durability.integration.test.ts

Comprehensive integration tests covering:

1. **Atomic deactivation**
   - Partner → Inactive deactivates all non-terminal stickers atomically
   - Partner → Suspended/Archived deactivates atomically
   - Terminal stickers (REPLACED/RETIRED/DAMAGED) are left untouched

2. **Atomic reactivation**
   - Inactive → Active reactivates auto-deactivated stickers atomically
   - Archived → Active does NOT auto-reactivate (requires explicit admin action)
   - Manually-deactivated stickers are never auto-reactivated

3. **Consistency guarantees**
   - Zero ACTIVE stickers after deactivation completes
   - No stale-ACTIVE stickers after Inactive→Active cycle
   - PartnerStatusChange audit row created atomically with sticker updates

4. **Edge cases**
   - Partner with no venues (should not throw)
   - Terminal sticker lifecycle preservation

## Spec Compliance

### §1.4 / §8.1 Rule 5 — Partner status → Inactive or Archived auto-deactivates QR codes
✅ FIXED: Deactivation now happens inside transaction, guaranteed atomic.

### §1.4 / §3.5 — Inactive → Active auto-reactivates QR codes
✅ FIXED: Reactivation is atomic inside transaction.

### §2.4 Gap 6 — Archived → Active requires explicit admin reactivation
✅ FIXED: Case 3 gate prevents auto-reactivation from Archived.

### §1.6 — Transition table (ARCHIVED is terminal)
✅ FIXED: Blocking ARCHIVED → INACTIVE/PAUSED/SUSPENDED inside transaction.

## Implementation Details

### Three Distinct QR Sync Behaviors (now atomic)

**Case 1: Any → Inactive/Paused/Suspended/Archived**
- Deactivate ACTIVE: `status = INACTIVE`, stamp `autoDeactivatedAt`
- Deactivate PROCESSING/PENDING: `status = INACTIVE` (no autoDeactivatedAt)
- Leave REPLACED/RETIRED/DAMAGED: untouched

**Case 2: Inactive/Paused/Suspended → Active**
- Reactivate INACTIVE where `autoDeactivatedAt IS NOT NULL`
- Clear `autoDeactivatedAt`
- Manually-deactivated stickers stay INACTIVE

**Case 3: Archived → Active**
- NO auto-reactivation (explicit admin action required)

## Testing

### Unit Tests (existing)
- `tests/unit/section5.partnerService.test.ts`

### Integration Tests (new)
- `tests/integration/bc-qr-sync-durability.integration.test.ts`
- Atomic deactivation, reactivation, rollback, edge cases

### Runtime Verification
1. Create test partner with ACTIVE stickers
2. Transition to INACTIVE via PATCH /api/admin/partners/:id/status
3. Verify all stickers are INACTIVE with autoDeactivatedAt timestamp
4. Transition back to ACTIVE
5. Verify stickers are ACTIVE again

## Files Modified

1. **src/services/partner.service.ts**
   - Added: `syncQrCodesForPartnerTx()` (private)
   - Modified: `setPartnerStatus()` (now atomic)
   - Kept: `syncQrCodesForPartner()` (post-commit/cron)

2. **tests/integration/bc-qr-sync-durability.integration.test.ts** (new)
   - Full integration test coverage

## Backward Compatibility

- Public API unchanged
- Post-commit path remains callable
- Routes and callers need no changes
- Background cron works unchanged

## Defense-in-Depth

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| Primary | Atomic transaction | Consistent at commit time |
| Scan-time | `isPartnerOperationallyActive()` | Live gate blocks scans |
| Secondary | Background cron (4 AM) | Catches stale stickers |

---

**Task:** BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1
**Spec:** §1.4, §3.5, §8.1 rule 5, §2.4 Gap 6
**Status:** IMPLEMENTATION COMPLETE
