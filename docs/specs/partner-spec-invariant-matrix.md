# BoomCard Partner Surface — Invariant Matrix

**Surface:** Partner Portal + all partner-authenticated backend endpoints.
**Spec sources:** `docs/specs/07-partner-spec-extracted.md` (primary), `02-partner-module-final.md`, `BC-PARTNER-PORTAL-SCOPE-B.md`.
**Scope id:** `BC-PARTNER-SPEC-REAUDIT`. **Ledger:** `.claude/reviews/BC-PARTNER-SPEC-REAUDIT-coverage-ledger.md` (harness workspace).

**What this is:** the enumerated, ID'd set of machine-checkable invariants the partner surface must satisfy. One row per rule × binding. The ledger tracks WHETHER each has been independently checked; this matrix says WHAT must hold. Re-audit rounds target `untested`/oldest rows in the ledger.

**Binding endpoints (route introspection target).** Partner-authenticated surface is mounted at:
- `/api/partners/*` (profile, analytics, stickers, transactions, finance, stats, PUT, type-info; plus admin-only approve/reject/onboard/qr-code) — `src/routes/partners.routes.ts`
- `/api/partner/help/*` (tickets CRUD, replies, cancel) — `src/routes/partnerHelp.routes.ts`
- `/api/stickers/venue/:venueId/*` (stickers, scans, analytics, config) — `src/routes/stickers.routes.ts`
- `/api/admin/partner-types/*` (admin-only) — `src/routes/partnerTypes.routes.ts`
- partner activation: `POST /api/auth/partner/activate`, `GET /api/partners/activation/:token/verify`

**Class sweeps (exhaustive, route-introspecting — live in `backend-api/tests/`):**
- `[SUITE: SCOPE]` — `partner-cross-scope-sweep.test.ts` — partner A must never read/modify partner B's resource (FLAGSHIP).
- `[SUITE: INPUT]` — `partner-uuid-500-sweep.test.ts` — no partner `:param` route 500s on malformed/absent id.

(The former `partner-currency-leak-sweep.test.ts` carried TWO invariant classes: the `[SUITE: CUR]` BGN→EUR dual-currency-display check, retired 2026-08-10 (BC-QA-031) along with the feature — see the retired §9 Currency Display section below — and the internal-field-name leak check (margin/cashback/fraud/raw-QR/PII), which is UNRELATED to currency and was extracted intact into `partner-internal-field-leak-sweep.test.ts` as `[SUITE: INTERNAL]`, now cited on the INV-INTERNAL-*/INV-SM-QR-007 rows below.)

A suite-covered row is `verified` by suite while that suite is green. A `review`-tagged row has no exhaustive sweep and must be independently re-checked each round.

---

## 1. Partner Account State Machine (INV-SM-ACCT) — §1.2, §1.3, §1.6, §5.1, §11.2

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-SM-ACCT-001 | Archived/Rejected partner cannot log in (auth denied). | `POST /api/auth/login`; auth.service | runtime probe | review |
| INV-SM-ACCT-002 | Inactive (incl. PAUSED/SUSPENDED/PENDING) partner CAN log in (read-only). | `POST /api/auth/login` | runtime probe | review |
| INV-SM-ACCT-003 | Active partner has full portal access. | all partner GET/PUT | runtime probe | review |
| INV-SM-ACCT-004 | Inactive partner blocked from all writes (POST/PUT/PATCH/DELETE → 403). | `requireActivePartnerForWritesAuthed` (partnerStatus.middleware) | runtime probe | review |
| INV-SM-ACCT-005 | Archived partner blocked from help-write endpoints (requireNonArchivedPartner → 403). | partnerHelp.routes | runtime probe | review |
| INV-SM-ACCT-006 | Partner-facing status is ONLY canonical `Active|Inactive|Archived`; internal sub-states never serialized. | `toCanonicalPartnerStatus`; all partner responses | runtime probe | review |
| INV-SM-ACCT-007 | Status mapping: PAUSED/SUSPENDED/PENDING→Inactive; ARCHIVED/REJECTED→Archived. | `toCanonicalPartnerStatus` | static read + test | review |
| INV-SM-ACCT-008 | Inactive partner retains READ access to transactions/finance/analytics (GET 200). | partner GET routes | runtime probe | review |
| INV-SM-ACCT-009 | Canonical account enum has exactly 3 values; never extended. | schema/helper | static read | review |

