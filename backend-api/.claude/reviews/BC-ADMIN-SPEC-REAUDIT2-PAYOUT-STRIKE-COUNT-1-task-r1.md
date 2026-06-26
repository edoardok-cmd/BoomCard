# Task-Level Audit: BC-ADMIN-SPEC-REAUDIT2-PAYOUT-STRIKE-COUNT-1
Round: task-r1 | Date: 2026-06-27

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminPayouts.routes.ts` lines 1–1054 (complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/wallet.service.ts` lines 1–1529 (complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/payoutFailureReason.ts` lines 1–63 (complete)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/unit/walletPayoutFlow.test.ts` lines 1–618 (complete)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/unit/adminPayoutsBulkApprove.test.ts` lines 1–226 (complete)

## Integration points checked

- `adminPayouts.routes.ts:362–370 → wallet.service.ts (strike filter)`: bulk-approve no-IBAN hold writes `metadata.noIbanHold: true`, merging existing metadata. The strike filter in `executePayoutTransfer` (wallet.service.ts:1118–1135) checks `meta.noIbanHold === true` to exclude it. Verified identical match.
- `adminPayouts.routes.ts:459–467 → wallet.service.ts (strike filter)`: single-approve no-IBAN hold uses identical stamp logic. Verified field name and JSON merge pattern matches what the strike filter reads.
- `adminPayouts.routes.ts:805–822 (/:id/fail) → wallet.service.ts:1118–1135 (executePayoutTransfer)`: both strike-count filter blocks use identical three-part exclusion: `meta.manualHold === true`, `meta.noIbanHold === true`, and `row.description?.includes('липсва банкова сметка')`. Confirmed string match is exact with what the no-IBAN hold paths write at lines 368 and 464.
- `wallet.service.ts:59–88 (maskUserFacingPayoutStatus) → wallet.service.ts:1452–1488 (getTransactions)`: `getTransactions` calls `findMany` without a `select` restriction, so all columns including `metadata` are returned. The type bound `T extends { ...; metadata?: string | null }` is satisfied by the full Prisma row type. No type error produced by `tsc --noEmit`.
- `wallet.service.ts:95–106 (maskUserFacingPayoutStatuses) → callers`: grep confirms this exported function has no external callers. Only the internal `maskUserFacingPayoutStatus` calls it indirectly. It is a dead export but not a bug.
- `src/utils/payoutFailureReason.ts → adminPayouts.routes.ts:14,944 + wallet.service.ts:15,1246`: both paths import `reasonIndicatesIbanProblem` from the same utility file — confirmed single source of truth for IBAN-vs-generic failure classification.

## Runtime checks

### Target test suite (required by brief)

```
cd /Users/administrator/Documents/BoomCard/backend-api
PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$PATH" \
  npx jest --no-coverage --testPathPattern="tests/unit/adminPayouts|tests/unit/walletPayout"
```

Result: **27 passed, 0 failed** (3 suites: adminPayoutsBulkApprove, walletPayoutFlow, adminPayoutsResetStuck).

Specific tests covering the task's core correctness:
- `F-014 no-IBAN RISK_HOLD does not count as a strike — genuine first failure takes first-failure branch (spec §3.7)` — PASSED
- `F-014 legacy no-IBAN RISK_HOLD (no metadata flag, pre-fix description) does not count as a strike` — PASSED
- `no-IBAN hold preserves pre-existing metadata fields when stamping noIbanHold=true` — PASSED
- `counts approved separately from alreadyProcessed; only newly-approved rows get notified` (verifies `noIbanHold: true` written to bulk-approve hold) — PASSED

### Broader unit suite regression check

```
npx jest --no-coverage --testPathPattern="unit" --forceExit
```

Result: 25 suites failed, 58 passed. Failing suites are entirely pre-existing (auth guard tests failing due to `prisma.user` undefined — mock setup issue predating this change; integration tests failing due to app lifecycle). None of the failing suites involve `adminPayouts.routes.ts` or `wallet.service.ts`.

### TypeScript type-check

```
npx tsc --noEmit
```

Result: Errors in `adminAdmins.routes.ts` (skipAudit property), `adminTransactions.routes.ts` (auditAction), and `auth.service.ts` (iat property) — all pre-existing, none in the changed files. Zero new type errors introduced.

### Independent spec walk (Spec §3.2 / §3.7)

**Golden flow A — user with no-IBAN hold, then genuine first Paysera failure:**
1. No-IBAN hold written → `metadata.noIbanHold: true` + `status: RISK_HOLD` + canonical Bulgarian description — confirmed at lines 367–370 (bulk) and 462–465 (single).
2. User adds IBAN, hold resolved (admin /reject or /release), new payout enters queue as PENDING.
3. Admin approves → `executePayoutTransfer` fires Paysera → Paysera rejects.
4. Strike filter reads all FAILED/RISK_HOLD withdrawals for this wallet, excludes the prior `noIbanHold` row → `genuineFailures.length === 0` → first-failure branch taken.
5. Balance restored, FAILED written, ADJUSTMENT credit written, user notified. NO risk escalation.
6. Spec §3.2 path: correct.

**Golden flow B — user's genuine second Paysera failure:**
1. Prior FAILED row (from first genuine failure) exists on wallet.
2. New payout → Paysera fails.
3. Strike filter counts that FAILED row (no exclusion flags) → `genuineFailures.length >= 1` → second-failure branch.
4. RISK_HOLD written with `escalatedSecondFailure: true`, balance NOT restored, riskScore floored at 51, admin ops notified. User NOT notified.
5. Spec §3.7 path: correct.

**Golden flow C — admin manual `/fail` on PROCESSING payout with a prior no-IBAN hold:**
Same exclusion logic at `adminPayouts.routes.ts:816–821` inside a Serializable transaction — identical three-part filter. Confirmed at code level.

**User-facing status masking (spec §3.7 "Sent to payout"):**
- `noIbanHold === true` RISK_HOLD → masked to PENDING (not PROCESSING). Correct per spec — user is prompted to add IBAN, should NOT see "Sent to payout".
- `escalatedSecondFailure === true` RISK_HOLD (or any other RISK_HOLD without noIbanHold) → masked to PROCESSING ("Sent to payout"). Correct per spec §3.7.

## Verdict

approve

## Findings

None.

## Suggestions

- `maskUserFacingPayoutStatus` at line 68 calls `JSON.parse(tx.metadata)` without a try/catch. If metadata were ever malformed in the database, this would throw in the user-facing `getTransactions` endpoint. This is a pre-existing pattern consistent with the broader codebase and not introduced by this task. Consider a defensive wrapper in a future hardening pass (similar to how `readLockedCashbackIds` at line 867 wraps its parse in try/catch).
- `maskUserFacingPayoutStatuses` (plural) is exported but has no external callers (confirmed by grep). It can be made `/* @internal */` or its export removed if the API surface is being trimmed.

## Out-of-scope flags

None.

## Brief items I disagreed with

None.
