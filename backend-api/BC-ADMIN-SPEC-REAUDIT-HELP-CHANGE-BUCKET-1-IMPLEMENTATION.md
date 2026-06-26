# BC-ADMIN-SPEC-REAUDIT-HELP-CHANGE-BUCKET-1 — Implementation Report

## Problem Statement

**Spec §1.7 / Clash 8.2** defines four canonical request types: Support | Dispute | Change | Other.

The database supports three implementation-specific sub-types of Change:
- DATA_CHANGE
- LOCATION_CHANGE
- CONTRACT_CHANGE

**The Bug:** When an admin filters the help ticket list by the canonical "Change" type, tickets stored as DATA_CHANGE, LOCATION_CHANGE, or CONTRACT_CHANGE were NOT returned. The Change bucket was fragmented across four different database enum values, and the API leaked non-canonical type tokens to the frontend.

## Solution Implemented

Approach (a) — Create canonical request type helpers mirroring the existing `toCanonicalRequestStatus` pattern.

### Changes Made

#### 1. Added Canonical Type Helpers (ticketEmail.service.ts)

**File:** `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketEmail.service.ts`

Added two new exports after the canonical status helpers:

```typescript
/**
 * M7 (Spec §1.7 / Clash 8.2) — canonical `request_type` mapping.
 */
export type CanonicalRequestType = 'Support' | 'Dispute' | 'Change' | 'Other';

export function toCanonicalRequestType(
  requestType: string | null | undefined
): CanonicalRequestType {
  switch (requestType) {
    case 'SUPPORT':
      return 'Support';
    case 'DISPUTE':
      return 'Dispute';
    case 'CHANGE':
    case 'DATA_CHANGE':
    case 'LOCATION_CHANGE':
    case 'CONTRACT_CHANGE':
      return 'Change';  // All Change variants map to canonical
    case 'OTHER':
      return 'Other';
    default:
      return 'Support';  // Safe default
  }
}

export function withCanonicalRequestType<T extends { requestType: string }>(
  ticket: T,
): T & { canonicalRequestType: CanonicalRequestType } {
  return { ...ticket, canonicalRequestType: toCanonicalRequestType(ticket.requestType) };
}
```

#### 2. Updated Imports (adminHelp.routes.ts)

**File:** `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminHelp.routes.ts`

Added `withCanonicalRequestType` to the import from `ticketEmail.service`:

```typescript
import {
  buildTicketSubject,
  buildTicketHeaders,
  buildPlusReplyTo,
  computeShortRef,
  withCanonicalRequestStatus,
  withCanonicalRequestType,  // NEW
} from '../services/ticketEmail.service';
```

#### 3. Fixed GET /api/admin/help Filter (Line ~270)

When filtering by canonical CHANGE, expand to include all *_CHANGE sub-types:

```typescript
if (req.query.requestType && typeof req.query.requestType === 'string') {
  if (!ADMIN_VALID_REQUEST_TYPES.includes(req.query.requestType)) {
    return res.status(400).json({ error: 'Невалиден тип заявка' });
  }
  // M7: When filtering by canonical CHANGE, include all *_CHANGE sub-types
  if (req.query.requestType === 'CHANGE') {
    where.requestType = {
      in: ['CHANGE', 'DATA_CHANGE', 'LOCATION_CHANGE', 'CONTRACT_CHANGE'] as TicketRequestType[]
    };
  } else {
    where.requestType = req.query.requestType as TicketRequestType;
  }
}
```

#### 4. Updated GET /api/admin/help Response (Line ~305)

Apply `withCanonicalRequestType` to all response tickets:

```typescript
res.json({
  tickets: tickets.map(t => withCanonicalRequestType(withCanonicalRequestStatus(t))),
  total,
  page: pageNum,
  limit: take,
});
```

#### 5. Fixed GET /api/admin/help/mine Filter (Line ~345)

Apply the same CHANGE expansion logic as the main list endpoint:

```typescript
if (req.query.requestType && typeof req.query.requestType === 'string') {
  if (!ADMIN_VALID_REQUEST_TYPES.includes(req.query.requestType)) {
    return res.status(400).json({ error: 'Невалиден тип заявка' });
  }
  // M7: When filtering by canonical CHANGE, include all *_CHANGE sub-types
  if (req.query.requestType === 'CHANGE') {
    conditions.push({
      requestType: {
        in: ['CHANGE', 'DATA_CHANGE', 'LOCATION_CHANGE', 'CONTRACT_CHANGE'] as TicketRequestType[]
      }
    });
  } else {
    conditions.push({ requestType: req.query.requestType as TicketRequestType });
  }
}
```

