#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * BC-QA-051 — de-duplicate (phone, role) on "User" so the partial unique index
 * `User_phone_role_key` can be created.
 *
 * ============================================================================
 * THIS IS A DESTRUCTIVE PRODUCTION SCRIPT. READ THIS HEADER BEFORE RUNNING IT.
 * ============================================================================
 *
 * WHAT IT DOES
 * ------------
 * For every (phone, role) group with more than one row, where the phone is not
 * blank, it keeps the OLDEST row (by "createdAt", ties broken by "id") with its
 * original phone and re-phones every other row in the group to a unique
 * placeholder:
 *
 *     phone := 'BCQA051-DUP-' || id
 *
 * It NEVER deletes a row. "User" has 42 inbound foreign keys, including CASCADE
 * to "Partner", "Wallet", "Card" and "LoyaltyAccount" and RESTRICT from
 * "Transaction", "subscriptions" and "Booking"; deleting a duplicate would
 * either destroy linked records or fail outright.
 *
 * It NEVER touches a row whose phone is blank (`btrim(phone) = ''`). In
 * production that is 134 rows and it contains every live ACTIVE partner, all
 * three SUPER_ADMINs, and real end users. The migration that follows creates a
 * PARTIAL unique index that excludes blank phones precisely so those rows never
 * have to be mutated.
 *
 * WHY THE PLACEHOLDER LOOKS LIKE THAT
 * -----------------------------------
 *   * "User"."phone" is NOT NULL, so a placeholder must be a real string —
 *     blanking or nulling is not an option.
 *   * It is NOT phone-shaped and cannot be dialled. Bulgaria publishes no
 *     reserved "fictional number" range (unlike UK +44 7700 900xxx or US
 *     555-01xx), so ANY plausible-looking +359… placeholder would eventually
 *     be a real subscriber's number — and this system sends phone-verification
 *     OTPs to "User"."phone". A non-numeric placeholder makes that
 *     mis-delivery impossible; an attempted send fails loudly instead.
 *   * It cannot collide with another placeholder: the suffix is the row's own
 *     primary key, so uniqueness is guaranteed by construction rather than by
 *     luck (a truncated hash or a counter would only be probably-unique).
 *   * It is greppable and self-identifying: `phone LIKE 'BCQA051-DUP-%'` finds
 *     exactly the rows this script touched, and the task id is in the value, so
 *     six months from now the provenance is obvious from the data alone.
 *   * It is distinguishable from the codebase's pre-existing `unset-<hex>`
 *     placeholder (src/routes/auth.routes.ts, src/services/bulkImport.service.ts),
 *     which means "this account never supplied a phone" — a different fact from
 *     "this account's phone collided and was moved aside by the BC-QA-051 fix".
 *   * It stays INSIDE the partial index's predicate (it is non-blank), so the
 *     re-phoned rows remain covered by the uniqueness rule rather than escaping
 *     into an unenforced bucket.
 *
 * SOFT-DELETED ROWS ARE INCLUDED ON PURPOSE
 * -----------------------------------------
 * The index predicate is `btrim(phone) <> ''` only — it does NOT exclude
 * `"deletedAt" IS NOT NULL`. A dedupe that skipped soft-deleted rows would
 * leave collisions behind and the migration would still fail. In production
 * there is exactly one such group (`+359876107153` / USER) where BOTH rows are
 * soft-deleted, and it is invisible to any "live rows only" query.
 *
 * MODES
 * -----
 *   (default)                 TRIAL. Opens a transaction, writes the
 *                             before-image file, runs the REAL update
 *                             statements, verifies the result, then
 *                             unconditionally ROLLS BACK. The trial code path
 *                             contains no COMMIT statement at all.
 *   --commit --confirm-database <name>
 *                             APPLY FOR REAL. Refuses unless <name> matches the
 *                             database it actually connected to.
 *   --rollback-from <file>    Restore phones from a before-image file. Trial by
 *                             default; add --commit --confirm-database <name>
 *                             to actually write.
 *
 * Other flags:
 *   --out <path>              Where to write the before-image (default:
 *                             ./bc-qa-051-before-image-<db>-<ISO ts>.json)
 *
 * The database is taken from DATABASE_URL. The script prints the host, port,
 * database and user it is about to touch before doing anything, and never
 * prints the password. TLS certificate verification is left ON for any
 * non-local host.
 *
 * RUNBOOK
 * -------
 *   1. export DATABASE_URL=…            (never inline it in a command)
 *   2. node prisma/scripts/bc-qa-051-dedupe-phone-role.js
 *        → read the plan, keep the before-image file it writes
 *   3. node prisma/scripts/bc-qa-051-dedupe-phone-role.js --commit --confirm-database boomcard
 *   4. npx prisma migrate resolve --rolled-back 20260810160000_add_user_phone_role_unique
 *   5. npx prisma migrate deploy
 *   Undo step 3 with:
 *      node prisma/scripts/bc-qa-051-dedupe-phone-role.js \
 *        --rollback-from <before-image.json> --commit --confirm-database boomcard
 *
 * ROLLBACK ORDERING — READ THIS
 * -----------------------------
 * The restore writes the ORIGINAL duplicate phone numbers back, so it is
 * incompatible with the very index step 5 creates. If step 5 has already run,
 * you must `DROP INDEX "User_phone_role_key";` before rolling back. Attempting
 * it with the index in place is SAFE but useless: the transaction aborts on
 * "duplicate key value violates unique constraint \"User_phone_role_key\"" and
 * nothing is written. The script warns about this before it tries.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const PLACEHOLDER_PREFIX = 'BCQA051-DUP-';

