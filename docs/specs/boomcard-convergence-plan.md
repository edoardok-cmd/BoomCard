# BoomCard Convergence Plan

This document describes the convergence machinery for the BoomCard audit surface. It mirrors the pattern from `my-dashboard/docs/convergence-plan.md` but is BoomCard-specific.

## §1 Overview

BoomCard has **six** re-audit scopes — the full partition of all **477 app routes** from
`backend-api/tests/helpers/appScopes.ts` + `app-route-ownership-manifest.json` (every route owned by
exactly one scope; `unowned` must be 0, CI-gated by `app-route-ownership.test.ts`). Route counts:
admin 232 · user 158 · redemption 39 · partner 24 · system 17 · public 7.

| Scope ID | Surface (routes) | Matrix | Ledger | Sweeps | Status |
|---|---|---|---|---|---|
| `BC-ADMIN-SPEC-REAUDIT` | Admin spec — `/api/admin/*` (232) | `docs/specs/admin-invariant-matrix.md` | `.claude/reviews/BC-ADMIN-SPEC-REAUDIT-coverage-ledger.md` | admin-uuid-500-sweep, app-route-ownership | **COMPLETE** — 264/264 verified, closed on evidence (r4 approve) |
| `BC-PARTNER-SPEC-REAUDIT` | Partner spec — `/api/partners/*`, `/api/partner/*` (24) | `docs/specs/partner-spec-invariant-matrix.md` | `.claude/reviews/BC-PARTNER-SPEC-REAUDIT-coverage-ledger.md` | partner-cross-scope-sweep, partner-internal-field-leak-sweep, partner-uuid-500-sweep | Active — 113/114, 1 open (INV-NOTIF-002) |
| `BC-USER-SPEC-REAUDIT` | User/subscriber — `/api/subscriptions\|wallet\|offers\|receipts\|favorites\|cards\|checkout\|payments\|notifications\|help\|loyalty\|reviews` + subscriber `/api/auth/*` (158) | `docs/specs/user-invariant-matrix.md` (not yet built) | `.claude/reviews/BC-USER-SPEC-REAUDIT-coverage-ledger.md` (not yet built) | none yet | Bootstrap needed |
| `BC-REDEMPTION-SPEC-REAUDIT` | Redemption — `/api/stickers\|venues\|bookings\|messaging\|dashboard` (39) | `docs/specs/redemption-invariant-matrix.md` (not yet built) | `.claude/reviews/BC-REDEMPTION-SPEC-REAUDIT-coverage-ledger.md` (not yet built) | none yet | Bootstrap needed |
| `BC-SYSTEM-SPEC-REAUDIT` | System — `/api/webhooks\|email\|integrations\|health` (17) | `docs/specs/system-invariant-matrix.md` (not yet built) | `.claude/reviews/BC-SYSTEM-SPEC-REAUDIT-coverage-ledger.md` (not yet built) | none yet | Bootstrap needed |
| `BC-PUBLIC-SPEC-REAUDIT` | Public/unauth — `/api/plans\|contact\|sidebar\|config/mobile\|mobile` (7) | `docs/specs/public-invariant-matrix.md` (not yet built) | `.claude/reviews/BC-PUBLIC-SPEC-REAUDIT-coverage-ledger.md` (not yet built) | none yet | Bootstrap needed |

**Rollout order (by risk-per-unit):** ADMIN (done) → PARTNER → USER → REDEMPTION → SYSTEM → PUBLIC.
Once all six converge, every one of the 477 routes has been audited — the manifest forbids gaps.

## §2 Convergence machinery (common to all scopes)

The convergence machinery makes the audit terminate instead of sampling the same surfaces endlessly. Per scope:

