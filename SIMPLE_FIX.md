# Simple Fix: Homepage Shows "No Offers Available"

## The Problem

Your homepage shows:
> "No offers available at the moment"

## Why?

The database is **empty**. The project uses SQLite database at:
```
backend-api/prisma/dev.db
```

## The Solution (2 Commands)

Open your terminal and run:

```bash
cd backend-api
npm run db:seed
```

**That's it!** ✅

## What This Does

Creates sample data in your SQLite database:
- **1 admin user** (SUPER_ADMIN access)
- 6 partners (hotels, restaurants, spa, etc.)
- 8 offers with 30-50% discounts
- All properly configured for testing

**🔐 Admin Credentials Created:**
- Email: `admin@boomcard.bg`
- Password: `admin123`
- Role: SUPER_ADMIN

## Start Everything

```bash
# Terminal 1: Start API server
cd backend-api
npm run dev

# Terminal 2: Start frontend
cd partner-dashboard
npm run dev
```

Visit http://localhost:5173 - **Homepage will now show 6 beautiful offers!** 🎉

## View Your Database

Want to see what's in the database?

```bash
cd backend-api
npm run db:studio
```

Opens a visual database editor at http://localhost:5555

## If You Have Issues

See these files for help:
- `backend-api/DATABASE_README.md` - Complete database guide
- `DATABASE_LOCATION.md` - Where is the database?
- `FIX_NO_OFFERS.md` - Detailed troubleshooting

## Summary

✅ **Database:** `backend-api/prisma/dev.db` (SQLite)
✅ **Seed command:** `npm run db:seed`
✅ **Location:** Run from `backend-api` folder
✅ **Result:** 6 featured offers on homepage

**One command to rule them all:**
```bash
cd /Users/administrator/Documents/BoomCard/backend-api && npm run db:seed && npm run dev
```
