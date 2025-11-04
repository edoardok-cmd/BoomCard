# PostgreSQL Migration Guide

## Overview

This guide covers migrating your BoomCard application from SQLite (development) to PostgreSQL (production). The migration is necessary for production deployment as PostgreSQL provides better performance, scalability, and concurrent access handling.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ installed (locally or hosted)
- Existing SQLite database with data
- Backup of your current SQLite database

## Migration Steps

### Step 1: Set Up PostgreSQL Database

#### Option A: Local PostgreSQL

1. **Install PostgreSQL** (if not already installed):

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Windows
# Download installer from: https://www.postgresql.org/download/windows/
```

2. **Create Database**:

```bash
# Connect to PostgreSQL
psql postgres

# Create database
CREATE DATABASE boomcard_production;

# Create user (optional, for security)
CREATE USER boomcard_user WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE boomcard_production TO boomcard_user;

# Exit psql
\q
```

#### Option B: Cloud PostgreSQL (Recommended for Production)

Choose one of these providers:

- **AWS RDS**: https://aws.amazon.com/rds/postgresql/
- **Google Cloud SQL**: https://cloud.google.com/sql/postgresql
- **Heroku Postgres**: https://www.heroku.com/postgres
- **Railway**: https://railway.app/
- **Render**: https://render.com/docs/databases
- **Supabase**: https://supabase.com/database

After creating your database, you'll receive a connection URL like:
```
postgresql://user:password@host:5432/database?sslmode=require
```

### Step 2: Backup SQLite Database

Before starting the migration, create a backup:

```bash
cd backend-api
cp prisma/dev.db prisma/dev.db.backup
```

### Step 3: Export Data from SQLite

Run the export script to extract all data from SQLite:

```bash
cd backend-api
npm run migrate:export
```

This will create a file at `backend-api/migrations/sqlite-export.json` containing all your data.

**Output Example:**
```
📊 Starting SQLite data export...

Exporting users...
✓ Exported 15 users
Exporting refresh tokens...
✓ Exported 8 refresh tokens
...
✅ Data export complete!

📁 File: /path/to/migrations/sqlite-export.json
📊 Size: 2.45 MB
```

### Step 4: Update Prisma Schema

Replace your current schema with the PostgreSQL version:

```bash
cd backend-api/prisma
cp schema.prisma schema.sqlite.prisma.backup
cp schema.postgresql.prisma schema.prisma
```

### Step 5: Configure Environment Variables

Create a production environment file:

```bash
cd backend-api
cp .env .env.production
```

Update `.env.production` with your PostgreSQL connection string:

```env
# PostgreSQL Production Database
DATABASE_URL="postgresql://user:password@host:5432/boomcard_production?sslmode=require"

# Example for local PostgreSQL:
# DATABASE_URL="postgresql://boomcard_user:your-secure-password@localhost:5432/boomcard_production"

# Example for Railway:
# DATABASE_URL="postgresql://postgres:password@containers-us-west-123.railway.app:5432/railway"

# Example for Supabase:
# DATABASE_URL="postgresql://postgres:password@db.xxxxxxxxxxxxx.supabase.co:5432/postgres"

# JWT Secrets (CHANGE THESE!)
JWT_SECRET="generate-a-secure-random-string-here-min-32-chars"
REFRESH_TOKEN_SECRET="generate-another-secure-random-string-min-32-chars"

# CORS
CORS_ORIGIN="https://yourdomain.com"

# Node Environment
NODE_ENV="production"

# Port
PORT=3001
```

**Generate Secure JWT Secrets:**

```bash
# Option 1: Using OpenSSL
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Step 6: Create PostgreSQL Schema

Run Prisma migration to create all tables in PostgreSQL:

```bash
# Set environment to production
export DATABASE_URL="postgresql://user:password@host:5432/boomcard_production"

# Generate Prisma client for PostgreSQL
npx prisma generate

# Create initial migration
npx prisma migrate dev --name init_postgresql

# Or for production (no dev dependencies):
npx prisma migrate deploy
```

