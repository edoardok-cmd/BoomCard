-- Spec §7.3 / §11.6 — Dispute ↔ HelpTicket FK link
--
-- A Dispute row created from a DISPUTE-type HelpTicket now carries a nullable
-- ticketId so the two queues can cross-link. The FK is SET NULL on delete so
-- archiving a ticket does not cascade-delete open dispute cases.
--
-- IDEMPOTENT: column and constraint creation guarded by IF NOT EXISTS / IF EXISTS.

-- 1. Add the nullable FK column to Dispute
ALTER TABLE "Dispute"
  ADD COLUMN IF NOT EXISTS "ticketId" TEXT;

-- 2. Add the FK constraint
ALTER TABLE "Dispute"
  DROP CONSTRAINT IF EXISTS "Dispute_ticketId_fkey";

ALTER TABLE "Dispute"
  ADD CONSTRAINT "Dispute_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "HelpTicket"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Index for reverse look-up (HelpTicket → its disputes)
CREATE INDEX IF NOT EXISTS "Dispute_ticketId_idx" ON "Dispute"("ticketId");
