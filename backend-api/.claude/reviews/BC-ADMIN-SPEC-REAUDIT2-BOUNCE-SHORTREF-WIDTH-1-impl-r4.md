# BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 — impl-r4

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 460–559
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` lines 1–317 (full file)

## Integration points checked

- `ticketInbound.service.ts:478` → `prisma.helpTicket.findUnique({ where: { shortRef: ref } })` — shortRef guard widened to `>= 4 && <= 32`; consistent with SUBJECT_REF_RE {4,32} and the canonical resolveTicket path.
- `ticketInbound.service.ts:498–503` (count query) → `ticketInbound.service.ts:506–513` (updateMany) — both where-clauses carry identical `ticketId`/`fromEmail`, `alerted: false`, and `createdAt: { gte: 30-day window }` predicates; parity confirmed.
- `ticketInbound.service.ts:524` → `emailService.sendEmail` — assignee email fetched via `include: { assignee: { select: { email, firstName } } }` and forwarded to sendEmail; falls back to ops notification if `alertedAssignee` remains false.
- `tests/…test.ts:275` → `emailService.sendEmail` spy — `jest.spyOn` installed before the third ingest call; `mockRestore()` called after assertion; no spy leak across tests.

## Runtime checks

Not applicable — this is an implementation-level (Step 3) code audit, not a Step 4 task-level audit. No runtime checks required.

## Verdict

approve

## Findings

None.

All r3 findings confirmed resolved:

- **r3 LOW-1 (updateMany missing 30-day scope):** `updateMany` where-clause at service lines 506–512 now exactly mirrors the count query at lines 498–504, including `createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }`. FIXED.
- **r3 LOW-2 (Test 4 no email dispatch assertion):** `jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined)` installed at test line 275; `expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({ to: assignee.email }))` asserted at line 289. FIXED.

Spec coverage:

- **§6.2 / Clash 7.1 shortRef width:** Guard at service line 478 changed to `ref.length >= 4 && ref.length <= 32`. Tests 1 (8-char) and 2 (12-char) exercise baseline and widened paths. CONFIRMED.
- **§11.2 3+ unalerted bounces → flip alerted + alert assignee:** `updateMany` with 30-day scope at lines 506–512 flips all matching rows; assignee alert dispatched at lines 524–530; Test 4 verifies both the `alerted=true` flip (lines 306–314) and email dispatch (line 289). CONFIRMED.

## Brief items I disagreed with

None.

## Suggestions

- **Pre-existing non-atomic count/updateMany race:** The count at line 498 and the updateMany at line 506 are two separate DB round-trips with no transaction or advisory lock. Two concurrent bounce ingests for the same ticket could both observe `bounceCount >= 3` and each send an assignee alert, resulting in duplicate emails. This defect predates the current fix set and is outside the scope of this task; flagging for a future task. Suggested fix: wrap lines 498–513 in a `prisma.$transaction` or use an upsert-style `updateMany` with a `count` subquery.
- **Clock jitter in 30-day window:** `Date.now()` is evaluated independently at lines 502 and 510. On extremely busy systems the two evaluations could differ by milliseconds. In practice this is imperceptible and poses no real risk; a single constant captured before both calls would make the intent clearer.
