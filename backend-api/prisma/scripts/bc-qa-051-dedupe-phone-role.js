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
 * It NEVER touches a row whose phone is blank (`btrim(phone) = ''`). Measured
 * read-only against production 2026-08-20 that is 134 of 231 rows: 115 USER,
 * 13 PARTNER, 3 of the 4 SUPER_ADMINs and 3 ADMIN, including 11 users attached
 * to an ACTIVE "Partner" and real end users. The migration that follows creates
 * a PARTIAL unique index that excludes blank phones precisely so those rows
 * never have to be mutated.
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
 * there is exactly one such group — a single USER phone, both of whose rows
 * are soft-deleted — and it is invisible to any "live rows only" query.
 *
 * (The number itself is deliberately not written here. This file's own rule,
 * below, is that no phone number may appear in its output; a phone number in
 * its SOURCE is worse, because this repository is public and source is
 * permanent. Every illustrative number in this file and in the migration is
 * the non-dialable placeholder +359XXXXXXXXX.)
 *
 * MODES
 * -----
 *   (default)                 TRIAL. Opens a transaction, locks "User" against
 *                             concurrent writers, writes the before-image file,
 *                             runs the REAL update statements, verifies the
 *                             result, then unconditionally ROLLS BACK. The
 *                             trial code path contains no COMMIT statement.
 *   --commit dedupe --confirm-database <name>
 *                             APPLY FOR REAL. `--commit` NAMES the operation
 *                             and must match the operation the other flags
 *                             describe; `--confirm-database` must match the
 *                             database actually connected to. Both are checked.
 *   --rollback-from <file>    Restore phones from a before-image file (TRIAL).
 *   --rollback-from <file> --commit rollback --confirm-database <name>
 *                             …and actually write it.
 *
 * Other flags:
 *   --out <path>              Where to write the before-image. Must be OUTSIDE
 *                             any git working tree — the file is customer PII
 *                             and this repository is public. By default it is
 *                             filed by target, so a real run's file is never
 *                             mixed in with scratch rehearsals:
 *                               ~/.bc-qa-051-before-images/PRODUCTION/  (0700)
 *                                 …any non-loopback database. Real data. Keep.
 *                               ~/.bc-qa-051-before-images/scratch/
 *                                 …127.0.0.1 / localhost / ::1. Disposable.
 *                             Filenames carry the mode and host, e.g.
 *                             bc-qa-051-before-image-commit-<host>-<db>-<ts>.json
 *                             Files are 0600, and PRODUCTION/ gets a
 *                             README-KEEP-THESE.txt explaining itself.
 *   --show-values             Print phone numbers and ids literally instead of
 *                             as stable 8-hex digests. Off by default so that
 *                             pasting this script's output into a ticket, a
 *                             chat, an agent transcript or a CI log cannot leak
 *                             customer data.
 *
 * The database is taken from DATABASE_URL. The script prints the host, port,
 * database and user it is about to touch before doing anything, and never
 * prints the password. TLS certificate verification is left ON for any
 * non-local host.
 *
 * RUNBOOK
 * -------
 *   0. RUN THIS BEFORE THE BRANCH REACHES `master`.
 *      .github/workflows/deploy-fly.yml fires on push to master under
 *      paths: ['backend-api/**'], and `fly.toml [deploy] release_command`
 *      then runs `prisma migrate deploy` on production. If the collisions are
 *      still there when that happens, the migration's pre-flight guard aborts
 *      the release (the previous release keeps serving — no new outage) but
 *      the failure lands in a PUBLIC GitHub Actions log. The guard's message
 *      is redacted for exactly that reason; do not rely on that alone.
 *   1. export DATABASE_URL=…            (never inline it in a command)
 *   2. node prisma/scripts/bc-qa-051-dedupe-phone-role.js
 *        → read the plan; keep the before-image file it names
 *   3. node prisma/scripts/bc-qa-051-dedupe-phone-role.js \
 *        --commit dedupe --confirm-database boomcard
 *   4. npx prisma migrate resolve --rolled-back 20260810160000_add_user_phone_role_unique
 *   5. npx prisma migrate deploy
 *
 *      *** PRODUCTION RECOVERS HERE — at step 5, not at a deploy. ***
 *      Do not stop before step 6. This whole task exists because a pipeline
 *      reported success without checking whether the service was alive;
 *      finishing a recovery without that check repeats the mistake by hand.
 *
 *   6. CONFIRM IT IS ACTUALLY SERVING:
 *
 *        curl -sS -o /dev/null -w '%{http_code}\n' --max-time 120 \
 *          https://boomcard-api.fly.dev/api/health
 *
 *      Expect 200, and a JSON body of {"status":"ok",…} if you drop the
 *      -o /dev/null. Anything else — including a timeout — means step 5 did
 *      not do what you think; re-read its output before touching anything.
 *
 *      BE PATIENT WITH THE FIRST REQUEST, and know why. Read read-only from
 *      the live app on 2026-08-20:
 *        - both `app` machines are in state `stopped`, not crash-looping.
 *          They exhausted their restart budget days ago.
 *        - fly.toml sets `auto_start_machines = true`, so the Fly proxy boots
 *          a stopped machine on the next inbound request. The machine's own
 *          event log shows exactly that: `starting start proxy 17:09:46` →
 *          `started start flyd 17:09:49` → `stopped exit flyd 17:12:03
 *          exit_code=1`.
 *        - that machine's recorded Command still ends
 *          `&& node dist/server.js`, and it runs the OLD image.
 *      So your curl is what wakes it, it boots off the image already on the
 *      machine, and the only reason it has been dying is the failed migration
 *      that step 5 just fixed. No deploy, no machine restart, no merge is
 *      needed for recovery. Budget ~2-3 minutes: the failing boot above took
 *      2m14s from wake to exit, nearly all of it inside `migrate deploy`, and
 *      a succeeding one has three migrations to apply before the server binds.
 *      The first curl may well time out before the boot finishes — that is the
 *      wake, not a failure. Wait a minute and run it again before concluding
 *      anything.
 *
 *      Deploying this branch is a SEPARATE, LATER action. It is still required
 *      (so the fixed migration file matches the checksum production recorded,
 *      and so the fly.toml/CD hardening ships) but it is not what brings the
 *      service back, and nothing about step 6 depends on it.
 *
 *   Undo step 3 with:
 *      node prisma/scripts/bc-qa-051-dedupe-phone-role.js \
 *        --rollback-from <before-image.json> --commit rollback \
 *        --confirm-database boomcard
 *
 * WHAT STEP 5 ACTUALLY APPLIES
 * ----------------------------
 * Three migrations, not one. Besides this task's
 * 20260810160000_add_user_phone_role_unique, production has never run
 * 20260819120000_add_payment_provider_columns or
 * 20260819120100_backfill_and_constrain_payment_provider — they have no row in
 * `_prisma_migrations` at all, because `migrate deploy` stops at the first
 * failure. They add `paymentProvider`/`providerOrderId` to `subscriptions` and
 * `PendingSubscription`, backfill them from `payseraOrderId` /
 * `stripeSubscriptionId`, and add a composite unique on each table. Checked
 * read-only against production on 2026-08-20: 0 duplicate `payseraOrderId`
 * groups, 0 duplicate `stripeSubscriptionId` groups, 0 rows with both set, so
 * both apply cleanly as things stand — but re-check before running step 5 if
 * meaningful time has passed, because a new duplicate would abort the release
 * the same way this migration did.
 *
 * BLAST RADIUS OF STEP 3, MEASURED AGAINST PRODUCTION (read-only, 2026-08-20)
 * --------------------------------------------------------------------------
 * 51 accounts lose the phone number stored on their "User" row:
 *   USER    ACTIVE 9 · PENDING_VERIFICATION 24 · DELETED 2 · ARCHIVED 2
 *   PARTNER ACTIVE 3 · PENDING_VERIFICATION 11
 * i.e. 12 live accounts will no longer have a reachable number on file. None
 * of the 51 is `phoneVerified`, so no verified-phone state is invalidated. 14
 * are linked to a "Partner" row (2 of those partners ACTIVE), but "Partner"
 * carries its own `phone` column for the business contact and is untouched.
 * The keeper in every group — the oldest row by "createdAt" — keeps both its
 * number and its "updatedAt".
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
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const PLACEHOLDER_PREFIX = 'BCQA051-DUP-';

