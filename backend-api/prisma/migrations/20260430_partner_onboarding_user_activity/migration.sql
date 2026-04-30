-- Spec §3.2 informational alert needs an explicit "onboarding completed" timestamp;
-- updatedAt flips on any edit so cannot be used. Stamped on the first ODOBRENA
-- transition in adminPartners.routes.ts.
--
-- Deployment note (mirrors the sibling 20260430_subscription_status_expired):
-- this repo currently deploys schema with `prisma db push`, which IGNORES the
-- migrations/ folder entirely (it diffs schema.prisma directly). Both columns
-- below were therefore created on existing DBs via db push, with no row in
-- _prisma_migrations for this directory. The IF NOT EXISTS clauses make the
-- SQL itself idempotent, but on the day we cut over to `prisma migrate deploy`
-- you must first baseline existing databases:
--
--   prisma migrate resolve --applied 20260430_partner_onboarding_user_activity
--
-- Otherwise migrate deploy will succeed (because of IF NOT EXISTS) but the
-- migration history will accumulate spurious "applied just now" rows on each
-- environment, masking real drift later.
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

-- Spec §4.1 "Последна активност" — last meaningful action in the app, not just
-- sign-in. Bumped from auth middleware via userActivity.service.ts (5-minute throttle).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);
