# Partner Portal — Spec Conformance Re-audit (2026-06-06)

**Task:** BC-PARTNER-SPEC-AUDIT (Agent X). User-initiated comprehensive re-audit of partner code vs
`docs/specs/07-partner-spec-extracted.md` (all 14 sections). Disposition chosen by user: **report only,
no code changes.** Task left in **Review**.

> ⚠️ This re-audit **invalidates** the prior "both loops clean 2026-06-04" partner sign-off.
> The earlier audit scoped narrowly and never checked portal information-architecture against §5.2/§6/§7.
> Do not treat BC-PARTNER-CODE-AUDIT's `approve` as covering the items below.

8 independent reviewers, live runtime (`:3025` API, `:3021` dashboard, read-only). Result: **4 HIGH, 7 MEDIUM, 13 LOW.**
Detail: Agent X `.claude/reviews/BC-PARTNER-SPEC-AUDIT-reaudit-r1-*.md` (per-unit) + `-SUMMARY.md`.

## Open defects (genuine — fixable in place)
1. **HIGH (security)** — Raw QR token `stickerId` leaked to partner via `GET /api/stickers/venue/:venueId`
   (`backend-api/src/routes/stickers.routes.ts:583`). Violates §4.3. Sibling `/me/stickers` omits it correctly.
2. **MED (authz)** — `POST`/`DELETE /api/venues/:id/menu` (`venues.routes.ts:360-363,452-455`) still authorize
   `PARTNER`, inconsistent with the §8a lockdown applied to `/menu/submit` `/menu/withdraw`.
3. **MED (contract)** — `cashbackAmount` returned to partner via `/me/analytics` and `/:id/stats` despite schema
   annotation "never serialize to external callers (§11.3)". Reconcile.
4. **MED (SLA)** — Self-registered applications get `requestStatus=null`; scheduler `not:null` filter excludes
   them from the §2.4 24h internal-SLA alert.
5. **MED (notify)** — `notifyPartnerRequestUpdate` (§9.1 in-app template #5) is dead code; admin status changes
   email only, never the in-app bell.

## Apparent unbuilt spec scope (feature work — needs product decision)
- **HIGH** — Partner menu (§5.2) missing **Табло / Транзакции / Финанси / Помощ** (`partner-dashboard` `Header.tsx:1479-1562`).
- **HIGH** — §7 **Финанси** partner module absent (no monthly reports / turnover / commission / liability / BGN→EUR).
- **HIGH** — §6 **Transactions** not partner-facing (`/cashback` re-exports consumer `ReceiptsPage`).
- **MED** — §5.5 "Моите заявки" deep-link only (no menu entry); §5.3 dashboard KPIs Visits/Expected always "—".

## Verified clean
Lifecycle/QR cascade (§1/§4), activation links (72h/one-time/atomic), **authorization & tenant isolation**
(cross-partner all 403/404 at runtime), internal-field stripping (except defects 1 & 3 above), change-request
channel (§10.7), email threading + office@ dual role (§10.5/§10.6). Backend portal self-service unit and the
permissions/data-isolation unit both returned independent `approve`.
</content>
