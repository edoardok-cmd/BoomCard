# Runtime Verification Guide: BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1

This guide provides step-by-step instructions to verify the QR sync durability fix at runtime.

## Prerequisites

- PostgreSQL running on localhost:5432
- Test database: `boomcard_test` with credentials `boomtest:boomtest`
- Node.js and npm installed
- curl or Postman for API testing

## Setup (One-time)

```bash
cd /Users/administrator/Documents/BoomCard/backend-api

# Use test environment config
cp .env.test .env

# Install/update dependencies
npm install

# Apply all migrations to test database
npx prisma migrate deploy

# Start backend on port 3025
npm run dev
```

The backend should now be running at `http://localhost:3025`

## Verification Steps

### Step 1: Create Test Data

```bash
# Connect to test database
psql -h localhost -U boomtest -d boomcard_test

# Create a test partner (use CURRENT_TIMESTAMP)
INSERT INTO "Partner" (id, name, email, status, "verifiedAt", "createdAt", "updatedAt") 
VALUES ('test-partner-001', 'Test Partner', 'test@example.com', 'ACTIVE', now(), now(), now());

# Create a test venue for that partner
INSERT INTO "Venue" (id, "partnerId", name, address, city, country, "createdAt", "updatedAt")
VALUES ('test-venue-001', 'test-partner-001', 'Test Venue', '123 Main St', 'Sofia', 'Bulgaria', now(), now());

# Create multiple test stickers (ACTIVE state)
INSERT INTO "Sticker" (id, code, "venueId", status, "createdAt", "updatedAt")
VALUES 
  ('sticker-001', 'CODE001', 'test-venue-001', 'ACTIVE', now(), now()),
  ('sticker-002', 'CODE002', 'test-venue-001', 'ACTIVE', now(), now()),
  ('sticker-003', 'CODE003', 'test-venue-001', 'ACTIVE', now(), now());

# Verify stickers are ACTIVE
SELECT id, code, status FROM "Sticker" WHERE "venueId" = 'test-venue-001';
# Expected: 3 rows, all with status='ACTIVE'
```

### Step 2: Test Case 1 — Deactivation (Partner → INACTIVE)

```bash
# Change partner status to INACTIVE via API
curl -X PATCH http://localhost:3025/api/partner/test-partner-001/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{ "status": "INACTIVE", "reason": "Test deactivation" }'

# Expected response: 200 OK

# Verify ALL stickers are now INACTIVE in database
psql -h localhost -U boomtest -d boomcard_test -c \
  "SELECT id, code, status FROM \"Sticker\" WHERE \"venueId\" = 'test-venue-001';"

# Expected: 3 rows, ALL with status='INACTIVE' (or 'DEACTIVATED' depending on enum)
# ⚠️  ASSERTION: If ANY sticker is still ACTIVE, the deactivation failed!
```

### Step 3: Test Case 2 — Reactivation (Partner → ACTIVE)

```bash
# Change partner status back to ACTIVE
curl -X PATCH http://localhost:3025/api/partner/test-partner-001/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{ "status": "ACTIVE", "reason": "Test reactivation" }'

# Expected response: 200 OK

# Verify ALL stickers are now ACTIVE again
psql -h localhost -U boomtest -d boomcard_test -c \
  "SELECT id, code, status FROM \"Sticker\" WHERE \"venueId\" = 'test-venue-001';"

# Expected: 3 rows, ALL with status='ACTIVE'
# ⚠️  ASSERTION: If ANY sticker is still INACTIVE, the reactivation failed!
```

### Step 4: Test Case 3 — Manual Deactivation Preserved

