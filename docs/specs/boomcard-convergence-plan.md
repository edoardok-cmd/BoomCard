# BoomCard Convergence Plan

This document describes the convergence machinery for the BoomCard audit surface. It mirrors the pattern from `my-dashboard/docs/convergence-plan.md` but is BoomCard-specific.

## §1 Overview

BoomCard has three re-audit scopes:

| Scope ID | Surface | Matrix | Ledger | Sweeps | Status |
|---|---|---|---|---|---|
| `BC-ADMIN-SPEC-REAUDIT` | Admin spec (227+ invariants) | `docs/specs/admin-invariant-matrix.md` | `.claude/reviews/BC-ADMIN-SPEC-REAUDIT-coverage-ledger.md` | admin-currency-leak-sweep, admin-uuid-500-sweep, app-route-ownership | Active (r4+) |
| `BC-PARTNER-SPEC-REAUDIT` | Partner spec (114+ invariants) | `docs/specs/partner-spec-invariant-matrix.md` | `.claude/reviews/BC-PARTNER-SPEC-REAUDIT-coverage-ledger.md` | partner-cross-scope-sweep, partner-currency-leak-sweep, partner-uuid-500-sweep | Active (r2+) |
| `BC-USER-SPEC-REAUDIT` | User (mobile subscriber) spec | `docs/specs/user-invariant-matrix.md` (not yet built) | `.claude/reviews/BC-USER-SPEC-REAUDIT-coverage-ledger.md` (not yet built) | none yet | Bootstrap needed |

## §2 Convergence machinery (common to all scopes)

The convergence machinery makes the audit terminate instead of sampling the same surfaces endlessly. Per scope:

1. **Invariant matrix** — enumerate every machine-checkable invariant for the surface. One row per invariant ID (`INV-xxx-yyy`). Tag suite-covered classes `[SUITE: X]`.
2. **Coverage ledger** — track `verified` / `open` / `untested` per invariant row. Lives in the Agent X harness at `.claude/reviews/<scope-id>-coverage-ledger.md`.
3. **Executable sweeps** — route-introspecting test files that walk the live stack. Each must be teeth-proved (a `.teeth.test.ts` that confirms the sweep goes RED on a known historical leak, then GREEN after the fix).
4. **Re-audit roll-ups** — `.claude/reviews/<scope-id>-reaudit-r<N>.md` per round. Round counter advances each time.
5. **Exit criteria** (ALL three must hold before the scope is done):
   - Every ledger row = `verified` (zero `open`, zero `untested`)
   - Full sweep suite green
   - Two consecutive independent passes add ZERO new invariants to the matrix

## §3 Sweep files (BoomCard repo paths)

All sweep files live in `backend-api/tests/integration/`:

| Sweep | File | Scope |
|---|---|---|
| `admin-currency-leak-sweep` | `backend-api/tests/integration/admin-currency-leak-sweep.test.ts` | BC-ADMIN-SPEC-REAUDIT |
| `admin-uuid-500-sweep` | `backend-api/tests/integration/admin-uuid-500-sweep.test.ts` | BC-ADMIN-SPEC-REAUDIT |
| `partner-cross-scope-sweep` | `backend-api/tests/integration/partner-cross-scope-sweep.test.ts` | BC-PARTNER-SPEC-REAUDIT |
| `partner-currency-leak-sweep` | `backend-api/tests/integration/partner-currency-leak-sweep.test.ts` | BC-PARTNER-SPEC-REAUDIT |
| `partner-uuid-500-sweep` | `backend-api/tests/integration/partner-uuid-500-sweep.test.ts` | BC-PARTNER-SPEC-REAUDIT |

Manifests: `backend-api/tests/app-route-ownership-manifest.json`, `backend-api/tests/admin-endpoint-manifest.json`.

## §4 Runtime recipe

- Backend on `:3025` (the BoomCard API). Health check: `curl http://localhost:3025/health`.
- Admin login: `admin@boomcard.bg` / `admin123`, `clientType:web` → `SUPER_ADMIN`.
- Partner login: see `CREDENTIALS.md` in the BoomCard repo root.
- User (mobile) login: use a real subscriber account.

## §5 Exit-criteria enforcement

`finish-task.py` (in the Agent X harness) refuses to complete a re-audit scope whose ledger has any `open`/`untested` row. The dashboard's `effectiveStatusFor` applies the same gate. A scope with no ledger is unaffected (no-op).

