# BC-ADMIN-SPEC-REAUDIT-F — Domain F (Help Request system + Email threading / office@) — r1

Independent re-audit. Scope: §1.7, §3.8, Part 6, Clash 7.1/7.2/8.1/8.3, §7.1, §7.2.
Read-only. Verdict at bottom.

## Summary

Domain F is in strong shape. All prior-wave concerns were independently re-verified
as resolved in the current code AND at runtime against the live server (127.0.0.1:3025):

- **HELP-NEWSTATUS-CLAIM** — canonical "New" is reachable. `toCanonicalRequestStatus`
  maps `OPEN + assigneeId=null → New`, and `toRawStatusFilter('New')` returns
  `OR[ NEW, (OPEN AND assigneeId=null) ]`. Runtime: `?status=New` returned 32 tickets
  (27 unassigned OPEN + 5 legacy NEW). The self-claim gate in `POST /:id/assign`
  (lines 491-518) lets a `help.write`-only admin claim an unassigned ticket but blocks
  silent claim-stealing of an already-claimed ticket (non-SUPER_ADMIN → 403).
- **HELP-STATUS-FILTER (×2)** — invalid `?status=` is rejected with 400 (`Невалиден статус`),
  not silently unfiltered. Runtime confirmed (`?status=Bogus` → 400). Cancelled/Closed
  buckets are no longer fragmented: `?status=Cancelled` returned CANCELLED+REJECTED;
  `?status=Closed` returned CLOSED (and would include RESOLVED).
- **HELP-CHANGE-BUCKET** — `?requestType=CHANGE` returns CHANGE + all `*_CHANGE` subtypes
  (runtime: CHANGE + CONTRACT_CHANGE). Fragmentation prevented.
- **HELP-CANCEL-BACKDOOR** — `PATCH /:id` blocks both `status=CANCELLED` and `status=REJECTED`
  with 400, forcing callers through the accountability-gated dedicated endpoints. Runtime
  confirmed both return 400.
- **TICKET-WITHDRAW** — requester-facing withdraw→CANCELLED exists (`help.routes.ts:341`
  `POST /tickets/:id/cancel`, terminal-guarded).
- **TICKET-SHORTREF / -BACKFILL / -REGEX / BOUNCE-SHORTREF-WIDTH** — one shared
  `SUBJECT_REF_RE = /\[#([a-f0-9]{4,32})\]/i` is imported and used by adminHelp, help,
  partnerHelp, ticketEmail, helpTicketIntake, and ticketInbound. The bounce lookup
  (ticketInbound.service.ts:478) uses the same `ref.length >= 4 && ref.length <= 32`
  width as the resolver (lines 337) and plus-address path. Collision-widening retry
  (8→12→16→32) is implemented in the inbound path with ops escalation + rollback.
- **Plus-addressing deferral (Clash 7.1)** — gated behind `isPlusAddressingEnabled()`
  (default OFF). Both the outbound Reply-To suffix and the inbound Priority-3 resolver
  are disabled in v1.2. Threading relies solely on `X-BoomCard-Request-ID` header
  (primary, emitted on every outbound) and `[#XXXX]` subject fallback. Conforms.
- **CONTACT-HELPREQ** — `contact.routes.ts` now creates a unified Help Request via
  `createHelpTicketFromInbound` (helpTicketIntake.service.ts) before optionally emailing.
  Spec §3.8 / §1.7 satisfied (form ⇒ Help Request, not email-only).
- **TICKET-CC spoof allowlist** — `ingestInboundEmail` records only CC addresses that
  resolve to ADMIN/SUPER_ADMIN accounts (`resolveAdminCcEmails`), folded into the
  spoof allow-set; non-admin CC is intentionally not recorded. Non-allowed senders
  get a linked ticket, never injected into the original conversation.
- **office@ dual role (Clash 8.3)** — office@ is the inbound mailbox and the
  partner reply-to; outbound + inbound both active. Audience derived from sender role,
  not recipient mailbox (resolveInboundAudience).
- **No SLA leakage** — no SLA/deadline logic on help requests (distinct from Partner
  Applications). Confirmed by grep.

## Findings

### F1 — LOW — `?requestType=` filter rejects the canonical `Change` value the API itself emits
**File:** `src/routes/adminHelp.routes.ts:80, 295-306` (and the `/mine` mirror, 380-391)
**Spec ref:** §1.7 / §7.1 / Clash 8.2 (canonical Request Type set: Support/Dispute/Change/Other)

The list/detail responses surface `canonicalRequestType` ('Support' | 'Dispute' |
'Change' | 'Other') via `withCanonicalRequestType` (lines 340, 409, 462). However the
`?requestType=` filter validates against `ADMIN_VALID_REQUEST_TYPES`, which contains
only the raw enum tokens (`SUPPORT`, `DISPUTE`, `CHANGE`, `DATA_CHANGE`, ...). The
canonical title-case forms are NOT accepted.