1. **Invariant matrix** — enumerate every machine-checkable invariant for the surface. One row per invariant ID (`INV-xxx-yyy`). Tag suite-covered classes `[SUITE: X]`.
2. **Coverage ledger** — track `verified` / `open` / `untested` per invariant row. Lives in the Agent X harness at `.claude/reviews/<scope-id>-coverage-ledger.md`.
3. **Executable sweeps** — route-introspecting test files that walk the live stack. Each must be teeth-proved (a `.teeth.test.ts` that confirms the sweep goes RED on a known historical leak, then GREEN after the fix).
4. **Re-audit roll-ups** — `.claude/reviews/<scope-id>-reaudit-r<N>.md` per round. Round counter advances each time.
5. **Exit criteria** (ALL three must hold before the scope is done):
   - Every ledger row = `verified` (zero `open`, zero `untested`)
   - **Sweep suite green** (exit criterion 2): All sweep test files are committed to the BoomCard repository. A sweep file's existence is what this criterion checks. Teeth-prove tests (`.teeth.test.ts` co-located with each sweep) are a separate quality bar — amber badges in the convergence monitor indicate files are committed but not yet teeth-proved. Teeth-prove is strongly recommended before treating sweep results as mechanically guaranteed, but is not gated by exit criterion 2.
   - Two consecutive independent passes add ZERO new invariants to the matrix
6. **No mock / stub data** (non-negotiable, common to every prompt). BoomCard shipped 10 real mocks behind a "100% real API" claim (`BC-DEMOCK-001..010` — 501-"not implemented" stubs, hardcoded arrays, log-only SMS, `conf=0` OCR). Therefore:
   - An invariant backed by a mock, stub, hardcoded array/fixture, 501-stub, log-only side effect, or always-pass placeholder is **not `verified` — it is `open`**. File a task; never mark it verified.
   - Probes and sweeps must exercise the **real** backend on `:3025` against the real DB. Never mock the data layer, HTTP client, or service responses to make a row pass — a green sweep over mocked data is a false verification and is rejected.
   - Do not introduce or leave any mock/stub/seeded-fake data while auditing. Existing mock data masquerading as a real implementation is itself a finding (BC-DEMOCK class) — file it.

## §3 Sweep files (BoomCard repo paths)

All sweep files live in `backend-api/tests/integration/`:

| Sweep | File | Scope |
|---|---|---|
| `admin-uuid-500-sweep` | `backend-api/tests/integration/admin-uuid-500-sweep.test.ts` | BC-ADMIN-SPEC-REAUDIT |
| `partner-cross-scope-sweep` | `backend-api/tests/integration/partner-cross-scope-sweep.test.ts` | BC-PARTNER-SPEC-REAUDIT |
| `partner-internal-field-leak-sweep` | `backend-api/tests/integration/partner-internal-field-leak-sweep.test.ts` | BC-PARTNER-SPEC-REAUDIT |
| `user-internal-field-leak-sweep` | `backend-api/tests/integration/user-internal-field-leak-sweep.test.ts` | BC-USER-SPEC-REAUDIT |
| `subscriber-internal-field-introspect-sweep` | `backend-api/tests/integration/subscriber-internal-field-introspect-sweep.test.ts` | BC-USER-SPEC-REAUDIT ↔ BC-REDEMPTION-SPEC-REAUDIT |
| `partner-uuid-500-sweep` | `backend-api/tests/integration/partner-uuid-500-sweep.test.ts` | BC-PARTNER-SPEC-REAUDIT |

Manifests: `backend-api/tests/app-route-ownership-manifest.json`, `backend-api/tests/admin-endpoint-manifest.json`.

> **Retired sweeps — the CUR (dual-currency display) class (BC-QA-031, 2026-08-10).**
> Bulgaria's BGN→EUR transition window closed and the dual-currency display feature
> was removed: there is no `currency_transition_window_open` flag, no
> `currencyDisplay.ts`, and no `display:{bgn,eur}` envelope anywhere in the API.
> All monetary responses are single EUR scalars. The CUR-class sweeps that policed
> that envelope are therefore retired, not merely renamed:
>
> | Retired sweep | Disposition |
> |---|---|
> | `admin-currency-leak-sweep` | deleted — no replacement (nothing left to police) |
> | `public-currency-display-sweep` | deleted — no replacement |
> | `user-currency-leak-sweep` | non-currency invariants extracted to `user-internal-field-leak-sweep` |
> | `partner-currency-leak-sweep` | renamed to `partner-internal-field-leak-sweep` |
> | `user-money-introspect-sweep` | deleted; the subscriber counterpart survives as `subscriber-internal-field-introspect-sweep` |
>
> A re-audit agent following the §6 prompts must NOT file the absence of these
> suites as a red-suite finding, and must NOT rebuild a currency-leak sweep for a
> new scope. Genuinely-BGN domain values that legitimately remain (plan pricing,
> internal payout thresholds) are out of this class's scope by definition.