// ─── PII in output ──────────────────────────────────────────────────────────
//
// Same rule as the migration's pre-flight guard (see its header): nothing this
// script prints may carry a phone number, an email or a user id unless the
// operator asks for it explicitly with --show-values. Console output from a
// destructive production script routinely ends up pasted into a ticket, a chat
// message, an agent transcript or a CI log, and this repository is public.
//
// The same rule applies to this file's SOURCE, which is a stronger constraint
// than the output rule because source is permanent: use +359XXXXXXXXX when an
// illustration needs a phone-shaped thing.
//
// WHAT THE TOKEN GUARANTEES, AND WHAT IT DOES NOT
// -----------------------------------------------
// Tokens are keyed with a random 32-byte key generated once per process and
// never written anywhere. Concretely:
//
//   GUARANTEED  Within a single run, the same input always produces the same
//               token. That is the whole point: a reader can see that one
//               phone spans a USER group and a PARTNER group, count groups,
//               and match a line in the plan to a line in the verification
//               error, without any value appearing.
//   GUARANTEED  A token cannot be reversed to its input, because the key is
//               random per run and is never emitted. The keyspace an attacker
//               would have to search is the key's 256 bits, not the phone's.
//   NOT OFFERED Tokens do NOT correlate across runs. Two invocations produce
//               different tokens for the same phone, by design. If you need to
//               follow a specific row between runs, use the before-image file.
//
// This used to be an UNKEYED sha256 prefix, with a comment claiming the value
// was "not recoverable from the output". That claim was false and it was
// load-bearing, which makes it a defect rather than a comment nit. A Bulgarian
// mobile number is drawn from roughly 3x10^7 possibilities, so an unkeyed
// digest of one is a lookup table, not a redaction: review round 2 recovered
// the exact number from an 8-hex token in 17.1 seconds over 30M candidates,
// with a unique preimage. Keying it removes the enumeration entirely — there
// is nothing to enumerate against without the key.
//
// The real values live in the before-image file, which is written 0600 outside
// any working tree — that is the one artefact allowed to hold them.
const REDACTION_KEY = crypto.randomBytes(32);

