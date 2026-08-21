import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';
import { assertCurrencyInDomain, CURRENCY_DOMAIN_BY_MODEL } from '../utils/currency';

// Load environment variables from .env file (only needed for local development;
// in production, env vars are injected by the hosting platform)
dotenv.config({ path: path.join(__dirname, '../../.env') });

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

/**
 * Attach a `connect` handler to a fresh pg.Pool and return it. node-postgres
 * fires 'connect' exactly once per NEW physical connection the pool opens
 * (not once per checkout of an already-open, idle connection), which is
 * exactly the hook point needed to pin a connection's session-level
 * `search_path` for its whole lifetime -- see `createScratchSchemaClient`
 * below for why that matters and what it's for.
 *
 * FAIL-CLOSED ON `onConnect` FAILURE (BC-QA-037 impl-r1 MEDIUM #1): if
 * `onConnect` (in practice, the `SET search_path` statement below) ever
 * rejects, this used to only log the error and let the connection be
 * checked out / returned to the idle pool exactly as if nothing had gone
 * wrong. Since 'connect' only fires once per NEW physical connection (never
 * again for that same connection on later checkouts), a `SET search_path`
 * that fails once but leaves the underlying TCP connection healthy would
 * silently poison that connection for its *entire remaining lifetime* --
 * every future query through it runs under Postgres's default
 * `search_path` (effectively `public`) instead of the intended schema, with
 * no signal to any caller. That is the exact "isolation is illusory" bug
 * this file exists to fix, just reintroduced probabilistically. We now
 * force the pool to discard the connection instead, so a caller either gets
 * a connection correctly pinned to the target schema, or gets a clear
 * failure -- never a silent fallback to the wrong schema.
 */
function buildPool(connectionString: string, onConnect?: (client: PoolClient) => Promise<void>): Pool {
  const pool = new Pool({ connectionString });
  if (onConnect) {
    pool.on('connect', (client) => {
      onConnect(client).catch((err: unknown) => {
        logger.error(
          'prisma.ts: pool "connect" hook failed -- discarding this connection instead of reusing it (fail closed)',
          err as Error,
        );
        discardConnection(pool, client);
      });
    });
  }
  return pool;
}

/**
 * Force `pg-pool` to permanently evict a physical connection instead of
 * ever returning it to the idle pool for reuse.
 *
 * `Pool.prototype._remove` is not officially public API (leading
 * underscore) but it is exactly the mechanism `pg-pool` itself uses
 * internally to evict a bad connection (see its own `idleListener` /
 * `_release`): it splices the client out of both `_idle` and `_clients`
 * and calls `client.end()`. That is deterministic no matter which internal
 * state the connection is currently in -- genuinely idle, mid-query via
 * `pool.query()`, or checked out directly via `pool.connect()` for a
 * manual transaction (`@prisma/adapter-pg`'s transaction path) -- unlike
 * emitting a synthetic client `'error'` event, whose effect depends
 * entirely on which listener happens to be attached at that exact moment:
 * `pg-pool`'s own `idleListener` is only attached while a connection is
 * genuinely sitting idle (it's removed the instant a connection is
 * acquired, including for the very first checkout right after 'connect'
 * fires), and `@prisma/adapter-pg`'s own transaction-path error listener
 * only logs, it does not discard. Mutating the pool's own bookkeeping
 * arrays directly sidesteps all of that: once `_remove` has run, the
 * connection structurally cannot be handed out again by `_pulseQueue`
 * (it's gone from `_idle`) or counted against the pool's `max` (it's gone
 * from `_clients`), regardless of which higher-level path was in flight.
 *
 * A defensive fallback (plain `client.end()`) covers a future `pg-pool`
 * version that removes `_remove` entirely -- ending the connection
 * directly still keeps it out of *this* pool's usable state (a physically
 * closed connection cannot serve a query), even though it does not
 * proactively splice pg-pool's internal `_idle`/`_clients` arrays.
 */
function discardConnection(pool: Pool, client: PoolClient): void {
  const poolInternal = pool as unknown as { _remove?: (client: PoolClient) => void };
  if (typeof poolInternal._remove === 'function') {
    poolInternal._remove(client);
    return;
  }
  // `PoolClient`'s public type only exposes `release`, not `end` (that's a
  // `Client`-only method per @types/pg) -- but at runtime a `PoolClient` is
  // always a real `pg.Client` instance, so `.end()` genuinely exists here.
  const rawClient = client as unknown as { end: () => Promise<void> };
  rawClient.end().catch(() => {
    // Best-effort -- the connection is already considered unusable, and
    // `.end()` failing here doesn't change that.
  });
}

