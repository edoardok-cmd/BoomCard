# Task-Level Audit — BC-ADMIN-SPEC-REAUDIT5-TXN-BGN-LEAK-1

**Verdict:** `approve`

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminTransactions.routes.ts` lines 398–649 (GET /business endpoint)
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminTransactions.routes.ts` lines 81–146 (GET / endpoint)

---

## Integration points checked

- **adminTransactions.routes.ts:81-146 (GET /api/admin/transactions/) → isCurrencyTransitionWindowOpen()** — Window gate reads from system settings cache; conditional field inclusion relies on this boolean.
- **adminTransactions.routes.ts:398–649 (GET /api/admin/transactions/business) → isCurrencyTransitionWindowOpen()** — Same window gate pattern; all 6 monetary fields destructured explicitly and conditionally re-added.
- **adminTransactions.routes.ts:615-620 & 133 (raw field re-add) → display object (lines 621-628 & 134-138)** — Raw fields gate-closed when window closed; display object always present with dual-currency (bgn: null when closed).
- **toDualCurrency utility** — Used to build display object; respects windowOpen parameter to null BGN values when window is closed.

---

## Runtime checks

### Test 1: Window CLOSED — Raw fields ABSENT

```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business?page=1&limit=1' \
  -H "Authorization: Bearer <TOKEN>" | jq '.transactions[0] | {amount, marginAmount, cashbackAmount, discountAmount, finalAmount, netAmount}'
```

**Result:**
```json
{
  "amount": null,
  "marginAmount": null,
  "cashbackAmount": null,
  "discountAmount": null,
  "finalAmount": null,
  "netAmount": null
}
```

**Verification:** Keys listing confirms fields are completely absent from response (not just null values):
```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business?page=1&limit=1' \
  -H "Authorization: Bearer <TOKEN>" | jq '.transactions[0] | keys | sort'
```

Result shows `amount`, `marginAmount`, `cashbackAmount`, `discountAmount`, `finalAmount`, `netAmount` are NOT in the response keys array. ✓

### Test 2: Window OPEN — Raw fields PRESENT with values

Opened window via:
```bash
curl -s -X PUT 'http://127.0.0.1:3025/api/admin/settings/system' \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"currency_transition_window_open":"true"}}'
```

Response to GET /business:
```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business?page=1&limit=1' \
  -H "Authorization: Bearer <TOKEN>" | jq '.transactions[0] | {amount, marginAmount, cashbackAmount, discountAmount, finalAmount, netAmount}'
```

**Result:**
```json
{
  "amount": 50,
  "marginAmount": 12.5,
  "cashbackAmount": 0,
  "discountAmount": 7.5,
  "finalAmount": 42.5,
  "netAmount": 0
}
```

✓ All 6 fields are present with numeric values when window is open.

### Test 3: Window CLOSED again — Raw fields ABSENT again

Closed window via:
```bash
curl -s -X PUT 'http://127.0.0.1:3025/api/admin/settings/system' \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"settings":{"currency_transition_window_open":"false"}}'
```

Response to GET /business:
```json
{
  "amount": null,
  "marginAmount": null,
  "cashbackAmount": null,
  "discountAmount": null,
  "finalAmount": null,
  "netAmount": null
}
```

✓ Raw fields correctly disappear when window is closed again. Toggleability confirmed.

### Test 4: Display object present and correct (window CLOSED)

```bash
curl -s 'http://127.0.0.1:3025/api/admin/transactions/business?page=1&limit=1' \
  -H "Authorization: Bearer <TOKEN>" | jq '.transactions[0].display'
```

**Result:**
```json
{
  "amount": {
    "bgn": null,
    "eur": 25.56,
    "windowOpen": false
  },
  "marginAmount": {
    "bgn": null,
    "eur": 6.39,
    "windowOpen": false
  },
  "cashbackAmount": {
    "bgn": null,
    "eur": 0,
    "windowOpen": false
  },
  "discountAmount": {
    "bgn": null,
    "eur": 3.83,
    "windowOpen": false
  },
  "finalAmount": {
    "bgn": null,
    "eur": 21.73,
    "windowOpen": false
  },
  "netAmount": {
    "bgn": null,
    "eur": 0,
    "windowOpen": false
  }
}
```

✓ Display object present with correct structure. BGN values are null when window is closed; EUR values present. windowOpen flag correctly reflects closed state.

### Test 5: Display object with window OPEN

With window open, same endpoint returned:
```json
{
  "amount": { "bgn": 50, "eur": 25.56, "windowOpen": true },
  "marginAmount": { "bgn": 12.5, "eur": 6.39, "windowOpen": true },
  "cashbackAmount": { "bgn": 0, "eur": 0, "windowOpen": true },
  "discountAmount": { "bgn": 7.5, "eur": 3.83, "windowOpen": true },
  "finalAmount": { "bgn": 42.5, "eur": 21.73, "windowOpen": true },
  "netAmount": { "bgn": 0, "eur": 0, "windowOpen": true }
}
```

✓ Both BGN and EUR values present when window is open.

### Test 6: General GET /api/admin/transactions/ endpoint

Verified the general transactions endpoint (line 81) also has the fix applied:
- Explicitly destructures `amount`, `balanceBefore`, `balanceAfter` (line 130)
- Conditionally re-adds them only when windowOpen (line 133)
- Display object always present (lines 134-138)

✓ Fix applied consistently across both transaction endpoints.

---

## Findings

**None.** All runtime tests pass. The fix correctly:
1. Destructures all 6 monetary fields explicitly from the response object
2. Prevents them from leaking into `rest` via spread operator
3. Conditionally re-adds them only when `windowOpen === true`
4. Always provides dual-currency display object with proper null handling
5. Toggles correctly when window state changes
6. Applied consistently to both GET / and GET /business endpoints

---

## Suggestions

None.

---

## Out-of-scope flags

None.

---

## Brief items I disagreed with

None. The brief correctly identified the root cause and the fix has been properly implemented.
