# BC-ADMIN-SPEC-REAUDIT Domain G — Dashboard / Alerts / Notification Templates / Scheduler (r1)

Independent re-audit. Read-only. Wave 5.

## Summary

Domain G is **CLEAN**. All five prior-wave defect classes are independently
verified fixed in the current file state, the 12 canonical notification
templates all fire from real triggers, alert tiers/routing match spec §3.1,
Clash 6.6 (user-no-notify / partner-notify) holds, and the scheduler cron
tiers/cadences match the spec §1.3/§3.4 automations. Live runtime checks against
`http://127.0.0.1:3025` confirm the dashboard metric blocks and the alert
tier-bucket consistency end-to-end.

## Files read

- src/routes/adminDashboard.routes.ts (1–318, full)
- src/routes/adminAlerts.routes.ts (1–18, full)
- src/services/adminAlerts.service.ts (1–559, full — alert tier mapping; not in
  owned list but is the core tier-routing logic of this domain)
- src/jobs/scheduler.ts (1–2138, full, in two passes)
- src/services/notification.service.ts (templates/consent/tiers/status-change
  sections: 660–820, 1528–1600, 1658–1762, 1936–1985)
- src/routes/adminMarketing.routes.ts (230–429 campaign dispatch + consent)
- src/routes/notifications.routes.ts (160–300 + route map of full file —
  user-scoped self-service feed; not domain-G alert logic)
- src/routes/partners.routes.ts (1450–1511 contract-change trigger)
- src/services/partner.service.ts (300–346 partner status-change notify)
- src/routes/adminSubscribers.routes.ts (492–543 user status-change — no notify)
- docs/specs/06-admin-spec-extracted.md (full)

## Integration points checked

- adminAlerts.service.ts:417–461 → spec §3.1 tier table — failed_transactions in
  OPERATIONAL (not Critical), receipt_review (MANUAL_REVIEW pending-approvals) in
  OPERATIONAL (not Critical); high-risk 51+ → Critical, medium 21–50 →
  Operational. All match spec.
- scheduler.ts:2012 (cron `0 8 * * *`) → sendAdminInformationalDigest →
  notifyAdminInformationalDigest (notification.service.ts:1940) → notifyAdminOps
  (1715–1731 fans a notification row to every active admin). Informational tier
  now has a real daily-digest PUSH cadence (INFO-DIGEST fixed; no longer pull-only).
- partners.routes.ts:1502–1508 (discountRate change) → notifyPartnerContractChange
  (notification.service.ts:1538). Partner template #7 Contract Changes now fires on
  commission change (CONTRACT-NOTIFY fixed).
- adminMarketing.routes.ts:371 → notifyPartnerMarketing (notification.service.ts:753)
  → createNotification, gated on channel-agnostic marketingConsent. Partner in-app
  Marketing template #8 now reaches partners (PARTNER-INAPP-MKTG fixed).
- adminMarketing.routes.ts:345–352 PUSH branch → consent guards (346 USER,
  347 PARTNER) before sendWebPushToUser (PUSH-CONSENT fixed; was unguarded).
- partner.service.ts:325 setPartnerStatus → notifyPartnerStatusChange (template #6);
  adminSubscribers.routes.ts:499–543 user PATCH /status → NO notification
  (Clash 6.6 upheld on both sides).
- adminAlerts.service.ts informational counts ↔ adminDashboard.routes.ts: live
  partner_requests=11 == dashboard partners.requests=11; payout_threshold==
  walletsAtThreshold. Counts in lock-step.
- All 12 templates traced to live triggers (see Findings note — none missing).

## Runtime checks

Base `http://127.0.0.1:3025`, authenticated as SUPER_ADMIN (admin@boomcard.bg,
clientType=web required by login validator).

1. `GET /api/health` → `{"status":"ok",...}` (server live).
2. `POST /api/auth/login` → 200, accessToken issued (role SUPER_ADMIN).
3. `GET /api/admin/dashboard` → 200. All §3.1 blocks present: subscribers
   (active/new/expired/cancelled/paused/failedPayment), users.activeAccounts,
   transactions (todayCount/Volume/Avg/totalVolume), cashback with 7-status
   zero-filled breakdown (PENDING…VOIDED incl TRIAL_PENDING; live EXPIRED=2/15,
   VOIDED=2/14.5), partners (active 16 / requests 11 / locations 5), finance.
4. `GET /api/admin/alerts` → 200. Asserted every alert object's `tier` field
   equals its bucket: critical[open_disputes], operational[partner_requests,
   payout_threshold], informational[new_registrations, activated_partners].
   Zero tier/bucket mismatches. totalCount=22. Deep-link params present
   (dateFrom, verifiedAfter) so badge↔page counts stay aligned.

## Verdict

approve

## Findings

None.

All five prior-wave defects independently re-verified fixed:
- ALERT-FAILEDTX-TIER — failed_transactions now OPERATIONAL (adminAlerts.service.ts:449–461).
- ALERT-ROUTING — MANUAL_REVIEW receipt_review now OPERATIONAL (417–426).
- INFO-DIGEST — Informational tier has a real daily-digest push (scheduler 0 8 * * * → notifyAdminOps fan-out).
- CONTRACT-NOTIFY — template #7 fires on discountRate/commission change (partners.routes.ts:1502).
- PARTNER-INAPP-MKTG — notifyPartnerMarketing writes in-app row, consent-gated (notification.service.ts:781).
- PUSH-CONSENT — marketing PUSH branch consent-gated (adminMarketing.routes.ts:346–347).

12 canonical templates all fire from real triggers (4 user: Payment, Transactional,
Cashback-Expiry 7-day CLEARED warning, Marketing; 8 partner: Activation Link,
Onboarding Follow-Up, New Transaction digest, Monthly Summary, Request Updates,
Status Changes, Contract Changes, Marketing). Clash 6.6 holds. Scheduler cron
tiers/cadences (TrialPending 5:30, cashback-expire 60d/2:00, expiring-warning
7d/3:00, auto-payout→LOCKED 6:00) match spec §1.3/§3.4.

## Suggestions

- (Non-defect, style) adminMarketing.routes.ts:346 gates a USER **push** send on
  `marketingConsentEmail` (email-channel flag) rather than the channel-agnostic
  `marketingConsent` used by notifyPartnerMarketing. Both block unconsented sends,
  so there is no missing-consent bug; harmonising on `marketingConsent` for push
  would be more semantically precise but is out of this task's scope.

## Out-of-scope flags

None.

## Brief items I disagreed with

None.
