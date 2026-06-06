# BC-PARTNER-PORTAL-SCOPE-B — Build missing Partner Portal spec scope

**Source spec:** `docs/specs/07-partner-spec-extracted.md` §5.2, §5.3, §5.5, §6, §7.
**Origin:** `PARTNER_SPEC_REAUDIT_2026-06-06.md` "Apparent unbuilt spec scope".
**Workflow:** frontend.md (hybrid — also adds partner-scoped backend read endpoints).
**Runtime ports:** API `:3025`, partner dashboard `:3021`.

## User decisions (2026-06-06, explicit opt-in — binding)
1. **Full build** — add partner-scoped backend read endpoints AND build the frontend.
2. **Keep cashback-based money model.** Do NOT swap the dashboard's headline "Cashback Paid"
   KPI for "turnover". Do NOT attempt the §11.3 `/me/analytics` cashbackAmount refactor
   (re-audit defect #3) in this task — it is explicitly deferred by user opt-in.
   The new §7 Финанси module is still built from the real finance table (`PartnerCashbackPayment`),
   which is cashback-owed-centric, with `marginAmount` stripped.

---

## Data model facts (already in DB — verified against prisma/schema.prisma)

`PartnerCashbackPayment` (per partner, per `month`): `month`, `turnoverAmount`, `contractedRate`,
`totalCashbackOwed`, `status` (`PENDING|PAID|OVERDUE`), `paidAt`, `invoiceNumber`.
**`marginAmount` is `@internal` — NEVER serialize to the partner.** `paidBy`/`notes` are internal too.

`StickerScan` (transactions): `id`, `createdAt`, `venueId`+`venue`, `billAmount`, `verifiedAmount`,
`status` (ScanStatus), `transactionId`. **Internal — never serialize:** `cashbackPercent`,
`cashbackAmount`, `fraudScore`, `fraudReasons`, `specRiskLevel`, `ipAddress`, `userAgent`,
`latitude`, `longitude`, `distance`, `deviceFingerprint*`, `ocrData`, `stickerId`, `userId`,
`cardId`, `receiptImageUrl`/`receiptImageHash`.

`ReportingPeriod` (per `month`): `status` (`OPEN|FOR_REVIEW|LOCKED|INVOICED`) → maps to §7.2
cycle Open → Under Review → Closed → Invoiced.

**Allowlist rule (binding):** partner endpoints MUST use explicit Prisma `select` allowlists that
omit internal fields. Do NOT use `@ignore`, do NOT spread, do NOT `select: *`. (Per prior BoomCard
finding: `@ignore` breaks internal reads.)

---

## BACKEND scope (backend-engineer — `backend-api/**` only)

All routes: `authenticate` + role `PARTNER|ADMIN|SUPER_ADMIN`, scoped to the logged-in partner
(`Partner.userId === req.user.id`; admins may not need a partner row — return 403 if no partner
context, mirror existing `/me/analytics` ownership pattern). Inactive partners get read access
(§5.1 read-only); these are all read-only GETs so no extra gating needed beyond existing.

### B1. `GET /api/partners/me/transactions` (§6)
- Query params: `page`, `limit` (default 20, cap 100), `dateFrom`, `dateTo` (ISO), `venueId`,
  `status`, `minAmount`, `maxAmount`. Reuse existing `parsePagination` helper if present.
- Scope: `StickerScan` where `venue.partnerId === <me>` (join venue→partner).
- Response: `{ success, data: [{ id, createdAt, venueId, venueName, amount, status, transactionId }], pagination }`
  where `amount = verifiedAmount ?? billAmount`.
- **STRIP all internal fields** (list above). Use a `select` allowlist. Do NOT return
  `cashbackAmount`/`cashbackPercent`/`fraudScore`/`specRiskLevel`.
- §6 "commission %" / "discount" columns: per-scan cashbackPercent is internal → do NOT expose it.
  If a discount value is cheaply available from the matched offer, you MAY include
  `discountPercent` (offer-level, partner-safe); otherwise omit the field entirely (frontend shows "—").
  Do NOT invent a per-row commission from internal data.

### B2. `GET /api/partners/me/finance` (§7.1)
- Returns partner-scoped `PartnerCashbackPayment` rows, newest `month` first, joined to
  `ReportingPeriod.status` by `month` for the period state.
- Response: `{ success, data: [{ month, turnoverAmount, contractedRate, totalCashbackOwed,
  status, paidAt, invoiceNumber, periodStatus }] }`.
- **STRIP `marginAmount`, `paidBy`, `notes`, `partnerId`.** Use a `select` allowlist.
- This one payload feeds BOTH §7.1 tables on the frontend (Месечни справки + История на плащания);
  no separate payments endpoint needed.

### B3. KPI gaps for §5.3 (extend the existing partner stats source)
- Extend the response of the existing partner stats endpoint (`/api/partners/:id/stats` or
  `/me/analytics` — pick whichever the dashboard already consumes; the dashboard uses
  `usePartnerStats(partnerData.id)`) with:
  - `expectedAmount` = sum of `totalCashbackOwed` for `status IN (PENDING, OVERDUE)` for this partner.
  - `totalVisits` = count of this partner's `StickerScan` rows (all statuses) — the "visits" KPI.
    If you judge a different existing aggregate is the truer "visits" metric, document the choice
    in your handback; do NOT leave it hardcoded "—" if a defensible count exists.
- Do NOT add `marginAmount` or any internal field to stats. Keep the existing cashback "revenue" KPI.

### B-NOTES
- No backend export endpoint required — export is client-side (see F4).
- Add/adjust nothing in admin finance routes.

---

## FRONTEND scope (frontend-engineer — `partner-dashboard/src/**` only)

All monetary amounts in every new/changed view MUST render through
`utils/currencyDisplay.ts` (`formatWithCurrency` / `useCurrencyDisplay`) for §7.3 BGN→EUR.
All new pages need loading / error / empty states. Use existing react-query hook patterns.

### F1. §5.2 Partner menu (Header.tsx, partner branch ~lines 1479-1562)
The partner menu MUST expose these **exact** Bulgarian labels (no variants — §5.2 label rule):
| Label (exact) | Target |
|---|---|
| Табло | `/dashboard` |
| Транзакции | `/transactions` (new, F2) |
| Финанси | `/finance` (new, F3) |
| Профил и партньорство | `/profile` |
| Помощ | `/partners/help` |
| Изход | logout action |
- "Помощ" must be exactly "Помощ" (not "Помощ и комуникация").
- Existing functional partner links (Venue Menus, QR кодове, Анализи, Настройки) MAY remain as
  secondary entries — but the six canonical §5.2 sections above must all be present and correctly
  labelled. Provide both BG and EN strings via the locales files (match existing i18n pattern).

### F2. §6 Партньорски Транзакции page (NEW — `pages/PartnerTransactionsPage.tsx`, route `/transactions`)
- Do NOT reuse the consumer `ReceiptsPage`. This is a distinct partner view.
- Columns (§6): Transaction ID, date, time, location (venue), amount, status. Show commission %/
  discount column only if the backend returns it; otherwise render "—".
- Filters (§6): Period (date range), location (venue), status, amount (min/max). Filters call B1
  with query params (server-side filtering); they must not mutate data.
- Read-only: no edit/approve/delete affordances. No internal risk/cashback fields anywhere.
- Wire `/transactions` into `App.tsx` under the partner `PartnerStatusRoute` (Active + Inactive).

### F3. §7 Финанси module (NEW — `pages/PartnerFinancePage.tsx`, route `/finance`)
- Месечни справки table: month, turnover, contracted commission %, liability (`totalCashbackOwed`),
  paid/unpaid (`status` + `paidAt`), period state (`periodStatus`). View-only.
- История на плащания table: period (month), status, amount, payment date (`paidAt`). View-only.
- Both fed by B2. All money via `formatWithCurrency`.
- Never show internal margin / cashback formula / risk (§7.4) — backend already strips; do not
  reconstruct them client-side.
- Wire `/finance` into `App.tsx` under partner `PartnerStatusRoute` (Active + Inactive).

### F4. Export (§7.1)
- CSV/Excel export of the §7 finance tables, client-side, reusing `utils/csvExport.ts`
  (`csvEscape`, `downloadBlob`). Export only partner-safe fields already on screen. Own data only.

### F5. §5.3 Dashboard KPI gaps (DashboardPage.tsx)
- Wire the previously-"—" KPIs to the new B3 fields: `expectedAmount` → "Очаквани суми",
  `totalVisits` → "Брой посещения".
- Keep the existing cashback-based "Изплатен кешбек" / revenue KPI unchanged (user decision #2).
- If a KPI still has no data source, keep an honest empty state — do not fabricate numbers.

### F6. §5.5 "Моите заявки" menu entry
- Add a "Моите заявки" entry that links to the partner's own Help-request history
  (`PartnerHelpPage` list view, `/partners/help`). Today it is deep-link-only; it must be a real
  menu entry (under Помощ, or as a Помощ sub-item). BG + EN strings.

---

## Acceptance criteria
- Partner menu shows the exact §5.2 canonical labels incl. Табло/Транзакции/Финанси/Помощ; "Помощ"
  label is exact; "Моите заявки" is a reachable menu entry (§5.5).
- `/transactions` renders a partner-specific list (NOT consumer ReceiptsPage) with the §6 columns,
  working Period/location/status/amount filters, read-only, no internal fields.
- `/finance` renders §7.1 monthly reports + payment history from real `PartnerCashbackPayment` data,
  with working CSV export, all amounts BGN→EUR aware, no `marginAmount`/internal fields.
- Dashboard §5.3 "Очаквани суми" and "Брой посещения" show real data (no longer "—").
- Backend B1/B2 responses contain NO internal fields (verified by select allowlist); cross-partner
  access returns 403/404.
- Inactive partners retain read-only access to all new views; Archived blocked (existing gating).
