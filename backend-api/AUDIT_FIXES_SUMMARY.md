# BC-ALIGN-PARTNER Audit Round 1 Fixes Summary

## Overview
Three MEDIUM-severity issues identified in the implementation-level audit have been fixed. All fixes maintain backward compatibility and add defensive validations without changing the spec-compliant API contracts.

---

## Fix 1: Pending Changes Approval Field Validation

**File:** `src/routes/partners.routes.ts` (lines 1570-1625)

**Issue:** The POST `/:id/approve` endpoint applies `pendingChanges` directly to the partner record without re-validating which fields are permitted. If `pendingChanges` were somehow polluted with disallowed fields (e.g., `businessName`, `email`, `phone`, `features`), the approval would persist them.

**Fix:** Before applying `pendingChanges`, filter to allow ONLY the self-service public-content display fields:
- `description`
- `descriptionBg`
- `amenities`
- `openingHours`

All other fields are silently filtered out (not applied to the update).

**Implementation:**
```typescript
const ALLOWED_FIELDS = new Set(['description', 'descriptionBg', 'amenities', 'openingHours']);
const applyData: Record<string, unknown> = {};
for (const [key, value] of Object.entries(pendingChanges)) {
  if (ALLOWED_FIELDS.has(key)) {
    applyData[key] = value;
  }
}
```

**Spec Compliance:** §5.1 / §5.4 / §10.7 / §12 rules 3 & 4 (Partner Change Request flow restrictions)

**Test Coverage:** `tests/integration/bc-align-partner-audit-fixes.integration.test.ts` (tests that only allowed fields are applied, disallowed fields are filtered)

---

## Fix 2: Password Policy Validation Before Transaction

**File:** `src/services/activationLink.service.ts` (lines 180-194)

**Issue:** Password policy validation happens inside the SERIALIZABLE transaction. If the password is weak, the transaction throws an error AFTER the activation link token has already been consumed (atomically), which is wasteful and misleading.

**Fix:** Validate password policy BEFORE entering the transaction. If validation fails, throw `PASSWORD_TOO_SHORT` immediately without consuming the token. The transaction still re-validates (defensive, belt-and-braces).

**Implementation:**
```typescript
if (opts.password) {
  const policyError = validatePasswordPolicy(opts.password);
  if (policyError) {
    throw new ActivationLinkError('PASSWORD_TOO_SHORT', policyError);
  }
}
```

**Why it matters:**
- Avoids consuming tokens on bad input (saves tokens for legitimate activation attempts)
- Frontend client-side validation provides first line of defense
- Backend now fails fast and defensively without transaction overhead

**Spec Compliance:** §5.2 v1.1 (Activation link consumption with password policy enforcement)

**Test Coverage:** `tests/integration/bc-align-partner-audit-fixes.integration.test.ts` (tests that weak passwords are rejected before token consumption)

---

## Fix 3: Login Error Message Differentiation for Activation Links

**File:** `src/services/auth.service.ts` (lines 926-943)

**Issue:** When a partner with `verifiedAt=null` tries to log in, the error message is generic: "awaiting activation". This doesn't differentiate between:
1. **Issued but not consumed:** Partner received an activation link but hasn't clicked it yet → suggest checking email/spam
2. **Never issued:** Partner's account is pending activation but no link has been sent → suggest contacting support

**Fix:** Check if an unconsumed `ActivationLink` exists for the partner. Provide contextual error messages:
- **With unconsumed link:** "Активационния линк е изпратен до вашия имейл. Моля проверете спама или го потърсете отново." (Activation link sent to your email. Please check spam or request a new one.)
- **Without unconsumed link:** "Вашият партньорски акаунт очаква активиране. Моля проверете имейла си за активационен линк." (Your partner account is awaiting activation. Please check your email for an activation link.)

**Implementation:**
```typescript
const unconsumedLink = await prisma.activationLink.findFirst({
  where: {
    partnerId: partner.id,
    consumedAt: null,
    invalidatedAt: null,
  },
});

const errorMessage = unconsumedLink
  ? 'Активационния линк е изпратен до вашия имейл. Моля проверете спама или го потърсете отново.'
  : 'Вашият партньорския каунт очаква активиране. Моля проверете имейла си за активационен линк.';
throw new AppError(errorMessage, 403);
```

**UX Impact:** Partners get clearer, actionable guidance during login failures. Reduces support burden.

**Spec Compliance:** §1.6 (Activation link generated and sent, valid 72h, one-time use)

**Test Coverage:** `tests/integration/bc-align-partner-audit-fixes.integration.test.ts` (tests for both message variants, edge cases like expired-but-unconsumed links)

---

## Testing Strategy

All fixes are covered by a new integration test file: `tests/integration/bc-align-partner-audit-fixes.integration.test.ts`

**Test Cases:**
1. **Fix 1 (Field Validation):**
   - Approve only whitelisted fields
   - Filter out disallowed fields from polluted pendingChanges
   - Reject approval when no pending changes exist

2. **Fix 2 (Password Validation):**
   - Reject weak password before consuming token
   - Accept valid password and consume token
   - Fail on various weak password patterns

3. **Fix 3 (Error Messages):**
   - Return "link sent" message when unconsumed link exists
   - Return "awaiting activation" when no link exists
   - Handle edge cases (expired-but-unconsumed links, consumed links)

---

## Acceptance Criteria

All 11 acceptance criteria from the original BC-ALIGN-PARTNER task remain unaffected:
- ✅ Partner account access rules (status-based gates)
- ✅ Read-only views for Inactive partners
- ✅ Archived partners cannot log in
- ✅ Help/Change Request submission rules
- ✅ QR code visibility and state management
- ✅ Profile field edit restrictions (description, descriptionBg, amenities, openingHours only)
- ✅ Activation link validation (72h, one-time use, invalidate on resend)
- ✅ Partner visibility rule (Inactive/Archived hidden from public)
- ✅ QR auto-deactivate/reactivate on status change
- ✅ Only notification preferences and password are editable by partners
- ✅ Admin-initiated approval of pending changes

---

## Risk Assessment

**Low Risk:**
- All fixes are defensive and purely additive (no breaking changes)
- Fix 1 silently filters disallowed fields (no new error paths)
- Fix 2 validates earlier but throws the same error code
- Fix 3 improves UX with better error messages (same HTTP status, better message content)

**No Regressions:**
- Existing partner workflows unaffected (Fix 1 only filters, doesn't reject)
- Existing API contracts unchanged (all fixes internal to services)
- Test suite expanded, not modified (new test file, no test deletions)
