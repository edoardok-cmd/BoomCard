-- §9 Mobile: error ingest log for client-side crash/error reporting.
CREATE TABLE IF NOT EXISTS "mobile_error_logs" (
  "id"         TEXT NOT NULL,
  "platform"   TEXT NOT NULL,
  "appVersion" TEXT,
  "errorType"  TEXT NOT NULL,
  "message"    TEXT NOT NULL,
  "stack"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mobile_error_logs_createdAt_idx" ON "mobile_error_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "mobile_error_logs_platform_idx" ON "mobile_error_logs"("platform");
