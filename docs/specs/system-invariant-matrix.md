# BoomCard System Invariant Matrix

**Purpose:** Turn the BoomCard **System** surface re-audit (webhooks / inbound email / integrations / health) from open-ended sampling into an enumerated, ID'd, trackable coverage surface. Every machine-checkable system invariant is one row here. The audit is complete only when every row below is `verified` in the coverage ledger (`.claude/reviews/BC-SYSTEM-SPEC-REAUDIT-coverage-ledger.md`).

**Audience:** future audit agents (re-audit runs N≥1). This file is the Round-1 bootstrap artifact for scope `BC-SYSTEM-SPEC-REAUDIT`.

**Surface (17 routes, scope=`system` per `backend-api/tests/app-route-ownership-manifest.json`):**

| Route file | Mount | Routes |
|---|---|---|
| `webhooks.routes.ts` | `/api/webhooks` | `GET /health`, `POST /stripe` |
| `emailWebhook.routes.ts` | `/api/email` | `POST /inbound` |
| `integrations.routes.ts` | `/api/integrations` | `GET /available`, `GET /available/:id`, `GET /categories`, `GET /connected`, `POST /connect`, `DELETE /connected/:id`, `POST /test/:id`, `GET /stats` |
| `health.routes.ts` | `/api/health` | `GET /`, `GET /detailed`, `GET /live`, `GET /ready`, `GET /metrics`, `GET /ping` |

**Server wiring (from `server.ts`):**
- `express.raw({type:'application/json'})` mounted on `/api/webhooks/stripe` and `/api/email/inbound` **before** `express.json()` (L175-176) — handlers receive the original signed bytes as a Buffer.
- CSRF protection exempts only `/webhooks` (L204); integration mutations carry CSRF.
- `requestTracker` middleware feeds `/api/health/metrics` (L207).

---

## Invariant classes

- **SIG** — webhook signature verification & replay protection (Stripe + inbound email).
- **RPLY** — idempotency / duplicate-delivery handling.
- **LEAK** — secret / credential / internals non-disclosure (health + integrations).
- **AUTH** — integration endpoint auth gating.
- **INPUT** — malformed-input never 500s (clean 4xx).

## ⚙️ Suite-covered classes (verified-by-suite)

- **`system-webhook-signature-sweep.test.ts`** — Stripe missing-sig→400, tampered-sig→401; inbound-email missing/tampered-sig→401 (strict path, secret set + `ALLOW_UNSIGNED_WEBHOOK` cleared); `/webhooks/health` 200 status-only. Covers **SIG** runtime rows. Teeth: `.teeth.test.ts`.
- **`system-input-500-sweep.test.ts`** — integration / email / webhook malformed-input rows return clean 4xx, never 500. Covers **INPUT**. Teeth: `.teeth.test.ts`.
- **`system-health-leak-sweep.test.ts`** — asserts the **LEAK** desired-state on health endpoints (no business row-counts / process internals / raw dependency error strings / env+version to anonymous callers). **RED until** `BC-SYSTEM-SPEC-REAUDIT-HEALTH-*` tasks land — it is the executable guard those fixes must turn green.

---

## SIG — Webhook signature verification & replay

Rule: a webhook is only processed when its provider signature verifies against the configured secret; verification runs over the raw signed bytes; missing/invalid signatures are rejected before any side effect; secrets are never accepted as absent (fail-closed).

