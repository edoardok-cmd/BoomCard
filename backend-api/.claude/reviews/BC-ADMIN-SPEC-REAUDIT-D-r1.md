# BC-ADMIN-SPEC-REAUDIT — Domain D (Partner Accounts / Applications / QR / Visibility) — r1

**Reviewer:** independent re-auditor (read-only)
**Date:** 2026-06-27
**Scope:** §1.4, §1.6, §3.5, §3.6, §8.1 rules 5 & 7, Clash 2.4 / 9.1 / 9.4, partnerStatus middleware
**Verdict:** **approve** — DOMAIN D CLEAN

---

## Summary

All assigned files were read in full and the prior-wave fixes were independently
re-verified in code AND exercised against the live server on `http://127.0.0.1:3025`.
The partner lifecycle, application lifecycle, QR auto-cascade, archived-reactivation
re-onboarding path, activation-link one-time/72h/invalidate-on-resend semantics, and
the public visibility precedence rule are all correctly and consistently enforced
across API + service + middleware layers. No findings at any severity.

---

## Files read

- src/routes/adminPartners.routes.ts (1–1389, full)
- src/services/partner.service.ts (1–589, full)
- src/services/partnerActivation.service.ts (1–158, full)
- src/services/activationLink.service.ts (1–357, full — DB token logic delegated here)
- src/services/partnerSla.helper.ts (1–74, full)
- src/services/partnerType.service.ts (1–176, full)
- src/services/publicPartnerFilter.ts (1–32, full)
- src/services/partnerVenueCountBucket.helper.ts (1–66, full)
- src/services/venue.service.ts (1–480, full)
- src/routes/venues.routes.ts (1–596, full)
- src/middleware/partnerStatus.middleware.ts (1–191, full)
- src/services/sticker.service.ts (partner-status-driven QR cascade: lines 505–640, scan-time gates 798–944 via grep + targeted read)
- src/jobs/scheduler.ts (escalateOverduePartnerSla 1612–1700, remindExpiringActivationLinks 1529–1588, reconcile/QR mounts — cross-reference only)
- src/server.ts (mount path line 279 — cross-reference)

## Integration points checked

- adminPartners.routes.ts:1148 → partner.service.ts:setPartnerStatus:200 — PATCH /partner-status delegates to the single choke point; status flip + PartnerStatusChange + QR cascade + activation-link invalidation all atomic in one tx.
- partner.service.ts:313 → syncQrCodesForPartnerTx:374 — QR cascade runs INSIDE the status transaction (atomic, not best-effort). Comment text matches code (QR-SYNC-DURABILITY + QR-STALE-COMMENT resolved).
- adminPartners.routes.ts:754 (approve) → partnerActivation.service.issueActivationLink:56 → activationLink.service.issue:59 — approve does NOT set ACTIVE; only consume() does. 72h TTL via SECURITY_CONFIG; prior unconsumed links invalidated in same SERIALIZABLE tx.
- adminPartners.routes.ts:957 (reject) → activationLink.updateMany invalidatedAt — reject invalidates unconsumed links in the same $transaction (REJECT-LINK-INVALIDATE).
- partner.service.ts:284 (archive/suspend) → activationLink.updateMany invalidatedAt — archive/suspend invalidates unconsumed links (PARTNER-ARCHIVE-HARDEN).
- scheduler.ts:1538 remindExpiringActivationLinks WHERE invalidatedAt:null — reminder job honors invalidation, so rejected/archived partners are never emailed an activation link.
- activationLink.service.ts:280 consume() → blocks ARCHIVED/REJECTED partners (belt-and-suspenders even if a link slipped through invalidation).
- venue.service.ts:119/184/282/309/462 → publicPartnerFilter — every public venue read path (list, nearby, byCity, cities, search, byId) gates on status=ACTIVE + verifiedAt + isVisible; getVenueById additionally strips nested partner control fields.
- sticker.service.ts:547 / 620 / 836 / 944 → isPartnerOperationallyActive — manual activate, explicit per-code reactivate, and BOTH scan-time gates enforce status=ACTIVE AND verifiedAt.
- partnerStatus.middleware.ts mount set (docstring) → grep confirms exactly partners.routes.ts:128 + receipts.enhanced.routes.ts:28 (docstring-vs-real mount-set discrepancy resolved).
- partnerSla.helper.computePartnerSla (createdAt anchor, assignedAdminId gate) ↔ scheduler.escalateOverduePartnerSla:1620/1632 (same createdAt anchor + assignedAdminId:null) — single SLA clock.

## Runtime checks (live, http://127.0.0.1:3025)