function digest(value) {
  return crypto.createHmac('sha256', REDACTION_KEY).update(String(value)).digest('hex').slice(0, 8);
}

function redactPhone(phone, showValues) {
  return showValues ? `phone=${JSON.stringify(phone)}` : `phone#${digest(phone)}`;
}

function redactId(id, showValues) {
  return showValues ? id : `id#${digest(id)}`;
}

// ─── before-image location ──────────────────────────────────────────────────
//
// The before-image holds every touched row's phone, email, id, role and status
// — real customer PII — and it is the only record of the original numbers.
//
// It used to default to a bare filename resolved against the PROCESS WORKING
// DIRECTORY. Run from `backend-api/` that landed on a path covered by
// backend-api/.gitignore; run from the repository root (an entirely natural
// invocation) it landed in the root of a PUBLIC repository as an untracked,
// UN-ignored file, one `git add -A` away from being published permanently.
//
// So: default to a private directory in the operator's home, outside any
// checkout, and refuse an explicit --out that resolves inside a git working
// tree. The .gitignore rules (repo root and backend-api/) are kept as a third
// layer for anyone who overrides this in future.
//
// SEGREGATION BY TARGET. Everything used to land in one flat directory, which
// meant the single file that is the only record of 51 real customers' phone
// numbers sat in the same listing as throwaway files from scratch-database
// runs, distinguishable only by a database name in the middle of a long
// filename. Every rehearsal, every review pass and every trial adds another.
// Picking the wrong one to restore from is a foreseeable mistake — per-row
// restore is fail-closed on the placeholder check, so a wrong file restores
// nothing rather than corrupting anything, but "nothing happened and I don't
// know why" during an incident is its own cost. Files are therefore filed
// under:
//
//   ~/.bc-qa-051-before-images/
//     PRODUCTION/   <- any non-loopback target. Real data. Keep.
//     scratch/      <- loopback (127.0.0.1/localhost/::1). Disposable.
//
// with the mode and the operation in the filename, so a human scanning the
// directory can see what each file is without opening it. The discriminator is
// deliberately "is the target loopback", not a database-name match: anything
// reachable over the network is treated as real until proven otherwise.
const DEFAULT_OUT_ROOT = path.join(os.homedir(), '.bc-qa-051-before-images');
const PRODUCTION_SUBDIR = 'PRODUCTION';
const SCRATCH_SUBDIR = 'scratch';

