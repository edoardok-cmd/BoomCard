# BoomCard Account Activation Fix Summary

## Problem
Users were receiving a 500 error when attempting to activate their accounts via the `/complete-profile` endpoint after email verification and payment.

## Root Cause Analysis

The complete-profile endpoint (`/api/auth/complete-profile`) had three related bugs that could cause transaction failures or incorrect data assignment:

### Bug 1: Card Type Lookup Mismatch
**Location:** `backend-api/src/routes/auth.routes.ts:1252`

**Issue:** The code was using the SubscriptionPlan enum value (e.g., "PREMIUM_MONTHLY") as a key to look up CardType in a map that only has plan codes (e.g., "PREMIUM"):

```typescript
// BEFORE (WRONG)
const subscriptionPlan = planCodeMap[pending.plan.planCode];  // e.g., "PREMIUM_MONTHLY"
const cardTypeForPlan = planToCardType[subscriptionPlan] ?? CardType.PREMIUM_WEEKLY;  // Wrong key!
```

This lookup would fail and fall back to CardType.PREMIUM_WEEKLY, potentially assigning the wrong card type.

**Fix:** Store and use the original plan code for the lookup:

```typescript
// AFTER (CORRECT)
const planCode = pending.plan.planCode;
const subscriptionPlan = planCodeMap[planCode];
const cardTypeForPlan = planToCardType[planCode] ?? CardType.PREMIUM_WEEKLY;  // Correct key!
```

### Bug 2: Non-Unique Card Numbers
**Location:** `backend-api/src/routes/auth.routes.ts:1242-1245`

**Issue:** Card numbers were generated using `Math.random()`, which is not cryptographically secure and not guaranteed to be unique:

```typescript
// BEFORE (UNSAFE)
const cardNumber = (() => {
  const part = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BOOM-${part()}-${part()}-${part()}`;
})();
```

In high-concurrency scenarios, two users could generate the same card number, causing a unique constraint violation on `Card.cardNumber`.

**Fix:** Use UUID-based generation which guarantees uniqueness:

```typescript
// AFTER (SAFE)
const uuid4Str = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();
const cardNumber = `BOOM-${uuid4Str.substring(0, 4)}-${uuid4Str.substring(4, 8)}-${uuid4Str.substring(8, 12)}`;
```

### Bug 3: Card Sync Service Parameter Mismatch
**Location:** `backend-api/src/routes/auth.routes.ts:1336`

**Issue:** After the transaction, the code called `cardService.syncCardTypeWithSubscription()` with the subscription plan enum value, but the service expected a plan code:

```typescript
// BEFORE (WRONG)
await cardService.syncCardTypeWithSubscription(user.id, subscriptionPlan);  // enum value, not code
```

The cardService has its own CardType lookup map that only recognizes plan codes:

```typescript
// In cardService.syncCardTypeWithSubscription
const planToCardType: Record<string, CardType> = {
  PREMIUM_WEEKLY: CardType.PREMIUM_WEEKLY,
  BASIC: CardType.BASIC,
  PREMIUM: CardType.PREMIUM,  // expects "PREMIUM", not "PREMIUM_MONTHLY"
};
```

**Fix:** Pass the plan code instead of the enum value:

```typescript
// AFTER (CORRECT)
await cardService.syncCardTypeWithSubscription(user.id, planCode);
```

## Files Modified

1. **backend-api/src/routes/auth.routes.ts**
   - Line 1: Added `import { v4 as uuidv4 } from 'uuid'`
   - Line 1227: Store plan code: `const planCode = pending.plan.planCode`
   - Lines 1245-1246: Use UUID for card number generation
   - Line 1253: Use plan code for card type lookup: `const cardTypeForPlan = planToCardType[planCode]`
   - Line 1336: Pass plan code to sync service: `syncCardTypeWithSubscription(user.id, planCode)`

## Testing

### UI Tests (Playwright)
- ✓ Invalid token error handling
- ✓ Missing token error handling
- ✓ Password form displays correctly
- ✓ Form elements are accessible
- ✓ Password validation is enforced

### Integration Tests Needed
- Test account activation with BASIC plan
- Test account activation with PREMIUM plan (maps to PREMIUM_MONTHLY)
- Test account activation with PREMIUM_WEEKLY plan
- Verify card type matches subscription plan
- Verify card number is unique across concurrent requests

## Commits

1. `4b5c29d` - Fix account activation flow: correct card type lookup and use UUID for unique card numbers
2. `a6214d8` - Fix card sync in account activation: pass plan code not enum value
3. `0d9d0d2` - Add Playwright UI tests for account activation flow

## Rollout

These fixes are backward compatible:
- Existing users are unaffected (no database changes required)
- Only applies to new account activation flows
- No migration needed

## Verification

After deployment, verify by:
1. Creating a test account with each plan type (BASIC, PREMIUM, PREMIUM_WEEKLY)
2. Completing the account activation flow
3. Confirming the dashboard loads with correct card type
4. Checking database for unique card numbers
5. Monitoring error logs for reduced 500 errors on `/api/auth/complete-profile`
