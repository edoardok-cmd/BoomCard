# BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 — impl-r3

**Reviewer:** claude-sonnet-4-6 (independent)
**Date:** 2026-06-27
**Round:** 3

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 80–230
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 330–345
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 460–555
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` lines 1–305 (entire file)

---

## Integration points checked

- `ticketInbound.service.ts:478` → `prisma.helpTicket.findUnique({ where: { shortRef: ref } })` — widened guard `ref.length >= 4 && ref.length <= 32` matches canonical resolver at lines 337–340 exactly.
- `ticketInbound.service.ts:80` `SUBJECT_REF_RE = /\[#([a-f0-9]{4,32})\]/i` → bounce path `subjectMatch[1]` at line 471 — regex capture group range {4,32} is consistent with both the canonical guard and the fixed bounce guard.
- `ticketInbound.service.ts:486–512` → `prisma.inboundBounce.create` then `prisma.inboundBounce.count` — the create happens before the count, so the newly written row is included in the threshold evaluation (count will be 3 on the 3rd ingest).
- `tests/integration/.../test.ts:247–303` → `prisma.inboundBounce.create` pre-seed + `ingestInboundEmail` + `prisma.inboundBounce.findMany` verify — test exercises the live DB code path including the `updateMany` flip.

---

## Runtime checks

Not applicable — this is a Step 3 (code-level) audit, not a Step 4 task-level audit.

---

## Verdict

`request-changes`

---

## Findings

### LOW-1 — `updateMany` flips all historic unalerted bounces, not just the 30-day window that triggered the threshold

**File:** `ticketInbound.service.ts` lines 506–512

The `bounceCount` query (line 498–504) correctly scopes the threshold check to `alerted: false AND createdAt >= 30 days ago`. However, the `updateMany` that marks rows as alerted (lines 506–512) uses only `{ ticketId: relatedTicketId, alerted: false }` — no `createdAt` filter. This means when the threshold fires on the 30-day window, ALL historic unalerted bounce rows for the ticket (including those older than 30 days) are silently flipped.

Spec §11.2 states: "3+ unalerted bounces in 30 days → flip alerted=true". The most natural reading is that the flip applies to the same set that triggered the count. Flipping rows outside the 30-day window prevents them from ever contributing to a future threshold crossing — a future run of 3+ bounces outside the window would see 0 historic rows to count against, but the older rows have been irreversibly marked alerted, which may suppress legitimate future re-alerts.

**Severity:** LOW

**Fix:** Add the same `createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }` filter to the `updateMany` WHERE clause, mirroring the count query.

---

### LOW-2 — Test 4 does not assert assignee-alert email was attempted; silent emailService failure would not fail the test

**File:** `tests/integration/.../bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` lines 227–304

Test 4 sets `assigneeId` so the assignee-alert branch at `ticketInbound.service.ts:516–533` is reachable, and the test verifies DB state (`alerted: true` rows). However, `emailService.sendEmail` is not mocked — if it fails silently (the `catch` at line 531 swallows the error), the test still passes. This means the test does not verify that the alert email was actually dispatched to the assignee, only that the DB rows were updated.

The brief tagged this as "FIXED" after r2 added Test 4. While the DB-state assertion is correct and the code branch is exercised, the assignee-alert emission itself has zero coverage. An outage in `emailService` would be masked.

**Severity:** LOW

**Fix:** Either mock `emailService.sendEmail` with a spy and assert it was called once with the assignee's email, or document in the test comment that email-dispatch coverage is deferred to unit/email-service tests.

---

## Prior round findings status

- r1 LOW: `fakeUuid` dead code + unused `beforeEach` — **FIXED** (confirmed absent from current test file).
- r2 LOW: §11.2 assignee-alert branch zero coverage — **PARTIALLY FIXED**: Test 4 added and exercises the DB-state path. The assignee email-dispatch is reached but not asserted (see LOW-2 above).

---

## Brief items I disagreed with

None. The brief did not carry any "deferred" or "MVP-acceptable" tags into this round.

---

## Suggestions

- The pre-seed bounce rows in Test 4 use `prisma.user.findFirst` twice (lines 232–245) to get `assignee` and `admin` separately; both queries pick the earliest admin. A single query would suffice since the same row is used for both `userId` and `assigneeId`. This is a non-defect style observation.
- The alert email subject at line 525 contains Cyrillic (`Неуспешна доставка за заявка`). If `emailService` normalises headers to ASCII, this may produce encoded subjects. Not a bug in the service code, but worth validating against the email transport in use.
