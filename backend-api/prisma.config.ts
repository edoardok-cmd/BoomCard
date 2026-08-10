import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';
import fs from 'node:fs';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── GUARD: Prevent silent production database targeting for CLI commands ──────
//
// PROBLEM: Bare `npx prisma <command>` (migrate status, studio, etc.) unconditionally
// loads .env, which points to production Neon. A developer running `npm run db:studio`
// silently connects to production instead of local test DB.
//
// SOLUTION:
// 1. If DATABASE_URL is already in process.env (shell/CI/parent), it was explicitly
//    set and we respect it.
// 2. Otherwise, default to .env.test (safe fallback for CLI commands).
// 3. Load .env only if NODE_ENV=production (explicit signal).
// 4. Warn loudly if a production database is detected without NODE_ENV=production.
// 5. Tests override this by pre-loading .env.test in tests/setup.ts (before any imports).
//
// REVERSIBILITY: Revert by uncommenting the old single-line dotenv.config({ path: ... })
// and removing this guard block. The change is scoped to config loading only.

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATABASE_URL_EXPLICIT = process.env.DATABASE_URL; // Explicitly set in shell/CI/parent

let selectedEnvFile: string | null = null;
let envSource = 'unknown';

if (DATABASE_URL_EXPLICIT) {
  // DATABASE_URL was explicitly set in process.env (shell, CI, or parent process).
  // Respect it without loading any .env file.
  envSource = 'process.env (explicitly set in shell/CI)';
  // Don't load any .env file; use the explicit value.
} else if (IS_PRODUCTION) {
  // NODE_ENV=production is an explicit signal to load .env for production.
  selectedEnvFile = '.env';
  envSource = 'NODE_ENV=production (explicit .env)';
} else {
  // Development, test, or unknown context — default to test DB for safety.
  // This catches bare CLI commands like `npm run db:studio` and `npx prisma migrate status`.
  selectedEnvFile = '.env.test';
  envSource = 'default (test DB for safety)';
}

// Load the selected .env file, or skip if DATABASE_URL was explicit.
if (selectedEnvFile && fs.existsSync(path.join(__dirname, selectedEnvFile))) {
  dotenv.config({ path: path.join(__dirname, selectedEnvFile) });
}

const databaseUrl = process.env.DATABASE_URL;

// Safety: Warn if a production database is detected without NODE_ENV=production
if (databaseUrl && !IS_PRODUCTION) {
  const looksLikeProduction = databaseUrl.includes('neon.tech') || databaseUrl.includes('-pooler');

  if (looksLikeProduction) {
    // Extract safe parts of the connection string (hostname + database) without credentials
    let safeDbInfo = 'postgresql://***@***';
    try {
      const dbUrl = new URL(databaseUrl);
      // Construct safe representation: hostname + database path, no credentials
      safeDbInfo = `postgresql://***@${dbUrl.hostname}${dbUrl.pathname}`;
    } catch {
      // If URL parsing fails, use fallback (never expose raw credentials)
      safeDbInfo = 'postgresql://***@***';
    }

    // Red loud warning so developers see it before running destructive commands
    console.error(
      '\n' +
        '╔════════════════════════════════════════════════════════════════╗\n' +
        '║  ⚠️  PRODUCTION DATABASE DETECTED — NO NODE_ENV=production    ║\n' +
        '╚════════════════════════════════════════════════════════════════╝\n' +
        '\n' +
        `Database: ${safeDbInfo}\n` +
        `Config source: ${envSource}\n` +
        '\n' +
        'This is a PRODUCTION database (Neon pooler detected).\n' +
        'Running Prisma commands without NODE_ENV=production is risky.\n' +
        '\n' +
        'For production operations, FIRST set:\n' +
        '  export NODE_ENV=production\n' +
        'Then run your prisma command again.\n' +
        '\n' +
        'For development/testing, use the test database:\n' +
        '  .env.test should define: DATABASE_URL=postgresql://...localhost/boomcard_test\n' +
        '\n',
    );
  }
}

// Hard error if no database URL is available
if (!databaseUrl) {
  console.error(
    '\n' +
      '╔════════════════════════════════════════════════════════════════╗\n' +
      '║  ERROR: DATABASE_URL not found                                ║\n' +
      '╚════════════════════════════════════════════════════════════════╝\n' +
      '\n' +
      'The following were checked:\n' +
      '  1. process.env.DATABASE_URL (shell/CI/parent) — NOT SET\n' +
      `  2. ${selectedEnvFile || '.env'} file — NOT FOUND or empty\n` +
      '\n' +
      'Fix: Create .env.test with a test database URL:\n' +
      '  DATABASE_URL="postgresql://boomtest:boomtest@localhost:5432/boomcard_test?sslmode=disable"\n' +
      '\n' +
      'Or set DATABASE_URL in your shell before running prisma:\n' +
      '  export DATABASE_URL="postgresql://..."\n' +
      '  npx prisma migrate status\n' +
      '\n',
  );
  process.exit(1);
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  // Datasource URL for db push and all db commands
  datasource: {
    url: databaseUrl,
  },

  // URL for migrations (prisma migrate deploy/status/resolve)
  migrate: {
    url: databaseUrl,
  },

  seed: {
    command: 'npx ts-node prisma/seed.ts',
  },
});
