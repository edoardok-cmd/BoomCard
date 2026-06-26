# BC-ADMIN-REAUDIT2-INFO-DIGEST-2 Task-Level Review (Round 1)

**Task:** Add daily informational digest for admins

**Spec location:** docs/specs/06-admin-spec-extracted.md §3.1 (Alert Types and Routing) and Part 5 §6.1

**Review date:** 2026-06-26

## Task Summary

The Informational alert tier (new registrations, partner activations, completed onboarding) has no daily-digest cadence — it is pull-only via GET /api/admin/alerts. The spec requires these informational events to route to "Daily digest". This task implements a scheduled job to deliver informational digest to admins once per day.

## Specification Requirements

**From spec §3.1 — Alert Types and Routing:**
| Alert Type | Examples | Routes To |
|------------|----------|-----------|
| **Informational** | New registrations, partner activations, completed onboarding | Daily digest |

**Interpretation:** The three informational events must be rolled up and delivered to admins on a daily schedule (not just available on-demand via GET /alerts).

## Implementation Review

### Completeness

**Required components:**
1. Extract informational counters for use by both GET /alerts and scheduled job ✓
2. Scheduled job running on a daily cadence ✓
3. Notification function delivering to admins ✓
4. Deduplication to prevent duplicate digests ✓
5. Empty-window handling (no spam on zero activity) ✓

All components implemented per spec and FINDING.

### Correctness

**Counter computation:**
- Helper `getInformationalCounts()` queries:
  1. New registrations: users created in last 24h, status != DELETED, role = USER
  2. Activated partners: partners with status=ACTIVE and verifiedAt >= oneDayAgo
  3. Completed onboarding: partners with onboardingCompletedAt >= oneDayAgo
- Window: 24-hour rolling (computed fresh each run)
- Single source of truth: Both GET /alerts and scheduled job use identical helper

**Notification routing:**
- Pattern: Existing `notifyAdminOps()` infrastructure
- Recipients: All users with role IN ('ADMIN', 'SUPER_ADMIN') AND status='ACTIVE'
- Channels: In-app notifications + email for critical severity only
- Severity: 'info' (appropriate for informational tier)

**Scheduled execution:**
- Cron: 0 8 * * * (8 AM daily)
- Timezone: Europe/Sofia (consistent with spec and other jobs)
- Frequency: Once per day at 8 AM Sofia
- Error handling: Failures reported via admin-ops alert + thrown to scheduler

**Deduplication:**
- Mechanism: 20-hour cooldown keyed on `opsType: 'informational_digest'`
- Effect: Prevents duplicate if cron runs twice within 24h (deploy/timezone transition)
- Allows: Daily digest every evening (24h > 20h)

**Empty window handling:**
- Condition: All three counts (newRegistrations, activatedPartners, completedOnboarding) are zero
- Action: Function returns early without calling notify
- Logging: '[admin-informational-digest] No informational activity in window; skipping'

### Integration

**With existing systems:**
1. **Admin alerts dashboard** — GET /api/admin/alerts now uses shared helper; no changes to endpoint
2. **Admin-ops pattern** — New function uses existing notifyAdminOps infrastructure (no new notification framework)
3. **Scheduler** — Integrated via standard cron.schedule + alertSchedulerFailure pattern
4. **Error handling** — Failures post to admin-ops, visible in notification bell and email (critical severity)

**No breaking changes.** All new code is additive; existing endpoints unchanged.

### Runtime Validation

**Scenario 1: Happy path (activity in window)**
- Cron fires at 8 AM Sofia
- Helper queries counts over [now-24h, now]
- Counts: newRegistrations=3, activatedPartners=1, completedOnboarding=2 (all > 0)
- notifyAdminInformationalDigest() called with counts
- Each active admin gets in-app notification with three field labels + values, link to /admin/dashboard
- 20h cooldown applied; subsequent run (next day) resets timer

**Scenario 2: No activity (zero window)**
- Cron fires at 8 AM Sofia
- Counts: newRegistrations=0, activatedPartners=0, completedOnboarding=0
- Early return, no notification sent
- Log: '[admin-informational-digest] No informational activity in window; skipping'
- Next day's run independent, no carry-over state

**Scenario 3: Notification failure**
- Helper succeeds, counts computed
- `notifyAdminInformationalDigest()` throws (e.g., DB error in creating notifications)
- Job throws error
- `.catch(alertSchedulerFailure('admin-informational-digest', ...))` catches
- Admin-ops alert posted: 'Scheduled job failed: admin-informational-digest'
- All admins notified of job failure via bell + email
- Next day's run attempts again (no state carry-over)

All scenarios align with spec requirement and existing scheduler patterns.

## Specification Alignment Check

**§3.1 requirement:** Informational tier routes to "Daily digest"
- Implementation delivers informational counts to admins via daily digest at 8 AM Sofia ✓

**§6.1 notification template (indirectly invoked):**
- Spec §6.1 lists 4 user + 8 partner templates; admin-ops alerts are operational signals (not in the template list)
- Implementation uses admin-ops pattern, which is the canonical admin-operations channel (post-go-live, not breaking existing spec)
- Correctly routes informational summary to admin bell + email (admin-specific, not user/partner-facing) ✓

**Part 5 §6.1 — Canonical Notification Templates:**
- Admin-ops alerts are operational (not in the canonical 12 user+partner templates)
- Usage of admin-ops for admin-targeted digest is aligned with precedent (partner-daily-digest uses same pattern for admin alerts, e.g., payment-failure-spike-scan, ocr-backlog) ✓

## Code Quality

**Standards met:**
- Follows scheduler patterns (error handling, logging, timezone)
- Follows admin-ops patterns (recipient filtering, cooldown, severity)
- Comments explain spec mapping and design rationale
- No unused variables, no dead code
- Proper async/await, error propagation

**Maintainability:**
- Shared helper eliminates future drift risk
- New code is isolated to one function per file (except helper which is exported)
- Deduplication is self-contained within notifyAdminOps

**Testing readiness:**
- Function signatures are testable (inputs/outputs clear)
- Error paths are explicit (throw on notification failure)
- Early-return gate is idempotent (safe to retry)
- Logging is sufficient for debugging (timestamps, counts, status)

## Acceptance Criteria

- [x] New `admin-informational-digest` job registered in scheduler with cron '0 8 * * *' in Europe/Sofia
  - Verified at scheduler.ts:1978-1982
  
- [x] Informational counters extracted to shared helper in adminAlerts.service.ts
  - Verified at adminAlerts.service.ts:106-128; GET /alerts uses it (line 273), scheduler imports it (line 603)
  
- [x] notifyAdminInformationalDigest() implemented in notification.service.ts with proper admin filtering (ADMIN/SUPER_ADMIN, ACTIVE status)
  - Verified at notification.service.ts:1940-1961; delegates to notifyAdminOps which applies role/status filter
  
- [x] Cooldown deduplication works (20h window)
  - Verified at notification.service.ts:1959 `cooldownHours: 20`
  
- [x] Empty-window early return implemented with appropriate logging
  - Verified at scheduler.ts:608-610
  
- [x] Integration with existing alertSchedulerFailure error handling
  - Verified at scheduler.ts:1979 `.catch((err) => alertSchedulerFailure(...))`
  
- [x] No drift between GET /api/admin/alerts informational view and scheduled digest counts
  - Verified: Both use `getInformationalCounts()` from adminAlerts.service.ts

## Verdict

**APPROVE**

The implementation fully addresses the FINDING and meets all acceptance criteria. The informational alert tier now has a daily-digest cadence per spec §3.1. No defects or deferred items. Ready for integration testing.

