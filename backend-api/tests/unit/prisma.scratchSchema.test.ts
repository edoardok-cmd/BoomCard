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
import { Pool } from 'pg';
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
});
