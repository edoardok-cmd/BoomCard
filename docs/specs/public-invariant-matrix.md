# BoomCard Public / Unauthenticated Surface — Invariant Matrix

**Surface:** All 7 unauthenticated HTTP routes (`scope: public` in `tests/app-route-ownership-manifest.json`).
**Spec sources:** `docs/specs/05-consolidated-unified-spec.md` §8.1 rule 4 (currency display) / Clash 12.1; contact-form references in `src/routes/contact.routes.ts` (Spec §3.8 / §1.7 / §6.2); `src/routes/plans.routes.ts` ("single source of truth for plan pricing").
**Scope id:** `BC-PUBLIC-SPEC-REAUDIT`. **Ledger:** `.claude/reviews/BC-PUBLIC-SPEC-REAUDIT-coverage-ledger.md` (harness workspace).

**What this is:** the enumerated, ID'd set of machine-checkable invariants the public surface must satisfy. One row per rule × binding. The ledger tracks WHETHER each has been independently checked; this matrix says WHAT must hold. Re-audit rounds target `untested`/oldest rows in the ledger.

**Dominant risk (unauthenticated surface):** data exposure (PII / internal fields / non-allowlisted settings) and abuse (unbounded writes, input-boundary 500s). There is no per-tenant authorization to test here — these endpoints are public by design; the question is *what* they emit and *how* they fail.

**Binding endpoints (route introspection target).** The public surface (no auth middleware):
- `GET  /api/plans/` — all active plans + pricing — `src/routes/plans.routes.ts`
- `GET  /api/plans/:id` — single plan by id — `src/routes/plans.routes.ts`
- `GET  /api/plans/code/:planCode` — single plan by code — `src/routes/plans.routes.ts`
- `GET  /api/config/mobile/` — mobile feature flags / min versions — `src/routes/mobileConfig.routes.ts`
- `POST /api/mobile/errors/` — client-side error ingest — `src/routes/mobileConfig.routes.ts`
- `POST /api/contact/` — public contact form → help ticket — `src/routes/contact.routes.ts`
- `GET  /api/sidebar/stats` — sidebar statistics — `src/routes/sidebar.routes.ts`

**Class sweeps (route-introspecting, public-filtered — live in `backend-api/tests/integration/`):**
- `[SUITE: INPUT]` — `public-input-500-sweep.test.ts` — no public route 5xx's on malformed input (null byte / invalid UTF-8 / wrong body type / oversized / control chars); a 5xx is a finding, a 4xx is correct.
- `[SUITE: CUR]` — `public-currency-display-sweep.test.ts` — `/api/plans/*` pricing honors the BGN→EUR transition window: when OPEN, every price carries BOTH a BGN and an EUR value; when CLOSED, EUR-only.
- `[SUITE: LEAK]` — `public-data-exposure-sweep.test.ts` — no public response emits a denylisted internal/PII field name (createdAt, updatedAt, isActive, displayOrder, passwordHash, *secret*, *token*, *iban*, internal SystemSetting keys outside the mobile allowlist).

A suite-covered row is `verified` by suite while that suite is green. A `review`-tagged row has no exhaustive sweep and must be independently re-checked each round.

---

## 1. Data Exposure / Field Allowlisting (INV-PUB-LEAK) — dominant risk

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-PUB-LEAK-001 | `GET /api/plans/` emits ONLY the display allowlist (id, planCode, displayName/Bg, pricing, billingOptions, cashbackRate, stickerBonus, features/Bg, cardType, isFeatured, badge). No createdAt/updatedAt/isActive/displayOrder/internal columns. | plans.routes:19-80 (`select` allowlist) | suite (LEAK)+read | [SUITE: LEAK] |
| INV-PUB-LEAK-002 | `GET /api/plans/:id` emits the same allowlist despite a full-row `findFirst` (hand-mapped response). | plans.routes:140-188 | suite (LEAK)+read | [SUITE: LEAK] |
| INV-PUB-LEAK-003 | `GET /api/plans/code/:planCode` emits the same allowlist (hand-mapped). | plans.routes:86-134 | suite (LEAK)+read | [SUITE: LEAK] |
| INV-PUB-LEAK-004 | `GET /api/config/mobile/` emits ONLY values derived from `PUBLIC_MOBILE_KEYS`; no non-allowlisted SystemSetting (secrets/tokens/internal flags). | mobileConfig.routes:19-71 | suite (LEAK)+read | [SUITE: LEAK] |
| INV-PUB-LEAK-005 | `GET /api/sidebar/stats` exposes no real tenant/partner/financial data to anonymous callers. | sidebar.routes:11-47 | runtime probe + read | open |
| INV-PUB-LEAK-006 | `POST /api/contact` response carries only `{success, ticketId}` — no PII echo beyond caller's own input, no internal ticket internals, no stack. | contact.routes:144 | runtime probe + read | review |
| INV-PUB-LEAK-007 | `POST /api/mobile/errors` response carries only `{success}` — no stored-row id / internals. | mobileConfig.routes:124 | runtime probe + read | review |