## §4 Runtime recipe

- Backend on `:3025` (the BoomCard API). Health check: `curl http://localhost:3025/health`.
- Admin login: `admin@boomcard.bg` / `admin123`, `clientType:web` → `SUPER_ADMIN`.
- Partner login: see `CREDENTIALS.md` in the BoomCard repo root.
- User (mobile) login: use a real subscriber account.

## §5 Exit-criteria enforcement

`finish-task.py` (in the Agent X harness) refuses to complete a re-audit scope whose ledger has any `open`/`untested` row. The dashboard's `effectiveStatusFor` applies the same gate. A scope with no ledger is unaffected (no-op).

The coverage ledgers live in the Agent X harness workspace at `.claude/reviews/<scope-id>-coverage-ledger.md`.

## §6 Re-audit prompts

Copy-paste-ready prompts for each scope. These prompts are also rendered live in the BoomCard Convergence Monitor UI at `http://localhost:5124/boomcard-convergence`. The UI appends the §2.6 **No mock / stub data** directive to every prompt (Round 1 and Round N, all branches) — it is not repeated in each subsection below.

---

### §6.1 BC-ADMIN-SPEC-REAUDIT — Round 1 (bootstrap)

```
You are a neutral re-audit agent for the BoomCard Admin surface.

SCOPE: BC-ADMIN-SPEC-REAUDIT
MATRIX: /Users/administrator/Documents/BoomCard/docs/specs/admin-invariant-matrix.md (227+ enumerated invariants)
LEDGER: /Users/administrator/Documents/AI Projects/Agent X/.claude/reviews/BC-ADMIN-SPEC-REAUDIT-coverage-ledger.md
SWEEPS: backend-api/tests/integration/admin-uuid-500-sweep.test.ts, backend-api/tests/app-route-ownership-manifest.json

Round 1 Bootstrap — full pass:
1. Run all standing suite tests (admin-uuid-500-sweep). File any red tests as HIGH tasks immediately.
2. Import the coverage skeleton (INV- IDs + untested rows only — NOT prior verdicts — independence must be preserved).
3. Work through ALL untested rows, targeting oldest-`Last run checked` first. Use static read, runtime probe (curl vs :3025), and suite results.
4. Record results in the ledger (verified/open/untested). File a task (--tier, BC-ADMIN-SPEC-REAUDIT-suffixed) for every OPEN row.
5. Roll up to .claude/reviews/BC-ADMIN-SPEC-REAUDIT-reaudit-r<N>.md.
6. Check: did this pass add any new invariants to the matrix? If yes, exit criterion 3 resets (no credit for a zero-delta pass yet).

Runtime: backend on :3025, admin user: admin@boomcard.bg / admin123, clientType:web → SUPER_ADMIN.
Tier guide: mechanical guard-add pinned by sweep = haiku; multi-file scoping refactor = sonnet; money/auth state-machine = opus.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All sweeps green
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

### §6.1b BC-ADMIN-SPEC-REAUDIT — Round N+ (continuation, auto-generated)

The Round N+ prompt is auto-generated by the Convergence Monitor UI from the current ledger state (lists still-untested/oldest INV- ids). Base template:

```
Bootstrap already done. Run the standing sweep suite first (file any red results directly as tasks).

SCOPE: BC-ADMIN-SPEC-REAUDIT
Import ONLY the coverage skeleton — NOT prior verdicts (independence must be preserved).

Still-untested rows to target this round:
  [GENERATED FROM LEDGER — INV-IDs listed here by the UI]

Continuation steps:
1. Run all standing sweeps first. Red sweep results = free findings — file tasks immediately.
2. Work through ONLY the listed rows using static read + runtime probe vs :3025.
3. Record results in the ledger (verified / open). File a task (--tier, BC-ADMIN-SPEC-REAUDIT-suffixed) for every OPEN row.
4. Roll up to .claude/reviews/BC-ADMIN-SPEC-REAUDIT-reaudit-r<N>.md.
5. Report matrix growth: did this pass add new invariants? If yes, exit criterion 3 resets.

