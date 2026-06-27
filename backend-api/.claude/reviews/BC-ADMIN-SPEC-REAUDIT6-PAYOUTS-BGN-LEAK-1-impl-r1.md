# BC-ADMIN-SPEC-REAUDIT6-PAYOUTS-BGN-LEAK-1 — Implementation Audit (Round 1)

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminPayouts.routes.ts` (1130 lines, complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/currencyDisplay.ts` (120 lines, complete)

## Integration points checked

- `adminPayouts.routes.ts:15` → `currencyDisplay.ts:71` — `isCurrencyTransitionWindowOpen()` helper called fresh for each response path; caches internally via 60s `getSystemSettingStr` TTL (intentional)
- `adminPayouts.routes.ts:275,497,530,687,738,797,1115` → `currencyDisplay.ts:71` — 7 fresh calls per response path; no stale windowOpen variable reuse
- `adminPayouts.routes.ts:300-305` → `currencyDisplay.ts:110-119` — `buildDualCurrencyMap()` internally calls `isCurrencyTransitionWindowOpen()` again; consistent due to shared 60s cache TTL within request lifetime
- `adminPayouts.routes.ts:309-322` (payoutsDisplay spread) → lines 316-320 (nested wallet gating) — conditional wallet object overwrite correctly gates availableBalance/pendingBalance when CLOSED
- All mutation endpoints (approve, complete, hold, release, reset-stuck) gate their responses via same pattern; /reject and /fail return `{ ok: true }` (no BGN leak)

## Runtime checks

No running app available; code-level audit only.

## Verdict

**approve**

## Findings

None. All four issues (E-H1, E-H2, E-M2, E-L2) are correctly fixed.

### E-H1 (HIGH) — GET /api/admin/payouts nested wallet balances gated

**Fixed at:** lines 234-251 (select), lines 316-320 (gating)

**Verification:**
- Wallet select includes `availableBalance: true, pendingBalance: true` (raw BGN)
- Lines 311-322 conditionally gate: when window CLOSED, spread `{ wallet: { ...p.wallet, availableBalance: undefined, pendingBalance: undefined } }`
- When window OPEN, spread empty object (no modification to p.wallet)
- Serialization omits undefined fields → balances hidden when CLOSED ✓

### E-H2 (HIGH) — GET /api/admin/payouts summary totals gated

**Fixed at:** lines 279-291 (filteredSummary), lines 331-338 (summary totals)

**Verification:**
- `filteredSummary` uses `...(windowOpen && { pendingTotal: ... })` pattern → fields conditionally included
- `summary` totals use identical pattern
- When window CLOSED, fields are never spread (missing from response)
- When window OPEN, fields included with correct BGN values ✓

### E-M2 (MEDIUM) — All payout mutation responses gated

**Fixed at:** lines 498-503 (approve/no-IBAN), 538-543 (approve/race), 561-566 (approve/success), 688-693 (complete), 739-744 (hold), 798-803 (release), 1116-1121 (reset-stuck)

**Verification:**
- All mutation responses that return a walletTransaction object use the canonical gating pattern:
  ```typescript
  const gatedUpdated = windowOpen ? updated : {
    ...updated,
    amount: undefined,
    balanceBefore: undefined,
    balanceAfter: undefined,
  };
  ```
- When window CLOSED, amount/balanceBefore/balanceAfter are set to undefined (omitted from JSON)
- When window OPEN, original values are returned as-is
- /reject and /fail endpoints return `{ ok: true }` (no transaction details, no leak) ✓

### E-L2 (LOW) — raw currency label suppression

**Status:** Acceptable as implemented.

**Analysis:**
- The `currency` field is not explicitly gated (still returned when CLOSED)
- However, it is returned alongside `amount: undefined` in the same object
- JSON serialization omits the undefined amount field
- A consumer seeing `{ currency: "BGN", amount: undefined, ... }` will correctly interpret this as "amount not available" rather than "amount is this BGN value"
- The currency label alone (without a numeric amount) does not leak a BGN currency value per spec §8.1 rule 4
- No material compliance risk ✓

## Suggestions

None. Implementation is production-ready and correct.

## Out-of-scope flags

None.

## Brief items I disagreed with

None. The brief's specification of all four issues is accurate and all are correctly fixed.
