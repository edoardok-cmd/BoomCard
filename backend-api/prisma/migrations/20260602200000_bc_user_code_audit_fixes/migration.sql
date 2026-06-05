-- Migration: bc_user_code_audit_fixes
-- Applies fixes from BC-USER-CODE-AUDIT round 1.
-- Must be applied AFTER 20260602000000_bc_admin_code_audit_fixes and
-- 20260602100000_bc_partner_code_audit_schema.

-- ============================================================
-- K1 (HIGH): Remove SUSPENDED from UserStatus enum.
-- INACTIVE was added in the prior migration and is the canonical
-- "temporarily paused" state. SUSPENDED is now redundant.
--
-- FULLY APPLIED by prior partial runs:
--   - "UserStatus" already has the correct values (no SUSPENDED).
--   - "UserStatus_old" has been dropped.
--   - User.status column and default are already on "UserStatus".
-- This section is intentionally a no-op.
-- ============================================================
SELECT 1; -- no-op: K1 already applied

-- ============================================================
-- K2 (HIGH): Rename PREMIUM to PREMIUM_MONTHLY in SubscriptionPlan enum.
-- FULLY APPLIED by prior partial runs:
--   - "SubscriptionPlan" has PREMIUM_MONTHLY, "SubscriptionPlan_old" is dropped.
--   - subscriptions.plan, PlanTypeAccess.plan, payout_thresholds.plan all
--     use "SubscriptionPlan" (PREMIUM_MONTHLY).
-- This section is intentionally a no-op.
-- ============================================================
SELECT 2; -- no-op: K2 already applied

-- ============================================================
-- K3 (HIGH): Make User.firstName, User.lastName, User.phone NOT NULL.
-- FULLY APPLIED by prior partial runs: columns are already NOT NULL.
-- This section is intentionally a no-op.
-- ============================================================
SELECT 3; -- no-op: K3 already applied

-- ============================================================
-- K4 (HIGH): Replace @@unique([email, role]) with @@unique([email]).
-- One email per platform regardless of role.
-- Deduplicate existing violations by suffixing the role onto the
-- email of the newer duplicate so the constraint can be created safely.
-- The original (oldest createdAt) record keeps its email unchanged.
-- ============================================================

-- Resolve duplicate emails: for each set of duplicates, keep the earliest
-- created row untouched and suffix the role onto the email of the rest.
UPDATE "User" u
SET email = u.email || '+' || lower(u.role::text) || '+dup'
WHERE u.id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY email ORDER BY "createdAt" ASC) AS rn
    FROM "User"
  ) ranked
  WHERE rn > 1
);

DROP INDEX IF EXISTS "User_email_role_key";
ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");

-- ============================================================
-- K5 (HIGH): Add lockedAt DateTime? to WalletTransaction.
-- Already exists on Wallet (for wallet-level lock). This column
-- records when an individual cashback entry was locked for payout.
-- ============================================================
ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

-- ============================================================
-- K6 (HIGH): Add payoutIbanSnapshot String? to WalletTransaction.
-- Captured at payout initiation so historical payouts remain
-- auditable even if the user changes their IBAN afterwards.
-- ============================================================
ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "payoutIbanSnapshot" TEXT;

-- ============================================================
-- K7 (MEDIUM): Add address String? to User.
-- Street-level address per spec §1.1. Nullable — profile data.
-- ============================================================
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "address" TEXT;

-- ============================================================
-- K8 (MEDIUM): Add stickerScanId String? FK to Receipt.
-- Optional link — set when a receipt upload is triggered from
-- a QR scan session.
-- ============================================================
ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS "stickerScanId" TEXT;

ALTER TABLE "Receipt"
  ADD CONSTRAINT "Receipt_stickerScanId_fkey"
    FOREIGN KEY ("stickerScanId")
    REFERENCES "StickerScan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Receipt_stickerScanId_idx" ON "Receipt"("stickerScanId");

-- ============================================================
-- K9 (MEDIUM): Document ANNULLED and RISK_HOLD values in
-- WalletTransactionStatus. Both are used:
--   ANNULLED  — voided cashback entry (marks final VOIDED state)
--   RISK_HOLD — entry held pending manual risk review
-- No schema change required; comment retained in migration for
-- audit trail.
-- ============================================================
-- ANNULLED: set by cashbackLifecycle.service.ts markVoided() — terminal.
-- RISK_HOLD: set when a wallet entry is placed in risk hold pending
--            admin review. Used by adminCashback.service.ts.

-- ============================================================
-- LoyaltyAccount / LoyaltyTransaction: deferred features (spec §16).
-- No schema change; comment added for audit trail.
-- These models are not in production use.
-- ============================================================
COMMENT ON TABLE "LoyaltyAccount"     IS 'Deferred feature (spec §16). Not in production use.';
COMMENT ON TABLE "LoyaltyTransaction"  IS 'Deferred feature (spec §16). Not in production use.';