/**
 * BC-QA-060 -- `disposeExternalPool: true` here (confirmed by bisection, not
 * guessed): without it, `@prisma/adapter-pg` treats `pool` as caller-owned and
 * never closes it on `$disconnect()`, so the pool's live TCP connections to
 * Postgres stay open forever. In production that was silently masked by the
 * `globalForPrisma` singleton (the pool is meant to be opened once and live
 * for the whole process, only ever "disconnected" right before
 * `process.exit()` in the SIGINT/SIGTERM handlers below -- so an unclosed
 * pool was never observable there). But it also meant those SIGINT/SIGTERM
 * handlers' `await prisma.$disconnect()` was never actually closing anything.
 *
 * It IS observable in the Jest unit suite: `tests/setup.ts` imports this
 * module and calls `prisma.$connect()` / `prisma.$disconnect()` once per test
 * file, and Jest's per-file test environment gives each file its own
 * `global` (the `globalForPrisma` cache doesn't actually survive across
 * files the way the comment above assumes -- confirmed with a throwaway
 * counter probe), so every file was opening a brand-new `pg.Pool` that
 * `$disconnect()` then failed to close. With `maxWorkers: 1`, those pools
 * accumulate live sockets in the SAME worker process across every file it
 * runs, and jest-worker's own graceful shutdown (`tests/setup.ts` never
 * `process.exit()`s itself -- jest-worker just removes its IPC listener and
 * waits for Node's event loop to drain naturally) then has nothing to wait
 * for: the leaked pool sockets keep the loop non-empty, so the worker never
 * exits on its own and jest-worker force-kills it 500ms later, printing "A
 * worker process has failed to exit gracefully". Reproduced by bisection:
 * disabled every other candidate (SIGINT/SIGTERM handlers, winston File
 * transports, the supertest persistent-server mock) one at a time with the
 * warning still firing; only removing `tests/setup.ts` entirely, or adding
 * this flag, made it disappear -- 3/3 clean reruns of
 * `npx jest tests/unit/paysera.service.test.ts tests/unit/mypos.service.test.ts`
 * after the fix, `--detectOpenHandles` clean too.
 *
 * `disposeExternalPool: true` tells the adapter it owns the pool and should
 * actually call `pool.end()` on `$disconnect()`, matching what
 * `createScratchSchemaClient` below already does for its own dedicated pool
 * (see its comment: "let Prisma close it on $disconnect() instead of leaking
 * pool connections across tests"). This also fixes a latent production bug:
 * the SIGINT/SIGTERM graceful-shutdown handlers now genuinely close the pool
 * before `process.exit(0)` instead of a no-op.
 */
