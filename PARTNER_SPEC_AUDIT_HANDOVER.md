# BC-PARTNER-SPEC-AUDIT — Re-audit Handover (2026-06-06)

Comprehensive re-audit of the Partner Portal (backend + `partner-dashboard`) vs
`docs/specs/07-partner-spec-extracted.md` (all 14 sections). User-initiated;
reason on record: broad independent recheck.

## Outcome
Prior `approve` **invalidated**. Two independent round-2 reviewers (frontend +
backend), correctly scoped to the real partner surface, confirmed genuine
non-conformance. Findings triaged into two tracked tasks.

## Important scoping correction (why round 1 looked disputed)
- The partner portal menu lives in `partner-dashboard/src/components/layout/Header/Header.tsx`.
  Branch logic: `role==='admin'` → admin nav (1457–1478); **`role==='partner'` →
  partner menu (1479–1562)**; `else` → consumer menu (1564–1704).
- The partner menu (1479–1562) contains: Профил, Менюта на обектите, QR кодове,
  Анализи, Настройки. It genuinely **lacks Табло, Транзакции, Финанси, Помощ**.
- The Табло/Кешбек/Помощ entries that appear "present" are in the **consumer**
  menu (1564+), not the partner branch. Anyone auditing this must confirm which
  ternary branch they are reading before concluding the menu is conformant.

## Category A — confirmed backend defects → FIXED & AUDITED CLEAN
Task **BC-PARTNER-SPEC-FIX-A** (complete; impl-r2 + task-r1 both `approve`,
runtime-verified on :3025):
- **HIGH §4.3/§11.3** — raw QR token (`stickerId`/`qrCode`) leaked by
  `GET /api/stickers/venue/:venueId`. Fixed via allowlist `select` in
  `sticker.service.ts:getStickersByVenue` (parity with `/me/stickers`).
- **HIGH §2.4** — self-registered partner applications had `requestStatus=null`
  and were skipped by the 24h SLA scheduler. Fixed: `auth.service.ts:400` sets
  `requestStatus = NEW`.
- **MED §8a** — `POST`/`DELETE /api/venues/:id/menu` allowed PARTNER. Fixed:
  now ADMIN/SUPER_ADMIN only (parity with `/menu/submit`).
- **MED §9.1 #5** — in-app "Request Updates" notification never fired. Fixed:
  `notifyPartnerRequestUpdate` wired into `adminHelp.routes.ts` PATCH `/:id`
  (~607) and reject (~774) handlers, PARTNER-only, distinct from email.
- Open follow-up (DB-owned, NOT done): pre-existing `requestStatus=null` partner
  rows remain invisible to the scheduler — needs a one-off backfill.

## Category B — genuine UNBUILT spec scope → tracked feature task
Task **BC-PARTNER-PORTAL-SCOPE-B** (todo; depends on FIX-A). Re-audit confirmed
these are not implemented (not a label remap):
- **§5.2** partner menu missing Табло/Транзакции/Финанси/Помощ entries (routes
  for Табло `/dashboard` and partner Help exist but are unlinked from the partner nav).
- **§6** partner Transactions view absent — `/cashback` → `CashbackPage`
  re-exports the **consumer** `ReceiptsPage` (incl. a prohibited delete action
  at `ReceiptsPage.tsx:437`); none of the §6 columns/filters; `/partners/me/transactions` 404.
- **§7** Финанси module entirely absent — no page, no menu, no API (monthly
  reports, payment history, liability, export, BGN→EUR dual-currency all missing).
- **§5.3** dashboard KPIs Visits / Expected amounts always render "—" (stats API
  omits the fields); **§5.4** Account manager element not surfaced;
  **§5.5** Моите заявки reachable by deep link only.

## Clean / conformant (verified, both rounds)
Lifecycle state machine + QR auto-deactivate/reactivate cascade incl. ARCHIVED
exception (§1.5/§1.6/§4.2/Clash 2.4); 72h one-time activation link;
cross-tenant isolation (§12.6, 403 at runtime); internal-field stripping
(`cashbackPercent`/`margin*`/risk/raw token) at the partner boundary —
`cashbackAmount` claim from round 1 was **refuted** (only aggregate KPIs exposed,
spec-defensible per §5.3); change-request as only partner modification channel
(§10.7); email threading + office@ dual role (§10.5/§10.6); partnerHelp ticket
isolation + terminal-state guards; §8a offer lockdown.

## Review files
- `.claude/reviews/BC-PARTNER-SPEC-AUDIT-reaudit-r1-*` (round 1, 8 units + SUMMARY)
- `.claude/reviews/BC-PARTNER-SPEC-AUDIT-reaudit-r2-{frontend,backend}.md` (round 2)
- `.claude/reviews/BC-PARTNER-SPEC-FIX-A-{impl-r1,impl-r2,task-r1}.md`
