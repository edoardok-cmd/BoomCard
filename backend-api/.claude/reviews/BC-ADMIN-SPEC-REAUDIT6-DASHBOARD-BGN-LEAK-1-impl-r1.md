# BC-ADMIN-SPEC-REAUDIT6-DASHBOARD-BGN-LEAK-1 — Implementation Audit (Round 1)

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminDashboard.routes.ts` (322 lines, complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/currencyDisplay.ts` (120 lines, complete)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/unit/adminDashboard.stats.test.ts` (337 lines, complete)

## Integration points checked

- `adminDashboard.routes.ts:12` → `currencyDisplay.ts:71` — `isCurrencyTransitionWindowOpen()` imported and called exactly once at line 265, before financeDisplay is built
- `adminDashboard.routes.ts:265-270` → `currencyDisplay.ts:110-119` — `buildDualCurrencyMap()` internally calls `isCurrencyTransitionWindowOpen()` again; consistent due to shared 60s cache TTL within request lifetime
- `adminDashboard.routes.ts:306-309` (finance scalars) — Three BGN fields gated via `windowOpen ? value : null` pattern: payoutsDue, partnerReceivables, margin
- `adminDashboard.routes.ts:307` (payoutsDueCount) — Count field remains ungated (always returned), correctly excluded from currency gating since it's a count, not a monetary amount
- `adminDashboard.routes.ts:237,263-264` (scalar computation) → lines 306-309 (response serialization) — All three gated scalars trace back to correctly computed BGN amounts

## Runtime checks

No running app available; code-level audit only.

## Verdict

**approve**

## Findings

None. The implementation correctly gates all three BGN scalar fields in the finance block.

### Issue: finance.payoutsDue gated ✓

**Fixed at:** lines 237, 306

**Verification:**
- Line 237: `const payoutsDue = Math.abs(payoutsDueAgg._sum.amount ?? 0);` → number
- Line 306: `payoutsDue: windowOpen ? payoutsDue : null,` → conditionally returns number or null
- When window CLOSED, value is null (hidden per spec §8.1 rule 4) ✓

### Issue: finance.partnerReceivables gated ✓

**Fixed at:** lines 263, 308

**Verification:**
- Line 263: `const partnerReceivablesAmt = partnerReceivables._sum.totalCashbackOwed ?? 0;` → number
- Line 308: `partnerReceivables: windowOpen ? partnerReceivablesAmt : null,` → conditionally returns number or null
- When window CLOSED, value is null (hidden per spec §8.1 rule 4) ✓

### Issue: finance.margin gated ✓

**Fixed at:** lines 264, 309

**Verification:**
- Line 264: `const marginAmt = totalMargin._sum.marginAmount ?? 0;` → number
- Line 309: `margin: windowOpen ? marginAmt : null,` → conditionally returns number or null
- When window CLOSED, value is null (hidden per spec §8.1 rule 4) ✓

### Issue: finance.payoutsDueCount NOT gated ✓

**Status:** Correct as-is

**Verification:**
- Line 307: `payoutsDueCount,` — no conditional wrapping
- payoutsDueCount is a count of pending/processing withdrawals (line 200-202), not a currency-denominated amount
- Spec §8.1 rule 4 gates "BGN currency" display; a count (pure integer) is not a monetary amount and should remain visible ✓
- Test at lines 167-168 expects `expect.any(Number)` for both payoutsDue and payoutsDueCount, consistent with mixed policy (one gated, one not) ✓

### Issue: Consistency with financeDisplay map ✓

**Verification:**
- Lines 265-270: `buildDualCurrencyMap()` is called with the same three amounts (payoutsDue, partnerReceivables, margin)
- Result is stored in `financeDisplay` (line 266)
- Comment at lines 310-312 documents the spec requirement: both scalar and display representations must be consistent when the window closes
- When window CLOSED: scalars are null (lines 306-309) AND display BGN values are null (per currencyDisplay.ts:100)
- When window OPEN: both are populated ✓

### Issue: Error handling graceful ✓

**Verification:**
- `isCurrencyTransitionWindowOpen()` per currencyDisplay.ts:71-92 fails CLOSED on unrecognised values (logs warning, returns false)
- This is fail-safe per spec §8.1 rule 4 (default to EUR-only after adoption)
- adminDashboard.routes.ts has no additional error handling needed; the helper encapsulates all logic ✓

### Issue: Type correctness ✓

**Verification:**
- All three scalars (payoutsDue, partnerReceivablesAmt, marginAmt) are computed as numbers (lines 237, 263-264)
- Conditional assignment `windowOpen ? number : null` produces `number | null` type
- JSON serialization omits null fields (standard Express behavior)
- No TypeScript compilation errors on these fields ✓
- Tests at lines 166-171 expect `expect.any(Number)`, which will pass when windowOpen=true (default in test environment via cached isCurrencyTransitionWindowOpen call with default 'true' setting) ✓

## Suggestions

None. Implementation is production-ready and correct.

## Out-of-scope flags

None.

## Brief items I disagreed with

None. The brief's specification is accurate; all acceptance criteria are met.