## 2. Partner Application State Machine (INV-SM-APP) — §2.2, §2.3, §2.4

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-SM-APP-001 | Public application submit creates a record with status `New`; no login account, no password field. | application intake endpoint | runtime probe | review |
| INV-SM-APP-002 | Submit blocked without Общи условия + Политика за поверителност consent (required). | application intake | runtime probe | review |
| INV-SM-APP-003 | Marketing consent is OPTIONAL on the application form. | application intake | runtime probe | review |
| INV-SM-APP-004 | `Onboarding` status → Partner Account created with Inactive status + read-only profile access. | onboard flow | static read | review |
| INV-SM-APP-005 | `Approved` → activation link generated + sent. | approve flow | static read | review |
| INV-SM-APP-006 | `Rejected` application cannot be reopened in the same record. | reject flow | static read | review |
| INV-SM-APP-007 | A Pending/New application creates NO portal access (no login screen). | auth logic | runtime probe | review |

## 3. Onboarding & Activation Link (INV-ACT) — §2.2, §3.2, §9.3, Clash —

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-ACT-001 | Activation link valid for 72h from generation. | partnerActivation.service | static read + test | review |
| INV-ACT-002 | Activation link is one-time use — invalidated after the partner consumes it. | `POST /api/auth/partner/activate` | runtime probe | review |
| INV-ACT-003 | On resend, all older activation links are invalidated. | activation issue/resend | static read | review |
| INV-ACT-004 | Consuming the activation link transitions the account Inactive(Onboarding)→Active. | activate flow | runtime probe | review |
| INV-ACT-005 | `GET /api/partners/activation/:token/verify` is read-only — does NOT consume the token. | partners.routes:2163 | runtime probe | review |
| INV-ACT-006 | Expired/consumed/invalidated token → clean 4xx (not 500, no stack leak). | activation verify + activate | suite (INPUT)+probe | [SUITE: INPUT] |
| INV-ACT-007 | Portal access granted only after onboarding complete (partner never sees incomplete profile on first login). | activation gate | static read | review |

## 4. QR Code Lifecycle & Cascade (INV-SM-QR) — §1.5, §4, §12 rule 1, Clash 2.4/9.4

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-SM-QR-001 | Partner→Inactive cascades: all partner QR codes auto-deactivate (backend-enforced). | partner status-change service | runtime probe (admin) | review |
| INV-SM-QR-002 | Partner→Archived cascades: all partner QR codes auto-deactivate. | status-change service | runtime probe (admin) | review |
| INV-SM-QR-003 | Active-from-Inactive cascades: all QR codes auto-reactivate (no regen). | status-change service | runtime probe (admin) | review |
| INV-SM-QR-004 | Archived→Active reactivation does NOT auto-reactivate QR; admin reactivates each per-code. | status-change service | static read | review |
| INV-SM-QR-005 | Partner CANNOT generate QR codes (no partner-role endpoint). | route surface | static read | review |
| INV-SM-QR-006 | Partner CANNOT deactivate/reactivate QR codes (no partner-role endpoint). | route surface | static read | review |
| INV-SM-QR-007 | Partner CANNOT see the raw QR token (`qrCode`/`stickerId`) in any response. | me/stickers; stickers/venue | suite (CUR-internal)+probe | [SUITE: INTERNAL] |
| INV-SM-QR-008 | QR status enum is `Active|Inactive|In Processing|Replaced`; partner sees status read-only. | me/stickers | runtime probe | review |
| INV-SM-QR-009 | QR codes cannot be manually activated while partner is Inactive/Archived. | status-change service | static read | review |
| INV-SM-QR-010 | Every QR code is bound to a specific location (not just the partner). | schema (Sticker.venueId/locationId) | static read | review |

