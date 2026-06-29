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
| INV-RDM-009 | XSCOPE | HIGH | Partner cannot submit menu URL — endpoint is admin-only | POST /api/venues/:id/menu/submit | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | none |
| INV-RDM-010 | XSCOPE | HIGH | Partner cannot withdraw menu submission — endpoint is admin-only | POST /api/venues/:id/menu/withdraw | venues.routes.ts authorize('ADMIN','SUPER_ADMIN') | redemption-cross-scope-sweep.test.ts |
| INV-RDM-011 | XSCOPE | HIGH | Dashboard returns only the authenticated user's subscription, wallet balance, and recent scans | GET /api/dashboard/me | dashboard.routes.ts L22 `userId = req.user!.id` | none |
| INV-RDM-012 | INPUT | HIGH | POST /scan rejects missing `billAmount` with 400 | POST /api/stickers/scan | stickers.routes.ts L133 | [SUITE: INPUT] sticker-scan.test.ts (FAILING — auth issue) |
| INV-RDM-013 | INPUT | HIGH | POST /scan rejects zero/negative `billAmount` via validateAmount with 400 | POST /api/stickers/scan | stickers.routes.ts L147–157 | [SUITE: INPUT] sticker-scan.test.ts (FAILING — auth issue) |
| INV-RDM-014 | INPUT | HIGH | POST /scan rejects non-finite `billAmount` with 400 | POST /api/stickers/scan | stickers.routes.ts validateAmount | [SUITE: INPUT] sticker-scan.test.ts (FAILING — auth issue) |
| INV-RDM-015 | INPUT | MEDIUM | POST /scan validates GPS coordinates (lat -90..90, lon -180..180) with 400 | POST /api/stickers/scan | stickers.routes.ts L162–177 validateGPSCoordinates | [SUITE: INPUT] sticker-scan.test.ts (FAILING — auth issue) |
| INV-RDM-016 | INPUT | MEDIUM | POST /session rejects missing `stickerId` with 400 | POST /api/stickers/session | stickers.routes.ts L71 | none |
| INV-RDM-017 | INPUT | MEDIUM | POST /scan requires either `sessionId` or `stickerId` with 400 | POST /api/stickers/scan | stickers.routes.ts L138–143 | none |
| INV-RDM-018 | INPUT | MEDIUM | POST /api/venues/ rejects missing required fields (partnerId, name, address, city) with 400 | POST /api/venues/ | venues.routes.ts L252–258 | none |
| INV-RDM-019 | INPUT | MEDIUM | POST /api/venues/ rejects invalid or missing geolocation with 400 | POST /api/venues/ | venues.routes.ts L260–278 | redemption-input-sweep.test.ts |
| INV-RDM-020 | INPUT | MEDIUM | POST /api/venues/:id/menu/submit rejects empty/missing URL with 400 | POST /api/venues/:id/menu/submit | venues.routes.ts L483 | none |
| INV-RDM-021 | INPUT | LOW | POST /api/venues/:id/menu/submit rejects URL >2048 chars with 400 | POST /api/venues/:id/menu/submit | venues.routes.ts L486 | none |
| INV-RDM-022 | INPUT | MEDIUM | POST /api/venues/:id/menu/submit rejects non-http(s) URL with 400 | POST /api/venues/:id/menu/submit | venues.routes.ts L489–493 | none |
| INV-RDM-023 | INPUT | MEDIUM | POST /api/venues/:id/menu/withdraw returns 400 if menu is not in PENDING state | POST /api/venues/:id/menu/withdraw | venues.routes.ts L561 | none |
| INV-RDM-024 | INPUT | LOW | POST /api/venues/:id/menu enforces 100-image cap per venue | POST /api/venues/:id/menu | venues.routes.ts L419–424 | none |
| INV-RDM-025 | INPUT | MEDIUM | POST /admin/bulk-approve: scanIds must be non-empty string array; max 500 items | POST /api/stickers/admin/bulk-approve | stickers.routes.ts L1142–1147 | none |
| INV-RDM-026 | INPUT | MEDIUM | POST /admin/bulk-reject: scanIds + reason both required; max 500 items | POST /api/stickers/admin/bulk-reject | stickers.routes.ts L1163–1172 | none |
| INV-RDM-027 | INPUT | LOW | GET /admin/pending-review: dateFromHours clamped to range 1..720 | GET /api/stickers/admin/pending-review | stickers.routes.ts L854–860 | none |
| INV-RDM-028 | INPUT | LOW | GET /venue/:venueId/analytics: `days` param clamped 1..365 | GET /api/stickers/venue/:venueId/analytics | stickers.routes.ts L713–714 | none |
| INV-RDM-029 | INPUT | LOW | GET /my-scans: `limit` clamped 0..100 via parsePagination | GET /api/stickers/my-scans | stickers.routes.ts L346 | none |
| INV-RDM-030 | AUTH | CRITICAL | POST /scan requires active subscription (requireActiveSubscription middleware) | POST /api/stickers/scan | stickers.routes.ts L125 | [SUITE: INPUT] sticker-scan.test.ts (FAILING — auth issue) |
| INV-RDM-031 | AUTH | CRITICAL | POST /session requires active subscription (requireActiveSubscription) | POST /api/stickers/session | stickers.routes.ts L66 | none |
| INV-RDM-032 | AUTH | CRITICAL | POST /scan/:scanId/receipt requires active subscription (requireActiveSubscription) | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L233 | none |
| INV-RDM-033 | AUTH | HIGH | GET /my-scans requires authentication — returns 401 without token | GET /api/stickers/my-scans | stickers.routes.ts L342 authenticate | none |
| INV-RDM-034 | AUTH | HIGH | POST /admin/approve/:scanId requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/approve/:scanId | stickers.routes.ts L1045 | none |
| INV-RDM-035 | AUTH | HIGH | POST /admin/reject/:scanId requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/reject/:scanId | stickers.routes.ts L1083 | none |
| INV-RDM-036 | AUTH | HIGH | GET /admin/pending-review requires ADMIN/SUPER_ADMIN role | GET /api/stickers/admin/pending-review | stickers.routes.ts L828 | none |
| INV-RDM-037 | AUTH | HIGH | GET /admin/stats requires ADMIN/SUPER_ADMIN role | GET /api/stickers/admin/stats | stickers.routes.ts L1020 | none |
| INV-RDM-038 | AUTH | HIGH | POST /admin/bulk-approve requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/bulk-approve | stickers.routes.ts L1139 | none |
| INV-RDM-039 | AUTH | HIGH | POST /admin/bulk-reject requires ADMIN/SUPER_ADMIN role | POST /api/stickers/admin/bulk-reject | stickers.routes.ts L1160 | none |
| INV-RDM-040 | AUTH | HIGH | GET /dashboard/me requires authentication — returns 401 without token | GET /api/dashboard/me | dashboard.routes.ts L22 authenticate | none |
| INV-RDM-041 | AUTH | HIGH | QR/location write routes (activate, locations, locations/bulk, generate, generate/bulk, venue config PUT) require stickers.write permission | Multiple | stickers.routes.ts requirePermission('stickers.write') | [SUITE: PERM] stickers-permission-gating.test.ts ✓ |
| INV-RDM-042 | LIFECYCLE | HIGH | Sticker reactivate only succeeds for INACTIVE stickers (not ACTIVE/REPLACED/PENDING) | POST /api/stickers/:stickerId/reactivate | sticker.service.ts reactivateInactiveSticker | none |
| INV-RDM-043 | LIFECYCLE | MEDIUM | Sticker replace creates new PENDING sticker; old sticker is marked REPLACED | PATCH /api/stickers/:stickerId/replace | sticker.service.ts replaceSticker | none |
| INV-RDM-044 | LIFECYCLE | MEDIUM | Sticker processing advances only PENDING→PROCESSING (invalid source state returns 400) | PATCH /api/stickers/:stickerId/processing | sticker.service.ts markStickerProcessing | none |
| INV-RDM-045 | LIFECYCLE | MEDIUM | GET /api/bookings/ returns 501 (feature not implemented) | GET /api/bookings/ | bookings.routes.ts | none |
| INV-RDM-046 | LIFECYCLE | MEDIUM | GET /api/messaging/conversations returns 501 (feature not implemented) | GET /api/messaging/conversations | messaging.routes.ts | none |
| INV-RDM-047 | LIFECYCLE | LOW | GET /api/venues/nearby returns 501 unless ENABLE_NEARBY_VENUES=true | GET /api/venues/nearby | venues.routes.ts L93 | none |
| INV-RDM-048 | LEAK | HIGH | cashbackPercent not included in POST /scan or POST /scan/:scanId/receipt response | POST /api/stickers/scan, POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L208, L319 | none |
| INV-RDM-049 | LEAK | HIGH | fraudScore not included in scan response to clients | POST /api/stickers/scan, POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L208, L319 | none |
| INV-RDM-050 | LEAK | HIGH | fraudReasons not included in scan response to clients | POST /api/stickers/scan, POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L208, L319 | none |
| INV-RDM-051 | LEAK | HIGH | cashbackPercent/premiumBonus/platinumBonus/maxCashbackPerScan/autoApproveThreshold stripped from partner config response | GET /api/stickers/venue/:venueId/config | stickers.routes.ts L765–769 | none |
| INV-RDM-052 | LEAK | HIGH | gpsVerificationEnabled/gpsRadiusMeters/ocrVerificationEnabled stripped from partner config response | GET /api/stickers/venue/:venueId/config | stickers.routes.ts L765–769 | none |
| INV-RDM-053 | LEAK | HIGH | cashbackAmount/cashbackPercent stripped from GET /venue/:venueId/scans response | GET /api/stickers/venue/:venueId/scans | stickers.routes.ts L676 | none |
| INV-RDM-054 | LEAK | HIGH | fraudScore/fraudReasons/ipAddress/userAgent/deviceFingerprint/ocrData stripped from venue scans | GET /api/stickers/venue/:venueId/scans | stickers.routes.ts L676 | none |
| INV-RDM-055 | LEAK | HIGH | pendingMenuUrl/menuRejectionReason/menuReviewedBy/venueStatusNote not returned in public venue GET responses | GET /api/venues/, GET /api/venues/:id, GET /api/venues/search, GET /api/venues/cities | venue.service.ts stripAdminVenueFields L64 | none |
| INV-RDM-056 | LEAK | MEDIUM | partner.status/verifiedAt/isVisible not included in public GET /api/venues/:id response | GET /api/venues/:id | venue.service.ts L267 | none |
| INV-RDM-057 | LEAK | MEDIUM | Dashboard cashbackAmount uses wallet CASHBACK_CREDIT transaction, not @internal StickerScan.cashbackAmount | GET /api/dashboard/me | dashboard.routes.ts L41–45 | none |
| INV-RDM-058 | VIS | HIGH | GET /api/venues/ only returns ACTIVE venues with ACTIVE+verified+visible partners by default | GET /api/venues/ | venue.service.ts L118–121 publicPartnerJoinFilter | none |
| INV-RDM-059 | VIS | HIGH | GET /api/venues/:id returns 404 for non-ACTIVE venueStatus or hidden/unverified partner | GET /api/venues/:id | venue.service.ts L249–255 | none |
| INV-RDM-060 | VIS | MEDIUM | GET /api/venues/search only returns publicly visible venues | GET /api/venues/search | venue.service.ts searchVenues | none |
| INV-RDM-061 | VIS | MEDIUM | GET /api/venues/cities only counts cities with at least one publicly visible venue | GET /api/venues/cities | venue.service.ts getCities L303–321 | none |
| INV-RDM-062 | VIS | LOW | GET /api/stickers/validate/:stickerId is public — no auth required | GET /api/stickers/validate/:stickerId | stickers.routes.ts L370 (no authenticate) | none |
| INV-RDM-063 | FRAUD | HIGH | Duplicate receipt image (SHA-256 match) detection rejects repeat submissions | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L260–287, sticker.service.ts findDuplicateReceipt | none |
| INV-RDM-064 | FRAUD | HIGH | Live-photo EXIF gate rejects receipt images taken before the session start time | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L246–255 checkLivePhoto | none |
| INV-RDM-065 | FRAUD | MEDIUM | OCR `confidence` field is stripped from client-supplied ocrData (server-side is authoritative) | POST /api/stickers/scan/:scanId/receipt | stickers.routes.ts L301–305 | none |

---

## Summary

| Class | Total | Suite-covered | Untested |
|---|---|---|---|
| XSCOPE | 11 | 1 (partial) | 10 |
| INPUT | 18 | 4 (FAILING) | 14 |
| AUTH | 11 | 7 (stickers.write ✓) | 4 |
| LIFECYCLE | 7 | 0 | 7 |
| LEAK | 10 | 0 | 10 |
| VIS | 5 | 0 | 5 |
| FRAUD | 3 | 0 | 3 |
| **Total** | **65** | **~8** | **~57** |

Note: Suite-covered invariants for INPUT/XSCOPE are marked as existing but FAILING due to test infrastructure (auth setup) issues.
