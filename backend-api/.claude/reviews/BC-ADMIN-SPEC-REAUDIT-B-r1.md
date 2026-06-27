# BC-ADMIN-SPEC-REAUDIT-B-r1 — Domain B: User Accounts & Subscriptions

Independent re-audit (wave 5) of the BoomCard admin backend, Domain B: account
lifecycle, subscription status lifecycle, scanning gate, status transitions.
Spec: `docs/specs/06-admin-spec-extracted.md` §1.1, §1.2, §3.2, §3.3, §8.1 rule 1,
§7.1, Clash 2.3 / 11.4, Gap 12.

## Summary

The previously-flagged invariants from waves 1–4 **hold**:
- `SCANGATE-INACTIVE` — both the middleware (`requireActiveSubscription`) and the
  service gate (`sticker.service.assertSubscriptionAllowsScanning`) check the
  user-account dimension (INACTIVE/ARCHIVED/DELETED) BEFORE subscription status.
- `SCANGATE-SELECTION` — middleware and scan-service both select via the shared
  `findEligibleSubscription()` (subscriptionGate.ts) — same subscription. ✔
- `FAILEDPAY-CANCEL-SCANGATE` — admin-cancel of FAILED_PAYMENT stamps
  `currentPeriodEnd = now`, so the resulting CANCELLED row is immediately
  post-period and cannot re-open the gate (adminSubscribers.routes.ts:875-897). ✔
- `ARCHIVE-RESTORE-BYPASS` / `DELETED-RESTORE-BYPASS` — DELETE persists
  `statusBeforeDelete`; /restore revives to the exact prior status; ARCHIVED→active
  revert is blocked in PATCH /status. Confirmed at runtime. ✔
- Password-reset rate limiting thresholds are exact: alert at 3, suspend at 5,
  24h window (auth.service.ts:1962-1965). ✔
- One renewal attempt → no retry guard (`retryAttempt > 0` blocks; service:833). ✔
- Risk thresholds 0–20 / 21–50 / 51+ correct in filter + bucketForScore. ✔
- Subscription reactivate/resume reject terminal states and never revive
  EXPIRED/FAILED_PAYMENT to ACTIVE bypassing payment. ✔

Two open findings: one MEDIUM (SUSPENDED account-status bypass of Super-Admin
review via PATCH /status) and one LOW (cashback-creation defense-in-depth guard
selects a different subscription than the scan gate — divergence from the
SCANGATE-SELECTION single-subscription invariant).

## Findings

### B1 — MEDIUM — PATCH /status lets a non-SA admin clear a SUSPENDED account, bypassing the Super-Admin review gate

- **File:** `src/routes/adminSubscribers.routes.ts:499-543` (PATCH /:userId/status)
- **Spec ref:** §3.2 "Account suspension pending Super Admin review triggered at
  5 password resets within 24 hours"; Part 4 (Super Admin) "Triggers account
  suspension review when 5 password resets occur in 24h for a user"; Clash 11.4.
- **Evidence:** The handler only protects two states:
  ```
  if (user.status === 'DELETED')  → 400 (use /restore)
  if (user.status === 'ARCHIVED' && status !== 'ARCHIVED') → 400 (terminal)
  ```
  A `SUSPENDED` user (the auto-lockout state set by `forgotPassword` at 5 resets/24h,
  `auth.service.ts:2050-2053`, status='SUSPENDED' "pending Super Admin review")
  falls through every guard. Any admin holding `subscribers.write` (ADMIN, not just
  SUPER_ADMIN — route is `authorize('ADMIN','SUPER_ADMIN')`) can PATCH the user to
  ACTIVE and silently lift the abuse lockout. There is no SA-only unsuspend route
  and no review-record requirement (grep for unsuspend/clearSuspension → none).
- **Runtime confirmation (gap class):** With a real SUPER_ADMIN token against the
  live server (127.0.0.1:3025) I PATCHed a `PENDING_VERIFICATION` USER directly to
  ACTIVE and the route returned `{"ok":true,"status":"ACTIVE"}` — i.e. the handler
  accepts any non-DELETED/non-ARCHIVED source status with zero gating.
  `SUSPENDED` is in the identical fall-through bucket, so `SUSPENDED → ACTIVE`
  is accepted the same way. (ARCHIVED→ACTIVE was correctly rejected, confirming the
  guard set is exactly {DELETED, ARCHIVED}.)
- **Why wrong:** The 5-resets-in-24h suspension is a security lockout the spec
  explicitly reserves for *Super Admin* review. A standard admin clearing it
  defeats the lockout and the SA-ownership of the review, and does so without an
  enforced reason/review-record. (Contrast: ARCHIVED, DELETED, and the
  last-active-SUPER_ADMIN deactivation are all gated; SUSPENDED is not.)
- **Suggested fix:** In PATCH /status, treat `user.status === 'SUSPENDED'` as a
  protected state: require `req.user.role === 'SUPER_ADMIN'` (and ideally a
  `reason`) to transition SUSPENDED→ACTIVE/INACTIVE, and write an audit row
  (e.g. `auth.password-reset.suspension-cleared`). Standard admins should get 403.

### B2 — LOW — Cashback-creation defense-in-depth gate selects the LATEST subscription, diverging from the scan gate's any-eligible selection