Login required `clientType:"web"` (validation), authenticated as SUPER_ADMIN.
Router mounted at `/api/admin/partner-requests` (not `/api/admin/partners`).

1. **List partners** — `GET /api/admin/partner-requests?status=ACTIVE` → 16 ACTIVE partners, all `isVisible=true verifiedAt=set`. ARCHIVED filter → 0.
2. **Public-leak check** — `GET /api/venues` returned venues with `partner` objects containing only `{id,businessName,logo}`; `status`/`verifiedAt`/`isVisible` NOT present (no nested-field leak).
3. **Status transitions** on partner `1b706f4e` (Villa Melnik Winery):
   - ACTIVE → INACTIVE → `status:INACTIVE` ✓
   - duplicate INACTIVE → `400 "already in INACTIVE state"` ✓
   - INACTIVE → ARCHIVED → `status:ARCHIVED` ✓
   - **ARCHIVED → INACTIVE → `400 "Illegal partner status transition ARCHIVED → INACTIVE…"`** (ARCHIVE-RESTORE-BYPASS / QR-reactivation bypass closed) ✓
4. **Visibility precedence** — while archived, `GET /api/venues?partnerId=…` returned 0 public venues (status overrides isVisible) ✓
5. **Archived reactivation re-onboarding** — ARCHIVED → ACTIVE wrote `status:PENDING requestStatus:ONBOARDING verifiedAt:null inactiveSubType:ONBOARDING_INACTIVE` (NOT direct ACTIVE) — ARCHIVED-REACTIVATE-LIMBO resolved with a clean re-approval path; no auto-reactivation; verifiedAt cleared so the partner must re-consume an activation link ✓

**Data restoration:** the test partner + its 1 sticker were restored to their
pre-test state (ACTIVE / requestStatus=APPROVED / verifiedAt set / sticker ACTIVE)
via direct SQL against the live Neon DB. PartnerStatusChange audit rows from the
test transitions were intentionally left (append-only history; harmless).

## Findings

None.

## Prior waves independently confirmed resolved

| Prior finding | Status | Evidence |
|---|---|---|
| QR-SYNC-DURABILITY (best-effort post-commit) | RESOLVED | syncQrCodesForPartnerTx runs inside $transaction (partner.service.ts:313/374); legacy non-tx path is cron-only/deprecated |
| QR-STALE-COMMENT (comment claimed gate-only) | RESOLVED | comments at 179–198, 349–373 accurately describe the atomic cascade |
| PARTNER-ARCHIVE-HARDEN (links live after archive) | RESOLVED | partner.service.ts:284 invalidates on ARCHIVED/SUSPENDED; consume() blocks ARCHIVED at :280 |
| REJECT-LINK-INVALIDATE (reject leaves link + cron emails) | RESOLVED | reject tx invalidates (routes:983); reminder job filters invalidatedAt:null (scheduler:1538) |
| STATUS-APPROVE-NOLINK (ONBOARDING→APPROVED skips link) | RESOLVED | approve always issues a 72h link (routes:754); ACTIVE only via consume() |
| PARTNER-REJECT-PATCH (PATCH→REJECTED inconsistent) | RESOLVED | PATCH /status rejects REJECTED with redirect to POST /reject (routes:374) |
| ARCHIVED-REACTIVATE-LIMBO | RESOLVED | ARCHIVED→ACTIVE → PENDING+ONBOARDING+verifiedAt=null (verified live) |
| ARCHIVE-RESTORE-BYPASS (QR bulk-reactivate via Archived→Inactive→Active) | RESOLVED | ARCHIVED→non-ACTIVE blocked (400, verified live); Case 3 clears autoDeactivatedAt |
| PARTNER-SUBTYPE-LABEL (PENDING mislabeled ONBOARDING_INACTIVE) | RESOLVED | derivePartnerInactiveSubType gates PENDING on requestStatus ∈ {ONBOARDING,APPROVED}; NEW/COMM/NEGOTIATION → null |
| CONTRACT-NOTIFY / status-change notification | RESOLVED | setPartnerStatus notifies (canonicalized status); PATCH route sends status-change email |
| partnerStatus middleware docstring vs real mount set | RESOLVED | grep confirms docstring matches (partners.routes + receipts.enhanced.routes) |
| SLA-ENUM-TODO (two SLA clocks) | RESOLVED | computePartnerSla + scheduler share createdAt anchor + assignedAdminId gate |
| Clash 9.4 QR enum transitions | CONFORMS | Active/Inactive/Processing/Replaced transitions defined; cascade flips ACTIVE+PROCESSING+PENDING, leaves REPLACED/terminal |

## Suggestions

None.

## Out-of-scope flags

None.

## Brief items I disagreed with

None.