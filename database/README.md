# Database Scripts for BoomCard

## Quick Start

To populate your database with sample offers so the homepage displays data, run:

```bash
psql -U your_username -d boomcard < seed-sample-offers.sql
```

Or if using a connection string:

```bash
psql postgresql://user:password@localhost:5432/boomcard < seed-sample-offers.sql
```

## What This Script Does

The `seed-sample-offers.sql` script will create:

- **6 Sample Partners** (hotels, restaurants, spa, wineries, etc.)
- **14 Sample Offers** (6 featured + 8 additional)
- All with proper Bulgarian and English translations
- High-quality images from Unsplash
- Realistic ratings and review counts

## Featured Offers Created

The script creates 6 **featured offers** with high discounts that will appear on the homepage:

1. **Luxury Hotel Suite** - 50% discount (Sofia)
2. **Full Day Spa Package** - 45% discount (Bansko)
3. **Wine Tasting Experience** - 40% discount (Melnik)
4. **Gourmet Dinner for Two** - 35% discount (Sofia)
5. **Paragliding Adventure** - 30% discount (Rila)
6. **Romantic Beachfront Suite** - 35% discount (Varna)

## After Running the Script

1. Start your API server:
   ```bash
   npm run dev
   ```

2. Start the frontend:
   ```bash
   cd partner-dashboard
   npm run dev
   ```

3. Open http://localhost:5173

4. The homepage "Top Offers" section should now display the 6 featured offers!

## Verification

After running the script, verify the data:

```sql
-- Check partners
SELECT COUNT(*) FROM partners;

-- Check offers
SELECT COUNT(*) FROM offers;

-- Check featured offers (should be 6)
SELECT COUNT(*) FROM offers WHERE is_featured = true;

-- View top offers
SELECT title, discount, city FROM offers ORDER BY discount DESC;
```

## Troubleshooting

### Error: "relation 'partners' does not exist"
**Solution:** You need to run the database migrations first to create the tables.

```bash
npm run migrate
```

### Error: "duplicate key value violates unique constraint"
**Solution:** The data already exists. To re-run the script, first delete existing data:

```sql
DELETE FROM offers;
DELETE FROM partners;
```

Then run the seed script again.

### Empty Homepage - No Offers Showing
**Solution:** Check that:
1. The API server is running on the correct port
2. The frontend `VITE_API_BASE_URL` is correct
3. The database has data (run verification queries above)
4. Check browser console for API errors

## Database Schema

If you need to create the tables first, see `DATABASE_SETUP_GUIDE.md` in the project root for the complete schema.

## Support

For more detailed setup instructions, see:
- `DATABASE_SETUP_GUIDE.md` - Complete database setup
- `MOCK_TO_REAL_API_COMPLETE.md` - Integration documentation