#### 6. Updated GET /api/admin/help/mine Response (Line ~371)

Apply `withCanonicalRequestType` to all response tickets:

```typescript
res.json({
  tickets: tickets.map(t => withCanonicalRequestType(withCanonicalRequestStatus(t))),
  total,
  page: pageNum,
  limit: take,
});
```

#### 7. Updated GET /api/admin/help/:id Response (Line ~424)

Apply `withCanonicalRequestType` to the detail response:

```typescript
res.json({
  ticket: {
    ...withCanonicalRequestType(withCanonicalRequestStatus(ticket)),
    bounceCount
  }
});
```

### Test Coverage

**File:** `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/admin-help-change-bucket.test.ts`

Created comprehensive integration tests covering:

1. **Canonical CHANGE filter returns all *_CHANGE sub-types** — Verifies filtering by `?requestType=CHANGE` returns tickets stored as CHANGE, DATA_CHANGE, LOCATION_CHANGE, and CONTRACT_CHANGE.

2. **Response includes both raw and canonical types** — Confirms each ticket has both `requestType` (raw enum) and `canonicalRequestType` (canonical value).

3. **Direct sub-type filtering still works** — Verifies that filtering by `?requestType=DATA_CHANGE` returns only DATA_CHANGE tickets, not all Change variants.

4. **Works on both /api/admin/help and /api/admin/help/mine** — Covers both the full-list and scoped endpoints.

5. **Other request types unaffected** — Ensures SUPPORT, DISPUTE, and OTHER still filter correctly and map to canonical values.

## Acceptance Criteria

- ✅ Helper functions created in ticketEmail.service.ts
  - `toCanonicalRequestType()` — Normalizes all *_CHANGE variants to canonical CHANGE
  - `withCanonicalRequestType()` — Attaches canonical type to ticket objects
- ✅ Both GET endpoints (lines ~270, ~345) updated with CHANGE expansion logic
- ✅ All three GET endpoints updated to return both raw and canonical request types
- ✅ Comprehensive test suite covers fragmentation fix and edge cases
- ✅ Code compiles without type errors (integration test suite validates TypeScript)

## API Response Examples

### Before (Broken)

When filtering by `?requestType=CHANGE`, only canonical CHANGE tickets were returned:
```json
{
  "tickets": [
    {
      "id": "...",
      "requestType": "CHANGE",
      "status": "OPEN"
    }
  ],
  "total": 1
}
```

DATA_CHANGE, LOCATION_CHANGE, CONTRACT_CHANGE tickets were NOT returned.

### After (Fixed)

When filtering by `?requestType=CHANGE`, all Change variants are returned:
```json
{
  "tickets": [
    {
      "id": "...",
      "requestType": "CHANGE",
      "canonicalRequestType": "Change",
      "status": "OPEN"
    },
    {
      "id": "...",
      "requestType": "DATA_CHANGE",
      "canonicalRequestType": "Change",
      "status": "OPEN"
    },
    {
      "id": "...",
      "requestType": "LOCATION_CHANGE",
      "canonicalRequestType": "Change",
      "status": "OPEN"
    },
    {
      "id": "...",
      "requestType": "CONTRACT_CHANGE",
      "canonicalRequestType": "Change",
      "status": "OPEN"
    }
  ],
  "total": 4
}
```

## Runtime Verification Steps

1. Create help tickets with each *_CHANGE sub-type via admin UI
2. Filter the help list by "Change" (canonical type)
3. Verify all four ticket types appear in the list
4. Check that each ticket in the response includes both `requestType` and `canonicalRequestType` fields
5. Verify direct sub-type filtering (e.g., `?requestType=DATA_CHANGE`) still returns only that sub-type

## Files Modified

1. `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketEmail.service.ts`
   - Added canonical type mapping functions

2. `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminHelp.routes.ts`
   - Updated import to include `withCanonicalRequestType`
   - Fixed filter logic for GET /api/admin/help
   - Fixed filter logic for GET /api/admin/help/mine
   - Updated all three GET endpoint responses to include canonical type

3. `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/admin-help-change-bucket.test.ts` (NEW)
   - Comprehensive integration test suite

## Spec References

- **Spec §1.7** — Request Type enum definition (Support | Dispute | Change | Other)
- **Clash 8.2** — Change bucket fragmentation issue
- **Spec §11.3** — Help ticket filtering by request type

## Implementation Pattern

This fix follows the existing `toCanonicalRequestStatus` / `withCanonicalRequestStatus` pattern established for request status normalization, providing consistency with the codebase's approach to mapping internal enums to canonical spec values.
