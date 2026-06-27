# Permissions & RBAC Seeding Guide

## Overview

The BoomCard backend uses two-step RBAC seeding to ensure the database is properly initialized with all permissions and admin roles before any admin users are created.

## Critical Fixes (Round 2)

### CRITICAL FIX 1: seedPermissions() Now Called from prisma/seed.ts

**Problem:** `seedPermissions()` was defined in `prisma/seed-permissions.ts` but was NEVER called from the main seed script. This meant:
- After `npm run db:seed` or `npm run db:reset`, the SUPER_ADMIN AdminRole row did NOT exist
- The approval handler at `src/routes/admin/adminAdmins.routes.ts:785` would return HTTP 500
- Production deployments would have a broken SUPER_ADMIN approval flow

**Fix:** Modified `prisma/seed.ts` to import and call `seedPermissions()` BEFORE creating admin users.

```typescript
// prisma/seed.ts
import { seedPermissions } from '../src/services/permission.service';

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Step 1: Seed RBAC permissions and roles (CRITICAL: must run before creating admin users)
  console.log('⚙️  Seeding permissions and admin roles...');
  await seedPermissions();
  console.log('✅ Permissions and roles seeded.\n');

  // Step 2: Create admin user (now SUPER_ADMIN role exists)
  // ... rest of seed logic
}
```

### CRITICAL FIX 2: tests/setup.ts Now Calls seedPermissions() in beforeAll

**Problem:** Integration tests like `bc-admin-spec-reaudit2-sa-approve-initiator.test.ts` depend on the SUPER_ADMIN role existing in the database. If seedPermissions() was not called during test DB setup, those tests would fail with "SUPER_ADMIN role not found".

**Fix:** Added `seedPermissions()` call to `tests/setup.ts` beforeAll hook:

```typescript
// tests/setup.ts beforeAll
beforeAll(async () => {
  await prisma.$connect();

  // Seed RBAC permissions and admin roles
  const { seedPermissions } = await import('../src/services/permission.service');
  await seedPermissions();
});
```

This is **idempotent** — calling it multiple times is safe, and it's required for integration tests to work.

### HIGH FIX: Added Comprehensive Integration Test

**Problem:** The unit test for seedPermissions used mocks and did NOT verify:
- Full dual-approval cycle works end-to-end
- Self-approval is properly rejected (403)
- DELETE endpoint works and doesn't return 404

**Fix:** Added `tests/bc-admin-spec-reaudit6-superadmin-seeds-e2e.test.ts` with real HTTP integration tests covering:
1. SUPER_ADMIN role infrastructure seeded correctly
2. Full dual-approval cycle: SA#1 initiates, SA#2 approves → 201 ACTIVE
3. Self-approval refusal: same SA cannot approve own request → 403
4. DELETE /admins/:id/roles/SUPER_ADMIN works (200, not 404)
5. Approval handler finds SUPER_ADMIN without 500 error

### MEDIUM FIX: npm Script Documentation

Added `db:seed:permissions` npm script to `package.json` for clarity:

```json
{
  "scripts": {
    "db:seed": "ts-node prisma/seed.ts",
    "db:seed:permissions": "npx tsx prisma/seed-permissions.ts",
    "db:reset": "prisma migrate reset --force && npm run db:seed"
  }
}
```

Note: `db:seed` now automatically runs seedPermissions() (no separate step needed).

---

## How It Works Now

### Development / Local Setup

```bash
# Reset local database and seed everything (permissions + sample data)
npm run db:reset

# Or, step by step:
npx prisma migrate reset --force   # Clear schema and re-run migrations
npm run db:seed                    # Seeds permissions, roles, and sample offers
```

### CI / Deployment

1. **Migrations deploy** (`prisma migrate deploy`)
   - Runs all pending migrations against the target database

2. **Seed on reset** (via `npm run db:reset`)
   - Calls `npm run db:seed`
   - Which imports and calls `seedPermissions()` first
   - Then creates sample users and offers

### Integration Tests

```bash
npm test
# Tests run with NODE_ENV=test:
#   1. test/setup.ts deploys migrations to test DB
#   2. beforeAll calls seedPermissions() (idempotent)
#   3. Each test file gets fresh SUPER_ADMIN role, ADMIN role with permissions, etc.
```

---

## Seeding Flow Diagram