Evidence (runtime, live server):
```
GET /api/admin/help?requestType=Change  → 400 {"error":"Невалиден тип заявка"}
GET /api/admin/help?requestType=CHANGE  → 200 total=4 {CHANGE:3, CONTRACT_CHANGE:1}
```

This is an asymmetry against the **status** filter, which was explicitly fixed to accept
BOTH canonical title-case and raw enum forms (`VALID_STATUS_TOKENS` includes 'In Progress',
'New', 'Waiting' alongside the enum values — lines 87-90). A client that reads
`canonicalRequestType: 'Change'` from a list row and round-trips it as a filter param
(the natural contract) receives a 400.

Why this is a finding and not merely cosmetic: the prior CHANGE-BUCKET wave's intent was
that filtering by the canonical Change bucket returns all `*_CHANGE` rows un-fragmented.
That goal is only met when the filter is invoked with the uppercase enum token; the
canonical projection value the API publishes does not work. It fails safe (400, never a
silent unfiltered result), so it is LOW, not higher.

**Fix:** Mirror the status-filter approach — accept the canonical `Change`/`Support`/
`Dispute`/`Other` title-case forms in the requestType validation and expansion (map
'Change' → the `{ in: ['CHANGE','DATA_CHANGE','LOCATION_CHANGE','CONTRACT_CHANGE'] }`
branch), or document that only raw enum tokens are accepted and have the frontend send
the raw `requestType` rather than `canonicalRequestType`.

### F2 — LOW — Web-form intake shortRef has no collision-retry; on P2002 it silently leaves shortRef NULL
**File:** `src/services/helpTicketIntake.service.ts:223-231`
**Spec ref:** §3.8 / Part 6 (subject-fallback threading); prior wave TICKET-SHORTREF

The inbound-email path uses `persistShortRefWithCollisionRetry` (8→12→16→32 with ops
escalation and ticket rollback on total failure — ticketInbound.service.ts:124-169).
The web-form intake path (contact form → Help Request) instead calls
`computeShortRef(ticket.id)` (base 8-char only) inside a `.catch()` that merely logs a
warning and continues:

```
await prisma.helpTicket.update({
  where: { id: ticket.id },
  data: { shortRef: computeShortRef(ticket.id) },
}).catch((err) => logger.warn(`[helpTicketIntake] shortRef update failed ... (possible collision)`, err));
```

On an 8-char-prefix collision (the exact scenario the inbound retry loop was built to
handle), the web-form ticket is created with `shortRef = NULL`. Subject-prefix threading
(`[#XXXX]`) for that ticket then fails, and a customer reply that only carries the subject
marker (header stripped by forwarding/webmail) creates a duplicate ticket — precisely the
failure mode TICKET-SHORTREF was filed to eliminate. The collision probability is the same
birthday risk the inbound author flagged as "non-trivial at scale (low tens of thousands)".
Header (X-BoomCard-Request-ID) and In-Reply-To threading still work, bounding the damage,
hence LOW.

Note: `helpTicketIntake.service.ts` is not in my explicitly-listed owned files, but it is
the producer half of the CONTACT-HELPREQ integration I was asked to verify (contact form ⇒
unified Help Request) and shares the shortRef contract, so I surface it here rather than
omit it.

**Fix:** Reuse `persistShortRefWithCollisionRetry` (export it from ticketInbound.service)
in the web-form intake path so all three creation paths (inbound, spoof-linked, web-form)
have identical collision handling.

### F3 — LOW — contact.routes.ts computes a divergent ad-hoc shortRef for the admin-notification email
**File:** `src/routes/contact.routes.ts:75-81`
**Spec ref:** Part 6 / Clash 7.1 (one shared shortRef/regex everywhere); prior wave HELP-REF-REGEX

The admin-notification email built in `contact.routes.ts` derives its displayed reference
independently: `const shortRef = ticketId.replace(/-/g, '').slice(0, 8)` → `[#${shortRef}]`.
This bypasses `computeShortRef`/`buildTicketSubject` and, more importantly, ignores the
shortRef actually persisted on the ticket. If F2's collision path ever widened the
persisted ref (it currently cannot, but the canonical fix would), or if the persisted ref
is NULL (F2), the admin email shows a `[#XXXX]` marker that does not match the indexed
`shortRef` column. A reply to that admin notification carrying this subject marker would
miss the indexed lookup. Today the values coincide (both 8-char prefix), so impact is
latent; it is the "ad-hoc regex/derivation instead of shared helper" anti-pattern the
HELP-REF-REGEX wave sought to stamp out.

**Fix:** Build the admin-notification subject/reference from the same persisted shortRef /
`buildTicketSubject(ticketId, ...)` helper used everywhere else, rather than recomputing
the prefix inline.

## Runtime checks

Live server: `http://127.0.0.1:3025` (health: `{"status":"ok","environment":"development"}`).
Auth: `POST /api/auth/login {email:admin@boomcard.bg, password:admin123, clientType:web}`
→ SUPER_ADMIN token (note: `clientType:"web"` is required or login 400s).

