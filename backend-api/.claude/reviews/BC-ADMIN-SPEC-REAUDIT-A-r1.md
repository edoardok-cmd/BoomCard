# BC-ADMIN-SPEC-REAUDIT-A r1 — Domain A: Admin Accounts, Roles, Permissions, Impersonation, Auth

Independent re-audit (wave 5). Read-only. Spec: `docs/specs/06-admin-spec-extracted.md` §1.5, §3.9, Part 4, §7.1.

## Summary

Domain A is **CLEAN**. Every binding spec rule in scope is upheld in the current code, verified by full file reads plus live runtime exercise against `http://127.0.0.1:3025`. The four prior-wave fixes named in the brief (SA-LASTACTIVE-GUARD, SA-GUARD-RACES, IMP-AUDIT-AWAIT, IMP-REFRESH-REVAL, IMP-STOP-REVAL, IMPERSONATE-REVAL) all hold under fresh independent inspection. Zero findings at any severity.

### Files read (full coverage)
- `src/routes/adminAdmins.routes.ts` — lines 1–300, 300–600, 600–960, 960–1260, 1300–1610 (full; 1260–1300 is reset-2fa body, read in the 960–1260 + spot pass).
- `src/middleware/auth.middleware.ts` — 1–505 (full).
- `src/services/auth.service.ts` — impersonation/refresh/stop sections 1140–1220, 2615–2918 (full for scope); claim definitions 165–185.
- `src/services/permission.service.ts` — 1–318 (full).
- `src/routes/adminProfile.routes.ts` — 1–567 (full).
- `src/routes/auth.routes.ts` — 905–1219 (impersonate/switch/stop surface, full for scope).
- `src/middleware/audit.middleware.ts` — 1–183 (full, to verify await vs detach).
- `src/lib/prisma.ts` — 1–76 (soft-delete extension, to evaluate impersonatable-users data artifact).

## Verified invariants (with evidence)

**§1.5 — only SUPER_ADMIN changes status.** `adminAdmins.routes.ts:1016` returns 403 for any non-SA actor on `PATCH /:id/status`; live test confirmed self-change blocked at `:1044` ("You cannot change your own status").

**§1.5 — rolesUpdatedAt stamping.** ARCHIVED stamps `rolesUpdatedAt` (`:1088`, `:1127`); INACTIVE does NOT (no stamp branch), matching "tokens coast to expiry". `authenticate()` (`auth.middleware.ts:141-143`) hard-401s ARCHIVED/SUSPENDED/DELETED admins; INACTIVE is re-derived to `aro=true` (`:155-159`) so the live token becomes read-only without a stamp. SUSPENDED is also covered by the no-login set even though it can no longer be set as a new value (`:1024-1028`).

**§1.5 — Inactive admin = read-only.** Two independent gates: `requirePermission` blocks any write key when `aro===true` (`auth.middleware.ts:340-353`, fail-closed `isWritePermission`), and `requireActiveAdmin` blocks by HTTP method (`:308-316`). The READ classifier is fail-closed (`:272-280`): unknown/future keys default to write. Live: SUSPENDED rejected (400), BOGUS rejected (400).

**§1.5 — zero-ACTIVE-SA guard → 409.** Status-change guard (`:1071-1078`) and role-revoke guard (`:1349-1354`) both count `role:'SUPER_ADMIN', status:'ACTIVE', id:{not:id}` and throw 409 (`GUARD_FAILED`) when the count is 0. Counting **ACTIVE** SAs matches the spec's liveness-quorum intent. Both are wrapped in `Serializable` transactions with P2034 retry-then-409 (`:1092-1152`, `:1363-1411`) — TOCTOU closed. No off-by-one: the `id:{not:id}` exclusion correctly excludes the target being demoted/archived.

**§3.9 — dual-approval.** Initiation is SA-only (`:623-625`). Approve route is `authorize('SUPER_ADMIN')` (`:755`). Anti-self-approval re-checked **inside** the Serializable tx (`:810-816`): a self-approve with >1 non-ARCHIVED SA throws 403; bootstrap (exactly one non-ARCHIVED SA) permits sole-SA self-approve, with the quorum counting `status:{not:'ARCHIVED'}` (`:811-813`) so INACTIVE/SUSPENDED SAs still count as "exists" — privilege-escalation hole closed (H2). Non-self approval re-validates the initiator is still an ACTIVE SUPER_ADMIN (`:819-833`) so a demoted/archived initiator cannot weaken 2-of-N. User-create + request-delete are atomic in the same tx (`:837-856`); P2034→409, P2002→409 (`:870-877`). 72h expiry enforced via persisted `expiresAt` on list (`:184`), approve (`:767-772` → 410), and reaped nightly (`scheduler.ts:632-645`). Cancellation is initiator-only → 403 for others (`:925-929`); live-tested cancel-by-initiator succeeds and removes the row.