- **File:** `src/services/cashbackLifecycle.service.ts:640-666`
  (`recordPendingForRiskReview`)
- **Spec ref:** §8.1 rule 1 (new cashback never generated while scanning blocked);
  §4.1/§8.1 earned-rights; SCANGATE-SELECTION invariant ("the two code paths select
  the SAME subscription").
- **Evidence:** The scan gates use `findEligibleSubscription()` which returns
  *any* earning-eligible subscription (ACTIVE/TRIALING/CANCELLED-within-period,
  `orderBy createdAt asc`). This cashback-creation guard instead reads the
  **latest** subscription only:
  ```
  prisma.subscription.findFirst({ where:{ userId }, orderBy:{ createdAt:'desc' },
    select:{ status:true, currentPeriodEnd:true } })
  ...
  if (!subscriptionAllowsEarning(sub.status, sub.currentPeriodEnd, now)) throw …
  ```
  The high-risk cashback path (`sticker.service.ts:1630, 1698`) calls
  `recordPendingForRiskReview` *after* `assertSubscriptionAllowsScanning`
  (sticker.service.ts:880/1051, via findEligibleSubscription).
- **Why wrong:** Edge case — a user with an older CANCELLED-within-period sub
  (eligible → scan ALLOWED) **and** a newer terminal sub (e.g. EXPIRED). The scan
  gate lets them scan, but this guard reads the newer EXPIRED row →
  `subscriptionAllowsEarning(EXPIRED)=false` → throws "Cannot create cashback",
  denying cashback the user was entitled to earn during the still-paid period.
  This is an over-block (fail-safe direction, so not a leak), but it contradicts
  the explicit SCANGATE-SELECTION single-subscription alignment and the
  earned-rights model. It cannot create cashback when scanning is blocked (the
  invariant the guard exists to protect still holds in the unsafe direction).
- **Suggested fix:** Replace the `findFirst({orderBy:createdAt desc})` with
  `findEligibleSubscription(userId, now)` and gate on its presence — exactly as the
  middleware and sticker.service do — so all three paths evaluate the same
  subscription. (Keep the user-status INACTIVE/ARCHIVED check as-is.)

## Runtime checks

Live server `http://127.0.0.1:3025` (health: `{"status":"ok"}`), SUPER_ADMIN login
(`admin@boomcard.bg`, clientType=web → `data.accessToken`).

| # | Command | Observed |
|---|---------|----------|
| 1 | `GET /api/admin/subscribers?limit=3` | 200, USER rows returned (status, plan, wallet) |
| 2 | `PATCH /subscribers/:id/status {"status":"SUSPENDED"}` | 400 `status must be ACTIVE, INACTIVE, or ARCHIVED` (target-value validation works) |
| 3 | `PATCH /subscribers/:id/status {"status":"ACTIVE"}` on a PENDING_VERIFICATION user | **200 `{"ok":true,"status":"ACTIVE"}`** — no source-status guard → demonstrates B1 fall-through |
| 4 | `PATCH …/status {"status":"ARCHIVED"}` then `{"status":"ACTIVE"}` | revert → 400 "Archived accounts are terminal" ✔ |
| 5 | `PATCH …/status {"status":"INACTIVE"}` on the archived user | 400 terminal ✔ |

Note: test user `b613c335-…@boomcard.bg` (a `withdraw-…` fixture) was flipped
PENDING_VERIFICATION→ACTIVE→ARCHIVED during checks 3–4 and is now ARCHIVED
(terminal). It is a disposable test fixture; no production data touched.

## Integration points checked

- `auth.middleware.ts:479 requireActiveSubscription` → `subscriptionGate.findEligibleSubscription:140-159` — middleware account-status gate + shared subscription selection.
- `sticker.service.ts:260 assertSubscriptionAllowsScanning` → `subscriptionGate.findEligibleSubscription` + `subscriptionAllowsEarning:36-79` — service scan gate uses identical selection as middleware (SCANGATE-SELECTION holds).
- `auth.service.ts:2050 forgotPassword suspension (status=SUSPENDED)` → `adminSubscribers.routes.ts:499 PATCH /status` — SUSPENDED is set by the abuse lockout but PATCH /status has no SUSPENDED guard (B1).
- `adminSubscribers.routes.ts:1413 DELETE /account (statusBeforeDelete)` → `:1460 POST /restore (revivedStatus)` — round-trip preserves prior status incl. ARCHIVED/SUSPENDED (ARCHIVE-RESTORE-BYPASS holds).
- `adminSubscribers.routes.ts:859 admin cancel FAILED_PAYMENT (currentPeriodEnd=now)` → `subscriptionGate.findEligibleSubscription CANCELLED+currentPeriodEnd>now` — gate cannot re-open (FAILEDPAY-CANCEL-SCANGATE holds).
- `sticker.service.ts:1630 recordPendingForRiskReview` → `cashbackLifecycle.service.ts:640 latest-sub guard` — selection divergence (B2).
- `adminSubscriptions.routes.ts:515 /reactivate` & `:590 /resume` → reject CANCELLED/EXPIRED/INCOMPLETE_EXPIRED; resume only from PAUSED and rolls period forward — no terminal→active payment bypass.

## Verdict

request-changes

(One MEDIUM [B1] and one LOW [B2]; no CRITICAL/HIGH. All severities are must-fix
per the workspace severity rule, so this gates approval.)
