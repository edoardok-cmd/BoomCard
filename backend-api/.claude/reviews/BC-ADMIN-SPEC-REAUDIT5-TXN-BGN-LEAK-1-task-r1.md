# BC-ADMIN-SPEC-REAUDIT5-TXN-BGN-LEAK-1 — Task-Level Audit

**Date:** 2026-06-27  
**Reviewer:** Claude Haiku 4.5  
**Task:** Fix currency-window gating in adminTransactions endpoints to prevent raw BGN leakage when the transition window is closed.

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminTransactions.routes.ts` (lines 1–832)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/currencyDisplay.ts` (lines 1–120)
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminSettings.routes.ts` (lines 240–299, 520–542)

---

## Integration points checked

1. **GET / (:81) → currencyDisplay.ts** — `isCurrencyTransitionWindowOpen()` called at line 87; gating at lines 133 via `...(windowOpen && ...)` spread. ✓ Implementation present but needs verification.

2. **GET /stats (:149) → currencyDisplay.ts** — `isCurrencyTransitionWindowOpen()` called at line 153; gating at lines 176–178. ✓ Verified working in runtime test.

3. **GET /business (:398) → currencyDisplay.ts** — `isCurrencyTransitionWindowOpen()` called at line 520; gating attempted at lines 604–609 via `...(windowOpen && ...)`. ✗ **CRITICAL DEFECT FOUND** — see Findings below.

4. **GET /business/stats (:666) → currencyDisplay.ts** — `isCurrencyTransitionWindowOpen()` called at line 670; gating at lines 743–745 via `...(windowOpen && ...)` spread. ✓ Verified working in runtime test.

5. **POST /adjust (:191) → currencyDisplay.ts** — `isCurrencyTransitionWindowOpen()` called at line 268; gating at lines 272 via `...(windowOpen && ...)` spread. ✓ Verified working in runtime test.

6. **System setting invalidation** — `adminSettings.routes.ts` line 461 calls `invalidateCurrencyDisplayCache()` when setting changes. ✓ Verified working (setting change took effect immediately in runtime tests).

---

## Runtime checks

**Environment:** API running on `http://127.0.0.1:3025` (BoomCard dev mode)  
**Auth:** SUPER_ADMIN user (admin@boomcard.bg)  
**Window state transitions tested:** CLOSED → OPEN → CLOSED

### Test 1: GET /api/admin/transactions/ (window CLOSED)

```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/?page=1&limit=5' \
  -H "Authorization: Bearer $TOKEN" | jq '.transactions[0] | keys'
```

**Result:** ✓ PASS  
Raw fields (amount, balanceBefore, balanceAfter) NOT present.  
Only keys present: [createdAt, currency, description, display, id, status, type, wallet]

**Display object:**
```json
{
  "amount": { "bgn": null, "eur": -5.11, "windowOpen": false },
  "balanceBefore": { "bgn": null, "eur": 0, "windowOpen": false },
  "balanceAfter": { "bgn": null, "eur": -5.11, "windowOpen": false }
}
```
Correct: bgn=null when window is closed.

### Test 2: GET /api/admin/transactions/stats (window CLOSED)

```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/stats' \
  -H "Authorization: Bearer $TOKEN" | jq 'keys'
```

**Result:** ✓ PASS  
Raw fields NOT present.  
Only keys: [display]  
No totalVolume, totalCashback, or totalWithdrawals at top level.

### Test 3: GET /api/admin/transactions/business (window CLOSED)

```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business?page=1&limit=1' \
  -H "Authorization: Bearer $TOKEN" | jq '.transactions[0] | {amount, marginAmount, cashbackAmount, discountAmount, finalAmount, netAmount}'
```

**Result (window CLOSED):**
```json
{
  "amount": 50,
  "marginAmount": null,
  "cashbackAmount": null,
  "discountAmount": 7.5,
  "finalAmount": 42.5,
  "netAmount": null
}
```

**✗ CRITICAL FAILURE:** Raw BGN fields ARE present when window is CLOSED. Expected: these fields should NOT be in the response.

### Test 4: Verify window state and retry Test 3 (window OPEN)

```bash
curl -s -X PUT 'http://127.0.0.1:3025/api/admin/settings/system' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"currency_transition_window_open":"true"}}'
```

**Window now OPEN (verified: windowOpen=true)**

Same request to /business again:
```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business?page=1&limit=1' \
  -H "Authorization: Bearer $TOKEN" | jq '.transactions[0] | {amount, marginAmount, cashbackAmount, discountAmount, finalAmount, netAmount}'
```

**Result (window OPEN):**
```json
{
  "amount": 50,
  "marginAmount": null,
  "cashbackAmount": null,
  "discountAmount": 7.5,
  "finalAmount": 42.5,
  "netAmount": null
}
```

