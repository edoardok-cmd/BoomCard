# Integration Test Database Schema Fix

## Problem Statement

Integration tests were failing with errors like:
```
The column `totpRecoveryCodes of relation User` does not exist in the current database.
```

This occurs when:
1. A new field is added to `prisma/schema.prisma` (e.g., `totpRecoveryCodes`)
2. A migration is created to add the corresponding database column
3. Tests are run, but the migration hasn't been deployed to the test database yet
4. Prisma tries to use the field and fails with "column does not exist"

## Root Cause

The test database (`boomcard_test`) wasn't automatically synchronized with the current schema during test setup. This created a scenario where:
- The Prisma schema was up-to-date
- The production database was up-to-date  
- But the local test database was stale

Tests rely on the database schema matching the Prisma schema, so this mismatch caused failures.

## Solution

### Changes Made

#### 1. **tests/setup.ts** — Auto-deploy migrations at test setup time

Added automatic Prisma migration deployment to the Jest setup file (`tests/setup.ts`). This ensures migrations are applied to the test database before any test files are loaded:

```typescript
// Load .env.test and set up environment...

import { execSync } from 'child_process';

// Deploy migrations to test database
if (process.env.NODE_ENV === 'test') {
  try {
    execSync('npx prisma migrate deploy', {
      cwd: __dirname.replace('/tests', ''),
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (error) {
    // Fail fast with helpful error message
    process.exit(1);
  }
}

// Continue with jest setup...
```

**Benefits:**
- Migrations run automatically when tests are invoked
- Fails fast with a helpful error message if migrations fail
- Test-only code (no production impact)
- Happens synchronously before any test files load

#### 2. **package.json** — Add test database management scripts

Two new npm scripts for manual database control:

```json
"test:setup": "NODE_ENV=test npx prisma migrate deploy",
"test:reset": "NODE_ENV=test npx prisma migrate reset --force"
```

**Usage:**
- `npm run test:setup` — Manually deploy pending migrations
- `npm run test:reset` — Reset test database to clean state (destructive)

#### 3. **TEST_SETUP.md** — Comprehensive documentation

Created a new guide covering:
- Quick start (how to set up test database)
- How the automatic migration system works
- Troubleshooting common issues
- CI/CD integration examples
- Development workflow when adding migrations

## How It Works

### Before Running Tests

```
npm test
```

### Jest Setup Flow

1. Jest loads `tests/setup.ts`
2. Environment is validated (`.env.test` exists, points to test database)
3. **NEW:** `prisma migrate deploy` runs automatically
   - Compares pending migrations against the test database
   - Applies any migrations that haven't been deployed
   - If all migrations are already deployed, this is a no-op
4. Jest loads test files and runs them
5. Tests use the now-synchronized database schema

### Example Scenario

**Scenario:** Adding a new field to User model

1. Developer adds `totpRecoveryCodes String[]` to `prisma/schema.prisma`
2. Developer runs `npm run db:migrate` to create a migration file
3. Migration is committed to git as `prisma/migrations/20260608120000_add_user_totp_recovery_codes/migration.sql`
4. Colleague pulls the changes
5. Colleague runs `npm test`
6. **NEW:** Migration automatically deploys to their test database
7. Tests run successfully using the new field

Without this fix, step 7 would fail with "column does not exist" because the test database wasn't migrated.

## Troubleshooting

### "column X does not exist" During Tests

This means the test database is out of sync. Fix it with:

```bash
npm run test:setup
```

### "database boomcard_test does not exist"

Create the test database:

```bash
createdb boomcard_test
npm run test:setup
```

### Migration Deployment Fails

See `TEST_SETUP.md` for detailed troubleshooting. Common causes:
- PostgreSQL not running
- Wrong DATABASE_URL in `.env.test`
- Test database network connectivity issue
- Migration conflict (rare)

## Files Modified

- `tests/setup.ts` — Added automatic migration deployment (lines 37-71)
- `package.json` — Added `test:setup` and `test:reset` scripts

## Files Created

- `TEST_SETUP.md` — Complete test database setup guide
- `INTEGRATION_TEST_FIX_SUMMARY.md` — This file

## Impact Assessment

### Testing
- ✅ No new test failures (fixes existing "column does not exist" failures)
- ✅ Integration tests can now use all schema fields without manual setup
- ✅ New tests like `bc-admin-contract-notify.integration.test.ts` will work correctly

### Development
- ✅ Automatic: `npm test` "just works"
- ✅ Manual control: `npm run test:setup` for explicit deployment
- ✅ Reset option: `npm run test:reset` for clean starts
- ✅ Helpful error messages if something goes wrong

### Production
- ✅ Zero impact — all changes are test-only
- ✅ No changes to source code or runtime behavior

## Next Steps

### For Developers

1. **Set up test database** (one-time):
   ```bash
   createdb boomcard_test
   npm run test:setup
   ```

2. **Run tests normally**:
   ```bash
   npm test
   ```
   Migrations will deploy automatically.

3. **If tests fail with schema errors**:
   ```bash
   npm run test:setup
   npm test
   ```

### For CI/CD Pipelines

Ensure the test database is created before running tests:

```yaml
# Example: GitHub Actions
- name: Set up test database
  run: |
    createdb boomcard_test || true
    npm run test:setup

- name: Run tests
  run: npm test
```

## See Also

- `TEST_SETUP.md` — Comprehensive test database documentation
- `prisma/migrations/` — All migration files
- `prisma/schema.prisma` — Current Prisma schema definition
