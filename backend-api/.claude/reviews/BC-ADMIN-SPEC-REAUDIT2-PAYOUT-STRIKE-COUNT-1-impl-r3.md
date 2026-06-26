# BC-ADMIN-SPEC-REAUDIT2-PAYOUT-STRIKE-COUNT-1 — Impl Review r3

**Verdict: approve**

## Summary

Zero findings at any severity. All r1 and r2 fixes verified as correctly present.

## What was verified

1. Both no-IBAN hold write paths (`adminPayouts.routes.ts` lines 369 and 465) stamp `noIbanHold: true` with existing metadata spread-preserved.
2. Both strike filters (admin `/fail` route and `executePayoutTransfer` auto-fail) exclude `manualHold === true`, `noIbanHold === true`, and description-substring legacy rows; both `findMany` queries select `{ metadata: true, description: true }`.
3. `maskUserFacingPayoutStatus`: type bound includes `metadata?: string | null`; RISK_HOLD branch maps `noIbanHold: true` rows to PENDING and second-failure rows to PROCESSING. `maskUserFacingPayoutStatuses` same type bound, delegates correctly.
4. `walletPayoutFlow.test.ts`: `findMany` mock returns `{ metadata, description }` for WITHDRAWAL queries; two new F-014 tests for flagged and legacy no-IBAN holds.
5. `adminPayoutsBulkApprove.test.ts`: `updateMock` + notification mock present; `noIbanHold: true` assertion verified; metadata-spread preservation test verified.

## Runtime checks

`PATH="$HOME/.nvm/versions/node/v22.17.0/bin:$PATH" npx jest --no-coverage --testPathPattern="tests/unit/adminPayouts|tests/unit/walletPayout"` from `/Users/administrator/Documents/BoomCard/backend-api` -> **27 passed, 0 failed** (independently run by reviewer).