**Expected Output:**
```
Environment variables loaded from .env.production
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "boomcard_production" at "host:5432"

Applying migration `20231204120000_init_postgresql`

The following migration(s) have been applied:

migrations/
  └─ 20231204120000_init_postgresql/
    └─ migration.sql

Your database is now in sync with your schema.
```

### Step 7: Import Data to PostgreSQL

Now import your exported data:

```bash
# Make sure DATABASE_URL points to PostgreSQL
npm run migrate:import
```

**Expected Output:**
```
🚀 PostgreSQL Data Import Tool
══════════════════════════════════════════════════
This script will import data from SQLite export to PostgreSQL

📂 Loading data from /path/to/migrations/sqlite-export.json...
✅ Data loaded successfully!

📊 Starting PostgreSQL data import...

Importing users...
✓ Imported 15 users
Importing refresh tokens...
✓ Imported 8 refresh tokens
Importing partners...
✓ Imported 3 partners
...
✅ Data import complete!

✅ Migration complete! Your PostgreSQL database is ready.
```

### Step 8: Verify Migration

1. **Check Data Integrity**:

```bash
npx prisma studio
```

Open Prisma Studio and verify:
- User count matches SQLite
- Receipts are present with correct data
- Relationships are intact (users → receipts, etc.)

2. **Test Backend Connection**:

```bash
# Start backend with PostgreSQL
npm run dev
```

Test key endpoints:
```bash
# Health check
curl http://localhost:3001/health

# Login (use existing credentials)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@boomcard.bg","password":"demo123"}'

# Get receipts (use token from login)
curl http://localhost:3001/api/receipts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

3. **Test Frontend**:

```bash
cd partner-dashboard
npm run dev
```

Navigate to http://localhost:5175 and verify:
- Login works
- Receipts page shows data
- Analytics page displays correctly
- All features function normally

## Rollback Procedure

If you encounter issues, you can rollback to SQLite:

### Step 1: Restore SQLite Backup

```bash
cd backend-api/prisma
cp dev.db.backup dev.db
```

### Step 2: Restore SQLite Schema

```bash
cp schema.sqlite.prisma.backup schema.prisma
```

### Step 3: Update Environment

```bash
# Restore .env
cp .env.backup .env
```

### Step 4: Regenerate Prisma Client

```bash
npx prisma generate
```

### Step 5: Restart Backend

```bash
npm run dev
```

## Production Deployment Checklist

After successful migration to PostgreSQL:

- [ ] Backup PostgreSQL database using cloud provider tools
- [ ] Set up automated backups (daily recommended)
- [ ] Configure connection pooling (using Prisma's `connection_limit`)
- [ ] Enable SSL/TLS for database connections (`sslmode=require`)
- [ ] Set up monitoring (e.g., AWS CloudWatch, Datadog)
- [ ] Configure read replicas for high availability (if needed)
- [ ] Set up database performance monitoring
- [ ] Document connection strings in secure location (e.g., 1Password, AWS Secrets Manager)
- [ ] Update CI/CD pipelines with new DATABASE_URL
- [ ] Test database failover procedures
- [ ] Set up alerts for database connection failures

## Performance Optimization

### Connection Pooling

Update your Prisma configuration for production:

```typescript
// backend-api/src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

Update DATABASE_URL with connection pool settings:

```env
DATABASE_URL="postgresql://user:password@host:5432/boomcard_production?sslmode=require&connection_limit=10&pool_timeout=20"
```

### Indexes

Your schema already includes important indexes. Verify they're created:

```sql
-- Connect to PostgreSQL
psql $DATABASE_URL

-- List all indexes
\di

-- Important indexes to verify:
-- User: email, role, status
-- Receipt: userId, status, merchantName, createdAt
-- Transaction: userId, status, createdAt
-- Partner: category, tier, status, city
```

### Query Performance

Monitor slow queries:

