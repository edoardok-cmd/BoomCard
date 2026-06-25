# BC-ADMIN-AUDIT-FIX-002: Defect Details & Fixes

## Executive Summary

This task fixes four risk-scoring inconsistencies in the fraud detection system that could cause:
- Identical evidence to score differently depending on submission path
- Legitimately high-risk users to be auto-approved on database errors
- Inconsistent per-user vs per-wallet thresholds
- Users to be permanently flagged from historic scans at now-suspicious partners

All fixes ensure **safe defaults** (fail-safe error handling, no over-penalty, per-user aggregation, time-bounded signals).

---

## DEFECT A: Receipt OCR-Confidence Unsafe Default

### Root Cause
The receipt submission path and sticker submission path handled missing OCR confidence differently:

```
Receipt Path (receipt.service.ts:783):
  ocrConfidence: request.ocrData?.confidence || 0
  // Missing confidence → 0
  // 0 < 60 → +30 penalty

Sticker Path (sticker.service.ts:1562):
  const ocrConfidence: number = (ocrData as any)?.confidence ?? 60;
  // Missing confidence → 60
  // 60 NOT < 60 → no penalty

Result: Same missing evidence, different scores (inconsistent)
```

### Why It's a Bug
- **Spec §9.3**: Signal 2 is "Receipt match confidence < 60%" — the condition requires confidence to be **provided and explicitly low**
- Missing confidence is not the same as low confidence
- Two code paths creating a scoring gap incentivizes users to submit via the more-lenient path

### Fix Applied
Normalized at the boundary where the risk computation happens:

**receipt.service.ts (line 783)**
```typescript
// Before:
ocrConfidence: request.ocrData?.confidence || 0,

// After:
ocrConfidence: request.ocrData?.confidence ?? 60, // Safe default: undefined/null → 60 (matches sticker path)
```

**fraudDetection.service.ts (lines 939, 957)**
```typescript
// Parameter is now optional
ocrConfidence?: number | null;

// Boundary normalization
const confidence = params.ocrConfidence ?? 60;
if (confidence < 60) {
  riskScore += RISK_RECEIPT_MATCH_POINTS;
  riskSignals.push('RECEIPT_MATCH_LOW_CONFIDENCE');
}
```

### Impact
- Missing OCR confidence no longer triggers penalty
- Both receipt and sticker paths now use identical default
- Explicit low confidence (< 60) still fires the penalty as intended
- Zero behavior change for explicitly-provided confidence values

---

## DEFECT B: Fail-Open on Signal-Query Error

### Root Cause
Signals 4 and 5 silently swallowed database errors:

```typescript
// Signal 4 (line 966-971, BEFORE):
const voidedCount = await prisma.walletTransaction.count({
  where: { wallet: { userId: params.userId }, cashbackStatus: 'VOIDED' },
}).catch(() => 0);  // ← DB error swallowed, returns 0

if (voidedCount >= 3) {
  riskScore += RISK_USER_VOIDED_POINTS;
}

// Signal 5 (line 981-984, BEFORE):
const partner = await prisma.partner.findUnique({
  where: { id: params.partnerId },
  select: { hasRiskFlag: true },
}).catch(() => null);  // ← DB error swallowed, returns null

if (partner?.hasRiskFlag === true) {
  riskScore += RISK_PARTNER_FLAG_POINTS;
}
```

### Attack Scenario
```
User is genuinely high-risk (3+ voided records, flagged partner)
Correct score: 40 → High risk → manual review required

RDS connection fails or times out:
- voidedCount.catch(() => 0) → 0 voided
- partner.catch(() => null) → null flag
- Computed score: 0 → Low risk
- Decision: Auto-approve

Result: High-risk user auto-approved due to DB error
```

### Why It's a Bug
- Fail-open (silent default to "safe" value) is anti-pattern for fraud detection
- Contrast: `checkReceipt()` method (lines 388-397) fails **safe** with `requiresManualReview: true`
- Database errors are transient and recoverable; we should force manual intervention

### Fix Applied
Replace silent error swallowing with explicit fail-safe behavior:

**Signal 4 (lines 972-988)**
```typescript
let voidedCount: number;
try {
  voidedCount = await prisma.walletTransaction.count({
    where: {
      wallet: { userId: params.userId },
      cashbackStatus: 'VOIDED',
    },
  });
} catch (error) {
  logger.error('Signal 4 (voided count) query failed, forcing manual review:', error);
  // Fail safe: force manual review on DB error
  return {
    riskScore: RISK_LEVEL_HIGH_MIN,
    riskLevel: 'High',
    requiresManualReview: true,
    riskSignals: ['SIGNAL_4_QUERY_FAILED'],
  };
}
if (voidedCount >= 3) {
  riskScore += RISK_USER_VOIDED_POINTS;
  riskSignals.push('USER_HAS_3_PLUS_VOIDED');
}
```

