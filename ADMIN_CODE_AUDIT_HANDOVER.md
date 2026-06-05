# BC-ADMIN-CODE-AUDIT — Re-audit Handover Note

**Completed:** 2026-06-02  
**Task:** BC-ADMIN-CODE-AUDIT (re-audit.md workflow)  
**Scope:** All BoomCard admin backend routes/services/schema + all 40 admin frontend pages  
**Spec reference:** `/Users/administrator/Documents/BoomCard/docs/specs/06-admin-spec-extracted.md`  
**Review files:** 40 files in `.claude/reviews/BC-ADMIN-CODE-AUDIT-reaudit-r*.md`

---

## What was audited

- **Backend (fully clean):** 7 admin route files, 5 admin service files, Prisma schema, middleware, scheduler, notification service
- **Frontend (fully clean):** All 40 pages under `partner-dashboard/src/pages/admin/`

---

## Critical issues found and fixed

### Backend fixes
1. `adminCashback.service.ts` — TrialPending entries were manually approvable/voidable by admin (violates spec §1.3)
2. `adminCashback.service.ts` — `lockEntry` had no conditional update guard (race condition with concurrent voids)
3. `cashbackLifecycle.service.ts` — `revertLocked` did not restore `status=COMPLETED` (broke nightly expiry sweep)
4. `cashbackLifecycle.service.ts` — `expireStalePendingCashback` was scheduled (contradicts spec §8.1.2: Pending cashback never expires)
5. `scheduler.ts` — TrialPending void condition only fired on `trialRefundUsed`, not on subscription cancellation within trial window
6. `sticker.service.ts` — Scanning gate only blocked `FAILED_PAYMENT`, missing `EXPIRED` and `CANCELLED-post-period`
7. `adminSubscribers.routes.ts` — PATCH /status accepted `SUSPENDED` (non-spec), missing `INACTIVE`/`ARCHIVED`; no profile edit endpoint; wrong risk thresholds (30/60 → 20/50); ARCHIVED filter returned all records
8. `adminPayouts.routes.ts` — Payout gate excluded `CANCELLED-within-paid-period`; `/fail` did not revert LOCKED cashback; second-failure branch now uses `RISK_HOLD` (not `FAILED`); first-failure sends IBAN-correction notification
9. `adminPartners.routes.ts` — `/visibility` used wrong permission namespace; allowed `isVisible=true` on INACTIVE partners
10. `adminControl.routes.ts` — Risk queue missed `specRiskLevel`-flagged records; thresholds 31→21, 61→51
11. `adminAdmins.routes.ts` — Approve/cancel handlers were non-atomic; no soft-delete audit trail; bootstrap exception for sole SA
12. `notification.service.ts` — Wrong notification type stored for failed payout events
13. Risk thresholds unified to 21/51 across `adminAlerts.service.ts`, `adminControl.routes.ts`, `stickers.routes.ts`, `userRisk.service.ts`
14. `adminAdmins.routes.ts` — Added dispute-case receipt approve/reject endpoints

### Schema fixes (migration file: `20260602000000_bc_admin_code_audit_fixes`)
- Added `TRIAL_PENDING` to `CashbackEntryStatus` enum
- Added `INACTIVE`, `IN_PROCESSING` to `VenueStatus` enum
- Added `CANCELLED` to `TicketStatus` enum
- Added `expiresAt`, `status`, `secondApproverId`, `resolvedAt` to `PendingSuperAdminRequest`
- Added FK relation for `WalletTransaction.voidedByUserId`

### Frontend fixes
1. `AdminSubscribersAllPage`/`DetailPage` — Status calls used `SUSPENDED` → changed to `INACTIVE`; added profile edit modal (name/email/phone/address/IBAN/risk); risk thresholds 30/60 → 20/50
2. `AdminPayoutsPage` — Payout gate now allows `CANCELLED-within-paid-period`; reject/fail modals require reason category
3. `AdminControlSecurityPage` — Risk queue tier thresholds 31/61 → 21/51
4. `AdminTransactionsPage` — Thresholds fixed; added `Voided`/`TrialPending` to cashback lifecycle types
5. `AdminControlRulesPage` — Fixed 30/60 threshold labels to 20/50; `autoApproveThreshold` default 30→20
6. `AdminPartnerLocationsPage` — Added `INACTIVE` and `IN_PROCESSING` to VenueStatus
7. `AdminAdminDetailPage`/`AdminAdminsAllPage` — Added `INACTIVE`/`ARCHIVED`; gated status+role buttons on `isSuperAdmin`
8. `AdminControlDisputesPage` — Now uses dispute-case-scoped receipt endpoints
9. `AdminSettingsThresholdsPage` — Plan key `LIGHT` → `PREMIUM_WEEKLY`
10. `AdminHelpAllPage` — Shared queue accessible to all admins (not just SA); added `CLOSED` status
11. `AdminAdminsAuditPage` — CSV export capped at 5000 rows with truncation warning
12. `AdminMarketingTemplatesPage` — Expanded XSS sanitizer (8 deny-list patterns)
13. `AdminProfileSecurityPage` — Session revoke race condition fixed
14. `AdminPartnerPipelinePage` — "Activate partner" action now only appears in ODOBRENA column; split from advance-stage action
15. `AdminHelpNewPage`/`AdminHelpMinePage` — Added `requestType` field; fixed status enum CLOSED/NEW

---

## Escalated items (require product/DBA decision before schema migration)

See: `.claude/reviews/BC-ADMIN-CODE-AUDIT-schema-escalations.md`

1. **PartnerRequestStatus** — Values use Bulgarian transliterations (`NOVA`, `KOMUNIKACIYA`, etc.) instead of spec-canonical English. Safe fix via Prisma `@map()` — no data migration needed.
2. **PartnerStatus** — `PAUSED` and `SUSPENDED` are separate enum values but spec §1.4 says they should be sub-types of `INACTIVE` stored in a `reason` field. Requires data migration + all visibility filter updates.
3. **RiskBucket enum names** — `LOW_0_30`, `REVIEW_31_60`, `HIGH_61_PLUS` encode deprecated thresholds. Renaming requires coordinated schema + code migration. Note: scoring logic now correctly uses 20/50 breakpoints but enum names are unchanged to avoid breaking changes.

---

## DO NOT trust prior approved reviews without re-reading the code

This audit found the task code had **never been reviewed** against the extracted spec. The `re-audit.md` workflow was used by the task setup, but no prior `approve` verdict exists on disk. All 40+ fixes above were first-time discoveries against the spec — not corrections to a previously-approved baseline.
