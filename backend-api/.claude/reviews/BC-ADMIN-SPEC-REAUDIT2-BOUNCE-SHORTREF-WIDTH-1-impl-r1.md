# BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 — Implementation Review r1

## Verdict
request-changes

## Files read
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 80–230 (isBounce, SUBJECT_REF_RE, InboundEmailPayload, persistShortRefWithCollisionRetry, recordTicketCcs, resolveAdminCcEmails)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 330–345 (canonical resolveTicket shortRef lookup)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 460–554 (bounce block)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` lines 1–231 (entire file)
- `/Users/administrator/Documents/BoomCard/backend-api/prisma/schema.prisma` lines 1687–1696 (TicketCC model — FK cascade check)
- `/Users/administrator/Documents/BoomCard/backend-api/prisma/schema.prisma` lines 1923–1936 (InboundBounce model — FK check)

## Integration points checked
- `ticketInbound.service.ts:469–483` → `prisma.helpTicket.findUnique({ where: { shortRef: ref } })` — verified bounce path now uses `ref.length >= 4 && ref.length <= 32`, mirroring canonical resolver at lines 337–340.
- `ticketInbound.service.ts:222–227` (isBounce) → test payloads: Test 1 `mailer-daemon@…` triggers `from.includes('mailer-daemon')`; Test 2 `postmaster@…` triggers `from.startsWith('postmaster@')`; Test 3 `mailer-daemon@…` same — all correctly routed to bounce path.
- `SUBJECT_REF_RE` at line 80 (`/\[#([a-f0-9]{4,32})\]/i`) → Test 3 subject `[#abc]` (3 chars) correctly produces null subjectMatch per `{4,32}` quantifier.
- `schema.prisma:1692` (TicketCC `onDelete: Cascade`) → test cleanup deletes HelpTicket without explicit TicketCC deletion — safe.
- `schema.prisma:1923–1936` (InboundBounce has no FK @relation on ticketId) → bounce rows not cascade-deleted, test must delete them explicitly — test does so at lines 103–108.

## Runtime checks
This is a Step 3 (implementation-level) audit. Runtime checks are not required at this level. The tests are integration tests that must be run against a seeded DB.

## Findings

### LOW — Dead code: `fakeUuid` helper defined but never called
**File:** `tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` line 46–49

`fakeUuid(prefix: string)` is defined but has zero call sites in the file. It was presumably scaffolded during development and never used (the tests create tickets via `createTicketWithShortRef` without needing UUID control). TypeScript `noUnusedLocals` (if enabled) would fail the build; even if not, dead code in a test file misleads future readers who may expect it to be meaningful. It should be removed.

## Brief items I disagreed with
None. The brief's characterisation of the defect (old `ref.length <= 8` guard), the required fix (`ref.length >= 4 && ref.length <= 32`), and the three required test cases all match the implementation exactly. No deferred items in the brief to dispute.

## Suggestions
- The `beforeEach` symbol is imported at line 29 but unused. Removing it alongside `fakeUuid` would make the import line cleaner (`import { describe, it, expect, afterEach } from '@jest/globals'`). This is a style nit that does not gate approval on its own, but since a change is needed for the `fakeUuid` dead-code finding, it can be resolved in the same pass.
- Consider adding a Test 4 covering a 32-char widened shortRef (the maximum collision-widened length per `computeShortRefOfLength` attempt=4) to ensure full coverage of the `{4,32}` range. The spec only required baseline (8), widened (12), and sub-minimum (3), so this is optional.