## 2. Currency Dual-Display (INV-PUB-CUR) — §8.1 rule 4 / Clash 12.1

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-PUB-CUR-001 | `/api/plans/*` pricing honors the BGN→EUR window: when OPEN, every price (weekly/monthly/yearly) carries BOTH a BGN and an EUR value; when CLOSED, EUR-only. Currently EUR-only unconditionally → OPEN-window violation. | plans.routes pricing block; currencyDisplay util | suite (CUR)+probe | open |
| INV-PUB-CUR-002 | When OPEN, the BGN value equals EUR × `EUR_TO_BGN_RATE` (fixed currency-board rate), correctly rounded to 2 dp. | currencyDisplay.bgnToEur / receipt.constants | suite (CUR) | open |

## 3. Input Boundary / No 5xx on Malformed Input (INV-PUB-INP) — input-500 class

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-PUB-INP-001 | `GET /api/plans/:id` never 5xx on malformed id (null byte `%00`, invalid UTF-8 `%ff`, oversized, control chars) → 404/400. Currently 500 (unmapped pg DriverAdapterError "invalid byte sequence"). | plans.routes:140; error.middleware | suite (INPUT) | open |
| INV-PUB-INP-002 | `GET /api/plans/code/:planCode` never 5xx on malformed planCode → 404/400. Currently 500 on `%00`. | plans.routes:86; error.middleware | suite (INPUT) | open |
| INV-PUB-INP-003 | `POST /api/contact` never 5xx on malformed body (null byte in field, wrong types, array/string body). Currently 502 on null-byte field (mis-classified client error as server fault). | contact.routes:41-149; error.middleware | suite (INPUT) | open |
| INV-PUB-INP-004 | `POST /api/mobile/errors` never 5xx on malformed body (null byte in message, wrong types). Currently 500 on null-byte message. | mobileConfig.routes:91; error.middleware | suite (INPUT) | open |
| INV-PUB-INP-005 | `GET /api/config/mobile/` always 200 (no params, allowlist read). | mobileConfig.routes:36 | suite (INPUT)+probe | review |
| INV-PUB-INP-006 | `GET /api/sidebar/stats` always 200 (no params). | sidebar.routes:11 | suite (INPUT)+probe | review |

## 4. Abuse / Rate-Limiting (INV-PUB-RL)

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-PUB-RL-001 | `POST /api/contact` is rate-limited (5 / 15 min per IP) in non-dev; `skip` only when `NODE_ENV==='development'`. | contact.routes:20-30 | static read | review |
| INV-PUB-RL-002 | `POST /api/mobile/errors` is rate-limited (20 / min per IP) in non-dev; `skip` only when `NODE_ENV==='development'`. | mobileConfig.routes:74-81 | static read | review |
| INV-PUB-RL-003 | Public write endpoints cap stored size (contact: name 120 / email 254 / message 5000; errors: message 2000 / stack 10000). | contact.routes:16-18,50; mobileConfig.routes:119-120 | static read | review |

## 5. Injection (INV-PUB-INJ) — contact email path

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-PUB-INJ-001 | Contact form HTML-escapes name/email/message before embedding in the admin notification email (stored-HTML XSS). | contact.routes:32-39,70-72,91-111 | static read | review |
| INV-PUB-INJ-002 | Contact `replyTo` cannot carry injected email headers — `EMAIL_RE` forbids whitespace/CRLF and requires a single `@`. | contact.routes:15,53,124 | static read | review |

## 6. Auth Posture (INV-PUB-AUTH)

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-PUB-AUTH-001 | The 7 routes carry no auth middleware AND expose no authenticated-only capability (sidebar/stats is the watch item — see INV-PUB-LEAK-005). | route mounts in server.ts | static read | review |
| INV-PUB-AUTH-002 | The only public write endpoints are `/api/contact` and `/api/mobile/errors`; both are bounded (rate-limited + size-capped) and confer no privilege. | route inventory | static read | review |

---

## Coverage legend
- **verified** — checked this round, holds, with evidence pointer in the ledger.
- **verified (by suite)** — covered by a green class sweep; re-verified automatically every run.
- **review** — no exhaustive sweep; independent human-style re-check required each round.
- **open** — a finding exists; a fix task is filed; row cannot go `verified` until the fix lands and its sweep is green.
- **untested** — not yet looked at this cycle.

## Round-1 findings (see ledger + reaudit-r1 roll-up)
- INV-PUB-INP-001..004 → **input-boundary 500/502** on null-byte / invalid-UTF-8 input (unmapped pg `DriverAdapterError`). Task: `BC-PUBLIC-SPEC-REAUDIT-INPUT-500`.
- INV-PUB-CUR-001..002 → public plan pricing is **EUR-only**, omits BGN during the OPEN transition window. Task: `BC-PUBLIC-SPEC-REAUDIT-PLANS-DUAL-CURRENCY`.
- INV-PUB-LEAK-005 → `/api/sidebar/stats` serves **business-looking mock stats unauthenticated**, with no currency designation. Task: `BC-PUBLIC-SPEC-REAUDIT-SIDEBAR-MOCK`.
