# Where is the Database?

## Answer

The database is a **SQLite file** located at:

```
/Users/administrator/Documents/BoomCard/backend-api/prisma/dev.db
```

## How to Populate It

```bash
cd backend-api
npm run db:seed
```

This creates:
- 6 partners
- 8 offers (6 featured for homepage)
- All with test data

## Visual Editor

Want to see the database visually?

```bash
cd backend-api
npm run db:studio
```

Opens at http://localhost:5555

## Quick Commands

```bash
# Seed database
cd backend-api && npm run db:seed

# Reset and re-seed (deletes all data)
cd backend-api && npm run db:reset

# View database
cd backend-api && npm run db:studio

# Start API server
cd backend-api && npm run dev

# Start frontend
cd partner-dashboard && npm run dev
```

## Fix "No Offers Available"

Run these commands:

```bash
# Terminal 1: Seed and start API
cd /Users/administrator/Documents/BoomCard/backend-api
npm run db:seed
npm run dev

# Terminal 2: Start frontend
cd /Users/administrator/Documents/BoomCard/partner-dashboard
npm run dev
```

Then open http://localhost:5173 - homepage will show 6 offers!

## More Details

See `backend-api/DATABASE_README.md` for complete documentation.