function createPrismaClient(): PrismaClient {
  const pool = buildPool(process.env.DATABASE_URL as string);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/**
 * A safe, unquoted Postgres identifier: letters, digits, underscore; must not
 * start with a digit. Deliberately conservative -- this only needs to admit
 * scratch-schema names our own test tooling generates (e.g.
 * `bcqa037_scratch_<random>`), not arbitrary external input, and rejecting a
 * schema name is a much cheaper failure mode here than accidentally building
 * unsafe SQL out of `SET search_path`, which does not support bind
 * parameters for identifiers.
 */
const SAFE_SCHEMA_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeSchemaName(schemaName: string): void {
  if (!SAFE_SCHEMA_NAME.test(schemaName)) {
    throw new Error(
      `createScratchSchemaClient: "${schemaName}" is not a safe, unquoted Postgres identifier ` +
        '(letters/digits/underscore, must not start with a digit).',
    );
  }
}

/**
 * BC-QA-037 -- genuine scratch-schema isolation for PrismaClient runtime
 * queries, not just `prisma migrate deploy`.
 *
 * CONFIRMED ROOT CAUSE (reproduced with a throwaway jest probe, not guessed):
 * `prisma` (the default export below) is a process-wide singleton cached on
 * Node's own `global` object via `globalForPrisma`, specifically so
 * Next.js-style hot reload doesn't leak a new pg.Pool on every reload. That
 * caching has a side effect that isn't obvious from `createPrismaClient()`
 * in isolation: `global` SURVIVES `jest.resetModules()` (resetModules only
 * clears Node's *require cache* -- it never touches `global`). So once THIS
 * test file has imported this module once (in practice: `tests/setup.ts`'s
 * own top-level `import { prisma } from '../src/lib/prisma'`, using the
 * base `.env.test` DATABASE_URL with no schema override), EVERY later
 * import of `../lib/prisma` *within that same file* -- no matter how many
 * times `jest.resetModules()` runs, and no matter what
 * `process.env.DATABASE_URL` gets mutated to afterward -- returns that
 * exact same cached PrismaClient, backed by the exact same pg.Pool, built
 * from whatever DATABASE_URL was current the FIRST time the module was
 * ever evaluated in that file's module registry.
 *
 * CORRECTED (BC-QA-060 impl-r1 M1): this paragraph used to claim the
 * persistence spans *every test file in a given Jest worker*, not just
 * re-imports within one file. That broader claim was never actually
 * verified and is false under this project's Jest config (`maxWorkers: 1`,
 * default test environment): Jest gives each test file its own `global`
 * (a fresh per-file sandbox/module registry), even when multiple files
 * share the same worker process, so `globalForPrisma.prisma` does NOT
 * survive from one file to the next -- confirmed with a throwaway two-file
 * probe (see the BC-QA-060 comment on `createPrismaClient` below for that
 * evidence). The scratch-schema-client bug this comment documents is real,
 * but it only manifests WITHIN a single file's own `jest.resetModules()` +
 * re-import sequence, not across files.
 *
 * Mutating `process.env.DATABASE_URL`
 * after that point -- whether via Prisma's own `?schema=<name>` convention or
 * the Postgres `options=-c search_path=<name>` trick -- has ZERO effect on
 * that already-open pool's physical connections; an existing pg.Pool does
 * not re-read the connection string on checkout. A probe test confirmed this
 * exactly: re-requiring this module after `jest.resetModules()` + a
 * DATABASE_URL override still returned the SAME PrismaClient object
 * reference, and `SHOW search_path` through it still came back as Postgres's
 * default `"$user", public` -- not the override.
 *
 * That also clears `@prisma/adapter-pg` of suspicion: a throwaway,
 * never-cached PrismaPg/Pool/PrismaClient stack built directly from a
 * connection string carrying `options=-c search_path=<x>` returns `SHOW
 * search_path` = `<x>` through Prisma every time. The adapter does not
 * reset or otherwise interfere with search_path -- the bug is purely that
 * the SINGLETON never got rebuilt, not a limitation of the adapter or of
 * node-postgres.
 *
 * FIX SHAPE: this helper never touches the cached singleton. It builds a
 * brand-new pg.Pool -- outside `globalForPrisma`, so it can never be a stale
 * reused connection -- and pins EVERY physical connection that pool ever
 * opens to the target schema via `pool.on('connect', ...)` (see `buildPool`
 * above), which runs a real `SET search_path` on that connection before
 * Prisma (or anyone else) gets to use it. That is more robust than relying
 * solely on the connection-string `options=` trick: it doesn't depend on
 * exactly how a given Pool/adapter construction path happens to preserve or
 * drop a startup parameter, because it explicitly re-asserts the setting on
 * every connection the pool ever opens, every time.
 *
 * USAGE CONVENTION for genuine scratch-schema test isolation (both halves
 * MUST use the same schema name to actually agree with each other):
 *
 *   1. Migrate the scratch schema (this already worked before this fix --
 *      Prisma's own migration CLI has always honored `?schema=`):
 *        DATABASE_URL="<base>&schema=<scratchName>" npx prisma migrate deploy
 *
 *   2. Get a client whose RUNTIME queries also land in that same schema:
 *        const client = createScratchSchemaClient('<scratchName>');
 *        // ... use `client` exactly like a normal PrismaClient ...
 *        await client.$disconnect(); // also closes this dedicated pool
 *
 *   3. Drop the scratch schema when done -- it is never dropped
 *      automatically, so callers own cleanup (see
 *      tests/unit/prisma.scratchSchema.test.ts's own `afterAll` for the
 *      pattern this mirrors):
 *        DROP SCHEMA IF EXISTS "<scratchName>" CASCADE;
 *
 * Steps 1 and 2 now target the same schema, so migration state and runtime
 * queries are, for once, actually about the same database object -- closing
 * the isolation gap this task exists to fix. Step 3 is caller-owned cleanup
 * so repeated test runs don't accumulate orphan schemas in the database.
 *
 * This is a separate, explicit opt-in export rather than a change to
 * `prisma` / `createPrismaClient()` above: production and the existing
 * default-schema test suite must see zero behavioural change when no
 * override is requested (verified in
 * tests/unit/prisma.scratchSchema.test.ts).
 *
 * "Exactly like a normal PrismaClient" includes every extension applied to
 * the default `prisma` singleton below — `withSoftDelete` (BC-QA-037 impl-r1
 * MEDIUM #2) and `withCurrencyGuard` (BC-QA-031-FOLLOWUP-1) — applied in the
 * same order, so `User.findMany`/`findFirst` soft-delete filtering and the
 * accepted-currency write guard both behave identically to production instead
 * of silently diverging for anyone who queries through a scratch client.
 */
export function createScratchSchemaClient(schemaName: string): PrismaClient {
  assertSafeSchemaName(schemaName);
  if (!process.env.DATABASE_URL) {
    throw new Error('createScratchSchemaClient: DATABASE_URL environment variable is not set.');
  }

  const pool = buildPool(process.env.DATABASE_URL, async (client) => {
    // Double-quoted identifier: SAFE_SCHEMA_NAME above already restricts
    // schemaName to [a-zA-Z0-9_], so no further escaping is needed, but the
    // quoting is kept for clarity and to match Postgres's own convention.
    await client.query(`SET search_path TO "${schemaName}", public`);
  });

  const adapter = new PrismaPg(pool, {
    // Tell the query compiler which schema it's targeting too, so any
    // Prisma-generated SQL that ends up schema-qualified explicitly (rather
    // than relying on session search_path resolution) agrees with the SET
    // search_path above rather than defaulting to "public".
    schema: schemaName,
    // This pool is dedicated to this one client (never shared with the
    // `prisma` singleton or another scratch client) -- let Prisma close it
    // on $disconnect() instead of leaking pool connections across tests.
    disposeExternalPool: true,
  });

  return withCurrencyGuard(
    withSoftDelete(
      new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      }),
    ),
  );
}

