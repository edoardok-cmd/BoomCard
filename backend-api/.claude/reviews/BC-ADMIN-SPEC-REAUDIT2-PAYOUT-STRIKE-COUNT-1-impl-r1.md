# BC-ADMIN-SPEC-REAUDIT2-PAYOUT-STRIKE-COUNT-1 — Impl Review r1

**Verdict: block**

## Summary

The strike-filter logic and the test filter exclusion were correctly written, but **both no-IBAN hold write paths were missing the `metadata.noIbanHold: true` stamp** — the core mechanism that enables exclusion. The formatter (prettier) silently reverted the metadata stamp edits during r1. Fixes were re-applied after this review was written.

## Findings

### F-1 — HIGH: No-IBAN hold writes did not stamp `metadata.noIbanHold: true`

Both RISK_HOLD write paths emitted only `status` and `description`; no `metadata` field was written:
- Bulk-approve path (`adminPayouts.routes.ts` ~line 363–369)
- Single-approve path (`adminPayouts.routes.ts` ~line 457–463)

The strike filters correctly checked `meta.noIbanHold !== true` but could never match because no row ever had the flag. **Fixed**: both writes now compute `noIbanBulkMeta`/`noIbanSingleMeta` from the existing row metadata and stamp `noIbanHold: true`.

### F-2 — HIGH: New test did not exercise the actual write path

`walletPayoutFlow.test.ts` seeded a no-IBAN RISK_HOLD row manually with `noIbanHold: true` — it verified the filter logic in isolation but not that the route actually produces rows with the flag. **Fixed**: `adminPayoutsBulkApprove.test.ts` test case 1 now asserts `updateMock` was called for the no-IBAN payout with `data.metadata` containing `noIbanHold: true`.

### F-3 — MEDIUM: Pre-existing no-IBAN RISK_HOLD rows lacked the stamp

Rows created before this fix have no `noIbanHold` in metadata and would still inflate the strike count. **Fixed**: both `findMany` strike queries now also select `description`, and the filter adds a description-based fallback (`row.description?.includes('липсва банкова сметка')`) to exclude legacy rows by their canonical description string. A new test (`F-014 legacy no-IBAN RISK_HOLD...`) verifies this path.

## Runtime checks

Tests run after fixes: `npx jest --no-coverage --testPathPattern="tests/unit/adminPayouts|tests/unit/walletPayout"` → **26 passed, 0 failed**.

## Integration points checked

- Bulk-approve write (`adminPayouts.routes.ts`) → strike filter (same file, admin `/fail` path)
- Single-approve write (`adminPayouts.routes.ts`) → strike filter (`wallet.service.ts`, Paysera auto-fail path)
- Both filters now exclude: `manualHold === true` OR `noIbanHold === true` OR description contains `липсва банкова сметка`