Note: BoomCard admin took 7+ rounds. Expect multiple rounds until all exit criteria are met.
```

---

### §6.2 BC-PARTNER-SPEC-REAUDIT — Round 1 (bootstrap)

```
You are a neutral re-audit agent for the BoomCard Partner surface.

SCOPE: BC-PARTNER-SPEC-REAUDIT
MATRIX: /Users/administrator/Documents/BoomCard/docs/specs/partner-spec-invariant-matrix.md (114+ enumerated invariants)
LEDGER: /Users/administrator/Documents/AI Projects/Agent X/.claude/reviews/BC-PARTNER-SPEC-REAUDIT-coverage-ledger.md
SWEEPS: backend-api/tests/integration/partner-cross-scope-sweep.test.ts, backend-api/tests/integration/partner-internal-field-leak-sweep.test.ts, backend-api/tests/integration/partner-uuid-500-sweep.test.ts

Round 1 Bootstrap — full pass:
1. Run all three partner sweeps (cross-scope, internal-field-leak, uuid-500). File any red tests as HIGH tasks immediately.
2. Import the coverage skeleton (INV- IDs + untested rows only — NOT prior verdicts — independence must be preserved).
3. Work through ALL untested rows, targeting oldest-`Last round` first. Use static read, runtime probe (curl vs :3025 with PARTNER login), and suite results.
4. Record results in the ledger (verified/open/untested). File a task (--tier, BC-PARTNER-SPEC-REAUDIT-suffixed) for every OPEN row.
5. Roll up to .claude/reviews/BC-PARTNER-SPEC-REAUDIT-reaudit-r<N>.md.
6. Check: did this pass add any new invariants? If yes, exit criterion 3 resets.

Runtime: backend on :3025. PARTNER login: use a ACTIVE partner account (check CREDENTIALS.md in BoomCard repo for test partner creds).
Sweeps are NOT yet teeth-proved — add `.teeth.test.ts` guards before treating sweep results as mechanically guaranteed.
Tier guide: mechanical guard-add pinned by sweep = haiku; cross-scope scoping refactor = sonnet; money/auth state-machine = opus.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All three partner sweeps green
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

### §6.2b BC-PARTNER-SPEC-REAUDIT — Round N+ (continuation, auto-generated)

```
Bootstrap already done. Run the standing sweep suite first (file any red results directly as tasks).

SCOPE: BC-PARTNER-SPEC-REAUDIT
Import ONLY the coverage skeleton — NOT prior verdicts (independence must be preserved).

Still-untested rows to target this round:
  [GENERATED FROM LEDGER — INV-IDs listed here by the UI]

Continuation steps:
1. Run partner-cross-scope-sweep, partner-internal-field-leak-sweep, partner-uuid-500-sweep first. Red = free findings.
2. Work through ONLY the listed rows using static read + runtime probe vs :3025 (PARTNER login).
3. Record results in the ledger (verified / open). File a task (--tier, BC-PARTNER-SPEC-REAUDIT-suffixed) for every OPEN row.
4. Roll up to .claude/reviews/BC-PARTNER-SPEC-REAUDIT-reaudit-r<N>.md.
5. Report matrix growth: did this pass add new invariants? If yes, exit criterion 3 resets.
```

---

### §6.3 BC-USER-SPEC-REAUDIT — Round 1 (bootstrap — must build machinery)