```
db:reset (or CI deploy)
  └─ prisma migrate reset --force
      └─ Recreates schema from migrations
  └─ npm run db:seed
      └─ prisma/seed.ts main()
          ├─ seedPermissions()
          │   ├─ Upserts all Permission rows (dashboard.read, admins.write, etc.)
          │   ├─ Upserts AdminRole rows: ADMIN, SUPPORT, FINANCE, RISK_REVIEW, PARTNER_MANAGER, SUPER_ADMIN
          │   ├─ For each role in ROLE_DEFAULT_ALLOWS, creates RolePermission rows
          │   └─ SUPER_ADMIN gets ZERO RolePermission rows (it bypasses requirePermission)
          ├─ Create admin user (admin@boomcard.bg)
          │   └─ Assign ADMIN role via UserAdminRole
          └─ Create sample partner users and offers
```

---

## Key Invariants

### SUPER_ADMIN Role

- **Must exist** after ANY seed operation (db:seed, db:reset, CI migrations)
- **Has zero permissions** granted (no RolePermission rows)
- **Bypassed** in `requirePermission()` middleware — SUPER_ADMIN users can do anything
- **Cannot be created** without dual approval (different SUPER_ADMIN must approve)
- **Bootstrap exception** — if sole SUPER_ADMIN exists, they can approve their own second-SA request

### ADMIN and Other Roles

- **Have explicit permissions** assigned via RolePermission rows
- **Created idempotently** by seedPermissions() using upsert
- **Do NOT bypass** requirePermission() — they must have explicit permission for each action

### Database Invariants

```sql
-- After seed, these must all exist:
SELECT key FROM "AdminRole" 
WHERE key IN ('ADMIN', 'SUPER_ADMIN', 'SUPPORT', 'FINANCE', 'RISK_REVIEW', 'PARTNER_MANAGER');
-- Result: 6 rows

-- SUPER_ADMIN has no permissions:
SELECT COUNT(*) FROM "RolePermission" 
WHERE "roleId" = (SELECT id FROM "AdminRole" WHERE key = 'SUPER_ADMIN');
-- Result: 0

-- ADMIN has multiple permissions:
SELECT COUNT(*) FROM "RolePermission" 
WHERE "roleId" = (SELECT id FROM "AdminRole" WHERE key = 'ADMIN');
-- Result: 40+ permissions
```

---

## Troubleshooting

### Error: "SUPER_ADMIN role not found in DB — run seed-permissions first"

This means `seedPermissions()` was NOT called. Solutions:

1. **For development**: Run `npm run db:reset`
   ```bash
   npm run db:reset  # Migrations + seed everything
   ```

2. **For existing database**: Manually seed permissions:
   ```bash
   npm run db:seed:permissions
   ```

3. **For CI/deployment**: Ensure your deployment script runs migrations + seed:
   ```bash
   npx prisma migrate deploy && npm run db:seed
   ```

### Error in integration tests: "SUPER_ADMIN role not found"

This means `tests/setup.ts` beforeAll was not called or seedPermissions() failed silently.

Solutions:

1. Verify `.env.test` exists and DATABASE_URL points to test DB
2. Run migrations first: `npm run test:setup`
3. Check if seedPermissions() is throwing an error in test logs

```bash
npm test 2>&1 | grep -i "permission"
```

---

## For Developers: When to Call seedPermissions()

You should call `seedPermissions()` when:

1. **Adding new permissions** to the catalog
   - Add entry to the `PERMISSIONS_CATALOG` in `permission.service.ts`
   - Run `npm run db:seed:permissions` to sync existing database

2. **Changing role defaults**
   - Modify `ROLE_DEFAULT_ALLOWS` in `permission.service.ts`
   - Run `npm run db:seed:permissions` to update role assignments

3. **After pulling new migrations**
   - Run `npm run db:reset` (or just `npm run db:seed:permissions` on existing DB)

**Remember:** seedPermissions() is idempotent — calling it multiple times is safe and recommended when permissions structure changes.

---

## Files Modified (Round 2 Fixes)

- `prisma/seed.ts` — Now calls `seedPermissions()` before creating admin users
- `tests/setup.ts` — Added `seedPermissions()` call in beforeAll hook
- `package.json` — Added `db:seed:permissions` script for manual sync
- `tests/bc-admin-spec-reaudit6-superadmin-seeds-e2e.test.ts` — New integration test covering full flow

## Related Tasks

- BC-ADMIN-SPEC-REAUDIT6-SUPERADMIN-APPROVE-500 (unit test)
- bc-admin-spec-reaudit2-sa-approve-initiator (integration test)