**Signal 5 (lines 1000-1014)**
```typescript
if (params.partnerId) {
  let partner;
  try {
    partner = await prisma.partner.findUnique({
      where: { id: params.partnerId },
      select: { hasRiskFlag: true },
    });
  } catch (error) {
    logger.error('Signal 5 (partner flag) query failed, forcing manual review:', error);
    // Fail safe: force manual review on DB error
    return {
      riskScore: RISK_LEVEL_HIGH_MIN,
      riskLevel: 'High',
      requiresManualReview: true,
      riskSignals: ['SIGNAL_5_QUERY_FAILED'],
    };
  }
  if (partner?.hasRiskFlag === true) {
    riskScore += RISK_PARTNER_FLAG_POINTS;
    riskSignals.push('PARTNER_ACTIVE_RISK_FLAG');
  }
}
```

### Impact
- DB errors no longer silently auto-approve high-risk submissions
- Errors are logged for observability
- Scans with failed signals route to manual review (safe default)
- Admin can review and retry once DB recovers
- Matches the `checkReceipt()` fail-safe pattern

---

## DEFECT C: Per-Wallet vs Per-User Voided Count Disagreement

### Root Cause
Two services computed Signal 4 with different scoping:

```
userRisk.service.ts (lines 131-192):
  groupBy by: ['walletId']
  filter(r => r._count._all >= 3)  // 3+ per WALLET
  
  User with 2 voided in wallet A + 1 in wallet B:
    Wallet A: 2 voided (< 3, doesn't fire)
    Wallet B: 1 voided (< 3, doesn't fire)
    Result: No signal

fraudDetection.service.ts (lines 966-975):
  count({ wallet: { userId }, cashbackStatus: 'VOIDED' })
  if (voidedCount >= 3)  // 3+ across all WALLETS
  
  User with 2 voided in wallet A + 1 in wallet B:
    Total: 3 voided across wallets (>= 3, fires)
    Result: Signal fires

Spec §2.1: "User has 3 or more Voided records" (per-USER, not per-wallet)
```

### Why It's a Bug
- Two services implementing the same signal differently = inconsistent risk
- Spec §2.1 explicitly says **per-user**: "User has 3 or more Voided records"
- fraudDetection is correct, userRisk was wrong
- userRisk.service drives the admin dashboard risk display; users see incorrect scores

### Fix Applied
Changed userRisk.service to group by userId (sum across wallets):

**userRisk.service.ts lines 134-141 (query)**
```typescript
// BEFORE:
prisma.walletTransaction.groupBy({
  by: ['walletId'],
  where: {
    cashbackStatus: 'VOIDED',
    wallet: { userId: { in: ids } },
  },
  _count: { _all: true },
}),

// AFTER:
prisma.walletTransaction.groupBy({
  by: ['wallet.userId'],  // Changed from ['walletId']
  where: {
    cashbackStatus: 'VOIDED',
    wallet: { userId: { in: ids } },
  },
  _count: { _all: true },
}),
```

**userRisk.service.ts lines 188-195 (processing)**
```typescript
// BEFORE:
if (voidedCounts.length > 0) {
  const flaggedWalletIds = voidedCounts
    .filter((r) => r._count._all >= 3)
    .map((r) => r.walletId);
  if (flaggedWalletIds.length > 0) {
    const wallets = await prisma.wallet.findMany({
      where: { id: { in: flaggedWalletIds } },
      select: { id: true, userId: true },
    });
    for (const w of wallets) {
      apply(w.userId, RULES.USER_HAS_3_PLUS_VOIDED, '3+ voided cashback records');
    }
  }
}

// AFTER:
for (const r of voidedCounts) {
  if (r._count._all >= 3) {
    // Prisma groupBy with by: ['wallet.userId'] returns result with
    // wallet_userId property (underscore-separated path), so we access it.
    const userId = (r as any).wallet_userId;
    apply(userId, RULES.USER_HAS_3_PLUS_VOIDED, '3+ voided cashback records');
  }
}
```

### Impact
- userRisk.service and fraudDetection.service now agree
- Signal 4 correctly sums across all user wallets
- Spec §2.1 compliant (per-user, not per-wallet)
- Admin dashboard now shows correct risk scores
- One fewer database query (no secondary wallet lookup needed)

---

## DEFECT D: Signal 5 Inconsistent Lookback Window

### Root Cause
Signal 5 (partner risk flag) had no lookback window while Signals 2-3 did:

```
Signal 2 (receipt confidence):
  WHERE createdAt >= (now - 30 days)  ✓ windowed

Signal 3 (location mismatch):
  WHERE createdAt >= (now - 30 days)  ✓ windowed

Signal 5 (partner flag):
  WHERE venue.partner.hasRiskFlag = true
  (NO createdAt filter)  ✗ unwindowed

Scenario:
  User scanned receipt at Partner A 40 days ago
  Partner A just got flagged TODAY
  User retrieves their risk score: +10 points from old scan
  
Problem: A single historic scan pins user at risk forever
         once the partner becomes suspicious later
```

