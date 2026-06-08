# BoomCard Partner Audit — Follow-ups (BC-PARTNER-CODE-AUDIT)

Created 2026-06-04 at the close of BC-PARTNER-CODE-AUDIT. The audit itself is
complete (both audit loops clean). These are the three items flagged as
"needs attention" that are **out of the partner-audit scope** or require
operator/product action.

---

## 1. Test-data cleanup (shared Neon `boomcard` DB) — HIGH priority, do first

The Step-4 runtime audit created throwaway accounts/tickets on the **shared**
production-ish Neon DB. Partner self-delete is intentionally blocked, so these
need an admin/DBA hard-delete. All throwaway accounts use the `bcaudit` email
prefix on `@example.test` (a few use `@completely-new-domain-xyz.bg`).

**Recommended cleanup (review on a staging copy first):**

```sql
-- 1a. Throwaway User accounts (cascade to Partner/Receipt/Card/etc. via FK).
--     Verify the FK cascade rules first; if not ON DELETE CASCADE, delete
--     children (Partner, Receipt, HelpTicket, ReceiptAnalytics, RefreshToken,
--     LoginHistory, PartnerStatusChange) before the User row.
DELETE FROM "User"
WHERE email LIKE 'bcaudit+%@example.test'
   OR email LIKE 'bcaudit-%@example.test'
   OR email LIKE 'bcaudit+%@completely-new-domain-xyz.bg';

-- 1b. Audit HelpTickets created on REAL seed partners (NOT caught by 1a because
--     they belong to seed accounts winedine@/grandhotel@). Delete replies first.
--     Known ids from the audit (verify before deleting):
--       8ab0b87c-2d12-4034-a31d-8616656b4ee7  (winedine, '[bcaudit] test ticket r11h')
--       baae3abb-ccd5-45f1-bca1-b6c8d3aa583c  (winedine, 'Account closure request')
--       ac5b9357-2eab-480f-814d-3dfc596fbef4  (grandhotel)
--       974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e  (grandhotel, 'Account closure request')
--       1daf2100-c7c1-4f63-a824-89a83086aba6  ('Account closure request audit r7')
--    (Plus any tickets owned by the bcaudit accounts above — removed by 1a's cascade.)
DELETE FROM "TicketReply" WHERE "ticketId" IN (
  '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
  'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
  '1daf2100-c7c1-4f63-a824-89a83086aba6');
DELETE FROM "HelpTicket" WHERE id IN (
  '8ab0b87c-2d12-4034-a31d-8616656b4ee7','baae3abb-ccd5-45f1-bca1-b6c8d3aa583c',
  'ac5b9357-2eab-480f-814d-3dfc596fbef4','974d86a9-dc8b-4f7e-9d4a-bb17af3ca12e',
  '1daf2100-c7c1-4f63-a824-89a83086aba6');
```

Also: a couple of reused seed/test partners had their `passwordHash` reset to
throwaway values during auth-flow testing (`bcaudit+plsac-task-…`,
`bcaudit+partner-r9a@…`, `bcaudit+r5activate@…`) — **rotate/reset those
credentials** if the accounts are kept. `bcaudit+plsac-task-…` may have a
harmless `pendingChanges = '{}'` blob; clear if desired.

---

## 2. Admin-route pagination sweep — MEDIUM priority

The unvalidated-pagination class (`parseInt(req.query.limit)` → NaN/negative →
PrismaClientValidationError → HTTP 500, + stack in dev) was killed for all
**partner-scope** list routes via the shared helper
`backend-api/src/utils/pagination.ts` (`parsePagination`). The **admin** routes
still have the raw pattern. Apply the same helper to each list endpoint in:

```
backend-api/src/routes/adminControl.routes.ts
backend-api/src/routes/adminFinance.routes.ts
backend-api/src/routes/adminPayouts.routes.ts
backend-api/src/routes/adminTransactions.routes.ts
backend-api/src/routes/adminSubscriptions.routes.ts
backend-api/src/routes/adminSubscribers.routes.ts
backend-api/src/routes/adminMarketing.routes.ts
backend-api/src/routes/adminMenus.routes.ts
backend-api/src/routes/adminPartners.routes.ts
backend-api/src/routes/adminHelp.routes.ts
backend-api/src/routes/adminAdmins.routes.ts
backend-api/src/routes/adminCashback.routes.ts
backend-api/src/routes/payments.paysera.routes.ts
```

Usage: `const { skip, take, page, limit } = parsePagination(req.query, { defaultLimit: <existing>, maxLimit: 100 })`.
Note a global `PrismaClientValidationError → 400` handler already exists in
`error.middleware.ts` as a safety net, but route-level clamping is the correct fix
(avoids the DB round-trip and gives a 200 with sane defaults).

---

## 3. Venue geolocation at registration / import — MEDIUM priority (product + eng)

Venue geolocation is now a **required field** on the admin venue-create API
(`POST /api/venues`) and offer redemption **fails closed** without it. But the
other venue-creation paths don't collect coordinates, so venues created that way
are non-redeemable until an admin backfills lat/long:

- `partner-dashboard/src/pages/RegisterPartnerPage.tsx` collects an address but no
  coordinates — add a map-picker or address-geocoding step so partner
  self-registration captures lat/long.
- `backend-api/src/routes/partners.routes.ts` partner onboard (`tx.venue.create`,
  ~line 857) accepts `latitude/longitude` as nullable — once the FE supplies them,
  make them required here too.
- `backend-api/src/services/bulkImport.service.ts` (`tx.venue.create`, ~line 981)
  reads lat/long from the sheet; warn/skip rows without valid coordinates.
- **Legacy backfill:** existing venues with NULL lat/long need a one-off geocoding
  backfill (their offers currently fail-closed on redemption by design).

---

*Detailed audit evidence: `.claude/reviews/BC-PARTNER-CODE-AUDIT-impl-r*.md` and
`-audit-r1-task-r*.md` in the Agent X workspace. Migration applied during the
audit: `20260604100000_add_partner_registration_fields`.*
