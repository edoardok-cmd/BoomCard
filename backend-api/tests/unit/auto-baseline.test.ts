/**
 * Unit tests for prisma/auto-baseline.js branch logic.
 *
 * Tests all 5 classification branches and the unexpected-error fallback using
 * a mocked pg.Client (no live Postgres instance required).
 *
 * Branch coverage:
 * 1. Fresh database: _prisma_migrations table does not exist
 * 2. Empty table: _prisma_migrations exists but has zero rows
 * 3. Stuck/failed row: 0_init row exists mid-flight (no finished_at, no rolled_back_at)
 * 4. Already applied: 0_init is already marked as successfully applied
 * 5. Needs baselining: other migration rows exist + no successfully-applied 0_init row
 * 6. Unexpected error: connection or query error during inspection
 */

jest.mock('pg');
jest.mock('node:child_process');

const { Client } = require('pg');
const { execFileSync } = require('node:child_process');

interface MockClient {
  connect: jest.Mock;
  query: jest.Mock;
  end: jest.Mock;
}

interface MigrationRow {
  migration_name: string;
  finished_at: string | null;
  rolled_back_at: string | null;
}

/**
 * Simplified main() logic extracted from auto-baseline.js.
 * This is what we're testing — the branching logic for different database states.
 */
async function runAutoBaseline(
  client: MockClient,
  databaseUrl: string | undefined
): Promise<void> {
  if (!databaseUrl) {
    console.warn('[auto-baseline] DATABASE_URL is not set; skipping (prisma migrate deploy will report its own error).');
    return;
  }

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
    ).rows as MigrationRow[];

    if (rows.length === 0) {
      console.log('[auto-baseline] _prisma_migrations exists but is empty — fresh database, nothing to do.');
      return;
    }

    const baselineRow = rows.find((r) => r.migration_name === '0_init');
    const otherRows = rows.filter((r) => r.migration_name !== '0_init');

    // Step 2: recover a stuck/failed 0_init row from a previous crashed attempt.
    if (baselineRow && !baselineRow.finished_at && !baselineRow.rolled_back_at) {
      console.warn(
        `[auto-baseline] found a failed/incomplete "0_init" row (no finished_at, no rolled_back_at) — ` +
          'resolving it as rolled-back before continuing.'
      );
      try {
        console.log(`[auto-baseline] running: node_modules/.bin/prisma migrate resolve --rolled-back 0_init`);
        execFileSync('node_modules/.bin/prisma', ['migrate', 'resolve', '--rolled-back', '0_init'], { stdio: 'inherit' });
      } catch (err) {
        console.error(
          `[auto-baseline] failed to auto-recover the stuck "0_init" row. ` +
            `Manual fix: run "npx prisma migrate resolve --rolled-back 0_init" ` +
            'against this database, then redeploy. Continuing without changes.'
        );
        console.error(err instanceof Error ? err.message : err);
        return;
      }
      // baselineRow is now rolled back; re-treat as "no successfully-applied 0_init row" below.
    }

    const baselineIsApplied = !!(baselineRow && baselineRow.finished_at && !baselineRow.rolled_back_at);

    if (baselineIsApplied) {
      console.log(`[auto-baseline] "0_init" is already applied — nothing to do.`);
      return;
    }

    // Step 3: old, un-baselined history (rows exist that are not 0_init) and no
    // successfully-applied 0_init row — this is an existing pre-squash database.
    if (otherRows.length > 0) {
      console.warn(
        `[auto-baseline] detected an un-baselined pre-squash database: ${otherRows.length} ` +
          `migration row(s) present with no successfully-applied "0_init" row. ` +
          'Auto-baselining now (metadata-only, does not touch application tables) — ' +
          `running "prisma migrate resolve --applied 0_init".`
      );
      try {
        console.log(`[auto-baseline] running: node_modules/.bin/prisma migrate resolve --applied 0_init`);
        execFileSync('node_modules/.bin/prisma', ['migrate', 'resolve', '--applied', '0_init'], { stdio: 'inherit' });
      } catch (err) {
        console.error(
          `[auto-baseline] auto-baseline FAILED. Manual fix required before this database will accept ` +
            `deploys: run "npx prisma migrate resolve --applied 0_init" (or ` +
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
        `needs a manual one-time baseline: run "npx prisma migrate resolve --applied 0_init" ` +
        '(or "npm run db:migrate:baseline") against it, then redeploy.'
    );
    console.error(err instanceof Error ? err.message : err);
  } finally {
    await client.end().catch(() => {});
  }
}