```bash
# Manually deactivate one sticker (simulating manual admin action)
psql -h localhost -U boomtest -d boomcard_test -c \
  "UPDATE \"Sticker\" SET status='INACTIVE', \"autoDeactivatedAt\"=NULL WHERE id='sticker-001';"

# Verify it's manually deactivated (autoDeactivatedAt is NULL)
psql -h localhost -U boomtest -d boomcard_test -c \
  "SELECT id, status, \"autoDeactivatedAt\" FROM \"Sticker\" WHERE id='sticker-001';"
# Expected: status='INACTIVE', autoDeactivatedAt=NULL

# Now change partner to INACTIVE
curl -X PATCH http://localhost:3025/api/partner/test-partner-001/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{ "status": "INACTIVE", "reason": "Test with manual deactivation" }'

# Change partner back to ACTIVE
curl -X PATCH http://localhost:3025/api/partner/test-partner-001/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{ "status": "ACTIVE", "reason": "Reactivate after manual deactivation" }'

# Verify the manually-deactivated sticker stayed INACTIVE
psql -h localhost -U boomtest -d boomcard_test -c \
  "SELECT id, code, status, \"autoDeactivatedAt\" FROM \"Sticker\" WHERE \"venueId\" = 'test-venue-001' ORDER BY id;"

# Expected: 
#   sticker-001: status='INACTIVE', autoDeactivatedAt=NULL (stayed manual)
#   sticker-002: status='ACTIVE', autoDeactivatedAt=NULL (auto-reactivated)
#   sticker-003: status='ACTIVE', autoDeactivatedAt=NULL (auto-reactivated)
# ⚠️  ASSERTION: sticker-001 MUST remain INACTIVE; others MUST be ACTIVE
```

### Step 5: Test Case 4 — Scan-Time Gate Enforcement

```bash
# Set partner to INACTIVE
curl -X PATCH http://localhost:3025/api/partner/test-partner-001/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{ "status": "INACTIVE", "reason": "Test scan gate" }'

# Try to scan a sticker from this inactive partner
curl -X POST http://localhost:3025/api/sticker/CODE001/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -d '{ "transactionId": "txn-123" }'

# Expected response: 403 Forbidden or 402 Payment Required (not 200 OK)
# ⚠️  ASSERTION: Scan MUST be blocked even if sticker.status is ACTIVE
```

### Step 6: Test Case 5 — Reconciliation Cron (Optional)

The background reconciliation cron runs at 4 AM Sofia time daily. To simulate it:

```bash
# Manually set partner to INACTIVE status in DB
psql -h localhost -U boomtest -d boomcard_test -c \
  "UPDATE \"Partner\" SET status='INACTIVE' WHERE id='test-partner-001';"

# Manually set some stickers to ACTIVE (simulating sync failure)
psql -h localhost -U boomtest -d boomcard_test -c \
  "UPDATE \"Sticker\" SET status='ACTIVE', \"autoDeactivatedAt\"=now() WHERE \"venueId\"='test-venue-001';"

# Wait up to 10 seconds or manually trigger reconciliation job if available
# Then verify stickers were deactivated by cron
psql -h localhost -U boomtest -d boomcard_test -c \
  "SELECT id, code, status FROM \"Sticker\" WHERE \"venueId\" = 'test-venue-001';"

# Expected: All stickers status='INACTIVE' (fixed by reconciliation cron)
# ⚠️  ASSERTION: Cron must catch and fix drift
```

## Assertion Summary

| Test Case | Assertion | Status |
|-----------|-----------|--------|
| 1. Deactivation | Partner → INACTIVE leaves **all** stickers INACTIVE | ✅ Manual verification required |
| 2. Reactivation | Partner → ACTIVE reactivates **all auto-deactivated** stickers | ✅ Manual verification required |
| 3. Manual Override | Manually-deactivated stickers are **never** auto-reactivated | ✅ Manual verification required |
| 4. Scan-Time Gate | Scan blocked on INACTIVE partner **regardless** of sticker status | ✅ Manual verification required |
| 5. Reconciliation | Cron catches drift on stale ACTIVE stickers | ✅ Manual verification required |

## Troubleshooting

**Issue:** Cannot connect to database  
**Solution:** Verify PostgreSQL is running: `psql -h localhost -U postgres -c "SELECT 1"`

**Issue:** Database `boomcard_test` doesn't exist  
**Solution:** Create it:
```bash
psql -h localhost -U postgres -c "CREATE DATABASE boomcard_test OWNER boomtest;"
```

**Issue:** Migrations fail  
**Solution:** Check migration logs:
```bash
npx prisma migrate status
npx prisma migrate reset  # ⚠️  WARNING: Deletes all test data
```

**Issue:** Backend won't start  
**Solution:** Check .env is correctly set to .env.test values and port 3025 is free:
```bash
lsof -i :3025  # If something is running, kill it
```

## Notes

- All test data should be cleaned up after verification by resetting the test database or deleting the test records.
- The JWT token (`YOUR_JWT_TOKEN`) should be for an admin user with partner-status-change permissions.
- The `YOUR_USER_JWT_TOKEN` for the scan endpoint should be for a regular user (partner/customer).

## Completion

Once all 5 test cases pass their assertions, the runtime verification is complete. Report the results to mark the task as fully verified.