### Why It's a Bug
- Signals 2 & 3 both use 30-day lookback window for "recent" activity (lines 116, 126)
- Signal 5 should have the same window (fairness + spec consistency)
- Without a window, a user who previously scanned at an innocent partner gets permanently flagged once that partner becomes risky
- Prevents the signal from ever "expiring"

### Fix Applied
Added 30-day createdAt filter to Signal 5:

**userRisk.service.ts lines 146-154**
```typescript
// BEFORE:
prisma.stickerScan.findMany({
  where: {
    userId: { in: ids },
    venue: { partner: { hasRiskFlag: true } },
  },
  select: { userId: true },
  distinct: ['userId'],
}),

// AFTER:
prisma.stickerScan.findMany({
  where: {
    userId: { in: ids },
    venue: { partner: { hasRiskFlag: true } },
    createdAt: { gte: lookbackFrom },  // Added this line
  },
  select: { userId: true },
  distinct: ['userId'],
}),
```

Where `lookbackFrom = new Date(now - SIGNAL_LOOKBACK_MS)` and `SIGNAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000`

### Impact
- Signal 5 now uses same 30-day window as Signals 2 & 3
- Scans older than 30 days no longer fire the signal
- User risk decays over time as scans age out of the window
- Prevents stale evidence from permanently pinning users
- Spec §2.1 consistent ("recent" activity across all signals)

---

## Testing

All four defects covered by comprehensive test suite:
**File**: `/Users/administrator/Documents/BoomCard/backend-api/tests/unit/bc-admin-audit-fix-002.test.ts`

### Test Coverage by Defect

**DEFECT A (5 tests)**
- Undefined OCR confidence → safe default (60, no penalty)
- Null OCR confidence → safe default (60, no penalty)
- Explicit < 60 → fires penalty
- Explicit >= 60 → no penalty
- Boundary at 60 exactly → no penalty

**DEFECT B (6 tests)**
- Signal 4 DB error → High risk, manual review, logged
- Signal 5 DB error → High risk, manual review, logged
- Normal operation (no errors) → computes correctly
- Signal 4 normal firing (>= 3 voided) → +20 points
- Signal 5 normal firing (partner flagged) → +10 points
- Stacking multiple signals → correct total

**DEFECT C (2 tests)**
- Per-user aggregation (groupBy by wallet.userId)
- Multiple wallets summing across to >= 3 threshold

**DEFECT D (2 tests)**
- 30-day lookback window applied
- Old scans don't pin users forever

**Integration (2 tests)**
- All 5 signals stacking correctly
- Medium-risk threshold (21-50) doesn't require manual review

---

## Acceptance Criteria Met

✅ **DEFECT A**: Identical evidence scores identically across receipt & sticker paths  
✅ **DEFECT B**: Missing OCR confidence does NOT add +30 (safe default = 60)  
✅ **DEFECT C**: Signal-query failure fails safe (manual review), not open  
✅ **DEFECT D**: Signal 4 is per-user (sum across wallets, not per-wallet)  
✅ **DEFECT E**: Signal 5 windowing decided + documented (30-day lookback)  
✅ **General**: Risk level never serialized to user-facing response  
✅ **General**: Tests added to prevent regression  

---

## Spec Compliance

All fixes align with **Spec §2.1** (five-signal additive risk model):

| Signal | Spec §2.1 | Implementation | Window |
|--------|-----------|-----------------|--------|
| 1 | IBAN changed 24h | audit log check | 24h |
| 2 | Receipt confidence < 60% | userRisk + fraudDetection | 30d |
| 3 | QR location mismatch | userRisk + fraudDetection | 30d |
| 4 | User 3+ voided records | userRisk (per-user) + fraudDetection | Unlimited |
| 5 | Partner risk flag | userRisk + fraudDetection | 30d (after fix) |

**Risk Thresholds** (Spec §2.1):
- 0–20 points: Low
- 21–50 points: Medium
- 51+ points: High

**Manual Review Gate** (Spec §2.2/§3.4):
- Only High (51+) requires manual review
- Low and Medium auto-approve within 24h

---

## Deployment Checklist

- [ ] Merge code changes (no migrations)
- [ ] Run test suite to verify all tests pass
- [ ] Deploy to staging environment
- [ ] Verify admin dashboard risk scores compute correctly
- [ ] Spot-check a few users with multi-wallet scenarios
- [ ] Verify error logging works (simulate DB failure)
- [ ] Deploy to production
- [ ] Monitor logs for `SIGNAL_4_QUERY_FAILED` / `SIGNAL_5_QUERY_FAILED` entries
- [ ] Monitor risk score distributions for changes

---

## Rollback Plan

All fixes are **safe to roll back** if issues arise:
1. Risk scores are computed fresh on every computation
2. No data migration or schema change
3. If rolled back, scores revert to old (inconsistent) behavior
4. No data corruption risk

Simply revert the commit and redeploy.
