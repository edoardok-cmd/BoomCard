#!/usr/bin/env node
/**
 * BC-QA-022 follow-up (2026-08-10): auto-baseline detector, run once at
 * container startup BEFORE `prisma migrate deploy`.
 *
 * WHY THIS EXISTS
 * ----------------
 * `prisma/migrations/0_init` (see that folder's header comment) squash-
 * baselines the entire pre-2026-08-10 migration history into one migration.
 * That is safe for a brand-new empty database, but any EXISTING database
 * (staging/prod) still carries the OLD dated migration rows in its
 * `_prisma_migrations` table and none named `0_init`. Running
 * `prisma migrate deploy` unmodified against such a database makes Prisma
 * try to execute 0_init's `CREATE TYPE` / `CREATE TABLE` statements against
 * objects that already exist, which fails with P3018 (e.g.
 * `type "UserRole" already exists`) and blocks the app from starting.
 *
 * The one-time fix for an existing database is documented in 0_init's
 * header as a manual step (`npm run db:migrate:baseline`, i.e.
 * `prisma migrate resolve --applied 0_init`) but nothing in the deploy
 * pipeline actually ran it before the first post-squash deploy — this
 * script closes that gap by detecting the situation automatically and
 * running the resolve for the operator.
 *
 * WHAT IT DOES (runs before `prisma migrate deploy` in Dockerfile CMD /
 * fly.toml's `app` process command):
 *   1. If `_prisma_migrations` does not exist, or exists but has zero rows:
 *      this is a genuinely fresh database. Do nothing — let
 *      `prisma migrate deploy` apply `0_init` normally.
 *   2. If `_prisma_migrations` has a `0_init` row that is still mid-flight
 *      (no `finished_at`, no `rolled_back_at` — i.e. a previous deploy
 *      attempt crashed partway through applying it): run
 *      `prisma migrate resolve --rolled-back 0_init` first, mirroring the
 *      existing rolled-back idiom already used for two legacy migrations
 *      in this same startup chain. This unblocks a stuck row so the logic
 *      below (or a plain retry) can proceed.
 *   3. If, after step 2, `_prisma_migrations` has ANY row other than
 *      `0_init` (i.e. this is an old, un-baselined history — a
 *      staging/prod database that predates the squash) and still has no
 *      *successfully applied* `0_init` row: run
 *      `prisma migrate resolve --applied 0_init`. This is a metadata-only
 *      operation (documented in 0_init's header) — it does not touch any
 *      application table, so it is safe to run unconditionally once this
 *      condition is detected, and it is idempotent (a second run is a
 *      no-op once 0_init is marked applied).
 *   4. If `0_init` is already recorded as applied (a database that has
 *      already been baselined, or genuinely deployed against once
 *      post-squash), do nothing — this is the steady-state no-op case.
 *   5. Any unexpected error (bad DATABASE_URL, DB unreachable, unexpected
 *      table shape, etc.) is logged loudly with the exact manual recovery
 *      command and the script exits 0 without changing anything, so
 *      `prisma migrate deploy` still runs immediately after and its own
 *      error (if any) surfaces normally rather than the app silently
 *      crash-looping on a swallowed error here. This script never itself
 *      causes the deploy chain to fail — it only helps success cases and
 *      otherwise gets out of the way.
 *
 * Uses the `pg` package directly (already a production dependency of this
 * service — see package.json) rather than shelling out to `psql`, which
 * is not installed in the production image.
 */

const { Client } = require('pg');
const { execFileSync } = require('node:child_process');

const PRISMA_BIN = 'node_modules/.bin/prisma';
const BASELINE_MIGRATION = '0_init';

