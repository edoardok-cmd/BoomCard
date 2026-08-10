import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { logger } from '../utils/logger';

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
 */
function buildPool(connectionString: string, onConnect?: (client: PoolClient) => Promise<void>): Pool {
  const pool = new Pool({ connectionString });
  if (onConnect) {
    pool.on('connect', (client) => {
      onConnect(client).catch((err: unknown) => {
        logger.error('prisma.ts: pool "connect" hook failed', err as Error);
      });
    });
  }
  return pool;
}

function createPrismaClient(): PrismaClient {
  const pool = buildPool(process.env.DATABASE_URL as string);
  const adapter = new PrismaPg(pool);
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
 * clears Node's *require cache* -- it never touches `global`). So once ANY
 * test file in a given Jest worker has imported this module once (in
 * practice: `tests/setup.ts`'s own top-level `import { prisma } from
 * '../src/lib/prisma'`, using the base `.env.test` DATABASE_URL with no
 * schema override), EVERY later import of `../lib/prisma` in that same
 * worker -- no matter how many times `jest.resetModules()` runs, and no
 * matter what `process.env.DATABASE_URL` gets mutated to afterward --
 * returns that exact same cached PrismaClient, backed by the exact same
 * pg.Pool, built from whatever DATABASE_URL was current the FIRST time the
 * module was ever evaluated in that process. Mutating `process.env.DATABASE_URL`
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
 * Steps 1 and 2 now target the same schema, so migration state and runtime
 * queries are, for once, actually about the same database object -- closing
 * the isolation gap this task exists to fix.
 *
 * This is a separate, explicit opt-in export rather than a change to
 * `prisma` / `createPrismaClient()` above: production and the existing
 * default-schema test suite must see zero behavioural change when no
 * override is requested (verified in
 * tests/unit/prisma.scratchSchema.test.ts).
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

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
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

export const prisma = globalForPrisma.prisma || withSoftDelete(createPrismaClient());

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
