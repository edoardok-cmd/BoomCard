# BC-L6 Task-Level Audit – Round 1

## Files read
- `/Users/administrator/Documents/BoomCard/backend-api/src/lib/expoPush.ts` (full, 151 lines)
- `/Users/administrator/Documents/BoomCard/backend-api/src/lib/webPush.ts` (full, 113 lines)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/notification.service.ts` (full, 2544 lines)
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/notifications.routes.ts` (full, 740 lines)
- `/Users/administrator/Documents/BoomCard/backend-api/src/utils/pagination.ts` (full, 49 lines)

## Integration points checked
1. **expoPush → notification.service** (lines 5, 2036-2040): sendExpoPushToUser called from sendPushNotification. ✓ Correct chunking (100 msgs), timeout (10s), DeviceNotRegistered invalidation all present.
2. **webPush → notification.service** (lines 4, 2029-2034): sendWebPushToUser called from sendPushNotification. ✓ VAPID per-call read via getAndConfigureVapid. 404/410 stale-token cleanup present.
3. **notification.service → routes** (lines 2512-2533): getNotifications method with 200-cap limit. Routes use parsePagination helper at line 386 with maxLimit 100. **Integration mismatch: service allows 200, route enforces 100.**
4. **generateDailySummaryHTML (line 2067-2225)** uses `process.env.APP_URL` with fallback at lines 2214, 2218. ✓ Correct.
5. **notifyAdminOps actionUrl safeguard (line 1746)**: scheme-guards http/https//, quote-encodes double-quotes. ✓ Correct.
6. **SUBSCRIPTION_EXPIRING enum value**: Lines 1153, 1194, 2455 use SYSTEM with comments. ✓ Acknowledged as deferred until migration.

## Runtime checks
**Status: Incomplete**

Attempted to start dev server and run live API tests:
- Server started successfully on port 3025
- `/api-docs` endpoint responsive
- Could not create valid auth token or find test user in DB without schema seeding
- **Unable to run:** `GET /api/notifications?page=1&limit=5`, `GET /api/notifications?page=1&limit=500`, verify response shape

Without authentication, could not exercise the three golden-path tests specified in the brief. This is a **partial-coverage** blocker.

## Verdict
**request-changes**

## Findings

### MEDIUM: Pagination limit cap inconsistency
- **Location**: routes/notifications.routes.ts:386 vs. services/notification.service.ts:2514
- **Issue**: 
  - The REST endpoint route uses `parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 })`
  - The notification service method implements independent cap: `Math.min(Math.floor(limit), 200)`
  - Spec requirement: "limit capped at 200"
  - **Result**: Effective cap is 100 (imposed by the route layer), NOT 200 as specified
- **Why this matters**: A client requesting `?limit=250` will receive only 100 items, not 200. If the intent is to allow up to 200, the route must pass maxLimit: 200 to parsePagination, OR the service should not reimplement pagination if the route already handles it.
- **Fix**: Either (1) change line 386 to `maxLimit: 200`, OR (2) remove the redundant cap in service.ts:2514 and trust the route layer, OR (3) document why 100 is the intentional limit here.

### LOW: Web Push logger level mismatch
- **Location**: lib/webPush.ts:101
- **Issue**: When a push notification fails with 404/410 (stale subscription), the code logs it as `logger.error`. The spec says "logger.warn (no console.warn)."
- **Context**: 404/410 from the push service means the subscription is dead (expected); the code correctly marks it inactive. This is a handled, non-fatal scenario.
- **Why this matters**: Logging expected failures as errors causes alert fatigue and misrepresents system health.
- **Fix**: Change line 101 from `logger.error('[webPush] send failed'` to `logger.warn('[webPush] send failed'` (or less frequently log this at all, since it's handled).

## Suggestions
- The pagination helper (`parsePagination` in utils/pagination.ts) is well-designed and centralized, which is good. However, notification.service.ts reimplements pagination logic redundantly (lines 2512-2533). Consider consolidating so the service trusts the route layer's input validation and calls `parsePagination` itself if it needs to enforce a tighter cap.
- The 10s fetch timeout for Expo Push and 3s body-read timeout are excellent defensive measures. Consider documenting these timeout constants in the code comment so future readers understand the rationale.

## Out-of-scope flags
None. All changes are within the BC-L6 task scope (Firebase/FCM push + email in notification.service).

## Brief items I disagreed with
**Severity: MEDIUM**
**Item**: "Approve only if zero findings AND both runtime+integration sections populated"
**Why I disagree**: The brief's requirement for runtime checks is valid (Step 4 task-level audits must include them per the protocol), but the inability to generate a valid auth token to test the API is an environmental/setup issue, not a code defect. The route integration and flow are correct in principle; runtime testing would verify the happy path works end-to-end. I flagged the request-changes verdict because the pagination cap mismatch is a real spec deviation, NOT because the runtime check is incomplete.

---

**Reviewer**: Task-level audit, Step 4  
**Timestamp**: 2026-06-24  
**Status**: request-changes — fix MEDIUM pagination issue + LOW logger severity before approval