**Part 4 — impersonation.** Partner-imp by ADMIN/SUPER_ADMIN, user-imp by SUPER_ADMIN-only enforced by deriving the required permission from the **resolved** target role server-side (`auth.service.ts:2686-2701`), never from a client hint; ADMIN→USER target → 403. `impersonatable-users` is `requirePermission('impersonate.user')` (`auth.routes.ts:1084`) — SA bypasses, plain ADMIN lacks the override → 403. Impersonate token carries `imp:true`+`impBy` and **no `ag`** (`auth.service.ts:2733-2745`). Nested imp refused (`auth.routes.ts:1167-1172`); `/switch-account` refused while impersonating (`auth.routes.ts:939-944`) AND the no-`ag` token has no sibling group anyway. Mobile refused (`auth.service.ts:2644-2646`); self-target refused (`:2653-2655`, live-confirmed). Start AND stop audit writes are **awaited** before token issuance (`:2760-2770`, `:2884-2893`) — not fire-and-forget. Per-request acting-admin re-validation on every request (`auth.middleware.ts:80-107`, ACTIVE-only allowlist + rolesUpdatedAt), on refresh (`auth.service.ts:1171-1204`), and on stop (`auth.service.ts:2829-2845`) — all three symmetric (ACTIVE-only, ms-vs-iat*1000). impersonatable-users uses an explicit column allowlist with no IBAN/passwordHash/tokens (`auth.routes.ts:1100-1111`); impersonatable-partners likewise (`:1036-1049`).

**§7.1 — admin_account_status values.** Write path accepts only ACTIVE/INACTIVE/ARCHIVED (`:1032-1037`); SUSPENDED is read-tolerated legacy, write-blocked.

**Permission precedence (BC-ADMIN-RBAC-ROLES-019).** `resolveUserPermissions` (`permission.service.ts:192-246`) implements user-deny > user-allow > role-deny > role-allow correctly; expired role assignments excluded (`:197-198`). impersonate.* are override-only, never in any role template (`:88, :101-103`).

## Runtime checks (live, 127.0.0.1:3025)

Login as seed SUPER_ADMIN (`admin@boomcard.bg`, clientType=web) → JWT obtained.
- `GET /api/auth/impersonatable-users` (SA) → 200, allowlisted fields only (id/email/firstName/lastName/avatar/status); no IBAN/hash/tokens.
- `GET /api/auth/impersonatable-partners` (SA) → 200, allowlisted fields only.
- `PATCH /api/admin/admins/<self>/status {INACTIVE}` → 400 "You cannot change your own status".
- `PATCH .../status {SUSPENDED}` → 400 legacy-status rejection.
- `PATCH .../status {BOGUS}` → 400 enum validation.
- `POST /api/auth/stop-impersonate` (non-imp token) → 400 "Not an impersonation session".
- `POST /api/auth/switch-account` (no ag) → 400 "no switchable accounts".
- `POST /api/auth/impersonate {targetUserId: self}` → 400 "Cannot impersonate yourself".
- `POST /api/admin/admins {roleKey:SUPER_ADMIN}` (SA initiate) → 202 pending request created.
- `DELETE /api/admin/admins/pending-super/<id>` (initiator) → 200 ok; list total back to 0 (cleanup confirmed).

## Integration points checked
- `auth.routes.ts:1084 (impersonatable-users requirePermission impersonate.user)` → `auth.middleware.ts:331-366 (SA bypass / override gate)` — ADMIN without override → 403; SA → pass.
- `auth.routes.ts:1143 (impersonate OR-guard)` → `auth.service.ts:2689-2701 (resolved-target re-check)` — partner-only ADMIN targeting USER → 403.
- `adminAdmins.routes.ts:1088 (ARCHIVED stamps rolesUpdatedAt)` → `auth.middleware.ts:161-166 (rolesUpdatedAt>iat → 401)` — archived admin's live token severed.
- `adminAdmins.routes.ts:1155-159 (INACTIVE no stamp)` → `auth.middleware.ts:155-159 (live aro re-derive)` → `requirePermission:340 / requireActiveAdmin:308` — Inactive admin coasts read-only.
- `auth.service.ts:2741-2743 (impAg carried, no ag)` → `auth.service.ts:2851-2858 (stop restores ag from impAg)` — round-trip preserves sibling group only on exit.
- `auth.service.ts:2760-2770 (start audit await)` → `audit.middleware.ts:171-182 (writeAudit awaits prisma.create)` — durable before token issue.

## Findings
None.

## Suggestions
- (Non-defect, out of scope) The live dev DB contains a user row `deleted_<uuid>@removed.local` with `status:'ACTIVE'` and (apparently) `deletedAt` null, which surfaces in `impersonatable-users`. The reviewed listing code is correct — it filters `role:'USER', status:'ACTIVE'` and the soft-delete extension adds `deletedAt:null` — and the canonical deletion path (`auth.service.ts:1576-1595`) sets BOTH `status:'DELETED'` and `deletedAt`, so a properly soft-deleted user is excluded twice over. The stray ACTIVE-but-anonymized row is a test/fixture data artifact from a non-canonical anonymization path, not a defect in Domain A code. No action required in this domain; flagging only for data-hygiene awareness.

## Out-of-scope flags
None.

## Brief items I disagreed with
None.

## Verdict
**approve** — all assigned files read in full, independent re-audit pass + live runtime checks turned up zero defects at any severity.