# Prisma Config Production Targeting Fix (BC-QA-038)

## Problem Statement

**The Issue:** Running bare `npx prisma <command>` from `backend-api/` would unconditionally load `.env`, which points to the **production Neon database**. This meant that developers running commands like:

```bash
npm run db:studio        # Opens Prisma Studio
npx prisma migrate status
npx prisma db push
```

...would silently operate against production data without any warning or safeguard.

**Impact:**
- Destructive commands like `migrate deploy` or `db reset` could modify production
- Non-destructive commands expose production data to developers
- No indication to the user that they're targeting production

**Example of the Risk:**
```bash
# Developer runs this, thinking they're working locally:
npm run db:studio

# Prisma loads .env → connects to production Neon pooler
# Developer now has access to production data through Studio
# A mistake could destroy production records
```

## Solution Implemented

Modified `prisma.config.ts` to implement a three-tier database selection strategy:

### 1. **Explicit Process Environment (Highest Priority)**
If `DATABASE_URL` is already set in `process.env` (shell/CI/parent process), use it as-is.

```bash
# CI/production operations
export DATABASE_URL="postgresql://..."
export NODE_ENV=production
npx prisma migrate deploy  # Uses explicit DATABASE_URL
```

### 2. **NODE_ENV=production Signal**
If `NODE_ENV=production` is set, load `.env` (which contains production DB).

```bash
# Safe production operations with explicit signal
export NODE_ENV=production
npx prisma migrate status  # Loads .env (production)
```

### 3. **Default to Test Database (Safest)**
If neither condition above is met, load `.env.test` (local test DB on localhost).

```bash
# Bare CLI commands default to test DB
npx prisma migrate status  # Loads .env.test → localhost:5432/boomcard_test
npm run db:studio         # Loads .env.test → localhost:5432/boomcard_test
```

### 4. **Loud Warning if Production Detected**
If a production database is detected WITHOUT `NODE_ENV=production`, a red warning is printed:

```
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  PRODUCTION DATABASE DETECTED — NO NODE_ENV=production    ║
╚════════════════════════════════════════════════════════════════╝

Database: postgresql://user:pass@ep-old-salad-agie89z3-pooler...
Config source: process.env (explicitly set in shell/CI)

This is a PRODUCTION database (Neon pooler detected).
Running Prisma commands without NODE_ENV=production is risky.
```

## Behavior Matrix

| Scenario | DATABASE_URL | NODE_ENV | .env.test Exists? | Result | Behavior |
|----------|--------------|----------|-------------------|--------|----------|
| **Bare CLI** | unset | unset | ✓ | Load .env.test | → localhost:5432 (SAFE) |
| **Bare CLI** | unset | test | ✓ | Load .env.test | → localhost:5432 (SAFE) |
| **Bare CLI** | unset | production | ✗ | Load .env | → Neon prod (production) |
| **CI deploy** | set to prod | production | ignored | Use explicit | → Neon prod (SAFE) |
| **CI deploy** | set to prod | unset | ignored | Use explicit + WARN | → Neon prod (WARNED) |
| **Test suite** | pre-loaded | test | ✓ | Use pre-loaded | → localhost:5432 (SAFE) |

## Usage Examples

### Safe Development Usage

```bash
# All of these safely default to test database:
cd backend-api

npx prisma migrate status
npx prisma db push
npx prisma studio
npm run db:studio
npm run db:migrate dev
```

### Safe Production Usage (CI/Deployment)

```bash
# Explicit signals required:
export NODE_ENV=production
export DATABASE_URL="postgresql://..."  # (optional, from CI env)
npx prisma migrate deploy

# OR with explicit env in CI:
DATABASE_URL="postgresql://..." NODE_ENV=production npx prisma migrate deploy
```

### Test Suite (Unchanged)

```bash
# Tests automatically pre-load .env.test in tests/setup.ts
# No changes needed:
npm test

# Or explicit test setup:
npm run test:setup    # NODE_ENV=test npx prisma migrate deploy
npm run test:reset    # NODE_ENV=test npx prisma migrate reset
```

## Files Changed

- **`prisma.config.ts`** — Added guard logic to detect and prevent silent production targeting
  - ~140 lines of guarded loading + warnings
  - Fully commented for maintainability
  - Reversible by removing guard block

## Reversibility

To revert this fix, restore the original `prisma.config.ts`:

```typescript
// OLD (unsafe) single-line approach:
dotenv.config({ path: path.join(__dirname, '.env') });
```

The guard block is self-contained and can be safely removed without affecting tests/setup.ts or src/lib/prisma.ts.

## Testing the Fix

### Test 1: Bare CLI defaults to test DB
```bash
cd backend-api
unset NODE_ENV
npx prisma migrate status
# Output should show: PostgreSQL database "boomcard_test" ... at "localhost:5432"
```

### Test 2: NODE_ENV=test uses test DB
```bash
cd backend-api
NODE_ENV=test npx prisma migrate status
# Output should show: PostgreSQL database "boomcard_test" ... at "localhost:5432"
```

### Test 3: NODE_ENV=production loads .env
```bash
cd backend-api
NODE_ENV=production npx prisma migrate status
# Output should show: PostgreSQL database "boomcard" ... at "ep-old-salad-agie89z3-pooler..."
# (Connection may fail if not on Neon network, but DB name/host should be production)
```

### Test 4: Explicit DATABASE_URL with warning
```bash
cd backend-api
DATABASE_URL="postgresql://user:pass@ep-old-salad-agie89z3-pooler.c-2.eu-central-1.aws.neon.tech/boomcard?sslmode=require" npx prisma migrate status
# Output should show LOUD RED WARNING about production database
```

### Test 5: Explicit DATABASE_URL + NODE_ENV=production (no warning)
```bash
cd backend-api
DATABASE_URL="postgresql://user:pass@ep-old-salad-agie89z3-pooler.c-2.eu-central-1.aws.neon.tech/boomcard?sslmode=require" NODE_ENV=production npx prisma migrate status
# Output should NOT show warning (production operations are explicit)
```

### Test 6: Test suite still works
```bash
cd backend-api
npm test -- --testNamePattern="sometest" --forceExit
# Should use localhost database (via tests/setup.ts pre-loading .env.test)
```

## Safety Guarantees

1. ✅ **No Silent Production Targeting** — Bare CLI commands default to localhost
2. ✅ **Loud Warnings** — Production operations without NODE_ENV=production are flagged
3. ✅ **Tests Unaffected** — tests/setup.ts pre-loads .env.test before any config
4. ✅ **Production Safe** — NODE_ENV=production + explicit DATABASE_URL is fully honored
5. ✅ **CI/CD Friendly** — Explicit DATABASE_URL in shell is respected

## Environment Files Reference

### `.env` (Production)
- DATABASE_URL points to Neon pooler (ep-old-salad-agie89z3-pooler...)
- Used only when NODE_ENV=production

### `.env.test` (Test Database)
- DATABASE_URL points to localhost:5432/boomcard_test
- Used as fallback for all other cases
- Pre-loaded by tests/setup.ts for jest

### `.env.local` (Optional Local Override)
- Not loaded by prisma.config.ts
- Can be used by src/lib/prisma.ts if needed for dev server

## Impact Assessment

- **No breaking changes** — All existing safe workflows continue unchanged
- **Improved safety** — Unsafe workflows now default to safe behavior
- **Better visibility** — Red warnings make production operations obvious
- **Fully reversible** — Can be reverted by removing guard block
