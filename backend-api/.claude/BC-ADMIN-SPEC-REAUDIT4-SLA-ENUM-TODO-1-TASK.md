# BC-ADMIN-SPEC-REAUDIT4-SLA-ENUM-TODO-1: Enum Naming Cleanup

## Overview

Clean up Bulgarian enum name references in the SLA and PartnerRequestStatus implementation. After the Prisma schema's `@map` declarations were finalized, the code still contains hardcoded Bulgarian names (ODOBRENA, OTKAZANA) which should be replaced with the proper English enum constants (APPROVED, REJECTED).

## Root Cause

The Prisma schema defines:
```prisma
enum PartnerRequestStatus {
  APPROVED      @map("ODOBRENA")
  REJECTED      @map("OTKAZANA")
  ...
}
```

The `@map` is correct for database storage, but the TypeScript code should use `PartnerRequestStatus.APPROVED` and `PartnerRequestStatus.REJECTED` instead of hardcoded string references to "ODOBRENA" and "OTKAZANA".

## Files Requiring Changes

### 1. `src/routes/adminPartners.routes.ts`
- Line with status mapping: `'ODOBRENA': PartnerRequestStatus.APPROVED` → Use enum directly
- Multiple comments referencing "ODOBRENA"
- Error message: "...ODOBRENA but operational status..."

### 2. `src/routes/partners.routes.ts`
- Comment: "Partners already in ONBOARDING or ODOBRENA"

### 3. `src/jobs/scheduler.ts`
- Comment explaining @map'd DB storage strings (ODOBRENA/OTKAZANA)

### 4. `src/services/partnerSla.helper.ts`
- **TODO comment** on line 62: "after `prisma generate` rename ODOBRENA→APPROVED and OTKAZANA→REJECTED"
- Comment block explaining enum handling

## Acceptance Criteria

- [ ] Remove hardcoded Bulgarian string references from TypeScript code
- [ ] Replace with proper `PartnerRequestStatus` enum constants
- [ ] Update comments to reference enum constants instead of raw strings
- [ ] Verify schema.prisma @map declarations remain unchanged (correct for DB)
- [ ] No functional changes — refactoring only
- [ ] All tests pass
- [ ] Code compiles without errors

## Notes

- The database storage (@map) should NOT be changed — the Bulgarian names remain in the DB for compatibility
- This is a pure refactoring task — zero behavioral changes
- The Prisma schema already defines the correct enum names; we just need to use them consistently in TypeScript