// Dropped in PRODUCTION/ the first time it is used, so the directory explains
// itself to whoever finds it later — including the operator's future self.
const PRODUCTION_README = `Files in this directory are BC-QA-051 before-images taken against a
NON-LOOPBACK (i.e. real) database.

Each one is the ONLY record of the original phone numbers of the "User" rows
that the dedupe re-phoned. Restoring those rows is impossible without the
matching file.

They contain customer PII: id, phone, email, role, status. Mode 0600.

  * DO NOT commit them, paste them, or move them into a checkout.
  * KEEP the file from the run that was COMMITTED (…-commit-….json) until you
    are certain the change is permanent.
  * Files marked -trial- were rolled back and describe a state that never
    existed on disk; they can be deleted once the real run has been done.

Restore with:
  node prisma/scripts/bc-qa-051-dedupe-phone-role.js \\
    --rollback-from <file> --commit rollback --confirm-database <db>
`;

function enclosingGitWorkTree(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function slug(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

// The git-worktree refusal is target-independent, so it is checked SEPARATELY
// and EARLY — before connecting, before any work. resolveOutPath is only
// reached once there is actually something to write, which meant a bad --out
// silently "passed" on a database with no collisions left: the script printed
// "Nothing to do" and exited 0 without ever validating the path. An operator
// rehearsing their --out against an already-clean database would have been told
// it was fine and then had it refused during the real run.
function assertOutPathAllowed(argsOut) {
  if (!argsOut) return;
  const outPath = path.resolve(argsOut);
  const repo = enclosingGitWorkTree(path.dirname(outPath));
  if (repo) {
    throw new Error(
      `refusing to write the before-image to ${outPath}: that path is inside the git working ` +
        `tree at ${repo}. The file contains customer phone numbers, emails and ids, and this ` +
        `repository is public. Choose a path outside any checkout, or omit --out to use ` +
        `${DEFAULT_OUT_ROOT}/{${PRODUCTION_SUBDIR},${SCRATCH_SUBDIR}}.`,
    );
  }
}

function resolveOutPath(argsOut, dbName, target, isCommit) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const mode = isCommit ? 'commit' : 'trial';
  const filename = `bc-qa-051-before-image-${mode}-${slug(target.host)}-${slug(dbName)}-${stamp}.json`;

  if (!argsOut) {
    const dir = path.join(DEFAULT_OUT_ROOT, target.isLocal ? SCRATCH_SUBDIR : PRODUCTION_SUBDIR);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!target.isLocal) {
      const readme = path.join(dir, 'README-KEEP-THESE.txt');
      if (!fs.existsSync(readme)) fs.writeFileSync(readme, PRODUCTION_README, { mode: 0o600 });
    }
    return path.join(dir, filename);
  }

  const outPath = path.resolve(argsOut);
  const repo = enclosingGitWorkTree(path.dirname(outPath));
  if (repo) {
    throw new Error(
      `refusing to write the before-image to ${outPath}: that path is inside the git working ` +
        `tree at ${repo}. The file contains customer phone numbers, emails and ids, and this ` +
        'repository is public. Choose a path outside any checkout, or omit --out to use ' +
        `${DEFAULT_OUT_ROOT}/${target.isLocal ? SCRATCH_SUBDIR : PRODUCTION_SUBDIR}.`,
    );
  }
  return outPath;
}

// ─── argument parsing ───────────────────────────────────────────────────────

const OPERATIONS = ['dedupe', 'rollback'];

// ─── --help ─────────────────────────────────────────────────────────────────
//
// The header block IS the documentation, so --help renders it. It used to do
// that with `readFileSync(__filename).split('*/')[0]`, which terminates at the
// FIRST `*/` in the file — and line 2 is `/* eslint-disable no-console */`. So
// --help printed the shebang and half an eslint pragma: 50 bytes. That mattered
// most exactly when it broke, because --commit now takes a mandatory operation
// name and an operator reaching for --help to check the syntax before touching
// production got nothing.
//
// Anchor on the JSDoc block's own delimiters instead, and refuse to print a
// help text that has silently lost its content — a wrong --help is worse than
// an obviously broken one.
const HELP_ANCHORS = ['RUNBOOK', '--commit dedupe', '--show-values', 'ROLLBACK ORDERING'];

