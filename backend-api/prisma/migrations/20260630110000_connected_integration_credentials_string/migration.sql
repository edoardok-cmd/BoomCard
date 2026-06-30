-- Migration: change credentials column from JSONB to TEXT to support AES-256-GCM encrypted blobs.
ALTER TABLE "connected_integrations" ALTER COLUMN "credentials" TYPE TEXT;