The coverage ledgers live in the Agent X harness workspace at `.claude/reviews/<scope-id>-coverage-ledger.md`.

## §6 Re-audit prompts

Copy-paste-ready prompts for each scope. These prompts are also rendered live in the BoomCard Convergence Monitor UI at `http://localhost:5124/boomcard-convergence`.

---

### §6.1 BC-ADMIN-SPEC-REAUDIT — Round 1 (bootstrap)

```
You are a neutral re-audit agent for the BoomCard Admin surface.

SCOPE: BC-ADMIN-SPEC-REAUDIT
MATRIX: /Users/administrator/Documents/BoomCard/docs/specs/admin-invariant-matrix.md (227+ enumerated invariants)
LEDGER: /Users/administrator/Documents/AI Projects/Agent X/.claude/reviews/BC-ADMIN-SPEC-REAUDIT-coverage-ledger.md
SWEEPS: backend-api/tests/integration/admin-currency-leak-sweep.test.ts, backend-api/tests/integration/admin-uuid-500-sweep.test.ts, backend-api/tests/app-route-ownership-manifest.json

Round 1 Bootstrap — full pass:
1. Run all standing suite tests (admin-currency-leak-sweep, admin-uuid-500-sweep). File any red tests as HIGH tasks immediately.
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
MATRIX: /Users/administrator/Documents/BoomCard/docs/specs/partner-spec-invariant-matrix.md (113+ enumerated invariants)
LEDGER: /Users/administrator/Documents/AI Projects/Agent X/.claude/reviews/BC-PARTNER-SPEC-REAUDIT-coverage-ledger.md
SWEEPS: backend-api/tests/integration/partner-cross-scope-sweep.test.ts, backend-api/tests/integration/partner-currency-leak-sweep.test.ts, backend-api/tests/integration/partner-uuid-500-sweep.test.ts

Round 1 Bootstrap — full pass:
1. Run all three partner sweeps (cross-scope, currency-leak, uuid-500). File any red tests as HIGH tasks immediately.
2. Import the coverage skeleton (INV- IDs + untested rows only — NOT prior verdicts — independence must be preserved).
3. Work through ALL untested rows, targeting oldest-`Last round` first. Use static read, runtime probe (curl vs :3025 with PARTNER login), and suite results.
4. Record results in the ledger (verified/open/untested). File a task (--tier, BC-PARTNER-SPEC-REAUDIT-suffixed) for every OPEN row.
5. Roll up to .claude/reviews/BC-PARTNER-SPEC-REAUDIT-reaudit-r<N>.md.
6. Check: did this pass add any new invariants? If yes, exit criterion 3 resets.

Runtime: backend on :3025. PARTNER login: use a ACTIVE partner account (check CREDENTIALS.md in BoomCard repo for test partner creds).
Sweeps are teeth-proved in the integration test suite.
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
1. Run partner-cross-scope-sweep, partner-currency-leak-sweep, partner-uuid-500-sweep first. Red = free findings.
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
5. Work through untested rows, targeting the highest-severity classes first (cross-scope data access, auth gates, currency leaks).
6. File a task for every OPEN row. Roll up to .claude/reviews/BC-USER-SPEC-REAUDIT-reaudit-r1.md.

Runtime: backend on :3025. Use a real subscriber account (mobile user, not admin/partner).
Tier guide: mechanical guard-add pinned by sweep = haiku; auth/state-machine = opus.

EXIT (ALL three must hold):
  1. Every ledger row = verified (zero open, zero untested)
  2. All executable sweeps green
  3. Two consecutive independent passes add zero new invariants and zero new findings
```

---

## §7 Convergence Monitor UI

The BoomCard Convergence Monitor UI is served at `http://localhost:5124/boomcard-convergence` (part of the `ai-automation-platform` codebase at `/Users/administrator/Documents/ai-automation-platform/`).

- Start: `cd /Users/administrator/Documents/ai-automation-platform && npm run dev:boomcard-monitor`
- Data API: `http://localhost:5124/api/boomcard-convergence/data`
- Board link: `http://localhost:3444/p/boomcard`

The UI reads coverage ledgers, reaudit roll-ups, sweep files, and manifests directly from the filesystem — it is data-driven and updates automatically as normal convergence work progresses.