/**
 * BC-QA-031-FOLLOWUP-1 — a BACKSTOP behind the currency domain, with known limits.
 *
 * `src/utils/currency.ts` narrows each money column BoomCard writes to its own
 * accepted domain (`CURRENCY_DOMAIN_BY_MODEL`), and each individual write path
 * enforces that for itself with a message appropriate to its caller (a 400 on
 * the request-body path, a refuse-and-alert on the Stripe webhook paths). Those
 * per-path checks are what actually close the hole. This extension is a second
 * line of defence for the ordinary `prisma.<model>.<op>(...)` call shape: a
 * write site added later that never heard of this task still cannot persist an
 * out-of-domain `currency` THROUGH THAT SHAPE — it throws
 * `UnsupportedCurrencyError` (an `AppError` carrying 400) before the query
 * reaches the database.
 *
 * THE DOMAINS ARE PER COLUMN, and deliberately not uniform (task-r1 F3):
 *   - `Transaction.currency`      → {BGN, EUR}. It records what a customer PAID.
 *   - `Wallet.currency`           → {BGN}.
 *   - `WalletTransaction.currency`→ {BGN}.
 * The wallet columns are the ledger's own unit and its arithmetic is
 * unconditionally BGN (`walletService.credit`/`debit` take no currency at all),
 * so admitting EUR there admits a value the ledger cannot honour — measured as
 * a ~96% over-credit before this narrowing. Reads are deliberately WIDER than
 * writes on all three columns, because legacy rows predating the narrowing must
 * still be displayed honestly rather than rejected.
 *
 * ⚠ WHAT IT DOES **NOT** COVER (measured, not assumed — impl-r1 F2 landed a USD
 * row through the first hole and a GBP row through the second):
 *
 *   - NESTED WRITES. Prisma query extensions fire for the operation invoked on
 *     the model client, not for relations written inside it, so
 *     `prisma.user.update({ data: { transactions: { create: { currency: 'USD' }
 *     } } })` bypasses this guard entirely. There is no extension-level fix for
 *     that; it is a property of where Prisma dispatches extensions.
 *   - ANY OPERATION NOT LISTED in `CURRENCY_GUARDED_WRITES`. The list is
 *     enumerated by hand and Prisma has added operations over time
 *     (`createManyAndReturn` / `updateManyAndReturn` were missing until F2).
 *     A future Prisma release adding another write shape reopens the same gap.
 *   - RAW SQL (`$executeRaw`, `$queryRaw`) — by design; the legacy-row tests
 *     rely on that escape hatch to reproduce pre-narrowing rows.
 *
 * Therefore: do NOT describe this as a database invariant, and do not let a
 * caller skip its own validation because "the guard will catch it". The only
 * genuinely structural version of this constraint is a Postgres `CHECK` on
 * `Transaction.currency`, `Wallet.currency` and `WalletTransaction.currency`,
 * which is a migration and belongs to the db-engineer (recommended as a
 * follow-up by BC-QA-031-FOLLOWUP-1; not written here, out of glob).
 *
 * Scope is deliberately narrow in three further ways:
 *   - READS are untouched. Legacy rows written before the narrowing still
 *     exist and must remain readable; `toEur`/`displayCurrency` report them
 *     under their own currency label instead of relabelling them EUR.
 *   - An ABSENT `currency` is untouched, so the schema's `@default("BGN")`
 *     keeps applying to the many writers that never mention the column.
 *   - The value is validated, never rewritten. Normalising case inside a
 *     query extension would silently mutate caller data at a layer no caller
 *     can see; call sites normalise explicitly via `normalizeCurrency`.
 *
 * The enumerated operations are pinned by
 * `tests/integration/bc-qa-031-followup-1-write-rejection.test.ts`, which also
 * records both bypasses above as explicit, asserted limitations rather than
 * leaving them to be rediscovered.
 */