function renderHelp(source) {
  const src = source !== undefined ? source : fs.readFileSync(__filename, 'utf8');
  const start = src.indexOf('/**');
  const end = start === -1 ? -1 : src.indexOf('*/', start + 3);
  if (start === -1 || end === -1) {
    return 'help unavailable: could not locate the header block in this file.';
  }
  const body = src
    .slice(start + 3, end)
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n')
    .trim();

  const missing = HELP_ANCHORS.filter((a) => !body.includes(a));
  if (missing.length > 0) {
    return (
      `help is incomplete — the header block rendered without: ${missing.join(', ')}.\n` +
      `Read ${__filename} directly; do not run a destructive operation from a partial help text.`
    );
  }
  return body;
}

// Every value-taking flag goes through this. Previously the parser used a bare
// `argv[++i]`, which silently yielded `undefined` when the value was missing —
// and because the operation was then INFERRED from `if (args.rollbackFrom)`,
// typing `--commit --confirm-database <db> --rollback-from` with the filename
// lost off the end of the line ran the DEDUPE in commit mode and wrote 51 rows.
// `--confirm-database` was no help: it validates which DATABASE, never which
// OPERATION. Fail closed instead, and refuse a value that is itself a flag.
function requireValue(argv, i, flag) {
  const v = argv[i];
  if (v === undefined) {
    throw new Error(`${flag} requires a value but the argument list ended. Refusing to guess.`);
  }
  if (v.startsWith('--')) {
    throw new Error(
      `${flag} requires a value but got the flag ${JSON.stringify(v)}. ` +
        'Refusing to guess — did a value get dropped off the command line?',
    );
  }
  return v;
}

function parseArgs(argv) {
  const args = {
    commit: null, // null = trial; otherwise the operation the caller declared
    confirmDatabase: null,
    rollbackFrom: null,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.commit = requireValue(argv, ++i, '--commit');
    else if (a === '--confirm-database') args.confirmDatabase = requireValue(argv, ++i, a);
    else if (a === '--rollback-from') args.rollbackFrom = requireValue(argv, ++i, a);
    else if (a === '--out') args.out = requireValue(argv, ++i, a);
    else if (a === '--show-values') args.showValues = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }

  // The operation is DERIVED from the flags, and when writing it must also be
  // DECLARED and must match. Two independent statements of intent have to
  // agree before anything is committed.
  args.operation = args.rollbackFrom ? 'rollback' : 'dedupe';

  if (args.commit !== null) {
    if (!OPERATIONS.includes(args.commit)) {
      throw new Error(
        `--commit must name the operation: --commit ${OPERATIONS.join(' | --commit ')}. ` +
          `Got ${JSON.stringify(args.commit)}.`,
      );
    }
    if (args.commit !== args.operation) {
      throw new Error(
        `--commit ${args.commit} was requested, but the flags describe a ${args.operation} ` +
          (args.operation === 'dedupe'
            ? '(no --rollback-from was supplied). Refusing to run a different operation than the one you named.'
            : '(--rollback-from was supplied). Refusing to run a different operation than the one you named.'),
      );
    }
    if (!args.confirmDatabase) {
      throw new Error(
        `--commit ${args.commit} requires --confirm-database <name>. Pass the exact database ` +
          'name you intend to modify; the script aborts if it does not match the database it ' +
          'connected to.',
      );
    }
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

// SHARE ROW EXCLUSIVE conflicts with the ROW EXCLUSIVE lock that
// INSERT/UPDATE/DELETE take, so it blocks concurrent WRITERS to "User" for the
// life of the transaction while leaving readers alone. It is taken as the
// FIRST statement, before the before-image snapshot is read, which is what
// makes the snapshot and the UPDATE describe the same table state.
//
// Why this is not optional: the before-image used to be collected and written
// to disk BEFORE `BEGIN`, with nothing holding the rows still in between, and
// the only cross-check was a row COUNT. A concurrent UPDATE of a planned row
// keeps the count identical, so it was invisible — the before-image kept the
// pre-concurrent value and a later restore wrote that stale value back over
// the newer one. On a phone column that means silently resurrecting a customer's
// old number. The migration that follows takes a ShareLock on the same table
// moments later anyway, so this costs nothing that the runbook was not already
// paying.
const LOCK_USER_TABLE = 'LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE';

async function runTrial(client, work) {
  await client.query('BEGIN');
  try {
    await client.query(LOCK_USER_TABLE);
    return await work();
  } finally {
    await client.query('ROLLBACK');
    console.log('\n[trial] ROLLBACK issued — nothing was written to the database.');
  }
}

async function runCommit(client, work) {
  await client.query('BEGIN');
  try {
    await client.query(LOCK_USER_TABLE);
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
    console.log(renderHelp());
    return 0;
  }

  // Validate --out before touching anything, so a bad path fails fast rather
  // than after the plan has been computed (or, worse, silently never at all).
  assertOutPathAllowed(args.out);

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
      ` operation : ${args.operation.toUpperCase()}` +
        (args.operation === 'rollback' ? ` (from ${path.resolve(args.rollbackFrom)})` : ''),
    );
    console.log(
      ` mode      : ${args.commit ? `COMMIT (writes) — declared as --commit ${args.commit}` : 'TRIAL (rolls back)'}`,
    );
    console.log(` values    : ${args.showValues ? 'SHOWN (--show-values)' : 'redacted'}`);
    console.log('══════════════════════════════════════════════════════════════\n');

    if (args.commit && args.confirmDatabase !== actualDb.db) {
      console.error(
        `Refusing to run: --confirm-database "${args.confirmDatabase}" does not match the ` +
          `database actually connected to ("${actualDb.db}").`,
      );
      return 2;
    }

    if (args.operation === 'rollback') {
      return await doRollback(client, args);
    }
    return await doDedupe(client, args, actualDb.db, target);
  } finally {
    await client.end().catch(() => {});
  }
}

