# BoomCard Redemption Surface — Invariant Matrix

**Surface:** `/api/stickers`, `/api/venues`, `/api/bookings`, `/api/messaging`, `/api/dashboard`  
**Routes:** 39 (scope = redemption per app-route-ownership-manifest.json)  
**Created:** Round 1 bootstrap (BC-REDEMPTION-SPEC-REAUDIT)  
**Spec ref:** docs/specs/05-consolidated-unified-spec.md (§1.1–§11.3), stickers.routes.ts, venues.routes.ts

---

## Invariant Classes

| Class | Description |
|---|---|
| XSCOPE | Cross-tenant data isolation — a caller must never read/write another tenant's data |
| INPUT | Input-boundary validation — bad inputs must return 4xx, never reach the DB |
| AUTH | Authentication / authorization gate — unauthenticated or wrong-role callers must be rejected |
| LIFECYCLE | Resource lifecycle state machine — invalid state transitions must be rejected |
| LEAK | Secret/internal field suppression — formula components, fraud signals, admin fields must not reach callers |
| VIS | Visibility filter — public endpoints must hide inactive/hidden partner data |
| FRAUD | Anti-fraud controls — duplicate receipts, live-photo gate, etc. |

---

## Invariants

| Invariant ID | Class | Severity | Description | Route(s) | Spec Ref | Suite Coverage |
|---|---|---|---|---|---|---|
| INV-RDM-001 | XSCOPE | CRITICAL | Partner A cannot read stickers, scans, analytics, or config belonging to a venue owned by Partner B | GET /api/stickers/venue/:venueId, GET /api/stickers/venue/:venueId/scans, GET /api/stickers/venue/:venueId/analytics, GET /api/stickers/venue/:venueId/config | stickers.routes.ts assertPartnerOwnsVenue | [SUITE: XSCOPE] sticker-partner-access-gate.test.ts (partial — scan gate only) |
| INV-RDM-002 | XSCOPE | CRITICAL | A user can only retrieve their own scan history (GET /my-scans filters by `userId`) | GET /api/stickers/my-scans | sticker.service.ts getScansByUser | none |
| INV-RDM-003 | XSCOPE | CRITICAL | Receipt upload only succeeds for scans owned by the authenticated user (`findFirst { where: { id, userId } }`) | POST /api/stickers/scan/:scanId/receipt | sticker.service.ts uploadReceipt L1431 | none |
| INV-RDM-004 | XSCOPE | HIGH | Partner cannot create a venue directly — endpoint is admin-only | POST /api/venues/ | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | none |
| INV-RDM-005 | XSCOPE | HIGH | Partner cannot update a venue directly — endpoint is admin-only | PUT /api/venues/:id | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | none |
| INV-RDM-006 | XSCOPE | HIGH | Partner cannot delete a venue — endpoint is admin-only | DELETE /api/venues/:id | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | none |
| INV-RDM-007 | XSCOPE | HIGH | Partner cannot upload menu images directly — endpoint is admin-only | POST /api/venues/:id/menu | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | none |
| INV-RDM-008 | XSCOPE | HIGH | Partner cannot clear venue menu — endpoint is admin-only | DELETE /api/venues/:id/menu | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | none |
| INV-RDM-009 | XSCOPE | HIGH | Partner CAN submit menu URL for own venue; cross-partner access returns 403 | POST /api/venues/:id/menu/submit | venues.routes.ts authorize('PARTNER','ADMIN','SUPER_ADMIN') + partner-scoped WHERE clause | redemption-cross-scope-sweep.test.ts |
| INV-RDM-010 | XSCOPE | HIGH | Partner CAN withdraw menu submission for own venue; cross-partner access returns 403 | POST /api/venues/:id/menu/withdraw | venues.routes.ts authorize('PARTNER','ADMIN','SUPER_ADMIN') + partner-scoped WHERE clause | redemption-cross-scope-sweep.test.ts |
| INV-RDM-011 | XSCOPE | HIGH | Dashboard returns only the authenticated user's subscription, wallet balance, and recent scans | GET /api/dashboard/me | dashboard.routes.ts L22 `userId = req.user!.id` | none |
| INV-RDM-012 | INPUT | HIGH | POST /scan rejects missing `billAmount` with 400 | POST /api/stickers/scan | stickers.routes.ts L132 | [SUITE: INPUT] sticker-scan.test.ts (passing — BC-REDEMPTION-RDM-012-2) |
| INV-RDM-013 | INPUT | HIGH | POST /scan rejects zero/negative `billAmount` via validateAmount with 400 | POST /api/stickers/scan | stickers.routes.ts L147–157 | [SUITE: INPUT] sticker-scan.test.ts (passing — BC-REDEMPTION-RDM-012-2) |
| INV-RDM-014 | INPUT | HIGH | POST /scan rejects non-finite `billAmount` with 400 | POST /api/stickers/scan | stickers.routes.ts validateAmount | [SUITE: INPUT] sticker-scan.test.ts (passing — BC-REDEMPTION-RDM-012-2) |
| INV-RDM-015 | INPUT | MEDIUM | POST /scan validates GPS coordinates (lat -90..90, lon -180..180) with 400 | POST /api/stickers/scan | stickers.routes.ts L162–177 validateGPSCoordinates | [SUITE: INPUT] sticker-scan.test.ts (passing — BC-REDEMPTION-RDM-012-2) |
| INV-RDM-016 | INPUT | MEDIUM | POST /session rejects missing `stickerId` with 400 | POST /api/stickers/session | stickers.routes.ts L71 | none |
| INV-RDM-017 | INPUT | MEDIUM | POST /scan requires either `sessionId` or `stickerId` with 400 | POST /api/stickers/scan | stickers.routes.ts L138–143 | none |
| INV-RDM-018 | INPUT | MEDIUM | POST /api/venues/ rejects missing required fields (partnerId, name, address, city) with 400 | POST /api/venues/ | venues.routes.ts L252–258 | none |
| INV-RDM-019 | INPUT | MEDIUM | POST /api/venues/ rejects invalid or missing geolocation with 400 | POST /api/venues/ | venues.routes.ts L260–278 | redemption-input-sweep.test.ts |
| INV-RDM-020 | INPUT | MEDIUM | POST /api/venues/:id/menu/submit rejects empty/missing URL with 400 | POST /api/venues/:id/menu/submit | venues.routes.ts L483 | none |
| INV-RDM-021 | INPUT | LOW | POST /api/venues/:id/menu/submit rejects URL >2048 chars with 400 | POST /api/venues/:id/menu/submit | venues.routes.ts L486 | none |
| INV-RDM-022 | INPUT | MEDIUM | POST /api/venues/:id/menu/submit rejects non-http(s) URL with 400 | POST /api/venues/:id/menu/submit | venues.routes.ts L489–493 | none |
| INV-RDM-023 | INPUT | MEDIUM | POST /api/venues/:id/menu/withdraw returns 400 if menu is not in PENDING state | POST /api/venues/:id/menu/withdraw | venues.routes.ts L561 | none |
| INV-RDM-024 | INPUT | LOW | POST /api/venues/:id/menu enforces 100-image cap per venue | POST /api/venues/:id/menu | venues.routes.ts L419–424 | none |
| INV-RDM-025 | INPUT | MEDIUM | POST /admin/bulk-approve: scanIds must be non-empty string array; max 500 items | POST /api/stickers/admin/bulk-approve | stickers.routes.ts L1142–1147 | [SUITE: INPUT] admin-bulk-approve-input.test.ts (passing — BC-REDEMPTION-RDM-025-2) |
| INV-RDM-026 | INPUT | MEDIUM | POST /admin/bulk-reject: scanIds + reason both required; max 500 items | POST /api/stickers/admin/bulk-reject | stickers.routes.ts L1163–1172 | none |
| INV-RDM-027 | INPUT | LOW | GET /admin/pending-review: dateFromHours clamped to range 1..720 | GET /api/stickers/admin/pending-review | stickers.routes.ts L854–860 | none |
| INV-RDM-028 | INPUT | LOW | GET /venue/:venueId/analytics: `days` param clamped 1..365 | GET /api/stickers/venue/:venueId/analytics | stickers.routes.ts L713–714 | none |
| INV-RDM-029 | INPUT | LOW | GET /my-scans: `limit` clamped 1..100 via parsePagination (0 or negative → default 50) | GET /api/stickers/my-scans | stickers.routes.ts L346 | sticker-scan.test.ts lines 582–689 |
| INV-RDM-030 | AUTH | CRITICAL | POST /scan requires active subscription (requireActiveSubscription middleware) | POST /api/stickers/scan | stickers.routes.ts L125 | [SUITE: AUTH] sticker-scan.test.ts (passing — BC-REDEMPTION-RDM-030-3) |
| INV-RDM-031 | AUTH | CRITICAL | POST /session requires active subscription (requireActiveSubscription) | POST /api/stickers/session | stickers.routes.ts L66 | [SUITE: AUTH] sticker-scan.test.ts (INV-RDM-031 test) |
| INV-RDM-032 | AUTH | CRITICAL | POST /scan/:scanId/receipt requires active subscription (requireActiveSubscription) | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L233 | none |
| INV-RDM-033 | AUTH | HIGH | GET /my-scans requires authentication — returns 401 without token | GET /api/stickers/my-scans | stickers.routes.ts L342 authenticate | [SUITE: AUTH] sticker-scan.test.ts (INV-RDM-033 test — BC-REDEMPTION-RDM-033-3) |
| INV-RDM-034 | AUTH | HIGH | POST /admin/approve/:scanId requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/approve/:scanId | stickers.routes.ts L1048 | [SUITE: AUTH] sticker-scan.test.ts (INV-RDM-034 test — BC-REDEMPTION-RDM-034-3) |
| INV-RDM-035 | AUTH | HIGH | POST /admin/reject/:scanId requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/reject/:scanId | stickers.routes.ts L1086 | [SUITE: AUTH] sticker-scan.test.ts (INV-RDM-035 test) |
| INV-RDM-036 | AUTH | HIGH | GET /admin/pending-review requires ADMIN/SUPER_ADMIN role | GET /api/stickers/admin/pending-review | stickers.routes.ts L828 | none |
| INV-RDM-037 | AUTH | HIGH | GET /admin/stats requires ADMIN/SUPER_ADMIN role | GET /api/stickers/admin/stats | stickers.routes.ts L1020 | [SUITE: AUTH] sticker-scan.test.ts (INV-RDM-037 tests — BC-REDEMPTION-RDM-037-3) |
| INV-RDM-038 | AUTH | HIGH | POST /admin/bulk-approve requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/bulk-approve | stickers.routes.ts L1142 | [SUITE: AUTH] sticker-scan.test.ts (INV-RDM-038 tests — BC-REDEMPTION-RDM-038-3) |
| INV-RDM-039 | AUTH | HIGH | POST /admin/bulk-reject requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/bulk-reject | stickers.routes.ts L1160 | none |
| INV-RDM-040 | AUTH | HIGH | GET /dashboard/me requires authentication — returns 401 without token | GET /api/dashboard/me | dashboard.routes.ts L22 authenticate | none |
| INV-RDM-041 | AUTH | HIGH | QR/location write routes (activate, locations, locations/bulk, generate, generate/bulk, venue config PUT) require stickers.write permission | Multiple | stickers.routes.ts requirePermission('stickers.write') | [SUITE: PERM] stickers-permission-gating.test.ts ✓ |
| INV-RDM-042 | LIFECYCLE | HIGH | Sticker reactivate only succeeds for INACTIVE stickers (not ACTIVE/REPLACED/PENDING) | POST /api/stickers/:stickerId/reactivate | sticker.service.ts reactivateInactiveSticker | adminSpecConformM4H2.test.ts |
| INV-RDM-043 | LIFECYCLE | MEDIUM | Sticker replace creates new PENDING sticker; old sticker is marked REPLACED | PATCH /api/stickers/:stickerId/replace | sticker.service.ts replaceSticker | [SUITE: LIFECYCLE] sticker-scan.test.ts INV-RDM-043 ✓ |
| INV-RDM-044 | LIFECYCLE | MEDIUM | Sticker processing advances only PENDING→PROCESSING (invalid source state returns 400) | PATCH /api/stickers/:stickerId/processing | sticker.service.ts markStickerProcessing | rdm044-sticker-processing-lifecycle.test.ts |
| INV-RDM-045 | LIFECYCLE | MEDIUM | GET /api/bookings/ returns 200 with owner-scoped paginated booking list — fully-implemented route; unauthenticated callers receive 401; non-admin callers see only their own bookings with pagination envelope (meta.total/page/limit); ACTIVE admins (aro=false) see all bookings; INACTIVE admins (aro=true) get 403 (see INV-RDM-068) | GET /api/bookings/ | bookings.routes.ts:61–112 (inline aro gate; owner-scoped WHERE for non-admins) | redemption-cross-scope-sweep.test.ts — describe('INV-RDM-045 — GET /api/bookings/ (fully-implemented, active-admin-only list-all)') |
| INV-RDM-046 | LIFECYCLE | MEDIUM | GET /api/messaging/conversations returns 200 with participant-scoped list — caller only sees conversations where they are an active participant | GET /api/messaging/conversations | messaging.routes.ts L86–171 | redemption-cross-scope-sweep.test.ts INV-RDM-046 |
| INV-RDM-047 | LIFECYCLE | LOW | GET /api/venues/nearby returns 200 unconditionally — ENABLE_NEARBY_VENUES feature flag removed, endpoint always active; returns 200 with pagination envelope and coordinates/radius/count in meta for valid lat/lon; returns 400 for non-numeric radius, missing latitude, or non-numeric latitude | GET /api/venues/nearby | venues.routes.ts L93 | redemption-cross-scope-sweep.test.ts — describe('Nearby venues — feature flag lifted') |
| INV-RDM-048 | LEAK | HIGH | cashbackPercent not included in POST /scan or POST /scan/:scanId/receipt response | POST /api/stickers/scan, POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L209, L322 | [SUITE: LEAK] redemption-leak-048.test.ts |
| INV-RDM-049 | LEAK | HIGH | fraudScore not included in scan response to clients | POST /api/stickers/scan, POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L209, L322 | [SUITE: LEAK] redemption-leak-scan-sweep.test.ts |
| INV-RDM-050 | LEAK | HIGH | fraudReasons not included in scan response to clients | POST /api/stickers/scan, POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L209, L322 | [SUITE: LEAK] redemption-leak-050.test.ts |
| INV-RDM-051 | LEAK | HIGH | cashbackPercent/premiumBonus/platinumBonus/maxCashbackPerScan/autoApproveThreshold stripped from partner config response | GET /api/stickers/venue/:venueId/config | stickers.routes.ts L765–769 | [SUITE: LEAK] redemption-leak-051.test.ts |
| INV-RDM-052 | LEAK | HIGH | gpsVerificationEnabled/gpsRadiusMeters/ocrVerificationEnabled stripped from partner config response | GET /api/stickers/venue/:venueId/config | stickers.routes.ts L765–769 | [SUITE: LEAK] redemption-leak-052.test.ts |
| INV-RDM-053 | LEAK | HIGH | cashbackAmount/cashbackPercent stripped from GET /venue/:venueId/scans response | GET /api/stickers/venue/:venueId/scans | stickers.routes.ts L676 | none |
| INV-RDM-054 | LEAK | HIGH | fraudScore/fraudReasons/ipAddress/userAgent/deviceFingerprint/ocrData stripped from venue scans | GET /api/stickers/venue/:venueId/scans | stickers.routes.ts L676 | [SUITE: LEAK] redemption-leak-054.test.ts |
| INV-RDM-055 | LEAK | HIGH | pendingMenuUrl/menuRejectionReason/menuReviewedBy/venueStatusNote not returned in public venue GET responses | GET /api/venues/, GET /api/venues/:id, GET /api/venues/search, GET /api/venues/cities | venue.service.ts stripAdminVenueFields L64 | none |
| INV-RDM-056 | LEAK | MEDIUM | partner.status/verifiedAt/isVisible not included in public GET /api/venues/:id response | GET /api/venues/:id | venue.service.ts L267 | venueService.test.ts (strips partner.status/verifiedAt/isVisible from public response) |
| INV-RDM-057 | LEAK | MEDIUM | Dashboard cashbackAmount reads directly from StickerScan.cashbackAmount (owner-filtered by userId at L28–41) — wallet CASHBACK_CREDIT transactions are not the source; StickerScan.cashbackAmount is the authoritative formula result for the authenticated user's own scans | GET /api/dashboard/me | dashboard.routes.ts L67 (`s.cashbackAmount ?? 0` — comment: authoritative source is StickerScan.cashbackAmount; BC-REDEMPTION-RDM-057-5 complete) | code annotation dashboard.routes.ts L67 + ledger r2 verified |
| INV-RDM-058 | VIS | HIGH | GET /api/venues/ only returns ACTIVE venues with ACTIVE+verified+visible partners by default | GET /api/venues/ | venue.service.ts L118–121 publicPartnerJoinFilter | none |
| INV-RDM-059 | VIS | HIGH | GET /api/venues/:id returns 404 for non-ACTIVE venueStatus or hidden/unverified partner | GET /api/venues/:id | venue.service.ts L249–255 | venueService.test.ts (getVenueById visibility gate, 13 cases) |
| INV-RDM-060 | VIS | MEDIUM | GET /api/venues/search only returns publicly visible venues | GET /api/venues/search | venue.service.ts searchVenues | none |
| INV-RDM-061 | VIS | MEDIUM | GET /api/venues/cities only counts cities with at least one publicly visible venue | GET /api/venues/cities | venue.service.ts getCities L303–321 | venue-cities-visibility-rdm-061.test.ts (7 cases: positive control, INACTIVE venue, SUSPENDED/INACTIVE/unverified/invisible partner, count integrity) |
| INV-RDM-062 | VIS | LOW | GET /api/stickers/validate/:stickerId is public — no auth required | GET /api/stickers/validate/:stickerId | stickers.routes.ts L370 (no authenticate) | none |
| INV-RDM-063 | FRAUD | HIGH | Duplicate receipt image (SHA-256 match) detection rejects repeat submissions | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L260–287, sticker.service.ts findDuplicateReceipt | none |
| INV-RDM-064 | FRAUD | HIGH | Live-photo EXIF gate rejects receipt images taken before the session start time | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L246–255 checkLivePhoto | none |
| INV-RDM-065 | FRAUD | MEDIUM | OCR `confidence` field is stripped from client-supplied ocrData (server-side is authoritative) | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L301–305 | none |
| INV-RDM-066 | AUTH | HIGH | An INACTIVE (read-only / `aro=true`) admin must NOT perform scan mutations — `approve`, `bulk-approve`, `bulk-reject` must carry the same `requireActiveAdmin` (aro) gate as `reject`, so a coasting INACTIVE admin cannot credit cashback or approve/reject scans (spec §1.5 — Inactive admins are read-only) | POST /api/stickers/admin/approve/:scanId, POST /api/stickers/admin/bulk-approve, POST /api/stickers/admin/bulk-reject (cf. POST /api/stickers/admin/reject/:scanId which has the gate) | stickers.routes.ts:1048,1086,1142,1163 (all 4 carry authenticate→requireActiveAdmin→authorize); auth.middleware.ts:155–159 sets aro, :298 requireActiveAdmin enforces | bc-redemption-swpfix-aro-class-sweep.test.ts PASS 4/4 (aro=true→403 on all 4); runtime confirmed (r9) |
| INV-RDM-067 | AUTH | HIGH | An INACTIVE (`aro=true`) admin must NOT perform sticker QR-management write operations — the 9 write routes (POST /locations, POST /locations/bulk, POST /generate/bulk, POST /generate/:locationId, POST /activate/:stickerId, POST /:stickerId/reactivate, PATCH /:stickerId/processing, PATCH /:stickerId/replace, PUT /venue/:venueId/config) must block an aro=true admin with 403 (spec §1.5 — Inactive admins are read-only); gate is enforced emergently via requirePermission('stickers.write')'s write-classifier | all 9 routes listed above | stickers.routes.ts:407,447,481,513,537,563,589,617,801 — requirePermission('stickers.write'); auth.middleware.ts:340–348 write-classifier aro block | bc-redemption-swpfix-aro-class-sweep.test.ts — INV-RDM-067 describe block (9 routes, aro=true→403) |
| INV-RDM-068 | AUTH | HIGH | An INACTIVE (aro=true) admin must NOT perform bookings write or admin-list-all operations — PATCH /:id and DELETE /:id carry requireActiveAdmin so aro=true → 403 before the owner-bypass branch; GET / carries an inline aro gate that blocks the admin-list-all path for inactive admins (spec §1.5 — Inactive admins are read-only) | PATCH /api/bookings/:id, DELETE /api/bookings/:id, GET /api/bookings/ (admin path) | bookings.routes.ts: requireActiveAdmin middleware on PATCH /:id and DELETE /:id; inline aro gate on GET / (L64–71) | bc-redemption-swpfix-aro-class-sweep.test.ts INV-RDM-068 describe block (aro=true → 403 on all 3 paths) |
| INV-RDM-069 | XSCOPE | HIGH | Bookings cross-tenant isolation — user B must not read or mutate user A's booking; GET /:id, PATCH /:id, DELETE /:id all return 403 for non-owner non-admin callers; ACTIVE admin bypass allowed | GET /api/bookings/:id, PATCH /api/bookings/:id, DELETE /api/bookings/:id | bookings.routes.ts: owner check gates GET /:id (L247/L251), PATCH /:id (L334), DELETE /:id (L390) — non-owner, non-admin → 403 | redemption-cross-scope-sweep.test.ts INV-RDM-069 describe block |
| INV-RDM-070 | XSCOPE | MEDIUM | Messaging participant isolation: non-participant gets 403 on all conversation-scoped routes; only message author may PATCH/DELETE their own message; no admin bypass (admin without participant row gets 403) | GET/PATCH/DELETE /api/messaging/conversations/:id, GET/POST /api/messaging/conversations/:id/messages, PATCH/DELETE /api/messaging/messages/:messageId | messaging.routes.ts assertParticipant L25–33, L637/L675 ownership checks | redemption-cross-scope-sweep.test.ts INV-RDM-070 |

