# BoomCard System Surface — Invariant Matrix

**Surface**: System (webhooks / email / integrations / health)
**Routes**: 17 across 4 routers
**Audit scope**: BC-SYSTEM-SPEC-REAUDIT
**Bootstrap date**: 2026-06-30
**Executable sweeps**: `system-webhook-signature-sweep.test.ts` (+ `.teeth`), `system-input-500-sweep.test.ts` (+ `.teeth`), `system-health-leak-sweep.test.ts`, `system-integ-leak-sweep.test.ts`, `system-email-idempotency.test.ts`
**Coverage ledger**: `.claude/reviews/BC-SYSTEM-SPEC-REAUDIT-coverage-ledger.md` (harness workspace — audit bookkeeping read by the completion gate)

> This matrix is the in-repo spec artifact for the system surface. The per-round `verified/open/untested` status of each row is tracked in the harness coverage ledger (above), not here — this file is the stable list of invariants and their executable guards.

---

## Routes in scope

| Method | Path | File |
|--------|------|------|
| POST | `/api/webhooks/stripe` | `src/routes/webhooks.routes.ts` |
| GET | `/api/webhooks/health` | `src/routes/webhooks.routes.ts` |
| POST | `/api/email/inbound` | `src/routes/emailWebhook.routes.ts` |
| GET | `/api/integrations/available` | `src/routes/integrations.routes.ts` |
| GET | `/api/integrations/available/:id` | `src/routes/integrations.routes.ts` |
| GET | `/api/integrations/categories` | `src/routes/integrations.routes.ts` |
| GET | `/api/integrations/connected` | `src/routes/integrations.routes.ts` |
| POST | `/api/integrations/connect` | `src/routes/integrations.routes.ts` |
| DELETE | `/api/integrations/connected/:id` | `src/routes/integrations.routes.ts` |
| POST | `/api/integrations/test/:id` | `src/routes/integrations.routes.ts` |
| GET | `/api/integrations/stats` | `src/routes/integrations.routes.ts` |
| GET | `/api/health/` | `src/routes/health.routes.ts` |
| GET | `/api/health/detailed` | `src/routes/health.routes.ts` |
| GET | `/api/health/ready` | `src/routes/health.routes.ts` |
| GET | `/api/health/metrics` | `src/routes/health.routes.ts` |
| GET | `/api/health/ping` | `src/routes/health.routes.ts` |
| GET | `/api/health/live` | `src/routes/health.routes.ts` |

---

## Invariant Classes

### Class A — Webhook signature verification (fail-closed, constant-time)

| ID | Invariant | Executable? |
|----|-----------|-------------|
| INV-SYS-001 | `POST /api/webhooks/stripe` with no signature → 400 (never processes unsigned) | `system-webhook-signature-sweep` |
| INV-SYS-002 | `POST /api/webhooks/stripe` with a tampered `stripe-signature` → 401 | `system-webhook-signature-sweep` |
| INV-SYS-003 | Stripe webhook verified via `stripe.webhooks.constructEvent(payload, signature, secret)` over the raw body; timestamp tolerance enforces replay protection | manual (code) |
| INV-SYS-004 | Unset `STRIPE_WEBHOOK_SECRET` throws (500) — never falls back to accepting unsigned payloads (fail-closed) | manual (code) |
| INV-SYS-005 | `POST /api/email/inbound` with no signature → 401 | `system-webhook-signature-sweep` |
| INV-SYS-006 | `POST /api/email/inbound` with a wrong `X-Inbound-Signature` → 401 | `system-webhook-signature-sweep` |
| INV-SYS-007 | Email inbound HMAC is computed over the raw request bytes and compared with `timingSafeEqual` (constant-time) | manual (code) |
| INV-SYS-008 | Email inbound is fail-closed in production; unsigned acceptance only via explicit `ALLOW_UNSIGNED_WEBHOOK` opt-in | unit (`tests/unit/emailWebhookAuth.test.ts`) |
| INV-SYS-009 | Email inbound shared-secret fallback also uses constant-time comparison (`safeEqual`) | manual (code) |

### Class B — Idempotency (duplicate delivery never corrupts or 5xx-es)

| ID | Invariant | Executable? |
|----|-----------|-------------|
| INV-SYS-010 | Duplicate inbound email reply (same `messageId`, `@unique`) → 409 (P2002 mapped), not 5xx | manual (code) |
| INV-SYS-011 | Stripe webhook wallet credit is idempotent — already-credited event is skipped | manual (code) |
| INV-SYS-012 | Stripe webhook wallet refund is idempotent — already-processed refund is skipped | manual (code) |
| INV-SYS-013 | Duplicate NEW inbound emails are deduped by `rootMessageId` (findFirst guard + P2002 catch + partial unique index) on both new-ticket and spoof-linked paths | `system-email-idempotency` |

