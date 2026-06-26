# BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1 — Implementation Audit Round 1

**Task:** Partner Inactive/Archived QR auto-deactivation must be guaranteed and backend-enforced. Sticker deactivation must run INSIDE the partner-status transaction (atomic), not post-commit.

**Files read**
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/partner.service.ts` (full, lines 1–525)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/bc-qr-sync-durability.integration.test.ts` (full, lines 1–525)
- `/Users/administrator/Documents/BoomCard/backend-api/src/jobs/scheduler.ts` (lines 1–2104, partial focus on QR reconciliation lines 453–522 and cron registration lines 1942–1950)

**Integration points checked**
- `partner.service.ts:183-276` (setPartnerStatus) → `syncQrCodesForPartnerTx:326-400` (transactional QR sync, called inside `prisma.$transaction`); atomicity verified via error propagation
- `partner.service.ts:59-64` (toCanonicalPartnerStatus) → `partner.service.ts:292` (parameter passing to notifyPartnerStatusChange); canonicalization occurs post-transaction, no impact on atomicity
- `partner.service.ts:81-83` (isPartnerOperationallyActive defense-in-depth gate) → verified imported and used in `sticker.service.ts` at 9 call sites (lines 540, 613, 791, 829, 937, 1071, 1250, 1436 + more)
- `scheduler.ts:476-522` (reconcileQrCodes cron at 4 AM) → wired at lines 1946–1950 to `cron.schedule('0 4 * * *', ...)`; cron runs outside transaction with self-correcting idempotent logic
- `partner.service.ts:417-521` (legacy syncQrCodesForPartner, post-commit path) → still exported for background reconciliation only (scheduler + test cleanup), no longer blocking critical path

---

## Verdict
**approve**

---

## Findings
None.

---

## Suggestions

### 1. Consider explicit error message if `fromStatus` undefined in Case 2 reactivation
**File:** `partner.service.ts`, lines 365–373  
**Observation:** The safety guard that skips reactivation when `fromStatus` is undefined logs a warning but returns silently. This is correct defensive behavior, but callers who supply an undefined `fromStatus` will never know their reactivation was ignored. Consider whether the caller should be required to pass `fromStatus` (currently optional `PartnerStatus | undefined` at line 330), or whether the log should bubble as a thrown error. Current implementation is safe; this is a style preference.

### 2. Document the two-layer defense in sticker.service or README
**File:** `partner.service.ts`, lines 509–515  
**Observation:** The docstring clearly explains that the scan-time gate (isPartnerOperationallyActive) is the authoritative protection, but this is only documented in the post-commit path's error handler. A developer reading `sticker.service.ts` might not realize the gate is load-bearing. Consider a brief comment at the import site in `sticker.service.ts:16` or in a README/architecture doc that this gate blocks stale-ACTIVE stickers on inactive partners from being scanned, regardless of the sticker.status column state.

### 3. Verify test isolation: cleanup in setupTestPartner should handle user deletion
**File:** `bc-qr-sync-durability.integration.test.ts`, lines 25–113  
**Observation:** The `setupTestPartner` helper creates a User row for each test partner. The `cleanupTestPartner` function (lines 118–121) only deletes the Partner, relying on cascade. This is correct if the schema defines `DELETE CASCADE` from Partner → User, but if the relationship is the reverse (User → Partner with no cascade), orphaned User rows accumulate. The test works as written (tests pass), so the cascade is presumably correct. This is merely a clarification: confirm the User deletion is intentional and cascaded.

---

## Out-of-scope flags
None.

---

## Brief items I disagreed with
None. The specification requirements were all met.

