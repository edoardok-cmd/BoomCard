# BC-ADMIN-SPEC-REAUDIT-C — Domain C: Cashback State Machine & Risk Management (r1)

Independent re-audit (wave 5) against spec `06-admin-spec-extracted.md` §1.3, §2.1, §2.2, §3.4, §8.1 rules 2 & 6, §7.1 cashback row. Read-only.

## Files read
- `src/routes/adminCashback.routes.ts` (1–546, full)
- `src/services/adminCashback.service.ts` (1–1754, full — read in two passes 1–1284, 1285–1754)
- `src/services/cashbackLifecycle.service.ts` (1–849, full)
- `src/services/userRisk.service.ts` (1–330, full)
- `src/routes/adminSubscribers.routes.ts` — risk-filter + PATCH risk sections (grep + lines 550–730)
- `src/jobs/scheduler.ts` — `resolveTrialPendingCashback()` (898–1018)

## Integration points checked
- adminCashback.routes.ts:497–528 (`/void`) → cashbackLifecycle.service.ts:87–101 `assertVoidReasonCategory` + adminCashback.service.ts:1287–1388 `voidEntry` — canonical-vocabulary validation shared by Pending/Cleared→Voided and the inline Locked→Voided branch; same helper, validated before branching (1297).
- adminCashback.routes.ts:449–462 (`/lock`) → SUPER_ADMIN pre-handler guard → adminCashback.service.ts:1400 `lockEntry` (CLEARED-only state guard + payout-eligibility + IBAN guard). Confirmed SA gate runs before service.
- adminCashback.service.ts:808 / 1153 daysUntilExpiry guard → spec §1.3 terminal states (Expired/Voided/Paid) → null. Pending/TrialPending rows never carry cashbackExpiresAt (recordPendingForRiskReview sets none; backfillCashbackExpiry excludes PENDING/TRIAL_PENDING at 1734–1735), so they also resolve null.
- userRisk.service.ts:58–62 `bucketFor` (0–20/21–50/51+) ≡ adminSubscribers.routes.ts:562–566 `bucketForScore` ≡ adminCashback.service.ts:1662–1666 `deriveRiskLevel` ≡ getAllCashbackEntries:1004–1008 risk band. All four agree on canonical thresholds.
- adminSubscribers.routes.ts:127–129 riskLevel filter (≤20 / 21–50 / >50) — spec-canonical, no 30/60 breakpoints anywhere (grep clean).
- scheduler.ts:973–998 trial-void → cashbackLifecycle.service.ts:71 `TRIAL_VOID_REASON` (SYSTEM_ERROR canonical) + :42 `SYSTEM_ACTOR_ID` — system void persists non-null responsible actor + canonical reason.

## Runtime checks (live, base http://127.0.0.1:3025)
Login: `POST /api/auth/login {email,password,clientType:"web"}` → 200, role SUPER_ADMIN. (clientType is required; plain payload 400s.)

- `GET /api/admin/cashback/entries?limit=3` → 200; Voided row `daysUntilExpiry:null` despite a future `cashbackExpiresAt` (terminal-state guard confirmed live).
- `GET .../entries?status=Voided` → 200, both rows `days=None`. `?status=Expired` → row `days=None`.
- `GET .../entries?riskLevel=High|Medium|Low` → 200 (filter accepted).
- `GET .../stats` → 200, mutually-exclusive per-state sums.
- `GET .../entries/export?status=Voided` → CSV header `id,userId,userEmail,amount,status,riskLevel,clearedAt,expiresAt,voidedReason,createdAt`; row riskLevel populated.
- `GET /api/admin/subscribers?riskLevel=high|medium` → 200.
- Illegal transitions (all correctly rejected):
  - `POST .../void` empty body → 400 "reason is required".
  - `POST .../void {reason:"just because"}` → 400 non-canonical category rejected (lists canonical set).
  - `POST .../void {reason:"FRAUD: test"}` on already-Voided → 400 "VOIDED is terminal (§1.3)".
  - `POST .../approve` on EXPIRED → 400 "not in Pending state" (MARKCLEARED-GUARD: EXPIRED→CLEARED blocked).
  - `POST .../expire` on EXPIRED → 400 terminal.
  - `POST .../pay` on EXPIRED → 400 "Only Locked entries can be marked as paid".
  - `POST .../lock` on EXPIRED (as SA) → passes SA gate, fails state guard 400 (SA gate confirmed reached).

Lock 403-for-non-SA could not be exercised live (only a SUPER_ADMIN seed account available; Prisma 7 driver-adapter blocked an ad-hoc DB query for a non-SA token). The guard is a deterministic pre-handler check (routes.ts:449–453 `if (req.user?.role !== 'SUPER_ADMIN') return 403`) that runs before the handler; the SA path was confirmed to flow past it. Static certainty is high; no behavioural ambiguity remains.

## Prior-wave regressions — all confirmed HOLD
- MARKCLEARED-GUARD: approveEntry accepts only PENDING/mid-approval; EXPIRED→CLEARED rejected (live 400 + markCleared throws on EXPIRED at lifecycle:165).
- EXPIRE-LEGACY-LOCKED: expireEntry rejects new-world LOCKED and legacy-derived LOCKED with 409 (1542–1554); legacy FAILED→409 (1526).
- CB-DAYSEXPIRY-VOID: daysUntilExpiry null for Voided/Paid/Expired (808, 1153) — confirmed live.
- TRIALPENDING-LABEL: deriveCashbackEntryStatus maps TRIAL_PENDING→'TrialPending' (696, 706), not 'Pending'.
- TRIALVOID-VOCAB: single-sourced TRIAL_VOID_REASON (SYSTEM_ERROR) validated at module load (109) and re-asserted in scheduler (906).
- VOID-ACTOR-FALLBACK: markVoided + recordRejectedAsVoided use `actorUserId ?? SYSTEM_ACTOR_ID`; inline Locked→Voided uses adminUserId (always present); scheduler uses SYSTEM_ACTOR_ID. No null responsible actor on any void path.
- RISKSCORE-CAP / RISK-SCORE-CAP: SCORE_CAP=120 (userRisk:23); PATCH riskScore 0–120 (adminSubscribers:681–682).
- USERRISK-GROUPBY: voided count uses groupBy['walletId'] (scalar, valid Prisma) then maps wallet→user and sums (135–170) — per-user 3+ semantics correct.
- RISK-BUCKET: PATCH derives bucket from score, ignores body bucket (688–689); pair never drifts.

## Verdict
approve

## Findings
None.

## Suggestions
- (Non-defect, optional) Live data contains a legacy Voided row with non-canonical `voidedReason:"test void on expired"` (predates F-008 enforcement). Not a code defect — the enforcement is correct going forward — but a one-time normalization backfill of legacy voidedReason values would make historical rows conform to the controlled vocabulary for cleaner reporting/export.

## Out-of-scope flags
None.

## Brief items I disagreed with
None.