### Class C — Information leak (no internals / secrets / error detail to clients)

| ID | Invariant | Executable? |
|----|-----------|-------------|
| INV-SYS-014 | `GET /api/health/metrics` does not expose business row-counts (`database`) or process internals (`process`) to anonymous callers | `system-health-leak-sweep` |
| INV-SYS-015 | Health endpoint catch blocks log server-side only and return opaque `{status:'error'}` — no raw dependency `error.message` in the body | `system-health-leak-sweep` |
| INV-SYS-016 | `GET /api/health/` and `/detailed` do not expose `environment` or `version` to anonymous callers | `system-health-leak-sweep` |
| INV-SYS-017 | `GET /api/integrations/available/:id` returns credential field *names* only (e.g. `publishableKey`, `secretKey`) — never values | runtime + manual (code: `/available/:id` handler `integrations.routes.ts` L826-846; `credentialsFields` catalog from L55) |
| INV-SYS-018 | `POST /api/integrations/connect` never echoes submitted `credentials`; `/test/:id` returns only `{status,latency,timestamp}`; persisted records use Prisma `select` allowlists that exclude `credentials` | manual (code) + runtime |
| INV-SYS-019 | `GET /api/webhooks/health` and `/api/health/ping` are status-only (`pong`) — no secrets | `system-health-leak-sweep` |
| INV-SYS-030 | `GET /api/health/live` returns `{status,timestamp}` only — no `pid` / `uptime` to anonymous callers | `system-health-leak-sweep` |
| INV-SYS-031 | Integration route catch blocks never surface upstream error content (`err.message`, connection strings, Prisma `P10xx`) in the response body — they log server-side and return a static opaque 500 | `system-integ-leak-sweep` |

### Class D — Authentication gates (mutating / account-scoped integration routes)

| ID | Invariant | Executable? |
|----|-----------|-------------|
| INV-SYS-020 | `GET /api/integrations/connected` anonymous → 401 | runtime + manual (code: `authenticate, authorize('PARTNER')` `integrations.routes.ts` L854) |
| INV-SYS-021 | `POST /api/integrations/connect` anonymous → 401 | runtime + manual (code: `authenticate, authorize('PARTNER')` `integrations.routes.ts` L877) |
| INV-SYS-022 | `DELETE /api/integrations/connected/:id` anonymous → 401 | runtime + manual (code: `authenticate, authorize('PARTNER')` `integrations.routes.ts` L940) |
| INV-SYS-023 | `POST /api/integrations/test/:id` anonymous → 401 | runtime + manual (code: `authenticate, authorize('PARTNER')` `integrations.routes.ts` L968) |
| INV-SYS-024 | `GET /api/integrations/stats` anonymous → 401 | runtime + manual (code: `authenticate, authorize('PARTNER')` `integrations.routes.ts` L999) |
| INV-SYS-025 | `GET /api/integrations/available` and `/categories` are public (200) and disclose no secrets | runtime |

### Class E — Input validation (bad input → 4xx, never 500)

| ID | Invariant | Executable? |
|----|-----------|-------------|
| INV-SYS-026 | `POST /api/integrations/connect` missing `integrationId` → 400 | `system-input-500-sweep` |
| INV-SYS-027 | `GET /api/integrations/available/:id` with an unknown id → 404 | `system-input-500-sweep` |
| INV-SYS-028 | Malformed body on the pre-auth stripe / email webhook routes → 400/401, never 500 | `system-input-500-sweep` |
| INV-SYS-029 | `POST /api/email/inbound` with an invalid payload → 400 + a `required[]` list | `system-input-500-sweep` |
| INV-SYS-032 | An oversized request body (exceeding the `express.json`/`express.raw` `limit`, raising body-parser's `PayloadTooLargeError` / `type === 'entity.too.large'` before any route/auth code) on ANY system route — incl. the unauthenticated `POST /api/webhooks/stripe` and `POST /api/email/inbound` — → clean **413** with an opaque body and **no `stack` / no absolute path**, never a default 500 + dev stack | `system-input-500-sweep` |

---

## Notes

- **Class boundaries are stable; row status is in the ledger.** When a sibling task edits a system source file (e.g. BC-DEMOCK-010 refactored `integrations.routes.ts`), re-run the sweeps — a RED sweep is a free finding. Keep sweep assertions on *behavior* (does error content reach the client?) not on *syntax* (is the catch block bare?); a syntax-pinned assertion can go RED on a leak-free refactor and mask the real signal (see INV-SYS-031 history, ledger R7→R8).
- **`authorize('PARTNER')` on the mutating integration routes** (added by BC-DEMOCK-010) is a tightening of the Class D auth gates (INV-SYS-020..024), not a separate invariant.
