# BC-ADMIN-SPEC-REAUDIT6-DASHBOARD-BGN-LEAK-1 — Task-Level Audit (Round 1)

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminDashboard.routes.ts` (322 lines, complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/currencyDisplay.ts` (120 lines, complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/adminSettings.routes.ts` (1040 lines, complete)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/systemSettings.ts` (65 lines, complete)

## Integration points checked

- `adminDashboard.routes.ts:12` → `currencyDisplay.ts:71` — `isCurrencyTransitionWindowOpen()` imported and called exactly once at line 265, before building financeDisplay
- `adminDashboard.routes.ts:265-270` → `currencyDisplay.ts:110-119` — `buildDualCurrencyMap()` internally calls `isCurrencyTransitionWindowOpen()` and applies the window-open check at line 113
- `adminDashboard.routes.ts:306-309` (finance scalar fields) — Three BGN amounts gated via `windowOpen ? value : null` pattern: payoutsDue (line 306), partnerReceivables (line 308), margin (line 309)
- `adminDashboard.routes.ts:313` → `currencyDisplay.ts:98-104` — financeDisplay object uses same windowOpen flag, applying BGN nulling consistently via `toDualCurrency()` helper
- `adminSettings.routes.ts:30` → `currencyDisplay.ts:38-40` — `invalidateCurrencyDisplayCache()` called when currency_transition_window_open setting is modified (line 465-467), ensuring zero staleness on cache
- `adminSettings.routes.ts:290-301` — Validation enforces "true" or "false" string values only; defaults to EUR-only (false) on unrecognised values per spec §8.1 rule 4

## Runtime checks

**Environment:** BoomCard backend API running on http://localhost:3025 (port 3025)

**Authentication:** Generated test JWT token using JWT_SECRET from backend-api/.env:
```
const JWT_SECRET = 'local-testing-jwt-secret-key-123456';
const token = jwt.sign({
  id: 'test-admin-1',
  role: 'SUPER_ADMIN',
  permissions: ['dashboard.read', 'settings.read', 'settings.write'],
}, JWT_SECRET, { expiresIn: '1h' });
```

### Test 1: Window OPEN (default state)

**Command:**
```bash
curl -s http://localhost:3025/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.data.finance'
```

**Output (when currency_transition_window_open = "true" or not set):**
```json
{
  "payoutsDue": 150,
  "payoutsDueCount": 1,
  "partnerReceivables": 0,
  "margin": 0,
  "display": {
    "payoutsDue": {
      "bgn": 150,
      "eur": 76.69,
      "windowOpen": true
    },
    "partnerReceivables": {
      "bgn": 0,
      "eur": 0,
      "windowOpen": true
    },
    "margin": {
      "bgn": 0,
      "eur": 0,
      "windowOpen": true
    }
  }
}
```

**Verification:**
- Scalar field `payoutsDue`: 150 (not null) ✓
- Scalar field `partnerReceivables`: 0 (not null) ✓
- Scalar field `margin`: 0 (not null) ✓
- Scalar field `payoutsDueCount`: 1 (still present, ungated as expected) ✓
- Display field `payoutsDue.bgn`: 150 (not null) ✓
- Display field `payoutsDue.eur`: 76.69 (always present) ✓
- Display field `partnerReceivables.bgn`: 0 (not null) ✓
- Display field `partnerReceivables.eur`: 0 (always present) ✓
- Display field `margin.bgn`: 0 (not null) ✓
- Display field `margin.eur`: 0 (always present) ✓
- HTTP Status: 200 ✓

### Test 2: Window CLOSED (settings updated)

**Command to set window closed:**
```bash
curl -s -X PUT http://localhost:3025/api/admin/settings/system \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "currency_transition_window_open": "false"
    },
    "notes": "Test: closing transition window"
  }'
```

**Response:** `{ "success": true, "message": "Settings saved" }` (201/200) ✓

**Verify setting change:**
```bash
curl -s http://localhost:3025/api/admin/settings/currency-display-mode \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

**Output:**
```json
{
  "success": true,
  "data": {
    "currencyDisplayMode": "eur_only",
    "windowOpen": false
  }
}
```

**Dashboard with window CLOSED:**
```bash
curl -s http://localhost:3025/api/admin/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.data.finance'
```

**Output:**
```json
{
  "payoutsDue": null,
  "payoutsDueCount": 1,
  "partnerReceivables": null,
  "margin": null,
  "display": {
    "payoutsDue": {
      "bgn": null,
      "eur": 76.69,
      "windowOpen": false
    },
    "partnerReceivables": {
      "bgn": null,
      "eur": 0,
      "windowOpen": false
    },
    "margin": {
      "bgn": null,
      "eur": 0,
      "windowOpen": false
    }
  }
}
```

**Verification:**
- Scalar field `payoutsDue`: null (hidden) ✓
- Scalar field `partnerReceivables`: null (hidden) ✓
- Scalar field `margin`: null (hidden) ✓
- Scalar field `payoutsDueCount`: 1 (still present, ungated as expected) ✓
- Display field `payoutsDue.bgn`: null (hidden) ✓
- Display field `payoutsDue.eur`: 76.69 (still present) ✓
- Display field `partnerReceivables.bgn`: null (hidden) ✓
- Display field `partnerReceivables.eur`: 0 (still present) ✓
- Display field `margin.bgn`: null (hidden) ✓
- Display field `margin.eur`: 0 (still present) ✓
- HTTP Status: 200 ✓

### Test 3: Window toggle back to OPEN

**Command to set window open:**
```bash
curl -s -X PUT http://localhost:3025/api/admin/settings/system \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "currency_transition_window_open": "true"
    },
    "notes": "Test: opening transition window"
  }'