---

## Summary

| Class | Total | Suite-covered | Untested |
|---|---|---|---|
| XSCOPE | 13 | 13 (redemption-cross-scope-sweep.test.ts; INV-RDM-069/070 added) | 0 |
| INPUT | 18 | 18 (all verified — ledger r2/r3) | 0 |
| AUTH | 15 | 15 (all verified — ledger r2/r3/r10; INV-RDM-068 added) | 0 |
| LIFECYCLE | 6 | 6 (all verified — ledger r1/r2) | 0 |
| LEAK | 10 | 10 (all verified — ledger r2) | 0 |
| VIS | 5 | 5 (all verified — ledger r2/r6) | 0 |
| FRAUD | 3 | 3 (all verified — ledger r2/r6) | 0 |
| **Total** | **70** | **70** | **0** |

Note: Auth infrastructure issue (PENDING_VERIFICATION status blocking tests) was fixed in BC-REDEMPTION-RDM-012-2. INV-RDM-012..017 now have passing integration tests in sticker-scan.test.ts. INV-RDM-018/019 have passing tests in venue-input-validation.test.ts and redemption-input-sweep.test.ts. INV-RDM-045 corrected from false "501-stub" to fully-implemented owner-scoped list with active-admin-only bypass. INV-RDM-046 corrected from 501-stub to fully-implemented participant-scoped 200 (messaging.routes.ts L86–171). INV-RDM-068 added: bookings aro/§1.5 write + admin-list-all gate (requireActiveAdmin on PATCH/:id, DELETE/:id; inline gate on GET /) — covered by bc-redemption-swpfix-aro-class-sweep.test.ts INV-RDM-068 describe block. INV-RDM-069 added: bookings cross-tenant isolation (user B cannot read/mutate user A's booking) — covered by redemption-cross-scope-sweep.test.ts INV-RDM-069 describe block. INV-RDM-070 added: messaging participant isolation (non-participant 403, no admin bypass, author-only PATCH/DELETE) — covered by redemption-cross-scope-sweep.test.ts INV-RDM-070 describe block.