| Command | Observed | Verdict |
|---|---|---|
| `GET /api/admin/help?status=New&limit=3` | 200, total=32, rows `OPEN/requestStatus:New/assignee:null` | New bucket reachable ✓ |
| `GET /api/admin/help?status=Bogus` | 400 `Невалиден статус` | no silent unfilter ✓ |
| `GET /api/admin/help?requestType=Bogus` | 400 `Невалиден тип заявка` | validated ✓ |
| `GET /api/admin/help?status=Cancelled&limit=100` | 200, raw {CANCELLED:5, REJECTED:1} | bucket un-fragmented ✓ |
| `GET /api/admin/help?status=Closed&limit=100` | 200, raw {CLOSED:3} | maps canonically ✓ |
| `GET /api/admin/help?requestType=CHANGE&limit=100` | 200, raw {CHANGE:3, CONTRACT_CHANGE:1} | subtypes included ✓ |
| `GET /api/admin/help?requestType=Change&limit=100` | **400 `Невалиден тип заявка`** | **F1 (canonical form rejected)** |
| `PATCH /api/admin/help/:id {status:CANCELLED}` | 400 (use /cancel) | back-door closed ✓ |
| `PATCH /api/admin/help/:id {status:REJECTED}` | 400 (use /reject) | back-door closed ✓ |
| `GET /api/admin/help?limit=100` | total=41, raw {OPEN:27, NEW:5, CANCELLED:5, CLOSED:3, REJECTED:1} → canonical {New:32, Cancelled:6, Closed:3} | projection consistent ✓ |

(In Progress / Waiting buckets returned 0 — no data of those raw statuses exists in the
DB, not a mapping bug.)

## Integration points checked

- `adminHelp.routes.ts:8,14` → `ticketEmail.service.ts` / `ticketInbound.service.ts` —
  imports `SUBJECT_REF_RE`, `buildTicketSubject`, `toRawStatusFilter`,
  `withCanonicalRequestStatus`, `withCanonicalRequestType`, `computeShortRef`. Verified
  the canonical projection (`toCanonicalRequestStatus`) and the filter expansion
  (`toRawStatusFilter`) agree for every bucket (New/In Progress/Waiting/Closed/Cancelled).
- `emailWebhook.routes.ts:150-152` → `ticketInbound.service.ts:257` — webhook normalises
  `xBoomCardRequestId → xBoomCardTicketId`; resolver Priority-1 reads
  `xBoomCardTicketId || xBoomCardRequestId`. Alias threads at Priority 1 either way. ✓
- `ticketEmail.service.ts:341-342` (`buildTicketHeaders`) → `ticketInbound.service.ts:257`
  (`resolveTicket` Priority 1) — outbound emits both `X-BoomCard-Request-ID` and legacy
  `X-BoomCard-Ticket-ID`; inbound reads both. ✓
- `contact.routes.ts:55` → `helpTicketIntake.service.ts:166` `createHelpTicketFromInbound`
  — form submission creates a unified Help Request (source=WEB) then optionally emails.
  CONTACT-HELPREQ satisfied. (F2/F3 surfaced on the shortRef contract of this pair.)
- `ticketInbound.service.ts` spoof path (715-815) ↔ `recordTicketCcs` / `resolveAdminCcEmails`
  (186-219) — CC admin allowlist correctly gates the spoof set; non-allowed sender → linked
  ticket owned by system admin. ✓
- `email.service.ts:355-360` (`sendEmail` audience reply-to) ↔ ticket callers passing
  `audience:'partner'` — partner emails resolve `partner_reply_to_email` → office_email
  fallback; subscriber emails use `reply_to_email`. office@ dual-role consistent. ✓

## Verdict

request-changes

Three LOW findings, all must-fix per the workspace severity rule (no nice-to-have tier).
None are CRITICAL/HIGH; the help system's state machine, threading priority ladder, spoof
protection, PATCH back-door closure, and canonical status mapping are all sound and
runtime-verified. The findings are contract-consistency gaps: F1 (canonical requestType
filter value rejected), F2 (web-form intake lacks shortRef collision retry), F3 (ad-hoc
shortRef recompute in contact email).

### Files read
- src/routes/adminHelp.routes.ts (1-1023, 1024-1262) — full
- src/services/ticketEmail.service.ts (1-352) — full
- src/services/ticketInbound.service.ts (1-1026) — full
- src/routes/emailWebhook.routes.ts (1-164) — full
- src/services/email.service.ts (1-947 read; relevant `sendEmail`/audience logic at 16-30,
  340-384 — remainder is unrelated transactional-template HTML generation, out of Domain F)
- src/routes/contact.routes.ts (1-121) — full (integration producer)
- src/services/helpTicketIntake.service.ts (1-257) — full (integration producer)

### Suggestions
- None beyond the fixes above.

### Out-of-scope flags
- None.

### Brief items I disagreed with
- None. The brief's framing was neutral; I independently confirmed each prior-wave item
  rather than accepting it as pre-verified.
