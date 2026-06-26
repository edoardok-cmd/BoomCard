# BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 — impl r2

## Files read

- `src/services/ticketInbound.service.ts` lines 80–230
- `src/services/ticketInbound.service.ts` lines 330–345
- `src/services/ticketInbound.service.ts` lines 460–565
- `tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` lines 1–223 (entire file)

## Integration points checked

- `ticketInbound.service.ts:337` (resolveTicket shortRef guard) → `ticketInbound.service.ts:478` (bounce-path shortRef guard) — both now use `ref.length >= 4 && ref.length <= 32`; guards are symmetric.
- `ticketInbound.service.ts:80` (`SUBJECT_REF_RE = /\[#([a-f0-9]{4,32})\]/i`) → bounce-path guard bounds (4–32) — regex lower bound and guard lower bound are consistent.
- `ticketInbound.service.ts:221–227` (`isBounce()`) → test subjects — all three test subjects trigger `isBounce()` correctly (Test 1 & 2 via `BOUNCE_SUBJECT_RE`; Test 3 via `from.includes('mailer-daemon')`).
- `ticketInbound.service.ts:555` (bounce return value `{ ticketId: '', created: false }`) → test assertion `result.created === false` (line 136) — consistent.
- `afterEach` cleanup order (bounce rows → ticketReply rows → ticket rows) — FK dependency order is correct.

## Runtime checks

This is a Step 3 (implementation-level) review. No runtime checks required.

## Verdict

`request-changes`

## Findings

### LOW — §11.2 assignee-alert branch has zero test coverage

**File:** `tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts`

The three test cases confirm that `inboundBounce.ticketId` is populated correctly after the shortRef-width fix. However, the entire reason the correct `ticketId` association matters is that it gates the §11.2 assignee-alerting path (lines 498–534 of the service): once 3+ unalerted bounces accumulate for the same ticket, the assignee receives an email; otherwise the system falls back to an ops notification.

None of the three tests exercises this path. There is no test that:
- Creates 3 bounce rows for the same ticket (to satisfy `bounceCount >= 3`)
- Verifies the `alerted` flag is flipped to `true`
- Verifies `emailService.sendEmail` (or equivalent) is called with the assignee's address

This is the principal user-visible effect of the fix. Without a test for it, a future regression in that branch (e.g. the threshold query being mis-scoped) would go undetected.

**Minimum required addition:** one test case (can be a 4th `it()` in the same suite) that inserts a ticket with an assigned admin, inserts 3+ bounce rows for that ticket with `alerted: false`, calls `ingestInboundEmail()` with a 4th bounce carrying the widened shortRef, and asserts that all `inboundBounce` rows for that ticket now have `alerted: true` (the email send can be mocked or verified via `emailService` spy).

## Brief items I disagreed with

None. The brief listed only the r1 fix to verify; I agreed it was clean and independently searched for additional defects.

## Suggestions

- **Test fixture fragility (non-blocking):** `createTicketWithShortRef` inserts literal `shortRef` strings (`'deaf1234'`, `'cafe0123dead'`, `'abcd1234'`) that could collide with existing DB rows and produce an opaque unique-constraint error. Adding a random suffix (e.g. `shortRef + '-' + Math.random().toString(36).slice(2, 6)`) and updating the subject match accordingly would make the suite more resilient in a shared test DB. This is a test-robustness suggestion, not a correctness bug.