async function doDedupe(client, args, dbName, target) {
  // Everything below — the plan, the before-image and the UPDATE — happens
  // inside one transaction that holds SHARE ROW EXCLUSIVE on "User" from its
  // first statement (see LOCK_USER_TABLE). Nothing is read before the lock, so
  // no concurrent writer can slip between the snapshot and the mutation.
  let outPath = null;

  const work = async () => {
    const groups = (await client.query(SELECT_GROUPS)).rows;
    const targets = await collectBeforeImage(client);

    console.log(`Colliding non-blank (phone, role) groups: ${groups.length}`);
    for (const g of groups) {
      console.log(
        `  ${redactPhone(g.phone, args.showValues)} role=${g.role} rows=${g.cnt} ` +
          `(soft-deleted: ${g.soft_deleted})`,
      );
    }
    const blanks = (
      await client.query(`SELECT count(*)::int AS n FROM "User" WHERE btrim(phone) = ''`)
    ).rows[0].n;
    console.log(`\nBlank-phone rows (NOT touched, excluded by the partial index): ${blanks}`);
    console.log(`Rows this run will re-phone: ${targets.length}`);
    if (!args.showValues) {
      console.log('(phone values redacted — pass --show-values to print them literally)');
    }
    console.log('');

    if (targets.length === 0) {
      console.log('Nothing to do — no non-blank (phone, role) collisions remain.');
      return [];
    }

    outPath = resolveOutPath(args.out, dbName, target, Boolean(args.commit));
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
    if (args.commit) {
      console.log('KEEP THIS FILE. It is the only record of the original phone numbers.\n');
    } else {
      console.log(
        'This is a TRIAL before-image: the run it describes is about to be rolled back, so\n' +
          'it records a state that never persisted. The commit run writes its own. Delete this\n' +
          'one once the real run is done — it still contains customer PII.\n',
      );
    }

    const updated = await applyDedupe(client);
    console.log(`UPDATE affected ${updated.length} row(s).`);

    // Verify the SET of touched ids, not just how many there were. A count
    // comparison cannot tell "the 51 rows I planned" from "51 rows, one of
    // which someone else changed under me".
    const plannedIds = new Set(targets.map((r) => r.id));
    const updatedIds = new Set(updated.map((r) => r.id));
    const missing = [...plannedIds].filter((id) => !updatedIds.has(id));
    const unexpected = [...updatedIds].filter((id) => !plannedIds.has(id));
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(
        `verification failed: the rows updated are not the rows planned — ` +
          `${missing.length} planned row(s) were not updated, ` +
          `${unexpected.length} unplanned row(s) were. ` +
          `First divergent: ${redactId(missing[0] || unexpected[0], args.showValues)}`,
      );
    }

    const check = await verifyPostState(client, updated.length);
    console.log(
      `Post-state: ${check.remaining} colliding group(s) left, ` +
        `${check.blanks} blank-phone row(s) (unchanged), ` +
        `${check.placeholders} placeholder row(s).`,
    );
    if (check.problems.length > 0) {
      throw new Error(`verification failed: ${check.problems.join('; ')}`);
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
        `To apply for real: --commit dedupe --confirm-database ${dbName}`,
    );
    if (outPath) {
      console.log(
        `The trial's before-image at ${outPath} describes a state that was rolled back; ` +
          'the commit run writes its own.',
      );
    }
  }
  return 0;
}

