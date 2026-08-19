// BC-QA-037: proves that `createScratchSchemaClient()` (src/lib/prisma.ts)
// actually delivers genuine scratch-schema isolation for RUNTIME PrismaClient
// queries -- not just for `prisma migrate deploy` (which already worked via
// Prisma's own `?schema=` convention before this fix). See the doc comment on
// `createScratchSchemaClient` in src/lib/prisma.ts for the confirmed root
// cause of why the naive approaches (the `?schema=` query param alone, or
// mutating DATABASE_URL and re-importing the module) do not work.
//
// This is a real jest test against the actual `boomcard_test` database (the
// same one tests/setup.ts already prepares) -- it is NOT a unit test with a
// mocked Prisma client. It creates its own throwaway schema, migrates it, and
// drops it again in `afterAll`, so it is safe to run repeatedly and safe
// under BC-QA-036-style concurrent test runs (the schema name is randomized
// per run).

import { execSync } from 'child_process';
import path from 'path';
import { Client, Pool } from 'pg';
import { createScratchSchemaClient, prisma } from '../../src/lib/prisma';

describe('BC-QA-037: createScratchSchemaClient gives real runtime-query isolation', () => {
  const schemaName = `bcqa037_scratch_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const baseUrl = process.env.DATABASE_URL as string; // set by tests/setup.ts from .env.test
  let rawPool: Pool;

  beforeAll(() => {
    // Documented step 1 of the usage convention: migrate the scratch schema.
    // This already worked before this fix (Prisma's migration CLI has always
    // honored `?schema=`) -- included here so the test is a full end-to-end
    // proof of the documented two-step convention, not just step 2 in
    // isolation.
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: `${baseUrl}&schema=${schemaName}` },
    });
    rawPool = new Pool({ connectionString: baseUrl });
  }, 60000);

  afterAll(async () => {
    await rawPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await rawPool.end();
  });

  test('a write through createScratchSchemaClient() lands in the scratch schema, not public', async () => {
    const scratchClient = createScratchSchemaClient(schemaName);
    const marker = `bcqa037-${Date.now()}`;
    try {
      const user = await scratchClient.user.create({
        data: {
          id: marker,
          email: `${marker}@example.com`,
          passwordHash: 'hashed',
          firstName: 'Scratch',
          lastName: 'Schema',
          phone: `+35950${Date.now()}`,
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      expect(user.id).toBe(marker);

      // Verify via raw SQL against the SCRATCH schema, bypassing Prisma
      // entirely -- this is the ground truth for "did the write really land
      // there".
      const inScratch = await rawPool.query(`SELECT id FROM "${schemaName}"."User" WHERE id = $1`, [
        marker,
      ]);
      expect(inScratch.rows).toHaveLength(1);

      // And confirm it did NOT also leak into the shared public schema of
      // boomcard_test -- the exact failure mode this task exists to close.
      const inPublic = await rawPool.query('SELECT id FROM "public"."User" WHERE id = $1', [marker]);
      expect(inPublic.rows).toHaveLength(0);
    } finally {
      await scratchClient.$disconnect();
    }
  }, 30000);

  test('BC-QA-037 impl-r1 MEDIUM #1 fix: a connection whose `SET search_path` fails is discarded, never silently reused', async () => {
    // Own scratch schema so a *recovered* second write below has somewhere
    // valid to land, independent of the other tests in this file.
    const failSchemaName = `bcqa037_scratch_failset_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: `${baseUrl}&schema=${failSchemaName}` },
    });

    // Force exactly the FIRST `SET search_path` statement issued by
    // `buildPool`'s `onConnect` hook (src/lib/prisma.ts) to reject -- this
    // simulates a transient failure of that specific statement without
    // touching the underlying TCP connection at all, so it isolates the
    // "SET succeeded on the wire but rejected as a SQL error" case the
    // MEDIUM #1 fix targets. Restored in `finally` so it can never leak
    // into another test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalQuery = (Client.prototype as any).query;
    let forcedFailureTriggered = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Client.prototype as any).query = function (...args: unknown[]) {
      const first = args[0] as string | { text?: string } | undefined;
      const text = typeof first === 'string' ? first : first?.text;
      if (!forcedFailureTriggered && typeof text === 'string' && text.startsWith('SET search_path')) {
        forcedFailureTriggered = true;
        return Promise.reject(new Error('BC-QA-037 test: forced SET search_path failure'));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalQuery.apply(this, args as any);
    };

    let scratchClient: ReturnType<typeof createScratchSchemaClient> | undefined;
    try {
      scratchClient = createScratchSchemaClient(failSchemaName);
      const marker1 = `bcqa037-failset-${Date.now()}`;

      // Call #1: this call's physical connection has its `SET search_path`
      // forced to fail. Fail-closed means this call must surface a clear
      // error -- not silently succeed against the wrong schema.
      await expect(
        scratchClient.user.create({
          data: {
            id: marker1,
            email: `${marker1}@example.com`,
            passwordHash: 'hashed',
            firstName: 'Scratch',
            lastName: 'FailSet',
            phone: `+35952${Date.now()}`,
            role: 'USER',
            status: 'ACTIVE',
          },
        }),
      ).rejects.toBeTruthy();

      expect(forcedFailureTriggered).toBe(true);

      // Confirm the failed write did not silently land in `public` either --
      // the connection was discarded mid-query, not reused with the wrong
      // search_path.
      const marker1InPublic = await rawPool.query('SELECT id FROM "public"."User" WHERE id = $1', [marker1]);
      expect(marker1InPublic.rows).toHaveLength(0);

      // Call #2: the monkeypatch only rejects the FIRST `SET search_path`
      // (guarded by `forcedFailureTriggered`), so this call's SET succeeds.
      // Before the MEDIUM #1 fix, the first connection's failed `SET` was
      // silently logged and the connection still returned to the idle pool
      // -- and since 'connect' only fires once per NEW physical connection
      // (never again for an already-open one), reusing that same poisoned
      // connection here would silently write to `public` again instead of
      // the scratch schema. Landing correctly in the scratch schema proves
      // the pool discarded the bad connection and opened a genuinely fresh
      // one for this call.
      const marker2 = `bcqa037-failset-recovered-${Date.now()}`;
      const user2 = await scratchClient.user.create({
        data: {
          id: marker2,
          email: `${marker2}@example.com`,
          passwordHash: 'hashed',
          firstName: 'Scratch',
          lastName: 'Recovered',
          phone: `+35953${Date.now()}`,
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      expect(user2.id).toBe(marker2);

      const marker2InScratch = await rawPool.query(`SELECT id FROM "${failSchemaName}"."User" WHERE id = $1`, [
        marker2,
      ]);
      expect(marker2InScratch.rows).toHaveLength(1);
      const marker2InPublic = await rawPool.query('SELECT id FROM "public"."User" WHERE id = $1', [marker2]);
      expect(marker2InPublic.rows).toHaveLength(0);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Client.prototype as any).query = originalQuery;
      await scratchClient?.$disconnect();
      await rawPool.query(`DROP SCHEMA IF EXISTS "${failSchemaName}" CASCADE`);
    }
  }, 30000);

  test('regression: the default `prisma` singleton (no schema override) still writes to public', async () => {
    const marker = `bcqa037-default-${Date.now()}`;
    try {
      const user = await prisma.user.create({
        data: {
          id: marker,
          email: `${marker}@example.com`,
          passwordHash: 'hashed',
          firstName: 'Default',
          lastName: 'Schema',
          phone: `+35951${Date.now()}`,
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      expect(user.id).toBe(marker);

      const inPublic = await rawPool.query('SELECT id FROM "public"."User" WHERE id = $1', [marker]);
      expect(inPublic.rows).toHaveLength(1);
    } finally {
      await prisma.user.deleteMany({ where: { id: marker } }).catch(() => {});
    }
  });

  test('concurrent queries through one scratch client land in the scratch schema without cross-contamination', async () => {
    const scratchClient = createScratchSchemaClient(schemaName);

    try {
      // Create multiple users concurrently via Promise.all
      // Use distinct markers to prevent id collisions
      const markerBase = `bcqa037-concurrent-${Date.now()}`;
      const markers = Array.from({ length: 5 }, (_, i) => `${markerBase}-${i}`);

      const results = await Promise.all(
        markers.map((marker) =>
          scratchClient.user.create({
            data: {
              id: marker,
              email: `${marker}@example.com`,
              passwordHash: 'hashed',
              firstName: 'Concurrent',
              lastName: 'Test',
              phone: `+3595${marker.charCodeAt(marker.length - 1)}${Date.now() % 100000}`,
              role: 'USER',
              status: 'ACTIVE',
            },
          }),
        ),
      );

      // Verify all concurrent creates succeeded
      expect(results).toHaveLength(markers.length);
      markers.forEach((marker, i) => {
        expect(results[i].id).toBe(marker);
      });

      // Verify all landed in the scratch schema, not public
      for (const marker of markers) {
        const inScratch = await rawPool.query(`SELECT id FROM "${schemaName}"."User" WHERE id = $1`, [
          marker,
        ]);
        expect(inScratch.rows).toHaveLength(1);

        const inPublic = await rawPool.query('SELECT id FROM "public"."User" WHERE id = $1', [marker]);
        expect(inPublic.rows).toHaveLength(0);
      }
    } finally {
      await scratchClient.$disconnect();
    }
  }, 30000);

  test('BC-QA-037 impl-r1 MEDIUM #2 fix: soft-deleted users are excluded from findMany and findFirst', async () => {
    const scratchClient = createScratchSchemaClient(schemaName);

    try {
      // Create two users: one active, one to be soft-deleted
      const activeMarker = `bcqa037-softdelete-active-${Date.now()}`;
      const deletedMarker = `bcqa037-softdelete-deleted-${Date.now()}`;

      const activeUser = await scratchClient.user.create({
        data: {
          id: activeMarker,
          email: `${activeMarker}@example.com`,
          passwordHash: 'hashed',
          firstName: 'Active',
          lastName: 'User',
          phone: `+35950${Date.now()}`,
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      expect(activeUser.id).toBe(activeMarker);

      const deletedUser = await scratchClient.user.create({
        data: {
          id: deletedMarker,
          email: `${deletedMarker}@example.com`,
          passwordHash: 'hashed',
          firstName: 'Deleted',
          lastName: 'User',
          phone: `+35951${Date.now()}`,
          role: 'USER',
          status: 'ACTIVE',
        },
      });
      expect(deletedUser.id).toBe(deletedMarker);

      // Soft-delete one user by setting deletedAt
      const deletedTime = new Date();
      await scratchClient.user.update({
        where: { id: deletedMarker },
        data: { deletedAt: deletedTime },
      });

      // findMany should exclude soft-deleted users by default
      const foundMany = await scratchClient.user.findMany({
        where: {
          id: {
            in: [activeMarker, deletedMarker],
          },
        },
        orderBy: { id: 'asc' },
      });
      expect(foundMany).toHaveLength(1);
      expect(foundMany[0].id).toBe(activeMarker);
      expect(foundMany[0].deletedAt).toBeNull();

      // findFirst should exclude soft-deleted users by default
      const foundFirst = await scratchClient.user.findFirst({
        where: { id: deletedMarker },
      });
      expect(foundFirst).toBeNull();

      // Explicitly querying for deleted rows (via `deletedAt: { not: null }`)
      // should return them, proving the withSoftDelete extension respects
      // explicit deletedAt filters
      const foundDeletedMany = await scratchClient.user.findMany({
        where: {
          id: deletedMarker,
          deletedAt: { not: null },
        },
      });
      expect(foundDeletedMany).toHaveLength(1);
      expect(foundDeletedMany[0].id).toBe(deletedMarker);
      expect(foundDeletedMany[0].deletedAt).not.toBeNull();
    } finally {
      await scratchClient.$disconnect();
    }
  }, 30000);
});