function runResolve(args) {
  console.log(`[auto-baseline] running: ${PRISMA_BIN} migrate resolve ${args.join(' ')}`);
  execFileSync(PRISMA_BIN, ['migrate', 'resolve', ...args], { stdio: 'inherit' });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('[auto-baseline] DATABASE_URL is not set; skipping (prisma migrate deploy will report its own error).');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    const tableCheck = await client.query(
      `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`
    );
    if (!tableCheck.rows[0].exists) {
      console.log('[auto-baseline] no _prisma_migrations table yet — fresh database, nothing to do.');
      return;
    }

    const rows = (
      await client.query(
        `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`
      )
    ).rows;

    if (rows.length === 0) {
      console.log('[auto-baseline] _prisma_migrations exists but is empty — fresh database, nothing to do.');
      return;
    }

    const baselineRow = rows.find((r) => r.migration_name === BASELINE_MIGRATION);
    const otherRows = rows.filter((r) => r.migration_name !== BASELINE_MIGRATION);

    // Step 2: recover a stuck/failed 0_init row from a previous crashed attempt.
    if (baselineRow && !baselineRow.finished_at && !baselineRow.rolled_back_at) {
      console.warn(
        `[auto-baseline] found a failed/incomplete "${BASELINE_MIGRATION}" row (no finished_at, no rolled_back_at) — ` +
          'resolving it as rolled-back before continuing.'
      );
      try {
        runResolve(['--rolled-back', BASELINE_MIGRATION]);
      } catch (err) {
        console.error(
          `[auto-baseline] failed to auto-recover the stuck "${BASELINE_MIGRATION}" row. ` +
            `Manual fix: run "npx prisma migrate resolve --rolled-back ${BASELINE_MIGRATION}" ` +
            'against this database, then redeploy. Continuing without changes.'
        );
        console.error(err instanceof Error ? err.message : err);
        return;
      }
      // baselineRow is now rolled back; re-treat as "no successfully-applied 0_init row" below.
    }

    const baselineIsApplied = !!(baselineRow && baselineRow.finished_at && !baselineRow.rolled_back_at);

    if (baselineIsApplied) {
      console.log(`[auto-baseline] "${BASELINE_MIGRATION}" is already applied — nothing to do.`);
      return;
    }

    // Step 3: old, un-baselined history (rows exist that are not 0_init) and no
    // successfully-applied 0_init row — this is an existing pre-squash database.
    if (otherRows.length > 0) {
      console.warn(
        `[auto-baseline] detected an un-baselined pre-squash database: ${otherRows.length} ` +
          `migration row(s) present with no successfully-applied "${BASELINE_MIGRATION}" row. ` +
          'Auto-baselining now (metadata-only, does not touch application tables) — ' +
          `running "prisma migrate resolve --applied ${BASELINE_MIGRATION}".`
      );
      try {
        runResolve(['--applied', BASELINE_MIGRATION]);
      } catch (err) {
        console.error(
          `[auto-baseline] auto-baseline FAILED. Manual fix required before this database will accept ` +
            `deploys: run "npx prisma migrate resolve --applied ${BASELINE_MIGRATION}" (or ` +
            '"npm run db:migrate:baseline") against this database, then redeploy. ' +
            'Continuing without changes — the next "prisma migrate deploy" step will likely fail with P3018.'
        );
        console.error(err instanceof Error ? err.message : err);
      }
      return;
    }

    // Only 0_init in the table but it wasn't caught as applied or stuck above
    // (e.g. it was just rolled back in step 2 with no other rows present) —
    // this is a fresh/near-fresh database; let a normal deploy retry it.
    console.log('[auto-baseline] no old-history rows detected — nothing to do, deploying normally.');
  } catch (err) {
    console.error(
      '[auto-baseline] unexpected error while inspecting _prisma_migrations — skipping auto-baseline. ' +
        `If the next "prisma migrate deploy" fails with P3018 ("already exists"), this database likely ` +
        `needs a manual one-time baseline: run "npx prisma migrate resolve --applied ${BASELINE_MIGRATION}" ` +
        '(or "npm run db:migrate:baseline") against it, then redeploy.'
    );
    console.error(err instanceof Error ? err.message : err);
  } finally {
    await client.end().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Defensive — main() already catches everything, but never let this
    // script itself be the reason the deploy chain fails.
    console.error('[auto-baseline] unexpected top-level error, continuing anyway:', err);
    process.exit(0);
  });
