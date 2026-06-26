# BC-ADMIN-SPEC-REAUDIT2-BOUNCE-SHORTREF-WIDTH-1 — Task-Level Audit r1

**Verdict: approve**

---

## Files read

- `/Users/administrator/Documents/BoomCard/backend-api/src/services/ticketInbound.service.ts` lines 1–169, 222–244, 330–345, 460–557
- `/Users/administrator/Documents/BoomCard/backend-api/src/routes/emailWebhook.routes.ts` lines 1–165 (entire file)
- `/Users/administrator/Documents/BoomCard/backend-api/tests/integration/bc-admin-spec-reaudit2-bounce-shortref-width-1.integration.test.ts` lines 1–317 (entire file)

---

## Runtime checks

All checks run against `http://127.0.0.1:5199`. API confirmed running (`{"status":"ok","environment":"development"}`). `ALLOW_UNSIGNED_WEBHOOK=1` in effect — no signature required.

**Check 1 — 8-char shortRef (baseline)**

```
curl -X POST http://127.0.0.1:5199/api/email/inbound \
  -H "Content-Type: application/json" \
  -d '{"from":"mailer-daemon@mail.example.com","to":"support@boomcard.bg",
       "subject":"[#804683d6] Delivery Status Notification",
       "text":"Your message could not be delivered.",
       "messageId":"<bounce-runtime-test-1@test.invalid>"}'
```

Response: `{"ok":true,"ticketId":"","created":false}`
DB verify: `InboundBounce.ticketId = 804683d6-f399-4219-9fcd-55fa3fbb17be` (correct association).

**Check 2 — 12-char widened shortRef (bug fix path)**

Created a ticket with `shortRef=cafe0123dead` in boomcard_test, then:

```
curl -X POST http://127.0.0.1:5199/api/email/inbound \
  -d '{"from":"postmaster@mail.example.com","to":"support@boomcard.bg",
       "subject":"[#cafe0123dead] Delivery Status Notification",
       "text":"This address does not exist.",
       "messageId":"<bounce-runtime-test-2@test.invalid>"}'
```

Response: `{"ok":true,"ticketId":"","created":false}`
DB verify: `InboundBounce.ticketId = 62ba084a-c2d1-44bc-8fb8-3974db11911f`, `shortRef=cafe0123dead` (correct association — bug is fixed).

**Check 3 — 3-char ref (below SUBJECT_REF_RE minimum)**

```
curl -X POST http://127.0.0.1:5199/api/email/inbound \
  -d '{"from":"mailer-daemon@unrelated.invalid","to":"support@boomcard.bg",
       "subject":"[#abc] Delivery Status Notification",
       "text":"Undeliverable.",
       "messageId":"<bounce-runtime-test-3@test.invalid>"}'
```

Response: `{"ok":true,"ticketId":"","created":false}`
DB verify: `InboundBounce.ticketId = NULL` (regex did not match; no association — correct).

**Check 4 — pre-existing DB shortRef**

```
curl -X POST http://127.0.0.1:5199/api/email/inbound \
  -d '{"from":"mailer-daemon@existing.example.com","to":"support@boomcard.bg",
       "subject":"[#bf57a883] Delivery Status Notification (Undeliverable)",
       "text":"bounce","messageId":"<bounce-runtime-test-4@test.invalid>"}'
```

Response: `{"ok":true,"ticketId":"","created":false}`
DB verify: `InboundBounce.ticketId = bf57a883-4782-462f-a05e-0bc74ae3d3ab` (correct association using pre-seeded real ticket row).

All 4 runtime checks passed.

---

## Integration points checked

- `emailWebhook.routes.ts:123-162` → `ticketInbound.service.ts:ingestInboundEmail` — route invokes service, parses Buffer body, maps `xBoomCardRequestId` → `xBoomCardTicketId` alias, returns HTTP 200/201 based on `result.created`
- `emailWebhook.routes.ts:105-115 isValidPayload` → `ticketInbound.service.ts:InboundEmailPayload` — interface fields exactly match validator (from, to, subject, text, messageId all required strings)
- `emailWebhook.routes.ts:54-103 verifyAuth` → `ALLOW_UNSIGNED_WEBHOOK` env var — confirmed dev bypass is correctly gated on explicit opt-in (not merely absent secrets)
- `ticketInbound.service.ts:80 SUBJECT_REF_RE` (`{4,32}`) → bounce path line 478 guard (`>= 4 && <= 32`) — symmetrical: any regex capture satisfies the guard; guard is a defensive mirror of the main resolver at line 337
- `ticketInbound.service.ts:469 subjectMatch` → `prisma.helpTicket.findUnique({ where: { shortRef } })` — verified `HelpTicket_shortRef_key UNIQUE` index exists in boomcard_test DB; query is O(1)
- `ticketInbound.service.ts:498-512 bounceCount query` → `updateMany` scope — both use identical `where` clause (ticketId or fromEmail + alerted:false + 30-day window); scope mismatch fixed
- `ticketInbound.service.ts:519-530 assignee alert` → `emailService.sendEmail` — fires only when `relatedTicketId` is set AND ticket has an assigned user with email; falls back to `notificationService.notifyAdminOps` otherwise
- `tests/integration/...:61-87 createTicketWithShortRef` → `prisma.helpTicket.create` with explicit `shortRef` — bypasses `persistShortRefWithCollisionRetry` to control ref length directly; FK-safe cleanup in `afterEach`

---

## Findings

None.

---

## Brief items I disagreed with

None. All items in the brief were independently verified and are correctly described.

---

## Suggestions

- **Test coverage for 16-char and 32-char non-UUID widened shortRefs:** The collision widening chain is 8→12→16→32. Tests 1 and 2 cover 8 and 12; 16 and 32 exercise the same code path (the `>= 4 && <= 32` guard is identical), so additional tests are not necessary for correctness, but a 32-char non-UUID ref test would document that the full-UUID shortRef (no dashes) also lands in the shortRef lookup branch (line 478) rather than the `findUnique({ where: { id } })` branch (line 474). This would only matter if someone changes the `ref.length === 32` check at line 474 without realizing 32-char shortRefs also hit the else-branch.
- **Count-then-update non-atomicity:** The `bounceCount >= 3` check followed by `updateMany` is not atomic. In the rare event of two concurrent bounces arriving simultaneously for the same ticket at exactly the 3-bounce threshold, both could count >= 3 and both could send the alert. The duplicate-alert risk is low in practice and is a pre-existing pattern (not introduced by this fix). A future improvement would wrap the count + updateMany in a `$transaction`.
