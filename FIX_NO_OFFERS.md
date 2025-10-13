# Fix "No Offers Available" on Homepage

## Problem

The BoomCard homepage shows:
> **"No offers available at the moment"**
>
> "Offers will be loaded from the API server. Please make sure there are offers created in the database."

## Why This Happens

The Partner Dashboard is now **100% API-driven** (no more mock data). The homepage "Top Offers" section fetches real data from:

```
GET /api/offers/top?limit=6
```

If the database is empty, the API returns an empty array `[]`, and the homepage shows the "no offers" message.

## Solution: Seed the Database

You need to populate your PostgreSQL database with sample offers.

### Quick Fix (3 Steps)

1. **Navigate to database folder:**
   ```bash
   cd database
   ```

2. **Set your database URL:**
   ```bash
   export DATABASE_URL=postgresql://user:password@localhost:5432/boomcard
   ```

3. **Run the seed script:**
   ```bash
   ./seed.sh
   ```

That's it! Refresh the homepage and you'll see 6 beautiful featured offers.

---

## Alternative Methods

### Method 1: Direct SQL File

```bash
cd database
psql postgresql://user:password@localhost:5432/boomcard < seed-sample-offers.sql
```

### Method 2: Using psql Interactive

```bash
psql -U your_username -d boomcard
\i database/seed-sample-offers.sql
\q
```

### Method 3: Database GUI (pgAdmin, DBeaver, etc.)

1. Open your database client
2. Connect to `boomcard` database
3. Open `database/seed-sample-offers.sql`
4. Execute the entire script
5. Verify: `SELECT COUNT(*) FROM offers;` (should show 14)

---

## What Gets Created

The seed script creates:

### 6 Partners
- Grand Hotel Sofia (Premium)
- Wine & Dine Restaurant (Premium)
- Spa Retreat Bansko
- Sky Adventures
- Beachfront Hotel Varna (Premium)
- Villa Melnik Winery (Premium)

### 14 Offers (6 Featured for Homepage)

**Featured Offers** (shown on homepage):
1. **Luxury Suite with Breakfast** - 50% off (Sofia)
2. **Full Day Spa Package** - 45% off (Bansko)
3. **Premium Wine Tasting** - 40% off (Melnik)
4. **Gourmet Dinner for Two** - 35% off (Sofia)
5. **Paragliding Adventure** - 30% off (Rila)
6. **Romantic Beachfront Suite** - 35% off (Varna)

**Additional Offers**:
- Cultural Tour of Sofia
- Mountain Hiking Package
- Family Fun Day Package
- Romantic Dinner Cruise
- Street Food Tour
- Museum Pass (5 Museums)
- White Water Rafting
- Premium Coffee Tasting

All offers include:
- ✅ English & Bulgarian translations
- ✅ High-quality Unsplash images
- ✅ Realistic ratings and reviews
- ✅ Proper categories and locations
- ✅ Featured flag for homepage

---

## Verification

After running the seed script, verify it worked:

```sql
-- Check partners (should be 6)
SELECT COUNT(*) FROM partners;

-- Check offers (should be 14)
SELECT COUNT(*) FROM offers;

-- Check featured offers (should be 6)
SELECT COUNT(*) FROM offers WHERE is_featured = true;

-- View the top offers
SELECT
  title,
  discount,
  city,
  is_featured
FROM offers
WHERE is_featured = true
ORDER BY discount DESC;
```

---

## Test the Frontend

1. **Make sure API server is running:**
   ```bash
   npm run dev
   ```

   Should output:
   ```
   Server running on http://localhost:3000
   ```

2. **Test the API endpoint:**
   ```bash
   curl http://localhost:3000/api/offers/top?limit=6
   ```

   Should return JSON with 6 offers.

3. **Start the frontend:**
   ```bash
   cd partner-dashboard
   npm run dev
   ```

   Should output:
   ```
   Local: http://localhost:5173
   ```

4. **Open in browser:**
   ```
   http://localhost:5173
   ```

5. **Check homepage:**
   - Should see "Top Offers" section
   - Should see 6 offers in carousel
   - Should NOT see "No offers available"

---

## Troubleshooting

### "bash: ./seed.sh: Permission denied"
```bash
chmod +x database/seed.sh
```

### "psql: command not found"
Install PostgreSQL client:
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# Windows
Download from https://www.postgresql.org/download/windows/
```

### "relation 'partners' does not exist"
You need to create the database tables first:
```bash
npm run migrate
```

### "duplicate key value violates unique constraint"
Data already exists! You can either:
1. Skip (data is already there)
2. Or delete and re-seed:
```sql
DELETE FROM offers;
DELETE FROM partners;
```
Then run seed script again.

### Homepage still shows "No offers available"

**Check 1: Is API server running?**
```bash
curl http://localhost:3000/api/offers/top?limit=6
```

**Check 2: Are offers in database?**
```sql
SELECT COUNT(*) FROM offers WHERE is_featured = true;
```

**Check 3: Is frontend configured correctly?**
Check `partner-dashboard/.env.local`:
```env
VITE_API_BASE_URL=http://localhost:3000/api
```

**Check 4: Browser console errors?**
- Open DevTools (F12)
- Check Console tab for errors
- Check Network tab for failed requests

### API returns empty array `[]`
The database is still empty. Run the seed script again.

### API returns 401 Unauthorized
Some endpoints require authentication. The `/offers/top` endpoint should be public. Check your API authentication middleware.

---

## Production Deployment

For production, you'll want to:

1. **Create real partners and offers** instead of sample data
2. **Use environment-specific connection strings**
3. **Back up database** before seeding
4. **Consider using a migration tool** like Prisma or TypeORM

Example production seed:
```bash
# Production database
DATABASE_URL=postgresql://prod_user:prod_pass@prod-db.company.com:5432/boomcard_prod

# Run with caution!
psql $DATABASE_URL < seed-sample-offers.sql
```

---

## Summary

✅ **Frontend is 100% ready** - All pages use real API data
✅ **API endpoints are working** - Just need database data
✅ **Seed script provided** - Easy one-command solution

**Run this now:**
```bash
cd database
export DATABASE_URL=postgresql://user:password@localhost:5432/boomcard
./seed.sh
```

**Then refresh your homepage.** Problem solved! 🎉

---

## Files Reference

- **database/seed-sample-offers.sql** - SQL script with all INSERT statements
- **database/seed.sh** - Shell script wrapper for easy execution
- **database/README.md** - Detailed database setup instructions
- **DATABASE_SETUP_GUIDE.md** - Complete schema and setup guide
- **MOCK_TO_REAL_API_COMPLETE.md** - Full integration documentation

---

**Questions?** Check the database/README.md or DATABASE_SETUP_GUIDE.md for more details.