// ─── argument parsing ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    commit: false,
    confirmDatabase: null,
    rollbackFrom: null,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--confirm-database') args.confirmDatabase = argv[++i];
    else if (a === '--rollback-from') args.rollbackFrom = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.commit && !args.confirmDatabase) {
    throw new Error(
      '--commit requires --confirm-database <name>. Pass the exact database name you ' +
        'intend to modify; the script aborts if it does not match the database it connected to.',
    );
  }
  return args;
}

// ─── connection ─────────────────────────────────────────────────────────────

function describeTarget(connectionString) {
  const u = new URL(connectionString);
  return {
    host: u.hostname,
    port: u.port || '5432',
    database: decodeURIComponent((u.pathname || '/').replace(/^\//, '')),
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    isLocal: ['localhost', '127.0.0.1', '::1'].includes(u.hostname),
  };
}

function makeClient(connectionString, target) {
  // TLS: verify the server certificate for anything that is not a loopback
  // address. `rejectUnauthorized: false` is deliberately NOT used anywhere in
  // this script — a production dedupe must not accept an unverified endpoint.
  //
  // The connection parameters are passed DISCRETELY rather than as
  // `{ connectionString, ssl }`. pg's ConnectionParameters re-parses
  // `connectionString` and lets the parsed result override sibling options, so
  // an explicit `ssl` passed alongside a connection string is silently
  // discarded — observed: `client.connectionParameters.ssl` came back as `{}`
  // (pg-connection-string's mapping of `sslmode=require`) instead of the
  // `{ rejectUnauthorized: true }` this function asked for. `{}` happens to
  // leave Node's default verification on, but relying on that is relying on a
  // library default rather than on this file, so the options are made
  // authoritative here instead.
  const client = new Client({
    host: target.host,
    port: Number(target.port),
    user: target.user,
    password: target.password,
    database: target.database,
    ssl: target.isLocal ? false : { rejectUnauthorized: true },
  });

  // Fail closed: never let a non-local connection proceed unverified.
  const ssl = client.connectionParameters.ssl;
  if (!target.isLocal && (ssl === false || ssl == null || ssl.rejectUnauthorized === false)) {
    throw new Error(
      'refusing to connect: TLS certificate verification is not enabled for a non-local host ' +
        `(resolved ssl option: ${JSON.stringify(ssl)})`,
    );
  }
  return client;
}

// ─── the work ───────────────────────────────────────────────────────────────

// Rows that will be re-phoned: every member of a non-blank colliding
// (phone, role) group EXCEPT the oldest. Soft-deleted rows are included; see
// the header. Ordering is (createdAt ASC, id ASC) so the result is total and
// deterministic even when two rows share a createdAt.
//
// TIMESTAMPS ARE READ AS TEXT ON PURPOSE. "createdAt"/"updatedAt"/"deletedAt"
// are `timestamp WITHOUT time zone`. node-postgres parses those into a JS Date
// interpreted in the PROCESS's local zone, and JSON.stringify then writes them
// back out in UTC — so a before-image taken on a machine at UTC+3 and replayed
// would silently shift every timestamp by three hours. Caught by diffing a real
// restore against the real pre-state during BC-QA-051 verification. Casting to
// text keeps the exact stored wall-clock value end to end; the restore casts it
// back with an explicit ::timestamp.
const SELECT_TARGETS = `
  WITH ranked AS (
    SELECT u.id,
           u.phone,
           u.role,
           u.email,
           u.status,
           u."createdAt"::text AS created_at,
           u."updatedAt"::text AS updated_at,
           u."deletedAt"::text AS deleted_at,
           row_number() OVER (
             PARTITION BY u.phone, u.role
             ORDER BY u."createdAt" ASC, u.id ASC
           ) AS rn,
           count(*) OVER (PARTITION BY u.phone, u.role) AS group_size
    FROM "User" u
    WHERE btrim(u.phone) <> ''
  )
  SELECT id, phone, role, email, status, created_at, updated_at, deleted_at, rn, group_size
  FROM ranked
  WHERE group_size > 1 AND rn > 1
  ORDER BY phone, role, created_at, id
`;

const SELECT_GROUPS = `
  SELECT phone, role, count(*) AS cnt,
         count(*) FILTER (WHERE "deletedAt" IS NOT NULL) AS soft_deleted
  FROM "User"
  WHERE btrim(phone) <> ''
  GROUP BY phone, role
  HAVING count(*) > 1
  ORDER BY count(*) DESC, phone, role
`;

// The mutation. "updatedAt" is bumped because the row genuinely changed and
// anything that watches that column for change-detection must see it; the
// before-image records the prior value so the rollback restores it exactly.
const APPLY_UPDATE = `
  WITH ranked AS (
    SELECT u.id,
           row_number() OVER (
             PARTITION BY u.phone, u.role
             ORDER BY u."createdAt" ASC, u.id ASC
           ) AS rn,
           count(*) OVER (PARTITION BY u.phone, u.role) AS group_size
    FROM "User" u
    WHERE btrim(u.phone) <> ''
  )
  UPDATE "User" t
  SET phone = $1 || t.id,
      "updatedAt" = now()
  FROM ranked r
  WHERE t.id = r.id AND r.group_size > 1 AND r.rn > 1
  RETURNING t.id, t.phone
`;

const COUNT_REMAINING_COLLISIONS = `
  SELECT coalesce(count(*), 0)::int AS groups
  FROM (
    SELECT 1 FROM "User" WHERE btrim(phone) <> ''
    GROUP BY phone, role HAVING count(*) > 1
  ) g
`;

async function collectBeforeImage(client) {
  const { rows } = await client.query(SELECT_TARGETS);
  return rows;
}

async function applyDedupe(client) {
  const { rows } = await client.query(APPLY_UPDATE, [PLACEHOLDER_PREFIX]);
  return rows;
}

async function verifyPostState(client, expectedUpdatedCount) {
  const remaining = (await client.query(COUNT_REMAINING_COLLISIONS)).rows[0].groups;
  const blanks = (
    await client.query(`SELECT count(*)::int AS n FROM "User" WHERE btrim(phone) = ''`)
  ).rows[0].n;
  const placeholders = (
    await client.query(`SELECT count(*)::int AS n FROM "User" WHERE phone LIKE $1`, [
      `${PLACEHOLDER_PREFIX}%`,
    ])
  ).rows[0].n;
  const problems = [];
  if (remaining !== 0) {
    problems.push(`${remaining} non-blank (phone, role) group(s) still collide after the update`);
  }
  if (placeholders < expectedUpdatedCount) {
    problems.push(
      `expected at least ${expectedUpdatedCount} placeholder rows, found ${placeholders}`,
    );
  }
  return { remaining, blanks, placeholders, problems };
}

// ─── rollback ───────────────────────────────────────────────────────────────

// Fail-closed: a row is only restored if its phone is STILL the exact
// placeholder this script wrote. If someone has since edited that account, the
// row is skipped and reported rather than silently overwritten.
const RESTORE_ONE = `
  UPDATE "User"
  SET phone = $2, "updatedAt" = $3::timestamp
  WHERE id = $1 AND phone = $4
  RETURNING id
`;

async function applyRestore(client, beforeImage) {
  const restored = [];
  const skipped = [];
  for (const row of beforeImage.rows) {
    const expectedPlaceholder = PLACEHOLDER_PREFIX + row.id;
    const res = await client.query(RESTORE_ONE, [
      row.id,
      row.phone,
      row.updatedAt,
      expectedPlaceholder,
    ]);
    if (res.rowCount === 1) restored.push(row.id);
    else skipped.push({ id: row.id, reason: 'phone is no longer the BC-QA-051 placeholder' });
  }
  return { restored, skipped };
}

// ─── transaction wrappers ───────────────────────────────────────────────────
//
// runTrial() contains NO commit statement anywhere in its body — the rollback
// in its `finally` is the only way out. runCommit() is a separate function.

async function runTrial(client, work) {
  await client.query('BEGIN');
  try {
    return await work();
  } finally {
    await client.query('ROLLBACK');
    console.log('\n[trial] ROLLBACK issued — nothing was written to the database.');
  }
}

async function runCommit(client, work) {
  await client.query('BEGIN');
  try {
    const result = await work();
    await client.query('COMMIT');
    console.log('\n[commit] COMMIT issued — changes are now permanent.');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[commit] error — ROLLBACK issued, nothing was written.');
    throw err;
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return 0;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'DATABASE_URL is not set. Export it first (never inline a connection string ' +
        'containing a password into a shell command).',
    );
    return 2;
  }

  const target = describeTarget(connectionString);
  const client = makeClient(connectionString, target);
  await client.connect();

  try {
    const actualDb = (await client.query('SELECT current_database() AS db, current_user AS usr'))
      .rows[0];

    console.log('══════════════════════════════════════════════════════════════');
    console.log(' BC-QA-051 (phone, role) dedupe');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(` host      : ${target.host}`);
    console.log(` port      : ${target.port}`);
    console.log(` database  : ${actualDb.db}   (URL said: ${target.database})`);
    console.log(` user      : ${actualDb.usr}`);
    console.log(` tls       : ${target.isLocal ? 'off (loopback)' : 'on, certificate verified'}`);
    console.log(
      ` mode      : ${args.rollbackFrom ? 'ROLLBACK' : 'DEDUPE'} / ${args.commit ? 'COMMIT (writes)' : 'TRIAL (rolls back)'}`,
    );
    console.log('══════════════════════════════════════════════════════════════\n');

    if (args.commit && args.confirmDatabase !== actualDb.db) {
      console.error(
        `Refusing to run: --confirm-database "${args.confirmDatabase}" does not match the ` +
          `database actually connected to ("${actualDb.db}").`,
      );
      return 2;
    }

    if (args.rollbackFrom) {
      return await doRollback(client, args);
    }
    return await doDedupe(client, args, actualDb.db);
  } finally {
    await client.end().catch(() => {});
  }
}

async function doDedupe(client, args, dbName) {
  const groups = (await client.query(SELECT_GROUPS)).rows;
  const targets = await collectBeforeImage(client);

  console.log(`Colliding non-blank (phone, role) groups: ${groups.length}`);
  for (const g of groups) {
    console.log(
      `  phone=${JSON.stringify(g.phone)} role=${g.role} rows=${g.cnt} (soft-deleted: ${g.soft_deleted})`,
    );
  }
  const blanks = (
    await client.query(`SELECT count(*)::int AS n FROM "User" WHERE btrim(phone) = ''`)
  ).rows[0].n;
  console.log(`\nBlank-phone rows (NOT touched, excluded by the partial index): ${blanks}`);
  console.log(`Rows this run will re-phone: ${targets.length}\n`);

  if (targets.length === 0) {
    console.log('Nothing to do — no non-blank (phone, role) collisions remain.');
    return 0;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.resolve(args.out || `bc-qa-051-before-image-${dbName}-${stamp}.json`);
  const beforeImage = {
    task: 'BC-QA-051',
    generatedAt: new Date().toISOString(),
    database: dbName,
    placeholderPrefix: PLACEHOLDER_PREFIX,
    mode: args.commit ? 'commit' : 'trial',
    rowCount: targets.length,
    rows: targets.map((r) => ({
      id: r.id,
      phone: r.phone,
      role: r.role,
      email: r.email,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      groupSize: Number(r.group_size),
      rankInGroup: Number(r.rn),
      newPhone: PLACEHOLDER_PREFIX + r.id,
    })),
  };
  fs.writeFileSync(outPath, `${JSON.stringify(beforeImage, null, 2)}\n`, { mode: 0o600 });
  console.log(`Before-image written: ${outPath}`);
  console.log('KEEP THIS FILE. It is the only record of the original phone numbers.\n');

  const work = async () => {
    const updated = await applyDedupe(client);
    console.log(`UPDATE affected ${updated.length} row(s).`);
    const check = await verifyPostState(client, updated.length);
    console.log(
      `Post-state: ${check.remaining} colliding group(s) left, ` +
        `${check.blanks} blank-phone row(s) (unchanged), ` +
        `${check.placeholders} placeholder row(s).`,
    );
    if (check.problems.length > 0) {
      throw new Error(`verification failed: ${check.problems.join('; ')}`);
    }
    if (updated.length !== targets.length) {
      throw new Error(
        `verification failed: planned ${targets.length} row(s) but UPDATE touched ${updated.length}`,
      );
    }
    console.log('Verification OK.');
    return updated;
  };

  if (args.commit) {
    await runCommit(client, work);
    console.log('\nNext: npx prisma migrate resolve --rolled-back 20260810160000_add_user_phone_role_unique');
    console.log('Then: npx prisma migrate deploy');
  } else {
    await runTrial(client, work);
    console.log(
      'This was a TRIAL: the statements above really executed and really were rolled back.\n' +
        `To apply for real: --commit --confirm-database ${dbName}`,
    );
  }
  return 0;
}

async function doRollback(client, args) {
  const beforeImage = JSON.parse(fs.readFileSync(path.resolve(args.rollbackFrom), 'utf8'));
  if (beforeImage.task !== 'BC-QA-051' || !Array.isArray(beforeImage.rows)) {
    throw new Error(`${args.rollbackFrom} does not look like a BC-QA-051 before-image file.`);
  }
  for (const r of beforeImage.rows) {
    if (typeof r.id !== 'string' || typeof r.phone !== 'string' || typeof r.updatedAt !== 'string') {
      throw new Error(
        `before-image row ${JSON.stringify(r.id)} is missing a string id/phone/updatedAt — ` +
          'refusing to restore from a file that cannot reproduce the exact prior state. ' +
          '(Timestamps must be TEXT, not a JSON date: see the SELECT_TARGETS comment.)',
      );
    }
  }

  // The restore puts the original duplicate phones back, which by definition
  // violates "User_phone_role_key". If that index already exists the whole
  // restore fails atomically (verified: "duplicate key value violates unique
  // constraint" and a ROLLBACK, nothing written). To undo after the migration
  // has run, DROP INDEX "User_phone_role_key"; first, then re-run this.
  const indexExists = (
    await client.query(
      `SELECT to_regclass('public."User_phone_role_key"') IS NOT NULL AS present`,
    )
  ).rows[0].present;
  if (indexExists) {
    console.warn(
      'WARNING: "User_phone_role_key" exists on this database. Restoring the original\n' +
        '         duplicate phone numbers will violate it and the restore will fail\n' +
        '         atomically (nothing written). Run  DROP INDEX "User_phone_role_key";\n' +
        '         first if you really intend to undo the dedupe.\n',
    );
  }
  console.log(
    `Before-image: ${beforeImage.rows.length} row(s), taken ${beforeImage.generatedAt} ` +
      `from database "${beforeImage.database}".\n`,
  );

  const work = async () => {
    const { restored, skipped } = await applyRestore(client, beforeImage);
    console.log(`Restored ${restored.length} row(s); skipped ${skipped.length}.`);
    for (const s of skipped) console.log(`  SKIPPED ${s.id}: ${s.reason}`);
    const stillPlaceholders = (
      await client.query(`SELECT count(*)::int AS n FROM "User" WHERE phone LIKE $1`, [
        `${PLACEHOLDER_PREFIX}%`,
      ])
    ).rows[0].n;
    console.log(`Placeholder rows remaining: ${stillPlaceholders}`);
    return { restored, skipped };
  };

  if (args.commit) await runCommit(client, work);
  else await runTrial(client, work);
  return 0;
}

// Only run when invoked directly, so the connection helpers can be exercised
// by a read-only probe without the script performing any work.
if (require.main === module) {
  main()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error('\nFAILED:', err && err.message ? err.message : err);
      process.exit(1);
    });
}

module.exports = { describeTarget, makeClient, parseArgs, PLACEHOLDER_PREFIX };