**Same raw fields present** — as expected when window is open.

### Test 5: Close window and retry Test 3 (window CLOSED again)

```bash
curl -s -X PUT 'http://127.0.0.1:3025/api/admin/settings/system' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"currency_transition_window_open":"false"}}'
```

Same request to /business again:

**Result (window CLOSED again):**
```json
{
  "amount": 50,
  "marginAmount": null,
  "cashbackAmount": null,
  "discountAmount": 7.5,
  "finalAmount": 42.5,
  "netAmount": null
}
```

**✗ CRITICAL FAILURE CONFIRMED:** The raw fields are STILL present even after closing the window. The gating is not working.

### Test 6: GET /api/admin/transactions/business/stats (window CLOSED)

```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business/stats' \
  -H "Authorization: Bearer $TOKEN" | jq 'keys'
```

**Result:** ✓ PASS  
Raw fields NOT present. Only keys: [count, display, todayCount]

### Test 7: POST /api/admin/transactions/adjust (window CLOSED)

```bash
curl -s -X POST 'http://127.0.0.1:3025/api/admin/transactions/adjust' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<ID>","amount":3,"reason":"Test"}'
```

**Result:** ✓ PASS  
Raw fields NOT present. Only keys: [createdAt, currency, description, display, id, status, type]

**Display object shows bgn=null correctly.**

---

## Verdict

**`request-changes`**

The implementation has a critical defect in the GET /business endpoint that causes raw BGN fields to leak when the window is closed. Four of the five endpoints work correctly; only /business is broken.

---

## Findings

### **Severity: CRITICAL**

**Item:** GET /api/admin/transactions/business endpoint leaks raw BGN fields (amount, marginAmount, cashbackAmount, discountAmount, finalAmount, netAmount) regardless of currency-window state.

**Root cause (lines 584–632):**
```typescript
const { walletTransaction: _wt, partner: _origPartner, venue: origVenue, ...rest } = tx;
// ... later ...
return {
  ...rest,  // <-- DEFECT: rest contains all 6 monetary fields!
  partner: partnerOut,
  venue: venueOut,
  ...(windowOpen && { amount: tx.amount }),  // <-- These have no effect
  ...(windowOpen && { marginAmount: tx.marginAmount }),
  ...(windowOpen && { cashbackAmount: cashbackAmountResolved }),
  ...(windowOpen && { discountAmount: tx.discountAmount }),
  ...(windowOpen && { finalAmount: tx.finalAmount }),
  ...(windowOpen && { netAmount: tx.netAmount }),
  display: { ... },
  ...
};
```

The destructuring at line 584 only extracts three fields (walletTransaction, partner, venue) for removal. All other transaction fields, including the 6 monetary ones, remain in the `rest` object and are spread into the return value at line 600. The conditional spreads at lines 604–609 have no effect because the fields already exist in the object.

**Why the gating failed:** The pattern `...(windowOpen && { field })` only works if the field is NOT already present. Since the field is already in `rest`, the conditional spread is a no-op.

**Fix required:**
```typescript
const { 
  walletTransaction: _wt, 
  partner: _origPartner, 
  venue: origVenue,
  amount,                    // Extract these 6
  marginAmount,
  cashbackAmount: _cashback,
  discountAmount,
  finalAmount,
  netAmount,
  ...rest 
} = tx;

// ... later ...
return {
  ...rest,
  partner: partnerOut,
  venue: venueOut,
  ...(windowOpen && { amount }),  // Now these work correctly
  ...(windowOpen && { marginAmount }),
  ...(windowOpen && { cashbackAmount: cashbackAmountResolved }),
  ...(windowOpen && { discountAmount }),
  ...(windowOpen && { finalAmount }),
  ...(windowOpen && { netAmount }),
  display: { ... },
  ...
};
```

**Spec violation:** Spec §8.1 rule 4 requires "when window is CLOSED: BGN display is hidden; EUR only". The implementation violates this for the /business endpoint.

**Runtime impact:** Any admin viewing the /business endpoint can see raw BGN amounts regardless of the official window state. This undermines the currency-transition governance and may expose the system to compliance violations post-adoption.

---

## Suggestions

The other four endpoints (/stats, /business/stats, POST /adjust, GET /) all correctly implement the gating pattern. Consider extracting a helper function `gateRawBgnFields(obj: any, windowOpen: boolean, fieldNames: string[])` to reduce duplication and prevent similar bugs in future endpoints.

---

## Out-of-scope flags

None. The task is narrowly scoped to adding currency-window gating to the 5 transaction endpoints, and the implementation attempt is contained within that scope.

---

## Brief items I disagreed with

None. The brief accurately described the task and did not make contradictory claims.
