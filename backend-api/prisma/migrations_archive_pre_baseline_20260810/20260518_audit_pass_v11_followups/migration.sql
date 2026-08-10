-- Spec audit-pass follow-ups — DB-level changes for the 13-fix pass that the
-- original audit missed.
--
-- This migration is IDEMPOTENT: each section is wrapped in a guard so it can
-- be replayed on databases that already had `prisma db push` applied.
--
-- Sections:
--   1. TicketStatus enum — add IN_REVIEW and REJECTED values (spec §11.4).
--      Without these, adminHelp.routes assign throws at runtime on prod.
--   2. WalletTransaction — partial unique index on (stickerScanId, type)
--      WHERE cashbackStatus = 'PENDING'. Stops concurrent insertion paths
--      (scanSticker Path A, Path B, uploadReceipt) from racing duplicates.
--   3. OrphanInboundEmail table — store inbound emails that arrive when no
--      system admin exists, so they can be replayed after admin seeding.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TicketStatus enum: add IN_REVIEW + REJECTED
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres requires ALTER TYPE ADD VALUE outside of any transaction. We use
-- IF NOT EXISTS form (Postgres 12+) so this is safe to replay.

ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. WalletTransaction: partial unique index for PENDING-per-scan
-- ─────────────────────────────────────────────────────────────────────────────
-- Prevents two concurrent recordPendingForRiskReview calls from both passing
-- the application-level findFirst probe and inserting duplicate PENDING rows
-- for the same StickerScan. The probe stays as a fast-path / friendly-return,
-- the index is the safety net.

CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_stickerScanId_pending_unique"
  ON "WalletTransaction" ("stickerScanId", "type")
  WHERE "cashbackStatus" = 'PENDING' AND "stickerScanId" IS NOT NULL;

-- Same protection for receipt-only flows (no stickerScanId, only receiptId).
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_receiptId_pending_unique"
  ON "WalletTransaction" ("receiptId", "type")
  WHERE "cashbackStatus" = 'PENDING' AND "receiptId" IS NOT NULL AND "stickerScanId" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OrphanInboundEmail table
-- ─────────────────────────────────────────────────────────────────────────────
-- Spec §11.1: "every inbound email creates a ticket". When no system admin
-- exists yet (fresh install), the inbound classifier currently drops the
-- email. We persist it here so it can be replayed by a follow-up job.

-- Audit-fix [1b]: use TIMESTAMP(3) (millisecond precision) to match what
-- Prisma generates for DateTime fields. Plain TIMESTAMP would cause Prisma's
-- drift checker to flag the columns on every subsequent db push / migrate dev,
-- and could silently truncate sub-second timestamps written by the ORM.
CREATE TABLE IF NOT EXISTS "OrphanInboundEmail" (
  "id"          TEXT PRIMARY KEY,
  "fromEmail"   TEXT NOT NULL,
  "fromName"    TEXT,
  "subject"     TEXT,
  "bodyText"    TEXT,
  "bodyHtml"    TEXT,
  "messageId"   TEXT,
  "rawPayload"  JSONB,
  "reason"      TEXT NOT NULL DEFAULT 'NO_ADMIN',
  "replayedAt"  TIMESTAMP(3),
  "replayedTicketId" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OrphanInboundEmail_createdAt_idx"
  ON "OrphanInboundEmail" ("createdAt");
CREATE INDEX IF NOT EXISTS "OrphanInboundEmail_replayedAt_idx"
  ON "OrphanInboundEmail" ("replayedAt");