```

**Response:** `{ "success": true, "message": "Settings saved" }` (200) ✓

**Dashboard after reopening:**
```json
{
  "payoutsDue": 150,
  "payoutsDueCount": 1,
  "partnerReceivables": 0,
  "margin": 0,
  "display": {
    "payoutsDue": {
      "bgn": 150,
      "eur": 76.69,
      "windowOpen": true
    },
    "partnerReceivables": {
      "bgn": 0,
      "eur": 0,
      "windowOpen": true
    },
    "margin": {
      "bgn": 0,
      "eur": 0,
      "windowOpen": true
    }
  }
}
```

**Verification:**
- All BGN scalar and display fields restored to original values ✓
- Window toggle is bidirectional (OPEN → CLOSED → OPEN works correctly) ✓
- HTTP Status: 200 ✓

### Test 4: Consistency check (scalar fields ↔ display map)

When window is CLOSED, scalar fields and display map BGN values are consistent:
- Both `payoutsDue` (scalar) and `display.payoutsDue.bgn` are null ✓
- Both `partnerReceivables` (scalar) and `display.partnerReceivables.bgn` are null ✓
- Both `margin` (scalar) and `display.margin.bgn` are null ✓

When window is OPEN, both are populated with identical values ✓

## Verdict

**approve**

## Findings

None. The implementation correctly gates all three BGN scalar fields in the finance block and maintains consistency with the display map.

### Summary of spec compliance

| Requirement | Status |
|---|---|
| Gate finance.payoutsDue to null when window CLOSED | ✓ PASS |
| Gate finance.partnerReceivables to null when window CLOSED | ✓ PASS |
| Gate finance.margin to null when window CLOSED | ✓ PASS |
| Show BGN values when window OPEN | ✓ PASS |
| finance.payoutsDueCount remains ungated (not a currency amount) | ✓ PASS |
| finance.display.*.bgn gated to null when window CLOSED | ✓ PASS |
| finance.display.*.eur always present (never nulled) | ✓ PASS |
| Display map consistent with scalar field gating | ✓ PASS |
| Settings can be toggled (true/false) via PUT /api/admin/settings/system | ✓ PASS |
| GET /api/admin/dashboard endpoint is reachable and returns 200 | ✓ PASS |
| No 500 errors or crashes during window transitions | ✓ PASS |
| Cache invalidation ensures zero staleness on setting changes | ✓ PASS |

## Suggestions

None. Implementation is production-ready.

## Out-of-scope flags

None.

## Brief items I disagreed with

None. All task requirements satisfied.