```
You are a neutral re-audit agent for the BoomCard User (mobile subscriber) surface.

SCOPE: BC-USER-SPEC-REAUDIT
SPEC SOURCE: /Users/administrator/Documents/BoomCard/docs/specs/08-user-spec-extracted.md
MATRIX: NOT YET BUILT — this is a Round 1 bootstrap that must build it.
LEDGER: NOT YET BUILT — seed it during this round.

Round 1 Bootstrap — must build the convergence machinery:
1. Read docs/specs/08-user-spec-extracted.md fully.
2. Write docs/specs/user-invariant-matrix.md: enumerate every machine-checkable user invariant. Tag suite-covered classes [SUITE: X]. Format: | Invariant ID | Description | Class | Suite Coverage |
3. Seed .claude/reviews/BC-USER-SPEC-REAUDIT-coverage-ledger.md: one row per INV-USER-xxx, all untested. Columns: | Invariant ID | Last round | Result | Method | Evidence pointer |
4. Identify which user invariants are executable (input-boundary, cross-scope, auth) and which are enumerated (state-machine transitions, notification rules, cashback logic). Build sweeps for the executable classes if not yet present.
5. Work through untested rows, targeting the highest-severity classes first (cross-scope data access, auth gates, internal-field leaks).
6. File a task for every OPEN row. Roll up to .claude/reviews/BC-USER-SPEC-REAUDIT-reaudit-r1.md.

Runtime: backend on :3025. Use a real subscriber account (mobile user, not admin/partner).
Tier guide: mechanical guard-add pinned by sweep = haiku; auth/state-machine = opus.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All executable sweeps green
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

---

### §6.4 BC-REDEMPTION-SPEC-REAUDIT — Round 1 (bootstrap — must build machinery)

```
You are a neutral re-audit agent for the BoomCard Redemption surface (stickers / venues / bookings / messaging / dashboard).

SCOPE: BC-REDEMPTION-SPEC-REAUDIT
SURFACE: /api/stickers, /api/venues, /api/bookings, /api/messaging, /api/dashboard (39 routes per app-route-ownership-manifest.json, scope = redemption).
MATRIX: NOT YET BUILT — Round 1 bootstrap must build docs/specs/redemption-invariant-matrix.md.
LEDGER: NOT YET BUILT — seed .claude/reviews/BC-REDEMPTION-SPEC-REAUDIT-coverage-ledger.md.