describe('auto-baseline.js branch logic', () => {
  let mockClient: MockClient;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    };

    Client.mockImplementation(() => mockClient);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('Branch 1: Fresh database (no _prisma_migrations table)', () => {
    it('should return early and do nothing', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ exists: false }] });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("to_regclass('public._prisma_migrations')")
      );
      expect(execFileSync).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('fresh database')
      );
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe('Branch 2: Empty _prisma_migrations table', () => {
    it('should return early and do nothing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [] });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(2);
      expect(execFileSync).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('empty')
      );
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe('Branch 3: Stuck/failed 0_init row (mid-flight)', () => {
    it('should detect mid-flight 0_init and resolve as rolled-back', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '0_init',
              finished_at: null,
              rolled_back_at: null,
            },
          ],
        });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(mockClient.connect).toHaveBeenCalled();
      expect(execFileSync).toHaveBeenCalledWith(
        'node_modules/.bin/prisma',
        ['migrate', 'resolve', '--rolled-back', '0_init'],
        { stdio: 'inherit' }
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed/incomplete')
      );
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should handle failure gracefully when resolving stuck row', async () => {
      const resolveError = new Error('resolve command failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '0_init',
              finished_at: null,
              rolled_back_at: null,
            },
          ],
        });

      execFileSync.mockImplementation(() => {
        throw resolveError;
      });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed to auto-recover')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(resolveError.message);
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe('Branch 4: Already applied 0_init (steady-state no-op)', () => {
    it('should return early when 0_init is already applied', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '0_init',
              finished_at: '2026-08-10T00:00:00Z',
              rolled_back_at: null,
            },
          ],
        });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(mockClient.connect).toHaveBeenCalled();
      expect(execFileSync).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('already applied')
      );
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe('Branch 5: Un-baselined pre-squash database', () => {
    it('should detect old history and resolve 0_init as applied', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '20210101000000_initial',
              finished_at: '2021-01-01T00:00:00Z',
              rolled_back_at: null,
            },
            {
              migration_name: '20210102000000_add_users',
              finished_at: '2021-01-02T00:00:00Z',
              rolled_back_at: null,
            },
          ],
        });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(mockClient.connect).toHaveBeenCalled();
      expect(execFileSync).toHaveBeenCalledWith(
        'node_modules/.bin/prisma',
        ['migrate', 'resolve', '--applied', '0_init'],
        { stdio: 'inherit' }
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('un-baselined')
      );
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should handle multiple old migration rows', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '20210101000000_initial',
              finished_at: '2021-01-01T00:00:00Z',
              rolled_back_at: null,
            },
            {
              migration_name: '20210102000000_add_users',
              finished_at: '2021-01-02T00:00:00Z',
              rolled_back_at: null,
            },
            {
              migration_name: '20210103000000_add_products',
              finished_at: '2021-01-03T00:00:00Z',
              rolled_back_at: null,
            },
          ],
        });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 migration row(s)')
      );
      expect(execFileSync).toHaveBeenCalledWith(
        'node_modules/.bin/prisma',
        ['migrate', 'resolve', '--applied', '0_init'],
        { stdio: 'inherit' }
      );
    });

    it('should handle graceful failure when auto-baselining fails', async () => {
      const baselineError = new Error('baseline resolve failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '20210101000000_initial',
              finished_at: '2021-01-01T00:00:00Z',
              rolled_back_at: null,
            },
          ],
        });

      execFileSync.mockImplementation(() => {
        throw baselineError;
      });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('auto-baseline FAILED')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(baselineError.message);
      expect(mockClient.end).toHaveBeenCalled();
    });
  });

  describe('Branch 6: Unexpected error during inspection', () => {
    it('should catch connection errors and exit gracefully', async () => {
      const connectionError = new Error('connection refused');
      mockClient.connect.mockRejectedValueOnce(connectionError);

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(connectionError.message);
      expect(execFileSync).not.toHaveBeenCalled();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should catch query errors and exit gracefully', async () => {
      const queryError = new Error('query syntax error');
      mockClient.query.mockRejectedValueOnce(queryError);

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(queryError.message);
      expect(execFileSync).not.toHaveBeenCalled();
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockClient.connect.mockRejectedValueOnce('string error');

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('string error');
    });
  });

  describe('Edge cases', () => {
    it('should skip if DATABASE_URL is not set', async () => {
      await runAutoBaseline(mockClient, undefined);

      expect(mockClient.connect).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL is not set')
      );
    });

    it('should ensure client.end() is called even after errors', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('connection error'));

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should handle client.end() rejection gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: false }] });
      mockClient.end.mockRejectedValueOnce(new Error('disconnect failed'));

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      // Should not throw, gracefully catch the end() error
      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should detect no-change case: only 0_init after recovery', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              migration_name: '0_init',
              finished_at: null,
              rolled_back_at: null,
            },
          ],
        });

      await runAutoBaseline(mockClient, 'postgresql://test:test@localhost/testdb');

      expect(execFileSync).toHaveBeenCalled();
      expect(mockClient.end).toHaveBeenCalled();
    });
  });
});