## 5. Cross-Partner Data Isolation — FLAGSHIP (INV-SCOPE) — §11.1, §12 rule 6

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-SCOPE-001 | `GET /me/transactions` returns ONLY the caller's venues' scans. | partners.routes:601 | suite | [SUITE: SCOPE] |
| INV-SCOPE-002 | `GET /me/finance` returns ONLY the caller's PartnerCashbackPayment rows. | partners.routes:724 | suite | [SUITE: SCOPE] |
| INV-SCOPE-003 | `GET /me/analytics` aggregates ONLY the caller's venues. | partners.routes:313 | suite | [SUITE: SCOPE] |
| INV-SCOPE-004 | `GET /me/stickers` returns ONLY the caller's venues. | partners.routes:494 | suite | [SUITE: SCOPE] |
| INV-SCOPE-005 | `GET /:id/stats` for a foreign partner id → 403 (not the foreign data). | partners.routes:782 | suite | [SUITE: SCOPE] |
| INV-SCOPE-006 | `PUT /:id` for a foreign partner id → 403. | partners.routes:1165 | suite | [SUITE: SCOPE] |
| INV-SCOPE-007 | `GET /:id/type-info` for a foreign partner id → 403. | partners.routes:1719 | suite | [SUITE: SCOPE] |
| INV-SCOPE-008 | `GET /stickers/venue/:venueId` for a foreign venue → 403. | stickers.routes:637 | suite | [SUITE: SCOPE] |
| INV-SCOPE-009 | `GET /stickers/venue/:venueId/scans` for a foreign venue → 403. | stickers.routes:662 | suite | [SUITE: SCOPE] |
| INV-SCOPE-010 | `GET /stickers/venue/:venueId/analytics` for a foreign venue → 403. | stickers.routes:694 | suite | [SUITE: SCOPE] |
| INV-SCOPE-011 | `GET /stickers/venue/:venueId/config` for a foreign venue → 403. | stickers.routes:721 | suite | [SUITE: SCOPE] |
| INV-SCOPE-012 | `GET /partner/help/tickets` lists ONLY the caller's tickets. | partnerHelp.routes:240 | suite | [SUITE: SCOPE] |
| INV-SCOPE-013 | `GET /partner/help/tickets/:id` for a foreign ticket → 404. | partnerHelp.routes:267 | suite | [SUITE: SCOPE] |
| INV-SCOPE-014 | `POST /partner/help/tickets/:id/reply` on a foreign ticket → 404. | partnerHelp.routes:293 | suite | [SUITE: SCOPE] |
| INV-SCOPE-015 | `GET /partner/help/tickets/:id/replies` for a foreign ticket → 404. | partnerHelp.routes:390 | suite | [SUITE: SCOPE] |
| INV-SCOPE-016 | `POST /partner/help/tickets/:id/cancel` on a foreign ticket → 404. | partnerHelp.routes:417 | suite | [SUITE: SCOPE] |
| INV-SCOPE-017 | NO partner-owned-resource route returns 200 with another partner's data (exhaustive). | all partner :id/:venueId routes | suite | [SUITE: SCOPE] |

