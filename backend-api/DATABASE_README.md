# Database Setup for BoomCard Backend

## Current Setup

- **Database:** SQLite (development)
- **ORM:** Prisma
- **Location:** `/backend-api/prisma/dev.db`

## Quick Start - Fix "No Offers Available"

If your homepage shows "No offers available", run this:

```bash
cd backend-api
npm run db:seed
```

That's it! The homepage will now show 6 featured offers.

---

## Database Commands

### Seed Database with Sample Data
```bash
npm run db:seed
```

Creates:
- 6 sample users (partners)
- 6 sample partners (hotels, restaurants, spa, etc.)
- 8 sample offers (6 featured for homepage)

### Reset Database (Delete all data and re-seed)
```bash
npm run db:reset
```

⚠️ **Warning:** This deletes all existing data!

### Open Prisma Studio (Visual Database Editor)
```bash
npm run db:studio
```

Opens at http://localhost:5555 - You can view and edit all database records visually.

### Generate Prisma Client
```bash
npm run db:generate
```

Run this after changing `schema.prisma`.

### Create Migration
```bash
npm run db:migrate
```

Run this after changing the database schema.

---

## What Gets Created

### Users (6)
- grandhotel@boomcard.bg
- winedine@boomcard.bg
- sparetreat@boomcard.bg
- skyadventures@boomcard.bg
- beachfront@boomcard.bg
- villamelnik@boomcard.bg

All with password hash (not real passwords - dev only).

### Partners (6)
1. **Grand Hotel Sofia** (Premium) - Hotels - Sofia
2. **Wine & Dine Restaurant** (Premium) - Restaurants - Sofia
3. **Spa Retreat Bansko** (Standard) - Spa - Bansko
4. **Sky Adventures** (Standard) - Experiences - Rila
5. **Beachfront Hotel Varna** (Premium) - Hotels - Varna
6. **Villa Melnik Winery** (Premium) - Wineries - Melnik

### Offers (8)

**Featured Offers** (shown on homepage `/api/offers/top`):
1. Luxury Suite with Breakfast - 50% off
2. Full Day Spa Package - 45% off
3. Premium Wine Tasting - 40% off
4. Gourmet Dinner for Two - 35% off
5. Paragliding Adventure - 30% off
6. Romantic Beachfront Suite - 35% off

**Additional Offers**:
7. Weekend Getaway Package - 25% off
8. Business Lunch Special - 20% off

---

## Verify Database

### Check if database has data:

**Option 1: Use Prisma Studio**
```bash
npm run db:studio
```

**Option 2: Use SQLite CLI**
```bash
cd backend-api/prisma
sqlite3 dev.db

-- Check counts
SELECT COUNT(*) FROM User;
SELECT COUNT(*) FROM Partner;
SELECT COUNT(*) FROM Offer;

-- View offers
SELECT title, discountPercent, status FROM Offer;

.quit
```

**Option 3: Check via API**
```bash
# Start the server
npm run dev

# In another terminal, check the API
curl http://localhost:3000/api/offers
```

---

## API Endpoints

After seeding, these endpoints will work:

```bash
# Get all offers
GET http://localhost:3000/api/offers

# Get top offers (for homepage)
GET http://localhost:3000/api/offers/top?limit=6

# Get single offer
GET http://localhost:3000/api/offers/:id

# Get partners
GET http://localhost:3000/api/partners
```

---

## Troubleshooting

### "Cannot find module 'ts-node'"
```bash
npm install --save-dev ts-node
```

### "Cannot find module '@prisma/client'"
```bash
npm run db:generate
```

### "Table 'Offer' does not exist"
```bash
npm run db:migrate
```

### Seed script fails with errors
Delete the database and start fresh:
```bash
rm prisma/dev.db
rm prisma/dev.db-journal
npm run db:migrate
npm run db:seed
```

### Frontend still shows "No offers available"

1. **Check API is running:**
   ```bash
   curl http://localhost:3000/api/offers/top?limit=6
   ```

2. **Check frontend .env.local:**
   ```env
   VITE_API_BASE_URL=http://localhost:3000/api
   ```

3. **Check database has data:**
   ```bash
   npm run db:studio
   ```

---

## Production Setup

For production, switch to PostgreSQL:

1. **Update `.env`:**
   ```env
   DATABASE_URL=postgresql://user:password@host:5432/boomcard
   ```

2. **Update `prisma/schema.prisma`:**
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. **Migrate:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

---

## File Structure

```
backend-api/
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── seed.ts             # Seed script (⭐ NEW)
│   ├── dev.db              # SQLite database
│   └── migrations/         # Migration files
├── src/
│   └── ...                 # API code
├── .env                    # Environment variables
└── package.json            # Scripts added (⭐ UPDATED)
```

---

## Summary

✅ Database is at `backend-api/prisma/dev.db`
✅ Seed script is at `backend-api/prisma/seed.ts`
✅ Run `npm run db:seed` to populate data
✅ Run `npm run dev` to start API server
✅ Frontend will automatically fetch data from API

**Quick fix for "No offers available":**
```bash
cd /Users/administrator/Documents/BoomCard/backend-api
npm run db:seed
npm run dev
```

Then refresh the homepage! 🎉
