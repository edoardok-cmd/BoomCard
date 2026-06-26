# Test Database Setup Guide

## Overview

This document explains how to set up and maintain the test database for BoomCard backend integration tests. The test database must have all Prisma migrations applied before tests can run.

## Quick Start

### Initial Setup (one-time)

```bash
# 1. Create test database (if not exists)
createdb boomcard_test

# 2. Deploy all migrations to test database
npm run test:setup

# 3. Run tests
npm test
```

### Reset Test Database

If you need to reset the test database to a clean state:

```bash
npm run test:reset
```

**Warning:** This is destructive and will delete all data in the test database.

## How It Works

### Automatic Migration Deployment (via `tests/setup.ts`)

When you run `npm test`, Jest loads `tests/setup.ts` before running any test files. This setup file:

1. Loads `.env.test` to configure `DATABASE_URL` to point at the local test database
2. Validates that `DATABASE_URL` looks like a test database (contains `localhost`, `127.0.0.1`, or `_test`)
3. Runs `prisma migrate deploy` to ensure all pending migrations are applied

If migrations fail, the test run will abort with a descriptive error message. This prevents the common failure mode where tests use a Prisma field (e.g., `totpRecoveryCodes`) that hasn't been migrated to the test schema yet.

### Manual Migration Deployment

If you need to manually deploy migrations without running tests:

```bash
npm run test:setup
```

This is equivalent to:

```bash
NODE_ENV=test npx prisma migrate deploy
```

## Troubleshooting

### "column X does not exist" Errors

**Cause:** A migration that adds the column hasn't been deployed to the test database.

**Fix:**

```bash
npm run test:setup
```

### "database "boomcard_test" does not exist"

**Cause:** The test database hasn't been created yet.

**Fix:**

```bash
# Create the test database
createdb boomcard_test

# Deploy all migrations
npm run test:setup
```

### "could not connect to server: Connection refused"

**Cause:** PostgreSQL isn't running or isn't listening on the expected host/port.

**Fix:**

1. Check that PostgreSQL is running:

   ```bash
   pg_isready -h localhost -p 5432
   ```

   You should see `accepting connections`.

2. Verify `.env.test` has the correct `DATABASE_URL`:

   ```bash
   cat .env.test | grep DATABASE_URL
   ```

   Should be something like:

   ```
   DATABASE_URL="postgresql://boomtest:boomtest@localhost:5432/boomcard_test?sslmode=disable"
   ```

3. Restart PostgreSQL if needed (varies by OS and installation method).

### Migration Conflicts

If a migration can't be applied (e.g., due to a schema conflict), you have two options:

**Option 1: Reset to clean state** (destructive)

```bash
npm run test:reset
```

This drops all tables and re-applies all migrations from scratch.

**Option 2: Investigate the conflict** (safer)

1. Check migration history:

   ```bash
   NODE_ENV=test npx prisma migrate status
   ```

2. Look at the failing migration in `prisma/migrations/`

3. Manually resolve the conflict or adjust the migration, then re-run:

   ```bash
   npm run test:setup
   ```

## Test Database Configuration

The test database is configured in `.env.test`:

```env
DATABASE_URL="postgresql://boomtest:boomtest@localhost:5432/boomcard_test?sslmode=disable"
PORT=3025
NODE_ENV=test
JWT_SECRET=test-jwt-secret-local-only
JWT_REFRESH_SECRET=test-refresh-secret-local-only
COOKIE_SECRET=test-cookie-secret
FRONTEND_URL=http://localhost:19006
```

For CI/CD or non-standard setups, you can override `DATABASE_URL`:

```bash
# Example: use a remote test database
DATABASE_URL="postgresql://user:pass@remote-host:5432/boomcard_test" npm test
```

## CI/CD Integration

In CI/CD pipelines, ensure the test database is created and migrations are deployed before running tests:

```bash
# In your CI workflow (GitHub Actions, GitLab CI, etc.)
createdb boomcard_test || true  # Create if not exists
npm run test:setup              # Deploy migrations
npm test                        # Run tests (migrations auto-deploy again as safety)
```

## Development Workflow

### When Adding a New Migration

1. Create the migration:

   ```bash
   npm run db:migrate
   ```

   This creates a new migration file in `prisma/migrations/`.

2. Deploy to test database:

   ```bash
   npm run test:setup
   ```

3. Run tests to ensure the migration works:

   ```bash
   npm test
   ```

4. Commit both the migration file and any schema changes to version control.

### When Pulling Latest Changes

If a colleague added a new migration:

```bash
# Pull the latest migrations from git
git pull

# Deploy them to your test database
npm run test:setup

# Run tests
npm test
```

## Integration Tests and Schema Consistency

All integration tests expect the test database schema to match `prisma/schema.prisma`. The automatic migration deployment in `tests/setup.ts` ensures this by running `prisma migrate deploy` before any tests load.

This design prevents the entire class of "column does not exist" errors that occur when:

- A field is added to the Prisma schema (e.g., `totpRecoveryCodes`)
- A migration is created to add it to the database
- Tests are run before the migration is deployed to the test database
- Prisma tries to use the field and fails because the column doesn't exist yet

By running migrations at setup time (before any test files are loaded), we ensure the schema is always in sync.

## Related Files

- `.env.test` — Test database configuration
- `tests/setup.ts` — Jest setup file (contains migration logic)
- `prisma/schema.prisma` — Prisma schema definition
- `prisma/migrations/` — All migration files
- `package.json` — Test scripts (`test:setup`, `test:reset`)

## See Also

- [Prisma Migration Docs](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate)
- [PostgreSQL `createdb` Manual](https://www.postgresql.org/docs/current/app-createdb.html)
