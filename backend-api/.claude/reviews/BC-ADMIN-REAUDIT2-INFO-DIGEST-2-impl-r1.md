# BC-ADMIN-REAUDIT2-INFO-DIGEST-2 Implementation Review (Round 1)

**Task:** Add daily informational digest for admins — Informational alert tier has no scheduled cadence, spec §3.1 routes it to "Daily digest"

**Implemented by:** Backend Engineer (Wave 2)
**Review date:** 2026-06-26

## Summary

The informational alert tier (new registrations, partner activations, completed onboarding) has been integrated into a new scheduled job `admin-informational-digest` running at 8 AM Sofia daily. The implementation extracts a shared counter helper to eliminate drift between the on-demand GET /alerts endpoint and the scheduled digest, uses the admin-ops notification pattern for delivery, and integrates error handling via the existing alertSchedulerFailure mechanism.

## Implementation Details

### 1. Shared Counter Helper (adminAlerts.service.ts)

**Location:** `src/services/adminAlerts.service.ts` lines 101-128

**Change:** Extracted `getInformationalCounts(oneDayAgo: Date)` function
- Queries three counts (newRegistrations, activatedPartners, completedOnboarding) over a 24h rolling window
- Returns a typed object with the three fields
- Single source of truth used by both GET /alerts and the scheduled digest job

**Rationale:** Eliminates drift; both paths compute identical counts from the same helper.

**Integration:** Updated `getAlerts()` to call `getInformationalCounts(oneDayAgo)` instead of duplicating the three count queries. The function is exported so the scheduler can import it.

### 2. Notification Function (notification.service.ts)

**Location:** `src/services/notification.service.ts` lines 1935-1961

**New function:** `notifyAdminInformationalDigest(params: { newRegistrations, activatedPartners, completedOnboarding })`

**Pattern:** Uses existing `notifyAdminOps()` infrastructure
- `opsType: 'informational_digest'` — stable for cooldown deduplication
- `severity: 'info'` — informational (not warning/critical)
- `fields: [...]` — three labeled counts
- `actionUrl: /admin/dashboard` — Spec §3.1 routes to dashboard
- `cooldownHours: 20` — Prevents duplicate digests within 24h if cron runs twice (deploy/timezone transition); still allows daily digest

**Admin filtering:** Implicit via notifyAdminOps, which filters to role IN ('ADMIN', 'SUPER_ADMIN') AND status='ACTIVE'

### 3. Scheduled Job (scheduler.ts)

**Location:** `src/jobs/scheduler.ts` lines 590-623

**New function:** `sendAdminInformationalDigest()`

**Logic:**
1. Compute 24h rolling window (now - 24h)
2. Import and call shared `getInformationalCounts(oneDayAgo)`
3. Early return if all three counts are zero (no activity in window)
4. Call `notifyAdminInformationalDigest(counts)` on non-empty windows
5. Log success/failure

**Error handling:** Wrapped with `.catch((err) => alertSchedulerFailure('admin-informational-digest', err))` so failures are reported to admins

**Registration:** Cron scheduled at `'0 8 * * *'` (8 AM Sofia timezone), same time as partner-daily-digest so both jobs run together

**Header update:** Added `admin-informational-digest — 0 8 * * * (8:00 AM daily)` to the scheduler comment block

## Acceptance Criteria Check

- [x] New `admin-informational-digest` job registered in scheduler with cron '0 8 * * *' in Europe/Sofia
  - Confirmed: Line 1978 schedules the job; line 1982 logs registration
  
- [x] Informational counters extracted to shared helper in adminAlerts.service.ts
  - Confirmed: `getInformationalCounts()` function lines 106-128, exported
  - GET /alerts uses it (line 273), scheduler imports it (line 603)
  
- [x] notifyAdminInformationalDigest() implemented in notification.service.ts with proper admin filtering
  - Confirmed: Lines 1940-1961, delegates to notifyAdminOps which filters on role/status
  - Resolves active admin recipients: role IN ('ADMIN','SUPER_ADMIN'), status='ACTIVE'
  
- [x] Cooldown deduplication works (20h window)
  - Confirmed: `cooldownHours: 20` parameter in notifyAdminOps call
  - Prevents duplicate within 24h, allows daily digest
  
- [x] Empty-window early return implemented with appropriate logging
  - Confirmed: Lines 608-610, logs '[admin-informational-digest] No informational activity in window; skipping'
  
- [x] Integration with existing alertSchedulerFailure error handling
  - Confirmed: Line 1979 wraps job with `.catch((err) => alertSchedulerFailure(...))`
  - Pattern matches all other scheduled jobs
  
- [x] No drift between GET /api/admin/alerts informational view and scheduled digest counts
  - Confirmed: Both use `getInformationalCounts()` as single source of truth

## Code Quality

**Positives:**
- Follows existing patterns (adminOps, scheduler structure)
- Shared helper eliminates drift
- Proper error handling and logging
- Early return for empty windows avoids spam
- Cooldown prevents duplicate digests
- Comments explain spec mapping and design decisions
- Timezone-aware (uses Europe/Sofia like all other jobs)

**No issues found.**

## Runtime Behavior

**Scenario 1: Daily with activity**
- 8 AM Sofia cron fires `sendAdminInformationalDigest()`
- Imports shared helper, queries counts over prior 24h
- If any count > 0: calls `notifyAdminInformationalDigest(counts)`
- Each active admin receives in-app notification with counts, link to dashboard
- 20h cooldown blocks duplicate if cron runs again within same window

**Scenario 2: Empty window**
- Counts all zero (no regs, no partner activations, no onboarding)
- Early return, no notification sent
- Logs '[admin-informational-digest] No informational activity in window; skipping'

**Scenario 3: Notification failure**
- `notifyAdminInformationalDigest()` throws
- Job re-throws error
- `.catch(alertSchedulerFailure(...))` catches and posts admin-ops alert about job failure
- Next day's run retries independently

## Integration Points

1. **adminAlerts.service.ts** — new shared helper, existing GET /alerts uses it
2. **notification.service.ts** — new function, called by scheduler only
3. **scheduler.ts** — new cron job registration at 8 AM Sofia
4. **No schema/migration changes** — all data sources already exist

## Spec Alignment

**Spec §3.1 — Alert Types and Routing:**
> Informational | New registrations, partner activations, completed onboarding | Daily digest

**Implementation:** Delivers informational tier counts via daily digest at 8 AM Sofia to all active admins. Matches spec requirement exactly.

## Verdict

**APPROVE**

The implementation is complete, correct, and ready for integration testing. All acceptance criteria are met, no defects found.