## 6. Role / Permission Gating (INV-ROLE) — §5.1, §11.1, §11.4, §12 rule 3

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-ROLE-001 | Partner cannot edit/approve/delete any transaction (no partner mutation endpoint). | route surface | static read | review |
| INV-ROLE-002 | Partner cannot change commission %/`discountRate` via `PUT /:id` (rejected or ignored). | partners.routes:1165 | runtime probe | review |
| INV-ROLE-003 | Partner cannot change QR codes (no partner endpoint). | route surface | static read | review |
| INV-ROLE-004 | Partner cannot directly edit businessName/category/contact/email — `PUT /:id` → 403 PARTNER_USE_CHANGE_REQUEST. | partners.routes:1258 | runtime probe | review |
| INV-ROLE-005 | Partner cannot directly edit/add locations — requires Change Request. | route surface | static read | review |
| INV-ROLE-006 | Partner cannot modify receipt templates / merchant variations. | route surface | static read | review |
| INV-ROLE-007 | Partner self-editable (no change request): description, descriptionBg, amenities, openingHours, notification prefs, marketing consent — and ONLY these. | partners.routes PUT allowlist | runtime probe | review |
| INV-ROLE-008 | `/:id/approve`, `/:id/reject`, `/onboard`, `/:id/qr-code` are admin-only (PARTNER → 403). | partners.routes | suite | [SUITE: SCOPE] |
| INV-ROLE-009 | `/api/admin/partner-types/*` are admin-only (PARTNER → 403). | partnerTypes.routes:19 | suite | [SUITE: SCOPE] |
| INV-ROLE-010 | `POST /tickets/:id/cancel` is PARTNER-only (admin cannot cancel a partner's ticket via this route). | partnerHelp.routes:417 | static read | review |

## 7. Change Request as Exclusive Modification Channel (INV-CR) — §10.7, §12 rules 3/4

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-CR-001 | A partner `PUT /:id` to a critical field stages `pendingChanges`; the live record is NOT mutated immediately. | partners.routes:1291 | runtime probe | review |
| INV-CR-002 | The response shows the change is PENDING review, not already applied. | partners.routes PUT response | runtime probe | review |
| INV-CR-003 | A Change Request creates a record for admin review (help ticket `type=Change`/DATA_CHANGE/LOCATION_CHANGE/CONTRACT_CHANGE). | partnerHelp.routes:78 | runtime probe | review |
| INV-CR-004 | Close-account is a Change Request with 30-day notice — not an immediate action. | partnerHelp/profile | static read | review |
| INV-CR-005 | Admin `/:id/approve` applies ONLY the whitelisted pending fields (description/descriptionBg/amenities/openingHours). | partners.routes:1582 | static read | review |

## 8. Internal-Field Non-Exposure (INV-INTERNAL) — §7.4, §11.3, Clash 5.1/10.6

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-INTERNAL-001 | `marginAmount` never serialized to partner (finance). | me/finance; stats | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-002 | per-scan `cashbackPercent` never serialized to partner. | transactions; analytics; venue config | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-003 | per-scan `cashbackAmount` never serialized to partner (aggregate savings is a separate, opt-in decision — see INV-INTERNAL-010). | transactions | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-004 | `fraudScore`/`fraudReasons`/`specRiskLevel` never serialized to partner. | scans; transactions | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-005 | raw QR token (`qrCode`, `stickerId`) never serialized to partner. | me/stickers; venue stickers | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-006 | customer PII (`ipAddress`/`userAgent`/`deviceFingerprint*`/`ocrData`/`latitude`/`longitude`/`distance`) never serialized to partner. | scans; transactions | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-007 | `paidBy`/`notes` never serialized to partner (finance). | me/finance | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-008 | ticket `priority`/`assignee`/`internalNote`/`source`/`externalEmail` never serialized to partner. | partnerHelp routes | suite | [SUITE: INTERNAL] |
| INV-INTERNAL-009 | venue config internal fields (premiumBonus/platinumBonus/maxCashbackPerScan/autoApprove/autoReject thresholds/gps*/ocr*) never serialized to partner. | stickers/venue/:venueId/config | runtime probe | review |
| INV-INTERNAL-010 | Internal margin %/cashback formula split never reconstructable from any partner finance/dashboard view. | dashboard/finance | runtime probe | review |
| INV-INTERNAL-011 | Internal risk logic / risk level never shown in any transaction view. | transactions; detail | runtime probe | review |

## 9. Currency Display (INV-CUR) — §7.3, Clash 12.1 — RETIRED 2026-08-10, BC-QA-031

The dual-currency (BGN+EUR) display feature has been fully removed now that Bulgaria's BGN→EUR transition window has closed. All monetary amounts are EUR-only (or the pre-feature original scalar), with no `currency_transition_window_open` flag, no `currencyDisplay.ts` module, and no `display`/dual-currency wrapper objects anywhere in the partner surface. The 7 INV-CUR-* rows formerly here and the currency half of `partner-currency-leak-sweep.test.ts` no longer apply and have been removed along with the feature. See `00-admin-clashes-reference.md` §12.1 for the historical record.

## 10. Input-Boundary / Never-500 (INV-INPUT)

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-INPUT-001 | No partner `:param` route returns 500 on a malformed id (clean 400/403/404/422). | all partner :param routes | suite | [SUITE: INPUT] |
| INV-INPUT-002 | No partner `:param` route returns 500 on a well-formed-but-nonexistent id. | all partner :param routes | suite | [SUITE: INPUT] |
| INV-INPUT-003 | Pagination params (`page`/`limit`) out-of-range/non-numeric → clamped/400, never 500. | me/transactions; me/finance; help/tickets | runtime probe | review |
| INV-INPUT-004 | Amount/date filters (`minAmount`/`maxAmount`/`dateFrom`/`dateTo`) malformed → 400/ignored, never 500. | me/transactions | runtime probe | review |

## 11. Marketing Consent (INV-CONSENT) — §5.4, §11.1

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-CONSENT-001 | Partner can toggle marketing consent on/off (self-service). | marketing-consent endpoint | runtime probe | review |
| INV-CONSENT-002 | Toggling marketing consent does NOT affect operational/portal access. | consent endpoint | runtime probe | review |

## 12. Notifications (INV-NOTIF) — §9, Clash 6.1/6.6

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-NOTIF-001 | Partner IS notified on `partner_account_status` change (Active/Inactive/Archived). | status-change service | static read | review |
| INV-NOTIF-002 | Exactly the 8 canonical partner templates exist; no others. | notification service/templates | static read | review |
| INV-NOTIF-003 | Status-change notification fires for the partner (asymmetry: users are NOT notified). | status-change service | static read | review |
| INV-NOTIF-004 | Help/Change request status updates notify the partner. | partnerHelp reply/status | static read | review |

## 13. Help / Request Lifecycle (INV-SM-REQ) — §10.3, §10.4, §5.5

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-SM-REQ-001 | Request status enum is `New|In Progress|Waiting|Closed|Cancelled` (partner-visible). | partnerHelp | static read | review |
| INV-SM-REQ-002 | Partner reply on a WAITING/RESOLVED ticket reopens it to OPEN (stamps reopenedAt). | partnerHelp.routes:348 | runtime probe | review |
| INV-SM-REQ-003 | Partner cannot reply on a terminal ticket (CLOSED/REJECTED/CANCELLED → blocked). | partnerHelp.routes:310 | runtime probe | review |
| INV-SM-REQ-004 | Partner cancel sets status=CANCELLED (own ticket only). | partnerHelp.routes:417 | runtime probe | review |
| INV-SM-REQ-005 | Help Requests have NO SLA (distinct from Applications' 24h/2-day SLA). | partnerHelp | static read | review |
| INV-SM-REQ-006 | Every request has status, history, owner/assignee, full audit trail. | partnerHelp + audit | static read | review |
| INV-SM-REQ-007 | Request type enum is `Support|Dispute|Change|Other` (DATA/LOCATION/CONTRACT map to Change). | partnerHelp.routes:27 | static read | review |
| INV-SM-REQ-008 | A `DISPUTE` ticket auto-creates a linked Dispute record for admin. | partnerHelp.routes:126 | runtime probe | review |
| INV-SM-REQ-009 | Partner sees only messages on their OWN requests (covered by SCOPE-013..016). | partnerHelp | suite | [SUITE: SCOPE] |

## 14. Finance / Invoicing & Reporting Period (INV-FIN) — §7.1, §7.2, §12 rule 8

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-FIN-001 | `me/finance` joins `ReportingPeriod.status` by month (Open→Under Review→Closed→Invoiced mapping). | partners.routes:724 | runtime probe | review |
| INV-FIN-002 | Invoicing is based on approved outturn only; cancelled/voided excluded. | finance aggregation | static read | review |
| INV-FIN-003 | `me/finance` export is the partner's OWN data only (client-side export of on-screen safe fields). | finance/export | static read | review |
| INV-FIN-004 | Dashboard `expectedAmount` = sum of `totalCashbackOwed` for PENDING+OVERDUE for this partner. | stats endpoint | runtime probe | review |
| INV-FIN-005 | Dashboard KPI cards (visits, transactions, turnover, contracted %, expected) sourced from real data, not fabricated. | stats endpoint | runtime probe | review |

## 15. Public Visibility Rule (INV-VIS) — §1.4, §12 rule 2, Clash 9.1

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-VIS-001 | Inactive partner hidden from public `GET /api/partners` regardless of `isVisible`. | partners.routes:134 | runtime probe | review |
| INV-VIS-002 | Archived partner hidden from public list regardless of `isVisible`. | partners.routes:134 | runtime probe | review |
| INV-VIS-003 | `GET /api/partners/:id` for a non-Active/unverified/hidden partner → hidden/404 to non-admin. | partners.routes:875 | runtime probe | review |
| INV-VIS-004 | Public visibility requires status=ACTIVE AND verifiedAt!=null AND isVisible=true. | partners.routes:918 | static read | review |
| INV-VIS-005 | `verifiedAt`/`isVisible` stripped from public partner payloads to non-admins. | partners.routes:938 | runtime probe | review |

## 16. Receipt Scanning Gate (INV-RECEIPT) — §12 rule 7

| ID | Invariant | Binding | Method | Coverage |
|---|---|---|---|---|
| INV-RECEIPT-001 | A QR at an Inactive/Archived partner's location is Inactive and cannot be scanned. | scan/transaction creation | static read | review |
| INV-RECEIPT-002 | Mobile app shows feedback when a user scans an inactive QR. | scan endpoint | static read | review |

---

## Coverage tags

- `[SUITE: SCOPE]` — `partner-cross-scope-sweep.test.ts` (cross-partner isolation, exhaustive over partner-owned-resource routes).
- `[SUITE: INTERNAL]` — `partner-internal-field-leak-sweep.test.ts` (internal-field-name leak — margin/cashback/fraud/raw-QR/PII — exhaustive over partner GETs). Renamed 2026-08-10 (BC-QA-031) from `partner-currency-leak-sweep.test.ts` when the currency half of that file was retired along with the dual-currency feature.
- `[SUITE: INPUT]` — `partner-uuid-500-sweep.test.ts` (no-500 on malformed/absent id, exhaustive over partner :param routes).
- `review` — no exhaustive sweep covers it; an independent re-audit round must re-check it. These are the rows the ledger drives to `verified` by runtime probe / static read each round.

## Notes on suite boundaries

- The `[SUITE: INTERNAL]` sweep asserts an internal-field-name denylist (margin/cashback/fraud/raw-QR/PII keys), because the partner spec's §11.3 internal-field rule is a recurring partner-specific finding class. A field it cannot classify FAILS the sweep (forces classify-or-gate).
- The `[SUITE: SCOPE]` sweep seeds TWO partners (A, B) with their own venues/scans/finance/tickets, authenticates as A, and asserts every partner-owned-resource route rejects B's resource ids (403/404, never 200-with-B-data). It fails on any route that returns B's data OR 500s — and on any newly-added partner `:id`/`:venueId` route not explicitly classified.
- Admin-side cascade/notification/application-state invariants (QR cascade, activation issuance, application transitions, invoicing) are partner-DOMAIN rules enforced on the admin side; they are `review`-tagged and checked by static read + an admin-authenticated probe, since a PARTNER login cannot exercise them directly.