async function doRollback(client, args) {
  const beforeImage = JSON.parse(fs.readFileSync(path.resolve(args.rollbackFrom), 'utf8'));
  if (beforeImage.task !== 'BC-QA-051' || !Array.isArray(beforeImage.rows)) {
    throw new Error(`${args.rollbackFrom} does not look like a BC-QA-051 before-image file.`);
  }
  // Shape-check, not just type-check. `typeof === 'string'` alone does NOT
  // catch the corruption this guard exists for: JSON.stringify turns a JS Date
  // into a STRING ("2026-01-31T20:12:00.435Z"), so a before-image written by a
  // build that lost the ::text casts in SELECT_TARGETS sailed through and the
  // restore shifted all 51 rows by the local UTC offset. Require Postgres's
  // `timestamp` text form (YYYY-MM-DD HH:MM:SS…) and reject the ISO `T…Z` form
  // explicitly.
  const PG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
  for (const r of beforeImage.rows) {
    if (typeof r.id !== 'string' || typeof r.phone !== 'string') {
      throw new Error(
        `before-image row ${redactId(r.id, args.showValues)} is missing a string id/phone — refusing to ` +
          'restore from a file that cannot reproduce the exact prior state.',
      );
    }
    if (typeof r.updatedAt !== 'string' || !PG_TIMESTAMP_RE.test(r.updatedAt)) {
      throw new Error(
        `before-image row ${redactId(r.id, args.showValues)} has updatedAt=` +
          `${JSON.stringify(r.updatedAt)}, which is not a Postgres timestamp literal ` +
          '("YYYY-MM-DD HH:MM:SS[.ffffff]"). An ISO "…T…Z" value here means the file was ' +
          'written without the ::text casts in SELECT_TARGETS and every timestamp in it is ' +
          'shifted by the writer\'s UTC offset. Refusing to restore from it.',
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
    for (const s of skipped) {
      console.log(`  SKIPPED ${redactId(s.id, args.showValues)}: ${s.reason}`);
    }
    if (skipped.length > 0 && !args.showValues) {
      console.log(
        '  (ids redacted — pass --show-values to print them, or look them up in the ' +
          'before-image file)',
      );
    }
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

// Only run when invoked directly. Requiring this file therefore performs no
// work and opens no connection, which is what makes the exports below usable
// from a REPL or a one-off check without side effects.
if (require.main === module) {
  main()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      // Print the message ONLY. A pg error object carries `detail`, which for a
      // 23505 is `Key (phone, role)=(+359…, USER) already exists.` — i.e. a
      // customer's phone number. Dumping the whole object here would defeat the
      // redaction everywhere else in this file.
      const message =
        err && typeof err.message === 'string' && err.message.length > 0
          ? err.message
          : `${err && err.name ? err.name : 'Error'} (no message; details withheld — they can contain customer data)`;
      console.error('\nFAILED:', message);
      process.exit(1);
    });
}

// Exported for inspection and ad-hoc verification (e.g. checking what `ssl`
// option makeClient actually resolves for a given URL before running anything
// destructive). Nothing in the repository imports this module today.
module.exports = {
  describeTarget,
  makeClient,
  parseArgs,
  resolveOutPath,
  assertOutPathAllowed,
  enclosingGitWorkTree,
  redactPhone,
  redactId,
  PLACEHOLDER_PREFIX,
  DEFAULT_OUT_ROOT,
  PRODUCTION_SUBDIR,
  SCRATCH_SUBDIR,
};
