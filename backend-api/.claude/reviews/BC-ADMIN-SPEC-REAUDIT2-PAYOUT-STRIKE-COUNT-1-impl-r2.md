# BC-ADMIN-SPEC-REAUDIT2-PAYOUT-STRIKE-COUNT-1 — Impl Review r2

**Verdict: request-changes**

## Summary

r1 block issues (F-1, F-2, F-3) are all correctly resolved. Two new findings introduced by this round's code reading:

## Findings

### MEDIUM — `maskUserFacingPayoutStatus` blindly masks no-IBAN RISK_HOLD rows as PROCESSING

`maskUserFacingPayoutStatus` (`wallet.service.ts` lines 59–82) maps every `WITHDRAWAL/RISK_HOLD` row to PROCESSING ("Sent to payout"), regardless of sub-type. This was correct before this PR, but the PR introduces a new RISK_HOLD sub-type (no-IBAN hold, `metadata.noIbanHold: true`). A no-IBAN hold row appearing in `getTransactions` will be returned to the subscriber as PROCESSING ("Sent to payout"), contradicting the user notification that said "please add your IBAN". The function's type bound did not include `metadata` so it couldn't distinguish the two sub-types.

**Fixed**: extended type bound to `{ ...; metadata?: string | null }`, parse metadata in the RISK_HOLD branch, and map `noIbanHold: true` rows to PENDING (payout blocked pending user action) while second-failure rows continue mapping to PROCESSING.

### LOW — Test did not verify metadata spread preserves existing fields

`adminPayoutsBulkApprove.test.ts` only asserted `noIbanHold: true` with an empty-metadata row; a regression removing the spread would go undetected.

**Fixed**: new test seeds the no-IBAN row with `metadata: JSON.stringify({ plan: 'BASIC', requestedAt: '...' })` and asserts both the existing fields and `noIbanHold: true` survive the merge in `updateMock`.

## Runtime checks

`PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$PATH" npx jest --no-coverage --testPathPattern="tests/unit/adminPayouts|tests/unit/walletPayout"` from `/Users/administrator/Documents/BoomCard/backend-api` → **27 passed, 0 failed** (after fixes applied).

## Integration points checked

- `wallet.service.ts:59–82 (maskUserFacingPayoutStatus)` → `wallet.service.ts:1482 (getTransactions)` — no-IBAN holds now surface as PENDING, not PROCESSING
- `adminPayoutsBulkApprove.test.ts` → `adminPayouts.routes.ts:363–370` — metadata-spread preservation verified
- All r1 fixes verified as present and correct
