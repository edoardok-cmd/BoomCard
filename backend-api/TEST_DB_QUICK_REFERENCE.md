# Test Database Quick Reference

## One-Time Setup

```bash
# Create test database (if not exists)
createdb boomcard_test

# Deploy migrations
npm run test:setup

# Verify it worked
npm test
```

## Common Commands

| Task | Command |
|------|---------|
| Run tests | `npm test` |
| Run tests in watch mode | `npm test:watch` |
| Deploy migrations manually | `npm run test:setup` |
| Reset database to clean state | `npm run test:reset` |
| Check migration status | `NODE_ENV=test npx prisma migrate status` |
| Open Prisma Studio (test DB) | `NODE_ENV=test npx prisma studio` |

## Error: "column X does not exist"

Migrations haven't been deployed to test database.

**Fix:**
```bash
npm run test:setup
npm test
```

## Error: "database boomcard_test does not exist"

Test database doesn't exist.

**Fix:**
```bash
createdb boomcard_test
npm run test:setup
npm test
```

## Error: "connection refused"

PostgreSQL not running or wrong connection details.

**Fix:**
1. Verify PostgreSQL is running:
   ```bash
   pg_isready -h localhost -p 5432
   ```
   Should output: `accepting connections`

2. Verify `.env.test` has correct `DATABASE_URL`:
   ```bash
   cat .env.test | grep DATABASE_URL
   ```
   Should be: `postgresql://boomtest:boomtest@localhost:5432/boomcard_test?sslmode=disable`

3. Restart PostgreSQL if needed (varies by OS)

## Reset Everything to Clean State

```bash
npm run test:reset
npm test
```

**Warning:** This deletes all data in the test database.

## What Happens When You Run Tests

```
npm test
    ↓
Jest loads tests/setup.ts
    ↓
.env.test is loaded (DATABASE_URL = localhost test DB)
    ↓
✨ NEW: Prisma migrations deploy automatically ✨
    ↓
Environment variables validated
    ↓
Supertest persistent server configured
    ↓
Test files are loaded
    ↓
Tests run
```

The key difference: migrations now deploy at step 3, before any tests load. This ensures the database schema matches what the tests expect.

## Files

- **TEST_SETUP.md** — Comprehensive troubleshooting guide
- **INTEGRATION_TEST_FIX_SUMMARY.md** — Technical details of the fix
- **TEST_DB_QUICK_REFERENCE.md** — This file (quick commands)
- **.env.test** — Test database configuration
- **tests/setup.ts** — Auto-migration logic (lines 37-71)
- **package.json** — Test scripts (test:setup, test:reset)

## Learning More

For detailed information on:
- Test database setup → see **TEST_SETUP.md**
- How the fix works → see **INTEGRATION_TEST_FIX_SUMMARY.md**
- Prisma migrations → see prisma/migrations/ directory or [Prisma docs](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate)

## Need Help?

1. Check error message against "Error:" section above
2. Read TEST_SETUP.md "Troubleshooting" section
3. Verify .env.test exists and has correct DATABASE_URL
4. Verify PostgreSQL is running
5. Try: `npm run test:reset && npm test`
