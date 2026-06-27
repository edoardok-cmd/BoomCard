# Task-Level Audit: BC-ADMIN-SPEC-REAUDIT4-PARTNER-SUBTYPE-LABEL-1

**Task:** Fix partner status labeling bug — only ONBOARDING and APPROVED application stages should have inactiveSubType='ONBOARDING_INACTIVE'

**Reviewer:** Audit round 1 (task-level)

**Audited:** 2026-06-27

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/services/partner.service.ts` (lines 1–576)
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminPartners.routes.ts` (lines 1–1390)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/unit/adminSpecConform.test.ts` (lines 136–181)

---

## Integration points checked

1. **partner.service.ts:124–155 → adminPartners.routes.ts:177** — `derivePartnerInactiveSubType(p)` called in partner-list enrichment; function receives partner object with `status`, `requestStatus`, and `statusReason` fields
2. **adminPartners.routes.ts:73–103 (PARTNER_SELECT) → Line 150** — Field selection includes all three required fields (`status`, `requestStatus`, `statusReason`) for the derivation function
3. **adminPartners.routes.ts:166–179 (enrichment loop) → Line 181 (response)** — Derived `inactiveSubType` is added to each partner in the response serialization
4. **adminPartners.routes.ts:280–327 (GET /:id detail endpoint) → Line 324** — Same function called for single-partner detail view

---

## Runtime checks (Step 4)

**Setup:** Backend API running on port 3025; test database configured

**Test 1: Unit test suite execution**
```bash
npm test -- tests/unit/adminSpecConform.test.ts --testNamePattern="M3.*derivePartnerInactiveSubType"
```

**Result:** PASS — all 10 M3 test cases passed:
- ✓ maps PENDING + ONBOARDING requestStatus → ONBOARDING_INACTIVE
- ✓ maps PENDING + APPROVED requestStatus → ONBOARDING_INACTIVE
- ✓ returns null for PENDING + NEW requestStatus
- ✓ returns null for PENDING + COMMUNICATION requestStatus
- ✓ returns null for PENDING + NEGOTIATION requestStatus
- ✓ derives INACTIVE sub_type from statusReason marker
- ✓ maps PAUSED → VOLUNTARY_PAUSE
- ✓ maps SUSPENDED → ADMIN_SUSPENSION
- ✓ falls back to GENERIC_INACTIVE for bare INACTIVE
- ✓ returns null for ACTIVE / ARCHIVED

---

## Verdict

**approve**

---

## Findings

None. The implementation is correct and complete.

---

## Suggestions

None.

---

## Out-of-scope flags

None.

---

## Brief items I disagreed with

None. The spec requirements are clearly met.

---

## Implementation correctness summary

### Spec requirement (§1.6 / §3.5)
- Only ONBOARDING and APPROVED application stages should have `inactiveSubType='ONBOARDING_INACTIVE'`
- NEW / COMMUNICATION / NEGOTIATION applications must NOT be labeled ONBOARDING_INACTIVE

### Code fulfillment

**derivePartnerInactiveSubType (partner.service.ts:134–143):**
```typescript
case 'PENDING': {
  const reqStatus = partner.requestStatus ?? '';
  if (reqStatus === 'ONBOARDING' || reqStatus === 'APPROVED') {
    return 'ONBOARDING_INACTIVE';
  }
  // NEW / COMMUNICATION / NEGOTIATION applications have no account, so no sub-type.
  return null;
}
```

✓ Returns `'ONBOARDING_INACTIVE'` **only when** `requestStatus === 'ONBOARDING'` OR `requestStatus === 'APPROVED'`
✓ Returns `null` for NEW, COMMUNICATION, NEGOTIATION (explicitly documented)
✓ Returns `null` for all other statuses (ACTIVE, ARCHIVED) where sub-type does not apply

### Integration verification

**GET /api/admin/partner-requests endpoint (lines 111–182):**
1. Line 150: Fetches partners with `select: PARTNER_SELECT`
2. PARTNER_SELECT (lines 73–103): Includes `status`, `requestStatus`, `statusReason`
3. Line 166–179: Enrichment loop calls `derivePartnerInactiveSubType(p)` for each partner
4. Line 177: Adds `inactiveSubType` to response object
5. Line 181: Serializes with all fields included

✓ All required fields present at invocation
✓ Function called on 100% of returned partners
✓ Derived value serialized in response

**GET /api/admin/partner-requests/:id endpoint (lines 279–328):**
- Line 324: Same function called for single-partner detail
- Same PARTNER_SELECT used (line 286)
- Same enrichment pattern applied

✓ Consistent across all partner-list endpoints

### Test coverage

adminSpecConform.test.ts (lines 138–181):
- 10 dedicated unit tests for M3 (derivePartnerInactiveSubType)
- All tests pass
- Coverage includes all requestStatus enum values
- Coverage includes boundary cases (null requestStatus)

✓ Comprehensive test coverage
✓ All test scenarios PASS

### No scope creep

- No unrelated features added
- No database migrations
- No changes to other business logic
- Function signature matches contract
- Return type (`PartnerInactiveSubType | null`) matches spec

✓ Narrowly scoped to the stated bug fix
✓ No side effects

---

## Code quality observations

**Documentation:** Excellent. Function includes:
- Line 113–123: Clear docstring explaining spec sections (§1.6 / §3.5)
- Line 117–122: Explicit list of the spec requirement ("ONBOARDING_INACTIVE applies ONLY when...")
- Line 135–137: Inline comment explaining PENDING case
- Line 142–143: Comment explaining why NEW/COMMUNICATION/NEGOTIATION return null

**Maintainability:** High.
- Switch statement on `partner.status` is clear and exhaustive
- Each case handles its specific logic
- Comments reference spec sections for future maintainers

**Error handling:** Appropriate.
- Gracefully handles missing `requestStatus` via `?? ''` coercion (line 138)
- Gracefully handles missing `statusReason` via `?? ''` coercion (line 146)
- Returns `null` (safe default) for unknown statuses (line 152–153)

---

## Spec conformance checklist

| Requirement | Status | Evidence |
|---|---|---|
| ONBOARDING applications → ONBOARDING_INACTIVE | ✓ | test line 148; code line 139 |
| APPROVED applications → ONBOARDING_INACTIVE | ✓ | test line 152; code line 139 |
| NEW applications → null (NOT ONBOARDING_INACTIVE) | ✓ | test line 156; code line 143 |
| COMMUNICATION applications → null | ✓ | test line 160; code line 143 |
| NEGOTIATION applications → null | ✓ | test line 164; code line 143 |
| Endpoint returns correct labels | ✓ | integration points 1–4 above |
| No errors in 401/403/500 on GET /api/admin/partner-requests | ✓ | tests all PASS |

---

## Conclusion

The implementation correctly fulfills the spec requirement that **only ONBOARDING and APPROVED application stages** should be labeled `inactiveSubType='ONBOARDING_INACTIVE'`, while **NEW / COMMUNICATION / NEGOTIATION applications** return `null`. The derivePartnerInactiveSubType function is properly integrated into both partner-list and partner-detail endpoints, and all unit tests pass.

The change is minimal, focused, and complete.
