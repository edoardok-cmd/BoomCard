# Supabase Setup Guide for BoomCard

Since you're already logged into Supabase, follow these steps:

## 1. Create a New Project

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New project"**
3. Fill in the following details:
   - **Project name**: `boomcard-production` (or similar)
   - **Database Password**: Generate a strong password and **save it securely**
   - **Region**: Choose the closest to your users
   - **Pricing Plan**: Free tier is fine to start

## 2. Wait for Project Setup
- This usually takes 1-2 minutes
- You'll see a loading screen while Supabase provisions your database

## 3. Run the Migration Script

Once your project is ready:

1. Click on **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Copy and paste the entire contents of our migration script (see below)
4. Click **"Run"** to execute the migration

## 4. Get Your Connection Details

After running the migration:

1. Go to **Settings** → **Database**
2. Copy the following (you'll need these for Render):
   - **Connection string** (URI format)
   - **Direct connection string** (for migrations)
   - **Connection pooling string** (for applications)

## 5. Enable Row Level Security (RLS)

For security, enable RLS on all tables:

1. Go to **Table Editor**
2. For each table, click the three dots menu → **Enable RLS**
3. We'll add policies later based on your needs

## Migration Script Location
The full migration script is at: `/database/supabase-migration.sql`

## Important Connection Strings You'll Need:

### For Backend Services (Render):
Use the **Connection pooling** string with `?pgbouncer=true` appended

Example:
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

### For Direct Database Access:
Use the **Direct connection** string

### Environment Variables to Set:
```bash
# Supabase (for all backend services)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_KEY=[your-service-key]

# Additional for specific services
POSTGRES_PRISMA_URL=[direct-connection-string]
POSTGRES_URL_NON_POOLING=[direct-connection-string]
```

## Next Steps After Database Setup:

1. **Update Prisma Schema** (if needed):
   ```bash
   cd api-gateway
   npx prisma db pull
   npx prisma generate
   ```

2. **Test Connection**:
   ```bash
   cd api-gateway
   npm install
   npm run dev
   ```

3. **Deploy Backend Services** to Render with the connection strings

Would you like me to help you with any of these steps?