| ID | Invariant | Surface | How to verify |
|----|-----------|---------|---------------|
| INV-SYS-001 | `POST /webhooks/stripe` with no `stripe-signature` header → 400, event NOT processed. | webhooks.routes.ts L36-39 | runtime (live :3025 → 400) / [SUITE: SIG] |
| INV-SYS-002 | `POST /webhooks/stripe` with a tampered/invalid signature → 401, event NOT processed. | webhooks.routes.ts L51-55 + stripe.service.ts L335 | runtime (live :3025 → 401) / [SUITE: SIG] |
| INV-SYS-003 | Stripe signature verified via `stripe.webhooks.constructEvent(rawBody, sig, secret)` — replay protection comes from constructEvent's signed-timestamp tolerance; raw body (not re-serialised JSON) is used. | stripe.service.ts L335 + server.ts L175 | code inspection |
| INV-SYS-004 | `STRIPE_WEBHOOK_SECRET` unset → `verifyWebhookSignature` throws (500), never accepts an unsigned/forged event (fail-closed). | stripe.service.ts L330-332 | code inspection |
| INV-SYS-005 | `POST /email/inbound` with no auth header (HMAC secret configured, `ALLOW_UNSIGNED_WEBHOOK` unset) → 401. | emailWebhook.routes.ts L191-192 | runtime / [SUITE: SIG] |
| INV-SYS-006 | `POST /email/inbound` with a wrong `X-Inbound-Signature` → 401. | emailWebhook.routes.ts L149-156, L191 | runtime / [SUITE: SIG] |
| INV-SYS-007 | Inbound-email HMAC is computed over the **raw request bytes** (express.raw) using a constant-time compare (`crypto.timingSafeEqual`). | emailWebhook.routes.ts L95-104, L149-156 | code inspection |
| INV-SYS-008 | Inbound-email auth fails **closed** in production when no secret is configured; outside production it only skips auth with an explicit `ALLOW_UNSIGNED_WEBHOOK=1` opt-in. | emailWebhook.routes.ts L119-142 | code inspection (covered by `emailWebhookAuth.test.ts`) |
| INV-SYS-009 | Shared-secret fallback (`X-Webhook-Secret` vs `EMAIL_WEBHOOK_SECRET`) also uses a constant-time compare. | emailWebhook.routes.ts L162-164 | code inspection |

## RPLY — Idempotency / duplicate delivery

| ID | Invariant | Surface | How to verify |
|----|-----------|---------|---------------|
| INV-SYS-010 | A duplicate inbound-email **reply** (same RFC-5322 `messageId`) does not 5xx and is deduped — `TicketReply.messageId @unique` → Prisma `P2002` → error middleware maps to 409. | schema.prisma L1663 + error.middleware.ts L83-85 + ticketInbound.service.ts L830 | code inspection |
| INV-SYS-011 | Stripe `payment_intent.succeeded` re-delivery does not double-credit the wallet (effect-level idempotent guard). | stripe.service.ts L460 ("already credited — skipping") | code inspection |
| INV-SYS-012 | Stripe `charge.refunded` re-delivery does not double-process the refund. | stripe.service.ts L700 ("refund already processed — skipping") | code inspection |
| INV-SYS-013 | **OPEN** — A duplicate **new** inbound email (provider redelivery, no threading headers) creates a duplicate `HelpTicket`; `rootMessageId` has no uniqueness/dedupe, so a benign provider retry doubles the ticket. | ticketInbound.service.ts L616-619 | **finding** → BC-SYSTEM-SPEC-REAUDIT-EMAIL-IDEMPOTENCY |

## LEAK — Secret / internals non-disclosure