```sql
-- Enable slow query logging
ALTER DATABASE boomcard_production SET log_min_duration_statement = 1000;

-- View slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

## Common Issues & Solutions

### Issue 1: Connection Timeout

**Error:**
```
Error: P1001: Can't reach database server at `host:5432`
```

**Solutions:**
- Check firewall rules allow connections on port 5432
- Verify SSL mode matches your provider's requirements
- Check if IP whitelist includes your server's IP
- Test connection with `psql` command line tool

### Issue 2: SSL Required

**Error:**
```
Error: no pg_hba.conf entry for host
```

**Solution:**
Add `?sslmode=require` to your DATABASE_URL:
```env
DATABASE_URL="postgresql://user:password@host:5432/db?sslmode=require"
```

### Issue 3: Migration Fails on Enum Values

**Error:**
```
ERROR: invalid input value for enum
```

**Solution:**
This usually means data in SQLite has values not matching the Prisma enum. Check your data:

```bash
# Find invalid enum values
npx prisma studio

# Or query directly
sqlite3 prisma/dev.db "SELECT DISTINCT status FROM Receipt;"
```

### Issue 4: Connection Pool Exhausted

**Error:**
```
Error: Can't reach database server - connection pool exhausted
```

**Solution:**
Increase connection pool limit in DATABASE_URL:
```env
DATABASE_URL="...?connection_limit=20&pool_timeout=30"
```

## Migration Scripts Reference

### Export Script (`migrate:export`)

**File:** `scripts/migrate-sqlite-to-postgres.ts`

**What it does:**
- Connects to SQLite database
- Exports all tables to JSON
- Includes all relationships
- Creates `migrations/sqlite-export.json`

**Usage:**
```bash
npm run migrate:export
```

### Import Script (`migrate:import`)

**File:** `scripts/import-postgres-data.ts`

**What it does:**
- Reads `migrations/sqlite-export.json`
- Connects to PostgreSQL
- Imports data in dependency order
- Preserves all relationships

**Usage:**
```bash
npm run migrate:import
```

### Full Migration (`migrate:full`)

**What it does:**
- Runs export
- Runs import
- Complete migration in one command

**Usage:**
```bash
npm run migrate:full
```

## Schema Files

- **schema.prisma** - Current active schema (SQLite for dev)
- **schema.postgresql.prisma** - PostgreSQL production schema
- **schema.sqlite.prisma.backup** - Backup of SQLite schema

## Database URL Examples

### Local Development (SQLite)
```env
DATABASE_URL="file:/absolute/path/to/backend-api/prisma/dev.db"
```

### Local PostgreSQL
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/boomcard_dev"
```

### Railway
```env
DATABASE_URL="postgresql://postgres:password@containers-us-west-123.railway.app:5432/railway"
```

### Heroku Postgres
```env
DATABASE_URL="postgres://user:password@ec2-123-456-789.compute-1.amazonaws.com:5432/database"
```

### Supabase
```env
DATABASE_URL="postgresql://postgres:password@db.xxxxxxxxxxxxx.supabase.co:6543/postgres?pgbouncer=true"
```

### AWS RDS
```env
DATABASE_URL="postgresql://admin:password@boomcard-db.xxxxx.us-east-1.rds.amazonaws.com:5432/boomcard_production"
```

## Support

If you encounter issues during migration:

1. Check the error logs in `backend-api/logs/`
2. Verify DATABASE_URL format matches your provider
3. Test database connection with `psql` CLI tool
4. Review Prisma documentation: https://www.prisma.io/docs/
5. Check cloud provider documentation for connection details

## Next Steps

After successful migration:

1. ✅ PostgreSQL database is live
2. ✅ Data migrated successfully
3. ⏭️ Set up production deployment (see deployment guide)
4. ⏭️ Configure monitoring and alerts
5. ⏭️ Set up automated backups
6. ⏭️ Performance tune database queries
7. ⏭️ Load test with production-like data
8. ⏭️ Implement caching layer (Redis)

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0
**Tested With:** PostgreSQL 14, Prisma 6.17.1