Round 1 Bootstrap — must build the convergence machinery:
1. Enumerate the 39 redemption routes from the manifest. Read the stickers/venues/bookings/messaging/dashboard handlers + spec.
2. Write docs/specs/redemption-invariant-matrix.md (INV-RDM-xxx). Tag suite-covered [SUITE: XSCOPE]/[SUITE: INPUT]/[SUITE: CUR].
3. Seed the ledger (one row per INV-RDM-xxx, all untested; header cells include Result + Invariant).
4. FLAGSHIP class: cross-tenant scoping (a venue/booking owner must never read/modify another's). Build redemption-cross-scope-sweep + input-500 + internal-field-leak sweeps; teeth-prove each. (Do NOT build a currency-leak sweep — see the retirement note in §3.)
5. Work through untested rows (cross-scope, then input-500). File a task (--tier, BC-REDEMPTION-SPEC-REAUDIT-suffixed, --project boomcard) per OPEN row. Roll up to .claude/reviews/BC-REDEMPTION-SPEC-REAUDIT-reaudit-r1.md.

Runtime: backend on :3025. Use venue/partner + subscriber accounts to exercise booking/redemption flows.
Tier guide: mechanical guard pinned by sweep = haiku; cross-scope refactor = sonnet; booking/payment state-machine = opus.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All executable sweeps green + teeth-proved
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

### §6.4b BC-REDEMPTION-SPEC-REAUDIT — Round N+ (continuation, auto-generated)

Same continuation shape as §6.1b/§6.2b: bootstrap done → run standing sweeps first → target only the still-`untested`/oldest INV-RDM ids (the UI injects them) → file tasks only → roll up. EXIT per §2.

---

### §6.5 BC-SYSTEM-SPEC-REAUDIT — Round 1 (bootstrap — must build machinery)

```
You are a neutral re-audit agent for the BoomCard System surface (webhooks / email / integrations / health).

SCOPE: BC-SYSTEM-SPEC-REAUDIT
SURFACE: /api/webhooks, /api/email, /api/integrations, /api/health (17 routes per the manifest, scope = system).
MATRIX: NOT YET BUILT — Round 1 bootstrap must build docs/specs/system-invariant-matrix.md.
LEDGER: NOT YET BUILT — seed .claude/reviews/BC-SYSTEM-SPEC-REAUDIT-coverage-ledger.md.

Round 1 Bootstrap — must build the convergence machinery:
1. Enumerate the 17 system routes. Read the webhook/email/integration/health handlers.
2. Write docs/specs/system-invariant-matrix.md (INV-SYS-xxx). Key classes: webhook signature verification + replay protection, idempotency, secret/credential non-leak, health exposes no internals, integration auth.
3. Seed the ledger (one row per INV-SYS-xxx, all untested; header cells include Result + Invariant).
4. Build sweeps for executable classes (webhook-signature, input-500); teeth-prove each.
5. Work through untested rows (signature/replay + secret-leak first). File a task (--tier, BC-SYSTEM-SPEC-REAUDIT-suffixed, --project boomcard) per OPEN row. Roll up to .claude/reviews/BC-SYSTEM-SPEC-REAUDIT-reaudit-r1.md.

Runtime: backend on :3025. Webhooks with valid + tampered signatures; confirm health returns no secrets/DSNs.
Tier guide: signature/idempotency/secret-handling = opus; mechanical guard pinned by sweep = haiku.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All executable sweeps green + teeth-proved
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

### §6.5b BC-SYSTEM-SPEC-REAUDIT — Round N+ (continuation, auto-generated)

Bootstrap done → run standing sweeps first → target only the still-`untested`/oldest INV-SYS ids → file tasks only → roll up. EXIT per §2.

---

### §6.6 BC-PUBLIC-SPEC-REAUDIT — Round 1 (bootstrap — must build machinery)

```
You are a neutral re-audit agent for the BoomCard Public/Unauthenticated surface (plans / contact / sidebar / mobile config).

SCOPE: BC-PUBLIC-SPEC-REAUDIT
SURFACE: /api/plans, /api/contact, /api/sidebar, /api/config/mobile, /api/mobile (7 routes per the manifest, scope = public). These are UNAUTHENTICATED.
MATRIX: NOT YET BUILT — Round 1 bootstrap must build docs/specs/public-invariant-matrix.md.
LEDGER: NOT YET BUILT — seed .claude/reviews/BC-PUBLIC-SPEC-REAUDIT-coverage-ledger.md.

Round 1 Bootstrap — must build the convergence machinery:
1. Enumerate the 7 public routes. The dominant risk is data exposure + abuse (no auth).
2. Write docs/specs/public-invariant-matrix.md (INV-PUB-xxx). Key classes: no authenticated/PII data on public endpoints, rate-limit / contact-form spam abuse, input-500. (The former "currency dual-display on public pricing" class is retired — see the retirement note in §3.)
3. Seed the ledger (one row per INV-PUB-xxx, all untested; header cells include Result + Invariant).
4. Build sweeps for executable classes (input-500); teeth-prove each.
5. Work through untested rows (data-exposure + input-500 first). File a task (--tier, BC-PUBLIC-SPEC-REAUDIT-suffixed, --project boomcard) per OPEN row. Roll up to .claude/reviews/BC-PUBLIC-SPEC-REAUDIT-reaudit-r1.md.

Runtime: backend on :3025, NO auth token (public). Confirm responses carry no internal/PII fields and pricing honors the BGN→EUR window.
Tier guide: data-exposure/PII = opus; rate-limit/mechanical guard = haiku/sonnet.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All executable sweeps green + teeth-proved
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

### §6.6b BC-PUBLIC-SPEC-REAUDIT — Round N+ (continuation, auto-generated)

Bootstrap done → run standing sweeps first → target only the still-`untested`/oldest INV-PUB ids → file tasks only → roll up. EXIT per §2.

---

## §7 Convergence Monitor UI

The BoomCard Convergence Monitor UI is served at `http://localhost:5124/boomcard-convergence` (part of the `ai-automation-platform` codebase at `/Users/administrator/Documents/ai-automation-platform/`).

- Start: `cd /Users/administrator/Documents/ai-automation-platform && npm run dev:boomcard-monitor`
- Data API: `http://localhost:5124/api/boomcard-convergence/data`
- Board link: `http://localhost:3444/p/boomcard`

The UI reads coverage ledgers, reaudit roll-ups, sweep files, and manifests directly from the filesystem — it is data-driven and updates automatically as normal convergence work progresses.
