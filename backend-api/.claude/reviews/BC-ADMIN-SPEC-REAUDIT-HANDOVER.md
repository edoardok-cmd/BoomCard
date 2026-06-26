# BC-ADMIN-SPEC-REAUDIT — Handover / Findings Roll-up

**Date:** 2026-06-26 · **Git HEAD:** 29e7640 · **Auditor:** orchestrator (7 parallel domain reviewers)
**Scope:** Full independent re-audit of the admin backend vs `docs/specs/06-admin-spec-extracted.md`.
**Mode:** STATIC analysis. The live BoomCard backend was NOT running during the audit (port 5174 is the Agent X dashboard, not BoomCard). **No runtime checks were performed** — each filed task carries a runtime-verification requirement for its fix audit loop.

## Verdict on the prior approve
- Prior `BC-ADMIN-SPEC-AUDIT` (approve 2026-06-04) is **CONFIRMED** for domains **C (cashback/risk)** and **E (financial/payouts)** — both clean, all spec checks conform.
- Prior approve is **PARTIALLY INVALIDATED** for domains A, B, D, F, G — 11 real defects the original cycle missed (1 HIGH, 3 MEDIUM, 7 LOW). None are critical/exploitable, but per the workspace severity rule all are must-fix.

## What the original audit missed (root themes)
1. **Concurrency / TOCTOU** — the "never zero active Super-Admins" and "2-of-N dual approval" invariants are read-then-write, not transactional (domain A). Static spec-text checks pass; the race only shows under concurrency.
2. **Notification trigger gaps** — partner template #7 (Contract Changes) is defined but has zero callers; admin commission edits notify nobody (domain G, HIGH).
3. **Best-effort vs backend-enforced** — QR auto-deactivation runs post-commit and can silently leave stale ACTIVE rows; the promised reconciliation cron was never built (domain D).
4. **Permission-tier bypass & doc/defense-in-depth drift** — DELETED→ACTIVE flip skips the /restore tier; scan-gate middleware omits the account-status dimension (domain B).
5. **Threading & canonical-enum leaks** — 8-hex shortRef collisions, and *_CHANGE sub-types fragmenting the canonical Change bucket (domain F).

## Filed tasks (11) — see dashboard, project boomcard
Wave suffix = parallelizable batch (no two tasks in a wave touch the same file).

**Wave 1 (9):** CONTRACT-NOTIFY (HIGH), SA-GUARD-RACES (MED), QR-SYNC-DURABILITY (MED), IMP-AUDIT-AWAIT, SCANGATE-INACTIVE, DELETED-RESTORE-BYPASS, TICKET-SHORTREF, HELP-CHANGE-BUCKET, ALERT-FAILEDTX-TIER (all LOW).
**Wave 2 (2):** PENDING-SUPER-HYGIENE, PARTNER-ARCHIVE-HARDEN (LOW) — depend on the wave-1 tasks that share their files (adminAdmins.routes.ts, scheduler.ts, partner.service.ts).

## Note for the next agent
Do not trust the prior `approve` for the five affected domains until these tasks close with **runtime** verification against a real BoomCard backend (boomcard_test, alt port; `NODE_ENV=test` suppresses `startServer()` so override `DATABASE_URL`). Domains C and E were independently re-confirmed clean and need no rework.