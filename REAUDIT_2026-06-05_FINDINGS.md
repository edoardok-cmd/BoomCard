# Independent Re-Audit — 2026-06-05

User-initiated re-audit of the three already-signed-off code audits (`BC-ADMIN-CODE-AUDIT`,
`BC-USER-CODE-AUDIT`, `BC-PARTNER-CODE-AUDIT`) because the prior `approve` verdicts were
suspected of confirmation bias. Scope: the full uncommitted working tree (86 backend + ~41
partner-dashboard files). Every area was re-reviewed independently against the extracted specs
(`docs/specs/06/07/08`) with live runtime checks (API `:3025`, partner-dashboard `:3022`).

**Outcome: the prior approvals did NOT fully hold.** Independent reviewers found and fixed the
defects below. All areas re-verified clean afterward. Review files: `.claude/reviews/BC-*-reaudit-*.md`
in the Agent X workspace.

## Defects the original audits missed (now fixed)

### Admin
- **CRITICAL** — stale `'PREMIUM'` `SubscriptionPlan` enum literal (renamed `PREMIUM_MONTHLY`) left in
  `adminSettings.routes.ts`, `utils/payoutThreshold.ts`, `adminMarketing.routes.ts`, `jobs/scheduler.ts`,
  and allow-lists in `adminCashback`/`adminFinance`. Effects: `GET /admin/settings/payout-thresholds`
  returned 400 on every call; DB-configured payout thresholds were silently never applied (swallowed
  into a constant fallback); the `premium_holders` marketing segment was dead. Fixed + verified
  end-to-end (PUT threshold now reflected on GET).
- **HIGH** — `POST /admin/cashback/rates` returned 500 on a legitimate validation error (brittle
  substring whitelist). Now `AppError`-based → 400.
- **MEDIUM** — `adminCashback.service.markPaid` bypassed the period-lock + PAID-freeze guards the
  `/finance` module enforces → could silently rewrite frozen LOCKED/INVOICED period financials.
  Guards added (409/400).
- **LOW** — admin finance CSV export: non-RFC-4180 quoting + no formula-injection neutralization. Fixed.
- **LOW** — receipt-template PATCH could blank required `merchantName`; trim asymmetry POST vs PATCH. Fixed.

### User
- **MEDIUM** — `wallet.service.voidTrialPendingCashback` left `cashbackStatus=TRIAL_PENDING` (only set
  `status=CANCELLED`), so voided trial cashback stayed counted in the user-facing "Pending" balance
  indefinitely (spec §3.1). Now sets `cashbackStatus=VOIDED` to match the scheduler path. Verified.

### Partner (backend)
- **HIGH** — `subscription.service.ts`: every not-found / forbidden / invalid-state branch threw plain
  `Error` → HTTP 500, including a **cross-user attempt returning 500 instead of 403** (authz disclosure)
  and owner-reachable invalid-state 500s that leaked a stack in dev. All throws converted to `AppError`
  with correct status (404/403/400). Took two fix rounds (first pass missed the invalid-state branches).
- **MEDIUM** — subscriber `GET /api/help/tickets/:id` leaked internal `priority`/`source`. Projection
  trimmed to match the partner sibling.

### Partner (frontend)
- **HIGH** — partner registration phone validator accepted international E.164 while the backend is
  Bulgarian-only → dead-end backend 400. FE validator aligned to backend regex `/^(\+359|0)\d{9}$/`.
- **MEDIUM** — consumer offer view (`offers.service.mapOffer` + `VenueDetailPage`) fabricated absolute
  BGN prices (hardcoded ~200 BGN fallback) and rendered them as real money. Backend has no price model.
  Now shows the genuine discount **percentage** only.
- **MEDIUM** — dashboard KPI labeled "Оборот / Turnover" actually summed `cashbackAmount` (cashback paid),
  not gross volume (spec §5.3). Relabeled "Изплатен кешбек / Cashback paid".

## Contested finding — adjudicated NOT a violation
- `partner.partnerType.maxDiscountRate` is returned on the `/api/offers` wire. One reviewer flagged it as
  a leak (citing §11.3/§12-rule-6). **Adjudicated against the spec: not a violation.** §11.3 / rule 10.6
  define internal-only as the **margin %** and **cashback % split** (the Business Formula) — both
  confirmed correctly withheld. `maxDiscountRate` is a partner-type discount *ceiling*, not the formula
  split, and is not in the internal-only list. Trimming it from the payload is optional hardening, not a
  defect. (Cited "rule 6" is actually about notification templates.)

## Remaining non-blocking LOW notes (not fixed; deliberate)
- `AnalyticsDashboard.tsx:346` partner revenue `= redemptionCount * (discountedPrice||0)` is now
  structurally 0 after the price-fabrication removal — pre-existing, worth a follow-up.
- Backend phone regex trims-then-matches before sanitizing, so a direct (non-FE) API caller posting a
  spaced BG number still gets 400 — backend ticket.
- Misc cosmetic items (duplicate `asyncHandler`, `as any` casts in `payoutThreshold.ts`, append-only
  payout-threshold history growth) recorded in the individual review files.

## Caveat / coverage gap
- The partner-spec **§7 "Финанси"** view (monthly reports, contracted commission %, BGN→EUR dual-currency,
  CSV export) was NOT present in the changed file set and is NOT covered by this re-audit. If a partner
  Finance page is expected, it needs its own scoped pass.

All changes remain **uncommitted** in the working tree.
