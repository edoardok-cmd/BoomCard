-- Spec §5.4 — venue status history (Кога и защо е сменян)
-- Idempotent: prior schema changes have been applied via `prisma db push`
-- so the VenueStatus enum already exists in prod. Use IF NOT EXISTS to keep
-- this safe across fresh-clone, db-push, and migrate-deploy environments.

CREATE TABLE IF NOT EXISTS "VenueStatusHistory" (
    "id"          TEXT          NOT NULL,
    "venueId"     TEXT          NOT NULL,
    "fromStatus"  "VenueStatus" NOT NULL,
    "toStatus"    "VenueStatus" NOT NULL,
    "note"        TEXT,
    "changedById" TEXT,
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VenueStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VenueStatusHistory_venueId_idx"           ON "VenueStatusHistory"("venueId");
CREATE INDEX IF NOT EXISTS "VenueStatusHistory_venueId_createdAt_idx" ON "VenueStatusHistory"("venueId", "createdAt");

-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS; guard via DO block.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'VenueStatusHistory_venueId_fkey'
    ) THEN
        ALTER TABLE "VenueStatusHistory"
          ADD CONSTRAINT "VenueStatusHistory_venueId_fkey"
          FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;