const CURRENCY_GUARDED_WRITES = [
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
] as const;

function assertCurrencyInPayload(payload: unknown, context: string, domain: readonly string[]): void {
  if (payload === null || typeof payload !== 'object') return;
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    if (!('currency' in row)) continue;
    const raw = (row as { currency?: unknown }).currency;
    // Prisma accepts both `currency: 'EUR'` and the `currency: { set: 'EUR' }`
    // update form; unwrap the latter so both spellings are guarded.
    const value =
      raw !== null && typeof raw === 'object' && 'set' in (raw as Record<string, unknown>)
        ? (raw as { set?: unknown }).set
        : raw;
    // `undefined` means the field was not supplied (schema default applies);
    // `null` cannot be stored in these non-nullable columns and is left to
    // Prisma's own validation to reject with its usual message.
    if (value === undefined || value === null) continue;
    assertCurrencyInDomain(value, context, domain);
  }
}

function guardForModel(modelKey: string) {
  // The accepted domain is PER COLUMN, not global (task-r1 F3): `Transaction`
  // records what a customer paid and is {BGN, EUR}; the two wallet columns are
  // the ledger's own unit and are BGN alone, because `walletService`'s
  // arithmetic is unconditionally BGN. See `CURRENCY_DOMAIN_BY_MODEL`.
  const domain = CURRENCY_DOMAIN_BY_MODEL[modelKey];
  return Object.fromEntries(
    CURRENCY_GUARDED_WRITES.map((operation) => [
      operation,
      async ({ model, args, query }: { model: string; args: unknown; query: (a: unknown) => unknown }) => {
        const container = args as { data?: unknown; create?: unknown; update?: unknown };
        const context = `prisma ${model}.${operation}`;
        assertCurrencyInPayload(container?.data, context, domain);
        // `upsert` carries two independent payloads, neither of which is `data`.
        assertCurrencyInPayload(container?.create, context, domain);
        assertCurrencyInPayload(container?.update, context, domain);
        return query(args);
      },
    ]),
  );
}

function withCurrencyGuard(client: PrismaClient): PrismaClient {
  return client.$extends({
    query: {
      transaction: guardForModel('transaction'),
      wallet: guardForModel('wallet'),
      walletTransaction: guardForModel('walletTransaction'),
    },
  }) as unknown as PrismaClient;
}

function withSoftDelete(client: PrismaClient): PrismaClient {
  // Extend User.findMany / findFirst / findUnique to exclude soft-deleted rows
  // by default. Callers that explicitly need deleted rows should pass
  // `where: { deletedAt: { not: null } }` (which bypasses this extension since
  // it provides an explicit deletedAt filter).
  return client.$extends({
    query: {
      user: {
        async findMany({ args, query }) {
          if (!args.where?.deletedAt) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (!args.where?.deletedAt) {
            args.where = { ...args.where, deletedAt: null };
          }
          return query(args);
        },
        async findUnique({ args, query }) {
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma || withCurrencyGuard(withSoftDelete(createPrismaClient()));

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing Prisma Client');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing Prisma Client');
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;
