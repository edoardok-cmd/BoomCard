# BC-ADMIN-SPEC-REAUDIT — Wave-5 Independent Re-Audit Roll-Up (r1)

**Date:** 2026-06-27
**Scope:** Full independent re-audit of the entire BoomCard admin backend vs `docs/specs/06-admin-spec-extracted.md`, after 4 prior re-audit waves (REAUDIT / REAUDIT2 / REAUDIT3 / REAUDIT4) all closed `approve`.
**Method:** 7 parallel domain reviewers (A–G) + adversarial verification pass on every HIGH/MEDIUM finding. Live runtime exercised against `http://127.0.0.1:3025` (dev) as SUPER_ADMIN. Independent briefs — no prior verdicts/findings passed forward (re-audit independence per `workflows/re-audit.md`).
**Per-domain files:** `BC-ADMIN-SPEC-REAUDIT-{A..G}-r1.md`.

## Verdict: BLOCK — 8 confirmed open findings (3 HIGH, 1 MEDIUM, 4 LOW)

Prior approvals **largely CONFIRMED**: every prior-wave fix re-checked independently still holds (domains A, C, D, G fully clean; all ~30 prior-wave regressions re-verified). The re-audit was **not** confirmation-biased on those. However, the re-audit **surfaced 8 genuinely-open defects** the prior waves missed — chiefly a currency-leak class on three finance/transaction read surfaces that the earlier currency sweeps (CURRENCY-ADMIN-SWEEP, PAYOUT-THRESH-BGN-LEAK) did not cover.

| Domain | Verdict | Findings |
|---|---|---|
| A — Admin accounts/roles/impersonation/auth | approve | clean |
| B — Users + subscriptions | request-changes | B1 (MED), B2 (LOW) |
| C — Cashback + risk | approve | clean |
| D — Partners/apps/QR/locations | approve | clean |
| E — Financial/payouts/currency | block | E1, E2, E3 (HIGH) |
| F — Help requests + email | request-changes | F1, F2, F3 (LOW) |
| G — Dashboard/alerts/notifications | approve | clean |

## Confirmed findings → filed tasks (all Wave 1; disjoint file sets → fully parallelizable)

| Finding | Sev | File | Task ID |
|---|---|---|---|
| E1+E2 — `/finance/invoices` & `/finance/reports` leak raw BGN after EUR window closes | HIGH | adminFinance.routes.ts | BC-ADMIN-SPEC-REAUDIT5-FINANCE-BGN-LEAK-1 |
| E3 — adminTransactions endpoints have no currency-window handling | HIGH | adminTransactions.routes.ts | BC-ADMIN-SPEC-REAUDIT5-TXN-BGN-LEAK-1 |
| B1 — non-SA admin can clear SUSPENDED subscriber (no SA gate/review) | MED | adminSubscribers.routes.ts | BC-ADMIN-SPEC-REAUDIT5-SUSPENDED-SA-GATE-1 |
| B2 — cashback-creation gate selects different subscription than scan gate | LOW | cashbackLifecycle.service.ts | BC-ADMIN-SPEC-REAUDIT5-CASHBACK-SUB-SELECT-1 |
| F1 — help `?requestType=Change` rejected (filter accepts only raw enum) | LOW | adminHelp.routes.ts | BC-ADMIN-SPEC-REAUDIT5-HELP-REQTYPE-FILTER-1 |
| F2+F3 — web-form/contact shortRef bypass shared collision-retry helper | LOW | helpTicketIntake.service.ts + contact.routes.ts | BC-ADMIN-SPEC-REAUDIT5-SHORTREF-RETRY-1 |

## Runtime checks performed
- Currency window observed CLOSED live (`currencyDisplayMode:eur_only`, `windowOpen:false`); raw BGN scalars proven present in `/finance/invoices`, `/finance/reports` (populated date range required — default current-month period is empty), and all four `adminTransactions` endpoints. Sibling gated blocks in the same responses prove the leaks are unintended.
- Domain A: ADMIN→USER impersonation = 403; impersonatable-users SA-gated; init→cancel SA round-trip.
- Domain B: ARCHIVED→ACTIVE = 400 (guard set proven exactly {DELETED, ARCHIVED}); password-reset thresholds 3/5/24h exact.
- Domain C: illegal cashback transitions rejected live (void-on-Voided 400, approve-on-EXPIRED 400); void vocabulary enforced.
- Domain D: live partner ACTIVE→INACTIVE→ARCHIVED cascade + public-visibility hide + re-onboarding path (test partner fully restored after).
- Domain F: invalid `?status=` → 400 (no silent unfilter); PATCH→CANCELLED/REJECTED → 400.
- Domain G: every alert `tier` matched its bucket (0 mismatches); informational daily-digest push present.

## Integration points checked
Auth/permission middleware (fail-closed key classifier), impersonation token claims, scanning-gate vs cashback-gate subscription selection, currency-window single-source helper, partner-status→QR atomic cascade (in-transaction), activation-link lifecycle, notification template→trigger tracing (12 canonical), scheduler cadences.

## Note for next agent
The prior `approve` on BC-ADMIN-SPEC-AUDIT was **not** invalidated for the audited surfaces — it was incomplete. The currency sweep in earlier waves stopped at exports + payout thresholds and never reached `/finance/invoices`, `/finance/reports`, or `adminTransactions.*`. After Wave-1 fixes land + their own impl/task audits pass clean, a Wave-5 re-audit r2 should re-confirm the whole currency-display class is closed across every admin read surface.