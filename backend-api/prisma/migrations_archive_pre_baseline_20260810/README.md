# Archived pre-baseline migration history (BC-QA-022, 2026-08-10)

This directory holds the full Prisma migration history that was in force
before the BC-QA-022 squash-baseline (`prisma/migrations/0_init`). It is
kept here **for historical reference only** — it is a sibling of
`prisma/migrations/`, not a subdirectory of it, so `prisma migrate deploy`
/ `prisma migrate status` never scan it.

## Why it was squashed

`prisma migrate deploy` against a brand-new empty `postgres:16` database
failed mid-chain (discovered during BC-UX-E2E-REAUDIT bring-up,
2026-07-22):

1. `ERROR: relation "MarketingList" does not exist` — no migration folder
   in this archive ever contains `CREATE TABLE "MarketingList"`,
   `"MarketingListMember"`, or `CREATE TYPE "MarketingListType"`
   (confirmed by grep across every `migration.sql` here). Those objects
   reached `schema.prisma` and real databases via `prisma db push` /
   hand-applied SQL, never via a tracked migration — there was no
   "reorder migration X before migration Y" fix available, because the
   creating migration never existed.
2. `manual/001_audit_fixes.sql` in this archive documents a
   `SubscriptionPlan`/`CardType` enum rename (`LIGHT` -> `PREMIUM_WEEKLY`)
   that was applied by hand to real databases; `manual/migration.sql` (the
   file Prisma actually executes) is a deliberate no-op, so replaying this
   history top-to-bottom on a fresh database never reaches the
   `PREMIUM_WEEKLY` value that `schema.prisma` declares.

Both are evidence that this history was already non-replayable and
partially fictional relative to what was actually run against real
databases — repairing it in place would have meant guessing at a
retroactive "correct" point to insert a `MarketingList` CREATE that never
actually existed. Squash-baselining (option (b) in the BC-QA-022 task) was
the correct fix, not a shortcut.

## What replaced it

`prisma/migrations/0_init/migration.sql` — generated via
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
and verified to leave zero drift against `prisma/schema.prisma`. See that
file's header comment for full detail and the exact commands to baseline
an existing (staging/production) database via
`prisma migrate resolve --applied 0_init` (already wired up as
`npm run db:migrate:baseline`).