| ID | Invariant | Surface | How to verify |
|----|-----------|---------|---------------|
| INV-SYS-014 | **OPEN** — `GET /health/metrics` is unauthenticated yet exposes business row-counts (users/venues/stickers/receipts/transactions) **and** process internals (pid/platform/nodeVersion) to anonymous callers. | health.routes.ts L1425-1488 | runtime (live :3025 leaked users:211 …) → **finding** BC-SYSTEM-SPEC-REAUDIT-HEALTH-METRICS-AUTH |
| INV-SYS-015 | **OPEN** — `GET /health/detailed`, `/ready`, `/metrics` echo the raw dependency `error.message` (DB/Redis) into the response body — a connection error can leak host/DSN/topology. | health.routes.ts L1311, L1335, L1398, L1485 | code inspection → **finding** BC-SYSTEM-SPEC-REAUDIT-HEALTH-ERRLEAK |
| INV-SYS-016 | **OPEN** — `GET /health/` and `/detailed` expose `environment` (NODE_ENV) and `version` to anonymous callers. | health.routes.ts L1275, L1290-1291 | runtime (live → `environment:"development"`) → **finding** BC-SYSTEM-SPEC-REAUDIT-HEALTH-ENV-STRIP |
| INV-SYS-017 | `GET /integrations/available[/:id]` exposes only credential field **definitions** (names/labels/placeholders), never secret **values**. | integrations.routes.ts L282-301 | runtime (live → credFields = names only) / [SUITE: LEAK] |
| INV-SYS-018 | **OPEN** — `POST /integrations/connect` echoes the caller-submitted `credentials` object back in the response body (`data.credentials`). | integrations.routes.ts L1090-1106 | code inspection → **finding** BC-SYSTEM-SPEC-REAUDIT-INTEG-CRED-ECHO |
| INV-SYS-019 | `GET /webhooks/health` and `GET /health/ping` expose no secrets/internals (status string only). | webhooks.routes.ts L20-26 + health.routes.ts L1496-1498 | runtime / [SUITE: LEAK] |

## AUTH — Integration endpoint auth gating

| ID | Invariant | Surface | How to verify |
|----|-----------|---------|---------------|
| INV-SYS-020 | `GET /integrations/connected` requires auth → 401 anonymous. | integrations.routes.ts L1050 | runtime (live → 401) / [SUITE: AUTH] |
| INV-SYS-021 | `POST /integrations/connect` requires auth → 401 anonymous. | integrations.routes.ts L1068 | code (authenticate mw) / [SUITE: AUTH] |
| INV-SYS-022 | `DELETE /integrations/connected/:id` requires auth → 401 anonymous. | integrations.routes.ts L1120 | code (authenticate mw) / [SUITE: AUTH] |
| INV-SYS-023 | `POST /integrations/test/:id` requires auth → 401 anonymous. | integrations.routes.ts L1142 | code (authenticate mw) / [SUITE: AUTH] |
| INV-SYS-024 | `GET /integrations/stats` requires auth → 401 anonymous. | integrations.routes.ts L1172 | runtime (live → 401) / [SUITE: AUTH] |
| INV-SYS-025 | `GET /integrations/available`, `/available/:id`, `/categories` are intentionally public and disclose no secrets. | integrations.routes.ts L997, L1023, L1203 | runtime / [SUITE: LEAK] |

## INPUT — Malformed input never 500s

| ID | Invariant | Surface | How to verify |
|----|-----------|---------|---------------|
| INV-SYS-026 | `POST /integrations/connect` with missing `integrationId` → 400 (not 500). | integrations.routes.ts L1072-1077 | [SUITE: INPUT] |
| INV-SYS-027 | `GET /integrations/available/:id` with an unknown id → 404 (not 500). | integrations.routes.ts L1029-1034 | [SUITE: INPUT] |
| INV-SYS-028 | `POST /webhooks/stripe` / `POST /email/inbound` with a malformed body do not 500 before auth — auth rejects first (400/401). | webhooks.routes.ts L36, emailWebhook.routes.ts L191 | [SUITE: INPUT] |
| INV-SYS-029 | `POST /email/inbound` authenticated but with an invalid payload → 400 with the `required` fields list (not 500). | emailWebhook.routes.ts L202-207 | [SUITE: INPUT] |

---

## Exit Criterion

Audit closes only when **all three** hold:
1. Every ledger row = `verified` (zero `open`, zero `untested`).
2. All executable sweeps green + teeth-proved (incl. `system-health-leak-sweep` once the LEAK findings are fixed).
3. Two consecutive independent passes add zero new invariants and zero new findings.
